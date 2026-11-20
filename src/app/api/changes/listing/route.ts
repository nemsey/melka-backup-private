/**
 * POST /api/changes/listing — بخش «کدآگهی» کاشی تغییرات (فقط مالک · DIR-CHANGES-TILE-002)
 * ---------------------------------------------------------------------------
 * عملیات (action) — فقط تغییر و حذف (سایر بخش‌ها حذف شد — دستور مالک ۱۴۰۵/۰۸/۲۹):
 *   lookup       — خواندن وضعیت کامل آگهی برای فرم تغییر/حذف (مالک + وضعیت + رویدادها + آثار محلی)
 *   change-owner — تغییر «اطلاعات مالک آگهی»: نام/نام‌خانوادگی + شماره موبایل در خود سامانه ARM
 *   change-date  — تغییر تاریخ «ایجاد مشاور» + آبشار اتوماتیک تاریخچه‌ها متناسب با تاریخ مالک
 *   delete       — حذف کامل آگهی از ARM + سامانهٔ عمومی + همهٔ آینه‌های محلی (هیچ اثری نماند)
 *
 * گام سوم (تمام‌ظرفیت): هر عملیات نوشتاری، اگر حالت تمام‌ظرفیت فعال نباشد
 * به‌طور خودکار فعالش می‌کند — «تمام ظرفیت ترموکس در اختیار این کاشی».
 */

import { NextRequest } from "next/server";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";
import { ensureChangesSessionForOperation } from "@/lib/changes/session";
import {
  lookupListingForChange,
  changeListingOwnerInfo,
  changeListingHistoryDate,
  deleteListingCode,
  type ListingOwnerChangeSpec,
  type ListingDateChangeSpec,
} from "@/lib/changes/executor";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const g = await requireRole(request, "OWNER", "/api/changes/listing");
  if (g instanceof MelkApiError) return errorResponse(g);
  const guard = g.ctx;
  const actor = { code: guard.personnelCode, name: guard.displayName ?? "" };

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "بدنه درخواست نامعتبر است.", 400, false));
  }
  const action = String(body.action ?? "");

  try {
    if (action === "lookup") {
      const code = String(body.code ?? "").trim();
      if (!code) return errorResponse(new MelkApiError("UNKNOWN", "کدآگهی الزامی است.", 400, false));
      const res = await lookupListingForChange(code);
      return Response.json(res, { status: res.ok ? 200 : 404 });
    }

    // ── نوشتاری: اطمینان از حالت تمام‌ظرفیت (گام سوم — خودکار) ──
    const session = await ensureChangesSessionForOperation(actor, `کدآگهی: ${action}`);

    if (action === "change-owner") {
      const spec = body.spec as ListingOwnerChangeSpec | undefined;
      if (!spec?.code) return errorResponse(new MelkApiError("UNKNOWN", "کدآگهی الزامی است.", 400, false));
      if (!spec.newFullName?.trim() && !spec.newMobile?.trim()) {
        return errorResponse(new MelkApiError("UNKNOWN", "حداقل یکی از نام یا موبایل جدید مالک الزامی است.", 400, false));
      }
      const report = await changeListingOwnerInfo(spec, actor);
      return Response.json({ ...report, sessionAuto: session.autoStarted }, { status: report.ok ? 200 : 422 });
    }

    if (action === "change-date") {
      const spec = body.spec as ListingDateChangeSpec | undefined;
      if (!spec?.code || !spec.targetJalali) {
        return errorResponse(new MelkApiError("UNKNOWN", "کدآگهی + تاریخ هدف (نمونه: 1405/07/05) الزامی است.", 400, false));
      }
      const report = await changeListingHistoryDate(spec, actor);
      return Response.json({ ...report, sessionAuto: session.autoStarted }, { status: report.ok ? 200 : 422 });
    }

    if (action === "delete") {
      const code = String(body.code ?? "").trim();
      if (!code) return errorResponse(new MelkApiError("UNKNOWN", "کدآگهی الزامی است.", 400, false));
      const report = await deleteListingCode(code, actor);
      return Response.json({ ...report, sessionAuto: session.autoStarted }, { status: report.ok ? 200 : 422 });
    }

    return errorResponse(new MelkApiError("UNKNOWN", `action نامعتبر: ${action} — عملیات‌های مجاز: lookup · change-owner · change-date · delete`, 400, false));
  } catch (err) {
    // نرمال‌سازی وضعیت — عین DIR-CHANGES-TILE-001
    const raw = err instanceof MelkApiError ? err : new MelkApiError("UNKNOWN", (err as Error)?.message ?? "خطای نامشخص", 502, false);
    const e = raw.httpStatus >= 400 && raw.httpStatus < 600 ? raw : new MelkApiError(raw.code, raw.message, raw.code === "UNAUTHORIZED" ? 401 : 502, false);
    return errorResponse(e);
  }
}
