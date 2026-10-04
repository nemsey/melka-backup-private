import { NextResponse } from "next/server";
import { getBuildWitness } from "@/lib/build-witness";

/**
 * GET /api/version — شاهد زندهٔ نسخه (P6519 / BLOCK B شورا)
 * ---------------------------------------------------------------------------
 * بدون احراز هویت و بدون کش (no-store) — مالک/GLM/گارد تازگی با یک curl
 * می‌فهمند دقیقاً کدام بیلد روی این لینک سرو می‌شود:
 *   { buildId, builtAt, gitSha, env, source, runtime, serverTime }
 *
 * قرارداد پایدار — گارد scripts/verify-deploy-freshness.sh به این کلیدها
 * متکی است؛ تغییر نام کلیدها تغییر قرارداد است و باید در AGENTS.md ثبت شود.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const w = getBuildWitness();
  return NextResponse.json(
    {
      buildId: w.buildId,
      builtAt: w.builtAt,
      gitSha: w.gitSha,
      env: w.env,
      source: w.source,
      runtime: "nodejs",
      serverTime: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store, must-revalidate" } },
  );
}
