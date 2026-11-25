/**
 * sync-stage.ts — DIR-SUPER-STRUCT-001 · بخش الف · گام ۱/۲/۳
 * ---------------------------------------------------------------------------
 * «برچسب‌گذاری اتمی» (Atomic State Tagging) — دستور مالک:
 *   دیتابیس ملکا برای هر رکورد یک فیلد وضعیت نگه می‌دارد (P0_DONE · P1_DONE ·
 *   ALL_DONE) تا اگر سرور در میانهٔ کار ریست شد، دقیقاً معلوم باشد هر رکورد
 *   در کدام مرحله مانده و از صفر بازخوانی لازم نباشد.
 *
 * دامنهٔ معنایی (هم‌خوان با فازهای LCPP که از PN-051 همین زبان را می‌دانند):
 *   · P0_DONE  — لایهٔ حیاتی نوشته شده (فاز A فهرست: مالک/کارشناس · آدرس ·
 *                قیمت/وضعیت از خود ردیف فهرست) — عین «فاز A (Fast-Pass) …
 *                ستون‌های P0 از خود ردیف فهرست» در arm-listings.ts
 *   · P1_DONE — لایهٔ غنی‌سازی نوشته شده ولی لایهٔ حیاتی ناقص (حالت تعمیری؛
 *                رکورد از مسیر دیگری غنی شده و هنوز فهرست‌محور نشده)
 *   · ALL_DONE— هر دو لایه (فاز B غنی‌سازی + فاز A حیاتی) تیک خورده
 *   · NULL    — قدیمی/بی‌برچسب (پیش از این دستور) — برای انتخاب غنی‌سازی
 *                همان P0 فرض می‌شود (سلوک عقبه — هیچ رکوردی قفل نمی‌شود)
 *
 * «تیربندی آبشاری» (Waterfall Tiering) — دستور مالک: لایهٔ غنی‌سازی (P1)
 * شروع نمی‌شود مگر لایهٔ حیاتی (P0) تیک خورده باشد:
 *   · در سطح رکورد: candidates غنی‌سازی فقط رکوردهای P0_DONE/NULL هستند —
 *     P1_DONE هرگز انتخاب نمی‌شود (بند waterfallPendingP0 و فیلتر deepPass).
 *   · در سطح چرخه: در runOneList اگر فاز A خطا خورد فاز B اجرا نمی‌شود
 *     (sync/lists/index.ts — گیت آبشاری درون‌چرخه‌ای).
 *
 * قوانین:
 *   · برچسب فقط «صعودی» پیش می‌رود — SQL نگه‌دارنده در kernel.ts اجازهٔ
 *     تنزل (ALL_DONE → P0_DONE) را ساختاراً نمی‌دهد (عین قانون ۰۴).
 *   · additive-only: ستون تازه + پوشش خواندنی؛ هیچ DELETE/REPLACE.
 */

import type { PrismaClient } from "@prisma/client";

/* ═══════════════════════════ مقادیر و رتبه‌بندی ═══════════════════════════ */

export const SYNC_STAGES = ["P0_DONE", "P1_DONE", "ALL_DONE"] as const;
export type SyncStage = (typeof SYNC_STAGES)[number];

/** رتبهٔ صعودی برچسب — پایهٔ نگه‌دارندهٔ تک‌جهتی SQL و منطق خالص */
export const STAGE_RANK: Record<string, number> = {
  "": 0,
  P0_DONE: 1,
  P1_DONE: 2,
  ALL_DONE: 3,
};

/** رتبهٔ امن هر مقدار (NULL/ناشناخته = ۰) */
export function stageRank(v: unknown): number {
  return STAGE_RANK[String(v ?? "")] ?? 0;
}

/** برچسب پیام فارسی برای UI/گزارش‌ها */
export const STAGE_FA: Record<string, string> = {
  P0_DONE: "لایهٔ حیاتی کامل (P0)",
  P1_DONE: "غنی‌سازی بدون لایهٔ حیاتی (P1)",
  ALL_DONE: "هر دو لایهٔ کامل (P0+P1)",
};

/**
 * پیش‌برندهٔ خالص برچسب — برچسب ورودی قوی‌تر از موجود را جایگزین می‌کند؛
 * در غیر این صورت مقدار فعلی می‌ماند (هرگز تنزل نمی‌کند). صفرِ ورودی =
 * «ننوشتن» (NULL در SQL CASE نگه‌دارنده).
 */
export function advanceStage(current: unknown, incoming: unknown): string | null {
  const cRank = stageRank(current);
  const iRank = stageRank(incoming);
  if (iRank === 0) return current == null ? null : String(current);
  if (iRank > cRank) return String(incoming);
  return current == null ? null : String(current);
}

/* ═══════════════════════════ نگه‌دارندهٔ SQL (تک‌جهتی) ═══════════════════════════ */

