"use client";

/**
 * بخش «رلهٔ Termux» — PN-034 (شورا-ن۰۵۵) · ارتقای کامل PN-041-R (شورا-ن۰۶۸ · فاز ۳)
 * ---------------------------------------------------------------------------
 * قانون مالک (۱۴۰۵/۰۷/۲۶ · جلسهٔ ۰۵۵): «صفر محدودیت اتصال».
 *
 * ۸ سنجهٔ مصوب شورا-ن۰۶۸ (بخش ۳ سند):
 *   ۱) وضعیت دقیق ۳ لایه (نبض گوشی · فعالیت مسیر · تازگی داده/بکاپ) — همهٔ نقش‌ها
 *   ۲) دکمهٔ «تولید کد نصب» + دستور (فقط OWNER — درس ۰۵۴: دکمه حذف نشود؛
 *      PN-047/گام دوم-۲: نمایش QR کد نصب به دستور مالک حذف شد — مسیر نصب =
 *      کپی دستور در Termux، همچنان سه‌گامی پایین همین بخش)
 *   ۳) راهنمای تصویری MIUI (MiuiWakeLockGuide — دلیل قطعی ۱)
 *   ۴) نمایش Timeout تطبیقی + Long-Polling ۱۰۰ث (بند ۲.۲+۲.۴)
 *   ۵) دکمهٔ «تست اتصال» بدون نیاز به نقش مالک (هر نشست فعال)
 *   ۶) وضعیت زنده/آفلاین + شمار دستگاه‌ها
 *   ۷) آمار عبور ۲۴ ساعت (OWNER)
 *   ۸) راهنمای ۳ خطی مسیر اثبات‌شدهٔ نصب
 *
 * درس ماندگار جلسهٔ ۰۵۴: «پاکسازی بیش از حد، به اندازهٔ ناکافی بد است.»
 */

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Smartphone, Activity, Copy, ShieldCheck, KeyRound, Wifi, Timer, HeartPulse, Database, Gauge } from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { faDateTime, faNumber } from "@/lib/format";
import { useAppStore } from "@/lib/client/store";
import { MiuiWakeLockGuide } from "./MiuiWakeLockGuide";

interface RelayStatusView {
  mode: string;
  active: boolean;
  devices: Array<{ deviceId: string; online: boolean; lastSeenAt: string | null; servedCount: number }>;
  queue: { pending: number; dispatched: number; done24h: number; failed24h: number; expired24h: number };
}

