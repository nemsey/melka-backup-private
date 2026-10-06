/**
 * personnel-access.ts — PN-008 BLOCK 7: مدیریت دسترسی کدپرسنلی‌ها به داشبورد
 * ---------------------------------------------------------------------------
 * سه سطح (دستور مالک ۱۴۰۵/۰۷/۱۶):
 *   full    = همهٔ کاشی‌های داشبورد
 *   limited = فقط کاشی‌های انتخابی (allowedTiles)
 *   none    = هیچ کاشی‌ای
 *
 * قانون ترکیب با OWNER (قانون هویت دوگانهٔ مالک):
 *   · نقش OWNER (از کد مستر یا کدپرسنلی مالک) → همیشه full — بدون استثنا؛
 *     حتی اگر رکورد PersonnelAccess برای همان کد ثبت شده باشد.
 *   · CONSULTANT → طبق رکورد؛ بدون رکورد = none (امنیت پیش‌فرض).
 */

import { db } from "@/lib/db";
import { ownerPersonnelCodesFromEnv, isOwnerPersonnelCode } from "./owner-codes";

export { isOwnerPersonnelCode };

/** کاشی‌های قابل مدیریت — تنظیمات همیشه در دسترس استثنا شده است */
export const MANAGEABLE_TILES: Array<{ id: string; title: string }> = [
  { id: "arm-listings", title: "M1 — آگهی ملک تبریز" },
  { id: "arm-requests", title: "M2 — درخواست ملک تبریز" },
  { id: "transactions-contracts", title: "M3 — معاملات ملک تبریز" },
  { id: "experts", title: "M4 — کارشناسان" },
  { id: "smart-matching", title: "M5 — تطبیق هوشمند" },
  { id: "learning-tier", title: "M6 — مغز و یادگیری" },
  { id: "market-index", title: "شاخص قیمت بازار" },
  { id: "data-coverage", title: "پوشش داده‌ها" },
  { id: "file-finder", title: "فایل‌یاب" },
  { id: "management-dashboard", title: "داشبورد مدیریتی" },
];

export type AccessLevel = "full" | "limited" | "none";

export interface PersonnelAccessRecord {
  personnelCode: string;
  level: AccessLevel;
  allowedTiles: string[];
  grantedAt: string;
  grantedBy: string;
  notes: string | null;
}

function parseTiles(json: string | null): string[] {
  if (!json) return [];
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** کدهای پرسنلی مالک — از env (OWNER_PERSONNEL_CODES با کاما) */
export function getOwnerPersonnelCodes(): string[] {
  return ownerPersonnelCodesFromEnv();
}

/** فهرست همهٔ رکوردها (برای UI تنظیمات) */
export async function listPersonnelAccess(): Promise<PersonnelAccessRecord[]> {
  const rows = await db.personnelAccess.findMany({ orderBy: { personnelCode: "asc" } });
  return rows.map((r) => ({
    personnelCode: r.personnelCode,
    level: r.level as AccessLevel,
    allowedTiles: parseTiles(r.allowedTiles),
    grantedAt: r.grantedAt.toISOString(),
    grantedBy: r.grantedBy,
    notes: r.notes,
  }));
}

/** ثبت/ویرایش دسترسی یک کد */
export async function upsertPersonnelAccess(input: {
  personnelCode: string;
  level: AccessLevel;
  allowedTiles?: string[];
  grantedBy: string;
  notes?: string | null;
}): Promise<PersonnelAccessRecord> {
  const code = input.personnelCode.trim();
  const tiles = (input.allowedTiles ?? []).filter((t) => MANAGEABLE_TILES.some((m) => m.id === t));
  const data = {
    personnelCode: code,
    level: input.level,
    allowedTiles: input.level === "limited" ? JSON.stringify([...new Set(tiles)]) : null,
    grantedBy: input.grantedBy,
    notes: input.notes ?? null,
    updatedAt: new Date(),
  };
  const row = await db.personnelAccess.upsert({
    where: { personnelCode: code },
    create: { ...data, grantedAt: new Date() },
    update: { level: data.level, allowedTiles: data.allowedTiles, grantedBy: data.grantedBy, notes: data.notes, updatedAt: data.updatedAt },
  });
  return {
    personnelCode: row.personnelCode,
    level: row.level as AccessLevel,
    allowedTiles: parseTiles(row.allowedTiles),
    grantedAt: row.grantedAt.toISOString(),
    grantedBy: row.grantedBy,
    notes: row.notes,
  };
}

/** حذف رکورد */
export async function deletePersonnelAccess(personnelCode: string): Promise<boolean> {
  const r = await db.personnelAccess.deleteMany({ where: { personnelCode } });
  return r.count > 0;
}

/**
 * کاشی‌های مجاز یک کاربر — تک‌نقطهٔ تصمیم (بند ۷.۴):
 *   OWNER → همهٔ کاشی‌ها (بی‌محدودیت، بدون استثنا)
 *   CONSULTANT + رکورد full → همه
 *   CONSULTANT + رکورد limited → فقط allowedTiles
 *   CONSULTANT + رکورد none یا بدون رکورد → [] (تنظیمات جداگانه است — همیشه مجاز)
 */
export async function resolveAllowedTiles(role: "OWNER" | "CONSULTANT", personnelCode: string): Promise<{ level: AccessLevel; tiles: string[] }> {
  if (role === "OWNER") return { level: "full", tiles: MANAGEABLE_TILES.map((t) => t.id) };
  const row = await db.personnelAccess.findUnique({ where: { personnelCode } }).catch(() => null);
  if (!row) return { level: "none", tiles: [] };
  const lvl = row.level as AccessLevel;
  if (lvl === "full") return { level: "full", tiles: MANAGEABLE_TILES.map((t) => t.id) };
  if (lvl === "limited") return { level: "limited", tiles: parseTiles(row.allowedTiles) };
  return { level: "none", tiles: [] };
}

/** آیا کاربر به کاشی مشخصی دسترسی دارد؟ */
export async function hasTileAccess(role: "OWNER" | "CONSULTANT", personnelCode: string, tileId: string): Promise<boolean> {
  const { tiles } = await resolveAllowedTiles(role, personnelCode);
  return tiles.includes(tileId);
}

/** گارد کاشی — برای روت‌های دادهٔ کاشی‌ها (بند ۷.۴): تهی = مجاز؛ MelkApiError = رد */
export async function requireTileAccessFor(
  ctx: { role: "OWNER" | "CONSULTANT"; personnelCode: string },
  tileId: string
): Promise<import("@/lib/melk-api/types").MelkApiError | null> {
  // شناسهٔ خارج از سطح مدیریت دسترسی (agentهای legacy مانند «transactions») → مجاز؛
  // سیستم دسترسی فقط ده کاشی داشبورد را می‌گرداند.
  if (!MANAGEABLE_TILES.some((t) => t.id === tileId)) return null;
  const allowed = await hasTileAccess(ctx.role, ctx.personnelCode, tileId);
  if (allowed) return null;
  return new (await import("@/lib/melk-api/types")).MelkApiError(
    "FORBIDDEN",
    "دسترسی به این بخش داشبورد برای کد پرسنلی شما فعال نیست.",
    403,
    false
  );
}
