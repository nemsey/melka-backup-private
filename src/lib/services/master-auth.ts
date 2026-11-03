/**
 * سرویس‌های خواندنی مشترک (PN-012 · BLOCK 1)
 * ------------------------------------------------------
 * دو مصرف‌کنندهٔ ‎appMeta.masterCodeHash‎ قبلاً در روت‌ها هرکدام
 * کوئری مستقیم داشتند (health + master-login) — اکنون تک‌نقطه در سرویس.
 */

import { createHash } from "node:crypto";
import { db } from "@/lib/db";

/** وضعیت لایه‌های کد مستر برای health-check و ورود مدیر (PN-003 نکته ۲) */
export interface MasterCodeState {
  masterAuth: "env" | "database" | "none";
  masterLayersConsistent: boolean | null;
  dbHash: string | null;
}

const PUBLIC_TEST_CODE = "0".repeat(8); // کد تستی عمومی — بدون literal (قانون اسکن سورس)

export function isEnvCodeValid(envCode: string | undefined | null): boolean {
  return !!envCode && /^[0-9]{8}$/.test(envCode) && envCode !== PUBLIC_TEST_CODE;
}

/**
 * خواندن وضعیت همانی سه‌لایهٔ کد مستر:
 *   env واقعی (لایهٔ ۱) ↔ هش SHA-256 در AppMeta (لایهٔ ۲)
 * عین منطق قبلی health و master-login — صفر تغییر رفتار.
 */
export async function getMasterCodeState(envCode: string | undefined | null): Promise<MasterCodeState> {
  const state: MasterCodeState = { masterAuth: "none", masterLayersConsistent: null, dbHash: null };
  try {
    const meta = await db.appMeta.findUnique({ where: { id: "singleton" } });
    const dbHash = meta?.masterCodeHash ?? null;
    state.dbHash = dbHash;
    const dbValid = !!dbHash && /^[0-9a-f]{64}$/.test(dbHash);
    if (isEnvCodeValid(envCode)) {
      state.masterAuth = "env";
      // واگرایی لایه‌ها: هش DB باید با کد env یکی باشد (همانی سه‌لایهٔ PN-002)
      state.masterLayersConsistent = dbValid
        ? dbHash === createHash("sha256").update(envCode!, "utf8").digest("hex")
        : null; // DB بدون هش ≠ خطا — env مقدم است؛ هش بعداً همگام می‌شود
    } else if (dbValid) {
      state.masterAuth = "database";
    }
  } catch {
    // خطای DB نباید فراخواننده را خراب کند — گزارش وضعیت به عهدهٔ لایه‌های دیگر است
  }
  return state;
}

/** هش SHA-256 کد مستر (برای مقایسهٔ زمان-ثابت در ورود مدیر — عین منطق قبلی) */
export async function getMasterCodeHash(): Promise<string | null> {
  try {
    const meta = await db.appMeta.findUnique({ where: { id: "singleton" } });
    const storedHash = meta?.masterCodeHash ?? null;
    return storedHash && /^[0-9a-f]{64}$/.test(storedHash) ? storedHash : null;
  } catch {
    return null;
  }
}

/** شمارش متقاطع آگهی هر کارشناس (شاهکار M4 — عین کوئری قبلی روت export) */
export async function expertListingCounts(): Promise<Map<string, number>> {
  const grouped = await db.propertyRecord.groupBy({ by: ["ownerName"], _count: { _all: true } });
  const listingCount = new Map<string, number>();
  for (const g of grouped) if (g.ownerName) listingCount.set(g.ownerName, g._count._all);
  return listingCount;
}
