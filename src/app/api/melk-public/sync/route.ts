/**
 * /api/melk-public/sync — استخراج از سامانهٔ عمومی ملک تبریز (P6546/گام صفر-۱)
 * ------------------------------------------------------
 * POST — اجرای همگام‌سازی کاتالوج عمومی (apu — بدون توکن):
 *   یافتن کدهای ملکِ سامانهٔ عمومی که در فهرست آگهی موجود نیستند و افزودنشان.
 * GET — وضعیت دسترس‌پذیری مسیر عمومی + شمار آگهی‌های عمومی.
 * صفر حذف داده؛ upsert با merge-non-null (دادهٔ ARM موجود هرگز بازنویسی نمی‌شود).
 */

import { NextRequest } from "next/server";
import { errorResponse, requireRole, requireSessionAsync } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";
import { audit } from "@/lib/auth/session";
import { probeMelkPublic, syncMelkPublicCatalog } from "@/lib/melk-api/melk-public";

export const maxDuration = 120;

/** قفل درون‌فرایندی — اجرای موازی ممنوع */
const inflight = { running: false };

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);
  const probe = await probeMelkPublic();
  return Response.json({
    ok: probe.ok,
    probe,
    running: inflight.running,
  });
}

export async function POST(request: NextRequest) {
  const role = await requireRole(request, "OWNER", "POST /api/melk-public/sync");
  if (role instanceof MelkApiError) return errorResponse(role);
  const guard = role.ctx;

  if (inflight.running) {
    return Response.json(
      { ok: false, code: "BUSY", message: "یک استخراج سامانهٔ عمومی همین حالا در حال اجراست — چند لحظه بعد دوباره بزنید." },
      { status: 429 }
    );
  }

  let body: { maxPages?: number; enrichDetails?: boolean } = {};
  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }
  const maxPages = Math.min(Math.max(Number(body.maxPages ?? 40), 1), 100);

  inflight.running = true;
  try {
    const result = await syncMelkPublicCatalog({ maxPages, enrichDetails: body.enrichDetails ?? true });
    await audit("MELK_PUBLIC_SYNC", guard.personnelCode, `new=${result.newCodes.length} created=${result.created} updated=${result.updated}`);
    return Response.json({ ok: result.ok, result });
  } catch (err) {
    const e = err instanceof MelkApiError ? err : new MelkApiError("UNKNOWN", (err as Error)?.message ?? "خطای استخراج سامانهٔ عمومی", 500, false);
    return errorResponse(e);
  } finally {
    inflight.running = false;
  }
}
