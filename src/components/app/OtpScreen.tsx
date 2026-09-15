"use client";

/**
 * صفحه ورود — مرحله ۲: تأیید کد پیامکی (OTP)
 * شامل شمارش معکوس عمر کد، ارسال مجدد و مدیریت کامل خطا.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MessageSquareText, ArrowRight, RotateCw } from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { useAppStore } from "@/lib/client/store";
import { faDigits } from "@/lib/format";

const OTP_EXPIRY_SECONDS = 180;

export function OtpScreen() {
  const { toast } = useToast();
  const pendingCode = useAppStore((s) => s.pendingPersonnelCode);
  const setStage = useAppStore((s) => s.setStage);
  const setPendingPersonnelCode = useAppStore((s) => s.setPendingPersonnelCode);
  const login = useAppStore((s) => s.login);

  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [remaining, setRemaining] = useState(OTP_EXPIRY_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!pendingCode) setStage("auth");
  }, [pendingCode, setStage]);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setRemaining((r) => (r > 0 ? r - 1 : 0));
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const submit = useCallback(
    async (value: string) => {
      if (!pendingCode) return;
      setLoading(true);
      try {
        const res = await api<{
          ok: boolean;
          token: string;
          user: { personnelCode: string; displayName: string; role: "OWNER" | "CONSULTANT"; expiresAt: string };
        }>("/api/auth/verify-otp", {
          method: "POST",
          body: { personnelCode: pendingCode, otp: value },
          auth: false,
        });
        await login(res.token, res.user);
        toast({ title: `خوش آمدید، ${res.user.displayName}`, description: "ورود با موفقیت انجام شد." });
      } catch (err) {
        const e = err as ApiClientError;
        setOtp("");
        toast({ title: "کد تأیید نشد", description: e.message, variant: "destructive" });
      } finally {
        setLoading(false);
      }
    },
    [pendingCode, login, toast]
  );

  const resend = useCallback(async () => {
    if (!pendingCode) return;
    setResending(true);
    try {
      await api<{ ok: boolean }>("/api/auth/request-otp", {
        method: "POST",
        body: { personnelCode: pendingCode },
        auth: false,
      });
      setRemaining(OTP_EXPIRY_SECONDS);
      setOtp("");
      toast({
        title: "کد جدید ارسال شد",
        description: "کد تأیید جدید از سامانه ملک تبریز پیامک شد.",
      });
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "ارسال مجدد ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setResending(false);
    }
  }, [pendingCode, toast]);

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0");
  const ss = String(remaining % 60).padStart(2, "0");

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6">
      <main className="w-full max-w-md">
        <Card className="tile-pop border-border/60 shadow-xl shadow-black/5">
          <CardHeader className="text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-teal-600 via-teal-500 to-cyan-500 flex items-center justify-center mb-2 shadow-lg shadow-teal-600/25 ring-4 ring-primary/10">
              <MessageSquareText className="w-7 h-7 text-white" aria-hidden />
            </div>
            <CardTitle className="text-lg">کد تأیید پیامکی</CardTitle>
            <CardDescription className="leading-relaxed">
              کد ۴ رقمی ارسال‌شده به شماره موبایل ثبت‌شده در سامانه ملک تبریز را وارد کنید.
              <br />
              کد پرسنلی:{" "}
              <span dir="ltr" className="font-mono font-semibold">
                {faDigits(pendingCode ?? "")}
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col items-center gap-3">
              <InputOTP
                maxLength={4}
                value={otp}
                onChange={(v) => {
                  setOtp(v);
                  if (v.length === 4) void submit(v);
                }}
                disabled={loading}
                aria-label="کد پیامکی ۴ رقمی"
              >
                <InputOTPGroup dir="ltr">
                  <InputOTPSlot index={0} />
                  <InputOTPSlot index={1} />
                </InputOTPGroup>
                <InputOTPSeparator />
                <InputOTPGroup dir="ltr">
                  <InputOTPSlot index={2} />
                  <InputOTPSlot index={3} />
                </InputOTPGroup>
              </InputOTP>

              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {remaining > 0 ? (
                  <span>
                    اعتبار کد:{" "}
                    <span dir="ltr" className="font-mono font-semibold text-foreground">
                      {faDigits(`${mm}:${ss}`)}
                    </span>
                  </span>
                ) : (
                  <Badge variant="destructive">کد منقضی شده است</Badge>
                )}
              </div>

              {loading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> در حال بررسی کد…
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                className="flex-1"
                onClick={() => {
                  setPendingPersonnelCode(null);
                  setStage("auth");
                }}
              >
                <ArrowRight className="w-4 h-4 ml-1" aria-hidden /> بازگشت
              </Button>
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => void resend()}
                disabled={resending || remaining > OTP_EXPIRY_SECONDS - 30}
              >
                {resending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> ارسال…
                  </>
                ) : (
                  <>
                    <RotateCw className="w-4 h-4 ml-1" aria-hidden /> ارسال مجدد
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
