/**
 * مدیریت چرخه عمر نشست (Session Lifecycle) — سمت سرور
 * ------------------------------------------------------
 * ایجاد، اعتبارسنجی، تمدید (Rotation)، ابطال (Logout) و انقضای خودکار.
 * توکن صرفاً هش‌شده ذخیره می‌شود (به بخش امنیتی crypto.ts مراجعه کنید).
 */

import { db } from "@/lib/db";
import { getMelkApiConfig } from "@/lib/melk-api/config";
import { generateSessionToken, hashToken } from "./crypto";
import type { AuthUserInfo, UserRole } from "@/lib/melk-api/types";

export interface SessionContext extends AuthUserInfo {
  sessionId: string;
  expiresAt: string;
}

/** ایجاد نشست جدید برای کاربر تأییدشده */
export async function createSession(user: AuthUserInfo, meta: { ip?: string; userAgent?: string }): Promise<{ token: string; context: SessionContext }> {
  const cfg = getMelkApiConfig();
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + cfg.sessionTtlHours * 3600 * 1000);

  const session = await db.session.create({
    data: {
      tokenHash: hashToken(token),
      personnelCode: user.personnelCode,
      displayName: user.displayName,
      role: user.role,
      expiresAt,
      ip: meta.ip,
      userAgent: meta.userAgent,
    },
  });

  return {
    token,
    context: {
      sessionId: session.id,
      personnelCode: user.personnelCode,
      displayName: user.displayName,
      role: user.role,
      expiresAt: expiresAt.toISOString(),
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
  };
}

/** تمدید نشست با چرخش توکن (Rotation) — توکن قبلی باطل می‌شود */
export async function refreshSession(token: string): Promise<{ token: string; context: SessionContext } | null> {
  const current = await validateSession(token);
  if (!current) return null;
  const cfg = getMelkApiConfig();

  const oldHash = hashToken(token);
  const newToken = generateSessionToken();
  const expiresAt = new Date(Date.now() + cfg.sessionTtlHours * 3600 * 1000);

  await db.session.update({
    where: { tokenHash: oldHash },
    data: { tokenHash: hashToken(newToken), expiresAt, revoked: false, revokedReason: null },
  });

  return {
    token: newToken,
    context: { ...current, expiresAt: expiresAt.toISOString() },
  };
}

/** ابطال نشست (خروج) */
export async function revokeSession(token: string, reason = "USER_LOGOUT"): Promise<boolean> {
  const tokenHash = hashToken(token);
  const session = await db.session.findUnique({ where: { tokenHash } });
  if (!session) return false;
  await db.session.update({ where: { id: session.id }, data: { revoked: true, revokedReason: reason } });
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
