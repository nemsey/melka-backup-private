/**
 * POST /api/experts/sync — بروزرسانی فهرست کارشناسان (PN-008 ثانیاً)
 * ---------------------------------------------------------------------------
 * زنجیرهٔ سه‌مرحله‌ای (همهٔ ستون‌ها):
 *   ۱) رجیستری PM — realtors/list همهٔ صفحات (کدپرسنلی/نام/موبایل/داخلی/وضعیت)
 *   ۲) عمق PM — personnelInfo (استخدام/شعبه/مدیر/سمت) + contactInfo (آدرس/تلفن/کدپستی)
 *   ۳) شمارش ARM محلی — مبایعه‌نامه (+پیش‌فروش) و اجاره‌نامه (+تمدید) هر کارشناس
 * هر مرحله صادقانه گزارش می‌شود؛ شکست مرحله، مراحل دیگر را نمی‌شکند.
 * قید: فقط OWNER (توکن خزانهٔ PM مالک).
 *
 * PN-083 (هماهنگ‌ساز چهار فهرست): اجرا از این پس از مسیر مشترک
 * runExpertsListUpdate می‌گذرد — یعنی زیر قفل بین‌فرایندی update:m4 (هرگز
 * موازی با چرخهٔ خودکار Worker یا درخواست فوری مالک) و با ثبت وضعیت
 * list-m4 در SyncJobState (همان حقیقتی که داشبورد و تنظیمات نشان می‌دهند).
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { audit } from "@/lib/auth/session";
import { getPmSyncToken } from "@/lib/melk-api/pm-acc-sync";
import { runExpertsListUpdate } from "@/lib/melk-api/four-lists";

/** P2-03 — روت‌ها هرگز import مستقیم @/lib/db ندارند (الگوی db تنبل) */
async function getDb(): Promise<import("@prisma/client").PrismaClient> {
  const mod = (await import("@/lib/db")) as { db: import("@prisma/client").PrismaClient };
  return mod.db;
}

export async function POST(request: NextRequest) {
  const role = await requireRole(request, "OWNER", "POST /api/experts/sync");
  if (role instanceof MelkApiError) return errorResponse(role);
  const guard = role.ctx;

  try {
    const db = await getDb();
    const pmToken = await getPmSyncToken();
    const out = await runExpertsListUpdate(db, { pmToken, source: "manual" });

    if (!out.ran && out.reason === "no-token") {
      return errorResponse(
        new MelkApiError("PRECONDITION_FAILED", "توکن PM در دسترس نیست — اتصال حساب شخصی سامانهٔ پرسنلی در تنظیمات عمومی برقرار نیست.", 412, false)
      );
    }
    if (!out.ran) {
      // قفل زندهٔ دیگری (چرخهٔ خودکار یا درخواست فوری) — صادقانه، نه خطا
      return Response.json({
        ok: true,
        busy: true,
        message: "بروزرسانی فهرست مشاوران همین حالا در پس‌زمینه در جریان است — پس از پایان آن، تازه‌ترین داده در دسترس است و این درخواست بی‌اثر ثبت نشد (صفر اجرای موازی).",
      });
    }

    const stage = (out.stage ?? {}) as { registryRows?: number; deepEnriched?: number };
    await audit("EXPERTS_SYNC_RUN", guard.personnelCode, JSON.stringify({ registry: stage.registryRows, deep: stage.deepEnriched }));
    return Response.json({ ok: true, stage: out.stage });
  } catch (err) {
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در بروزرسانی فهرست کارشناسان.", 500, false));
  }
}
