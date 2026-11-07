/**
 * GET /api/matching/file — PN-028/رابعاً-الف/ب (دستور مالک)
 * ---------------------------------------------------------------------------
 * «کلید "مشاهده در کاشی درخواست" ... به کلید "فایل درخواست" تغییر نام یابد و با
 * زدن این دکمه فایل کلیه اطلاعات کد درخواست پیشنهاد شده به صورت حرفه‌ای
 * آورده شود» (و قرینهٔ آن برای «فایل آگهی»).
 *
 *   ?requestCode=… → پروندهٔ کامل درخواست (همهٔ ستون‌های M2 + فرم پویای ARM)
 *   ?listingCode=…  → پروندهٔ کامل آگهی (همهٔ ستون‌های M1 + جزئیات غنی‌شده)
 *
 * خروجی: بخش‌بندی حرفه‌ای «شناسنامه · مالی · مکانی · فیزیکی · انسانی · زمانی» —
 * همان زبان تحلیل چندوجهی کاشی تطبیق (PN-028/رابعاً-د).
 * تمام دسترسی‌های DB در لایهٔ سرویس (core/matching/rejection-store — گارد P2-03).
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { getListingFile, getRequestFile } from "@/core/matching/rejection-store";

export const dynamic = "force-dynamic";

async function getDb() {
  const mod = (await import("@/lib/db")) as { db: import("@prisma/client").PrismaClient };
  return mod.db;
}

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const url = new URL(request.url);
  const listingCode = url.searchParams.get("listingCode");
  const requestCode = url.searchParams.get("requestCode");
  if (!listingCode && !requestCode) {
    return errorResponse(new MelkApiError("UNPROCESSABLE", "یکی از پارامترهای listingCode یا requestCode الزامی است.", 400, true));
  }

  const db = await getDb();

  try {
    /* ══════════ پروندهٔ آگهی (کد ملک) — فایل آگهی ══════════ */
    if (listingCode) {
      const file = await getListingFile(db, listingCode);
      if (!file) {
        return errorResponse(new MelkApiError("NOT_FOUND", `آگهی با کد ${listingCode} یافت نشد.`, 404, false));
      }
      return Response.json(file, { headers: { "Cache-Control": "no-store" } });
    }

    /* ══════════ پروندهٔ درخواست (کد درخواست) — فایل درخواست ══════════ */
    const file = await getRequestFile(db, requestCode!);
    if (!file) {
      return errorResponse(new MelkApiError("NOT_FOUND", `درخواست با کد ${requestCode} یافت نشد.`, 404, false));
    }
    return Response.json(file, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(new MelkApiError("UNKNOWN", `خطا در ساخت پرونده: ${(err as Error)?.message ?? "نامشخص"}`, 500, false));
  }
}
