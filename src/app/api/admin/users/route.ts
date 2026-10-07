/**
 * /api/admin/users — PN-016 مرحلهٔ ۶ (بند ۵.۲.۴): مدیریت کاربران — فهرست + ساخت
 * ---------------------------------------------------------------------------
 * GET  — فهرست کاربران (جستجو + فیلتر نقش) + رجیستری کاشی‌ها + نمای کلی (فقط OWNER)
 * POST — ساخت کاربر تازه با مجوزهای پیش‌فرض نقش (فقط OWNER)
 * روت لاغر — تمام منطق در src/lib/services/users-service.ts (مرز مخزن).
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { audit } from "@/lib/auth/session";
import { MANAGEABLE_TILES } from "@/lib/access/personnel-access";
import { listUsers, createUser, usersOverview } from "@/lib/services/users-service";
import { isUserRole, USER_ROLES, ROLE_LABELS_FA, type UserRole } from "@/lib/users/user-model";

export async function GET(request: NextRequest) {
  const guard = await requireRole(request, "OWNER", "GET /api/admin/users");
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const url = new URL(request.url);
  const search = url.searchParams.get("search") ?? "";
  const role = url.searchParams.get("role");
  const includeInactive = url.searchParams.get("includeInactive") === "1";

  const [rows, overview] = await Promise.all([
    listUsers({ search, role, includeInactive }),
    usersOverview(),
  ]);

  return Response.json({
    ok: true,
    rows,
    overview,
    registry: MANAGEABLE_TILES,
    roles: USER_ROLES.map((r) => ({ id: r, label: ROLE_LABELS_FA[r] })),
  });
}

export async function POST(request: NextRequest) {
  const guard = await requireRole(request, "OWNER", "POST /api/admin/users");
  if (guard instanceof MelkApiError) return errorResponse(guard);

  let raw: unknown = null;
  try {
    raw = await request.json();
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "بدنه درخواست نامعتبر است.", 400, false));
  }
  const body = (raw ?? {}) as {
    personnelCode?: string; mobile?: string; fullName?: string;
    role?: string; branchTitle?: string; roleTitleFa?: string;
  };

  if (!isUserRole(body.role)) {
    return errorResponse(new MelkApiError("UNKNOWN", `نقش نامعتبر (مجاز: ${USER_ROLES.join(" | ")})`, 400, false));
  }

  try {
    const user = await createUser({
      personnelCode: body.personnelCode ?? null,
      mobile: body.mobile ?? null,
      fullName: String(body.fullName ?? ""),
      role: body.role as UserRole,
      branchTitle: body.branchTitle ?? null,
      roleTitleFa: body.roleTitleFa ?? null,
      createdBy: guard.ctx.personnelCode,
    });
    await audit("USER_CREATED", guard.ctx.personnelCode, `userId=${user.id}; role=${user.role}; code=${user.personnelCode ?? user.mobile}`);
    return Response.json({ ok: true, user });
  } catch (e) {
    if (e instanceof MelkApiError) return errorResponse(e);
    return errorResponse(new MelkApiError("UNKNOWN", "خطای غیرمنتظره در ساخت کاربر.", 500, false));
  }
}
