/**
 * GET /api/smart-matching/advice — PN-025/ستون ۳ (موتور ۱۶ روی کاشی M5 تطبیق)
 * ---------------------------------------------------------------------------
 * «این آگهی را به این ۳ خریدار پیشنهاد بده — با دلیل» — مشورهٔ تصمیم برای
 * جفتِ تطبیق منتخب: ?listingCode=…&requestId=…
 * نیازمند نشست معتبر (همان گارد سایر روت‌های کاشی).
 * خروجی: DecisionAdvice یا { locked, message } — صفر LLM · صفر auto_execute.
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { advise } from "@/lib/services/decision-advisor-service";

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);
  try {
    const url = new URL(request.url);
    const listingCode = url.searchParams.get("listingCode");
    const requestId = url.searchParams.get("requestId");
    if (!listingCode && !requestId) {
      return errorResponse(new MelkApiError("UNPROCESSABLE", "یکی از پارامترهای listingCode یا requestId الزامی است.", 400, true));
    }

    // بینایی طرف‌به‌طرف: ملک ↔ درخواست (مسیرهای ارتباطی برای MATCH_INFORM)
    const result = await advise({
      kind: listingCode ? "property" : "request",
      id: listingCode ?? requestId!,
      label: listingCode ? `آگهی ${listingCode}` : `درخواست ${requestId}`,
      counterpartId: listingCode && requestId ? requestId : undefined,
    });

    return Response.json(
      { ok: true, tile: "M5-smart-matching", advice: result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در ساخت مشورهٔ تطبیق.", 500, false));
  }
}
