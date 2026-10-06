/**
 * /api/matching — GET (P6545/گام۲ BLOCK 2.1)
 * تطبیق دوجهتهٔ هوشمند ملکا:
 *   ?listingCode=کدملک  → ۵ درخواست برتر (تب ۱)
 *   ?requestId=شناسه    → ۵ آگهی برتر (تب ۲)
 * هر نتیجه: امتیاز + دلیل (۵ عامل نرم) + یادداشت فیلترهای سخت + پوشش سیگنال.
 */
import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { MatchingEngine } from "@/core/matching";

/** P6545 — db تنبل (الگوی P2-03: روت‌ها هرگز import مستقیم @/lib/db ندارند) */
async function getDb() {
  const mod = (await import("@/lib/db")) as { db: import("@prisma/client").PrismaClient };
  return mod.db;
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
    const engine = new MatchingEngine({ db, tier: 3 });
    const result = listingCode
      ? await engine.matchListingToRequests(listingCode)
      : await engine.matchRequestToListings(requestId!);
    return Response.json({ ok: true, result, constraint: "پیشنهاد فقط — تصمیم و اجرا با مالک" });
  } catch (e) {
    return Response.json({ ok: false, message: (e as Error).message }, { status: 500 });
  }
}
