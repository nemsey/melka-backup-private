/**
 * POST /api/admin/otp-burn — PN-029 (مرحلهٔ ۸ سند شورا-ن۰۳۳)
 * ---------------------------------------------------------------------------
 * «API مخصوص برای Owner که OTP را می‌سوزاند» — تنها مسیر عبور آگاهانه از
 * مکانیزم OTP تک‌واره:
 *
 *   · فقط نقش OWNER (نگهبان requireRole — ردهای غیرمالک با شاهد AuditLog رد می‌شوند)
 *   · body: { personnelCode, confirm: true } — تأیید صریح لازم است
 *   · قفل ۶ ساعتهٔ دو دامنه (کد پرسنلی + IP) رعایت و سپس سوزانده می‌شود
 *   · در حالت آفلینی ملک تبریز، تنها این مسیر می‌تواند یک تلاش واقعی OTP
 *     انجام دهد (bypassOffline) — چون تلاشِ آگاهانهٔ مالک است، نه خودکار
 *   · فیوز قطع‌کننده همچنان برقرار است: اگر قفل ۲۴ ساعته فعال باشد،
 *     پاسخ دقیق «چقدر مانده» برمی‌گردد (L6)
 *   · شاهد کامل: AuditLog با action=OTP_BURN_OWNER
 *
 * دکترین: «یک OTP، یک بار — پس از صبر ۲۴-۴۸ ساعتهٔ مصوب شورا.»
 */

import { NextRequest } from "next/server";
import { getMelkProvider } from "@/lib/melk-api/provider";
import { isValidPersonnelCodeFormat } from "@/lib/auth/crypto";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { audit } from "@/lib/auth/session";
import { clientIp } from "@/lib/auth/client-ip";
import { burnOtpAttemptForRequest as burnOtpAttempt, checkOtpLockForRequest as checkOtpLock, otpLockedError } from "@/lib/auth/otp-lock";
import { isArmOfflineMode } from "@/lib/melk-api/offline-mode";

export async function POST(request: NextRequest) {
  const guard = await requireRole(request, "OWNER", "/api/admin/otp-burn");
  if (guard instanceof MelkApiError) return errorResponse(guard);
  const ctx = guard.ctx;

  let personnelCode = "";
  try {
    const body = (await request.json().catch(() => null)) as { personnelCode?: string; confirm?: boolean } | null;
    personnelCode = body?.personnelCode?.trim() ?? "";

    if (!isValidPersonnelCodeFormat(personnelCode)) {
      throw new MelkApiError("INVALID_PERSONNEL_CODE", "قالب کد پرسنلی نامعتبر است (۶ تا ۱۲ رقم).", 400, false);
    }
    if (body?.confirm !== true) {
      throw new MelkApiError(
        "PRECONDITION_FAILED",
        "سوزاندن تک‌تلاش OTP نیازمند تأیید صریح است: { \"personnelCode\": \"...\", \"confirm\": true } — این تلاش قفل ۶ ساعته فعال می‌کند.",
        412,
        false
      );
    }

    const ip = clientIp(request) ?? "unknown";

    // ۱) قفل ۶ ساعتهٔ مکانیزم تک‌واره — پیش از تلاش
    const otpLock = await checkOtpLock(personnelCode, ip);
    if (!otpLock.allowed) throw otpLockedError(otpLock.blocked);

    // ۲) سوزاندن تلاش (پیش از فراخوانی — حتی اگر فراخوانی شکست بخورد، تلاش مصرف شده است)
    await burnOtpAttempt(personnelCode, ip);

    // ۳) تلاش واقعی — تنها فراخوانی مجاز به عبور از حالت آفلینی
    const provider = getMelkProvider();
    const result = await provider.requestOtp(personnelCode, ip, { bypassOffline: true }); // موفقیت در فیوز داخل armCall ثبت می‌شود

    await audit(
      "OTP_BURN_OWNER",
      ctx.personnelCode,
      `سوزاندن آگاهانهٔ تک‌تلاش OTP برای کد پرسنلی ${personnelCode} از IP ${ip} — offline=${isArmOfflineMode() ? "1" : "0"}`
    );

    return Response.json({
      ok: true,
      message: "تک‌تلاش OTP سوزانده شد — پیامک در صورت سلامت مسیر ارسال می‌گردد. تلاش بعدی: ۶ ساعت دیگر.",
      expiresInSeconds: result.expiresInSeconds,
      lockHours: 6,
      offlineModeWasActive: isArmOfflineMode(),
      source: "arm.melketabriz.ir (owner burn — PN-029)",
    });
  } catch (err) {
    // تلاش از دست رفته (شکست شبکه/سرور) هم سوخته شده است — شفاف گزارش می‌شود
    if (personnelCode && err instanceof MelkApiError) {
      await audit(
        "OTP_BURN_OWNER",
        ctx.personnelCode,
        `تلاش سوخته (ناموفق) برای ${personnelCode} — کد خطا: ${err.code}`
      ).catch(() => undefined);
    }
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطای غیرمنتظره در سوزاندن تک‌تلاش OTP.", 500, false));
  }
}
