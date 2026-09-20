"use client";

/**
 * صفحه کاشی «داشبورد مدیریتی» — ظرف کاشی‌های مدیریتی و تحلیلی
 * ------------------------------------------------------
 * کاشی‌های تحلیلی/مدیریتی (معاملات، قراردادها، باشگاه مشتریان، مالی، شاخص قیمت،
 * کارشناسان، بازدیدها، عرضه و تقاضا، استخراج) درون همین کاشی نمایش داده می‌شوند؛
 * صفحه خانه کارگاه اصلی (فایل‌یابی، آگهی، درخواست ملک) و همین کاشی را نشان می‌دهد
 * و «تنظیمات عمومی» آخرین کاشی صفحه هوم است. بازگشت از هر کاشی فرزند، به همین
 * داشبورد برمی‌گردد.
 */

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { LayoutDashboard, BrainCircuit, Network, ShieldCheck } from "lucide-react";
import type { TilePageProps } from "@/core/tiles/tile-contract";
import { tileRegistry } from "@/core/tiles/tile-registry";
import { useAppStore } from "@/lib/client/store";
import { faNumber } from "@/lib/format";
import { TileCard } from "@/components/app/TileCard";
import type { LucideIcon } from "lucide-react";

export function ManagementDashboardPage({ settings, userRole }: TilePageProps) {
  const openTile = useAppStore((s) => s.openTile);
  const children = tileRegistry.listChildren("management-dashboard", userRole);

  const agentCount = children.filter((t) => t.agent).length;
  const showTaglines = settings.showTaglines !== false;

  return (
    <div className="space-y-6">
      {/* سربرگ */}
      <section className="relative overflow-hidden rounded-2xl border border-teal-500/15 bg-gradient-to-l from-teal-600/10 via-cyan-500/[0.06] to-transparent p-5 sm:p-6">
        <div className="pointer-events-none absolute -top-14 -end-10 w-48 h-48 rounded-full bg-primary/10 blur-3xl" aria-hidden />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-xl font-extrabold flex items-center gap-2">
              <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-teal-600 via-teal-500 to-cyan-500 shadow-lg shadow-teal-600/30 shrink-0">
                <LayoutDashboard className="w-5 h-5 text-white" aria-hidden />
              </span>
              داشبورد مدیریتی ملک تبریز
            </h2>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed max-w-3xl">
              مرکز فرمان تحلیل‌ها و مدیریت دفتر املاک — همه کاشی‌های مدیریتی و تحلیلی در این‌جا گرد آمده‌اند:
              معاملات، قراردادها و اسناد، باشگاه مشتریان، مالی و کمیسیون، شاخص قیمت روز مناطق، کارشناسان، بازدیدها و پیگیری‌ها،
              عرضه و تقاضا، استخراج اطلاعات، آگهی‌های سامانه ARM و درخواست‌های سامانه ARM. هر کاشی را انتخاب کنید تا وارد فضای تخصصی آن شوید؛
              «تنظیمات عمومی» روی صفحه خانه (آخرین کاشی) در دسترس است.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <Badge variant="secondary" className="gap-1.5 py-1.5 px-3">
              <Network className="w-3.5 h-3.5" aria-hidden /> {faNumber(children.length)} کاشی مدیریتی
            </Badge>
            <Badge variant="secondary" className="gap-1.5 py-1.5 px-3">
              <BrainCircuit className="w-3.5 h-3.5" aria-hidden /> {faNumber(agentCount)} ایجنت هوشمند
            </Badge>
            <Badge variant="outline" className="gap-1.5 py-1.5 px-3">
              <ShieldCheck className="w-3.5 h-3.5" aria-hidden /> حافظه اختصاصی هر ایجنت
            </Badge>
          </div>
        </div>
      </section>

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

      {/* راهنمای بازگشت */}
      <Card className="border-dashed">
        <CardContent className="p-4 text-xs text-muted-foreground leading-relaxed flex items-start gap-2">
          <LayoutDashboard className="w-4 h-4 shrink-0 mt-0.5 text-teal-600 dark:text-teal-400" aria-hidden />
          <p>
            دکمه بازگشت هر کاشی داخل این داشبورد، شما را به همین صفحه برمی‌گرداند؛ برای رسیدن به صفحه خانه،
            از داشبورد مدیریتی ملک تبریز یک بار دیگر بازگشت را بزنید. کارگاه اصلی دفتر (فایل‌یابی، آگهی، درخواست ملک) و تنظیمات عمومی همیشه مستقیم روی صفحه خانه در دسترس‌اند.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
