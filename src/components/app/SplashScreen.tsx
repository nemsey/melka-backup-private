"use client";

/**
 * SplashScreen — صفحهٔ آغازین با آیکون برند (قانون ظاهر فاخر ۰۳۵-B — بخش ج/۱)
 * --------------------------------------------------------------------------
 * • در نخستین بارگذاری هر نشست (نه هر بازگشت به هوم) نمایش داده می‌شود.
 * • حداقل ۶۰۰ms + محو ۳۰۰ms (احترام به prefers-reduced-motion: محو فوری).
 * • بدون پرش محتوا: لایهٔ تمام‌صفحهٔ ثابت (CLS صفر).
 */

import { useEffect, useState } from "react";

export function SplashScreen() {
  const [show, setShow] = useState(true);
  const [fading, setFading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShow(false);
      return;
    }
    if (sessionStorage.getItem("melka-splash-shown") === "1") { setShow(false); return; }
    const t1 = window.setTimeout(() => {
      setFading(true);
      sessionStorage.setItem("melka-splash-shown", "1");
    }, 600);
    const t2 = window.setTimeout(() => setShow(false), 950);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, []);

  if (!show) return null;
  return (
    <div
      aria-hidden
      className={`splash-screen fixed inset-0 z-[100] flex flex-col items-center justify-center gap-5 bg-gradient-to-b from-primary/10 via-background to-background ${fading ? "splash-fade" : ""}`}
    >
      <div className="splash-logo size-24 rounded-3xl bg-gradient-to-br from-teal-600 via-teal-500 to-cyan-500 flex items-center justify-center shadow-2xl shadow-primary/30">
        {/* آیکون برند — همان نشان ساختمان اپلیکیشن */}
        <svg viewBox="0 0 24 24" className="size-12 text-white" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" />
          <path d="M6 12H4a2 2 0 0 0-2 2v8h4" />
          <path d="M18 8h2a2 2 0 0 1 2 2v12h-4" />
          <path d="M10 6h1M13 6h1M10 10h1M13 10h1M10 14h1M13 14h1M10 18h1M13 18h1" />
        </svg>
      </div>
      <div className="text-center">
        <h1 className="text-xl font-extrabold text-primary">ملکا</h1>
        <p className="text-xs text-muted-foreground mt-1">اکوسیستم هوشمند ملک ایران</p>
      </div>
      <div className="splash-bar w-32 h-1 rounded-full bg-primary/20 overflow-hidden">
        <div className="splash-bar-fill h-full w-1/2 bg-primary rounded-full" />
      </div>
    </div>
  );
}
