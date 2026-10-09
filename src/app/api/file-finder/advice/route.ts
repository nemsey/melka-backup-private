/**
 * GET /api/file-finder/advice — PN-025/ستون ۳ (موتور ۱۶ روی کاشی فایل‌یابی)
 * ---------------------------------------------------------------------------
 * «این فایل را با متقاضیان هم‌منطقه مطابقت بده — با امتیاز علّی» — مشورهٔ تصمیم
 * برای یک فایل دیوار: ?token=…&area=… (نام منطقهٔ تطبیق‌یافتهٔ فایل).
 * شاهد MATCH واقعی: شمار متقاضیان هم‌منطقه از درخواست‌های زندهٔ DB.
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
    const token = url.searchParams.get("token");
    if (!token) {
      return errorResponse(new MelkApiError("UNPROCESSABLE", "پارامتر token الزامی است.", 400, true));
    }
    const area = url.searchParams.get("area") ?? "";

    // شمار متقاضیان هم‌منطقه — از درخواست‌های زنده (شاهد MATCH_INFORM واقعی)
    let areaDemand: { area: string; requestCount: number } | null = null;
    if (area.length >= 2) {
      const { db } = await import("@/lib/db");
      const rows = await db.requestRecord.findMany({
        where: { areaNamesJson: { contains: `"${area}"` } },
        select: { requestCode: true },
        take: 50,
      }).catch(() => [] as Array<{ requestCode: string }>);
      areaDemand = { area, requestCount: rows.length };
    }

    const result = await advise({
      kind: "property",
      id: `DIVAR:${token}`,
      label: `فایل دیوار ${area ? `(${area})` : ""}`.trim(),
      areaDemand,
    });

    return Response.json(
      { ok: true, tile: "file-finder", advice: result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در ساخت مشورهٔ فایل‌یابی.", 500, false));
  }
}
