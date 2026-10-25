"use client";

/**
 * MiuiWakeLockGuide — PN-041-R (شورا-ن۰۶۸ · فاز ۳ · بند ۳.۳)
 * ---------------------------------------------------------------------------
 * راهنمای تصویری «چرا MIUI/Termux را می‌کشد و چطور جلویش را بگیریم» —
 * دلیل قطعی ۱ از ۵ سند. سه اقدام عملی روی گوشی Poco F3 مالک:
 *   ۱) قفل بیداری Termux (termux-wake-lock) — خودِ اسکریپت نسل K+ فعالش
 *      می‌کند؛ اینجا فقط وضعیت/راهنما است.
 *   ۲) حذف Termux از بهینه‌سازی باتری MIUI (No restrictions).
 *   ۳) قفل Termux در Recent Apps (آیکون قفل) تا پاک‌سازی حافظه نکشدش.
 * + راهنمای شارژر: WakeLock بدون شارژر، در شبیخول ~۱۵٪ باتری می‌خورد.
 *
 * «تصویری» = کارت‌های گام‌به‌گام با آیکون و مسیر دقیق منوهای MIUI
 * (بدون اسکرین‌شات واقعی گوشی — مسیرها استاندارد MIUI 14 اندروید ۱۳).
 */

import { useState } from "react";
import { BatteryCharging, Lock, Pin, Smartphone, ChevronDown, ChevronUp, Zap } from "lucide-react";

interface Step {
  icon: React.ReactNode;
  title: string;
  path: string;
  detail: string;
}

const STEPS: Step[] = [
  {
    icon: <Zap className="w-5 h-5 text-teal-600" aria-hidden />,
    title: "۱) قفل بیداری Termux (WakeLock)",
    path: "Termux ← دستور: termux-wake-lock",
    detail:
      "اسکریپت رلهٔ ملکا (نسل K به بعد) این قفل را خودکار فعال می‌کند و در لاگ می‌نویسد «قفل بیداری فعال شد». اگر پیام را ندیدید، همان یک دستور را در Termux بزنید. با این قفل، اندروید Termux را در حالت خوابِ عمیق نمی‌کشد و رله تا شبانه‌روز زنده می‌ماند.",
  },
  {
    icon: <BatteryCharging className="w-5 h-5 text-amber-600" aria-hidden />,
    title: "۲) حذف Termux از بهینه‌سازی باتری MIUI",
    path: "تنظیمات ← اپ‌ها ← مدیریت اپ‌ها ← Termux ← صرفه‌جویی باتری ← «بدون محدودیت»",
    detail:
      "MIUI به‌طور پیش‌فرض اپ‌های پس‌زمینه را «محدود» می‌زند و بعد از چند دقیقه می‌کشد. گزینهٔ «بدون محدودیت» (No restrictions) یعنی Termux آزاد می‌ماند. این مهم‌ترین دلیل قطع‌های شما بود و با این تغییر، رله در پس‌زمینه زنده می‌ماند.",
  },
  {
    icon: <Pin className="w-5 h-5 text-primary" aria-hidden />,
    title: "۳) قفل‌کردن Termux در برنامه‌های اخیر",
    path: "Recent Apps ← نگه‌داشتن کارت Termux ← آیکون قفل 🔒",
    detail:
      "پاک‌سازی حافظهٔ MIUI (Delete در Recent) همهٔ اپ‌های قفل‌نشده را می‌کشد. با زدن آیکون قفل روی کارت Termux، دکمهٔ «پاک‌کردن همه» آن را دور می‌زند. اگر رله بعد از «پاک‌کردن حافظه» قطع شد، فقط Termux را دوباره باز کنید — اسکریپت خودش ادامه می‌دهد.",
  },
];

export function MiuiWakeLockGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border border-amber-300/60 dark:border-amber-800/60 bg-amber-50/60 dark:bg-amber-950/30 p-3 space-y-2">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-2 text-right"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="text-xs font-bold flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-amber-600" aria-hidden />
          راهنمای تصویری MIUI — چرا Termux خاموش می‌شود و ۳ راه‌حل
        </span>
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" aria-hidden />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" aria-hidden />
        )}
      </button>

      {open ? (
        <div className="space-y-2">
          {STEPS.map((s) => (
            <div key={s.title} className="rounded-md border bg-card p-3 space-y-1.5">
              <p className="text-xs font-bold flex items-center gap-2">
                {s.icon}
                {s.title}
              </p>
              <p className="text-[11px] font-mono bg-muted/60 rounded px-2 py-1 break-all" dir="rtl">
                {s.path}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">{s.detail}</p>
            </div>
          ))}
          <p className="text-[10px] text-muted-foreground leading-relaxed flex items-center gap-1.5">
            <Lock className="w-3 h-3 shrink-0" aria-hidden />
            نکتهٔ باتری: رله با Long-Polling ۱۰۰ثانیه‌ای (نسل L) فقط ~۸۶۰ درخواست در شبانه‌روز می‌زند —
            مصرف باتری ناچیز است؛ شارژر شب توصیه می‌شود اما واجب نیست.
          </p>
        </div>
      ) : (
        <p className="text-[10px] text-muted-foreground leading-relaxed">
          MIUI اپ‌های پس‌زمینه را می‌کشد — بزرگ‌ترین دلیل قطع رله. با «بدون محدودیت» + قفل WakeLock +
          قفل Recent، رله شبانه‌روز زنده می‌ماند. (باز کنید برای مسیرهای دقیق)
        </p>
      )}
    </div>
  );
}
