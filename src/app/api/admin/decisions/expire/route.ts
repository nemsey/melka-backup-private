/**
 * /api/admin/decisions/expire — PN-019 فاز ۸: جاروب دستی انقضای تصمیم (فقط OWNER)
 * شفافیت: تغییر وضعیت بدون حذف (دکترین دادهٔ مقدس) + AuditLog.
 */
import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { expireSweep } from "@/lib/services/decision-service";

export async function POST(request: NextRequest) {
  const guard = await requireRole(request, "OWNER", "POST /api/admin/decisions/expire");
  if (guard instanceof MelkApiError) return errorResponse(guard);
  const result = await expireSweep();
  return Response.json({ ok: true, ...result });
}
