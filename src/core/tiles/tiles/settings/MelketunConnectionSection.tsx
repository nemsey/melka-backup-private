"use client";

/**
 * پیکرهٔ یکپارچهٔ «اتصال به ملکتون» (PN-046/گام صفر — دستور مالک ۱۴۰۵/۰۷/۲۸)
 * ---------------------------------------------------------------------------
 * بازبینی و بازنویسیٔ تنظیمات اتصال سامانه‌های ملکتون «دقیقاً همانند» پیکرهٔ
 * «اتصال به ملک تبریز» (MelkTabrizConnectionSection) طراحی/پیاده/اجرا شده است —
 * با این تفاوتِ صریح دستور مالک:
 *   · ملک تبریز: اتصال حساب شخصی با «کد پرسنلی + کد پیامکی»
 *   · ملکتون:    اتصال حساب شخصی با «یوزر + پسورد»
 *
 * ساختار (عین الگوی تبریز):
 *   ۱. مدیریت اتصال‌ها — وضعیت زندهٔ دو سرویس (CRM ملکتون + سایت عمومی)
 *      + تست + همگام‌سازی (فقط داده‌های شهر تبریز) + نشانی‌ها
 *   ۲. اتصال به حساب شخصی CRM ملکتون — فرم یوزر/پسورد + تست ورود واقعی
 *      (login-store → dashboard 200 — استراتژی SESSION_HTML_ADAPTER کشف PN-044)
 *
 * جایگاه (نکتهٔ دستور مالک): همین بخش در تنظیمات عمومی، درست «زیر» پیکرهٔ
 * یکپارچهٔ «اتصال سامانه‌های ملک تبریز» قرار گرفته است.
 *
 * رازها: هرگز در UI چاپ نمی‌شوند (قانون ۱۲/۱۸) — فقط username و رمز ماسک‌شده.
 */

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, RefreshCcw, Wifi, WifiOff, Server, Landmark, Building2,
  ShieldCheck, XCircle, KeyRound, UserRound, MapPin,
} from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { faDateTime, faNumber } from "@/lib/format";

/** فرادادهٔ اتصال — GET /api/integrations/melketun (رمز هرگز برنمی‌گردد) */
interface MelketunMeta {
  crm: { base_url: string; username: string; passwordMasked: string };
  public: { base_url: string };
  connectionMode: "direct" | "relay" | "blocked";
  connection: { ok: boolean; at: string; note: string; username: string } | null;
}

/** نتیجهٔ تست زندهٔ دو سرویس — POST /api/integrations/melketun */
interface TestResult {
  ok: boolean;
  public: { ok: boolean; status: number; latencyMs: number };
  crm: { ok: boolean; status: number; note: string };
}

/** نتیجهٔ همگام‌سازی — POST /api/integrations/melketun/sync (SyncResult) */
interface SyncResult {
  ok: boolean;
  fetched: { listings: number; requests: number; transactions: number; experts: number };
  upserted: { listings: number; requests: number; transactions: number; experts: number };
  skippedByCityFilter: { listings: number; requests: number };
  errors: string[];
  durationMs: number;
}

