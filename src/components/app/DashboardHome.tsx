"use client";

/**
 * خانه داشبورد — چیدمان کاشی‌ای
 * ------------------------------------------------------
 * صفحه خانه فقط کارگاه اصلی دفتر را نشان می‌دهد: فایل‌یابی، آگهی، درخواست ملک
 * و کاشی «داشبورد مدیریتی» (ظرف همه کاشی‌های تحلیلی/مدیریتی).
 * کاشی‌های داخل ظرف در خود همان کاشی نمایش داده می‌شوند (listChildren).
 */

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { LayoutDashboard } from "lucide-react";
import { tileRegistry } from "@/core/tiles/tile-registry";
import { useAppStore } from "@/lib/client/store";
import { faNumber } from "@/lib/format";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { ConnectionIndicators } from "./ConnectionIndicators";
import { TileCard } from "./TileCard";

export function DashboardHome() {
  const userRole = useAppStore((s) => s.user?.role ?? "CONSULTANT");
  const openTile = useAppStore((s) => s.openTile);
  const displayName = useAppStore((s) => s.user?.displayName);
  const tiles = tileRegistry.listRoot(userRole);
  const managementChildren = tileRegistry.listChildren("management-dashboard", userRole);

  return (
    <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 py-8 flex flex-col">
      {/* نشانگرهای اتصال — هفت چراغ سبز/قرمز (الزام مالک) */}
      <ConnectionIndicators />

      {/* خوش‌آمد و خلاصه وضعیت */}
      <section className="mb-8 mt-5">
        <div className="rounded-2xl border border-primary/15 bg-gradient-to-l from-primary/10 via-emerald-500/5 to-transparent p-5 sm:p-6">
          <p className="text-xs text-muted-foreground">
            {displayName ? `خوش آمدید، ${displayName}` : "خوش آمدید"} — لایه هوش تحلیلی ملک تبریز
          </p>
          <h2 className="text-xl sm:text-2xl font-extrabold mt-1 bg-gradient-to-l from-emerald-700 via-emerald-600 to-amber-600 dark:from-emerald-400 dark:via-emerald-300 dark:to-amber-400 bg-clip-text text-transparent">
            کارگاه اصلی دفتر
          </h2>
          <p className="text-muted-foreground mt-1.5 text-sm sm:text-base leading-relaxed max-w-3xl">
            سه کاشی اصلی روزمره دفتر (فایل‌یابی، آگهی، درخواست ملک) همین‌جا در دسترس‌اند؛
            تحلیل‌ها و مدیریت‌ها درون «داشبورد مدیریتی» گرد آمده‌اند — {faNumber(managementChildren.length)} کاشی مدیریتی با ایجنت هوشمند اختصاصی.
          </p>
        </div>
      </section>

      {/* شبکه کاشی‌های اصلی — ریسپانسیو: ۱ ستون موبایل / ۲ تبلت / ۳ دسکتاپ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {tiles.map((t, i) => (
          <TileCard
            key={t.id}
            tileId={t.id}
            title={t.title}
            tagline={t.tagline}
            icon={t.icon as unknown as LucideIcon}
            accent={t.accent}
            hasAgent={Boolean(t.agent)}
            order={i}
            onOpen={() => openTile(t.id)}
          />
        ))}
      </div>

      {/* اسکلت‌ن نمایشی برای بار اول */}
      {tiles.length === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      )}

      {/* یادآوری مسیر مدیریتی */}
      {managementChildren.length > 0 && (
        <motion.button
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.3 }}
          onClick={() => openTile("management-dashboard")}
          className="tile-press mt-4 text-right focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl w-full"
          aria-label="رفتن به داشبورد مدیریتی"
        >
          <Card className="border-dashed border-emerald-500/30 bg-emerald-500/[0.03] hover:bg-emerald-500/[0.06] transition-colors">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-600 to-teal-500 flex items-center justify-center shadow-md shrink-0">
                <LayoutDashboard className="w-5 h-5 text-white" aria-hidden />
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                جست‌وجوی تحلیل‌ها؟ <b className="text-foreground">داشبورد مدیریتی</b> را باز کنید —
                معاملات، قراردادها، باشگاه مشتریان، مالی و کمیسیون، شاخص قیمت، کارشناسان، بازدیدها، عرضه و تقاضا، استخراج و تنظیمات عمومی.
              </p>
            </CardContent>
          </Card>
        </motion.button>
      )}

      <footer className="mt-auto pt-6 border-t text-center text-xs text-muted-foreground">
        <p>مالک و برنامه‌نویس و طراح: سید نعمت اله سیدی</p>
        <p className="mt-1">نسخه ۱٫۶٫۰ — داشبورد هوشمند چندعامله ملک تبریز</p>
      </footer>
    </main>
  );
}
