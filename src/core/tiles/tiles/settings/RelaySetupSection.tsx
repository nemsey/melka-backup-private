"use client";

/**
 * بخش «رلهٔ موبایل ایرانی» — PN-031 (شورای عالی ملکا · جلسهٔ فوق‌العاده ۰۳۷)
 * ---------------------------------------------------------------------------
 * راهکار صفر-هزینه عبور از سد جغرافیایی فایروال ملک تبریز: گوشی مالک
 * (Poco F3 · IP ایرانی) به‌عنوان رلهٔ Pull-based.
 *
 * نمایش‌شرط: فقط نقش OWNER (ثبت/تست/ابطال دستگاه رله فقط مالک).
 *
 * بخش‌ها:
 *   ۱) وضعیت رله (دستگاه‌ها + صف + آمار ۲۴س)
 *   ۲) راه‌اندازی — دکمهٔ ثبت دستگاه → QR + دستور نصب + راهنمای ۵مرحله‌ای
 *   ۳) تست تونل (دروازهٔ پایانی — پیش‌شرط برداشتن پرچم آفلینی)
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
import { Loader2, Smartphone, QrCode, ShieldCheck, Copy, Ban, Activity, Download } from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { faDateTime, faNumber } from "@/lib/format";
import { useAppStore } from "@/lib/client/store";

interface RelayDeviceView {
  deviceId: string;
  label: string;
  online: boolean;
  enrolledAt: string | null;
  lastSeenAt: string | null;
  servedCount: number;
  errorCount: number;
  lastRoundtripMs: number | null;
  revoked: boolean;
  /** PN-031-C — وضعیت کد بخشنده */
  enroll?: {
    state: "waiting" | "installing" | "enrolled" | "burned-limit" | "burned-used" | "expired" | "revoked" | "absent";
    attemptCount: number;
    maxAttempts: number;
    lastAttemptAt: string | null;
    enrollExpires: string | null;
    enrolledAt: string | null;
  };
}

interface RelayStatusView {
  mode: string;
  active: boolean;
  devices: RelayDeviceView[];
  queue: { pending: number; dispatched: number; done24h: number; failed24h: number; expired24h: number };
}

