/**
 * POST /api/connection/reset
 * ریست کامل اتصال (دکمه «ریست اتصال» در تنظیمات عمومی):
 * 1) ابطال نشست جاری  2) بازسازی Provider و پاک‌سازی کش CRM
 * 3) همگام‌سازی مجدد داده واقعی از arus-api.melketabriz.ir
 * بدنه: { withData: boolean } — اگر false فقط نشست ریست شود.
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { extractBearer, revokeSession, audit } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/auth/crypto";
import { resetMelkProvider, getMelkProvider } from "@/lib/melk-api/provider";

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

    // ۳) پاک‌سازی کامل کش داده و تلاش برای همگام‌سازی مجدد داده واقعی
    let resync: { ok: boolean; transactions: number; experts: number; interactions: number; syncedAt?: string; error?: string; errorCode?: string } | null = null;
    if (withData) {
      // پاک‌سازی کامل داده‌های کش‌شده
      await db.transactionRecord.deleteMany({});
      await db.expertRecord.deleteMany({});
      await db.interactionRecord.deleteMany({});

      // توکن ARM: از نشست (قبل از ابطال اطلاعات رمزگشایی شده توسط guard) یا آخرین موفق
      let armToken = guard.armTokens?.accessToken ?? "";
      if (!armToken) {
        const state = await db.syncState.findUnique({ where: { id: "singleton" } });
        armToken = decryptSecret(state?.armTokenEnc) ?? "";
      }

      if (armToken) {
        const provider = getMelkProvider();
        try {
          await provider.listExperts(armToken, { limit: 1, offset: 0 }); // سنجش توکن
        } catch {
          // توکن منقضی — پاک‌سازی توکن ذخیره‌شده
          armToken = "";
          await db.syncState.update({ where: { id: "singleton" }, data: { armTokenEnc: null } }).catch(() => {});
        }
        if (armToken) {
          const { syncFromArm } = await import("@/lib/melk-api/sync");
          resync = await syncFromArm(armToken);
        }
      }

      if (!armToken) {
        resync = {
          ok: false,
          transactions: 0,
          experts: 0,
          interactions: 0,
          error: "توکن سامانه آگهی و درخواست موجود نیست. برای استخراج داده واقعی، با کد پرسنلی و کد پیامکی وارد شوید.",
          errorCode: "UNAUTHORIZED",
        };
      }
    }

    await audit("CONNECTION_RESET", guard.personnelCode, `withData=${withData}`);
    return Response.json({ ok: true, resync });
  } catch (err) {
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("CONNECTION_RESET", `ریست اتصال ناموفق بود: ${(err as Error).message}`, 500, false));
  }
}
