"use client";

/**
 * خانه داشبورد — چیدمان کاشی‌ای (P6526/الف — نام‌ها و ترتیب تازه)
 * ------------------------------------------------------
 * صفحه هوم — پنج کاشی به ترتیب الزامی مالک:
 *   ۱. فایل یابی ملکا · ۲. آگهی ملکا · ۳. درخواست ملکا ·
 *   ۴. تنظیمات عمومی · ۵. داشبورد مدیریتی ملک تبریز
 * کاشی «داشبورد مدیریتی» ظرف هشت کاشی تحلیلی/مدیریتی (M1-M8) است —
 * بازسازی فازهای ۷-۸-۹ (دستور مالک ۱۴۰۵/۰۷/۷). جلسهٔ ۰۳۳ (دستور مالک):
 * توضیحات متنی هوم حذف شد — هیروی خوش‌آمد و کارت «جست‌وجوی تحلیل‌ها».
 */

import { Skeleton } from "@/components/ui/skeleton";
import { tileRegistry } from "@/core/tiles/tile-registry";
import { useAppStore } from "@/lib/client/store";
import { ConnectionIndicators } from "./ConnectionIndicators";
import { TileCard } from "./TileCard";
import { VersionBadge } from "./VersionBadge";

export function DashboardHome() {
  const userRole = useAppStore((s) => s.user?.role ?? "CONSULTANT");
  // PN-008 BLOCK 7 — کاشی‌های مجاز از PersonnelAccess (OWNER همیشه همه)
  const tileAccess = useAppStore((s) => s.tileAccess);
  const openTile = useAppStore((s) => s.openTile);
  const allowed = (id: string) => userRole === "OWNER" || !tileAccess || tileAccess.tiles.includes(id) || id === "settings";
  const tiles = tileRegistry.listRoot(userRole).filter((t) => allowed(t.id));

  return (
    <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 py-8 flex flex-col">
      {/* نشانگرهای اتصال — هفت چراغ سبز/قرمز (الزام مالک) */}
      <ConnectionIndicators />

      {/* شبکه کاشی‌های صفحه هوم — ریسپانسیو: ۱ ستون موبایل / ۲ تبلت / ۳ دسکتاپ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {tiles.map((t, i) => (
          <TileCard
            key={t.id}
            tileId={t.id}
            title={t.title}
            tagline={t.tagline}
            icon={t.icon}
            accent={t.accent}
            hasAgent={Boolean(t.agent)}
            order={i}
            onOpen={() => openTile(t.id)}
          />
        ))}
      </div>

      {/* حالت خالی صادقانه — PN-016: اسکلتون ابدی جای پیام روشن (رفع تجربهٔ کاربران بی‌دسترسی) */}
      {tiles.length === 0 && (
        <div
          className="rounded-2xl border border-dashed border-muted-foreground/30 bg-muted/20 p-8 text-center space-y-2"
          data-testid="home-empty-access"
        >
          <p className="text-sm font-bold">هنوز کاشی‌ای برای شما فعال نشده است</p>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-md mx-auto">
            {userRole === "OWNER"
              ? "کاشی‌ها در حال بارگذاری‌اند — اگر ماندگار شد، اتصال را از «تنظیمات عمومی» بررسی کنید."
              : "برای فعال‌سازی دسترسی با مدیر سامانه (مالک) تماس بگیرید — از بخش «تنظیمات عمومی ← مدیریت کاربران ملک تبریز» نقش و کاشی‌های شما تعیین می‌شود."}
          </p>
        </div>
      )}

      {/* یادآوری مسیر مدیریتی — حذف به دستور مالک (جلسهٔ ۰۳۳) */}

      <footer className="mt-auto pt-6 border-t text-center text-xs text-muted-foreground">
        <p>مالک و برنامه‌نویس و طراح: سید نعمت اله سیدی</p>
        {/* P6519 — شاهد زندهٔ نسخه در UI (دستور شورا): مالک با یک نگاه می‌فهمد
            کدام بیلد را می‌بیند؛ مقدار از /api/version خوانده می‌شود */}
        <VersionBadge />
        <p className="mt-1">هویت بصری «فیروزه تبریز» — ملکا، اکوسیستم هوشمند ملک ایران</p>
      </footer>
    </main>
  );
}
