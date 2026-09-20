"use client";

/**
 * کارت کاشی — مشترک بین صفحه خانه و کاشی‌های ظرف (مانند «داشبورد مدیریتی»)
 * -----------------------------------------------------------------------
 * زبان بصری «فیروزه تبریز»: خط گرادیانی ظریف بالای کارت، آیکون گرادیانی
 * با سایهٔ رنگ‌آمیزی‌شده، هاورِ معلق و حلقهٔ رنگی اختصاصی هر کاشی.
 */

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BrainCircuit, ArrowLeft, Sparkles, RefreshCw } from "lucide-react";
import { api } from "@/lib/client/api";
import { faNumber, faJalaliShortDateTime } from "@/lib/format";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

interface AgentStatsLite {
  feedbackCount: number;
  memoryCount: number;
  policyVersions: number;
  activePolicyVersion: number;
}

// ===================== P6.5-11 (بند ت) — تاریخ آخرین بروزرسانی روی هر کاشی =====================

interface FreshnessEntry {
  lastUpdatedAt: string | null;
  recordCount: number;
  sourceLabel: string;
}

/** کش ماژول‌سطحی — یک fetch مشترک برای همهٔ کارت‌های صفحه (TTL ۶۰ثانیه) */
const freshnessCache: { data: Record<string, FreshnessEntry> | null; at: number; inflight: Promise<Record<string, FreshnessEntry>> | null } = {
  data: null,
  at: 0,
  inflight: null,
};
const FRESHNESS_TTL_MS = 60_000;

function loadFreshness(): Promise<Record<string, FreshnessEntry>> {
  const now = Date.now();
  if (freshnessCache.data && now - freshnessCache.at < FRESHNESS_TTL_MS) {
    return Promise.resolve(freshnessCache.data);
  }
  if (freshnessCache.inflight) return freshnessCache.inflight;
  freshnessCache.inflight = api<{ freshness: Record<string, FreshnessEntry> }>("/api/crm/data-freshness")
    .then((r) => {
      freshnessCache.data = r.freshness ?? {};
      freshnessCache.at = Date.now();
      return freshnessCache.data;
    })
    .catch(() => {
      freshnessCache.data = freshnessCache.data ?? {};
      freshnessCache.at = Date.now();
      return freshnessCache.data;
    })
    .finally(() => {
      freshnessCache.inflight = null;
    });
  return freshnessCache.inflight;
}

/** هوک مشترک: تاریخ آخرین بروزرسانی داده‌های یک کاشی (null = بدون داده/خطا) */
export function useTileFreshness(tileId: string | null): FreshnessEntry | null {
  const [entry, setEntry] = useState<FreshnessEntry | null>(null);
  useEffect(() => {
    if (!tileId) return;
    let alive = true;
    loadFreshness().then((map) => {
      if (alive) setEntry(map[tileId] ?? null);
    });
    return () => {
      alive = false;
    };
  }, [tileId]);
  return entry;
}

/** آمار یادگیری هر کاشی برای نمایش روی کارت */
export function useAgentStats(tileId: string | null) {
  const [stats, setStats] = useState<AgentStatsLite | null>(null);
  useEffect(() => {
    if (!tileId) return;
    let alive = true;
    api<{ stats: AgentStatsLite }>(`/api/agent/${tileId}/stats`)
      .then((r) => {
        if (alive) setStats(r.stats);
      })
      .catch(() => {
        if (alive) setStats(null);
      });
    return () => {
      alive = false;
    };
  }, [tileId]);
  return stats;
}

/**
 * پالت نقش‌های کاشی — نام‌گذاری سنتی تبریز:
 * فیروزه (emerald) · مس (amber) · یاقوت (rose) · آکوا (teal) · گرانیت (stone)
 */
const ACCENTS: Record<
  string,
  { chip: string; icon: string; ring: string; hairline: string; glow: string }
