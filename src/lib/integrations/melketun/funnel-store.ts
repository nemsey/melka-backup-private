/**
 * Melketun Funnel Store — PN-047/گام اول-۲ (M9 معاملات ملکتون)
 * ---------------------------------------------------------------------------
 * خواندن قیف فروش ذخیره‌شدهٔ CRM ملکتون از RefListCache (کلید «melketun-funnel» —
 * نوشته‌شده در هر sync · Worker ۶-ساعته). الگوی انبارهای کلید-مقدار موجود:
 * branches.ts (expert-branch-map) + relay cache.
 *
 * مرز مخزن (PN-012/بند ۱.۳): صفر db.* در روت — همهٔ دسترسی DB از همین lib.
 * Doctrine: no LLM · read-only · دادهٔ تجمیعی بدون نام/موبایل.
 */

import { db } from "@/lib/db";

const FUNNEL_CACHE_KEY = "melketun-funnel";

/** برچسب فارسی مراحل قیف CRM ملکتون (عین کلیدهای Laravel) */
const STAGE_FA: Record<string, string> = {
  empty: "خالی",
  newFiles: "پروندهٔ جدید",
  firstCall: "اولین تماس",
  consulting: "مشاوره",
  NeedsAssessment: "نیازسنجی",
  FileSuggested: "معرفی فایل",
  visit: "بازدید",
  negotiation: "مذاکره",
  agreement: "توافق",
  contract: "قرارداد",
  win: "معامله موفق",
  loose: "از دست رفته",
  stopped: "متوقف‌شده",
};
/** ترتیب نمایشی مراحل (خط لوله از بالا به پایین) */
const STAGE_ORDER = [
  "empty", "newFiles", "firstCall", "consulting", "NeedsAssessment",
  "FileSuggested", "visit", "negotiation", "agreement", "contract", "win", "loose", "stopped",
];

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
}
export interface FunnelDecorated {
  stages: FunnelStage[];
  unknown: FunnelStage[];
  total: number;
}
export interface MelketunFunnelView {
  ok: true;
  available: boolean;
  note: string;
  filings: FunnelDecorated | null;
  potentials: FunnelDecorated | null;
  branchesSeen: string[];
  fetchedAt: string | null;
}

/** خام CRM → مراحل برچسب‌خوردهٔ فارسی + مراحل ناشناخته + جمع */
function decorate(raw: Record<string, unknown> | null | undefined): FunnelDecorated | null {
  if (!raw) return null;
  const stages = STAGE_ORDER
    .filter((k) => typeof raw[k] === "number")
    .map((k) => ({ key: k, label: STAGE_FA[k] ?? k, count: Number(raw[k]) }));
  const known = stages.reduce((s, st) => s + st.count, 0);
  const unknown = Object.entries(raw)
    .filter(([k]) => !STAGE_ORDER.includes(k) && typeof raw[k] === "number")
    .map(([k, v]) => ({ key: k, label: k, count: Number(v) }));
  return { stages, unknown, total: known + unknown.reduce((s, u) => s + u.count, 0) };
}

/** نمای کامل قیف ملکتون — بدون داده = available:false با یادداشت صادقانه */
export async function readMelketunFunnel(): Promise<MelketunFunnelView> {
  const row = await db.refListCache.findUnique({ where: { key: FUNNEL_CACHE_KEY } }).catch(() => null);
  if (!row) {
    return {
      ok: true,
      available: false,
      note: "قیف فروش هنوز همگام‌سازی نشده — نخستین Worker ۶-ساعته یا دکمهٔ همگام‌سازی آن را پر می‌کند.",
      filings: null,
      potentials: null,
      branchesSeen: [],
      fetchedAt: null,
    };
  }
  try {
    const parsed = JSON.parse(row.dataJson) as {
      filingsFunnel?: Record<string, unknown> | null;
      potentialsFunnel?: Record<string, unknown> | null;
      fetchedAt?: string;
      branchesSeen?: string[];
    };
    return {
      ok: true,
      available: true,
      note: "CRM ملکتون ماژول مستقل معاملات ندارد؛ این خط لولهٔ فروش واقعی هر دو ماژول (آگهی + درخواست) است — مراحل قرارداد/معاملهٔ موفق فعلاً صفرند (صادقانه).",
      filings: decorate(parsed.filingsFunnel),
      potentials: decorate(parsed.potentialsFunnel),
      branchesSeen: parsed.branchesSeen ?? [],
      fetchedAt: parsed.fetchedAt ?? null,
    };
  } catch {
    return {
      ok: true,
      available: false,
      note: "دادهٔ قیف ذخیره‌شده خراب است — همگام‌سازی بعدی آن را ترمیم می‌کند.",
      filings: null,
      potentials: null,
      branchesSeen: [],
      fetchedAt: null,
    };
  }
}
