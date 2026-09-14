"use client";

/**
 * کاشی «تنظیمات عمومی» — زبان، تم، حساب کاربری، مدیریت اتصال، راهنما
 * نکته الزامی: نام مالک در ابتدای این بخش نمایش داده می‌شود.
 * دکمه «ریست اتصال»: ابطال نشست + پاک‌سازی کش + همگام‌سازی مجدد داده‌ها.
 */

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "next-themes";
import {
  Moon, Sun, LogOut, Languages, UserRound, RefreshCcw, Wifi, WifiOff, Server, Clock, HelpCircle,
  BookOpen, Lock, Loader2, ShieldCheck, PenLine, BadgeCheck,
} from "lucide-react";
import type { TilePageProps } from "@/core/tiles/tile-contract";
import { api, ApiClientError } from "@/lib/client/api";
import { useAppStore } from "@/lib/client/store";
import { faDateTime, faNumber } from "@/lib/format";
import { DivarConnectionSection } from "./DivarConnectionSection";
import { InstagramConnectionSection } from "./InstagramConnectionSection";
import { PmConnectionSection } from "./PmConnectionSection";

/** ارقام فارسی محلی برای این صفحه */
function faDigitsLocal(n: string | number): string {
  return String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

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
  config: { mode: string; armApiBase: string; armPublicApiBase: string; pmApiBase: string; timeoutMs: number; maxRetries: number; syncIntervalMinutes: number };
}

