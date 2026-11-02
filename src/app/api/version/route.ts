import { NextResponse } from "next/server";
import { getBuildWitness } from "@/lib/build-witness";
import { servedFingerprint } from "@/lib/version-fingerprint";

/**
 * GET /api/version — شاهد زندهٔ نسخه (P6519 / BLOCK B شورا + ن۰۰۷ BLOCK 1)
 * ---------------------------------------------------------------------------
 * بدون احراز هویت و بدون کش (no-store) — مالک/GLM/گارد تازگی با یک curl
 * می‌فهمند دقیقاً کدام بیلد روی این لینک سرو می‌شود:
 *   { buildId, builtAt, gitSha, env, source, runtime, serverTime }
 *
 * ═══ فاز ۰.۵ (ن۰۰۷ BLOCK 1) — اثر انگشت کامل نسخه ═══
 * کلید جدید «fingerprint» (بدون تغییر کلیدهای قبلی — قرارداد پایدار):
 *   هویت کامل: گیت + runtime + بیلد + env + lockfile + DB
 *   source: "baked" = از .next/fingerprint.json (زمان بیلد نوشته شده)
 *           "api-live" = محاسبهٔ زنده (dev یا نبود فایل — صادقانه)
 *
 * قرارداد پایدار — گارد scripts/verify-deploy-freshness.sh به کلیدهای
 * قدیمی متکی است؛ تغییر نام کلیدهای قبلی تغییر قرارداد است و باید در
 * AGENTS.md ثبت شود. کلید fingerprint جدید است و حذف/تغییرش قراردادِ ن۰۰۷ است.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const w = getBuildWitness();
  const { fingerprint, source: fingerprintSource } = servedFingerprint();
  return NextResponse.json(
    {
      buildId: w.buildId,
      builtAt: w.builtAt,
      gitSha: w.gitSha,
      env: w.env,
      source: w.source,
      runtime: "nodejs",
      serverTime: new Date().toISOString(),
      fingerprint,
      fingerprintSource,
    },
    { headers: { "Cache-Control": "no-store, must-revalidate" }, },
  );
}
