/**
 * مدیریت چرخه عمر نشست (Session Lifecycle) — سمت سرور
 * ------------------------------------------------------
 * ایجاد، اعتبارسنجی، تمدید (Rotation)، ابطال (Logout) و انقضای خودکار.
 * توکن صرفاً هش‌شده ذخیره می‌شود (به بخش امنیتی crypto.ts مراجعه کنید).
 * توکن‌های SAM (نامشخص) — توکن‌های سامانه واقعی ARM به‌صورت رمزنگاری‌شده
 * AES-256-GCM در نشست نگهداری می‌شوند تا فراخوانی داده‌های واقعی ممکن باشد.
 */

import { db } from "@/lib/db";
import { getMelkApiConfig } from "@/lib/melk-api/config";
import { logAuth } from "@/lib/logger";
import { defaultAccessScopeForRole } from "@/core/repositories";
import { decryptSecret, encryptSecret, generateSessionToken, hashToken } from "./crypto";
import { persistArmTokensToVault, restoreArmTokensFromVault, vaultKeyForSession } from "./arm-vault";
import type { ArmTokens, AuthUserInfo, UserRole } from "@/lib/melk-api/types";

export interface SessionContext extends AuthUserInfo {
  sessionId: string;
  expiresAt: string;
  /** توکن‌های ARM رمزگشایی‌شده (فقط اگر از مسیر OTP واقعی وارد شده باشد) */
  armTokens: ArmTokens | null;
  /** P6.5-04-i — دامنهٔ دادهٔ نشست (§۵.۱): OWNER | BRANCH | CONSULTANT (افزایشی) */
  accessScope?: string | null;
  /** P6.5-04-i — شعبهٔ نشست (برای دامنهٔ BRANCH — افزایشی) */
  branchId?: string | null;
}

