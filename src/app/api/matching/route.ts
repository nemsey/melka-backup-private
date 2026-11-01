/**
 * GET /api/matching — P6545/گام۲ BLOCK 2.1 → PN-014 ارتقای هوشمند → PN-028 درس‌های رد
 * ---------------------------------------------------------------------------
 * تطبیق دوجهتهٔ هوشمند ملکا:
 *   ?listingCode=کدملک  → درخواست‌های برتر (تب ۱)
 *   ?requestId=شناسه    → آگهی‌های برتر (تب ۲)
 * هر نتیجه: امتیاز + دلیل (۹ عامل نرم) + یادداشت فیلترهای سخت + پوشش سیگنال.
 *
 * PN-014 (دستور مالک — هم‌ارزی با کاشی فایل‌یابی):
 *   · topN=۲۰ — تا بندبندی سه‌گانهٔ «شکار/پیگیری/بررسی» معنا پیدا کند
 *   · هر کاندیدا غنی‌شده: بند + تحلیل هوشمند امتیازدهی + پیش‌بینی هوشمند
 *     دلایل احتمالی رد + پیشنهاد تصمیم + ابعاد چندوجهی (PN-028/رابعاً-د)
 *
 * PN-011 خامسا-۱: هر گزینه کارشناس و شعبهٔ سطر مقابل را با همان زنجیرهٔ M1/M2 همراه می‌کند.
 * PN-011 خامسا-۲: وزن‌های عوامل از حلقهٔ یادگیری بازخورد پذیرش/رد خوانده می‌شود.
 * PN-028/رابعاً-ج: جفت‌های ردشده حذف می‌شوند و دلایل رد در وزن‌ها لحاظ می‌گردند.
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import {
  MatchingEngine,
  computeLearnedMatchWeights,
  applyRejectionLessonBoosts,
  BASE_MATCH_WEIGHTS,
  type MatchContext,
} from "@/core/matching";
import { loadRejectionLessons } from "@/core/matching/rejection-store";
import { enrichMatchResult } from "@/core/matching/match-analysis";

/** P6545 — db تنبل (الگوی P2-03: روت‌ها هرگز import مستقیم @/lib/db ندارند) */
async function getDb() {
  const mod = (await import("@/lib/db")) as { db: import("@prisma/client").PrismaClient };
  return mod.db;
}

/** سقف خروجی کاشی جدید — برای بندبندی سه‌گانه */
const TOPN_FOR_TILE = 20;

/**
 * PN-011 خامسا-۱ — زمینهٔ تفکیک شعبه: همان زنجیرهٔ روت‌های M1/M2 (کد مشترک، نه کپی).
 * بهترین-تلاش: اگر نقشه‌ها خوانده نشوند، شعبه «تعیین نشده» می‌ماند و تطبیق ادامه می‌یابد.
 */
async function buildMatchContext(db: import("@prisma/client").PrismaClient): Promise<MatchContext> {
  const { resolveExpertBranch, BRANCH_UNSET } = await import("@/lib/branches");
  const { readOwnerBranchMap, readPmBranchMap } = await import("@/lib/branch-store");
  const { getExpertRepository } = await import("@/core/repositories");
  const [ownerMap, experts, pmBranchMap] = await Promise.all([
    readOwnerBranchMap().catch(() => ({}) as Record<string, string>),
    getExpertRepository()
      .findAll()
      .catch(() => [] as Array<{ fullName: string; businessTitle: string | null }>),
    readPmBranchMap().catch(() => ({}) as Record<string, string>),
  ]);
  const businessByExpert = new Map<string, string | null>();
  for (const e of experts) businessByExpert.set(e.fullName, e.businessTitle);
  return {
    branchOf: (expertName: string): string =>
      resolveExpertBranch(expertName, ownerMap, businessByExpert.get(expertName) ?? null, pmBranchMap).branch ?? BRANCH_UNSET,
  };
}

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const db = await getDb();
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);
  try {
    const url = new URL(request.url);
    const listingCode = url.searchParams.get("listingCode");
    const requestId = url.searchParams.get("requestId");
    if (!listingCode && !requestId) {
      return Response.json({ ok: false, message: "listingCode یا requestId الزامی است" }, { status: 400 });
    }

    // PN-011 خامسا-۲ — وزن‌های آموخته از بازخوردهای پذیرش/رد (بدون داده = پایه)
    const learned = await computeLearnedMatchWeights(db).catch(() => null);

    // ═══ PN-028/رابعاً-ج — درس‌های رد: جفت‌های ردشده + تقویت وزن از دلایل رد ═══
    const lessons = await loadRejectionLessons(db);
    const effectiveWeights = applyRejectionLessonBoosts(learned ? learned.weights : BASE_MATCH_WEIGHTS, lessons.reasonCounts);

    const engine = new MatchingEngine({
      db,
      tier: 3,
      weights: effectiveWeights,
      topN: TOPN_FOR_TILE,
      rejectedPairs: lessons.rejectedPairs,
    });

    // PN-011 خامسا-۱ — زمینهٔ شعبه (همان زنجیرهٔ M1/M2)
    const ctx = await buildMatchContext(db);

    const result = listingCode
      ? await engine.matchListingToRequests(listingCode, ctx)
      : await engine.matchRequestToListings(requestId!, ctx);
    result.weightsSource = learned ? "learned" : "base";
    result.weightsFeedbackCount = learned?.feedbackCount ?? 0;

    // PN-014 — غنی‌سازی هوشمند (سرور): بند + تحلیل + پیش‌بینی رد + پیشنهاد تصمیم + خلاصه
    // (+ PN-028/رابعاً-د: ابعاد چندوجهی پنج‌گانه)
    const { candidates, summary } = enrichMatchResult(result);
    return Response.json({
      ok: true,
      result: { ...result, candidates },
      summary,
      lessons: {
        rejectedPairsExcluded: lessons.rejectedPairs.size,
        reasonCounts: lessons.reasonCounts,
        note: "جفت‌های ردشده حذف شدند و دلایل رد در وزن‌های این پیشنهاد لحاظ شده‌اند (PN-028).",
      },
      constraint: "پیشنهاد فقط — تصمیم و اجرا با مالک",
    });
  } catch (e) {
    return Response.json({ ok: false, message: (e as Error).message }, { status: 500 });
  }
}
