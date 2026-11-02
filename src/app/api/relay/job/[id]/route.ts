/**
 * GET /api/relay/job/[id] — PN-035 (شورا-ن۰۵۷ · فاز ۳ · الگوی Async)
 * ---------------------------------------------------------------------------
 * ایستگاه polling وضعیت کار async برای اپ:
 *   · ورود (کارهای بدون نشست): jobId = قابلیت نانقض‌قابل‌حدس (cuid) — بدون نشست
 *   · کارهای نشست‌دار (arm/pm connection): فقط با نشستِ صاحب کار
 *   · نتیجهٔ حساس (توکن نشست ورود): فقط در نخستین پاسخِ completed باز
 *     می‌شود (رمز AES-256-GCM) و برای همیشه مصرف می‌شود
 *
 * هر پاسخ سبک و «< ۱ ثانیه» است — این روت هرگز به رله/شبکه نمی‌رود (فقط DB).
 */

import { NextRequest } from "next/server";
import { getRelayJobForClient } from "@/lib/melk-api/relay-jobs";
import { requireSessionAsync } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id || id.length < 8) {
    return Response.json({ ok: false, error: "invalid job id" }, { status: 400, headers: { "cache-control": "no-store" } });
  }

  // نشست اختیاری: کارهای نشست‌دار با آن تأیید مالکیت می‌شوند؛
  // کارهای ورود (بدون نشست) با قابلیتِ jobId خوانده می‌شوند.
  const guard = await requireSessionAsync(request).catch(() => null);
  const session = guard && !(guard instanceof MelkApiError) ? { sessionId: guard.sessionId } : null;

  const view = await getRelayJobForClient(id, session);
  if (!view.ok) {
    return Response.json({ ok: false, error: view.error }, { status: view.status, headers: { "cache-control": "no-store" } });
  }
  return Response.json(
    { ok: true, job: view.job, ...(view.secret ? { secret: view.secret } : {}) },
    { status: 200, headers: { "cache-control": "no-store" } }
  );
}
