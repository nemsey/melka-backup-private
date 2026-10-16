"use client";

/**
 * بخش «اتصال به حساب شخصی سامانه PM» در تنظیمات عمومی
 * ------------------------------------------------------
 * جریان عین خود سامانه پرسنلی: کد پرسنلی → پیامک PM → تأیید کد → توکن ذخیره‌شده
 * چراغ «حساب شخصی PM» در صفحه خانه از همین اتصال سبز می‌شود.
 *
 * P6546/گام صفر — پیکرهٔ یکپارچهٔ «اتصال به ملک تبریز»:
 *   embedded=true → همین بخش به‌جای Card مستقل، به‌صورت بخش توکار داخل
 *   پیکرهٔ یکپارچهٔ «اتصال به ملک تبریز» رندر می‌شود (الگوی یکپارچهٔ دیوار).
 */

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Smartphone, RotateCcw, ShieldCheck, XCircle, Server } from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { pollRelayJob } from "@/lib/client/relay-job";
import { faDateTime } from "@/lib/format";

interface PmConnectionResponse {
  ok: boolean;
  connection: {
    status: "connected" | "disconnected" | "pending" | "error";
    personnelCode: string | null;
    displayName: string | null;
    hasToken: boolean;
    lastCheckedAt: string | null;
    lastError: string | null;
  };
}

