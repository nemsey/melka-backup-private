"use client";

/**
 * بخش «ورود مجدد به ملک تبریز» — PN-030 مرحلهٔ ۶ (شورای عالی ملکا · جلسهٔ فوق‌العاده ۰۳۵)
 * ---------------------------------------------------------------------------
 * صفحهٔ سادهٔ ورود با OTP که سند شورا برای مالک تصویب کرد:
 *
 *   «دکمهٔ ارسال کد → POST /api/admin/otp-burn (سوزاندن آگاهانهٔ تک‌تلاش)
 *    فیلد کد → تأیید → توکن‌ها در Vault ذخیره می‌شوند» (بخش ۲ · مرحلهٔ ۶)
 *
 * جریان سه‌گامی:
 *   ۱) ارسال کد: از API مخصوص مالک (PN-029 مرحلهٔ ۸) — تنها مسیر عبور آگاهانه
 *      از حالت آفلینی؛ قفل ۶ ساعتهٔ تک‌تلاش رعایت و «سوزانده» می‌شود.
 *   ۲) ورود کد پیامکی (سامانهٔ ملک تبریز ۴ رقم است؛ ارقام فارسی هم پذیرفته می‌شود).
 *   ۳) تأیید: از مسیر استاندارد اتصال ARM (/api/arm/connection · verify) —
 *      توکن‌ها به نشست جاری مالک متصل و در صندوقچهٔ ماندگار (Vault) ذخیره می‌شوند.
 *
 * نمایش‌شرط: فقط نقش OWNER (API تک‌تلاش فقط مالک را می‌پذیرد — PN-029).
 *
 * PN-033 (شورا-ن۰۵۴ · ساده‌سازی): کارت پروکسی ابری Worker + نشانگر/بنر حالت
 * آفلینی PN-029 حذف شدند — دوران جنگ پایان یافت؛ مسیر یگانه رلهٔ Termux است
 * و وضعیتش در بخش «رلهٔ Termux» دیده می‌شود. فقط: کدپرسنلی + دکمه + OTP.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAppStore } from "@/lib/client/store";
import { api, ApiClientError } from "@/lib/client/api";
import { Loader2, Smartphone, ShieldCheck, KeyRound, Flame } from "lucide-react";

/** نرمال‌سازی ارقام فارسی/عربی به لاتین + حذف غیررقم */
function toLatinDigits(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/\D/g, "");
}

