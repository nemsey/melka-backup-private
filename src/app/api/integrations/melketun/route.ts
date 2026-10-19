/**
 * /api/integrations/melketun — PN-043/فاز ۳ (شورا-ن۰۸۷): تنظیمات یکپارچهٔ ملکتون
 * ---------------------------------------------------------------------------
 * GET  — فرادادهٔ اتصال (base URLs + username ماسک‌شده + وضعیت اتصال) — فقط OWNER
 * POST — تست زندهٔ اتصال (عمومی + CRM) با فاز ۰ verdict: اتصال مستقیم — فقط OWNER
 * راز‌ها هرگز برنمی‌گردند — فقط ok/status/latency/note (قانون ۱۲).
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { melketun, melketunMeta } from "@/lib/integrations/melketun";

export async function GET(request: NextRequest) {
  const guard = await requireRole(request, "OWNER", "GET /api/integrations/melketun");
  if (guard instanceof MelkApiError) return errorResponse(guard);

  return Response.json({ ok: true, ...melketunMeta() });
}

export async function POST(request: NextRequest) {
  const guard = await requireRole(request, "OWNER", "POST /api/integrations/melketun");
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const [publicResult, crmResult] = await Promise.all([
    melketun.testPublicConnection(),
    melketun.testCrmLogin(),
  ]);

  return Response.json({ ok: true, public: publicResult, crm: crmResult });
}
