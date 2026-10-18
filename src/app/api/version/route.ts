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
 *
 * ═══ PN-040 (گام ۴ · بند ۴.۴ — جلسهٔ ۰۶۶) — پایش مغایرت HEAD ↔ BUILD_ID ═══
 * کلید جدید «drift» (افزودنی — کلیدهای قبلی دست‌نخورده):
 *   available: آیا مخزن گیت در دسترس سرور است؟ (standalone بدون .git → false)
 *   headSha:   HEAD لحظه‌ای مخزن (runtime — نه مهرِ زمان بیلد)
 *   buildSha:  sha پخته در بیلد (baked)
 *   match:     headSha === buildSha — false یعنی سرور روی کدی سرو می‌کند
 *              که با HEAD مخزن نخوانده (بازنشانیِ پلتفرم بدون ری‌بیلد)
 *   سپر عالی گیت‌هاب (github-supreme-guard.sh) و GitHub Action همین
 *   کلید را داور می‌کنند — تشخیص بدون دخالت انسانی.
 */
/**
 * PN-040 (گام ۴ · ۴.۴): خواندن HEAD زندهٔ مخزن در زمان درخواست.
 * الگوی امنِ P6549: import دینامیک node:fs فقط در مسیر nodejs (کامپایل Edge
 * روی import سطح‌بالا خطا می‌داد — درس مستند در instrumentation.ts).
 * مخزن: MELKA_REPO_DIR (همان قرارداد قلاب بوت P6548) — پیش‌فرض مسیر رسمی.
 */
async function computeDrift(bakedSha: string): Promise<{
  available: boolean;
  headSha: string | null;
  buildSha: string | null;
  match: boolean | null;
  checkedAt: string;
}> {
  const checkedAt = new Date().toISOString();
  try {
    const { existsSync, readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const repoRoot = process.env.MELKA_REPO_DIR ?? "/home/z/my-project";
    const gitHeadPath = join(repoRoot, ".git", "HEAD");
    if (!existsSync(gitHeadPath)) {
      return { available: false, headSha: null, buildSha: bakedSha, match: null, checkedAt };
    }
    const headFile = readFileSync(gitHeadPath, "utf8").trim();
    let headSha: string | null = null;
    if (headFile.startsWith("ref:")) {
      const refName = headFile.slice(4).trim();
      const refPath = join(repoRoot, ".git", refName);
      if (existsSync(refPath)) {
        headSha = readFileSync(refPath, "utf8").trim();
      } else if (existsSync(join(repoRoot, ".git", "packed-refs"))) {
        // شاخه بسته‌بندی‌شده — جستجو در packed-refs
        const packed = readFileSync(join(repoRoot, ".git", "packed-refs"), "utf8");
        const line = packed.split("\n").find((l) => l.endsWith(" " + refName));
        if (line) headSha = line.split(" ")[0];
      }
    } else {
      headSha = headFile; // HEAD جدا (detached)
    }
    if (!headSha) {
      return { available: false, headSha: null, buildSha: bakedSha, match: null, checkedAt };
    }
    // نرمال‌سازی طول sha — مهرِ بیلد ممکن است کوتاه (۷ کاراکتر) باشد و
    // HEAD زنده کامل (۴۰)؛ مقایسه در کوتاه‌ترین طولِ مشترک (پیشوند-سازگار).
    const n = Math.min(headSha.length, bakedSha.length);
    const match = n >= 7 && headSha.slice(0, n) === bakedSha.slice(0, n);
    return { available: true, headSha, buildSha: bakedSha, match, checkedAt };
  } catch {
    return { available: false, headSha: null, buildSha: bakedSha, match: null, checkedAt };
  }
}

export const dynamic = "force-dynamic";

export async function GET() {
  const w = getBuildWitness();
  const { fingerprint, source: fingerprintSource } = servedFingerprint();
  const drift = await computeDrift(w.gitSha);
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
      drift,
    },
    { headers: { "Cache-Control": "no-store, must-revalidate" }, },
  );
}
