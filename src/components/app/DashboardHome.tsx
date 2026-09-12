"use client";

/**
 * خانه داشبورد — چیدمان کاشی‌ای
 * هر کاشی یک ماژول مستقل است؛ از رجیستری خوانده می‌شود و
 * با لمس/کلیک وارد صفحه‌ی تخصصی همان کاشی می‌شویم.
 */

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BrainCircuit, ArrowLeft, Sparkles } from "lucide-react";
import { tileRegistry } from "@/core/tiles/tile-registry";
import { useAppStore } from "@/lib/client/store";
import { api } from "@/lib/client/api";
import { faNumber } from "@/lib/format";
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";

interface AgentStatsLite {
  feedbackCount: number;
  memoryCount: number;
  policyVersions: number;
  activePolicyVersion: number;
}

/** آمار یادگیری هر کاشی برای نمایش روی کارت خانه */
function useAgentStats(tileId: string | null) {
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

const ACCENTS: Record<string, { chip: string; icon: string; ring: string }> = {
  emerald: { chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300", icon: "bg-emerald-600", ring: "hover:ring-emerald-400/50" },
  amber: { chip: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300", icon: "bg-amber-500", ring: "hover:ring-amber-400/50" },
  rose: { chip: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300", icon: "bg-rose-600", ring: "hover:ring-rose-400/50" },
  teal: { chip: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300", icon: "bg-teal-600", ring: "hover:ring-teal-400/50" },
  stone: { chip: "bg-stone-100 text-stone-800 dark:bg-stone-800 dark:text-stone-200", icon: "bg-stone-600", ring: "hover:ring-stone-400/50" },
};

function TileCard({
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
  const a = ACCENTS[accent] ?? ACCENTS.emerald;

  return (
    <motion.button
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: order * 0.07, duration: 0.3 }}
      onClick={onOpen}
      className="tile-press text-right focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-2xl w-full"
      aria-label={`باز کردن کاشی ${title}`}
    >
      <Card
        className={`group h-full border-border/60 shadow-md shadow-black/5 hover:shadow-xl hover:shadow-black/10 transition-all duration-200 hover:-translate-y-1 ring-2 ring-transparent ${a.ring}`}
      >
        <CardContent className="p-5 sm:p-6 flex flex-col gap-4 min-h-[11rem]">
          <div className="flex items-start justify-between">
            <div className={`w-14 h-14 rounded-2xl ${a.icon} flex items-center justify-center shadow-lg transition-transform group-hover:scale-110 group-hover:rotate-3`}>
              <Icon className="w-7 h-7 text-white" aria-hidden />
            </div>
            <ArrowLeft
              className="w-5 h-5 text-muted-foreground/40 group-hover:text-primary group-hover:-translate-x-1 transition-all"
              aria-hidden
            />
          </div>

          <div>
            <h2 className="text-lg sm:text-xl font-extrabold">{title}</h2>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed line-clamp-2">{tagline}</p>
          </div>

          <div className="mt-auto flex flex-wrap items-center gap-2">
            {hasAgent && (
              <Badge variant="secondary" className="gap-1.5">
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

export function DashboardHome() {
  const userRole = useAppStore((s) => s.user?.role ?? "CONSULTANT");
  const openTile = useAppStore((s) => s.openTile);
  const tiles = tileRegistry.listAll(userRole);

  return (
    <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 py-8 flex flex-col">
      {/* خوش‌آمد و خلاصه وضعیت */}
      <section className="mb-8">
        <h2 className="text-xl sm:text-2xl font-extrabold">کاشی‌های داشبورد</h2>
        <p className="text-muted-foreground mt-1.5 text-sm sm:text-base leading-relaxed max-w-2xl">
          هر کاشی یک ماژول مستقل با ایجنت هوشمند اختصاصی است. برای ورود به تحلیل‌های هر حوزه، کاشی مربوط را انتخاب کنید.
        </p>
      </section>

      {/* شبکه کاشی‌ها — ریسپانسیو: ۱ ستون موبایل / ۲ تبلت / ۳ دسکتاپ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {tiles.map((t, i) => (
          <TileCard
            key={t.id}
            tileId={t.id}
            title={t.title}
            tagline={t.tagline}
            icon={t.icon as unknown as LucideIcon}
            accent={t.accent}
            hasAgent={Boolean(t.agent)}
            order={i}
            onOpen={() => openTile(t.id)}
          />
        ))}
      </div>

      {/* اسکلت‌ن نمایشی برای بار اول */}
      {tiles.length === 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-56 rounded-2xl" />
          ))}
        </div>
      )}

      <footer className="mt-auto pt-6 border-t text-center text-xs text-muted-foreground">
        <p>مالک و برنامه‌نویس و طراح: سید نعمت اله سیدی</p>
        <p className="mt-1">نسخه ۱٫۰٫۰ — داشبورد هوشمند چندعامله ملک تبریز</p>
      </footer>
    </main>
  );
}
