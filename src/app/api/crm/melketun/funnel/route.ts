/**
 * /api/crm/melketun/funnel — PN-047/گام اول-۲ (M9 معاملات ملکتون)
 * ---------------------------------------------------------------------------
 * GET — قیف فروش واقعی CRM ملکتون (فیلینگ + پتانسیل) برای بینش M9.
 * CRM ملکتون ماژول مستقل «معاملات» ندارد (کشف PN-044 + تأیید PN-047: قیف هم
 * رکوردی در مراحل contract/win ندارد) — بینش صادقانه: خط لولهٔ فروش واقعی.
 * داده: RefListCache کلید «melketun-funnel» — نوشته‌شده در هر sync (Worker ۶س).
 * دسترسی: نشست فعال (قانون ۱۲) — بدون نقش خاص؛ دادهٔ تجمیعی بدون نام/موبایل.
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";

export const dynamic = "force-dynamic";

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

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  try {
    const row = await db.refListCache.findUnique({ where: { key: FUNNEL_CACHE_KEY } });
    if (!row) {
      return Response.json({
        ok: true,
        available: false,
        note: "قیف فروش هنوز همگام‌سازی نشده — نخستین Worker ۶-ساعته یا دکمهٔ همگام‌سازی آن را پر می‌کند.",
        filings: null,
        potentials: null,
        branchesSeen: [],
        fetchedAt: null,
      });
    }
    const parsed = JSON.parse(row.dataJson) as {
      filingsFunnel?: Record<string, unknown> | null;
      potentialsFunnel?: Record<string, unknown> | null;
      fetchedAt?: string;
      branchesSeen?: string[];
    };
    const decorate = (raw: Record<string, unknown> | null | undefined) => {
      if (!raw) return null;
      const stages = STAGE_ORDER
        .filter((k) => typeof raw[k] === "number")
        .map((k) => ({ key: k, label: STAGE_FA[k] ?? k, count: Number(raw[k]) }));
      const known = stages.reduce((s, st) => s + st.count, 0);
      const unknown = Object.entries(raw)
        .filter(([k]) => !STAGE_ORDER.includes(k) && typeof raw[k] === "number")
        .map(([k, v]) => ({ key: k, label: k, count: Number(v) }));
      return { stages, unknown, total: known + unknown.reduce((s, u) => s + u.count, 0) };
    };
    return Response.json({
      ok: true,
      available: true,
      filings: decorate(parsed.filingsFunnel),
      potentials: decorate(parsed.potentialsFunnel),
      branchesSeen: parsed.branchesSeen ?? [],
      fetchedAt: parsed.fetchedAt ?? null,
      note: "CRM ملکتون ماژول مستقل معاملات ندارد؛ این خط لولهٔ فروش واقعی هر دو ماژول (آگهی + درخواست) است — مراحل قرارداد/معاملهٔ موفق فعلاً صفرند (صادقانه).",
    });
  } catch (e) {
    return Response.json(
      { ok: false, error: e instanceof Error ? e.message.slice(0, 120) : "خطای ناشناخته" },
      { status: 500 }
    );
  }
}
