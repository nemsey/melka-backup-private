/**
 * users-service.ts — PN-016: لایهٔ سرویس مدیریت کاربران (روت‌ها لاغر می‌مانند)
 * ---------------------------------------------------------------------------
 * تک‌نقطهٔ هر عملیات DB روی چهار جدول تازه:
 *   User · UserPermission · UserActivity · UserSession
 *
 * قوانین حاکم (شورا-ن۰۲۰ بند ۵.۲):
 *   · قانون هویت دوگانهٔ مالک — کد در OWNER_PERSONNEL_CODES همیشه نقش OWNER
 *     می‌گیرد؛ نقش کمتر در رکورد User «در اعمال» نادیده گرفته می‌شود.
 *   · مجوزهای OWNER هرگز بازنویسی نمی‌شوند (عبور کامل از جدول مجوزها).
 *   · صفر حذف فیزیکی کاربر (دادهٔ مقدس) — فقط isActive=false.
 */

import { db } from "@/lib/db";
import { MelkApiError } from "@/lib/melk-api/types";
import { isOwnerPersonnelCode } from "@/lib/access/personnel-access";
import {
  isUserRole,
  legacyRoleOf,
  defaultPermissionsForRole,
  sanitizePermissionInputs,
  toSafeUser,
  validateUserInput,
  recordUserActivity,
  type PermissionInput,
  type SafeUser,
  type UserRole,
  type LegacyRole,
} from "@/lib/users/user-model";

// ─────────────────────────────────────────────────────────────────────────
// خواندن‌ها
// ─────────────────────────────────────────────────────────────────────────

export interface ListUsersOptions {
  search?: string;
  role?: string | null;
  includeInactive?: boolean;
}

