/**
 * /api/runtime/build-freshness — GET (PN-031-B · جلسهٔ ۰۳۹)
 * ---------------------------------------------------------------------------
 * بنر تازگی سرور در تنظیمات: «سرور روی HEAD است» / «سرور بروز نیست».
 *
 *   • freshness: مقایسهٔ SHA کامل بیلد زنده (اثر انگشت پخته) با HEAD گیت
 *   • autoRebuildsThisMonth: شمار جبران‌های خودکار head-guard در ماه جاری
 *   • lastGuard: شاهد آخرین اجرای گارد (فایل شاهد — بهترین-تلاش)
 *
 * فقط مالک (OWNER) — خواندنی، سبک، بدون عارضه (عین /api/runtime/health).
 * صفر تصمیم کسب‌وکاری — این روت فقط «گزارش» می‌دهد؛ اقدام با Worker است.
 * مرز Repository: هرگونه دسترسی DB از لایهٔ سرویس
 * (countAutoRebuildsThisMonth) — خود روت سبک می‌ماند (قانون P2).
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { servedFingerprint } from "@/lib/version-fingerprint";
import {
  computeBuildFreshness,
  countAutoRebuildsThisMonth,
  gitHeadFull,
  readHeadGuardWitness,
} from "@/lib/runtime/build-freshness";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const role = await requireRole(request, "OWNER", "GET /api/runtime/build-freshness");
  if (role instanceof MelkApiError) return errorResponse(role);

  try {
    const { fingerprint, source } = servedFingerprint();
    const gitHead = gitHeadFull();
    const freshness = computeBuildFreshness({
      liveGitSha: fingerprint.gitSha,
      liveBuildId: fingerprint.buildId,
      liveBuiltAt: fingerprint.builtAt,
      liveSource: source,
      gitHead,
    });

    const autoRebuildsThisMonth = await countAutoRebuildsThisMonth();
    const lastGuard = readHeadGuardWitness();

    return Response.json(
      { ok: true, freshness, autoRebuildsThisMonth, lastGuard },
      { headers: { "Cache-Control": "no-store, must-revalidate" } },
    );
  } catch (err) {
    return errorResponse(
      new MelkApiError("UNKNOWN", `خطا در وارسی تازگی بیلد: ${(err as Error).message}`, 500, false),
    );
  }
}
