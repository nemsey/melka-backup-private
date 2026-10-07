/**
 * /api/matching — GET (P6545/گام۲ BLOCK 2.1)
 * تطبیق دوجهتهٔ هوشمند ملکا:
 *   ?listingCode=کدملک  → ۵ درخواست برتر (تب ۱)
 *   ?requestId=شناسه    → ۵ آگهی برتر (تب ۲)
 * هر نتیجه: امتیاز + دلیل (۵ عامل نرم) + یادداشت فیلترهای سخت + پوشش سیگنال.
 *
 * PN-011 خامسا-۱ (دستور مالک): هر گزینهٔ تطبیق کارشناس و شعبهٔ سطر مقابل را با
 * «همان زنجیرهٔ تفکیک شعبهٔ فهرست‌های M1/M2» (PM ← نقشهٔ مالک ← کسب‌وکار) همراه می‌کند.
 * PN-011 خامسا-۲ (دستور مالک): وزن‌های عوامل از حلقهٔ یادگیری بازخورد پذیرش/رد
 * خوانده می‌شود (weightsSource=learned) — در نبود داده کافی، وزن پایه صادقانه.
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { MatchingEngine, computeLearnedMatchWeights, type MatchContext } from "@/core/matching";

/** P6545 — db تنبل (الگوی P2-03: روت‌ها هرگز import مستقیم @/lib/db ندارند) */
async function getDb() {
  const mod = (await import("@/lib/db")) as { db: import("@prisma/client").PrismaClient };
  return mod.db;
}

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
    const engine = new MatchingEngine({
      db,
      tier: 3,
      weights: learned ? learned.weights : undefined,
    });

    // PN-011 خامسا-۱ — زمینهٔ شعبه (همان زنجیرهٔ M1/M2)
    const ctx = await buildMatchContext(db);

    const result = listingCode
      ? await engine.matchListingToRequests(listingCode, ctx)
      : await engine.matchRequestToListings(requestId!, ctx);
    result.weightsSource = learned ? "learned" : "base";
    result.weightsFeedbackCount = learned?.feedbackCount ?? 0;
    return Response.json({ ok: true, result, constraint: "پیشنهاد فقط — تصمیم و اجرا با مالک" });
  } catch (e) {
    return Response.json({ ok: false, message: (e as Error).message }, { status: 500 });
  }
}