/**
 * قطعهٔ SQL برای SET ستون برچسب در upsert — تک‌جهتی، صعودی، و مصون از NULL:
 *
 *   syncStage = CASE
 *     WHEN excluded.syncStage IS NULL OR excluded.syncStage = '' THEN t.syncStage
 *     WHEN t.syncStage IS NULL OR t.syncStage = '' THEN excluded.syncStage
 *     WHEN (CASE excluded.syncStage WHEN 'ALL_DONE' THEN 3 WHEN 'P1_DONE' THEN 2 ELSE 1 END)
 *        > (CASE t.syncStage       WHEN 'ALL_DONE' THEN 3 WHEN 'P1_DONE' THEN 2 ELSE 1 END)
 *     THEN excluded.syncStage
 *     ELSE t.syncStage END
 *
 * kernel.ts این عبارت را برای spec.stageColumn به‌جای coalesceExpr می‌سازد —
 * برچسب هرگز تنزل نمی‌خورد (حتی وقتی فاز A رکورد ALL_DONE را دوباره می‌نویسد).
 */
export function stageGuardSql(table: string, col = "syncStage"): string {
  const up = (side: string) => `CASE ${side}.${col} WHEN 'ALL_DONE' THEN 3 WHEN 'P1_DONE' THEN 2 ELSE 1 END`;
  return (
    `${col} = CASE ` +
    `WHEN excluded.${col} IS NULL OR excluded.${col} = '' THEN ${table}.${col} ` +
    `WHEN ${table}.${col} IS NULL OR ${table}.${col} = '' THEN excluded.${col} ` +
    `WHEN ${up("excluded")} > ${up(table)} THEN excluded.${col} ` +
    `ELSE ${table}.${col} END`
  );
}

/* ═══════════════════════════ پوشش و گیت آبشاری ═══════════════════════════ */

/** مدل شمارشی فهرست — m1/m2 (برچسب اتمی فقط برای این دو معنا دارد) */
export type StageListModel = "m1" | "m2";

const STAGE_MODEL: Record<StageListModel, { model: "propertyRecord" | "requestRecord"; key: "propertyCode" | "requestCode" }> = {
  m1: { model: "propertyRecord", key: "propertyCode" },
  m2: { model: "requestRecord", key: "requestCode" },
};

export interface StageCoverage {
  /** P0_DONE — حیاتی نوشته، در انتظار غنی‌سازی */
  p0: number;
  /** P1_DONE — غنی‌سازی بدون حیاتی (نیازمند فاز A تعمیری) */
  p1: number;
  /** ALL_DONE — هر دو لایه تیک خورده */
  all: number;
  /** NULL — قدیمی/بی‌برچسب (پیش از این دستور؛ برای غنی‌سازی P0 فرض می‌شود) */
  unmarked: number;
  /** کل رکوردهای فهرست */
  total: number;
  /** درصد پوشش کامل (ALL_DONE نسبت به کل) — ۰..۱۰۰ */
  completePct: number;
}

/** کش پوشش ۶۰ث — عین الگوی کش enrich/checkpoint در four-lists.ts */
const coverageCache = new Map<StageListModel, { at: number; value: StageCoverage }>();
const COVERAGE_CACHE_MS = 60_000;

/** پوشش برچسب اتمی یک فهرست (m1/m2) — گروه‌بندی زنده از DB */
export async function stageCoverage(db: PrismaClient, listId: StageListModel): Promise<StageCoverage> {
  const hit = coverageCache.get(listId);
  if (hit && Date.now() - hit.at < COVERAGE_CACHE_MS) return hit.value;
  const model = db[STAGE_MODEL[listId].model] as unknown as {
    groupBy(args: unknown): Promise<Array<{ _count: { _all: number }; syncStage: string | null }>>;
  };
  const grouped = await model.groupBy({ by: ["syncStage"], _count: { _all: true } });
  const value: StageCoverage = { p0: 0, p1: 0, all: 0, unmarked: 0, total: 0, completePct: 0 };
  for (const g of grouped) {
    const n = g._count?._all ?? 0;
    value.total += n;
    if (g.syncStage === "P0_DONE") value.p0 = n;
    else if (g.syncStage === "P1_DONE") value.p1 = n;
    else if (g.syncStage === "ALL_DONE") value.all = n;
    else value.unmarked = n;
  }
  value.completePct = value.total > 0 ? Math.round((value.all / value.total) * 100) : 0;
  coverageCache.set(listId, { at: Date.now(), value });
  return value;
}

/**
 * گیت آبشاری — چند رکورد «P1 بدون P0» مانده‌اند؟ (باید غنی‌سازی صبر کند تا
 * فاز A همان رکوردها بنشیند). صفر = آبشار آزاد. گیت درون‌چرخه‌ای (فاز B پس
 * از فاز A ناقص) در sync/lists/index.ts اعمال می‌شود؛ این تابع شمارش صادقانه
 * برای UI و گزارش است.
 */
export async function waterfallPendingP0(db: PrismaClient, listId: StageListModel): Promise<number> {
  const model = db[STAGE_MODEL[listId].model] as unknown as {
    count(args: unknown): Promise<number>;
  };
  return model.count({ where: { syncStage: "P1_DONE" } });
}

/** پاک‌سازی کش پوشش (پس از اجرای چرخه — فراخوان از four-lists اختیاری) */
export function invalidateStageCoverage(listId?: StageListModel): void {
  if (listId) coverageCache.delete(listId);
  else coverageCache.clear();
}
