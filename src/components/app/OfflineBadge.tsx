"use client";

/**
 * OfflineBadge — نشان آفلاین (قانون ظاهر فاخر ۰۳۵-B — بخش ج/۵)
 * -------------------------------------------------------------
 * وقتی اتصال شبکه قطع است، نشان طراحی‌شده در هدر ظاهر می‌شود؛
 * بازگشت آنلاین با toast اطلاع‌رسانی می‌شود.
 */

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function OfflineBadge() {
  const [online, setOnline] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    setOnline(navigator.onLine);
    const goOffline = () => setOnline(false);
    const goOnline = () => {
      setOnline(true);
      toast({ title: "اتصال شبکه برقرار شد", description: "اطلاعات دوباره در دسترس است." });
    };
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, [toast]);

  if (online) return null;
  return (
    <span
      role="status"
      aria-label="اتصال شبکه قطع است"
      className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2.5 py-1 text-[11px] font-bold"
    >
      <WifiOff className="size-3.5" aria-hidden />
      آفلاین
    </span>
  );
}
