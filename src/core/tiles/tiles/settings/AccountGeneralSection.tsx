"use client";

/**
 * بخش «حساب کاربری و تنظیمات کلی» (P6546/گام صفر-۶)
 * ------------------------------------------------------
 * ادغام چهار بخش پیشین در یک پیکرهٔ واحد (دستور مالک):
 *   حساب کاربری + تم نمایش + زبان اپلیکیشن + راهنمای اپلیکیشن
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useTheme } from "next-themes";
import { Moon, Sun, LogOut, Languages, UserRound, Clock, HelpCircle, Lock, ShieldCheck, BadgeCheck } from "lucide-react";
import { useAppStore } from "@/lib/client/store";
import { faDateTime } from "@/lib/format";

export function AccountGeneralSection() {
  const { theme, setTheme } = useTheme();
  const user = useAppStore((s) => s.user);
  const logout = useAppStore((s) => s.logout);

  return (
    <Card id="settings-account-general">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <UserRound className="w-5 h-5 text-primary" aria-hidden /> حساب کاربری و تنظیمات کلی
        </CardTitle>
        <CardDescription>حساب کاربری، تم نمایش، زبان اپلیکیشن و راهنمای کامل استفاده — همه در یک پیکره</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* ==== حساب کاربری ==== */}
        <section className="space-y-3" aria-label="حساب کاربری">
          <h4 className="text-sm font-bold flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-primary" aria-hidden /> حساب کاربری
          </h4>
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
          <Button variant="destructive" size="sm" className="gap-2" onClick={() => void logout()}>
            <LogOut className="w-4 h-4" aria-hidden /> خروج از حساب
          </Button>
        </section>

        {/* ==== تم نمایش + زبان ==== */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-4" aria-label="تم نمایش و زبان">
          <div className="rounded-xl border p-4 space-y-3">
            <h4 className="text-sm font-bold flex items-center gap-2">
              {theme === "dark" ? <Moon className="w-4 h-4 text-primary" aria-hidden /> : <Sun className="w-4 h-4 text-primary" aria-hidden />} تم نمایش
            </h4>
            <p className="text-xs text-muted-foreground">حالت روشن یا تاریک رابط کاربری</p>
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
          </div>

          <div className="rounded-xl border p-4 space-y-3">
            <h4 className="text-sm font-bold flex items-center gap-2">
              <Languages className="w-4 h-4 text-primary" aria-hidden /> زبان اپلیکیشن
            </h4>
            <p className="text-xs text-muted-foreground">این اپلیکیشن تک‌زبانه و تخصصی فارسی است</p>
            <div className="flex items-center justify-between rounded-lg border bg-card p-3">
              <div className="space-y-0.5 me-4">
                <span className="text-sm font-medium">فارسی (ایران)</span>
                <p className="text-xs text-muted-foreground">راست‌به‌چپ، ارقام فارسی، تقویم شمسی</p>
              </div>
              <Badge variant="secondary" className="gap-1">
                <Lock className="w-3.5 h-3.5" aria-hidden /> ثابت
              </Badge>
            </div>
          </div>
        </section>

        {/* ==== راهنمای اپلیکیشن ==== */}
        <section className="space-y-3" aria-label="راهنمای اپلیکیشن">
          <h4 className="text-sm font-bold flex items-center gap-2">
            <HelpCircle className="w-4 h-4 text-primary" aria-hidden /> راهنمای اپلیکیشن
          </h4>
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
                <p>نوار «وضعیت اتصال‌ها» هم در صفحه خانه و هم در بالای همهٔ کاشی‌ها ثابت و رویت‌پذیر است.</p>
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
                <p>برای نصب کامل بومی اندروید (APK)، از بستهٔ Capacitor طبق سند BUILD-ANDROID اقدام شود.</p>
                <p>در iOS از Share → Add to Home Screen استفاده کنید.</p>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </section>
      </CardContent>
    </Card>
  );
}
