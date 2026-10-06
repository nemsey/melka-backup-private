"use client";

/**
 * SwRegister — ثبت Service Worker + بنر آپدیت (قانون ظاهر فاخر ۰۳۵-B — بخش ج/۵)
 * -----------------------------------------------------------------------------
 * نسخهٔ ۵ (sw-v5.js): به‌روزرسانی «پیام‌محور» —
 *   • هر بارگذاری: registration.update() (عبور از کش HTTP).
 *   • اگر SW نو منتظر است (waiting): بنر طراحی‌شدهٔ «نسخهٔ جدید آماده است»
 *     با دکمهٔ «همین حالا تازه کن» ← postMessage SKIP_WAITING ← تازه‌سازی یکباره.
 *   • گارانتی حفظ‌شده: هیچ قفل روی نسخهٔ کهنه (controllerchange → reload یکبار).
 * فقط production (dev هر بار چانک تازه می‌سازد — بنر بی‌معنا و مزاحم).
 */

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { haptic } from "@/lib/haptics";

export function SwRegister() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") return;
    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    };
    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        await registration.update().catch(() => {});
        if (registration.waiting) setWaiting(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const nw = registration.installing;
          nw?.addEventListener("statechange", () => {
            if (nw.state === "installed" && registration.waiting) setWaiting(registration.waiting);
          });
        });
        navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
      } catch {
        /* ثبت ناموفق — اپ بدون SW هم کار می‌کند */
      }
    };
    void register();
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  if (!waiting) return null;
  return (
    <div
      role="status"
      aria-label="نسخهٔ جدید اپلیکیشن آماده است"
      className="fixed bottom-20 md:bottom-6 inset-x-4 z-50 md:inset-x-auto md:end-6 md:max-w-sm"
    >
      <div className="rounded-2xl border border-primary/30 bg-card/95 backdrop-blur shadow-xl shadow-primary/10 p-4 flex items-center gap-3 animate-in slide-in-from-bottom-4 fade-in duration-300">
        <div className="size-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
          <Sparkles className="size-5" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">نسخهٔ جدید آماده است</p>
          <p className="text-xs text-muted-foreground">برای دریافت اصلاحات و بهبودها تازه کنید.</p>
        </div>
        <Button
          size="sm"
          className="shrink-0"
          onClick={() => {
            haptic("success");
            waiting.postMessage("SKIP_WAITING");
          }}
        >
          همین حالا تازه کن
        </Button>
      </div>
    </div>
  );
}
