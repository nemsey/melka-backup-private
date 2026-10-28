/**
 * /api/integrations/melketun/sync — PN-044/فاز ۳ (شورا-ن۰۸۸)
 * ---------------------------------------------------------------------------
 * POST — اجرای دستی هماهنگ‌سازی ملکتون (تست/راه‌اندازی) — فقط OWNER.
 * Worker خودکار: هر ۶ ساعت (id: melketun-sync · رجیستری jobs).
 * نتیجه: fetched/upserted/errors/durationMs — صفر راز در پاسخ (قانون ۱۲/۱۸).
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { syncMelketun } from "@/lib/integrations/melketun/sync";

export const maxDuration = 300; // پوش sync بزرگ (پلکانی) — سقف پلتفرم

export async function POST(request: NextRequest) {
  const guard = await requireRole(request, "OWNER", "POST /api/integrations/melketun/sync");
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const result = await syncMelketun();
  return Response.json(result);
}
