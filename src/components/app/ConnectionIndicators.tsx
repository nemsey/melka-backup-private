"use client";

/**
 * نوار نشانگرهای اتصال — یازده چراغ سبز/قرمز (P6546/گام صفر + PN-046/گام صفر)
 * ------------------------------------------------------
 * هر اتصالِ تنظیم‌شده در تنظیمات عمومی، اینجا به‌صورت چراغ نشان داده می‌شود:
 * سبز = برقرار | قرمز = قطع — با تازه‌سازی خودکار هر ۶۰ ثانیه
 * ۱. حساب شخصی ARM  ۲. API ARM  ۳. حساب شخصی PM  ۴. API PM
 * ۵. سامانه عمومی ملک تبریز  ۶. API GAP
 * ۷. CRM ملکتون (ورود واقعی یوزر/پسورد — PN-046)  ۸. سایت عمومی ملکتون (PN-046)
 * ۹. API دیوار  ۱۰. حساب شخصی دیوار  ۱۱. حساب اینستاگرام
 *
 * جلسهٔ ۰۳۳ (دستور مالک): چراغ «حساب GAP» حذف شد (بخش اتصال GAP هم از تنظیمات حذف شد).
 *
 * P6546/گام صفر-۵: «ثابت ماندن بخش وضعیت اتصال» — همین مؤلفه در دو حالت رندر می‌شود:
 *   variant="full"  → بالای صفحه خانه (همان نوار کامل همیشگی)
 *   variant="compact" → درون TileShell بالای همهٔ کاشی‌ها (نوار فشردهٔ چرخان)
 */

import { useCallback, useEffect, useRef, useState } from "react";
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
  melkPublicApi: "اتصال به سامانه عمومی ملک تبریز",
  gapApi: "اتصال به api سامانه gap",
  melketunCrm: "اتصال به CRM ملکتون (حساب شخصی یوزر/پسورد)",
  melketunPublic: "اتصال به سایت عمومی ملکتون",
  divarApi: "اتصال به api دیوار",
  divarAccount: "اتصال به حساب شخصی دیوار",
  instagramAccount: "اتصال به حساب اینستاگرام",
};

/** برچسب کوتاه برای حالت فشردهٔ کاشی‌ها */
const LABELS_SHORT_FA: Record<string, string> = {
  armAccount: "حساب ARM",
  armApi: "API ARM",
  pmAccount: "حساب PM",
  pmApi: "API PM",
  melkPublicApi: "سامانه عمومی ملک",
  gapApi: "API GAP",
  melketunCrm: "CRM ملکتون",
  melketunPublic: "سایت عمومی ملکتون",
  divarApi: "API دیوار",
  divarAccount: "حساب دیوار",
  instagramAccount: "اینستاگرام",
};

/** ترتیب مالک: سامانه‌های ملک تبریز اول، سپس ملکتون (PN-046)، سپس دیوار و اینستاگرام */
const ORDER = ["armAccount", "armApi", "pmAccount", "pmApi", "melkPublicApi", "gapApi", "melketunCrm", "melketunPublic", "divarApi", "divarAccount", "instagramAccount"];
const TOTAL = ORDER.length;

