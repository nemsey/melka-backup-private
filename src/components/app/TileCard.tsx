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
 * پالت ۱۳ بخش ملکا — گام صفر (قاعده ۱: «یک رنگ، یک بخش — نه تکرار، نه تضاد»)
 * هر کلید = یک بخش با رنگ اختصاصی عین جدول دستور مالک؛ ۴ سایه (۵۰/۲۰۰/۵۰۰/۷۰۰)
 * از متغیرهای --sec-* در globals.css؛ دارک خودکار (قاعده ۴: ۵۰۰→۴۰۰ روشن‌تر).
 * مولد و شاهد: scripts/p6530/colors.json · کنتراست AA: download/p6530/color-contrast-report.md
 * نکته: رشته‌ها عمداً ایستا هستند تا اسکنر Tailwind همهٔ کلاس‌ها را تولید کند.
 */
export const SECTION_ACCENTS: Record<string, { chip: string; icon: string; iconText: string; ring: string; hairline: string; glow: string; freshness: string }> = {
  login: { // صفحهٔ ورود
    chip: "bg-sec-login-50 text-sec-login-700 border-sec-login-200",
    icon: "bg-gradient-to-br from-sec-login-700 via-sec-login-500 to-sec-login-500 shadow-lg shadow-sec-login-500/30",
    iconText: "text-sec-login-fg",
    ring: "hover:ring-sec-login-500/40",
    hairline: "bg-gradient-to-l from-sec-login-700 via-sec-login-500 to-sec-login-500",
    glow: "bg-sec-login-500/[0.05]",
    freshness: "text-sec-login-700",
  },
  home: { // صفحهٔ هوم
    chip: "bg-sec-home-50 text-sec-home-700 border-sec-home-200",
    icon: "bg-gradient-to-br from-sec-home-700 via-sec-home-500 to-sec-home-500 shadow-lg shadow-sec-home-500/30",
    iconText: "text-sec-home-fg",
    ring: "hover:ring-sec-home-500/40",
    hairline: "bg-gradient-to-l from-sec-home-700 via-sec-home-500 to-sec-home-500",
    glow: "bg-sec-home-500/[0.05]",
    freshness: "text-sec-home-700",
  },
  finder: { // فایل‌یابی ملکا
    chip: "bg-sec-finder-50 text-sec-finder-700 border-sec-finder-200",
    icon: "bg-gradient-to-br from-sec-finder-700 via-sec-finder-500 to-sec-finder-500 shadow-lg shadow-sec-finder-500/30",
    iconText: "text-sec-finder-fg",
    ring: "hover:ring-sec-finder-500/40",
    hairline: "bg-gradient-to-l from-sec-finder-700 via-sec-finder-500 to-sec-finder-500",
    glow: "bg-sec-finder-500/[0.05]",
    freshness: "text-sec-finder-700",
  },
  "melka-listing": { // آگهی ملکا
    chip: "bg-sec-melka-listing-50 text-sec-melka-listing-700 border-sec-melka-listing-200",
    icon: "bg-gradient-to-br from-sec-melka-listing-700 via-sec-melka-listing-500 to-sec-melka-listing-500 shadow-lg shadow-sec-melka-listing-500/30",
    iconText: "text-sec-melka-listing-fg",
    ring: "hover:ring-sec-melka-listing-500/40",
    hairline: "bg-gradient-to-l from-sec-melka-listing-700 via-sec-melka-listing-500 to-sec-melka-listing-500",
    glow: "bg-sec-melka-listing-500/[0.05]",
    freshness: "text-sec-melka-listing-700",
  },
  "melka-request": { // درخواست ملکا
    chip: "bg-sec-melka-request-50 text-sec-melka-request-700 border-sec-melka-request-200",
    icon: "bg-gradient-to-br from-sec-melka-request-700 via-sec-melka-request-500 to-sec-melka-request-500 shadow-lg shadow-sec-melka-request-500/30",
    iconText: "text-sec-melka-request-fg",
    ring: "hover:ring-sec-melka-request-500/40",
    hairline: "bg-gradient-to-l from-sec-melka-request-700 via-sec-melka-request-500 to-sec-melka-request-500",
    glow: "bg-sec-melka-request-500/[0.05]",
    freshness: "text-sec-melka-request-700",
  },
  settings: { // تنظیمات عمومی
    chip: "bg-sec-settings-50 text-sec-settings-700 border-sec-settings-200",
    icon: "bg-gradient-to-br from-sec-settings-700 via-sec-settings-500 to-sec-settings-500 shadow-lg shadow-sec-settings-500/30",
    iconText: "text-sec-settings-fg",
    ring: "hover:ring-sec-settings-500/40",
    hairline: "bg-gradient-to-l from-sec-settings-700 via-sec-settings-500 to-sec-settings-500",
    glow: "bg-sec-settings-500/[0.05]",
    freshness: "text-sec-settings-700",
  },
  mgmt: { // داشبورد مدیریتی
    chip: "bg-sec-mgmt-50 text-sec-mgmt-700 border-sec-mgmt-200",
    icon: "bg-gradient-to-br from-sec-mgmt-700 via-sec-mgmt-500 to-sec-mgmt-500 shadow-lg shadow-sec-mgmt-500/30",
    iconText: "text-sec-mgmt-fg",
    ring: "hover:ring-sec-mgmt-500/40",
    hairline: "bg-gradient-to-l from-sec-mgmt-700 via-sec-mgmt-500 to-sec-mgmt-500",
    glow: "bg-sec-mgmt-500/[0.05]",
    freshness: "text-sec-mgmt-700",
  },
  m1: { // M1 آگهی ملک تبریز
    chip: "bg-sec-m1-50 text-sec-m1-700 border-sec-m1-200",
    icon: "bg-gradient-to-br from-sec-m1-700 via-sec-m1-500 to-sec-m1-500 shadow-lg shadow-sec-m1-500/30",
    iconText: "text-sec-m1-fg",
    ring: "hover:ring-sec-m1-500/40",
    hairline: "bg-gradient-to-l from-sec-m1-700 via-sec-m1-500 to-sec-m1-500",
    glow: "bg-sec-m1-500/[0.05]",
    freshness: "text-sec-m1-700",
  },
  m2: { // M2 درخواست ملک تبریز
    chip: "bg-sec-m2-50 text-sec-m2-700 border-sec-m2-200",
    icon: "bg-gradient-to-br from-sec-m2-700 via-sec-m2-500 to-sec-m2-500 shadow-lg shadow-sec-m2-500/30",
    iconText: "text-sec-m2-fg",
    ring: "hover:ring-sec-m2-500/40",
    hairline: "bg-gradient-to-l from-sec-m2-700 via-sec-m2-500 to-sec-m2-500",
    glow: "bg-sec-m2-500/[0.05]",
    freshness: "text-sec-m2-700",
  },
  m3: { // M3 معاملات ملک تبریز
    chip: "bg-sec-m3-50 text-sec-m3-700 border-sec-m3-200",
    icon: "bg-gradient-to-br from-sec-m3-700 via-sec-m3-500 to-sec-m3-500 shadow-lg shadow-sec-m3-500/30",
    iconText: "text-sec-m3-fg",
    ring: "hover:ring-sec-m3-500/40",
    hairline: "bg-gradient-to-l from-sec-m3-700 via-sec-m3-500 to-sec-m3-500",
    glow: "bg-sec-m3-500/[0.05]",
    freshness: "text-sec-m3-700",
  },
  m4: { // M4 کارشناسان ملک تبریز
    chip: "bg-sec-m4-50 text-sec-m4-700 border-sec-m4-200",
    icon: "bg-gradient-to-br from-sec-m4-700 via-sec-m4-500 to-sec-m4-500 shadow-lg shadow-sec-m4-500/30",
    iconText: "text-sec-m4-fg",
    ring: "hover:ring-sec-m4-500/40",
    hairline: "bg-gradient-to-l from-sec-m4-700 via-sec-m4-500 to-sec-m4-500",
    glow: "bg-sec-m4-500/[0.05]",
    freshness: "text-sec-m4-700",
  },
  consultant: { // صفحهٔ مشاور (ایجنت)
    chip: "bg-sec-consultant-50 text-sec-consultant-700 border-sec-consultant-200",
    icon: "bg-gradient-to-br from-sec-consultant-700 via-sec-consultant-500 to-sec-consultant-500 shadow-lg shadow-sec-consultant-500/30",
    iconText: "text-sec-consultant-fg",
    ring: "hover:ring-sec-consultant-500/40",
    hairline: "bg-gradient-to-l from-sec-consultant-700 via-sec-consultant-500 to-sec-consultant-500",
    glow: "bg-sec-consultant-500/[0.05]",
    freshness: "text-sec-consultant-700",
  },
  ai: { // هوش مصنوعی/گزارش‌ها
    chip: "bg-sec-ai-50 text-sec-ai-700 border-sec-ai-200",
    icon: "bg-gradient-to-br from-sec-ai-700 via-sec-ai-500 to-sec-ai-500 shadow-lg shadow-sec-ai-500/30",
    iconText: "text-sec-ai-fg",
    ring: "hover:ring-sec-ai-500/40",
    hairline: "bg-gradient-to-l from-sec-ai-700 via-sec-ai-500 to-sec-ai-500",
    glow: "bg-sec-ai-500/[0.05]",
    freshness: "text-sec-ai-700",
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
  const a = SECTION_ACCENTS[accent] ?? SECTION_ACCENTS.home;

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
        className={`group relative h-full overflow-hidden border-border/60 sec-soft-shadow hover:sec-soft-shadow-lg sec-motion hover:-translate-y-1.5 ring-2 ring-transparent ${a.ring}`}
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
              <RefreshCw className={`w-3 h-3 shrink-0 ${a.freshness}`} aria-hidden />
              <span className="truncate">
                آخرین بروزرسانی: {freshness.lastUpdatedAt ? faJalaliShortDateTime(freshness.lastUpdatedAt) : "هنوز داده‌ای ثبت نشده"}
              </span>
            </div>
          )}

          <div className="flex items-start justify-between">
            <div
              className={`w-14 h-14 rounded-2xl ${a.icon} flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3`}
            >
              <Icon className={`w-7 h-7 ${a.iconText}`} aria-hidden />
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
