/**
 * user-model.ts — PN-016: مدل دامنهٔ سیستم مدیریت کاربران پیشرفته
 * ---------------------------------------------------------------------------
 * شورا-ن۰۲۰ بند ۵.۲ — پنج نقش، ماتریس مجوز پیش‌فرض، اعتبارسنجی، تصویر امن.
 *
 * نکتهٔ Prisma+SQLite: enum در سطح DB پشتیبانی نمی‌شود → رشته‌های کنترل‌شده
 * با این ماژول (تنها منبع مجاز تعریف نقش‌ها).
 */

import { db } from "@/lib/db";
import { MANAGEABLE_TILES } from "@/lib/access/personnel-access";

// ─────────────────────────────────────────────────────────────────────────
// نقش‌ها (بند ۵.۲.۲ شورا)
// ─────────────────────────────────────────────────────────────────────────

export const USER_ROLES = ["OWNER", "MANAGER", "EXPERT", "VIEWER", "GUEST"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS_FA: Record<UserRole, string> = {
  OWNER: "مالک — دسترسی کامل",
  MANAGER: "مدیر — تقریباً کامل (بدون تنظیمات حساس)",
  EXPERT: "کارشناس — کاشی‌های کاری",
  VIEWER: "بازدیدکننده — فقط خواندن",
  GUEST: "مهمان — محدود",
};

export function isUserRole(v: unknown): v is UserRole {
  return typeof v === "string" && (USER_ROLES as readonly string[]).includes(v);
}

/** نقش دوزبانهٔ قدیمی سامانه (میان‌افزار موجود) — طرح: OWNER کامل، بقیه CONSULTANT */
export type LegacyRole = "OWNER" | "CONSULTANT";

/** تصویر نقش جدید روی نقش قدیمی — صفر تغییر در گاردهای مالک‌محور موجود */
export function legacyRoleOf(role: UserRole): LegacyRole {
  return role === "OWNER" ? "OWNER" : "CONSULTANT";
}

// ─────────────────────────────────────────────────────────────────────────
// ماتریس مجوز پیش‌فرض هر نقش (بند ۵.۲.۲)
// ─────────────────────────────────────────────────────────────────────────

export interface TilePermission {
  tileId: string;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canExport: boolean;
  canSync: boolean;
}

const ALL_TILE_IDS = MANAGEABLE_TILES.map((t) => t.id);

/** عملیات مجاز هر نقش روی کاشی‌ها */
const ROLE_OPS: Record<UserRole, Pick<TilePermission, "canRead" | "canWrite" | "canDelete" | "canExport" | "canSync">> = {
  OWNER: { canRead: true, canWrite: true, canDelete: true, canExport: true, canSync: true },
  MANAGER: { canRead: true, canWrite: true, canDelete: false, canExport: true, canSync: true },
  EXPERT: { canRead: true, canWrite: true, canDelete: false, canExport: true, canSync: false },
  VIEWER: { canRead: true, canWrite: false, canDelete: false, canExport: false, canSync: false },
  GUEST: { canRead: false, canWrite: false, canDelete: false, canExport: false, canSync: false },
};

/** کاشی‌های هر نقش (شناسه‌ها) — settings استثنای همیشه-در-دسترس است و این‌جا نمی‌آید */
const ROLE_TILES: Record<UserRole, string[]> = {
  OWNER: ALL_TILE_IDS,
  MANAGER: ALL_TILE_IDS,
  // EXPERT: شش کاشی قابل‌مدیریت + دو کاشی آزاد (listing/request از PN-008 در دسترس همهٔ واردشده‌هاست — سطر مجوز لازم ندارد)
  EXPERT: ["arm-listings", "arm-requests", "transactions-contracts", "experts", "smart-matching", "file-finder"],
  VIEWER: ALL_TILE_IDS,
  GUEST: [], // «فقط خانه» — بند ۵.۲.۲
};

/** مجوزهای پیش‌فرض یک نقش (برای ساخت/بازنشانی کاربر و Seed) */
export function defaultPermissionsForRole(role: UserRole): TilePermission[] {
  const ops = ROLE_OPS[role];
  const tiles = ROLE_TILES[role];
  return tiles.map((tileId) => ({ tileId, ...ops }));
}

/** ورودیِ مجاز برای به‌روزرسانی دستی مجوزها */
export interface PermissionInput {
  tileId: string;
  canRead: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canExport: boolean;
  canSync: boolean;
}

export function sanitizePermissionInputs(inputs: PermissionInput[]): PermissionInput[] {
  const valid = new Set(ALL_TILE_IDS);
  const seen = new Set<string>();
  const out: PermissionInput[] = [];
  for (const p of inputs) {
    if (!valid.has(p.tileId) || seen.has(p.tileId)) continue;
    seen.add(p.tileId);
    out.push({
      tileId: p.tileId,
      canRead: Boolean(p.canRead),
      canWrite: Boolean(p.canWrite),
      canDelete: Boolean(p.canDelete),
      canExport: Boolean(p.canExport),
      canSync: Boolean(p.canSync),
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// اعتبارسنجی ورودی کاربر
// ─────────────────────────────────────────────────────────────────────────

export interface UserInput {
  personnelCode?: string | null;
  mobile?: string | null;
  fullName: string;
  role: UserRole;
  branchTitle?: string | null;
  roleTitleFa?: string | null;
  isActive?: boolean;
}

export function validateUserInput(u: UserInput): string | null {
  const code = (u.personnelCode ?? "").trim();
  const mobile = (u.mobile ?? "").trim();
  if (!code && !mobile) return "کد پرسنلی یا موبایل حداقلً یکی لازم است.";
  if (u.fullName.trim().length < 2) return "نام کامل حداقل ۲ نویسه باشد.";
  if (!isUserRole(u.role)) return `نقش نامعتبر است (مجاز: ${USER_ROLES.join(" | ")})`;
  if (code && !/^\d{6,12}$/.test(code)) return "قالب کد پرسنلی نامعتبر است (۶ تا ۱۲ رقم).";
  if (mobile && !/^09\d{9}$/.test(mobile)) return "قالب موبایل نامعتبر است (09xxxxxxxxx).";
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// تصویر امن کاربر برای پاسخ API (هرگز توکن/هش/متادیتای خام)
// ─────────────────────────────────────────────────────────────────────────

export interface SafeUser {
  id: string;
  personnelCode: string | null;
  mobile: string | null;
  fullName: string;
  role: UserRole;
  branchTitle: string | null;
  roleTitleFa: string | null;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  lastLoginIp: string | null;
  lockedUntil: string | null;
  permissionCount: number;
}

type UserRow = {
  id: string;
  personnelCode: string | null;
  mobile: string | null;
  fullName: string;
  role: string;
  branchTitle: string | null;
  roleTitleFa: string | null;
  isActive: boolean;
  createdAt: Date;
  lastLoginAt: Date | null;
  lastLoginIp: string | null;
  lockedUntil: Date | null;
  _count?: { permissions: number };
};

export function toSafeUser(u: UserRow): SafeUser {
  return {
    id: u.id,
    personnelCode: u.personnelCode,
    mobile: u.mobile,
    fullName: u.fullName,
    role: (isUserRole(u.role) ? u.role : "VIEWER") as UserRole,
    branchTitle: u.branchTitle,
    roleTitleFa: u.roleTitleFa,
    isActive: u.isActive,
    createdAt: u.createdAt.toISOString(),
    lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
    lastLoginIp: u.lastLoginIp,
    lockedUntil: u.lockedUntil ? u.lockedUntil.toISOString() : null,
    permissionCount: u._count?.permissions ?? 0,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// ثبت فعالیت (تک‌نقطهٔ نوشتن UserActivity — بند ۵.۴ گارد سوم)
// ─────────────────────────────────────────────────────────────────────────

export async function recordUserActivity(input: {
  userId: string;
  action: string;
  tileId?: string | null;
  resourceId?: string | null;
  details?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  await db.userActivity.create({
    data: {
      userId: input.userId,
      action: input.action,
      tileId: input.tileId ?? null,
      resourceId: input.resourceId ?? null,
      details: input.details ? String(input.details).slice(0, 500) : null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ? input.userAgent.slice(0, 300) : null,
    },
  }).catch(() => {}); // سیاههٔ فعالیت هرگز جریان اصلی را نمی‌شکند
}
