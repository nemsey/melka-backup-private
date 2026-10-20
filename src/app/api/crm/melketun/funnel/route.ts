/**
 * /api/crm/melketun/funnel — PN-047/گام اول-۲ (M9 معاملات ملکتون)
 * ---------------------------------------------------------------------------
 * GET — قیف فروش واقعی CRM ملکتون (فیلینگ + پتانسیل) برای بینش M9.
 * CRM ملکتون ماژول مستقل «معاملات» ندارد (کشف PN-044 + تأیید PN-047: قیف هم
 * رکوردی در مراحل contract/win ندارد) — بینش صادقانه: خط لولهٔ فروش واقعی.
 * داده: RefListCache کلید «melketun-funnel» — نوشته‌شده در هر sync (Worker ۶س).
 * دسترسی: نشست فعال (قانون ۱۲) — بدون نقش خاص؛ دادهٔ تجمیعی بدون نام/موبایل.
 * مرز مخزن (PN-012/۱.۳): صفر db.* در روت — خواندن از funnel-store (lib).
 */

import { NextRequest } from "next/server";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";
import { readMelketunFunnel } from "@/lib/integrations/melketun/funnel-store";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  try {
    const view = await readMelketunFunnel();
    return Response.json(view, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return errorResponse(
      new MelkApiError("UNKNOWN", (e as Error)?.message ?? "خطای خواندن قیف فروش ملکتون", 500, false)
    );
  }
}
