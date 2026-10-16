/**
 * POST /api/auth/request-otp
 * مرحله ۱ ورود: دریافت کد پرسنلی → درخواست ارسال پیامک از سامانه واقعی
 * arm.melketabriz.ir (GET arus-api.melketabriz.ir/api/apm/authentication/otp/{code})
 *
 * PN-034 (شورا-ن۰۵۵ · ۱۴۰۵/۰۷/۲۶ · قانون مالک: «صفر محدودیت اتصال»):
 * هرگونه محدودیت محلی روی این مسیر برافتاد —
 *   · مکانیزم OTP تک‌بارة PN-029 (قفل ۶ ساعته · جدول OtpRateLimit) حذف کامل
 *   · سقف نرخ محلی (۳ در ۱۰ دقیقه) حذف — قانون مالک بالاتر از هر مکانیزم
 *     امنیتی قبلی است؛ «فرم ورود مستقیم (بدون قفل)».
 * تنها سقف باقی‌مانده سهمیهٔ سمت خود ملک تبریز است (بیرون از حاکمیت ما).
 * recordAttempt تنها برای رد حسابرسی (AuditLog/OtpAttempt) می‌ماند — هرگز مسدود نمی‌کند.
 */

import { NextRequest } from "next/server";
import { getMelkProvider } from "@/lib/melk-api/provider";
import { isValidPersonnelCodeFormat } from "@/lib/auth/crypto";
import { recordAttempt } from "@/lib/auth/rate-limiter";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse } from "@/lib/auth/guard";
import { audit } from "@/lib/auth/session";
import { clientIp } from "@/lib/auth/client-ip";

export async function POST(request: NextRequest) {
  let personnelCode = "";
  try {
    const body = (await request.json().catch(() => null)) as { personnelCode?: string } | null;
    personnelCode = body?.personnelCode?.trim() ?? "";

    if (!isValidPersonnelCodeFormat(personnelCode)) {
      throw new MelkApiError("INVALID_PERSONNEL_CODE", "قالب کد پرسنلی نامعتبر است (۶ تا ۱۲ رقم).", 400, false);
    }

    const ip = clientIp(request) ?? "unknown"; // PN-008 BLOCK 3 — Trusted Proxy (تک‌نقطه تصمیم)

    // ✅ فراخوانی واقعی سامانه ARM — پیامک از سمت ملک تبریز ارسال می‌شود
    // (PN-034: بدون قفل تک‌باره، بدون سقف نرخ محلی — قانون صفر-محدودیت)
    const provider = getMelkProvider();
    const result = await provider.requestOtp(personnelCode, ip);

    await recordAttempt(personnelCode, "REQUEST_OTP", true, ip);
    await audit("OTP_REQUESTED", personnelCode, "arm.melketabriz.ir SMS dispatched");

    return Response.json({
      ok: true,
      expiresInSeconds: result.expiresInSeconds,
      source: "arm.melketabriz.ir",
    });
  } catch (err) {
    // رد حسابرسی شکست (سپرِ مسدودساز دیگر وجود ندارد — قانون صفر-محدودیت)
    if (personnelCode) {
      await recordAttempt(personnelCode, "REQUEST_OTP", false).catch(() => {});
    }
    if (err instanceof MelkApiError) return errorResponse(err);
    // خطای خام fetch به سامانه واقعی — پیام شفاف برای کاربر
    const msg = (err as Error)?.message?.includes("fetch")
      ? "ارتباط با سامانه ملک تبریز برقرار نشد. لطفاً اتصال شبکه و وضعیت سرورهای ملک تبریز را بررسی کنید."
      : "خطای غیرمنتظره در صدور کد پیامکی.";
    return errorResponse(new MelkApiError("UNKNOWN", msg, 500, false));
  }
}
