"use client";

/**
 * پیکرهٔ یکپارچهٔ «اتصال به ملک تبریز» (P6546/گام صفر-۳)
 * ------------------------------------------------------
 * همانند «اتصال به دیوار» که پیکرهٔ واحدی دارد، تمام مدیریت اتصال‌ها و
 * اتصال به سامانه‌های ملک تبریز در «یک پیکرهٔ واحد» جمع شده است:
 *
 *   ۱. مدیریت اتصال‌ها — وضعیت زندهٔ خدمات + تست + همگام‌سازی + ریست
 *   ۲. اتصال به سامانه ARM (آگهی و درخواست) — کد پرسنلی + پیامک
 *   ۳. اتصال به حساب شخصی سامانه PM — کد پرسنلی + پیامک
 *
 * جلسهٔ ۰۳۳ (دستور مالک): بخش «اتصال به سامانه GAP» از تنظیمات حذف شد
 * (به‌همراه نشانگر «حساب GAP» در وضعیت اتصال‌ها — سرویس gapApi پابرجاست).
 *
 * PN-029 اولاً (دستور مالک — جلسهٔ فوق‌العاده ۰۳۳): بخش چهارم — رابطِ وب‌سایت
 * عمومی ملک تبریز — از تنظیمات عمومی حذف شد (سرویس استخراج apu پابرجاست —
 * کدهای ملکِ غایب همچنان از مسیر پایدارساز کاتالوگ افزوده می‌شوند).
 */

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Loader2, RefreshCcw, Wifi, WifiOff, Server, Landmark } from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { faDateTime, faNumber } from "@/lib/format";
import { ArmConnectionSection } from "./ArmConnectionSection";
import { PmConnectionSection } from "./PmConnectionSection";

interface ServiceStatus {
  service: string;
  label: string;
  reachable: boolean;
  databaseUp: boolean;
  httpStatus?: number;
  latencyMs: number;
  detail?: string;
}

interface ConnectionInfo {
  status: { ok: boolean; mode: string; latencyMs: number; detail: string; checkedAt: string; services?: ServiceStatus[] };
  sync: {
    lastSyncedAt: string | null;
    lastSuccessAt: string | null;
    lastError: string | null;
    lastErrorCode: string | null;
    transactionCount: number;
    expertCount: number;
    interactionCount: number;
    visitCount: number;
    supplyDemandCount: number;
    attempts: number;
  };
  config: {
    mode: string;
    armApiBase: string;
    armPublicApiBase: string;
    pmApiBase: string;
    gapApiBase?: string;
    timeoutMs: number;
    maxRetries: number;
    syncIntervalMinutes: number;
  };
  /** PN-029 — لایهٔ احتیاط اتصال خارجی (شورا-ن۰۳۳) */
  offlineMode?: boolean;
  circuitBreakers?: Array<{
    target: string;
    consecutiveFailures: number;
    lockUntil: string | null;
    nextAttemptAt: string | null;
    locked: boolean;
    cooling: boolean;
  }>;
  containerIp?: {
    currentIp: string | null;
    source: string | null;
    detectedAt: string | null;
    changed: boolean;
    historyCount: number;
  };
}