/** ایجاد نشست جدید برای کاربر تأییدشده (به‌همراه توکن‌های ARM رمزنگاری‌شده) */
export async function createSession(
  user: AuthUserInfo,
  meta: { ip?: string; userAgent?: string },
  armTokens?: ArmTokens | null
): Promise<{ token: string; context: SessionContext }> {
  const cfg = getMelkApiConfig();
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + cfg.sessionTtlHours * 3600 * 1000);

  // PN-022-A/مرحلهٔ۱ (I7 — ریشهٔ ۵ رد متوالی ACCESS_DENIED مالک): آشتی نقش با
  // رجیستری کاربران. ورود OTP ARM نقش را از کدهای محیطی می‌سازد (realtor →
  // CONSULTANT)؛ اما رجیستری User (مدیریت کاربران PN-016) منبع رسمی نقش است —
  // کاربرِ ثبت‌شده با همین کد پرسنلی و نقش OWNER ⇒ نشست OWNER. مالک با پیامک
  // ARM وارد می‌شد ولی نقش CONSULTANT می‌گرفت و روی روت‌های OWNER-only رد می‌شد.
  let role = user.role;
  try {
    const registered = await db.user.findFirst({ where: { personnelCode: user.personnelCode }, select: { role: true } });
    if (registered?.role === "OWNER" && role !== "OWNER") role = "OWNER";
  } catch {
    // رجیستری در دسترس نیست — نقش حل‌شده از مسیر ورود معتبر می‌ماند
  }
  const sessionUser: AuthUserInfo = { ...user, role };

  // ---- P6.5-11 (بند ث) — اتصال ماندگار ARM: در هر ورود، بدون پیامک ----
  // ۱) ورود OTP: توکن تازه در دست است ⇒ علاوه بر نشست، در صندوقچه هم ماندگار می‌شود
  //    (نشست OWNER که با MANAGER_CODE آمده = مالک ⇒ آینه به کلید master)
  // ۲) ورود کد مستر (بدون توکن): بازیابی خودکار از صندوقچه —
  //    «با هر ورود به اپلیکیشن نیاز به تجدید اتصال نیست»
  let effectiveTokens = armTokens ?? null;
  let restoredFromVault = false;
  if (effectiveTokens) {
    const vaultKey = vaultKeyForSession(sessionUser.personnelCode, sessionUser.role);
    await persistArmTokensToVault({
      ownerKey: vaultKey,
      armTokens: effectiveTokens,
      personnelCode: sessionUser.personnelCode,
      displayName: sessionUser.displayName,
    }).catch(() => undefined);
    // مالک با کد پرسنلی MANAGER_CODE وارد شده (نقش OWNER) ⇒ آینهٔ همان توکن روی master
    if (sessionUser.role === "OWNER" && vaultKey !== "master") {
      await persistArmTokensToVault({
        ownerKey: "master",
        armTokens: effectiveTokens,
        personnelCode: sessionUser.personnelCode,
        displayName: sessionUser.displayName,
      }).catch(() => undefined);
    }
  } else {
    // Fail-safe: هر خطای صندوقچه (مثلاً جدول ناموجود) هرگز ورود را نمی‌شکند
    try {
      const restored = await restoreArmTokensFromVault(sessionUser.personnelCode, sessionUser.role);
      if (restored) {
        effectiveTokens = restored;
        restoredFromVault = true;
      }
    } catch {
      // صندوقچهٔ ماندگار در دسترس نیست — ورود بدون بازیابی ادامه می‌یابد
    }
  }

  const session = await db.session.create({
    data: {
      tokenHash: hashToken(token),
      personnelCode: sessionUser.personnelCode,
      displayName: sessionUser.displayName,
      role: sessionUser.role,
      // P6.5-02 (§۵.۱ ConsultantScope) — دامنه دسترسی داده:
      // ورود مدیر = OWNER (رفتار فعلی) · ورود OTP مشاور = CONSULTANT.
      // ستون default اسکیما نیز OWNER است ⇒ نشست‌های موجود همه OWNER ماندند.
      accessScope: defaultAccessScopeForRole(sessionUser.role),
      expiresAt,
      ip: meta.ip,
      userAgent: meta.userAgent,
      ...(effectiveTokens?.accessToken
        ? {
            armTokenEnc: encryptSecret(effectiveTokens.accessToken),
            armRefreshTokenEnc: effectiveTokens.refreshToken ? encryptSecret(effectiveTokens.refreshToken) : null,
            armUserType: effectiveTokens.userType ?? null,
          }
        : {}),
    },
  });

  // P2-05 — رویداد الزامی ورود (بدون هیچ داده حساس)
  logAuth("login", {
    userId: sessionUser.personnelCode,
    status: "ok",
    detail: { role: sessionUser.role, loginRole: user.role, armSession: Boolean(effectiveTokens?.accessToken), restoredFromVault },
  });

  return {
    token,
    context: {
      sessionId: session.id,
      personnelCode: sessionUser.personnelCode,
      displayName: sessionUser.displayName,
      role: sessionUser.role,
      expiresAt: expiresAt.toISOString(),
      armTokens: effectiveTokens ?? null,
      // P6.5-04-i — دامنهٔ داده در زمینهٔ نشست تازه (عین ستون ذخیره‌شده)
      accessScope: session.accessScope,
      branchId: session.branchId,
    },
  };
}

/** اعتبارسنجی توکن: برمی‌گرداند null اگر نامعتبر/منقضی/ابطال‌شده باشد */
export async function validateSession(token: string): Promise<SessionContext | null> {
  if (!token || token.length < 16) return null;
  const tokenHash = hashToken(token);
  const session = await db.session.findUnique({ where: { tokenHash } });
  if (!session) return null;
  if (session.revoked) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await db.session.update({ where: { id: session.id }, data: { revoked: true, revokedReason: "EXPIRED" } });
    return null;
  }
  // به‌روزرسانی آخرین دیدار (برای تشخیص نشست‌های راکد)
  await db.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
  return {
    sessionId: session.id,
    personnelCode: session.personnelCode,
    displayName: session.displayName,
    role: session.role as UserRole,
    expiresAt: session.expiresAt.toISOString(),
    armTokens: sessionToArmTokens(session),
    // P6.5-04-i — حمل دامنهٔ داده در زمینهٔ نشست (helper مرکزی scope.ts)
    accessScope: session.accessScope,
    branchId: session.branchId,
  };
}

/** استخراج توکن‌های ARM از رکورد نشست (رمزگشایی امن) */
export function sessionToArmTokens(session: {
  armTokenEnc: string | null;
  armRefreshTokenEnc: string | null;
  armUserType: string | null;
}): ArmTokens | null {
  const accessToken = decryptSecret(session.armTokenEnc);
  if (!accessToken) return null;
  return {
    accessToken,
    refreshToken: decryptSecret(session.armRefreshTokenEnc) ?? "",
    userType: session.armUserType ?? undefined,
  };
}

