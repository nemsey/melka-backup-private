"use client";

/**
 * AuthFlow — جزیرهٔ جریان ورود (PN-013 فاز ۴: Server Shell + Client Islands)
 * ---------------------------------------------------------------------------
 * AuthScreen + OtpScreen در یک جزیرهٔ مشترک (هر دو از یک دامنهٔ ورودند و
 * پشت سر هم لازم می‌شوند) — با بارگذاری پویا فقط برای کاربرِ وارد‌نشده.
 * کاربر دارای نشست معتبر هرگز این چانک را نمی‌گیرد.
 */

import { AuthScreen } from "@/components/app/AuthScreen";
import { OtpScreen } from "@/components/app/OtpScreen";

export default function AuthFlow({ stage }: { stage: "auth" | "otp" }) {
  return stage === "otp" ? <OtpScreen /> : <AuthScreen />;
}
