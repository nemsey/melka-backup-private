"use client";

/**
 * صفحه اصلی — پوسته SPA (تک‌صفحه‌ای)
 * ماشین وضعیت: boot → auth → otp → home ⇄ tile
 * کل چرخه در همین فایل هدایت می‌شود؛ کاشی‌ها از رجیستری بارگذاری می‌شوند.
 */

import { useEffect } from "react";
import { useAppStore } from "@/lib/client/store";
import { AuthScreen } from "@/components/app/AuthScreen";
import { OtpScreen } from "@/components/app/OtpScreen";
import { AppHeader } from "@/components/app/AppHeader";
import { DashboardHome } from "@/components/app/DashboardHome";
import { TileShell } from "@/components/app/TileShell";
import { SwRegister } from "@/components/app/SwRegister";
// P6526/ث-۲ — دکمهٔ «باز کردن در صفحهٔ جدید» برای پیش‌نمایش داخل قاب چت
import { OpenInNewTabButton } from "@/components/app/OpenInNewTabButton";
import { tileRegistry } from "@/core/tiles/tile-registry";
import "@/core/tiles/bootstrap";
import { Loader2 } from "lucide-react";

export default function Page() {
  const stage = useAppStore((s) => s.stage);
  const boot = useAppStore((s) => s.boot);
  const activeTileId = useAppStore((s) => s.activeTileId);

  useEffect(() => {
    void boot();
  }, [boot]);

  // مرحله راه‌اندازی: بازیابی نشست رمزنگاری‌شده
  if (stage === "boot") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background relative">
        <SwRegister />
        <div className="absolute top-3 start-3 z-50">
          <OpenInNewTabButton />
        </div>
        <Loader2 className="w-8 h-8 animate-spin text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">در حال بازیابی نشست امن…</p>
      </div>
    );
  }

  // مراحل ورود
  if (stage === "auth") {
    return (
      <>
        <SwRegister />
        <div className="fixed top-3 start-3 z-50">
          <OpenInNewTabButton />
        </div>
        <AuthScreen />
      </>
    );
  }
  if (stage === "otp") {
    return (
      <>
        <SwRegister />
        <div className="fixed top-3 start-3 z-50">
          <OpenInNewTabButton />
        </div>
        <OtpScreen />
      </>
    );
  }

  // داشبورد اصلی
  const tile = activeTileId ? tileRegistry.get(activeTileId) : null;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <SwRegister />
      <AppHeader />
      {stage === "tile" && tile ? <TileShell tile={tile} /> : <DashboardHome />}
    </div>
  );
}