export function PmConnectionSection({ embedded = false }: { embedded?: boolean } = {}) {
  const { toast } = useToast();
  const [data, setData] = useState<PmConnectionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [personnelCode, setPersonnelCode] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"code" | "otp">("code");
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  /** پیامک قبلاً ارسال شده — راهنمای گام تأیید (P6.5-09) */
  const [alreadySentHint, setAlreadySentHint] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api<PmConnectionResponse>("/api/pm/connection");
      setData(res);
      setStage(res.connection.status === "pending" ? "otp" : "code");
    } catch {
      // بی‌صدا
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startOtp = async () => {
    const trimmed = personnelCode.trim();
    if (trimmed.length < 3) {
      toast({ title: "کد پرسنلی نامعتبر", description: "کد پرسنلی خود را کامل وارد کنید.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      // PN-035 (شورا-ن۰۵۷ · فاز ۳+۴ · Eager UI): پاسخ فوری {jobId}؛ فیلد کد
      // تأیید همان لحظه نمایش داده می‌شود؛ نتیجه در پس‌زمینه poll می‌شود.
      const res = await api<{ ok: boolean; jobId?: string; message?: string; alreadySent?: boolean }>("/api/pm/connection", {
        method: "POST",
        body: { action: "start-otp", personnelCode: trimmed },
        timeoutMs: 10_000,
      });
      if (res.jobId) {
        setStage("otp");
        setAlreadySentHint("");
        toast({
          title: "در حال ارسال پیامک…",
          description: "فیلد کد تأیید آماده است — پیامک از مسیر رلهٔ موبایل در راه است.",
        });
        const out = await pollRelayJob<{ message?: string; alreadySent?: boolean }>(res.jobId, { attempts: 60 });
        if (out.ok && out.result) {
          setAlreadySentHint(out.result.alreadySent ? out.result.message ?? "" : "");
          toast({
            title: out.result.alreadySent ? "پیامک قبلاً ارسال شده" : "کد پیامکی PM ارسال شد",
            description: out.result.message,
          });
        } else if (out.kind === "failed") {
          toast({ title: "ارسال کد ناموفق", description: out.error?.message ?? "خطای ارسال پیامک.", variant: "destructive" });
        }
      } else if (res.ok) {
        setStage("otp");
        setAlreadySentHint(res.alreadySent ? res.message ?? "" : "");
        toast({
          title: res.alreadySent ? "پیامک قبلاً ارسال شده" : "کد پیامکی PM ارسال شد",
          description: res.message,
        });
      } else {
        toast({ title: "ارسال کد ناموفق", description: res.message, variant: "destructive" });
      }
      await load();
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "ارسال کد ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    const digits = code.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/\D/g, "");
    if (digits.length < 4) {
      toast({ title: "کد نامعتبر", description: "کد پیامکی PM را کامل وارد کنید.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      // PN-035 (فاز ۳): verify async — تأیید در پس‌زمینه از مسیر رله.
      const res = await api<{ ok: boolean; jobId?: string; message?: string }>("/api/pm/connection", {
        method: "POST",
        body: { action: "verify", personnelCode: personnelCode.trim(), code: digits },
        timeoutMs: 10_000,
      });
      let ok = res.ok;
      let message = res.message;
      if (res.jobId) {
        const out = await pollRelayJob<{ message?: string }>(res.jobId, { attempts: 60 });
        if (out.ok && out.result) {
          ok = true;
          message = out.result.message;
        } else {
          ok = false;
          message = out.error?.message ?? "تأیید ناموفق بود.";
        }
      }
      toast({
        title: ok ? "اتصال حساب شخصی PM برقرار شد" : "تأیید ناموفق",
        description: message,
        variant: ok ? "default" : "destructive",
      });
      if (ok) {
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

  const reset = async () => {
    setResetting(true);
    try {
      const res = await api<{ ok: boolean; message: string }>("/api/pm/connection", {
        method: "POST",
        body: { action: "reset" },
      });
      toast({ title: "ریست انجام شد", description: res.message });
      setStage("code");
      setCode("");
      await load();
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "ریست ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return embedded ? (
      <section className="rounded-xl border p-4" aria-busy="true">
        <Skeleton className="h-24 w-full rounded-xl" />
      </section>
    ) : (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Server className="w-5 h-5 text-primary" aria-hidden /> اتصال به حساب شخصی سامانه PM
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-24 w-full rounded-xl" />
        </CardContent>
      </Card>
    );
  }

  const conn = data?.connection;

  const body = (
    <>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          {conn?.status === "connected" ? (
            <Badge className="gap-1 bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300">
              <ShieldCheck className="w-3 h-3" aria-hidden /> متصل{conn.displayName ? ` — ${conn.displayName}` : ""}
            </Badge>
          ) : conn?.status === "pending" ? (
            <Badge variant="secondary" className="gap-1">
              <Loader2 className="w-3 h-3 animate-spin" aria-hidden /> در انتظار کد
            </Badge>
          ) : conn?.status === "error" ? (
            <Badge variant="destructive" className="gap-1">
              <XCircle className="w-3 h-3" aria-hidden /> خطا
            </Badge>
          ) : (
            <Badge variant="outline">قطع</Badge>
          )}
          {conn?.lastCheckedAt && <span className="text-[10px] text-muted-foreground">{faDateTime(conn.lastCheckedAt)}</span>}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => void reset()}
          disabled={resetting || conn?.status === "disconnected"}
          aria-label="ریست اتصال PM"
        >
          {resetting ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <RotateCcw className="w-3.5 h-3.5" aria-hidden />}
          ریست
        </Button>
      </div>

      {conn?.lastError && <p className="text-[10px] text-destructive leading-4">{conn.lastError}</p>}

      {conn?.status === "connected" ? (
        <div className="rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed">
          <p className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-teal-400" aria-hidden />
            حساب پرسنلی «{conn.displayName ?? conn.personnelCode ?? "—"}» متصل است — چراغ «حساب شخصی PM» در صفحه خانه سبز است.
          </p>
        </div>
      ) : stage === "code" ? (
        <div className="space-y-1.5">
          <Label htmlFor="pm-code" className="text-xs">کد پرسنلی (مطابق سامانه PM)</Label>
          <div className="flex gap-2">
            <Input id="pm-code" value={personnelCode} onChange={(e) => setPersonnelCode(e.target.value)} placeholder="کد پرسنلی…" dir="ltr" className="text-xs" />
            <Button size="sm" className="shrink-0 gap-1.5" onClick={() => void startOtp()} disabled={busy}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <Smartphone className="w-3.5 h-3.5" aria-hidden />}
              دریافت کد پیامکی PM
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground leading-4">
            کد تأیید از سمت خود سامانه پرسنلی ملک تبریز به موبایل شما پیامک می‌شود.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="pm-otp" className="text-xs">کد پیامکی دریافتی از سامانه PM</Label>
          <div className="flex gap-2">
            <Input id="pm-otp" value={code} onChange={(e) => setCode(e.target.value)} placeholder="کد تأیید…" inputMode="numeric" dir="ltr" className="text-xs" />
            <Button size="sm" className="shrink-0 gap-1.5" onClick={() => void verify()} disabled={busy}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <ShieldCheck className="w-3.5 h-3.5" aria-hidden />}
              تأیید و اتصال
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">کد برای کد پرسنلی {personnelCode || conn?.personnelCode} ارسال شده است.</p>
          {alreadySentHint && (
            <p className="text-[10px] leading-relaxed rounded-lg border border-amber-500/40 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 p-2">
              {alreadySentHint}
            </p>
          )}
        </div>
      )}
    </>
  );

  // P6546/گام صفر — توکار داخل پیکرهٔ یکپارچهٔ «اتصال به ملک تبریز»
  if (embedded) {
    return (
      <section className="rounded-xl border p-4 space-y-4" aria-label="اتصال به حساب شخصی سامانه PM">
        <header className="space-y-0.5">
          <h4 className="text-sm font-bold flex items-center gap-2">
            <Server className="w-4 h-4 text-primary" aria-hidden /> اتصال به حساب شخصی سامانه PM
          </h4>
          <p className="text-xs text-muted-foreground leading-relaxed">سامانه مدیریت پرسنلی ملک تبریز (pm.melketabriz.ir) — با کد پرسنلی + پیامک، عین خود سامانه</p>
        </header>
        {body}
      </section>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Server className="w-5 h-5 text-primary" aria-hidden /> اتصال به حساب شخصی سامانه PM
        </CardTitle>
        <CardDescription>سامانه مدیریت پرسنلی ملک تبریز (pm.melketabriz.ir) — با کد پرسنلی + پیامک، عین خود سامانه</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">{body}</CardContent>
    </Card>
  );
}