export function SettingsPage({ onBack }: TilePageProps) {
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const user = useAppStore((s) => s.user);
  const logout = useAppStore((s) => s.logout);
  const setStage = useAppStore((s) => s.setStage);

  const [conn, setConn] = useState<ConnectionInfo | null>(null);
  const [testing, setTesting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [syncing, setSyncing] = useState(false);

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

  const testConnection = async () => {
    setTesting(true);
    try {
      const res = await api<ConnectionInfo>("/api/connection/status");
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
  };

  const resetConnection = async () => {
    setResetting(true);
    try {
      const res = await api<{ ok: boolean; resync?: { ok: boolean; error?: string } }>("/api/connection/reset", {
        method: "POST",
        body: { withData: true },
      });
      // پاک‌سازی کش سمت کلاینت (Service Worker + حافظه مرورگر)
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
      setStage("auth");
    } catch (err) {
      const e = err as ApiClientError;
      toast({ title: "ریست اتصال ناموفق", description: e.message, variant: "destructive" });
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ⬇︎ الزامی: نام مالک در ابتدای بخش تنظیمات عمومی */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4 flex items-center gap-3">
          <PenLine className="w-5 h-5 text-primary shrink-0" aria-hidden />
          <p className="text-sm font-bold">
            مالک و برنامه نویس و طراح: سید نعمت اله سیدی
          </p>
        </CardContent>
      </Card>

      {/* حساب کاربری */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserRound className="w-5 h-5 text-primary" aria-hidden /> حساب کاربری
          </CardTitle>
          <CardDescription>اطلاعات نشست جاری شما</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" aria-hidden />
              <span className="font-bold">{user?.displayName}</span>
            </div>
            {user?.role === "OWNER" && (
              <Badge className="bg-amber-500 text-amber-950 gap-1">
                <BadgeCheck className="w-3.5 h-3.5" aria-hidden /> مالک سامانه
              </Badge>
            )}
            <Badge variant="outline" className="gap-1">
              <Clock className="w-3.5 h-3.5" aria-hidden /> نشست تا {user ? faDateTime(user.expiresAt) : "—"}
            </Badge>
          </div>
          <div className="text-sm text-muted-foreground">
            کد پرسنلی: <span dir="ltr" className="font-mono">{user?.personnelCode}</span>
          </div>
          <Button variant="destructive" className="gap-2" onClick={() => void logout()}>
            <LogOut className="w-4 h-4" aria-hidden /> خروج از حساب
          </Button>
        </CardContent>
      </Card>

      {/* تم و زبان */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              {theme === "dark" ? <Moon className="w-5 h-5 text-primary" aria-hidden /> : <Sun className="w-5 h-5 text-primary" aria-hidden />} تم نمایش
            </CardTitle>
            <CardDescription>حالت روشن یا تاریک رابط کاربری</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between rounded-lg border bg-card p-3">
              <div className="space-y-0.5 me-4">
                <Label htmlFor="theme-switch" className="text-sm font-medium">
                  حالت تاریک
                </Label>
                <p className="text-xs text-muted-foreground">مناسب استفاده شبانه و صرفه‌جویی باتری OLED</p>
              </div>
              <Switch
                id="theme-switch"
                checked={theme === "dark"}
                onCheckedChange={(v) => setTheme(v ? "dark" : "light")}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Languages className="w-5 h-5 text-primary" aria-hidden /> زبان اپلیکیشن
            </CardTitle>
            <CardDescription>این اپلیکیشن تک‌زبانه و تخصصی فارسی است</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between rounded-lg border bg-card p-3">
              <div className="space-y-0.5 me-4">
                <span className="text-sm font-medium">فارسی (ایران)</span>
                <p className="text-xs text-muted-foreground">راست‌به‌چپ، ارقام فارسی، تقویم شمسی</p>
              </div>
              <Badge variant="secondary" className="gap-1">
                <Lock className="w-3.5 h-3.5" aria-hidden /> ثابت
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* مدیریت اتصال */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Server className="w-5 h-5 text-primary" aria-hidden /> مدیریت اتصال به سامانه ملک تبریز
          </CardTitle>
          <CardDescription>
            وضعیت اتصال به arm.melketabriz.ir و pm.melketabriz.ir — در صورت بروز اختلال، اتصال را ریست کنید.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {conn && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-lg border bg-card p-3 flex items-center gap-2">
                  {conn.status.services?.some((s) => s.databaseUp) ? (
                    <Wifi className="w-4 h-4 text-emerald-600 dark:text-emerald-400" aria-hidden />
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
                  <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">اتصال واقعی</p>
                </div>
                <div className="rounded-lg border bg-card p-3">
                  <p className="text-xs text-muted-foreground">زمان پاسخ</p>
                  <p className="text-sm font-bold" dir="rtl">
                    {conn.status.latencyMs >= 0 ? `${faDigitsLocal(conn.status.latencyMs)} میلی‌ثانیه` : "—"}
                  </p>
                </div>
              </div>

              {/* وضعیت تفصیلی هر سرویس */}
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
                          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 gap-1">
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

          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              نشانی رابط برنامه‌نویسی سامانه آگهی و درخواست (آرم):{" "}
              <span dir="ltr" className="font-mono">
                {conn?.config.armApiBase ?? "https://arus-api.melketabriz.ir/api/apm/"}
              </span>
            </p>
            <p>
              نشانی رابط برنامه‌نویسی سامانه پرسنلی (پی‌ام):{" "}
              <span dir="ltr" className="font-mono">
                {conn?.config.pmApiBase ?? "https://pm-api.melketabriz.ir/api/"}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" className="gap-2" onClick={() => void testConnection()} disabled={testing}>
              {testing ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <RefreshCcw className="w-4 h-4" aria-hidden />}
              تست اتصال
            </Button>

            <Button variant="secondary" className="gap-2" onClick={() => void syncNow()} disabled={syncing}>
              {syncing ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Server className="w-4 h-4" aria-hidden />}
              همگام‌سازی داده‌ها
            </Button>

            {/* ⬇︎ دکمه ریست اتصال (الزامی سند طرح) */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="gap-2" disabled={resetting}>
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
        </CardContent>
      </Card>

      {/* اتصال به دیوار — دو روش با کلید ریست */}
      <DivarConnectionSection />

      {/* اتصال به حساب شخصی سامانه PM — برای چراغ نشانگر خانه */}
      <PmConnectionSection />

      {/* اتصال به اینستاگرام — کاشی آگهی */}
      <InstagramConnectionSection />

      {/* راهنمای اپلیکیشن */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-primary" aria-hidden /> راهنمای اپلیکیشن
          </CardTitle>
          <CardDescription>نحوه استفاده از داشبورد هوشمند ملک تبریز</CardDescription>
        </CardHeader>
        <CardContent>
          <Accordion type="single" collapsible defaultValue="login">
            <AccordionItem value="login">
              <AccordionTrigger>ورود به اپلیکیشن</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground leading-relaxed space-y-2">
                <p>۱. کد پرسنلی خود (مطابق ثبت در سامانه ملک تبریز) را وارد کنید؛ کد تأیید پیامکی صادر می‌شود.</p>
                <p>۲. کد ۴ رقمی پیامک‌شده را در مهلت ۳ دقیقه وارد کنید. پس از تأیید، نشست شما تا ۱۲ ساعت معتبر است.</p>
                <p>۳. مالک سامانه می‌تواند از مسیر «ورود با کد مدیر» بدون پیامک و با دسترسی کامل وارد شود.</p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="tiles">
              <AccordionTrigger>کار با کاشی‌ها</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground leading-relaxed space-y-2">
                <p>صفحه اصلی از کاشی‌های مستقل تشکیل شده؛ با لمس هر کاشی وارد صفحه تخصصی آن می‌شوید.</p>
                <p>هر کاشی دکمه «تنظیمات کاشی» مخصوص خودش را دارد (مرتب‌سازی، تعداد ردیف، نمایش نمودار و…) که فقط همان کاشی را تغییر می‌دهد.</p>
                <p>تنظیمات عمومی (تم، حساب، اتصال، راهنما) فقط در همین کاشی «تنظیمات عمومی» جمع شده است.</p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="agent">
              <AccordionTrigger>ایجنت‌های هوشمند و یادگیری</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground leading-relaxed space-y-2">
                <p>هر کاشی دارای ایجنت، بینش‌های تحلیلی اختصاصی تولید می‌کند (روند، رتبه‌بندی، هشدار افت و…).</p>
                <p>با دکمه‌های «مفید / غیرمفید» روی هر بینش، به ایجنت بازخورد بدهید. بازخوردها در حافظه دائمی همان کاشی ثبت می‌شوند و اولویت بینش‌های آینده را تنظیم می‌کنند.</p>
                <p>ایجنت‌ها حافظه و دانش کاملاً مستقل دارند؛ بازخورد در یک کاشی روی کاشی دیگر اثری ندارد.</p>
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="install">
              <AccordionTrigger>نصب روی موبایل و تبلت</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground leading-relaxed space-y-2">
                <p>این اپلیکیشن یک PWA است؛ در مرورگر اندروید از منوی ⋮ گزینه «Add to Home screen / نصب برنامه» را انتخاب کنید.</p>
                <p>برای نصب کامل بومی اندروید (APK)، از بسته Capacitor طبق سند BUILD-ANDROID اقدام شود.</p>
                <p>در iOS از Share → Add to Home Screen استفاده کنید.</p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
      </Card>

      {/* اعتبار */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" aria-hidden />
            <span className="text-sm font-bold">داشبورد هوشمند چندعامله ملک تبریز</span>
          </div>
          <span className="text-xs text-muted-foreground">نسخه ۱٫۰٫۰</span>
        </CardContent>
      </Card>
    </div>
  );
}
