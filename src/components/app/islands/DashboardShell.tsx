"use client";

/**
 * DashboardShell — جزیرهٔ پوستهٔ داشبورد (PN-013 فاز ۴)
 * ---------------------------------------------------------------------------
 * همهٔ وابستگی‌های سنگینِ «پس از ورود» در همین جزیره جمع شده‌اند:
 *   · framer-motion (MotionConfig + انیمیشن کارت‌ها)
 *   · رجیستری کاشی + bootstrap (تعریف ۱۳ کاشی؛ صفحه‌های هر کاشی
 *     از قبل تنبل‌اند — lazyPage قانون ۰۳۵-B-ح)
 *   · AppHeader · DashboardHome · TileShell · SplashScreen · BottomNav
 * کاربرِ وارد‌نشده (صفحهٔ ورود) هرگز این چانک را نمی‌گیرد؛ چرخهٔ اولیه
 * (boot splash) هم بدون این جزیره رندر می‌شود.
 */

import { MotionConfig } from "framer-motion";
import { AppHeader } from "@/components/app/AppHeader";
import { BottomNav } from "@/components/app/BottomNav";
import { DashboardHome } from "@/components/app/DashboardHome";
import { SplashScreen } from "@/components/app/SplashScreen";
import { TileShell } from "@/components/app/TileShell";
import { tileRegistry } from "@/core/tiles/tile-registry";
import "@/core/tiles/bootstrap";

export default function DashboardShell({
  stage,
  activeTileId,
}: {
  stage: string;
  activeTileId: string | null;
}) {
  const tile = activeTileId ? tileRegistry.get(activeTileId) : null;

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen flex flex-col bg-background">
        {/* قانون ۰۳۵-B/ج-۱: اسپلش با آیکون برند — نخستین بارگذاری هر نشست */}
        <SplashScreen />
        <AppHeader />
        {stage === "tile" && tile ? <TileShell tile={tile} /> : <DashboardHome />}
        {/* قانون ۰۳۵-B/ج-۳: ناوبری پایین (موبایل) + فاصلهٔ محتوا (CLS صفر) */}
        <div className="bottom-nav-spacer" aria-hidden />
        <BottomNav />
      </div>
    </MotionConfig>
  );
}