> = {
  emerald: {
    chip: "bg-teal-50 text-teal-800 dark:bg-teal-950/70 dark:text-teal-300",
    icon: "bg-gradient-to-br from-teal-600 via-teal-500 to-cyan-500 shadow-lg shadow-teal-600/30",
    ring: "hover:ring-teal-400/50",
    hairline: "bg-gradient-to-l from-teal-600 via-cyan-400 to-teal-500",
    glow: "bg-teal-500/[0.05]",
  },
  amber: {
    chip: "bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300",
    icon: "bg-gradient-to-br from-amber-500 via-amber-600 to-orange-600 shadow-lg shadow-amber-600/30",
    ring: "hover:ring-amber-400/50",
    hairline: "bg-gradient-to-l from-amber-500 via-orange-400 to-amber-600",
    glow: "bg-amber-500/[0.05]",
  },
  rose: {
    chip: "bg-rose-50 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300",
    icon: "bg-gradient-to-br from-rose-500 via-rose-600 to-pink-600 shadow-lg shadow-rose-600/30",
    ring: "hover:ring-rose-400/50",
    hairline: "bg-gradient-to-l from-rose-500 via-pink-400 to-rose-600",
    glow: "bg-rose-500/[0.04]",
  },
  teal: {
    chip: "bg-cyan-50 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300",
    icon: "bg-gradient-to-br from-cyan-500 via-cyan-600 to-teal-600 shadow-lg shadow-cyan-600/30",
    ring: "hover:ring-cyan-400/50",
    hairline: "bg-gradient-to-l from-cyan-500 via-teal-400 to-cyan-600",
    glow: "bg-cyan-500/[0.05]",
  },
  stone: {
    chip: "bg-stone-100 text-stone-700 dark:bg-stone-800/80 dark:text-stone-300",
    icon: "bg-gradient-to-br from-stone-500 via-stone-600 to-stone-700 shadow-lg shadow-stone-600/30",
    ring: "hover:ring-stone-400/50",
    hairline: "bg-gradient-to-l from-stone-500 via-stone-400 to-stone-600",
    glow: "bg-stone-500/[0.04]",
  },
};

export function TileCard({
  tileId,
  title,
  tagline,
  icon: Icon,
  accent,
  hasAgent,
  order,
  onOpen,
}: {
  tileId: string;
  title: string;
  tagline: string;
  icon: LucideIcon;
  accent: string;
  hasAgent: boolean;
  order: number;
  onOpen: () => void;
}) {
  const stats = useAgentStats(hasAgent ? tileId : null);
  const freshness = useTileFreshness(tileId);
  const a = ACCENTS[accent] ?? ACCENTS.emerald;

  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: order * 0.07, duration: 0.3 }}
      onClick={onOpen}
      className="tile-press text-right focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl w-full"
      aria-label={`باز کردن کاشی ${title}`}
    >
      <Card
        className={`group relative h-full overflow-hidden border-border/60 shadow-md shadow-black/5 hover:shadow-xl hover:shadow-black/10 transition-all duration-300 hover:-translate-y-1.5 ring-2 ring-transparent ${a.ring}`}
      >
        {/* خط گرادیانی برند بالای کارت — امضای بصری هر کاشی */}
        <div className={`absolute inset-x-0 top-0 h-1 ${a.hairline} opacity-80`} aria-hidden />

        {/* هالهٔ بسیار ملایم رنگی در گوشهٔ پایین — عمق بدون شلوغی */}
        <div className={`pointer-events-none absolute -bottom-10 -start-10 w-40 h-40 rounded-full blur-3xl ${a.glow}`} aria-hidden />

        <CardContent className="relative p-5 sm:p-6 flex flex-col gap-4 min-h-[11rem]">
          {/* P6.5-11 (بند ت) — تاریخ آخرین بروزرسانی دقیق داده‌های همین کاشی */}
          {freshness && (
            <div
              className="flex items-center gap-1.5 text-[11px] text-muted-foreground leading-none"
              title={freshness.sourceLabel}
            >
              <RefreshCw className="w-3 h-3 shrink-0 text-teal-600 dark:text-teal-400" aria-hidden />
              <span className="truncate">
                آخرین بروزرسانی: {freshness.lastUpdatedAt ? faJalaliShortDateTime(freshness.lastUpdatedAt) : "هنوز داده‌ای ثبت نشده"}
              </span>
            </div>
          )}

          <div className="flex items-start justify-between">
            <div
              className={`w-14 h-14 rounded-2xl ${a.icon} flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3`}
            >
              <Icon className="w-7 h-7 text-white" aria-hidden />
            </div>
            <span className="flex items-center justify-center w-8 h-8 rounded-full border border-border/60 bg-background/60 text-muted-foreground/50 transition-all duration-300 group-hover:border-primary/40 group-hover:text-primary group-hover:-translate-x-1">
              <ArrowLeft className="w-4 h-4" aria-hidden />
            </span>
          </div>

          <div>
            <h2 className="text-lg sm:text-xl font-extrabold">{title}</h2>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed line-clamp-2">{tagline}</p>
          </div>

          <div className="mt-auto flex flex-wrap items-center gap-2">
            {hasAgent && (
              <Badge className={`gap-1.5 border-transparent font-medium ${a.chip}`}>
                <BrainCircuit className="w-3.5 h-3.5" aria-hidden /> ایجنت هوشمند
              </Badge>
            )}
            {stats && stats.feedbackCount > 0 && (
              <Badge variant="outline" className="gap-1.5">
                <Sparkles className="w-3 h-3" aria-hidden /> {faNumber(stats.feedbackCount)} بازخورد ثبت‌شده
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.button>
  );
}
