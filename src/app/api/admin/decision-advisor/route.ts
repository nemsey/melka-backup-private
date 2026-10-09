/**
 * GET /api/admin/decision-advisor — PN-025/ستون ۳ (موتور ۱۶: مشاور تصمیم)
 * ---------------------------------------------------------------------------
 * پارامترهای پرس‌وجو:
 *   kind   = property | request | person | market (الزامی)
 *   id     = کد ملک / کد درخواست / نام شخص (الزامی)
 *   label  = برچسب نمایشی (اختیاری)
 *   counterpart = شناسهٔ مقابل برای بینایی (اختیاری)
 * خروجی: DecisionAdvice کامل یا { locked: true, reason, message } (کمربند).
 * OWNER-only — صفر LLM · صفر auto_execute (قفل نوع TypeScript).
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { advise } from "@/lib/services/decision-advisor-service";

export async function GET(request: NextRequest) {
  const guard = await requireRole(request, "OWNER", "/api/admin/decision-advisor");
  if (guard instanceof MelkApiError) return errorResponse(guard);
  try {
    const url = new URL(request.url);
    const kind = url.searchParams.get("kind");
    const id = url.searchParams.get("id");
    if (!kind || !id || !["property", "request", "person", "market"].includes(kind)) {
      return errorResponse(new MelkApiError("UNPROCESSABLE", "پارامترهای kind و id الزامی‌اند (property|request|person|market).", 400, true));
    }
    const result = await advise({
      kind: kind as "property" | "request" | "person" | "market",
      id,
      label: url.searchParams.get("label") ?? undefined,
      counterpartId: url.searchParams.get("counterpart") ?? undefined,
    });
    return Response.json({ ok: true, pillar: "advisor", advice: result }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در ساخت مشورهٔ تصمیم.", 500, false));
  }
}
