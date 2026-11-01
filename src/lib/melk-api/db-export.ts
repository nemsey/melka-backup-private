/**
 * db-export.ts — احراز مالک برای برون‌بری دیتابیس (PN-041 · فاز ۴ · شورا-ن۰۶۷)
 * ---------------------------------------------------------------------------
 * دو مسیر احراز:
 *   ۱) نشست OWNER (requireRole — همان روت‌های مدیریتی)
 *   ۲) Bearer token برای Workflow ابری (GitHub Actions · پشتیبان روزانه):
 *      Authorization: Bearer <MELKA_OWNER_TOKEN>
 *      توکن = MASTER_ACCESS_CODE (راز مالکِ موجود — صفر راز تازه برای مدیریت).
 *      مقایسهٔ زمان-ثابت (timingSafeEqual) — مقاوم به حملهٔ زمانی.
 *
 * قانون دادهٔ مقدس: این روت «فقط می‌خواند» — VACUUM INTO اتمی روی فایل موقت؛
 * دیتابیس زنده هرگز بازنویسی/جابه‌جا نمی‌شود.
 */

import { timingSafeEqual } from "node:crypto";

/** آیا هدر Authorization حامل توکن مالک معتبر است؟ (مقایسهٔ زمان-ثابت) */
export function verifyOwnerBearerToken(authHeader: string | null, masterCode: string | undefined): boolean {
  if (!authHeader || !masterCode) return false;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  if (!m) return false;
  const presented = Buffer.from(m[1], "utf8");
  const expected = Buffer.from(masterCode, "utf8");
  // طول متفاوت → نادرست؛ اما همیشه دو بافر هم‌طول برای timingSafeEqual
  if (presented.length !== expected.length) {
    const pad = Buffer.alloc(presented.length);
    try { timingSafeEqual(presented, pad); } catch { /* طول صفر */ }
    return false;
  }
  try {
    return timingSafeEqual(presented, expected);
  } catch {
    return false;
  }
}

/** استخراج شکل توکن از هدر (برای پیام‌های خطای شاهددار — هرگز خود مقدار را لاگ نکن) */
export function bearerTokenShape(authHeader: string | null): string {
  if (!authHeader) return "none";
  return /^Bearer\s+/i.test(authHeader.trim()) ? "bearer:<hidden>" : authHeader.slice(0, 12) + "…";
}

/**
 * برون‌بری اتمی دیتابیس زنده به مسیر داده‌شده (PN-041 · فاز ۴).
 * singleton مرکزی (HOTFIX-06/D2) — روت‌ها هرگز مستقیم db را لمس نمی‌کنند.
 * قانون دادهٔ مقدس: VACUUM INTO فقط «می‌خواند» — زنده هرگز بازنویسی نمی‌شود.
 * خروجی: { integrity, recordCount } — داوری سلامت پیش از استریم.
 */
export async function exportAtomicDb(tmpFile: string): Promise<{ integrity: string; recordCount: number }> {
  const { db } = await import("@/lib/db");
  // ENGINE: sqlite-only (برون‌بری اتمی — سوییچ PN-022-C)
  await db.$queryRawUnsafe(`VACUUM INTO '${tmpFile.replace(/'/g, "''")}'`);

  const { Database } = await import("bun:sqlite");
  const probe = new Database(tmpFile, { readonly: true });
  try {
    const integrity = (probe.query("PRAGMA integrity_check").get() as { integrity_check: string } | null)
      ?.integrity_check ?? "unknown";
    const recordCount = (probe.query("SELECT COUNT(*) c FROM PropertyRecord").get() as { c: number }).c;
    return { integrity, recordCount };
  } finally {
    probe.close();
  }
}