export function ConnectionIndicators({ variant = "full" }: { variant?: "full" | "compact" }) {
  const { toast } = useToast();
  const openTile = useAppStore((s) => s.openTile);
  const [indicators, setIndicators] = useState<IndicatorState[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  /** PN-028 — آیا دست‌کم یک بار دادهٔ نشانگرها دریافت شد (برای تلاش دوم بی‌صدا) */
  const gotDataRef = useRef(false);

  const load = useCallback(
    async (silent = true) => {
      if (!silent) setLoading(true);
      try {
        // PN-028/اولاً — مهلت کوتاه ۱۵ ثانیه (پیش از این ۹۰): نشانگرها هرگز نباید
        // مرورگر را معلق کنند؛ سرور از این پس موازی/کش‌شده پاسخ فوری می‌دهد
        const res = await api<{ ok: boolean; indicators: IndicatorState[] }>("/api/indicators", { timeoutMs: 15_000 });
        const sorted = [...res.indicators].sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key));
        setIndicators(sorted);
        gotDataRef.current = true;
        setLastRefresh(new Date().toISOString());
      } catch (err) {
        // PN-028/اولاً — بارگذاری خودکار (بوت/تایمر ۶۰ث) هرگز toast خطا نمی‌دهد؛
        // فقط کلیک صریح «بررسی» توسط کاربر، خطا را گزارش می‌کند
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
    // PN-028/اولاً — نخستین بار بی‌صدا؛ در شکست گذرا، یک تلاش دوم بعد از ۵ ثانیه
    void load(true);
    const retryTimer = setTimeout(() => {
      if (!gotDataRef.current) void load(true);
    }, 5_000);
    const timer = setInterval(() => void load(true), 60_000);
    return () => {
      clearTimeout(retryTimer);
      clearInterval(timer);
    };
  }, [load]);

  const connectedCount = indicators?.filter((i) => i.connected).length ?? 0;

  // ============ حالت فشرده — نوار پایدار بالای همهٔ کاشی‌ها (گام صفر-۵) ============
  if (variant === "compact") {
    return (
      <section
        className="rounded-xl border border-primary/10 bg-card/60 px-3 py-2"
        aria-label="وضعیت اتصال‌ها (نوار پایدار)"
        data-testid="connection-indicators-compact"
      >
        <div className="flex items-center justify-between gap-2 flex-wrap mb-1.5">
          <h4 className="text-[11px] font-bold flex items-center gap-1.5 text-muted-foreground">
            <Activity className="w-3.5 h-3.5 text-primary" aria-hidden />
            وضعیت اتصال‌ها
          </h4>
          <div className="flex items-center gap-1.5">
            <Badge
              variant={connectedCount === TOTAL ? "default" : connectedCount >= TOTAL / 2 ? "secondary" : "destructive"}
              className="text-[10px] gap-1 px-1.5"
            >
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full ${
                  connectedCount === TOTAL ? "bg-emerald-400" : connectedCount >= TOTAL / 2 ? "bg-amber-400" : "bg-rose-400"
                }`}
              />
              {connectedCount.toLocaleString("fa-IR")} از {(TOTAL).toLocaleString("fa-IR")}
            </Badge>
            <button
              type="button"
              className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
              onClick={() => void load(false)}
              aria-label="تازه‌سازی وضعیت اتصال‌ها"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden /> : "بررسی"}
            </button>
          </div>
        </div>
        <TooltipProvider delayDuration={150}>
          <div className="flex flex-wrap gap-1">
            {(indicators ?? []).map((ind) => {
              const label = LABELS_SHORT_FA[ind.key] ?? ind.label;
              return (
                <Tooltip key={ind.key}>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-all ${
                        ind.connected
                          ? "border-emerald-300/70 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300"
                          : "border-rose-300/70 bg-rose-50 text-rose-800 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-300"
                      }`}
                      onClick={() => openTile("settings")}
                      aria-label={`${label}: ${ind.connected ? "برقرار" : "قطع"} — برای مدیریت به تنظیمات عمومی بروید`}
                    >
                      {ind.connected ? <Wifi className="w-2.5 h-2.5" aria-hidden /> : <WifiOff className="w-2.5 h-2.5" aria-hidden />}
                      {label}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-64 text-right" dir="rtl">
                    <p className="text-[11px] font-bold">{LABELS_FA[ind.key] ?? ind.label}</p>
                    <p className="text-[10px] leading-4 mt-0.5">{ind.detail}</p>
                    <p className="text-[9px] text-muted-foreground mt-1">آخرین بررسی: {faDateTime(ind.checkedAt)}</p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
            {!indicators &&
              Array.from({ length: TOTAL }, (_, i) => (
                <span key={`ph-${i}`} className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground/60">
                  <Loader2 className="w-2.5 h-2.5 animate-spin" aria-hidden /> …
                </span>
              ))}
          </div>
        </TooltipProvider>
      </section>
    );
  }

  // ============ حالت کامل — بالای صفحه خانه ============
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
            <Badge
              variant={connectedCount === TOTAL ? "default" : connectedCount >= TOTAL / 2 ? "secondary" : "destructive"}
              className="text-[10px] gap-1"
            >
              <span
                className={`inline-block w-1.5 h-1.5 rounded-full ${
                  connectedCount === TOTAL ? "bg-emerald-400" : connectedCount >= TOTAL / 2 ? "bg-amber-400" : "bg-rose-400"
                }`}
              />
              {connectedCount.toLocaleString("fa-IR")} از {(TOTAL).toLocaleString("fa-IR")}
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
          {(indicators ?? Array.from({ length: TOTAL }, (_, i) => ({ key: `ph-${i}`, label: "", connected: false, detail: "", checkedAt: "" }))).map(
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
