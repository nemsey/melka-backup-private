/**
 * GET /api/admin/relay/code-status — PN-031-C (شورا-ن۰۴۰ · کار ۴)
 * ---------------------------------------------------------------------------
 * وضعیت کد راه‌اندازی بخشنده برای مالک (OWNER): بدون راز، فقط شمارنده و زمان.
 * پارامتر اختیاری deviceId — بدون پارامتر، تازه‌ترین دستگاه صاحب کد را نشان می‌دهد.
 * روت سبک (قانون مرز مخزن P2): تمام دسترسی DB در لایهٔ سرویس relay.ts است.
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { getRelayCodeStatus } from "@/lib/melk-api/relay";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATE_MESSAGES: Record<string, string> = {
  waiting: "کد صادر شده — منتظر نخستین تلاش نصب است.",
  installing: "در حال نصب — اسکریپت دانلود شده اما گوشی هنوز به سرور وصل نشده؛ همان کد برای تلاش بعدی هم کار می‌کند.",
  enrolled: "نصب کامل شده — گوشی با موفقیت وصل شده و کد به‌طور نهایی مصرف شد. این حالت طبیعی و مطلوب است.",
  "burned-limit": "کد سوخته — سقف ۳ تلاش دانلود پر شده؛ دستگاه تازه ثبت کنید.",
  "burned-used": "کد سوخته — نصب قبلاً کامل شده است.",
  expired: "کد منقضی — پنجرهٔ ۳۰ دقیقه گذشته؛ دستگاه تازه ثبت کنید.",
  revoked: "دستگاه ابطال شده — برای راه‌اندازی مجدد، دستگاه تازه ثبت کنید.",
  absent: "کدی روی این دستگاه فعال نیست.",
};

export async function GET(request: NextRequest) {
  const guard = await requireRole(request, "OWNER", "/api/admin/relay/code-status");
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const deviceId = request.nextUrl.searchParams.get("deviceId")?.trim() ?? "";
  const status = await getRelayCodeStatus(deviceId || undefined);

  if (!status.found) {
    return Response.json(
      { ok: true, found: false, code: null, message: "هیچ دستگاه صاحب کد فعال یافت نشد — از دکمهٔ راه‌اندازی رله یک دستگاه ثبت کنید." },
      { headers: { "cache-control": "no-store" } }
    );
  }

  const state = status.code!.state;
  return Response.json(
    {
      ok: true,
      found: true,
      deviceId: status.deviceId,
      label: status.label,
      code: status.code,
      message: STATE_MESSAGES[state] ?? "",
    },
    { headers: { "cache-control": "no-store" } }
  );
}
