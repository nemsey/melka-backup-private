"use client";

/**
 * خانه داشبورد — چیدمان کاشی‌ای (P6526/الف — نام‌ها و ترتیب تازه)
 * ------------------------------------------------------
 * صفحه هوم — پنج کاشی به ترتیب الزامی مالک:
 *   ۱. فایل یابی ملکا · ۲. آگهی ملکا · ۳. درخواست ملکا ·
 *   ۴. تنظیمات عمومی · ۵. داشبورد مدیریتی ملک تبریز
 * کاشی «داشبورد مدیریتی» ظرف هشت کاشی تحلیلی/مدیریتی (M1-M8) است —
 * بازسازی فازهای ۷-۸-۹ (دستور مالک ۱۴۰۵/۰۷/۷).
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
import { VersionBadge } from "./VersionBadge";

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

      {/* خوش‌آمد و خلاصه وضعیت — هیروی برند */}
      <section className="mb-8 mt-5">
        <div className="relative overflow-hidden rounded-2xl border border-sec-home-200 bg-gradient-to-l from-sec-home-500/10 via-sec-home-500/[0.05] to-transparent p-5 sm:p-7">
          {/* هاله‌های تزئینی هوم — هویت آبی نفتی (گام صفر) */}
          <div className="pointer-events-none absolute -top-16 -start-16 w-56 h-56 rounded-full bg-sec-home-500/10 blur-3xl" aria-hidden />
          <div className="pointer-events-none absolute -bottom-20 -end-10 w-56 h-56 rounded-full bg-sec-home-500/[0.07] blur-3xl" aria-hidden />

          <p className="relative text-xs text-muted-foreground">
            {displayName ? `خوش آمدید، ${displayName}` : "خوش آمدید"} — لایه هوش تحلیلی ملک تبریز
          </p>
          <h2 className="relative text-xl sm:text-3xl font-extrabold mt-1.5 text-sec-home-700">
            کارگاه اصلی دفتر
          </h2>
          <p className="relative text-muted-foreground mt-2 text-sm sm:text-base leading-relaxed max-w-3xl">
            سه کاشی روزمره دفتر (فایل یابی ملکا، آگهی ملکا، درخواست ملکا) به‌همراه «تنظیمات عمومی» همین‌جا در دسترس‌اند؛
            تحلیل‌ها و مدیریت‌ها درون «داشبورد مدیریتی ملک تبریز» گرد آمده‌اند — {faNumber(managementChildren.length)} کاشی مدیریتی (M1 تا M4) با ایجنت هوشمند اختصاصی.
          </p>
        </div>
      </section>

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
          aria-label="رفتن به داشبورد مدیریتی ملک تبریز"
        >
          <Card className="border-dashed border-sec-home-200 bg-sec-home-50 hover:bg-sec-home-50/80 transition-colors">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sec-home-700 via-sec-home-500 to-sec-home-500 flex items-center justify-center shadow-md shadow-sec-home-500/25 shrink-0">
                <LayoutDashboard className="w-5 h-5 text-white" aria-hidden />
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                جست‌وجوی تحلیل‌ها؟ <b className="text-foreground">داشبورد مدیریتی ملک تبریز</b> را باز کنید —
                M1 آگهی، M2 درخواست، M3 معاملات، M4 کارشناسان، M5 شاخص قیمت، M6 عرضه و تقاضا و M7 استخراج اطلاعات ملک تبریز.
              </p>
            </CardContent>
          </Card>
        </motion.button>
      )}

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
