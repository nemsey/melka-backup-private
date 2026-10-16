"use client";

/**
 * بخش «رلهٔ Termux» — PN-033 (شورای عالی ملکا · جلسهٔ فوق‌العاده ۰۵۴)
 * ---------------------------------------------------------------------------
 * پاکسازی کامل سند ن۰۵۴ — «فقط یک چیز می‌ماند: رلهٔ Termux + کدپرسنلی + OTP».
 *
 * حذف‌شده‌ها (دستور مالک · ۱۴۰۵/۰۷/۲۶):
 *   · کارت اپ اندروید + دکمهٔ دانلود APK (PN-031-D) — Termux کافی است
 *   · همهٔ QRها (نصب و APK) — فقط دستور متنی از GLM
 *   · رلهٔ مرورگری (رویکرد B · PN-031) — مسیر یگانه: Termux
 *   · فهرست ۱۰+ دستگاه‌های قدیمی — DB پاکسازی شد (PN-033 فاز ۲: فقط ۱ فعال)
 *   · دکمهٔ «راه‌اندازی رله» — ثبت دستگاه تازه از این پس فقط توسط GLM
 *     (مدیر) انجام می‌شود؛ مالک فقط Termux را باز نگه می‌دارد.
 *
 * باقی‌مانده (معماری هدف سند ن۰۵۴):
 *   · وضعیت رله: [زنده / آفلاین]
 *   · تست تونل (دروازهٔ پایانی — تأیید خودِ مالک)
 *   · راهنمای ۳ خطی Termux (بدون APK · بدون QR · بدون Worker)
 */

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Smartphone, Activity } from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { faNumber } from "@/lib/format";
import { useAppStore } from "@/lib/client/store";

interface RelayStatusView {
  mode: string;
  active: boolean;
  devices: Array<{ deviceId: string; online: boolean; lastSeenAt: string | null; servedCount: number }>;
  queue: { pending: number; dispatched: number; done24h: number; failed24h: number; expired24h: number };
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

      {/* راهنمای ۳ خطی Termux — بدون APK · بدون QR · بدون Worker (سند ن۰۵۴) */}
      <ol className="text-xs leading-relaxed space-y-1.5 rounded-md border bg-card p-3">
        <li><b>۱.</b> Termux گوشی را باز نگه دارید — اسکریپت رله باید در حال اجرا باشد (وضعیت بالا «زنده»).</li>
        <li><b>۲.</b> اگر گوشی ری‌استارت شد یا خطا دیدید، از GLM دستور نصب تازه بگیرید و در Termux پیست کنید.</li>
        <li><b>۳.</b> سپس در بخش «ورود مجدد به ملک تبریز» کد پرسنلی را وارد و کد پیامکی را تأیید کنید.</li>
      </ol>
    </section>
  );
}
