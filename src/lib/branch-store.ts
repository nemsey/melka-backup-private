/**
 * انبار شعبه کارشناسان — P6530 / گام ۱ (نکته ۲: چهار شعبه ملک تبریز)
 * ---------------------------------------------------------------------------
 * نگهداری نقشهٔ «کارشناس → شعبه» در RefListCache با کلید «expert-branch-map»
 * (الگوی موجود انبارهای کلید-مقدار: instagram/store.ts و pm-acc-sync.ts).
 * منابع دادهٔ شعبه به‌ترتیب اعتبار (زنجیرهٔ branches.ts):
 *   ۱) نقشهٔ مالک (این انبار — قابل ویرایش از روت /api/crm/branches)
 *   ۲) businessId.title سامانه‌های ARM/PM (اگر نام واقعی شعبه باشد)
 *   ۳) «تعیین نشده» — نمایش صادقانه
 */

import { db } from "@/lib/db";
import { sanitizeOwnerBranchMap, TABRIZ_BRANCHES } from "@/lib/branches";

const MAP_KEY = "expert-branch-map";

export interface ExpertBranchEntry {
  expertName: string;
  branch: string;
  source: "owner-map" | "system" | "unset";
}

/** خواندن نقشهٔ مالک — همیشه شیء sanitize‌شده (مقادیر نامعتبر حذف‌شده) */
export async function readOwnerBranchMap(): Promise<Record<string, string>> {
  const row = await db.refListCache.findUnique({ where: { key: MAP_KEY } });
  if (!row) return {};
  try {
    return sanitizeOwnerBranchMap(JSON.parse(row.dataJson));
  } catch {
    return {};
  }
}

/** نوشتن نقشهٔ مالک — فقط مالک (گارد در روت)؛ merge با نقشهٔ موجود */
export async function writeOwnerBranchMap(
  updates: Record<string, string>
): Promise<Record<string, string>> {
  const clean = sanitizeOwnerBranchMap(updates);
  const current = await readOwnerBranchMap();
  const merged = { ...current, ...clean };
  await db.refListCache.upsert({
    where: { key: MAP_KEY },
    create: { key: MAP_KEY, dataJson: JSON.stringify(merged) },
    update: { dataJson: JSON.stringify(merged) },
  });
  return merged;
}

/** حذف یک انتساب از نقشهٔ مالک (بازگشت به منبع سامانه/تعیین‌نشده) */
export async function removeOwnerBranchAssignments(names: string[]): Promise<Record<string, string>> {
  const current = await readOwnerBranchMap();
  for (const n of names) delete current[n];
  await db.refListCache.upsert({
    where: { key: MAP_KEY },
    create: { key: MAP_KEY, dataJson: JSON.stringify(current) },
    update: { dataJson: JSON.stringify(current) },
  });
  return current;
}

/** نمای کامل شعب برای UI — رجیستری + نقشهٔ مالک */
export async function branchesOverview(): Promise<{
  registry: string[];
  ownerMap: Record<string, string>;
}> {
  const ownerMap = await readOwnerBranchMap();
  return { registry: [...TABRIZ_BRANCHES], ownerMap };
}
