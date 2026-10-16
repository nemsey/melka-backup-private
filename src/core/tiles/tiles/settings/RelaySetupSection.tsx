"use client";

/**
 * بخش «رلهٔ Termux» — PN-034 (شورای عالی ملکا · جلسهٔ ۰۵۵)
 * ---------------------------------------------------------------------------
 * قانون مالک (۱۴۰۵/۰۷/۲۶ · جلسهٔ ۰۵۵): «صفر محدودیت اتصال».
 *
 * درس ماندگار جلسهٔ ۰۵۴ (ثبت در تاریخ شورا): «پاکسازی بیش از حد، به اندازهٔ
 * ناکافی بد است.» — PN-033 دکمهٔ تولید کد نصب را هم حذف کرد و مالک راهی
 * برای اتصال مجدد Termux نداشت. این بخش عیناً برمی‌گردد.
 *
 * احیاشده (دستور مالک · مسیر اثبات‌شدهٔ PN-031-I):
 *   · دکمهٔ «تولید کد نصب» — POST /api/admin/relay/enroll (فقط OWNER)
 *   · نمایش دستور نصب + دکمهٔ کپی + مهلت اعتبار
 *   · راهنمای ۳ خطی مسیر اثبات‌شده: openssl-tool → پیست کد → Enter
 *
 * باقی‌مانده از معماری ن۰۵۴ (پاکسازی پابرجا):
 *   · وضعیت رله: [زنده / آفلاین] + آمار عبور ۲۴ ساعت
 *   · تست تونل (دروازهٔ پایانی — تأیید خودِ مالک)
 *   · صفر APK · صفر QR · صفر رلهٔ مرورگری · صفر فهرست دستگاه‌ها
 */

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Smartphone, Activity, Copy, ShieldCheck, KeyRound } from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { faDateTime, faNumber } from "@/lib/format";
import { useAppStore } from "@/lib/client/store";

interface RelayStatusView {
  mode: string;
  active: boolean;
  devices: Array<{ deviceId: string; online: boolean; lastSeenAt: string | null; servedCount: number }>;
  queue: { pending: number; dispatched: number; done24h: number; failed24h: number; expired24h: number };
}

interface EnrollResult {
  ok: boolean;
  deviceId: string;
  label: string;
  installCommand: string;
  bootstrapUrl: string;
  enrollExpires: string;
  maxAttempts?: number;
  validityMinutes?: number;
}

interface TestResult {
  ok: boolean;
  verdict: "PASS" | "FAIL";
  httpStatus: number | null;
  roundtripMs: number;
  error: string | null;
  interpretation: string;
}