/**
 * به‌روزرسانی توکن‌های ARM نشست (پس از تمدید یا «اتصال ARM با کد پیامکی» از تنظیمات)
 * P6.5-07: userType هم ذخیره می‌شود (قبلاً در تمدید از دست می‌رفت)
 * P6.5-11 (بند ث): توکن تازه هم‌زمان در صندوقچهٔ ماندگار هم نوشته می‌شود
 * تا زنجیرهٔ «اتصال ماندگار» در تمدیدها هرگز نشکند.
 */
export async function updateSessionArmTokens(
  sessionId: string,
  armTokens: ArmTokens,
  vault?: { ownerKey: string; personnelCode?: string | null; displayName?: string | null }
): Promise<void> {
  await db.session.update({
    where: { id: sessionId },
    data: {
      armTokenEnc: encryptSecret(armTokens.accessToken),
      armRefreshTokenEnc: armTokens.refreshToken ? encryptSecret(armTokens.refreshToken) : null,
      armUserType: armTokens.userType ?? null,
    },
  });
  if (vault) {
    await persistArmTokensToVault({
      ownerKey: vault.ownerKey,
      armTokens,
      personnelCode: vault.personnelCode ?? null,
      ...(vault.displayName !== undefined ? { displayName: vault.displayName } : {}),
    }).catch(() => undefined);
  }
}

/**
 * پاک‌سازی توکن‌های ARM نشست («قطع اتصال ARM» در تنظیمات عمومی)
 * نشست خود کاربر زنده می‌ماند — فقط دسترسی داده واقعی قطع می‌شود.
 */
export async function clearSessionArmTokens(sessionId: string): Promise<void> {
  await db.session.update({
    where: { id: sessionId },
    data: { armTokenEnc: null, armRefreshTokenEnc: null, armUserType: null },
  });
}

/** تمدید نشست با چرخش توکن (Rotation) — توکن قبلی باطل می‌شود */
export async function refreshSession(token: string): Promise<{ token: string; context: SessionContext } | null> {
  const current = await validateSession(token);
  if (!current) return null;
  const cfg = getMelkApiConfig();

  const oldHash = hashToken(token);
  const newToken = generateSessionToken();
  const expiresAt = new Date(Date.now() + cfg.sessionTtlHours * 3600 * 1000);

  // توکن‌های ARM و متادیتای دیگر حفظ می‌شوند (فقط tokenHash جایگزین می‌شود)
  const oldSession = await db.session.findUnique({ where: { tokenHash: oldHash } });
  await db.session.update({
    where: { tokenHash: oldHash },
    data: { tokenHash: hashToken(newToken), expiresAt, revoked: false, revokedReason: null },
  });

  return {
    token: newToken,
    context: {
      ...current,
      armTokens: oldSession ? sessionToArmTokens(oldSession) : current.armTokens,
      expiresAt: expiresAt.toISOString(),
    },
  };
}

/** ابطال نشست (خروج) */
export async function revokeSession(token: string, reason = "USER_LOGOUT"): Promise<boolean> {
  const tokenHash = hashToken(token);
  const session = await db.session.findUnique({ where: { tokenHash } });
  if (!session) return false;
  await db.session.update({ where: { id: session.id }, data: { revoked: true, revokedReason: reason, armTokenEnc: null, armRefreshTokenEnc: null } });
  // P6.5-11 (بند ث): خروج فقط توکن‌های «نشست» را پاک می‌کند —
  // صندوقچهٔ ماندگار دست‌نخورده می‌ماند تا ورود بعدی خودکار وصل شود.
  // P2-05 — رویداد الزامی خروج
  logAuth("logout", { userId: session.personnelCode, status: "ok", detail: { reason } });
  return true;
}

/** استخراج توکن از هدر درخواست */
export function extractBearer(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return m ? m[1] : null;
}

/** رد حسابرسی */
export async function audit(action: string, actor?: string, detail?: string): Promise<void> {
  await db.auditLog.create({ data: { action, actor, detail } });
}

/** نام نمایشی مالک سامانه برای ورود با کد مدیر */
export const OWNER_DISPLAY_NAME = "سید نعمت اله سیدی";
