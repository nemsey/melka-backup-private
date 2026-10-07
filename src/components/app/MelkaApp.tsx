"use client";

/**
 * MelkaApp — ریشهٔ جزیرهٔ کلاینت (PN-013 فاز ۴: Server Shell + Client Islands)
 * ---------------------------------------------------------------------------
 * ماشین وضعیت: boot → auth → otp → home ⇄ tile
 * این ماژول تنها روتر سبک است: store + بووت نشست + اسپلش ایستا.
 * سه جزیرهٔ پویا (بدون SSR — محتوایشان به نشست مرورگر وابسته است):
 *   · islands/AuthFlow        → فقط کاربرِ در حال ورود
 *   · islands/DashboardShell  → فقط پس از ورود (framer-motion + رجیستری کاشی)
 *   · islands/UpdateController→ ثبت SW، غیرمسدودکننده
 * اصل: «هر جزیره فقط وقتی بارگذاری می‌شود که به آن نیاز است.»
 */

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useAppStore } from "@/lib/client/store";
import { OpenInNewTabButton } from "@/components/app/OpenInNewTabButton";

const AuthFlow = dynamic(() => import("./islands/AuthFlow"), { ssr: false });
const DashboardShell = dynamic(() => import("./islands/DashboardShell"), { ssr: false });
const UpdateController = dynamic(() => import("./islands/UpdateController"), { ssr: false });

/** جایگزینِ سبک هنگام بارگذاری جزیرهٔ ورود — همان چیدمان اسپلش (CLS صفر) */
function IslandFallback() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background" role="status" aria-label="ملکا در حال آماده‌سازی">
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-600 via-teal-500 to-cyan-500 flex items-center justify-center shadow-xl shadow-primary/25">
        <Loader2 className="w-8 h-8 animate-spin text-white" aria-hidden />
      </div>
      <p className="text-xs text-muted-foreground/80">در حال آماده‌سازی…</p>
    </div>
  );
}

export function MelkaApp() {
  const stage = useAppStore((s) => s.stage);
  const boot = useAppStore((s) => s.boot);
  const activeTileId = useAppStore((s) => s.activeTileId);

  // SessionController — بازیابی نشست رمزنگاری‌شده پس از هیدراته‌شدن
  // + پیش‌بارگذاری موازی جزیرهٔ ورود: چانک AuthFlow همزمان با بررسی IndexedDB
  //   دانلود می‌شود (نه پس از آن) — زمان تا فرم تعاملی ورود بهینه می‌ماند.
  useEffect(() => {
    void import("./islands/AuthFlow");
    void boot();
  }, [boot]);

  // پیش‌واکشی داشبورد در بیکاریِ صفحهٔ ورود — الگوی استاندارد جزیره‌ای:
  // کاربر در حال تایپ کد/OTP است؛ چانک سنگین داشبورد (framer-motion + رجیستری
  // کاشی) در همان لحظه در پس‌زمینه می‌آید تا پس از ورود، داشبورد بی‌درنگ باز شود.
  // (تنها هزینه: یک دانلود بی‌استفاده برای بازدیدکننده‌ای که ورود را رها کند.)
  useEffect(() => {
    if (stage === "auth" || stage === "otp") {
      void import("./islands/DashboardShell");
    }
  }, [stage]);

  // مرحله راه‌اندازی: بازیابی نشست — اسپلش ایستا (سرور هم همین را می‌فرستد)
  if (stage === "boot") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background relative">
        <UpdateController />
        <div className="absolute top-3 start-3 z-50">
          <OpenInNewTabButton />
        </div>
        {/* P6549/۰۳۵-B-ح: هویت برند در نخستین رنگ — LCP همان FCP می‌شود (بدون پرش محتوا) */}
        <div className="flex flex-col items-center gap-3" role="status" aria-label="ملکا در حال راه‌اندازی">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-600 via-teal-500 to-cyan-500 flex items-center justify-center shadow-xl shadow-primary/25">
            <Loader2 className="w-8 h-8 animate-spin text-white" aria-hidden />
          </div>
          <h1 className="text-2xl font-extrabold text-primary">ملکا</h1>
          <p className="text-sm text-muted-foreground">اکوسیستم هوشمند ملک ایران</p>
          <p className="text-xs text-muted-foreground/80">در حال بازیابی نشست امن…</p>
        </div>
      </div>
    );
  }

  // مراحل ورود — جزیرهٔ AuthFlow (بدون رجیستری کاشی و framer-motion)
  if (stage === "auth" || stage === "otp") {
    return (
      <div className="min-h-screen bg-background">
        <UpdateController />
        <div className="fixed top-3 start-3 z-50">
          <OpenInNewTabButton />
        </div>
        <AuthFlow stage={stage} />
      </div>
    );
  }

  // داشبورد — جزیرهٔ کامل (اسپلش نشست + سربرگ + کاشی‌ها + ناوبری پایین)
  return (
    <div className="min-h-screen bg-background">
      <UpdateController />
      <div className="fixed top-3 start-3 z-50">
        <OpenInNewTabButton />
      </div>
      <DashboardShell stage={stage} activeTileId={activeTileId} />
    </div>
  );
}