interface EnrollResult {
  ok: boolean;
  deviceId: string;
  label: string;
  installCommand: string;
  bootstrapUrl: string;
  enrollExpires: string;
  /** PN-031-C — کد بخشنده (شورا-ن۰۴۰) */
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

export function RelaySetupSection({ relayMode }: { relayMode?: string }) {
  const { toast } = useToast();
  const role = useAppStore((s) => s.user?.role);
  const [status, setStatus] = useState<RelayStatusView | null>(null);
  const [enrolling, setEnrolling] = useState(false);
  const [testing, setTesting] = useState(false);
  const [enroll, setEnroll] = useState<EnrollResult | null>(null);
  const [test, setTest] = useState<TestResult | null>(null);
  const [qrSvg, setQrSvg] = useState<string | null>(null);
  // PN-031-D — QR دانلود APK (بعد از اولین کلیک مالک ساخته می‌شود)
  const [apkQrSvg, setApkQrSvg] = useState<string | null>(null);
  // رلهٔ مرورگری (رویکرد B) — فقط وقتی همین صفحه باز است
  const [browserRelay, setBrowserRelay] = useState(false);
  const [browserRelayStats, setBrowserRelayStats] = useState({ served: 0, errors: 0, lastError: "" });

  useEffect(() => {
    if (!browserRelay || role !== "OWNER") return;
    let stopped = false;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const loop = async () => {
      while (!stopped) {
        try {
          const res = await fetch("/api/admin/relay/browser-poll?wait=12");
          if (res.status === 204) continue;
          const data = (await res.json()) as { ok: boolean; request?: { id: string; method: string; url: string; headers: Record<string, string>; body: string } };
          if (!stopped && data.ok && data.request) {
            const req = data.request;
            try {
              const up = await fetch(req.url, {
                method: req.method,
                headers: req.headers,
                ...(req.method !== "GET" && req.method !== "HEAD" && req.body ? { body: req.body } : {}),
              });
              const text = await up.text();
              if (!stopped) {
                await fetch("/api/admin/relay/browser-result", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ id: req.id, httpStatus: up.status, contentType: up.headers.get("content-type"), body: text }),
                });
                setBrowserRelayStats((s) => ({ ...s, served: s.served + 1 }));
              }
            } catch (e) {
              // خطای CORS/شبکه — صادقانه به سرور گزارش می‌شود (UI واقعیت را می‌گوید)
              if (!stopped) {
                await fetch("/api/admin/relay/browser-result", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ id: req.id, error: `مرورگر نتوانست پاسخ ملک تبریز را بخواند: ${(e as Error).message}` }),
                });
                setBrowserRelayStats((s) => ({ ...s, errors: s.errors + 1, lastError: (e as Error).message }));
              }
            }
          }
        } catch {
          await sleep(2000);
        }
      }
    };
    void loop();
    return () => {
      stopped = true;
    };
  }, [browserRelay, role]);

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

  const startEnroll = async () => {
    setEnrolling(true);
    setTest(null);
    try {
      const res = await api<EnrollResult>("/api/admin/relay/enroll", {
        method: "POST",
        body: { label: "Poco F3" },
      });
      setEnroll(res);
      // QR سمت سرور ساخته می‌شود (SVG) — بدون کتابخانه در باندل کلاینت
      try {
        const svg = await fetch(`/api/admin/relay/qr?text=${encodeURIComponent(res.installCommand)}`, {
          headers: { ...(api as unknown as { headers?: Record<string, string> }).headers },
        }).then((r) => (r.ok ? r.text() : null));
        setQrSvg(svg);
      } catch {
        setQrSvg(null);
      }
      void loadStatus();
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "ثبت دستگاه رله ناموفق", description: e.message, variant: "destructive" });
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

  const revokeDevice = async (deviceId: string) => {
    try {
      await api("/api/admin/relay/revoke", { method: "POST", body: { deviceId, confirm: true } });
      toast({ title: "دستگاه ابطال شد", description: `دستگاه ${deviceId} دیگر به رله دسترسی ندارد.` });
      void loadStatus();
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "ابطال ناموفق", description: e.message, variant: "destructive" });
    }
  };

  const activeDevices = status?.devices.filter((d) => !d.revoked) ?? [];
  const onlineCount = activeDevices.filter((d) => d.online).length;

  // PN-031-D — QR دانلود اپ اندروید (URL عمومی همان مرورگر مالک است)
  const showApkQr = async () => {
    if (apkQrSvg) return;
    try {
      const url = `${window.location.origin}/deliver/pn031d/melka-relay.apk`;
      const res = await fetch(`/api/admin/relay/qr?text=${encodeURIComponent(url)}`);
      setApkQrSvg(res.ok ? await res.text() : null);
    } catch {
      setApkQrSvg(null);
    }
  };

  return (
    <section className="rounded-xl border p-4 space-y-4" aria-label="رلهٔ موبایل ایرانی" id="settings-mobile-relay">
      <header className="space-y-0.5">
        <h4 className="text-sm font-bold flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-primary" aria-hidden /> رلهٔ موبایل ایرانی (Poco F3)
        </h4>
        <p className="text-xs text-muted-foreground leading-relaxed">
          عبور از سد جغرافیایی ملک تبریز با گوشی شما — گوشی در ایران است و فایروال ملک تبریز او را می‌پذیرد؛ سرور ملکا درخواست‌ها را از طریق همین گوشی به سامانه‌های ملک تبریز می‌رساند. راهکار صفر-هزینه، صفر-مکاتبه (PN-031 · جلسهٔ فوق‌العاده ۰۳۷).
        </p>
      </header>

      {/* PN-031-D — اپ اندروید اختصاصی (روش پیشنهادی · افزودنی) */}
      <div className="rounded-lg border border-teal-500/40 bg-teal-500/5 p-3 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Smartphone className="w-4 h-4 text-teal-600 shrink-0" aria-hidden />
          <p className="text-xs font-bold">اپ اندروید ملکا — ساده‌ترین راه (بدون Termux)</p>
          <Badge className="bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300">تازه · PN-031-D</Badge>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          اپ رسمی ملکا (حدود ۵ مگابایت · امضاشده) را یک‌بار نصب می‌کنید؛ خودش شروع خودکار پس از بوت، خودترمیمی، راهنمای MIUI و قفل بیداری دارد. بعد از نصب، در اپ دکمهٔ «اتصال با QR» را بزنید و QR راه‌اندازی همین بخش (پایین) را اسکن کنید.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" className="gap-2" onClick={() => window.open("/deliver/pn031d/melka-relay.apk", "_blank", "noopener")}>
            <Download className="w-4 h-4" aria-hidden /> دانلود اپ (APK)
          </Button>
          <Button size="sm" variant="outline" className="gap-2" onClick={() => void showApkQr()}>
            <QrCode className="w-3.5 h-3.5" aria-hidden /> QR دانلود (برای گوشی)
          </Button>
        </div>
        {apkQrSvg && (
          <div className="grid grid-cols-1 md:grid-cols-[auto,1fr] gap-3 items-start">
            <div className="rounded-lg bg-white p-2 w-fit" dangerouslySetInnerHTML={{ __html: apkQrSvg }} aria-label="QR دانلود اپ اندروید ملکا" />
            <ol className="text-xs leading-relaxed space-y-1 text-muted-foreground">
              <li><b>۱.</b> در Poco F3 این QR را با دوربین اسکن کنید و APK را دانلود/نصب کنید (اجازهٔ «نصب از منابع ناشناس» لازم است).</li>
              <li><b>۲.</b> اپ را باز کنید و دکمهٔ «اتصال با QR» را بزنید.</li>
              <li><b>۳.</b> در همین صفحه پایین «راه‌اندازی رله» را بزنید و QR آن را با اپ اسکن کنید — تمام.</li>
              <li><b>۴.</b> «تست تونل» سبز شود یعنی اتصال برای همیشه برقرار است.</li>
            </ol>
          </div>
        )}
      </div>

      {/* وضعیت */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">حالت رله</p>
          <p className="text-sm font-bold">{relayMode === "mobile" ? "فعال (رلهٔ موبایل)" : relayMode ? `غیرفعال (${relayMode})` : "خاموش"}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">MELK_ARM_RELAY_MODE</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">دستگاه برخط</p>
          <p className="text-sm font-bold">
            {onlineCount > 0 ? `${faNumber(onlineCount)} دستگاه` : "هیچ"}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">پنجرهٔ زنده: ۹۰ ثانیه</p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="text-xs text-muted-foreground">صف عبوری (۲۴ ساعت)</p>
          <p className="text-sm font-bold" dir="rtl">
            {status ? `${faNumber(status.queue.done24h)} موفق` : "—"}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {status ? `در انتظار: ${faNumber(status.queue.pending)} · خطا: ${faNumber(status.queue.failed24h + status.queue.expired24h)}` : ""}
          </p>
        </div>
      </div>

      {/* دستگاه‌ها */}
      {activeDevices.length > 0 && (
        <div className="rounded-lg border divide-y">
          {activeDevices.map((d) => (
            <div key={d.deviceId} className="flex items-center justify-between gap-2 p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium truncate flex items-center gap-2">
                {d.label} <span className="font-mono text-[10px] text-muted-foreground" dir="ltr">({d.deviceId})</span>
              </p>
              <p className="text-xs text-muted-foreground truncate">
                آخرین اتصال: {d.lastSeenAt ? faDateTime(d.lastSeenAt) : "هنوز وصل نشده"}
                {d.servedCount > 0 && ` · ${faNumber(d.servedCount)} درخواست موفق`}
                {d.lastRoundtripMs != null && ` · رفت‌وبرگشت ${faNumber(d.lastRoundtripMs)}ms`}
              </p>
              {d.enroll && (
                <p className="text-[10px] text-muted-foreground truncate">
                  {d.enroll.state === "enrolled" && "نصب کامل شده ✓"}
                  {d.enroll.state === "installing" && `در حال نصب — تلاش ${faNumber(d.enroll.attemptCount)}/${faNumber(d.enroll.maxAttempts)} (همان کد دوباره کار می‌کند)`}
                  {d.enroll.state === "waiting" && `کد صادر شده — تلاش ${faNumber(d.enroll.attemptCount)}/${faNumber(d.enroll.maxAttempts)}`}
                  {d.enroll.state === "burned-limit" && "کد سوخته — سقف تلاش پر شد"}
                  {d.enroll.state === "burned-used" && "کد سوخته — نصب قبلاً کامل شد"}
                  {d.enroll.state === "expired" && "کد منقضی (۳۰ دقیقه گذشته)"}
                  {d.enroll.state === "revoked" && "دستگاه ابطال شده"}
                </p>
              )}
            </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {d.online ? (
                  <Badge className="bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300 gap-1">
                    <Activity className="w-3 h-3" aria-hidden /> برخط
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 text-muted-foreground">آفلاین</Badge>
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" title="ابطال دستگاه">
                      <Ban className="w-3.5 h-3.5" aria-hidden />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent dir="rtl">
                    <AlertDialogHeader className="text-right space-y-2 items-start">
                      <AlertDialogTitle className="text-right">ابطال دستگاه رله؟</AlertDialogTitle>
                      <AlertDialogDescription className="text-right leading-relaxed">
                        دستگاه «{d.label}» دیگر نمی‌تواند درخواست‌های رله را اجرا کند. برای گوشی گم‌شده یا تعویض‌شده مناسب است. ادامه می‌دهید؟
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="gap-2">
                      <AlertDialogCancel>انصراف</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void revokeDevice(d.deviceId)}>بله، ابطال کن</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* راه‌اندازی */}
      {!enroll ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
          <p className="text-xs leading-relaxed text-muted-foreground">
            راه‌اندازی فقط یک بار لازم است: با دکمهٔ زیر یک دستگاه ثبت می‌کنید، دستور نصب را در Termux گوشی پیست می‌کنید و تمام. راهنمای کامل بعد از ثبت نمایش داده می‌شود.
          </p>
          <Button size="sm" className="gap-2" onClick={() => void startEnroll()} disabled={enrolling}>
            {enrolling ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <QrCode className="w-4 h-4" aria-hidden />}
            راه‌اندازی رله (ثبت دستگاه + QR)
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-primary/40 bg-primary/5 p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[auto,1fr] gap-4 items-start">
            {qrSvg ? (
              <div className="rounded-lg bg-white p-2 w-fit" dangerouslySetInnerHTML={{ __html: qrSvg }} aria-label="QR کد نصب رله" />
            ) : (
              <div className="rounded-lg border p-6 text-xs text-muted-foreground">QR در دسترس نیست — از دستور متنی استفاده کنید</div>
            )}
            <div className="space-y-2 min-w-0">
              <p className="text-sm font-bold flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-teal-600" aria-hidden />
                دستگاه ثبت شد: {enroll.label} <span className="font-mono text-[10px] text-muted-foreground" dir="ltr">({enroll.deviceId})</span>
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                کد راه‌اندازی تا <b>{faDateTime(enroll.enrollExpires)}</b> معتبر است — تا <b>{faNumber(enroll.maxAttempts ?? 3)} بار قابل استفاده</b>.
                اگر تلاش اول خطا داد، همان کد را دوباره پیست کنید؛ کد فقط وقتی می‌سوزاند که گوشی با موفقیت به سرور وصل شده باشد (PN-031-C · کد بخشنده).
              </p>
              <div className="rounded-md bg-card border p-2">
                <p className="text-[10px] text-muted-foreground mb-1">دستور نصب — در Termux پیست کنید:</p>
                <code className="text-[11px] font-mono break-all leading-relaxed block" dir="ltr">{enroll.installCommand}</code>
              </div>
              <Button size="sm" variant="outline" className="gap-2" onClick={() => void copyCommand()}>
                <Copy className="w-3.5 h-3.5" aria-hidden /> کپی دستور نصب
              </Button>
            </div>
          </div>
          {/* راهنمای ۵ مرحله‌ای */}
          <ol className="text-xs leading-relaxed space-y-1.5 rounded-md border bg-card p-3">
            <li><b>۱.</b> در Poco F3 برنامهٔ <b>Termux</b> را از F-Droid یا Play Store نصب کنید (رایگان).</li>
            <li><b>۲.</b> Termux را باز کنید، دستور بالا را پیست کنید و Enter بزنید — نصب خودکار انجام می‌شود.</li>
            <li><b>۳.</b> در تنظیمات MIUI:电池 ← Termux ← «بدون محدودیت» تا گوشی در شب رله را نبندد.</li>
            <li><b>۴.</b> در همین صفحه «تست تونل» را بزنید — پاسخ سبز یعنی راه‌اندازی کامل است.</li>
            <li><b>۵.</b> گوشی را روی شارژر بگذارید (شب‌ها) — از این پس همه‌چیز خودکار است.</li>
          </ol>
        </div>
      )}

      {/* تست تونل */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" className="gap-2" onClick={() => void runTest()} disabled={testing}>
          {testing ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Activity className="w-4 h-4" aria-hidden />}
          تست تونل (دروازهٔ پایانی)
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
      {test?.verdict === "PASS" && (
        <p className="text-[11px] text-teal-700 dark:text-teal-400 leading-relaxed rounded-md border border-teal-500/30 bg-teal-500/5 p-2">
          تونل تأیید شد — گام بعد طبق رویهٔ چهارگامه: برداشتن پرچم MELK_ARM_OFFLINE توسط GLM (با اطلاع شما) ← ری‌استارت ← ورود شما با کد پرسنلی و OTP از بخش «ورود مجدد به ملک تبریز».
        </p>
      )}

      {/* پشتیبان مرورگری (رویکرد B) — فقط وقتی همین صفحه باز است */}
      <div className="rounded-lg border border-dashed p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-xs font-bold">پشتیبان: رلهٔ مرورگری</p>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              اگر Termux در دسترس نبود — همین مرورگر (در ایران) رله می‌شود؛ فقط تا وقتی این صفحه باز است. محدودیت: خواندن پاسخ تابع CORS ملک تبریز است.
            </p>
          </div>
          <Button variant={browserRelay ? "destructive" : "outline"} size="sm" onClick={() => setBrowserRelay((v) => !v)}>
            {browserRelay ? "توقف رلهٔ مرورگری" : "فعال‌سازی رلهٔ مرورگری"}
          </Button>
        </div>
        {browserRelay && (
          <p className="text-[10px] text-muted-foreground" dir="rtl">
            فعال — اجرا: {faNumber(browserRelayStats.served)} · خطا: {faNumber(browserRelayStats.errors)}
            {browserRelayStats.lastError && ` · آخرین خطا: ${browserRelayStats.lastError}`}
          </p>
        )}
      </div>
    </section>
  );
}
