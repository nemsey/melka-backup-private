/**
 * GET /api/market-index/advice — PN-025/ستون ۳ (موتور ۱۶ روی کاشی M7 شاخص)
 * ---------------------------------------------------------------------------
 * «فردا قیمت منطقهٔ X درصد تغییر دارد — چون …» — هشدار تصمیم بازار برای
 * منطقهٔ منتخب: ?area=…
 * نیازمند نشست معتبر. خروجی: DecisionAdvice یا { locked, message }.
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
    const area = url.searchParams.get("area");
    if (!area) {
      return errorResponse(new MelkApiError("UNPROCESSABLE", "پارامتر area الزامی است.", 400, true));
    }

    // بستر بازار — شناسه = نام منطقه؛ مشاور روند شاخص را می‌خواند
    const result = await advise({
      kind: "market",
      id: `MARKET:${area}`,
      label: `منطقهٔ ${area}`,
    });

    return Response.json(
      { ok: true, tile: "M7-market-index", advice: result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در ساخت هشدار تصمیم بازار.", 500, false));
  }
}
