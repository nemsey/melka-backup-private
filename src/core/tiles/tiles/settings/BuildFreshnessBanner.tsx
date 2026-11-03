"use client";

/**
 * بنر تازگی سرور — PN-031-B (شورای عالی ملکا · جلسهٔ فوق‌العاده ۰۳۹)
 * ---------------------------------------------------------------------------
 * درس بازنشانی‌های مکرر پلتفرم (۷ و ۸): بیلد زنده بی‌خبر از HEAD گیت کهنه
 * می‌شد و مالک فقط از خطای ۴۰۴ می‌فهمید. این بنر وضعیت را در «تنظیمات»
 * همیشه نمایان می‌کند:
 *
 *   🟢 «سرور روی HEAD است» + شناسهٔ بیلد + شمار جبران خودکار ماه
 *   🟠 «سرور بروز نیست» — جبران خودکار head-guard تا حداکثر ۱۰ دقیقه
 *   ⚪ نامشخص — هویت خوانده نشد (صادقانه، نه سبز کاذب)
 *
 * نمایش‌شرط: فقط نقش OWNER (روت /api/runtime/build-freshness مالک‌محور)؛
 * برای سایر نقش‌ها بنر بی‌صدا پنهان می‌شود (۴۰۳ ⇒ رندر تهی).
 * به‌روزرسانی دوره‌ای: هر ۵ دقیقه — سبک و بدون عارضه.
 */

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";

interface FreshnessView {
  fresh: boolean;
  verdict: "FRESH" | "STALE" | "UNKNOWN";
  message: string;
  live: { gitSha: string | null; buildId: string | null; builtAt: string | null; source: string | null };
  gitHead: string | null;
  checkedAt: string;
}

interface FreshnessResponse {
  ok: boolean;
  freshness: FreshnessView;
  autoRebuildsThisMonth: number;
  lastGuard: { at: string; verdict: string; action?: string } | null;
}

type BannerState = "loading" | "hidden" | "ready" | "error";

const REFRESH_INTERVAL_MS = 5 * 60_000;

export function BuildFreshnessBanner() {
  const [state, setState] = useState<BannerState>("loading");
  const [data, setData] = useState<FreshnessResponse | null>(null);

  // الگوی بارگذاری عین MelkTabrizConnectionSection — .then/.catch (بدون
  // فراخوانی هم‌زمانِ تابع setکننده در effect — قانون set-state-in-effect)
  useEffect(() => {
    let stopped = false;
    const apply = (res: FreshnessResponse) => {
      if (stopped) return;
      setData(res);
      setState("ready");
    };
    const fail = (e: unknown) => {
      if (stopped) return;
      // نقش غیرمالک (۴۰۳) یا نشست غایب (۴۰۱) ⇒ بنر مالک‌محور است — بی‌صدا پنهان
      if (e instanceof ApiClientError && (e.status === 403 || e.status === 401)) {
        setState("hidden");
        return;
      }
      setState("error");
    };
    api<FreshnessResponse>("/api/runtime/build-freshness", { timeoutMs: 15_000 })
      .then(apply)
      .catch(fail);
    const t = setInterval(() => {
      api<FreshnessResponse>("/api/runtime/build-freshness", { timeoutMs: 15_000 })
        .then(apply)
        .catch(() => undefined); // دوره‌ای — خطای گذرا بی‌صدا می‌ماند
    }, REFRESH_INTERVAL_MS);
    return () => { stopped = true; clearInterval(t); };
  }, []);

  if (state === "hidden") return null;

  if (state === "loading") {
    return (
      <Card className="border-border/60">
        <CardContent className="p-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden />
          <span>در حال وارسی تازگی سرور…</span>
        </CardContent>
      </Card>
    );
  }

  if (state === "error" || !data) {
    return (
      <Card className="border-border/60">
        <CardContent className="p-3 flex items-center gap-2 text-xs text-muted-foreground">
          <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden />
          <span>وضعیت تازگی سرور همین‌اکنون خوانده نشد — وارسی دوره‌ای ادامه دارد.</span>
        </CardContent>
      </Card>
    );
  }

  const f = data.freshness;

  // 🟢 تازه — بنر سبز «سرور روی HEAD است» (بند ۳ تحویل سند ۰۳۹)
  if (f.verdict === "FRESH") {
    return (
      <Card className="border-emerald-500/40 bg-emerald-500/5">
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" aria-hidden />
          <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
            سرور روی HEAD است — آخرین کد مخزن در حال سرو است
          </span>
          <Badge variant="outline" className="text-[11px] font-mono text-muted-foreground">
            {f.live.buildId ?? "?"}
          </Badge>
          <span className="text-xs text-muted-foreground ms-auto">
            جبران خودکار این ماه: {data.autoRebuildsThisMonth}
          </span>
        </CardContent>
      </Card>
    );
  }

  // 🟠 کهنه — هشدار + اطمینان از جبران خودکار (پیام ساده برای مالک)
  return (
    <Card className="border-amber-500/50 bg-amber-500/5">
      <CardContent className="p-3 flex flex-wrap items-center gap-2">
        <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0" aria-hidden />
        <span className="text-sm font-bold text-amber-700 dark:text-amber-400">{f.message}</span>
        <Badge variant="outline" className="text-[11px] font-mono text-muted-foreground">
          زنده: {(f.live.gitSha ?? "?").slice(0, 7)} ≠ HEAD: {(f.gitHead ?? "?").slice(0, 7)}
        </Badge>
        <span className="text-xs text-muted-foreground ms-auto">
          نیازی به کار شما نیست — جبران خودکار در جریان است (بررسی هر ۱۰ دقیقه)
        </span>
      </CardContent>
    </Card>
  );
}
