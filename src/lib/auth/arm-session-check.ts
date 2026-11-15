/**
 * PN-082 — پیش‌پرواز نشست آرم (برای مسیر ثبت آگهی کاشی فایل‌یابی)
 * ---------------------------------------------------------------
 * زمینه (گزارش مالک ۱۴۰۵/۰۸/۲۰): پنج ثبت آگهی شکست‌خورده — توکن
 * دسترسی آرم (JWT با عمر ۴۸ ساعت) بی‌آنکه کسی ببیند منقضی شده بود و
 * زنجیرهٔ تمدید هم مرده بود؛ خطای خام («عدم احراز هویت!») تنها پس از
 * پر شدن کل فرم ۵ گامی ظاهر می‌شد و راهنمایی نداشت.
 *
 * این ماژول وضعیت نشست آرم را «پیش از» باز شدن فرم ارزیابی می‌کند:
 *   · توکن نیست → ثبت غیرفعال با پیام ورود (همان رفتار قبلی)
 *   · توکن با exp در آینده (حاشیهٔ ۱۲۰ث) → مجاز
 *   · توکن منقضی + توکن تمدید → تمدید خودکار (زنجیرهٔ «اتصال ماندگار»؛
 *     موفق → مجاز؛ ناموفق → ثبت غیرفعال با پیام راهنمای ورود مجدد؛
 *     رلهٔ آفلاین → پیام مخصوص رله)
 *   · توکن نامفهوم (exp ناخوانا) → بی‌طرف مجاز — داوری نهایی با خود آرم
 */

import { isArmTokenLikelyValid, ARM_RELOGIN_MESSAGE } from "./arm-token-exp";
import type { SessionContext } from "./session";

export interface ArmSessionAssessment {
  ok: boolean;
  message: string;
}

export async function assessArmSession(guard: SessionContext): Promise<ArmSessionAssessment> {
  const tokens = guard.armTokens;
  if (!tokens?.accessToken) {
    return {
      ok: false,
      message: "برای ثبت در سامانه آرم باید با «کد پرسنلی + پیامک» وارد شوید (ورود مدیر محلی توکن آرم ندارد).",
    };
  }
  const likelyValid = isArmTokenLikelyValid(tokens.accessToken);
  if (likelyValid !== false) {
    return { ok: true, message: "توکن سامانه آرم موجود است — پس از تکمیل اطلاعات ناقص، ثبت نهایی انجام می‌شود." };
  }
  // منقضی — تلاش تمدید خودکار پیش از باز کردن فرم
  if (tokens.refreshToken) {
    try {
      const { getMelkProvider } = await import("@/lib/melk-api/provider");
      const refreshed = await getMelkProvider().refreshArmToken(tokens.refreshToken);
      const { vaultKeyForSession } = await import("./arm-vault");
      const { updateSessionArmTokens } = await import("./session");
      await updateSessionArmTokens(guard.sessionId, refreshed, {
        ownerKey: vaultKeyForSession(guard.personnelCode, guard.role),
      });
      return { ok: true, message: "نشست آرم منقضی بود و به‌صورت خودکار تمدید شد — آمادهٔ ثبت نهایی." };
    } catch (err) {
      const relayDown =
        err instanceof Error && (err.name === "RelayOfflineError" || err.message?.includes("رلهٔ موبایل"));
      if (relayDown) {
        return {
          ok: false,
          message: "رلهٔ موبایل (Poco F3) متصل نیست — اتصال گوشی رله را برقرار کنید و پنجره را دوباره باز کنید.",
        };
      }
      return { ok: false, message: ARM_RELOGIN_MESSAGE };
    }
  }
  return { ok: false, message: ARM_RELOGIN_MESSAGE };
}
