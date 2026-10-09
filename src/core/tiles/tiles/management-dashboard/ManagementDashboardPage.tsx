"use client";

/**
 * صفحه کاشی «داشبورد مدیریتی ملک تبریز» — ظرف هشت کاشی مدیریتی و تحلیلی (M1 تا M8 — P6545/جلسه ۰۳۳)
 * ------------------------------------------------------
 * بازسازی فازهای ۷-۸-۹ (دستور مالک ۱۴۰۵/۰۷/۷) — ترتیب و نام الزامی مالک:
 *   M1 آگهی ملک تبریز · M2 درخواست ملک تبریز · M3 معاملات ملک تبریز ·
 *   M4 کارشناسان ملک تبریز
 * بازگشت از هر کاشی فرزند، به همین صفحه برمی‌گردد؛ صفحه هوم (فایل یابی ملکا،
 * آگهی ملکا، درخواست ملکا، تنظیمات عمومی) مستقل از این ظرف است.
 * جلسهٔ ۰۳۳ (دستور مالک): سربرگ توضیحی + نشان‌های آمار + کارت راهنمای بازگشت
 * حذف شدند — صفحه فقط شبکهٔ کاشی‌هاست.
 */

import { Skeleton } from "@/components/ui/skeleton";
import type { TilePageProps } from "@/core/tiles/tile-contract";
import { tileRegistry } from "@/core/tiles/tile-registry";
import { useAppStore } from "@/lib/client/store";
import { TileCard } from "@/components/app/TileCard";

export function ManagementDashboardPage({ settings, userRole }: TilePageProps) {
  const openTile = useAppStore((s) => s.openTile);
  const children = tileRegistry.listChildren("management-dashboard", userRole);

  const showTaglines = settings.showTaglines !== false;

  return (
    <div className="space-y-6">
      {/* شبکه کاشی‌های مدیریتی — همان زبان بصری صفحه خانه */}
      {children.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {children.map((t, i) => (
            <TileCard
              key={t.id}
              tileId={t.id}
              title={t.title}
              tagline={showTaglines ? t.tagline : ""}
              icon={t.icon}
              accent={t.accent}
              hasAgent={Boolean(t.agent)}
              order={i}
              onOpen={() => openTile(t.id, "management-dashboard")}
            />
          ))}
        </div>
      )}

    </div>
  );
}


/** P6549 — خروجی پیش‌فرض برای بارگذاری تنبل (lazyPage) */
export default ManagementDashboardPage;
