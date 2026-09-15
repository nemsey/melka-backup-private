"use client";

/**
 * نوار نشانگرهای اتصال — هفت چراغ سبز/قرمز بالای صفحه خانه (بخش هوم)
 * ------------------------------------------------------
 * هر اتصالِ تنظیم‌شده در تنظیمات عمومی، اینجا به‌صورت چراغ نشان داده می‌شود:
 * سبز = برقرار | قرمز = قطع — با تازه‌سازی خودکار هر ۶۰ ثانیه
 * ۱. حساب شخصی ARM  ۲. API ARM  ۳. حساب شخصی PM  ۴. API PM
 * ۵. API دیوار  ۶. حساب شخصی دیوار  ۷. حساب اینستاگرام
 */

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { Wifi, WifiOff, Loader2, Activity } from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { faDateTime } from "@/lib/format";
import { useAppStore } from "@/lib/client/store";

interface IndicatorState {
  key: string;
  label: string;
  connected: boolean;
  detail: string;
  checkedAt: string;
}

const LABELS_FA: Record<string, string> = {
  armAccount: "اتصال به حساب شخصی سامانه arm",
  armApi: "اتصال به api سامانه arm",
  pmAccount: "اتصال به حساب شخصی سامانه pm",
  pmApi: "اتصال به api سامانه pm",
  divarApi: "اتصال به api دیوار",
  divarAccount: "اتصال به حساب شخصی دیوار",
  instagramAccount: "اتصال به حساب اینستاگرام",
};

export function ConnectionIndicators() {
  const { toast } = useToast();
  const openTile = useAppStore((s) => s.openTile);
  const [indicators, setIndicators] = useState<IndicatorState[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);

  const load = useCallback(
    async (silent = true) => {
      if (!silent) setLoading(true);
      try {
        const res = await api<{ ok: boolean; indicators: IndicatorState[] }>("/api/indicators");
        // ترتیب مالک: armAccount, armApi, pmAccount, pmApi, divarApi, divarAccount, instagramAccount
        const order = ["armAccount", "armApi", "pmAccount", "pmApi", "divarApi", "divarAccount", "instagramAccount"];
        const sorted = [...res.indicators].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
        setIndicators(sorted);
        setLastRefresh(new Date().toISOString());
      } catch (err) {
        if (!silent) {
          const e = err as ApiClientError;
          toast({ title: "خطا در بررسی اتصال‌ها", description: e.message, variant: "destructive" });
        }
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  useEffect(() => {
    void load(false);
    const timer = setInterval(() => void load(true), 60_000);
    return () => clearInterval(timer);
  }, [load]);

  const connectedCount = indicators?.filter((i) => i.connected).length ?? 0;

  return (
    <section
      className="rounded-2xl border border-primary/15 bg-gradient-to-l from-primary/[0.07] via-cyan-500/[0.05] to-transparent p-3.5 sm:p-4"
      aria-label="وضعیت اتصال‌های سامانه‌ها"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2.5">
        <h3 className="text-xs font-bold flex items-center gap-1.5">
          <Activity className="w-4 h-4 text-primary" aria-hidden />
          وضعیت اتصال‌ها
          {indicators && (
            <Badge variant={connectedCount === 7 ? "default" : connectedCount >= 4 ? "secondary" : "destructive"} className="text-[10px] gap-1">
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${connectedCount === 7 ? "bg-emerald-400" : connectedCount >= 4 ? "bg-amber-400" : "bg-rose-400"}`} />
              {connectedCount.toLocaleString("fa-IR")} از ۷
            </Badge>
          )}
        </h3>
        <button
          type="button"
          className="text-[10px] text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
          onClick={() => void load(false)}
          aria-label="تازه‌سازی وضعیت اتصال‌ها"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden /> : null}
          {lastRefresh ? `بررسی: ${faDateTime(lastRefresh)}` : "بررسی…"}
        </button>
      </div>

      <TooltipProvider delayDuration={100}>
        <div className="flex flex-wrap gap-1.5">
          {(indicators ?? Array.from({ length: 7 }, (_, i) => ({ key: `ph-${i}`, label: "", connected: false, detail: "", checkedAt: "" }))).map(
            (ind) => {
              const label = LABELS_FA[ind.key] ?? ind.label;
              const isPlaceholder = ind.key.startsWith("ph-");
              return (
                <Tooltip key={ind.key}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className={`group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-all hover:shadow-sm ${
                        isPlaceholder
                          ? "border-border/50 bg-muted/30 text-muted-foreground/60"
                          : ind.connected
                            ? "border-emerald-300/70 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                            : "border-rose-300/70 bg-rose-50 text-rose-800 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300"
                      }`}
                      onClick={() => openTile("settings")}
                      aria-label={`${label}: ${ind.connected ? "برقرار" : "قطع"} — برای مدیریت به تنظیمات عمومی بروید`}
                    >
                      {isPlaceholder ? (
                        <Loader2 className="w-2.5 h-2.5 animate-spin" aria-hidden />
                      ) : ind.connected ? (
                        <Wifi className="w-3 h-3" aria-hidden />
                      ) : (
                        <WifiOff className="w-3 h-3" aria-hidden />
                      )}
                      {label || "…"}
                      {!isPlaceholder && (
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${ind.connected ? "bg-emerald-500 animate-pulse" : "bg-rose-500"}`} aria-hidden />
                      )}
                    </button>
                  </TooltipTrigger>
                  {!isPlaceholder && (
                    <TooltipContent side="bottom" className="max-w-64 text-right" dir="rtl">
                      <p className="text-[11px] font-bold">{label}</p>
                      <p className="text-[10px] leading-4 mt-0.5">{ind.detail}</p>
                      <p className="text-[9px] text-muted-foreground mt-1">آخرین بررسی: {faDateTime(ind.checkedAt)}</p>
                      <p className="text-[9px] text-muted-foreground mt-0.5">برای مدیریت اتصال، کلیک کنید — تنظیمات عمومی</p>
                    </TooltipContent>
                  )}
                </Tooltip>
              );
            }
          )}
        </div>
      </TooltipProvider>
    </section>
  );
}
