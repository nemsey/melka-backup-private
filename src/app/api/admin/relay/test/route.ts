/**
 * POST /api/admin/relay/test — PN-031 (شورا-ن۰۳۷)
 * ---------------------------------------------------------------------------
 * تست تونل رله — دروازهٔ پایانی (پیش‌شرط برداشتن پرچم آفلینی):
 * درخواست بی‌خطر GET / به ریشهٔ ARM را از مسیر رله می‌فرستد و منتظر
 * نتیجه می‌ماند؛ پاسخ سبز یعنی گوشی مالک با IP ایرانی زنجیره را کامل کرده.
 *
 * ⚠ بازسازی PN-031-B (شورا-ن۰۳۹): فایل اصلی در بازنشانی هشتم پلتفرم از
 * دیسک حذف شد و هرگز وارد گیت نشده بود (درس: هر روت بلافاصله کامیت شود).
 * این بازسازی از قرارداد پایدار UI (TestResult) + سرویس موجود runRelayGateTest
 * انجام شده — همان شناسه‌ها، همان احراز OWNER، همان قرارداد پاسخ.
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { runRelayGateTest } from "@/lib/melk-api/relay";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const guard = await requireRole(request, "OWNER", "/api/admin/relay/test");
  if (guard instanceof MelkApiError) return errorResponse(guard);

  try {
    const r = await runRelayGateTest();
    const verdict: "PASS" | "FAIL" = r.ok ? "PASS" : "FAIL";
    let interpretation: string;
    if (r.ok) {
      interpretation = `تونل رله زنده است — پاسخ ${r.httpStatus ?? "?"} در ${r.roundtripMs} میلی‌ثانیه؛ گوشی مالک با IP ایرانی درخواست را به مقصد رساند.`;
    } else if (r.error?.includes("برخط نیست")) {
      interpretation = "دستگاه رله برخط نیست — اسکریپت روی گوشی اجرا نشده یا متوقف شده است.";
    } else {
      interpretation = `تونل برقرار نشد${r.error ? ` — ${r.error}` : ""}`;
    }
    return Response.json(
      {
        ok: r.ok,
        verdict,
        httpStatus: r.httpStatus ?? null,
        roundtripMs: r.roundtripMs,
        error: r.error ?? null,
        interpretation,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    return errorResponse(new MelkApiError("UNKNOWN", `خطای غیرمنتظره در تست تونل: ${(err as Error).message}`, 500, false));
  }
}
