/**
 * /api/admin/users/[id]/activity — PN-016: سیاههٔ فعالیت کاربر
 * GET — پنجرهٔ زمانی: 24h (پیش‌فرض) | 7d | 30d (فقط OWNER)
 */

import { NextRequest } from "next/server";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";
import { getUserActivity } from "@/lib/services/users-service";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(request, "OWNER", "GET /api/admin/users/[id]/activity");
  if (guard instanceof MelkApiError) return errorResponse(guard);
  const { id } = await params;

  const url = new URL(request.url);
  const w = url.searchParams.get("window") ?? "24h";
  const windowHours = w === "7d" ? 168 : w === "30d" ? 720 : 24;
  if (!["24h", "7d", "30d"].includes(w)) {
    return errorResponse(new MelkApiError("UNKNOWN", "پنجرهٔ زمانی مجاز: 24h | 7d | 30d", 400, false));
  }

  const rows = await getUserActivity(id, windowHours as 24 | 168 | 720);
  return Response.json({ ok: true, window: w, rows });
}