export function RelaySetupSection() {
  const { toast } = useToast();
  const role = useAppStore((s) => s.user?.role);
  const [status, setStatus] = useState<RelayStatusView | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [enroll, setEnroll] = useState<EnrollResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await api<{ ok: boolean; relay: RelayStatusView }>("/api/admin/relay/status");
      setStatus(res.relay);
    } catch {
      // بی‌صدا — نقش غیرمالک
    }
  }, []);

  useEffect(() => {
    if (role === "OWNER") void loadStatus();
  }, [role, loadStatus]);

  if (role !== "OWNER") return null;

  const onlineCount = status?.devices.filter((d) => d.online).length ?? 0;
  const relayAlive = onlineCount > 0;

  /** PN-034 — تولید کد نصب تازه (احیای مسیر اثبات‌شدهٔ PN-031-I) */
  const startEnroll = async () => {
    setEnrolling(true);
    setTest(null);
    try {
      const res = await api<EnrollResult>("/api/admin/relay/enroll", {
        method: "POST",
        body: { label: "Poco F3" },
      });
      setEnroll(res);
      void loadStatus();
      toast({
        title: "کد نصب تازه تولید شد",
        description: "دستور را کپی و در Termux پیست کنید — سه‌گامی پایین همین بخش.",
      });
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "تولید کد نصب ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setEnrolling(false);
    }
  };

  const copyCommand = async () => {
    if (!enroll) return;
    try {
      await navigator.clipboard.writeText(enroll.installCommand);
      toast({ title: "کپی شد", description: "دستور نصب در کلیپ‌بورد است — در Termux پیست کنید." });
    } catch {
      toast({ title: "کپی ناموفق", description: "دستور را دستی انتخاب و کپی کنید.", variant: "destructive" });
    }
  };

  const runTest = async () => {
    setTesting(true);
    try {
      const res = await api<TestResult>("/api/admin/relay/test", { method: "POST" });
      setTest(res);
      toast({
        title: res.verdict === "PASS" ? "تونل رله زنده است ✓" : "تونل برقرار نشد",
        description: res.interpretation,
        variant: res.verdict === "PASS" ? "default" : "destructive",
      });
      void loadStatus();
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "تست ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  return (
    <section className="rounded-xl border p-4 space-y-3" aria-label="رلهٔ Termux" id="settings-mobile-relay">
      <header className="space-y-0.5">
        <h4 className="text-sm font-bold flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-primary" aria-hidden /> رلهٔ Termux
        </h4>
        <p className="text-xs text-muted-foreground leading-relaxed">
          مسیر یگانهٔ اتصال به ملک تبریز — گوشی شما (IP ایرانی) درخواست‌ها را از طریق Termux عبور می‌دهد.
        </p>
      </header>

      {/* وضعیت رله: [زنده / آفلاین] — سند ن۰۵۴ */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge
          className={
            relayAlive
              ? "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300 gap-1"
              : "gap-1"
          }
          variant={relayAlive ? "default" : "destructive"}
        >
          <Activity className="w-3 h-3" aria-hidden />
          {relayAlive ? `رله زنده (${faNumber(onlineCount)} دستگاه)` : "رله آفلاین"}
        </Badge>
        {status && (
          <span className="text-[10px] text-muted-foreground" dir="rtl">
            عبور موفق ۲۴ ساعت گذشته: {faNumber(status.queue.done24h)}
          </span>
        )}
      </div>

      {/* PN-034 — تولید کد نصب (احیای مسیر اثبات‌شدهٔ PN-031-I · درس ۰۵۴) */}
      {!enroll ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
          <p className="text-xs leading-relaxed text-muted-foreground">
            اگر رله آفلاین است یا گوشی ری‌استارت شده: کد نصب تازه بگیرید، در Termux پیست کنید و Enter بزنید —
            مسیر سه‌گامی پیش‌روی شما (همان مسیر موفق PN-031-I).
          </p>
          <Button size="sm" className="gap-2" onClick={() => void startEnroll()} disabled={enrolling}>
            {enrolling ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <KeyRound className="w-4 h-4" aria-hidden />}
            تولید کد نصب
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-3">
          <p className="text-sm font-bold flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-teal-600" aria-hidden />
            کد نصب صادر شد: {enroll.label} <span className="font-mono text-[10px] text-muted-foreground" dir="ltr">({enroll.deviceId})</span>
          </p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            اعتبار تا <b>{faDateTime(enroll.enrollExpires)}</b> — تا <b>{faNumber(enroll.maxAttempts ?? 3)} بار</b> قابل
            استفاده (کد بخشنده). اگر تلاش اول خطا داد، همان کد را دوباره پیست کنید.
          </p>
          <div className="rounded-md bg-card border p-2">
            <p className="text-[10px] text-muted-foreground mb-1">دستور نصب — کپی و در Termux پیست کنید:</p>
            <code className="text-[11px] font-mono break-all leading-relaxed block" dir="ltr">{enroll.installCommand}</code>
          </div>
          <Button size="sm" variant="outline" className="gap-2" onClick={() => void copyCommand()}>
            <Copy className="w-3.5 h-3.5" aria-hidden /> کپی دستور نصب
          </Button>
        </div>
      )}

      {/* تست تونل — تأیید نهایی خودِ مالک */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" className="gap-2" onClick={() => void runTest()} disabled={testing}>
          {testing ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Activity className="w-4 h-4" aria-hidden />}
          تست تونل
        </Button>
        {test && (
          <Badge variant={test.verdict === "PASS" ? "default" : "destructive"} className="gap-1">
            {test.verdict === "PASS" ? "تونل زنده ✓" : "تونل بسته"}
            {test.httpStatus != null && <span className="font-mono" dir="ltr">HTTP {test.httpStatus}</span>}
            {test.roundtripMs > 0 && <span dir="rtl">{faNumber(test.roundtripMs)}ms</span>}
          </Badge>
        )}
      </div>
      {test && <p className="text-xs text-muted-foreground leading-relaxed">{test.interpretation}</p>}

      {/* راهنمای ۳ خطی — مسیر اثبات‌شدهٔ مالک (PN-031-I · عیناً احیا در PN-034) */}
      <ol className="text-xs leading-relaxed space-y-1.5 rounded-md border bg-card p-3">
        <li><b>۱.</b> Termux را باز کنید و بزنید: <code className="font-mono text-[10px]" dir="ltr">pkg install -y openssl-tool</code></li>
        <li><b>۲.</b> کد نصب بالا را (دکمهٔ کپی) در Termux پیست کنید.</li>
        <li><b>۳.</b> Enter — اتصال برقرار می‌شود؛ وضعیت بالا «زنده» و تست تونل سبز می‌شود.</li>
      </ol>
    </section>
  );
}
