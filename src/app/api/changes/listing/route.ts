/**
 * POST /api/changes/listing — قابلیت ۱: ایجاد و تغییر «کدآگهی» (فقط مالک)
 * ---------------------------------------------------------------------------
 * عملیات (action):
 *   lookup — جستجوی کدآگهی در خود سامانه (properties/info/by-code عین فرم رویداد)
 *   create — ثبت کدآگهی جدید در ARM (۵ گامی · مسیر زندهٔ اثبات‌شده) + کد از فهرست
 *   update — تغییر در کدآگهی موجود (PUT properties/update/{id} عین edit-page)
 *
 * گام سوم: هر عملیات نوشتاری، اگر حالت تمام‌ظرفیت فعال نباشد به‌طور خودکار
 * فعالش می‌کند — «تمام ظرفیت ترموکس در اختیار این کاشی».
 */

import { NextRequest } from "next/server";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";
import { ensureChangesSessionForOperation } from "@/lib/changes/session";
import { db } from "@/lib/db";
import {
  lookupListingByCode,
  createListingCode,
  updateListingCode,
  type CreateListingSpec,
  type ListingUpdateSpec,
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
      const res = await lookupListingByCode(code);
      return Response.json(res, { status: res.ok ? 200 : 404 });
    }

    // ── نوشتاری: اطمینان از حالت تمام‌ظرفیت (گام سوم — خودکار) ──
    const session = await ensureChangesSessionForOperation(db, actor, `کدآگهی: ${action}`);

    if (action === "create") {
      const spec = body.spec as CreateListingSpec | undefined;
      if (!spec?.customerName || !spec?.customerMobile || !spec?.areaId || !spec?.lineId || !spec?.address) {
        return errorResponse(new MelkApiError("UNKNOWN", "اطلاعات مالک + مکان (منطقه/محله/آدرس) الزامی است.", 400, false));
      }
      const report = await createListingCode(spec, actor);
      return Response.json({ ...report, sessionAuto: session.autoStarted }, { status: report.ok ? 200 : 422 });
    }

    if (action === "update") {
      const spec = body.spec as ListingUpdateSpec | undefined;
      if (!spec?.code) return errorResponse(new MelkApiError("UNKNOWN", "کدآگهی الزامی است.", 400, false));
      const report = await updateListingCode(spec, actor);
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
