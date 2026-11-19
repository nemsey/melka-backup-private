/**
 * POST /api/changes/request — بخش «کددرخواست» کاشی تغییرات (فقط مالک · DIR-CHANGES-TILE-002)
 * ---------------------------------------------------------------------------
 * عملیات (action) — فقط تغییر و حذف (سایر بخش‌ها حذف شد — دستور مالک ۱۴۰۵/۰۸/۲۹):
 *   lookup      — خواندن وضعیت کامل درخواست برای فرم تغییر/حذف (تاریخچهٔ کامل + رویدادها + آثار محلی)
 *   change-date — تغییر تاریخ «ایجاد مشاور» + آبشار اتوماتیک تاریخچه‌ها متناسب با تاریخ مالک
 *                 (تعمیم شاهکار ۰۹۹: آرایهٔ status کامل + رویدادها با همان Δ نسبی)
 *   delete      — حذف کامل درخواست از ARM + همهٔ آینه‌های محلی (هیچ اثری نماند)
 *
 * گام سوم (تمام‌ظرفیت): هر عملیات نوشتاری، اگر حالت تمام‌ظرفیت فعال نباشد
 * به‌طور خودکار فعالش می‌کند (ensureChangesSessionForOperation).
 */

import { NextRequest } from "next/server";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";
import { ensureChangesSessionForOperation } from "@/lib/changes/session";
import { db } from "@/lib/db";
import {
  lookupRequestForChange,
  changeRequestHistoryDate,
  deleteRequestCode,
  type RequestDateChangeSpec,
} from "@/lib/changes/executor";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const g = await requireRole(request, "OWNER", "/api/changes/request");
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
      if (!code) return errorResponse(new MelkApiError("UNKNOWN", "کد درخواست الزامی است.", 400, false));
      const res = await lookupRequestForChange(code);
      return Response.json(res, { status: res.ok ? 200 : 404 });
    }

    // ── نوشتاری: اطمینان از حالت تمام‌ظرفیت (گام سوم — خودکار) ──
    const session = await ensureChangesSessionForOperation(db, actor, `کد درخواست: ${action}`);

    if (action === "change-date") {
      const spec = body.spec as RequestDateChangeSpec | undefined;
      if (!spec?.code || !spec.targetJalali) {
        return errorResponse(new MelkApiError("UNKNOWN", "کد درخواست + تاریخ هدف (نمونه: 1405/07/05) الزامی است.", 400, false));
      }
      const report = await changeRequestHistoryDate(spec, actor);
      return Response.json({ ...report, sessionAuto: session.autoStarted }, { status: report.ok ? 200 : 422 });
    }

    if (action === "delete") {
      const code = String(body.code ?? "").trim();
      if (!code) return errorResponse(new MelkApiError("UNKNOWN", "کد درخواست الزامی است.", 400, false));
      const report = await deleteRequestCode(code, actor);
      return Response.json({ ...report, sessionAuto: session.autoStarted }, { status: report.ok ? 200 : 422 });
    }

    return errorResponse(new MelkApiError("UNKNOWN", `action نامعتبر: ${action} — عملیات‌های مجاز: lookup · change-date · delete`, 400, false));
  } catch (err) {
    // نرمال‌سازی وضعیت — عین DIR-CHANGES-TILE-001
    const raw = err instanceof MelkApiError ? err : new MelkApiError("UNKNOWN", (err as Error)?.message ?? "خطای نامشخص", 502, false);
    const e = raw.httpStatus >= 400 && raw.httpStatus < 600 ? raw : new MelkApiError(raw.code, raw.message, raw.code === "UNAUTHORIZED" ? 401 : 502, false);
    return errorResponse(e);
  }
}