interface RelayHealthView {
  ok: boolean;
  verdict: "green" | "yellow" | "red" | string;
  verdictFa?: string;
  layers: Array<{ key: string; label: string; state: "green" | "yellow" | "red" | string; detail: string; measuredAt: string }>;
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

const LAYER_ICON: Record<string, React.ReactNode> = {
  heartbeat: <HeartPulse className="w-3 h-3" aria-hidden />,
  "api-probe": <Wifi className="w-3 h-3" aria-hidden />,
  "full-sync": <Database className="w-3 h-3" aria-hidden />,
};

const LAYER_COLOR: Record<string, string> = {
  green: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300",
  yellow: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  red: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

export function RelaySetupSection() {
  const { toast } = useToast();
  const role = useAppStore((s) => s.user?.role);
  const [status, setStatus] = useState<RelayStatusView | null>(null);
  const [health, setHealth] = useState<RelayHealthView | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [enroll, setEnroll] = useState<EnrollResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);
  const [probing, setProbing] = useState(false);

  /** سنجهٔ ۱ — وضعیت ۳ لایه از /api/relay/health (هر نشست فعال · بدون نقش مالک) */
  const loadHealth = useCallback(async () => {
    setProbing(true);
    try {
      const res = await api<RelayHealthView>("/api/relay/health", { timeoutMs: 15_000 });
      setHealth(res);
    } catch {
      setHealth(null);
    } finally {
      setProbing(false);
    }
  }, []);

  const loadStatus = useCallback(async () => {
    try {
      const res = await api<{ ok: boolean; relay: RelayStatusView }>("/api/admin/relay/status");
      setStatus(res.relay);
    } catch {
      // بی‌صدا — نقش غیرمالک
    }
  }, []);

  useEffect(() => {
    void loadHealth();
    const t = setInterval(() => void loadHealth(), 60_000); // تازگی هر دقیقه
    return () => clearInterval(t);
  }, [loadHealth]);

  useEffect(() => {
    if (role === "OWNER") void loadStatus();
  }, [role, loadStatus]);

  const onlineCount = status?.devices.filter((d) => d.online).length ?? 0;
  const relayAlive = health ? health.verdict !== "red" : onlineCount > 0;

  /** سنجهٔ ۲ — تولید کد نصب تازه (OWNER) */
  const startEnroll = async () => {
    setEnrolling(true);
    setTest(null);
    try {
      const res = await api<EnrollResult>("/api/admin/relay/enroll", {
        method: "POST",
        body: { label: "Poco F3" },
        timeoutMs: 20_000,
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

  /** سنجهٔ ۵ — تست اتصال: هر نقش (پرچ ۳ لایه) + تونل کامل برای OWNER */
  const runTest = async () => {
    setTesting(true);
    try {
      if (role === "OWNER") {
        const res = await api<TestResult>("/api/admin/relay/test", { method: "POST", timeoutMs: 30_000 });
        setTest(res);
        toast({
          title: res.verdict === "PASS" ? "تونل رله زنده است ✓" : "تونل برقرار نشد",
          description: res.interpretation,
          variant: res.verdict === "PASS" ? "default" : "destructive",
        });
      }
      await loadHealth();
      if (role !== "OWNER" && health) {
        toast({
          title: health.verdict === "green" ? "اتصال رله سالم ✓" : "رله نیازمند توجه",
          description: health.verdictFa ?? "وضعیت ۳ لایه بالا را ببینید.",
          variant: health.verdict === "green" ? "default" : "destructive",
        });
      }
      void loadStatus();
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "تست ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const isOwner = role === "OWNER";

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

      {/* سنجهٔ ۶ — وضعیت کلی زنده/آفلاین */}
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
          {relayAlive ? `رله زنده${status ? ` (${faNumber(onlineCount)} دستگاه)` : ""}` : "رله آفلاین"}
        </Badge>
        {status && isOwner && (
          <span className="text-[10px] text-muted-foreground" dir="rtl">
            عبور موفق ۲۴ ساعت گذشته: {faNumber(status.queue.done24h)}
          </span>
        )}
      </div>

      {/* سنجهٔ ۱ — وضعیت دقیق ۳ لایه (نبض · مسیر · تازگی) */}
      {health ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2" aria-label="وضعیت سه‌لایهٔ رله">
          {health.layers?.map((l) => (
            <div
              key={l.key}
              className={`rounded-md border p-2 space-y-1 ${LAYER_COLOR[l.state] ?? ""}`}
              title={l.detail}
            >
              <p className="text-[11px] font-bold flex items-center gap-1.5">
                {LAYER_ICON[l.key] ?? <Gauge className="w-3 h-3" aria-hidden />}
                {l.label}
              </p>
              <p className="text-[10px] leading-snug opacity-90">{l.detail}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground">وضعیت ۳ لایه در حال بارگذاری…</p>
      )}

      {/* سنجهٔ ۴ — Timeout تطبیقی + Long-Polling (بند ۲.۲+۲.۴) */}
      <div className="flex flex-wrap gap-1.5" aria-label="پیکربندی حمل‌ونقل رله">
        <Badge variant="outline" className="gap-1 text-[10px] font-normal">
          <Timer className="w-3 h-3" aria-hidden /> Poll طولانی: ۱۰۰ ثانیه
        </Badge>
        <Badge variant="outline" className="gap-1 text-[10px] font-normal">
          سبک (ورود): ۲۰ث
        </Badge>
        <Badge variant="outline" className="gap-1 text-[10px] font-normal">
          سنگین (فهرست‌ها): ۱۵۰ث
        </Badge>
        <Badge variant="outline" className="gap-1 text-[10px] font-normal">
          ~۸۶۰ درخواست/روز (قبلاً ۳۴۵۶)
        </Badge>
      </div>

      {/* سنجهٔ ۵ — تست اتصال (بدون نیاز به نقش مالک) */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" className="gap-2" onClick={() => void runTest()} disabled={testing || probing}>
          {testing ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Activity className="w-4 h-4" aria-hidden />}
          {isOwner ? "تست تونل" : "تست اتصال"}
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

      {/* سنجهٔ ۲ — تولید کد نصب + دستور (OWNER — درس ۰۵۴: دکمه حذف نشود)
          PN-047/گام دوم-۲ (دستور مالک ۱۴۰۵/۰۷/۲۹): بخش QR کد نصب حذف شد —
          مسیر اثبات‌شدهٔ نصب همان کپی/پیست دستور در Termux است. */}
      {isOwner && !enroll ? (
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
      ) : null}

      {isOwner && enroll ? (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-3">
          <p className="text-sm font-bold flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-teal-600" aria-hidden />
            کد نصب صادر شد: {enroll.label}{" "}
            <span className="font-mono text-[10px] text-muted-foreground" dir="ltr">({enroll.deviceId})</span>
          </p>
          {/* PN-047/گام دوم-۲ (دستور مالک ۱۴۰۵/۰۷/۲۹): بخش QR کد نصب حذف شد —
              مسیر اثبات‌شدهٔ نصب = کپی/پیست دستور در Termux (درس ۰۵۴: دکمهٔ تولید حفظ) */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground leading-relaxed">
              اعتبار تا <b>{faDateTime(enroll.enrollExpires)}</b> — تا{" "}
              <b>{faNumber(enroll.maxAttempts ?? 3)} بار</b> قابل استفاده (کد بخشنده). اگر تلاش اول خطا داد،
              همان کد را دوباره پیست کنید.
            </p>
            <div className="rounded-md bg-card border p-2">
              <p className="text-[10px] text-muted-foreground mb-1">دستور نصب — کپی و در Termux پیست کنید:</p>
              <code className="text-[11px] font-mono break-all leading-relaxed block" dir="ltr">
                {enroll.installCommand}
              </code>
            </div>
            <Button size="sm" variant="outline" className="gap-2" onClick={() => void copyCommand()}>
              <Copy className="w-3.5 h-3.5" aria-hidden /> کپی دستور نصب
            </Button>
          </div>
        </div>
      ) : null}

      {/* سنجهٔ ۳ — راهنمای تصویری MIUI (دلیل قطعی ۱) */}
      <MiuiWakeLockGuide />

      {/* سنجهٔ ۸ — راهنمای ۳ خطی مسیر اثبات‌شدهٔ مالک (PN-031-I) */}
      <ol className="text-xs leading-relaxed space-y-1.5 rounded-md border bg-card p-3">
        <li>
          <b>۱.</b> Termux را باز کنید و بزنید:{" "}
          <code className="font-mono text-[10px]" dir="ltr">
            pkg install -y openssl-tool
          </code>
        </li>
        <li>
          <b>۲.</b> کد نصب بالا را (دکمهٔ کپی) در Termux پیست کنید.
        </li>
        <li>
          <b>۳.</b> Enter — اتصال برقرار می‌شود؛ وضعیت بالا «زنده» و تست تونل سبز می‌شود.
        </li>
      </ol>
    </section>
  );
}
