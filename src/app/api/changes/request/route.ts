/**
 * POST /api/changes/request — قابلیت ۲: ایجاد و تغییر «کد درخواست» (فقط مالک)
 * ---------------------------------------------------------------------------
 * عملیات (action):
 *   lookup — جستجوی کد درخواست (محلی + زندهٔ ARM + تاریخچهٔ تغییرات)
 *   create — ثبت کد درخواست جدید در ARM عین ۰۹۹ (۴ گامی · کد از فهرست زنده
 *            + رویداد تاریخچهٔ اختیاری با تاریخ دقیق)
 *   update — تغییر در کد درخواست موجود (PUT requests/update/{id}) + اصلاح
 *            تاریخ تاریخچه با آرایهٔ status (شاهکار ۰۹۹)
 *   event  — ثبت رویداد تاریخچه با تاریخ دقیق (اقدام/توسط/تاریخ جلالی + ساعت)
 *   types  — فهرست انواع رویداد زنده از خود سامانه
 *
 * گام سوم: هر عملیات نوشتاری، اگر حالت تمام‌ظرفیت فعال نباشد به‌طور خودکار
 * فعالش می‌کند (ensureChangesSessionForOperation) — «تمام ظرفیت ترموکس در
 * اختیار این کاشی» بدون هیچ اقدام اضافهٔ مالک.
 */

import { NextRequest } from "next/server";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";
import { ensureChangesSessionForOperation } from "@/lib/changes/session";
import { db } from "@/lib/db";
import {
  lookupRequestByCode,
  createRequestCode,
  updateRequestCode,
  registerRequestHistoryEvent,
  fetchChangeEventTypes,
  type CreateRequestSpec,
  type HistoryEventSpec,
  type RequestUpdateSpec,
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
    // ── فقط-خواندن ──
    if (action === "lookup") {
      const code = String(body.code ?? "").trim();
      if (!code) return errorResponse(new MelkApiError("UNKNOWN", "کد درخواست الزامی است.", 400, false));
      const res = await lookupRequestByCode(code);
      return Response.json(res, { status: res.ok || res.local ? 200 : 404 });
    }
    if (action === "types") {
      // fail-soft — هرگز ۵xx نمی‌دهد؛ UI با پیش‌فرض ۰۹۹ («ایجاد مشاور») ادامه می‌دهد
      const res = await fetchChangeEventTypes();
      return Response.json({ ok: true, types: res.types, live: res.live, error: res.error });
    }

    // ── نوشتاری: اطمینان از حالت تمام‌ظرفیت (گام سوم — خودکار) ──
    const session = await ensureChangesSessionForOperation(db, actor, `کد درخواست: ${action}`);

    if (action === "create") {
      const spec = body.spec as CreateRequestSpec | undefined;
      if (!spec?.customerName || !spec?.customerMobile) {
        return errorResponse(new MelkApiError("UNKNOWN", "نام و موبایل درخواست‌دهنده الزامی است.", 400, false));
      }
      const history = (body.history as HistoryEventSpec | null | undefined) ?? null;
      const report = await createRequestCode(spec, history, actor);
      return Response.json({ ...report, sessionAuto: session.autoStarted }, { status: report.ok ? 200 : 422 });
    }

    if (action === "update") {
      const spec = body.spec as RequestUpdateSpec | undefined;
      if (!spec?.code) return errorResponse(new MelkApiError("UNKNOWN", "کد درخواست الزامی است.", 400, false));
      const report = await updateRequestCode(spec, actor);
      return Response.json({ ...report, sessionAuto: session.autoStarted }, { status: report.ok ? 200 : 422 });
    }

    if (action === "event") {
      const code = String(body.code ?? "").trim();
      const spec = body.spec as HistoryEventSpec | undefined;
      if (!code || !spec?.date || !spec?.hour) {
        return errorResponse(new MelkApiError("UNKNOWN", "کد درخواست + تاریخ + ساعت الزامی است.", 400, false));
      }
      const report = await registerRequestHistoryEvent(code, spec, actor);
      return Response.json({ ...report, sessionAuto: session.autoStarted }, { status: report.ok ? 200 : 422 });
    }

    return errorResponse(new MelkApiError("UNKNOWN", `action نامعتبر: ${action}`, 400, false));
  } catch (err) {
    // نرمال‌سازی وضعیت — armCall گاهی httpStatus=0 (NETWORK_ERROR) می‌دهد که
    // errorResponse آن را ۵۰۰ می‌کند؛ برای صداقت، ۵۰۲ با پیام شفاف جایگزین می‌شود.
    const raw = err instanceof MelkApiError ? err : new MelkApiError("UNKNOWN", (err as Error)?.message ?? "خطای نامشخص", 502, false);
    const e = raw.httpStatus >= 400 && raw.httpStatus < 600 ? raw : new MelkApiError(raw.code, raw.message, raw.code === "UNAUTHORIZED" ? 401 : 502, false);
    return errorResponse(e);
  }
}
