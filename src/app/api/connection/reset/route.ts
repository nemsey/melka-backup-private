/**
 * POST /api/connection/reset
 * ریست کامل اتصال (دکمه «ریست اتصال» در تنظیمات عمومی):
 * 1) ابطال نشست جاری  2) پاک‌سازی کش داده CRM  3) همگام‌سازی مجدد
 * بدنه: { withData: boolean } — اگر false فقط نشست ریست شود.
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { extractBearer, revokeSession, audit } from "@/lib/auth/session";
import { resetCrmCache } from "@/lib/melk-api/sync";
import { resetMelkProvider } from "@/lib/melk-api/provider";

export async function POST(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  try {
    const body = (await request.json().catch(() => null)) as { withData?: boolean } | null;
    const withData = body?.withData ?? true;

    // ۱) ابطال نشست جاری
    const token = extractBearer(request.headers.get("authorization"));
    if (token) await revokeSession(token, "CONNECTION_RESET");

    // ۲) بازسازی Provider (پاک‌سازی وضعیت اتصال)
    resetMelkProvider();

    // ۳) پاک‌سازی و همگام‌سازی مجدد داده
    let resync: { transactions: number; experts: number } | null = null;
    if (withData) {
      resync = await resetCrmCache();
    }

    await audit("CONNECTION_RESET", guard.personnelCode, `withData=${withData}`);
    return Response.json({ ok: true, resync });
  } catch (err) {
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("CONNECTION_RESET", `ریست اتصال ناموفق بود: ${(err as Error).message}`, 500, false));
  }
}