/** فهرست کاربران + شمار مجوزها (فیلتر/جستجو سطح DB) */
export async function listUsers(opts: ListUsersOptions = {}): Promise<SafeUser[]> {
  const search = (opts.search ?? "").trim();
  const where: Record<string, unknown> = {};
  if (opts.role && isUserRole(opts.role)) where.role = opts.role;
  if (!opts.includeInactive) where.isActive = true;
  if (search) {
    where.OR = [
      { fullName: { contains: search } },
      { personnelCode: { contains: search } },
      { mobile: { contains: search } },
      { roleTitleFa: { contains: search } },
      { branchTitle: { contains: search } },
    ];
  }
  const rows = await db.user.findMany({
    where,
    include: { _count: { select: { permissions: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return rows.map(toSafeUser);
}

/** یک کاربر با مجوزهای کامل (برای ویرایش) */
export async function getUserWithPermissions(userId: string) {
  const u = await db.user.findUnique({
    where: { id: userId },
    include: { permissions: true },
  });
  if (!u) throw new MelkApiError("UNKNOWN", "کاربر یافت نشد.", 404, false);
  return { user: toSafeUser(u), permissions: u.permissions.map((p) => ({
    tileId: p.tileId, canRead: p.canRead, canWrite: p.canWrite, canDelete: p.canDelete, canExport: p.canExport, canSync: p.canSync,
  })) };
}

/** سیاههٔ فعالیت یک کاربر (۲۴ ساعت / ۷ روز / ۳۰ روز) */
export async function getUserActivity(userId: string, windowHours: 24 | 168 | 720) {
  const since = new Date(Date.now() - windowHours * 3600_000);
  const rows = await db.userActivity.findMany({
    where: { userId, timestamp: { gte: since } },
    orderBy: { timestamp: "desc" },
    take: 300,
  });
  return rows.map((r) => ({
    id: r.id,
    action: r.action,
    tileId: r.tileId,
    resourceId: r.resourceId,
    details: r.details,
    ip: r.ip,
    timestamp: r.timestamp.toISOString(),
  }));
}

/** نشست‌های فعال یک کاربر (برای بستن از راه دور) */
export async function getUserSessions(userId: string) {
  const rows = await db.userSession.findMany({
    where: { userId, isActive: true, expiresAt: { gt: new Date() } },
    orderBy: { lastActivityAt: "desc" },
    take: 50,
  });
  return rows.map((r) => ({
    id: r.id,
    ip: r.ip,
    userAgent: r.userAgent,
    createdAt: r.createdAt.toISOString(),
    lastActivityAt: r.lastActivityAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
  }));
}

// ─────────────────────────────────────────────────────────────────────────
// نوشتن‌ها (همه فقط مالک — گارد در روت)
// ─────────────────────────────────────────────────────────────────────────

/** ساخت کاربر جدید با مجوزهای پیش‌فرض نقش */
export async function createUser(input: {
  personnelCode?: string | null;
  mobile?: string | null;
  fullName: string;
  role: UserRole;
  branchTitle?: string | null;
  roleTitleFa?: string | null;
  createdBy: string;
}): Promise<SafeUser> {
  const err = validateUserInput(input);
  if (err) throw new MelkApiError("UNKNOWN", err, 400, false);

  const personnelCode = (input.personnelCode ?? "").trim() || null;
  const mobile = (input.mobile ?? "").trim() || null;

  // قانون هویت دوگانهٔ مالک — کد مالک همیشه OWNER ساخته می‌شود
  const role: UserRole = personnelCode && isOwnerPersonnelCode(personnelCode) ? "OWNER" : input.role;

  const dup = await db.user.findFirst({
    where: personnelCode ? { personnelCode } : mobile ? { mobile } : {},
    select: { id: true },
  });
  if (dup) throw new MelkApiError("UNKNOWN", "کاربری با این کد پرسنلی/موبایل از قبل ثبت شده است.", 409, false);

  const user = await db.user.create({
    data: {
      personnelCode,
      mobile,
      fullName: input.fullName.trim(),
      role,
      branchTitle: input.branchTitle?.trim() || null,
      roleTitleFa: input.roleTitleFa?.trim() || null,
      isActive: true,
      createdBy: input.createdBy,
      metadata: JSON.stringify({ source: "manual", by: input.createdBy }),
    },
  });
  await db.userPermission.createMany({
    data: defaultPermissionsForRole(role).map((p) => ({ userId: user.id, ...p })),
  });
  return toSafeUser(user);
}

/** ویرایش پروفایل/نقش کاربر */
export async function updateUser(userId: string, input: {
  fullName?: string;
  role?: UserRole;
  branchTitle?: string | null;
  roleTitleFa?: string | null;
  isActive?: boolean;
  resetPermissions?: boolean;
}, actor: string): Promise<SafeUser> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new MelkApiError("UNKNOWN", "کاربر یافت نشد.", 404, false);

  // محافظت: تغییر نقش/غیرفعال‌سازی مالکِ محیط (کد مالک همیشه OWNER)
  const isEnvOwner = user.personnelCode ? isOwnerPersonnelCode(user.personnelCode) : false;
  if (isEnvOwner && input.role && input.role !== "OWNER") {
    throw new MelkApiError("UNKNOWN", "نقش دارندهٔ کد پرسنلی مالک قابل تغییر نیست (قانون هویت دوگانه).", 403, false);
  }
  if (isEnvOwner && input.isActive === false) {
    throw new MelkApiError("UNKNOWN", "کاربر مالک قابل غیرفعال‌سازی نیست.", 403, false);
  }

  const data: Record<string, unknown> = {};
  if (input.fullName !== undefined) {
    if (input.fullName.trim().length < 2) throw new MelkApiError("UNKNOWN", "نام کامل حداقل ۲ نویسه باشد.", 400, false);
    data.fullName = input.fullName.trim();
  }
  if (input.role !== undefined && input.role !== user.role) {
    if (!isUserRole(input.role)) throw new MelkApiError("UNKNOWN", "نقش نامعتبر است.", 400, false);
    data.role = input.role;
  }
  if (input.branchTitle !== undefined) data.branchTitle = input.branchTitle?.trim() || null;
  if (input.roleTitleFa !== undefined) data.roleTitleFa = input.roleTitleFa?.trim() || null;
  if (input.isActive !== undefined) data.isActive = Boolean(input.isActive);

  const updated = await db.user.update({
    where: { id: userId },
    data,
    include: { _count: { select: { permissions: true } } },
  });

  // تغییر نقش + درخواست بازنشانی مجوزها → ماتریس پیش‌فرض نقش تازه
  if (input.resetPermissions || (input.role !== undefined && input.role !== user.role && input.role !== "OWNER")) {
    await db.userPermission.deleteMany({ where: { userId } });
    if (updated.role !== "OWNER") {
      await db.userPermission.createMany({
        data: defaultPermissionsForRole(updated.role as UserRole).map((p) => ({ userId, ...p })),
      });
    }
  }

  await recordUserActivity({
    userId,
    action: input.role !== undefined && input.role !== user.role ? "role-change" : "edit",
    details: JSON.stringify({ by: actor, changes: Object.keys(data), resetPermissions: Boolean(input.resetPermissions) }),
  });
  return toSafeUser(updated);
}

/** بازنویسی ماتریس مجوزهای یک کاربر (OWNER از ماتریس عبور می‌کند — رد نمی‌شود) */
export async function setUserPermissions(userId: string, inputs: PermissionInput[], actor: string): Promise<void> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new MelkApiError("UNKNOWN", "کاربر یافت نشد.", 404, false);
  if (user.role === "OWNER") {
    throw new MelkApiError("UNKNOWN", "مجوزهای مالک قابل ویرایش نیستند (مالک بدون محدودیت است).", 403, false);
  }
  const clean = sanitizePermissionInputs(inputs);
  await db.userPermission.deleteMany({ where: { userId } });
  if (clean.length > 0) {
    await db.userPermission.createMany({
      data: clean.map((p) => ({ userId, tileId: p.tileId, canRead: p.canRead, canWrite: p.canWrite, canDelete: p.canDelete, canExport: p.canExport, canSync: p.canSync })),
    });
  }
  await recordUserActivity({ userId, action: "permission-change", details: JSON.stringify({ by: actor, count: clean.length }) });
}

/** غیرفعال‌سازی کاربر + بستن همهٔ نشست‌های فعال (هر دو جدول) */
export async function deactivateUser(userId: string, actor: string): Promise<void> {
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) throw new MelkApiError("UNKNOWN", "کاربر یافت نشد.", 404, false);
  if (user.personnelCode && isOwnerPersonnelCode(user.personnelCode)) {
    throw new MelkApiError("UNKNOWN", "کاربر مالک قابل غیرفعال‌سازی نیست.", 403, false);
  }
  await db.user.update({ where: { id: userId }, data: { isActive: false } });
  await revokeUserSessions(userId);
  await recordUserActivity({ userId, action: "edit", details: JSON.stringify({ by: actor, deactivated: true }) });
}

/** بستن همهٔ نشست‌های فعال یک کاربر از راه دور */
export async function revokeUserSessions(userId: string): Promise<number> {
  const now = new Date();
  const active = await db.userSession.findMany({
    where: { userId, isActive: true },
    select: { tokenHash: true },
    take: 100,
  });
  let closed = 0;
  for (const s of active) {
    // Session اصلی (احراز هویت) — همان هش
    const r1 = await db.session.updateMany({ where: { tokenHash: s.tokenHash, revoked: false }, data: { revoked: true, revokedReason: "USER_MGMT_REMOTE_CLOSE" } });
    const r2 = await db.userSession.updateMany({ where: { tokenHash: s.tokenHash, isActive: true }, data: { isActive: false } });
    closed += Math.max(r1.count, r2.count);
  }
  void now;
  return closed;
}

/** بستن یک نشست مشخص */
export async function revokeUserSession(userId: string, sessionId: string): Promise<boolean> {
  const s = await db.userSession.findUnique({ where: { id: sessionId } });
  if (!s || s.userId !== userId) return false;
  await db.session.updateMany({ where: { tokenHash: s.tokenHash, revoked: false }, data: { revoked: true, revokedReason: "USER_MGMT_REMOTE_CLOSE" } });
  await db.userSession.update({ where: { id: sessionId }, data: { isActive: false } });
  return true;
}

// ─────────────────────────────────────────────────────────────────────────
// نقطهٔ اتصال ورود — منبع یکتای «کاربرِ پشت این کد پرسنلی»
// ─────────────────────────────────────────────────────────────────────────

export interface LoginUserResolution {
  user: { id: string; role: UserRole; fullName: string; isActive: boolean };
  /** نقش قدیمی که روت ورود باید در Session بنویسد */
  legacyRole: LegacyRole;
  /** نقش نهایی نمایش داده می‌شود (پس از قانون مالک) */
  effectiveRole: UserRole;
  isNewlyProvisioned: boolean;
}

/**
 * واکاوی کاربر هنگام ورود پرسنلی (بند ۵.۲.۳ مسیر ۲):
 *   · User موجود و فعال → نقش از User
 *   · User موجود ولی غیرفعال → رد ورود (403)
 *   · بدون User → ساخت خودکار با role=VIEWER (سپس مالک ارتقا می‌دهد)
 *   · کد مالک (env) → همیشه OWNER (قانون هویت دوگانه)
 */
export async function resolvePersonnelLoginUser(personnelCode: string, fullName: string | null): Promise<LoginUserResolution> {
  // قانون هویت دوگانهٔ مالک — حتی بدون رکورد User
  if (isOwnerPersonnelCode(personnelCode)) {
    let user = await db.user.findUnique({ where: { personnelCode } });
    if (!user) {
      const created = await db.user.create({
        data: {
          personnelCode,
          fullName: fullName ?? "مالک سامانه",
          role: "OWNER",
          isActive: true,
          createdBy: "env-owner-code",
          metadata: JSON.stringify({ source: "auto-owner" }),
        },
      });
      await db.userPermission.createMany({
        data: defaultPermissionsForRole("OWNER").map((p) => ({ userId: created.id, ...p })),
      });
      user = created;
    } else if (user.role !== "OWNER") {
      user = await db.user.update({ where: { id: user.id }, data: { role: "OWNER", isActive: true } });
    }
    return { user: { id: user.id, role: "OWNER", fullName: user.fullName, isActive: true }, legacyRole: "OWNER", effectiveRole: "OWNER", isNewlyProvisioned: false };
  }

  let user = await db.user.findUnique({ where: { personnelCode } });
  let isNewlyProvisioned = false;

  if (!user) {
    // ساخت خودکار با کمترین امتیاز (بند ۵.۲.۳: PM قطع → VIEWER)
    const created = await db.user.create({
      data: {
        personnelCode,
        fullName: fullName ?? `کاربر ${personnelCode}`,
        role: "VIEWER",
        isActive: true,
        createdBy: "self-provision",
        metadata: JSON.stringify({ source: "self-provision" }),
      },
    });
    await db.userPermission.createMany({
      data: defaultPermissionsForRole("VIEWER").map((p) => ({ userId: created.id, ...p })),
    });
    user = created;
    isNewlyProvisioned = true;
  }

  const effectiveRole = user.role as UserRole;
  return {
    user: { id: user.id, role: effectiveRole, fullName: user.fullName, isActive: user.isActive },
    legacyRole: legacyRoleOf(effectiveRole),
    effectiveRole,
    isNewlyProvisioned,
  };
}

/** کاربر مهمان با موبایل (بند ۵.۲.۳ مسیر ۳) — همیشه GUEST */
export async function resolveGuestLoginUser(mobile: string): Promise<LoginUserResolution> {
  let user = await db.user.findUnique({ where: { mobile } });
  let isNewlyProvisioned = false;
  if (!user) {
    user = await db.user.create({
      data: {
        mobile,
        fullName: `مهمان ${mobile.slice(-4)}`,
        role: "GUEST",
        isActive: true,
        createdBy: "guest-login",
        metadata: JSON.stringify({ source: "guest" }),
      },
    });
    isNewlyProvisioned = true;
  }
  return {
    user: { id: user.id, role: "GUEST", fullName: user.fullName, isActive: user.isActive },
    legacyRole: "CONSULTANT",
    effectiveRole: "GUEST",
    isNewlyProvisioned,
  };
}

/** ثبت نشست کاربر پس از ورود موفق (پیوند به Session اصلی با همان tokenHash) */
export async function recordLoginSession(input: {
  userId: string;
  tokenHash: string;
  ip?: string | null;
  userAgent?: string | null;
  expiresAt: Date;
}): Promise<void> {
  await db.userSession.upsert({
    where: { tokenHash: input.tokenHash },
    create: {
      userId: input.userId,
      tokenHash: input.tokenHash,
      ip: input.ip ?? null,
      userAgent: input.userAgent ? input.userAgent.slice(0, 300) : null,
      expiresAt: input.expiresAt,
      isActive: true,
    },
    update: { isActive: true, lastActivityAt: new Date(), expiresAt: input.expiresAt, ip: input.ip ?? null },
  }).catch(() => {}); // نقشهٔ نشست هرگز ورود را نمی‌شکند

  await db.user.update({
    where: { id: input.userId },
    data: { lastLoginAt: new Date(), lastLoginIp: input.ip ?? null, failedAttempts: 0, lockedUntil: null },
  }).catch(() => {});
}

/** به‌روزرسانی لرزش نشست (touch) — هر واکشی session معتبر */
export async function touchUserSession(tokenHash: string): Promise<void> {
  await db.userSession.updateMany({
    where: { tokenHash, isActive: true },
    data: { lastActivityAt: new Date() },
  }).catch(() => {});
}

/** شمار کلی برای داشبورد مدیریتی */
export async function usersOverview(): Promise<{
  total: number; active: number; byRole: Record<string, number>; guests: number; sessionsActive: number;
}> {
  const [total, active, byRoleRows, guests, sessionsActive] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { isActive: true } }),
    db.user.groupBy({ by: ["role"], _count: { _all: true } }),
    db.user.count({ where: { mobile: { not: null }, personnelCode: null } }),
    db.userSession.count({ where: { isActive: true, expiresAt: { gt: new Date() } } }),
  ]);
  const byRole: Record<string, number> = {};
  for (const r of byRoleRows) byRole[r.role] = r._count._all;
  return { total, active, byRole, guests, sessionsActive };
}