function faDigitsLocal(n: string | number): string {
  return String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

export function MelkTabrizConnectionSection() {
  const { toast } = useToast();
  const [conn, setConn] = useState<ConnectionInfo | null>(null);
  const [testing, setTesting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const testConnection = useCallback(async () => {
    setTesting(true);
    try {
      // PN-029 — live=1: پروب واقعی فقط از دکمهٔ مالک (اقدام آگاهانه)
      const res = await api<ConnectionInfo>("/api/connection/status?live=1");
      setConn(res);
      const armDbUp = res.status.services?.find((s) => s.service === "ARM_API")?.databaseUp;
      toast({
        title: res.status.ok ? (armDbUp ? "اتصال واقعی برقرار است" : "سرور پاسخ می‌دهد؛ پایگاه داده قطع است") : "اتصال برقرار نیست",
        description: res.status.detail,
        variant: res.status.ok && armDbUp ? "default" : "destructive",
      });
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "خطا در بررسی اتصال", description: e.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  }, [toast]);

  useEffect(() => {
    // بارگذاری اولیهٔ بی‌صدای وضعیت (بدون توست)
    // PN-029 — بارگذاری بی‌صدا: بدون live؛ در حالت آفلینی صفر پروب
    api<ConnectionInfo>("/api/connection/status")
      .then((res) => setConn(res))
      .catch(() => undefined);
  }, []);

  const syncNow = async () => {
    setSyncing(true);
    try {
      const res = await api<{ ok: boolean; sync: { ok: boolean; transactions: number; experts: number; interactions: number; error?: string } }>("/api/sync", {
        method: "POST",
      });
      if (res.sync.ok) {
        toast({
          title: "همگام‌سازی موفق",
          description: `${faNumber(res.sync.transactions)} معامله، ${faNumber(res.sync.experts)} کاربر و ${faNumber(res.sync.interactions)} تعامل از سامانه واقعی ملک تبریز استخراج شد.`,
        });
      } else {
        toast({
          title: "همگام‌سازی ناموفق",
          description: res.sync.error ?? "خطای نامشخص در استخراج داده از سامانه ملک تبریز.",
          variant: "destructive",
        });
      }
      void testConnection();
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "همگام‌سازی ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const resetConnection = async () => {
    setResetting(true);
    try {
      const res = await api<{ ok: boolean; resync?: { ok: boolean; error?: string } }>("/api/connection/reset", {
        method: "POST",
        body: { withData: true },
      });
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      navigator.serviceWorker?.controller?.postMessage("RESET_CACHES");
      localStorage.removeItem("melk-app-state");
      toast({
        title: "اتصال بازنشانی شد",
        description: res.resync?.ok
          ? "نشست ابطال، کش پاک و داده‌های واقعی مجدداً استخراج شدند. اکنون دوباره وارد شوید."
          : `نشست ابطال و کش پاک شد. استخراج مجدد داده در دسترس نبود: ${res.resync?.error ?? "نامشخص"}. پس از ورود با کد پرسنلی، دکمه «همگام‌سازی داده‌ها» را بزنید.`,
      });
      window.location.assign("/");
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "ریست اتصال ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setResetting(false);
    }
  };

  const gapDbUp = conn?.status.services?.find((s) => s.service === "GAP_API")?.databaseUp;
  void gapDbUp; // سرویس gapApi پابرجاست؛ نشانگر اختصاصی از جلسهٔ ۰۳۳ حذف شده است

  return (
    <Card id="settings-melk-tabriz" className="border-sec-settings-200">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Landmark className="w-5 h-5 text-sec-settings-700" aria-hidden /> اتصال به ملک تبریز
        </CardTitle>
        <CardDescription>
          پیکرهٔ واحد مدیریت اتصال به سامانه‌های ملک تبریز — ARM (آگهی و درخواست) و PM (پرسنلی)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* ========== ۱) مدیریت اتصال‌ها — وضعیت پنج سرویس ========== */}
        <section className="rounded-xl border p-4 space-y-3" aria-label="مدیریت اتصال به سامانه‌های ملک تبریز" id="settings-connection-hub">
          <header className="space-y-0.5">
            <h4 className="text-sm font-bold flex items-center gap-2">
              <Server className="w-4 h-4 text-primary" aria-hidden /> مدیریت اتصال‌ها
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              وضعیت زندهٔ سرویس‌های ملک تبریز — در صورت بروز اختلال، اتصال را ریست کنید.
            </p>
          </header>

          {conn && (
            <>
              {/* PN-029 — بنر حالت آفلینی ملک تبریز (توقف تلاش‌های خودکار) */}
              {conn.offlineMode && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-1">
                  <p className="text-sm font-bold text-amber-700 dark:text-amber-400">حالت آفلینی ملک تبریز فعال است (PN-029)</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    توقف عمدی همهٔ تلاش‌های خودکار به سامانه‌های ملک تبریز تا پایان تشخیص ریشه — دکترین شورا: «اول تشخیص، بعد اقدام». M1 تا M5 از دادهٔ محلی کار می‌کنند. دکمهٔ «تست اتصال» تنها پروب زندهٔ مجاز است.
                  </p>
                </div>
              )}

              {/* PN-029 — گارد IP کانتینر + فیوزهای قطع‌کننده */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-lg border bg-card p-3">
                  <p className="text-xs text-muted-foreground">IP عمومی کانتینر (گارد ۶ساعته)</p>
                  <p className="text-sm font-bold" dir="ltr">
                    {conn.containerIp?.currentIp ?? "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {conn.containerIp?.detectedAt
                      ? `آخرین ثبت: ${faDateTime(conn.containerIp.detectedAt)}${conn.containerIp.changed ? " — تغییر نسبت به قبل!" : ""}`
                      : "هنوز ثبت نشده (کارِ Worker هر ۶ ساعت)"}
                  </p>
                </div>
                <div className="rounded-lg border bg-card p-3">
                  <p className="text-xs text-muted-foreground">فیوز قطع‌کنندهٔ اتصال (Retry هوشمند)</p>
                  <p className="text-sm font-bold">
                    {(conn.circuitBreakers ?? []).length === 0
                      ? "همهٔ میزبانها عادی"
                      : (conn.circuitBreakers ?? []).some((b) => b.locked)
                        ? "قفل ۲۴ ساعته فعال"
                        : (conn.circuitBreakers ?? []).some((b) => b.cooling)
                          ? "خنک‌ساز فعال (تا ۶ ساعت)"
                          : "همهٔ میزبانها عادی"}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    قانون PN-029: یک تلاش در ۶ ساعت · سه شکست پیاپی = قفل ۲۴ ساعته
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-lg border bg-card p-3 flex items-center gap-2">
                  {conn.status.services?.some((s) => s.databaseUp) ? (
                    <Wifi className="w-4 h-4 text-teal-600 dark:text-teal-400" aria-hidden />
                  ) : (
                    <WifiOff className="w-4 h-4 text-amber-600" aria-hidden />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">وضعیت سرورها</p>
                    <p className="text-sm font-bold">
                      {conn.status.services?.some((s) => s.databaseUp)
                        ? "فعال"
                        : conn.status.ok
                          ? "پاسخ‌گو / پایگاه داده قطع"
                          : "قطع"}
                    </p>
                  </div>
                </div>
                <div className="rounded-lg border bg-card p-3">
                  <p className="text-xs text-muted-foreground">حالت اتصال</p>
                  <p className="text-sm font-bold text-teal-700 dark:text-teal-400">
                    {conn.offlineMode ? "آفلینی تشخیصی (PN-029)" : "اتصال واقعی"}
                  </p>
                </div>
                <div className="rounded-lg border bg-card p-3">
                  <p className="text-xs text-muted-foreground">زمان پاسخ</p>
                  <p className="text-sm font-bold" dir="rtl">
                    {conn.status.latencyMs >= 0 ? `${faDigitsLocal(conn.status.latencyMs)} میلی‌ثانیه` : "—"}
                  </p>
                </div>
              </div>

              {/* وضعیت تفصیلی هر سرویس (ARM ×۲ + PM + سامانه عمومی + GAP) */}
              {conn.status.services && (
                <div className="rounded-lg border divide-y">
                  {conn.status.services.map((s) => (
                    <div key={s.service} className="flex items-center justify-between gap-2 p-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{s.label}</p>
                        <p className="text-xs text-muted-foreground truncate">{s.detail}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {s.databaseUp ? (
                          <Badge className="bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300 gap-1">
                            <Wifi className="w-3 h-3" aria-hidden /> سالم
                          </Badge>
                        ) : s.reachable ? (
                          <Badge className="bg-amber-500 text-amber-950 gap-1">
                            <WifiOff className="w-3 h-3" aria-hidden /> پایگاه داده قطع
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="gap-1">
                            <WifiOff className="w-3 h-3" aria-hidden /> در دسترس نیست
                          </Badge>
                        )}
                        {s.httpStatus ? (
                          <span className="text-[10px] font-mono text-muted-foreground" dir="ltr">
                            {s.httpStatus}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* وضعیت آخرین همگام‌سازی داده واقعی */}
              {conn.sync && (
                <div className="rounded-lg border bg-muted/40 p-3 space-y-1 text-xs leading-relaxed">
                  <p>
                    آخرین استخراج موفق داده واقعی:{" "}
                    <b>{conn.sync.lastSuccessAt ? faDateTime(conn.sync.lastSuccessAt) : "هنوز انجام نشده"}</b>
                  </p>
                  <p>
                    داده‌های کش‌شده: <b>{faNumber(conn.sync.transactionCount)}</b> معامله،{" "}
                    <b>{faNumber(conn.sync.expertCount)}</b> کاربر،{" "}
                    <b>{faNumber(conn.sync.interactionCount)}</b> تعامل،{" "}
                    <b>{faNumber(conn.sync.visitCount)}</b> بازدید و{" "}
                    <b>{faNumber(conn.sync.supplyDemandCount)}</b> بازه عرضه/تقاضا
                    {conn.sync.attempts > 0 && conn.sync.lastError ? ` — آخرین خطا: ${conn.sync.lastError}` : ""}
                  </p>
                </div>
              )}
            </>
          )}

          {/* نشانی رابط‌های برنامه‌نویسی همهٔ سامانه‌های ملک تبریز (گام صفر-۱) */}
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              رابط سامانه آگهی و درخواست (آرم):{" "}
              <span dir="ltr" className="font-mono">
                {conn?.config.armApiBase ?? "https://arus-api.melketabriz.ir/api/apm/"}
              </span>
            </p>
            <p>
              رابط سامانه پرسنلی (پی‌ام):{" "}
              <span dir="ltr" className="font-mono">
                {conn?.config.pmApiBase ?? "https://pm-api.melketabriz.ir/api/"}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={() => void testConnection()} disabled={testing}>
              {testing ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <RefreshCcw className="w-4 h-4" aria-hidden />}
              تست اتصال
            </Button>

            <Button variant="secondary" size="sm" className="gap-2" onClick={() => void syncNow()} disabled={syncing}>
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Server className="w-4 h-4" aria-hidden />}
              همگام‌سازی داده‌ها
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" className="gap-2" disabled={resetting}>
                  {resetting ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <RefreshCcw className="w-4 h-4" aria-hidden />}
                  ریست اتصال
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent dir="rtl">
                <AlertDialogHeader className="text-right space-y-2 items-start">
                  <AlertDialogTitle className="text-right">ریست کامل اتصال؟</AlertDialogTitle>
                  <AlertDialogDescription className="text-right leading-relaxed">
                    این عملیات نشست شما را ابطال، کش داده‌ها را پاک و اتصال به سامانه ملک تبریز را از نو برقرار می‌کند.
                    سپس باید دوباره وارد شوید. ادامه می‌دهید؟
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="gap-2">
                  <AlertDialogCancel>انصراف</AlertDialogCancel>
                  <AlertDialogAction onClick={() => void resetConnection()}>بله، ریست کن</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </section>

        {/* ========== ۲) اتصال به سامانه ARM ========== */}
        <ArmConnectionSection embedded />

        {/* ========== ۳) اتصال به حساب شخصی سامانه PM ========== */}
        <PmConnectionSection embedded />

        {/* PN-029 اولاً (جلسهٔ فوق‌العاده ۰۳۳): بخش چهارم — رابط سامانهٔ وب‌سایت عمومی —
            به دستور مالک از تنظیمات حذف شد (سرویس استخراج apu پابرجاست — از مسیر
            پایدارساز کاتالوگ، بدون حضور در تنظیمات) */}
      </CardContent>
    </Card>
  );
}
