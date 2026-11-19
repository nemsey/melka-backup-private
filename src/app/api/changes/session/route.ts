/**
 * POST /api/changes/session — کلیدهای «حالت تمام‌ظرفیت» (گام سوم · فقط مالک)
 * ---------------------------------------------------------------------------
 * { action: "begin", note?: string } — شروع: توقف بروزرسانی چهار فهرست +
 *        اختصاص تمام ظرفیت رلهٔ ترموکس به کاشی (آیتم‌های کاشی = اولویت ۱۰؛
 *        claim فقط تعاملی/کاشی؛ پرچم boost به اسکریپت گوشی نسل O می‌رسد)
 * { action: "end" } — پایان: بازگشت چرخه‌های عادی بروزرسانی و ظرفیت رله
 *
 * محافظ‌ها: انقضای خودکار ۳۰ دقیقه (فراموشی «پایان» هرگز سینک را گیر
 * نمی‌اندازد) + ممیزی کامل CHANGES_SESSION_BEGIN/END در AuditLog.
 */

import { NextRequest } from "next/server";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";
import { db } from "@/lib/db";
import { beginChangesSession, endChangesSession, changesSessionView } from "@/lib/changes/session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const g = await requireRole(request, "OWNER", "/api/changes/session");
  if (g instanceof MelkApiError) return errorResponse(g);
  const guard = g.ctx;

  let body: { action?: string; note?: string };
  try {
    body = (await request.json()) as { action?: string; note?: string };
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "بدنه درخواست نامعتبر است.", 400, false));
  }

  const actor = { code: guard.personnelCode, name: guard.displayName ?? "" };

  if (body.action === "begin") {
    const res = await beginChangesSession(db, actor, body.note ?? "");
    return Response.json({
      ok: res.ok,
      alreadyActive: res.alreadyActive,
      session: res.session,
      message: res.alreadyActive
        ? "حالت تمام‌ظرفیت از قبل فعال است."
        : "حالت تمام‌ظرفیت فعال شد — بروزرسانی چهار فهرست متوقف شد و تمام ظرفیت ترموکس به این کاشی اختصاص یافت (انقضای خودکار ۳۰ دقیقه).",
    });
  }

  if (body.action === "end") {
    const res = await endChangesSession(db, actor);
    return Response.json({
      ok: res.ok,
      wasActive: res.wasActive,
      after: res.after,
      message: res.wasActive
        ? "حالت تمام‌ظرفیت پایان یافت — چرخه‌های بروزرسانی فهرست‌ها و ظرفیت کامل رله بازگشت."
        : "حالت تمام‌ظرفیت فعال نبود.",
    });
  }

  return errorResponse(new MelkApiError("UNKNOWN", "action باید begin یا end باشد.", 400, false));
}

export async function GET(request: NextRequest) {
  const g = await requireRole(request, "OWNER", "/api/changes/session");
  if (g instanceof MelkApiError) return errorResponse(g);
  return Response.json({ ok: true, ...changesSessionView() });
}
