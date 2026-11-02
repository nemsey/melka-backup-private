"use client";

/**
 * بخش «اتصال به سامانه GAP» در تنظیمات عمومی (P6546/گام صفر)
 * ------------------------------------------------------
 * سامانه گفت‌وگوی آنلاین ملک تبریز (gap.melketabriz.ir)
 * جریان همانند اتصال به سامانه ARM و اتصال به حساب شخصی سامانه PM:
 *   کد پرسنلی → پیامک GAP → تأیید کد → توکن ذخیره‌شده
 * چراغ‌های «حساب شخصی GAP» و «API سامانه GAP» در صفحه خانه از همین اتصال سبز می‌شوند.
 * بک‌اند کشف‌شده: gap-api.melketabriz.ir/api/ (شاهد: download/p6546/systems-discovery-*.json)
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Smartphone, RotateCcw, ShieldCheck, XCircle, MessagesSquare } from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { faDateTime } from "@/lib/format";

interface GapConnectionResponse {
  ok: boolean;
  connection: {
    status: "connected" | "disconnected" | "pending" | "error";
    personnelCode: string | null;
    displayName: string | null;
    hasToken: boolean;
    lastCheckedAt: string | null;
    lastError: string | null;
    apiBase: string;
    frontUrl: string;
  };
}

export function GapConnectionSection({ embedded = false }: { embedded?: boolean } = {}) {
  const { toast } = useToast();
  const [data, setData] = useState<GapConnectionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [personnelCode, setPersonnelCode] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<"code" | "otp">("code");
  const [busy, setBusy] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [alreadySentHint, setAlreadySentHint] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api<GapConnectionResponse>("/api/gap/connection");
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
      const res = await api<{ ok: boolean; message: string; alreadySent?: boolean }>("/api/gap/connection", {
        method: "POST",
        body: { action: "start-otp", personnelCode: trimmed },
      });
      if (res.ok) {
        setStage("otp");
        setAlreadySentHint(res.alreadySent ? res.message : "");
        toast({
          title: res.alreadySent ? "پیامک قبلاً ارسال شده" : "کد پیامکی GAP ارسال شد",
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
      toast({ title: "کد نامعتبر", description: "کد پیامکی GAP را کامل وارد کنید.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await api<{ ok: boolean; message: string }>("/api/gap/connection", {
        method: "POST",
        body: { action: "verify", personnelCode: personnelCode.trim(), code: digits },
      });
      toast({
        title: res.ok ? "اتصال سامانه GAP برقرار شد" : "تأیید ناموفق",
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

  const reset = async () => {
    setResetting(true);
    try {
      const res = await api<{ ok: boolean; message: string }>("/api/gap/connection", {
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
      <section className="rounded-xl border p-4" aria-busy="true">
        <Skeleton className="h-24 w-full rounded-xl" />
      </section>
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
          aria-label="ریست اتصال GAP"
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
            حساب سامانه گفت‌وگو «{conn.displayName ?? conn.personnelCode ?? "—"}» متصل است — چراغ‌های «حساب شخصی GAP» و «API سامانه GAP» در صفحه خانه سبز می‌شوند.
          </p>
        </div>
      ) : stage === "code" ? (
        <div className="space-y-1.5">
          <Label htmlFor="gap-code" className="text-xs">کد پرسنلی (مطابق سامانه‌های ملک تبریز)</Label>
          <div className="flex gap-2">
            <Input id="gap-code" value={personnelCode} onChange={(e) => setPersonnelCode(e.target.value)} placeholder="کد پرسنلی…" dir="ltr" className="text-xs" />
            <Button size="sm" className="shrink-0 gap-1.5" onClick={() => void startOtp()} disabled={busy}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <Smartphone className="w-3.5 h-3.5" aria-hidden />}
              دریافت کد پیامکی GAP
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground leading-4">
            سامانه گفت‌وگوی آنلاین ملک تبریز (gap.melketabriz.ir) — بک‌اند gap-api.melketabriz.ir. اگر مسیر پیامک سامانه تغییر کرده باشد، پیام خطای دقیق نمایش داده می‌شود و پایهٔ API با MELK_GAP_API_BASE قابل تنظیم است.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="gap-otp" className="text-xs">کد پیامکی دریافتی از سامانه GAP</Label>
          <div className="flex gap-2">
            <Input id="gap-otp" value={code} onChange={(e) => setCode(e.target.value)} placeholder="کد تأیید…" inputMode="numeric" dir="ltr" className="text-xs" />
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

  return (
    <section className="rounded-xl border p-4 space-y-4" aria-label="اتصال به سامانه GAP">
      <header className="space-y-0.5">
        <h4 className="text-sm font-bold flex items-center gap-2">
          <MessagesSquare className="w-4 h-4 text-primary" aria-hidden /> اتصال به سامانه GAP (گفت‌وگوی آنلاین)
        </h4>
        <p className="text-xs text-muted-foreground leading-relaxed">
          سامانه گفت‌وگوی آنلاین ملک تبریز (gap.melketabriz.ir) — با کد پرسنلی + پیامک، همانند اتصال ARM و PM
        </p>
      </header>
      {body}
    </section>
  );
}
