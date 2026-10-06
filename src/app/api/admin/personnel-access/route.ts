/**
 * /api/admin/personnel-access — PN-008 BLOCK 7 بند ۷.۲
 * ------------------------------------------------------
 * GET  — فهرست همهٔ رکوردهای دسترسی + رجیستری کاشی‌های قابل مدیریت (فقط OWNER)
 * POST — ثبت/ویرایش دسترسی یک کد پرسنلی (فقط OWNER)
 * قید: قانون هویت دوگانه — OWNER همیشه full؛ رکورد برای کد مالک در «اعمال» نادیده
 * گرفته می‌شود (ثبتش صرفاً اطلاعاتی است و تأثیری بر دسترسی مالک ندارد).
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { audit } from "@/lib/auth/session";
import { listPersonnelAccess, upsertPersonnelAccess, MANAGEABLE_TILES, getOwnerPersonnelCodes, type AccessLevel } from "@/lib/access/personnel-access";

export async function GET(request: NextRequest) {
  const role = await requireRole(request, "OWNER", "GET /api/admin/personnel-access");
  if (role instanceof MelkApiError) return errorResponse(role);
  const rows = await listPersonnelAccess();
  return Response.json({ ok: true, rows, registry: MANAGEABLE_TILES, ownerPersonnelCodes: getOwnerPersonnelCodes() });
}

export async function POST(request: NextRequest) {
  const role = await requireRole(request, "OWNER", "POST /api/admin/personnel-access");
  if (role instanceof MelkApiError) return errorResponse(role);
  const guard = role.ctx;

  let raw: unknown = null;
  try {
    raw = await request.json();
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "بدنه درخواست نامعتبر است.", 400, false));
  }
  const body = (raw ?? {}) as { personnelCode?: string; level?: string; allowedTiles?: string[]; notes?: string };

  const personnelCode = String(body.personnelCode ?? "").trim();
  const level = String(body.level ?? "") as AccessLevel;
  if (!personnelCode || personnelCode.length < 3) {
    return errorResponse(new MelkApiError("UNKNOWN", "کد پرسنلی معتبر وارد کنید.", 400, false));
  }
  if (!["full", "limited", "none"].includes(level)) {
    return errorResponse(new MelkApiError("UNKNOWN", "سطح دسترسی باید full / limited / none باشد.", 400, false));
  }
  const tiles: string[] = Array.isArray(body.allowedTiles) ? body.allowedTiles : [];
  if (level === "limited" && tiles.length === 0) {
    return errorResponse(new MelkApiError("UNKNOWN", "برای دسترسی محدود حداقل یک کاشی انتخاب کنید.", 400, false));
  }

  const row = await upsertPersonnelAccess({
    personnelCode,
    level,
    allowedTiles: tiles,
    grantedBy: guard.personnelCode,
    notes: body.notes ?? null,
  });
  await audit("PERSONNEL_ACCESS_SET", guard.personnelCode, `code=${personnelCode};level=${level};tiles=${row.allowedTiles.length}`);
  return Response.json({ ok: true, row });
}