export function OtpReloginSection() {
  const { toast } = useToast();
  const role = useAppStore((s) => s.user?.role);
  const [personnelCode, setPersonnelCode] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"code" | "otp">("code");
  const [busy, setBusy] = useState(false);
  /** پیام راهنمای پس از سوزاندن تک‌تلاش (قفل ۶ ساعته و… ) */
  const [burnNote, setBurnNote] = useState("");

  // فقط مالک — API تک‌تلاش (otp-burn) نقشهای دیگر را رد می‌کند (PN-029)
  if (role !== "OWNER") return null;

  const burnOtp = async () => {
    const trimmed = personnelCode.trim();
    if (trimmed.length < 6) {
      toast({
        title: "کد پرسنلی نامعتبر",
        description: "کد پرسنلی خود را کامل وارد کنید (۶ تا ۱۲ رقم).",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; message: string; expiresInSeconds?: number; lockHours?: number }>("/api/admin/otp-burn", {
        method: "POST",
        body: { personnelCode: trimmed, confirm: true },
      });
      setStage("otp");
      setBurnNote(res.message ?? "");
      toast({
        title: "کد پیامکی درخواست شد (تک‌تلاش سوخته شد)",
        description: res.message,
      });
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "ارسال کد ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    const digits = toLatinDigits(code);
    if (digits.length !== 4) {
      toast({
        title: "کد نامعتبر",
        description: "کد پیامکی سامانهٔ ملک تبریز ۴ رقم است — کامل وارد کنید.",
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; message: string }>("/api/arm/connection", {
        method: "POST",
        body: { action: "verify", personnelCode: personnelCode.trim(), otp: digits },
      });
      toast({
        title: res.ok ? "اتصال برقرار شد" : "تأیید ناموفق",
        description: res.message,
        variant: res.ok ? "default" : "destructive",
      });
      if (res.ok) {
        setCode("");
        setStage("code");
        setBurnNote("");
      }
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "تأیید ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-xl border p-4 space-y-3" aria-label="ورود مجدد به ملک تبریز" id="settings-otp-relogin">
      <header className="space-y-0.5">
        <h4 className="text-sm font-bold flex items-center gap-2 flex-wrap">
          <KeyRound className="w-4 h-4 text-primary" aria-hidden /> ورود مجدد به ملک تبریز
          <Badge variant="outline" className="gap-1 text-[10px] px-1.5">
            <Flame className="w-3 h-3 text-amber-600" aria-hidden /> تک‌تلاش · PN-030
          </Badge>
        </h4>
        <p className="text-xs text-muted-foreground leading-relaxed">
          کد پرسنلی خود را وارد کنید؛ پیامک واقعی ملک تبریز درخواست و تأیید می‌شود و اتصال
          برای همیشه در صندوقچهٔ ماندگار ذخیره می‌گردد. مسیر عبور: رلهٔ Termux (وضعیتش در بخش رله).
        </p>
      </header>

      {stage === "code" ? (
        <div className="space-y-1.5">
          <Label htmlFor="otp-relogin-code" className="text-xs">کد پرسنلی (مطابق سامانهٔ ملک تبریز)</Label>
          <div className="flex gap-2">
            <Input
              id="otp-relogin-code"
              value={personnelCode}
              onChange={(e) => setPersonnelCode(e.target.value)}
              placeholder="کد پرسنلی…"
              inputMode="numeric"
              dir="ltr"
              className="text-xs"
              autoComplete="off"
            />
            {/* سوزاندن تک‌تلاش — نیازمند تأیید صریح (قرارداد otp-burn: confirm=true) */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="secondary" className="shrink-0 gap-1.5" disabled={busy || personnelCode.trim().length < 6}>
                  {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <Smartphone className="w-3.5 h-3.5" aria-hidden />}
                  ارسال کد
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent dir="rtl">
                <AlertDialogHeader className="text-right space-y-2 items-start">
                  <AlertDialogTitle className="text-right">سوزاندن تک‌تلاش OTP؟</AlertDialogTitle>
                  <AlertDialogDescription className="text-right leading-relaxed">
                    این درخواست یک پیامک واقعی به موبایل کد پرسنلی {personnelCode.trim()} می‌فرستد و
                    تلاش بعدی تا ۶ ساعت قفل می‌شود (مکانیزم تک‌وراث PN-029). اگر مسیر شبکه‌ای هنوز
                    باز نشده باشد، تلاش بی‌فایده می‌سوزاند. ارسال می‌کنید؟
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="gap-2">
                  <AlertDialogCancel>انصراف</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void burnOtp()}>بله، کد را بفرست</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
          <p className="text-[10px] text-muted-foreground leading-4">
            پس از دریافت پیامک، کد ۴ رقمی را در همین بخش وارد و تأیید کنید.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="otp-relogin-otp" className="text-xs">کد پیامکی ۴ رقمی دریافتی از ملک تبریز</Label>
          <div className="flex gap-2">
            <Input
              id="otp-relogin-otp"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="کد تأیید…"
              inputMode="numeric"
              dir="ltr"
              className="text-xs"
              autoComplete="one-time-code"
              maxLength={8}
            />
            <Button size="sm" className="shrink-0 gap-1.5" onClick={() => void verify()} disabled={busy}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <ShieldCheck className="w-3.5 h-3.5" aria-hidden />}
              تأیید و اتصال
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            کد برای کد پرسنلی {personnelCode || "—"} ارسال شده است. پس از تأیید، توکن‌ها در
            صندوقچهٔ ماندگار ذخیره و اتصال در ورودهای بعدی خودکار بازیابی می‌شود.
          </p>
          {burnNote && (
            <p className="text-[10px] leading-relaxed rounded-lg border border-teal-500/30 bg-teal-500/10 text-teal-800 dark:text-teal-300 p-2">
              {burnNote}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
