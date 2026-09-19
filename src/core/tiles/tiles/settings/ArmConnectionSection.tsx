"use client";

/**
 * بخش «اتصال به سامانه ARM با کد پیامکی» در تنظیمات عمومی
 * ------------------------------------------------------
 * دستور مالک (۱۴۰۵/۰۶/۳۰): اگر با «کد مستر» وارد شده باشید، از همین‌جا
 * با کد پرسنلی + پیامک، اتصال سامانه ARM (آگهی و درخواست) را به نشست
 * جاری متصل کنید — بدون خروج و ورود مجدد.
 * جریان عین صفحه ورود: کد پرسنلی → پیامک ARM → تأیید کد → توکن متصل به همین نشست.
 * پس از اتصال، استخراج داده واقعی به‌طور خودکار در پس‌زمینه آغاز می‌شود.
 *
 * P6.5-09 (دستور مالک):
 *   · کلید «ریست» — بازنشانی کامل اتصال ARM و بازگشت به گام اول (عین ریست PM)
 *   · پاسخ alreadySent (پیامک قبلاً ارسال شده — سهمیهٔ مشترک سمت ملک تبریز):
 *     بدون خطا، به گام وارد کردن همان کد دریافت‌شده هدایت می‌شود
 */

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Smartphone, ShieldCheck, XCircle, Building2, RefreshCcw, RotateCcw, Unplug } from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { faDateTime, faNumber } from "@/lib/format";

interface ArmConnectionResponse {
  ok: boolean;
  connection: {
    status: "connected" | "disconnected";
    hasToken: boolean;
    userType: string | null;
    role: string;
    sessionExpiresAt: string;
  };
  sync: {
    lastSuccessAt: string | null;
    lastError: string | null;
    transactionCount: number;
    expertCount: number;
  };
}

