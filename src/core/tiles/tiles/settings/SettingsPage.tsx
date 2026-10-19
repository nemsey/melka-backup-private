"use client";

/**
 * کاشی «تنظیمات عمومی» (P6546/گام صفر — ترتیب و یکپارچگی جدید)
 * ------------------------------------------------------
 * نکته الزامی: نام مالک در ابتدای این بخش نمایش داده می‌شود.
 *
 * ترتیب الزامی بخش‌ها (دستور مالک — گام صفر-۷):
 *   ۱. اتصال به ملک تبریز (پیکرهٔ یکپارچهٔ همهٔ سامانه‌های ملک تبریز: مدیریت + ARM + PM + GAP + سامانه عمومی)
 *   ۲. اتصال به دیوار
 *   ۳. اتصال به اینستاگرام
 *   ۴. مغز هوشمند و یادگیر ملکا
 *   ۵. هشدار فرصت (تطبیق هوشمند)
 *   ۶. کارهای پس‌زمینه (پایدار در برابر ری‌استارت)
 *   ۷. حساب کاربری و تنظیمات کلی (ادغام حساب کاربری + تم نمایش + زبان + راهنما)
 */

import { Card, CardContent } from "@/components/ui/card";
import { BookOpen, Landmark, PenLine } from "lucide-react";
import Link from "next/link";
import type { TilePageProps } from "@/core/tiles/tile-contract";
// P6546/گام صفر — پیکرهٔ یکپارچهٔ «اتصال به ملک تبریز»
import { MelkTabrizConnectionSection } from "./MelkTabrizConnectionSection";
import { DivarConnectionSection } from "./DivarConnectionSection";
import { InstagramConnectionSection } from "./InstagramConnectionSection";
import { BrainStatusSection } from "./BrainStatusSection";
// P6545/گام۱ — هشدار فرصت + کارهای پس‌زمینه (جلسهٔ ۰۳۳)
import { OpportunityJobsSection } from "./OpportunityJobsSection";
// P6546/گام صفر-۶ — حساب کاربری و تنظیمات کلی (ادغام چهار بخش)
import { AccountGeneralSection } from "./AccountGeneralSection";
// PN-043-F1 (شورا-ن۰۸۷): UI «مدیریت کاربران ملک تبریز» از تنظیمات حذف شد — دادهٔ مقدس در DB محفوظ
// (کامپوننت MelkTabrizUsersSection نگه‌داری شده — گارد audit-stealth-users فایل را می‌خواند)
// PN-017 (شورا-ن۰۲۱ ب): «مدیریت دسترسی کارشناسان ملکا» — جایگاه ۹ (لایهٔ قدیمی PN-008 BLOCK 7)
import { PersonnelAccessSection } from "./PersonnelAccessSection";
// PN-031-B (شورا-ن۰۳۹): بنر تازگی سرور — «سرور روی HEAD است» / هشدار جبران خودکار
import { BuildFreshnessBanner } from "./BuildFreshnessBanner";

export function SettingsPage({ onBack }: TilePageProps) {
  void onBack; // بازگشت از پوستهٔ کاشی مدیریت می‌شود
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

      {/* PN-031-B (شورا-ن۰۳۹): بنر تازگی سرور — بالای همهٔ بخش‌ها (فقط مالک) */}
      <BuildFreshnessBanner />

      {/* ۱ — اتصال به ملک تبریز (پیکرهٔ یکپارچه — گام صفر-۳) */}
      <MelkTabrizConnectionSection />

      {/* ۲ — اتصال به دیوار */}
      <DivarConnectionSection />

      {/* ۳ — اتصال به اینستاگرام */}
      <InstagramConnectionSection />

      {/* ۴ — مغز هوشمند و یادگیر ملکا */}
      <BrainStatusSection />

      {/* ۵ و ۶ — هشدار فرصت (تطبیق هوشمند) + کارهای پس‌زمینه (پایدار در برابر ری‌استارت) */}
      <OpportunityJobsSection />

      {/* ۷ — حساب کاربری و تنظیمات کلی (ادغام: حساب + تم + زبان + راهنما — گام صفر-۶) */}
      <AccountGeneralSection />

      {/* ۸ — PN-043-F1 (شورا-ن۰۸۷): «مدیریت کاربران ملک تبریز» حذف شد (UI حذف · دادهٔ مقدس در DB محفوظ) */}

      {/* ۹ — PN-017 (دستور مالک ۱۴۰۵/۰۷/۱۹): «مدیریت دسترسی کارشناسان ملکا» (جایگاه پیشین مدیریت کاربران — جابه‌جایی کامل) */}
      <PersonnelAccessSection />

      {/* ۱۰ — PN-043/فاز ۳ (شورا-ن۰۸۷): تنظیمات یکپارچهٔ ملکتون — اتصال به CRM + عمومی + رله */}
      <Card className="border-indigo-200 bg-indigo-50/50">
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Landmark className="w-5 h-5 text-indigo-700 shrink-0" aria-hidden />
            <span className="text-sm font-bold">تنظیمات ملکتون (اتصال CRM + سایت عمومی + رله Termux)</span>
          </div>
          <Link
            href="/settings/melketun"
            className="text-xs font-bold text-indigo-700 underline underline-offset-4"
            data-testid="melketun-settings-link"
          >
            باز کردن ←
          </Link>
        </CardContent>
      </Card>

      {/* اعتبار */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" aria-hidden />
            <span className="text-sm font-bold">ملکا — اکوسیستم هوشمند ملک ایران</span>
          </div>
          <span className="text-xs text-muted-foreground">نسخه ۱٫۰٫۰</span>
        </CardContent>
      </Card>
    </div>
  );
}


/** P6549 — خروجی پیش‌فرض برای بارگذاری تنبل (lazyPage) */
export default SettingsPage;
