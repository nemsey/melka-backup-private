/**
 * GET /api/admin/relay/browser-poll — PN-031 (شورا-ن۰۳۷ · رویکرد B)
 * ---------------------------------------------------------------------------
 * پشتیبان مرورگری: همان چرخهٔ رله ولی داخل PWA (Chrome گوشی) و با احراز
 * نشست OWNER — بدون راز در مرورگر. فقط وقتی همین صفحه باز است فعال می‌ماند.
 *
 * محدودیت صادقانه: خواندن پاسخ از ملک تبریز در مرورگر تابع CORS است؛ اگر
 * سامانه ملک تبریز هدر CORS ندهد، این پشتیبان پاسخ را نمی‌خواند و خطای
 * روشن برمی‌گرداند (Termux همچنان مسیر اصلی است).
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { claimNextRelayRequest, touchRelayDevice } from "@/lib/melk-api/relay";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const guard = await requireRole(request, "OWNER", "/api/admin/relay/browser-poll");
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const waitMs = Math.min(Math.max(Number(request.nextUrl.searchParams.get("wait") ?? 12) || 12, 0), 25) * 1000;
  // حضور دستگاه مجازی مرورگر — تا anyRelayDeviceOnline او را ببیند
  await touchRelayDevice("browser-owner", "مرورگر مالک (پشتیبان)");
  const deadline = Date.now() + waitMs;
  while (true) {
    const item = await claimNextRelayRequest("browser-owner");
    if (item) {
      return Response.json(
        {
          ok: true,
          request: { id: item.id, method: item.method, url: item.url, headers: item.headers, body: item.body ?? "" },
        },
        { headers: { "cache-control": "no-store" } }
      );
    }
    if (Date.now() >= deadline) return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
    await new Promise((r) => setTimeout(r, 700));
  }
}