export function ArmConnectionSection() {
  const { toast } = useToast();
  const [data, setData] = useState<ArmConnectionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [personnelCode, setPersonnelCode] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"code" | "otp">("code");
  const [busy, setBusy] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [resetting, setResetting] = useState(false);
  /** پیامک قبلاً ارسال شده — راهنمای گام تأیید (P6.5-09) */
  const [alreadySentHint, setAlreadySentHint] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api<ArmConnectionResponse>("/api/arm/connection");
      setData(res);
    } catch {
      // بی‌صدا — وضعیت در بارگذاری بعدی دوباره امتحان می‌شود
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startOtp = async () => {
    const trimmed = personnelCode.trim();
    if (trimmed.length < 6) {
      toast({ title: "کد پرسنلی نامعتبر", description: "کد پرسنلی خود را کامل وارد کنید (۶ تا ۱۲ رقم).", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; message: string; alreadySent?: boolean }>("/api/arm/connection", {
        method: "POST",
        body: { action: "start-otp", personnelCode: trimmed },
      });
      if (res.ok) {
        setStage("otp");
        setAlreadySentHint(res.alreadySent ? res.message : "");
        toast({
          title: res.alreadySent ? "پیامک قبلاً ارسال شده" : "کد پیامکی ARM ارسال شد",
          description: res.message,
        });
      } else {
        toast({ title: "ارسال کد ناموفق", description: res.message, variant: "destructive" });
      }
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "ارسال کد ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    const digits = code.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/\D/g, "");
    if (digits.length !== 4) {
      toast({ title: "کد نامعتبر", description: "کد پیامکی ۴ رقمی را کامل وارد کنید.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; message: string }>("/api/arm/connection", {
        method: "POST",
        body: { action: "verify", personnelCode: personnelCode.trim(), otp: digits },
      });
      toast({
        title: res.ok ? "اتصال سامانه ARM برقرار شد" : "تأیید ناموفق",
        description: res.message,
        variant: res.ok ? "default" : "destructive",
      });
      if (res.ok) {
        setCode("");
        setStage("code");
      }
      await load();
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "تأیید ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      const res = await api<{ ok: boolean; message: string }>("/api/arm/connection", {
        method: "POST",
        body: { action: "disconnect" },
      });
      toast({ title: "اتصال ARM قطع شد", description: res.message });
      setStage("code");
      setCode("");
      setAlreadySentHint("");
      await load();
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "قطع اتصال ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setDisconnecting(false);
    }
  };

  /** P6.5-09 — ریست کامل اتصال ARM (عین ریست PM): پاک‌کردن توکن + بازگشت به گام اول */
  const reset = async () => {
    setResetting(true);
    try {
      const res = await api<{ ok: boolean; message: string }>("/api/arm/connection", {
        method: "POST",
        body: { action: "reset" },
      });
      toast({ title: "ریست انجام شد", description: res.message });
      setStage("code");
      setCode("");
      setPersonnelCode("");
      setAlreadySentHint("");
      await load();
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "ریست ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" aria-hidden /> اتصال به سامانه ARM (آگهی و درخواست)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  const conn = data?.connection;
  const isConnected = conn?.status === "connected";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="w-5 h-5 text-primary" aria-hidden /> اتصال به سامانه ARM (آگهی و درخواست)
        </CardTitle>
        <CardDescription>
          سامانه آگهی و درخواست ملک تبریز (arm.melketabriz.ir) — با کد پرسنلی + پیامک، عین صفحه ورود، بدون خروج از حساب فعلی
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            {isConnected ? (
              <Badge className="gap-1 bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                <ShieldCheck className="w-3 h-3" aria-hidden /> متصل{conn?.userType ? ` — ${conn.userType === "realtor" ? "کارشناس املاک" : conn.userType}` : ""}
              </Badge>
            ) : (
              <Badge variant="outline" className="gap-1">
                <XCircle className="w-3 h-3" aria-hidden /> قطع
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* P6.5-09 — کلید ریست اتصال ARM (عین ریست PM) */}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => void reset()}
              disabled={resetting}
              aria-label="ریست اتصال ARM"
            >
              {resetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <RotateCcw className="w-3.5 h-3.5" aria-hidden />}
              ریست
            </Button>
            {isConnected && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => void disconnect()}
                disabled={disconnecting}
                aria-label="قطع اتصال ARM"
              >
                {disconnecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <Unplug className="w-3.5 h-3.5" aria-hidden />}
                قطع اتصال
              </Button>
            )}
          </div>
        </div>

        {isConnected ? (
          <div className="rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed space-y-1">
            <p className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-teal-400" aria-hidden />
              نشست جاری شما به سامانه ARM متصل است — استخراج داده واقعی و «همگام‌سازی داده‌ها» فعال است.
            </p>
            {data?.sync?.lastSuccessAt && (
              <p className="text-muted-foreground">
                آخرین استخراج موفق: {faDateTime(data.sync.lastSuccessAt)} — {faNumber(data.sync.transactionCount)} معامله و{" "}
                {faNumber(data.sync.expertCount)} کارشناس در کش
              </p>
            )}
            <Button variant="link" size="sm" className="h-auto p-0 gap-1 text-xs" onClick={() => setStage("code")}>
              <RefreshCcw className="w-3 h-3" aria-hidden /> اتصال مجدد / تعویض حساب ARM
            </Button>
          </div>
        ) : stage === "code" ? (
          <div className="space-y-1.5">
            <Label htmlFor="arm-code" className="text-xs">کد پرسنلی (مطابق سامانه ARM)</Label>
            <div className="flex gap-2">
              <Input
                id="arm-code"
                value={personnelCode}
                onChange={(e) => setPersonnelCode(e.target.value)}
                placeholder="کد پرسنلی…"
                inputMode="numeric"
                dir="ltr"
                className="text-xs"
              />
              <Button size="sm" className="shrink-0 gap-1.5" onClick={() => void startOtp()} disabled={busy}>
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <Smartphone className="w-3.5 h-3.5" aria-hidden />}
                دریافت کد پیامکی
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground leading-4">
              کد تأیید از سمت خود سامانه ARM به موبایل شما پیامک می‌شود. اگر با «کد مدیر» وارد شده‌اید، از همین‌جا اتصال داده واقعی را
              بدون خروج از حساب برقرار کنید.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="arm-otp" className="text-xs">کد پیامکی ۴ رقمی دریافتی از سامانه ARM</Label>
            <div className="flex gap-2">
              <Input
                id="arm-otp"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="کد تأیید…"
                inputMode="numeric"
                dir="ltr"
                className="text-xs"
              />
              <Button size="sm" className="shrink-0 gap-1.5" onClick={() => void verify()} disabled={busy}>
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <ShieldCheck className="w-3.5 h-3.5" aria-hidden />}
                تأیید و اتصال
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              کد برای کد پرسنلی {personnelCode || "—"} ارسال شده است. پس از تأیید، استخراج داده واقعی خودکار آغاز می‌شود.
            </p>
            {alreadySentHint && (
              <p className="text-[10px] leading-relaxed rounded-lg border border-amber-500/40 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 p-2">
                {alreadySentHint}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