function faDigitsLocal(n: string | number): string {
  return String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

export function MelketunConnectionSection() {
  const { toast } = useToast();
  const [meta, setMeta] = useState<MelketunMeta | null>(null);
  const [test, setTest] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  // فرم حساب شخصی CRM (یوزر + پسورد — تفاوت صریح با الگوی کدپرسنلی/پیامکی تبریز)
  const [formOpen, setFormOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [connecting, setConnecting] = useState(false);

  const loadMeta = useCallback(async () => {
    try {
      const res = await api<MelketunMeta>("/api/integrations/melketun");
      setMeta(res);
    } catch {
      // بی‌صدا — بارگذاری بعدی دوباره امتحان می‌شود
    }
  }, []);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  const testConnection = useCallback(async () => {
    setTesting(true);
    try {
      const res = await api<TestResult>("/api/integrations/melketun", { method: "POST", timeoutMs: 70_000 });
      setTest(res);
      await loadMeta(); // وضعیت اتصال (login واقعی) تازه شد
      toast({
        title: res.crm.ok && res.public.ok ? "اتصال سامانه‌های ملکتون برقرار است" : "اتصال کامل نیست",
        description: `CRM: ${res.crm.note} — سایت عمومی: HTTP ${faDigitsLocal(res.public.status)} (${faDigitsLocal(res.public.latencyMs)}ms)`,
        variant: res.crm.ok && res.public.ok ? "default" : "destructive",
      });
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "خطا در بررسی اتصال ملکتون", description: e.message, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  }, [loadMeta, toast]);

  const syncNow = async () => {
    setSyncing(true);
    try {
      const res = await api<SyncResult>("/api/integrations/melketun/sync", { method: "POST", timeoutMs: 300_000 });
      if (res.ok) {
        toast({
          title: "همگام‌سازی ملکتون موفق",
          description: `${faNumber(res.upserted.listings)} آگهی و ${faNumber(res.upserted.requests)} درخواست (فقط شهر تبریز) همگام شد — ${faNumber(res.skippedByCityFilter.listings + res.skippedByCityFilter.requests)} ردیف غیرتبریز طبق فیلتر رد شد (${faDigitsLocal(Math.round(res.durationMs / 100) / 10)} ثانیه).`,
        });
      } else {
        toast({
          title: "همگام‌سازی ناموفق",
          description: res.errors[0] ?? "خطای نامشخص در استخراج از CRM ملکتون.",
          variant: "destructive",
        });
      }
      await loadMeta();
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "همگام‌سازی ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const connectAccount = async () => {
    if (!username.trim() || !password.trim()) {
      toast({
        title: "اعتبارنامهٔ ناقص",
        description: "یوزر و پسورد CRM ملکتون را کامل وارد کنید.",
        variant: "destructive",
      });
      return;
    }
    setConnecting(true);
    try {
      const res = await api<{ ok: boolean; crm: { ok: boolean; status: number; note: string } }>(
        "/api/integrations/melketun",
        {
          method: "POST",
          body: { action: "save-credentials", username: username.trim(), password },
          timeoutMs: 70_000,
        }
      );
      toast({
        title: res.crm.ok ? "اتصال حساب شخصی CRM ملکتون برقرار شد" : "ورود واقعی موفق نبود",
        description: res.crm.ok
          ? "ورود با یوزر/پسورد در CRM انجام و تأیید شد (dashboard 200) — استخراج داده‌های ملکتون فعال است."
          : res.crm.note,
        variant: res.crm.ok ? "default" : "destructive",
      });
      if (res.crm.ok) {
        setFormOpen(false);
        setPassword("");
      }
      await loadMeta();
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "اتصال ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setConnecting(false);
    }
  };

  const connected = meta?.connection?.ok === true;

  return (
    <Card id="settings-melketun" className="border-sec-settings-200">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Landmark className="w-5 h-5 text-sec-settings-700" aria-hidden /> اتصال به ملکتون
        </CardTitle>
        <CardDescription>
          پیکرهٔ واحد مدیریت اتصال به سامانه‌های ملکتون — CRM (حساب شخصی با یوزر و پسورد) و سایت عمومی
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* ========== ۱) مدیریت اتصال‌ها — وضعیت زندهٔ دو سرویس ملکتون ========== */}
        <section className="rounded-xl border p-4 space-y-3" aria-label="مدیریت اتصال به سامانه‌های ملکتون" id="settings-melketun-hub">
          <header className="space-y-0.5">
            <h4 className="text-sm font-bold flex items-center gap-2">
              <Server className="w-4 h-4 text-primary" aria-hidden /> مدیریت اتصال‌ها
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              وضعیت زندهٔ سرویس‌های ملکتون — استخراج داده فقط مختص شهر تبریز است (دستور مالک).
            </p>
          </header>

          {/* وضعیت ساده — سه شاخص (عین الگوی تبریز) */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border bg-card p-3 flex items-center gap-2">
              {test ? (test.crm.ok && test.public.ok ? <Wifi className="w-4 h-4 text-teal-600 dark:text-teal-400" aria-hidden /> : <WifiOff className="w-4 h-4 text-amber-600" aria-hidden />) : (
                <Server className="w-4 h-4 text-muted-foreground" aria-hidden />
              )}
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">وضعیت سرورها</p>
                <p className="text-sm font-bold">
                  {test ? (test.crm.ok && test.public.ok ? "فعال" : "ناقص / قطع") : "تست نشده"}
                </p>
              </div>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">مسیر اتصال</p>
              <p className="text-sm font-bold text-teal-700 dark:text-teal-400">
                {meta?.connectionMode === "direct" ? "مستقیم" : meta?.connectionMode === "relay" ? "رلهٔ Termux" : "—"}
              </p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">زمان پاسخ (سایت عمومی)</p>
              <p className="text-sm font-bold" dir="rtl">
                {test ? (test.public.latencyMs >= 0 ? `${faDigitsLocal(test.public.latencyMs)} میلی‌ثانیه` : "—") : "—"}
              </p>
            </div>
          </div>

          {/* وضعیت تفصیلی هر سرویس (CRM + سایت عمومی — عین الگوی تبریز) */}
          <div className="rounded-lg border divide-y">
            <div className="flex items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">CRM ملکتون (حساب شخصی)</p>
                <p className="text-xs text-muted-foreground truncate">
                  {meta?.connection
                    ? `${meta.connection.ok ? "آخرین ورود واقعی موفق" : "آخرین ورود واقعی ناموفق"}: ${faDateTime(meta.connection.at)} — ${meta.connection.note}`
                    : "ورود واقعی هنوز آزمایش نشده — دکمهٔ «تست اتصال» یا «برقراری اتصال» را بزنید"}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {meta?.connection?.ok ? (
                  <Badge className="bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300 gap-1">
                    <Wifi className="w-3 h-3" aria-hidden /> متصل
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="gap-1">
                    <WifiOff className="w-3 h-3" aria-hidden /> قطع
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">سایت عمومی ملکتون</p>
                <p className="text-xs text-muted-foreground truncate">
                  {test ? `آخرین تست زنده: HTTP ${faDigitsLocal(test.public.status)}` : "تست زنده هنوز انجام نشده"}
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {test ? (
                  test.public.ok ? (
                    <Badge className="bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300 gap-1">
                      <Wifi className="w-3 h-3" aria-hidden /> سالم
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1">
                      <WifiOff className="w-3 h-3" aria-hidden /> در دسترس نیست
                    </Badge>
                  )
                ) : (
                  <Badge variant="outline" className="gap-1">تست نشده</Badge>
                )}
              </div>
            </div>
          </div>

          {/* نشانی سامانه‌های ملکتون (عین الگوی نشانی‌های تبریز) */}
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              رابط CRM ملکتون (ورود با یوزر + پسورد):{" "}
              <span dir="ltr" className="font-mono">
                {meta?.crm.base_url ?? "https://melketun.app"}
              </span>
            </p>
            <p>
              سایت عمومی ملکتون:{" "}
              <span dir="ltr" className="font-mono">
                {meta?.public.base_url ?? "https://melketun.com"}
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
              همگام‌سازی داده‌ها (فقط تبریز)
            </Button>
          </div>
        </section>

        {/* ========== ۲) اتصال به حساب شخصی CRM ملکتون (یوزر + پسورد) ========== */}
        <section className="rounded-xl border p-4 space-y-4" aria-label="اتصال به حساب شخصی CRM ملکتون" id="settings-melketun-crm-account">
          <header className="space-y-0.5">
            <h4 className="text-sm font-bold flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" aria-hidden /> اتصال به حساب شخصی CRM ملکتون
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              سامانهٔ CRM ملکتون (melketun.app) — اتصال از طریق حساب شخصی با «یوزر + پسورد» (در ملک تبریز همین اتصال با «کد پرسنلی + پیامک» برقرار می‌شود)
            </p>
          </header>

          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              {connected ? (
                <Badge className="gap-1 bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300">
                  <ShieldCheck className="w-3 h-3" aria-hidden /> متصل — {meta?.connection?.username || meta?.crm.username}
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1">
                  <XCircle className="w-3 h-3" aria-hidden /> قطع
                </Badge>
              )}
            </div>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setFormOpen((v) => !v)}>
              <KeyRound className="w-3.5 h-3.5" aria-hidden />
              {connected ? "تغییر حساب / اتصال مجدد" : "برقراری اتصال"}
            </Button>
          </div>

          {(connected || meta?.crm) && !formOpen && (
            <div className="rounded-lg border bg-muted/40 p-3 text-xs leading-relaxed space-y-1">
              <p className="flex items-center gap-1.5">
                <UserRound className="w-3.5 h-3.5 shrink-0" aria-hidden />
                حساب جاری CRM: <b dir="ltr">{meta?.crm.username ?? "—"}</b>
                <span dir="ltr" className="text-muted-foreground">({meta?.crm.passwordMasked})</span>
              </p>
              {connected && (
                <p className="flex items-center gap-1.5 text-teal-700 dark:text-teal-300">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden />
                  ورود واقعی تأیید شده — استخراج خودکار هر ۶ ساعت + همگام‌سازی دستی فعال است.
                  {meta?.connection?.at ? ` (آخرین تأیید: ${faDateTime(meta.connection.at)})` : ""}
                </p>
              )}
            </div>
          )}

          {formOpen && (
            <div className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="melketun-username-input" className="text-xs">یوزر CRM ملکتون</Label>
                  <Input
                    id="melketun-username-input"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="نام کاربری…"
                    dir="ltr"
                    className="text-xs"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="melketun-password-input" className="text-xs">پسورد CRM ملکتون</Label>
                  <Input
                    id="melketun-password-input"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="رمز عبور…"
                    dir="ltr"
                    className="text-xs"
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" className="gap-1.5" onClick={() => void connectAccount()} disabled={connecting}>
                  {connecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <ShieldCheck className="w-3.5 h-3.5" aria-hidden />}
                  برقراری اتصال (تست ورود واقعی)
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setFormOpen(false)}>انصراف</Button>
              </div>
              <p className="text-[10px] text-muted-foreground leading-4">
                اعتبارنامه فقط در Persistent Zone (فایل راز gitignored — هرگز در گیت/لاگ) ذخیره می‌شود و بلافاصله ورود واقعی
                (login-store → dashboard) آزمایش می‌شود. پسورد هرگز در پاسخ API برنمی‌گردد.
              </p>
            </div>
          )}
        </section>

        {/* رلهٔ Termux ملکتون — verdict فاز ۰ (PN-043): اتصال مستقیم؛ رله فقط برای روزِ فایروال */}
        <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground leading-relaxed flex items-start gap-2">
          <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
          <span>
            مسیر اتصال مستقیم (verdict کشف PN-043) برقرار است — رلهٔ Termux لازم نیست؛ اگر روزی فایروال مسدود کند،
            ثبت URL رله در تنظیمات ملکتون (تب رله) پشتیبان آینده است.
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
