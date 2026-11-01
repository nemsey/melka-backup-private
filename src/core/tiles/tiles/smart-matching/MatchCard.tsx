"use client";

/**
 * کارت گزینهٔ تطبیق — PN-014 (دستور مالک: هم‌ظاهری کارت‌های کشف‌شدهٔ فایل‌یابی)
 * ---------------------------------------------------------------------------
 * همان المان‌های زیبایی و همان کارکرد پیشرفتهٔ AdCard فایل‌یابی، متناسب با
 * کارکرد تطبیق:
 *   · شمارهٔ ردیف (قانون مالک: هر فهرستی شماره‌دار است)
 *   · تراشهٔ بند سه‌گانه (شکار/پیگیری/بررسی) + امتیاز — عین سطل‌های فایل‌یابی
 *   · نوارهای امتیاز تفکیکی ۹عامله با همان پالت زمرد/کهربا/رز/فیروزه
 *   · تحلیل چندوجهی پنج‌گانه (PN-028/رابعاً-د) روی خود کارت
 *   · پیشنهاد تصمیم هوشمند روی هر کارت + پذیرش / رد با دلیل (حلقهٔ یادگیری)
 *   · چهار کنش (PN-028/رابعاً-الف/ب/ج): فایل درخواست/فایل آگهی · جزئیات تحلیل ·
 *     پذیرش · رد با دلایل ساختاریافته
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  FileText, Info, ThumbsUp, ThumbsDown, MapPin, Ruler, UserRound, Wallet, Clock, Sparkles, Gauge, ListFilter, Brain, Compass,
} from "lucide-react";
import { faDigits, faAmountFull, faRelative } from "@/lib/format";
import { branchBadgeClass } from "@/lib/value-colors";
import type { EnrichedCandidate } from "@/core/matching/match-analysis";
import { MATCH_BUCKET_STYLES } from "@/core/matching/match-analysis";

/** پالت معیارها — هم‌خانوادهٔ CRITERION_TONES فایل‌یابی (بدون آبی/بنفش) */
const FACTOR_TONES: Record<string, { track: string; bar: string; text: string }> = {
  underprice: {
    track: "bg-amber-500/15",
    bar: "bg-gradient-to-l from-amber-600 to-amber-400",
    text: "text-amber-700 dark:text-amber-400",
  },
  location: {
    track: "bg-teal-500/15",
    bar: "bg-gradient-to-l from-teal-600 to-cyan-500",
    text: "text-teal-700 dark:text-teal-400",
  },
  personal: {
    track: "bg-teal-500/15",
    bar: "bg-gradient-to-l from-teal-600 to-cyan-500",
    text: "text-teal-700 dark:text-teal-400",
  },
  other: {
    track: "bg-rose-500/15",
    bar: "bg-gradient-to-l from-rose-600 to-rose-400",
    text: "text-rose-700 dark:text-rose-400",
  },
};

const BUCKET_ICONS = { sparkles: Sparkles, gauge: Gauge, filter: ListFilter } as const;

const DECISION_TONES: Record<string, string> = {
  emerald: "bg-emerald-600 text-white",
  teal: "bg-teal-600 text-white",
  amber: "bg-amber-500 text-white",
  muted: "bg-muted text-muted-foreground border",
};

/** رنگ هر بعد چندوجهی — پنج‌گانه (PN-028/رابعاً-د) */
const DIMENSION_STYLES: Record<string, { bar: string; text: string }> = {
  financial: { bar: "bg-gradient-to-l from-emerald-600 to-emerald-400", text: "text-emerald-700 dark:text-emerald-400" },
  spatial: { bar: "bg-gradient-to-l from-teal-600 to-cyan-500", text: "text-teal-700 dark:text-teal-400" },
  physical: { bar: "bg-gradient-to-l from-amber-600 to-amber-400", text: "text-amber-700 dark:text-amber-400" },
  human: { bar: "bg-gradient-to-l from-rose-600 to-rose-400", text: "text-rose-700 dark:text-rose-400" },
  temporal: { bar: "bg-gradient-to-l from-violet-600 to-violet-400", text: "text-violet-700 dark:text-violet-400" },
};

/** قیمت گزینه — عدد یا بازهٔ از/تا (عین نمایش پیشین) */
export function matchPriceLabel(info: { priceFrom: number | null; priceTo: number | null }): string {
  if (info.priceFrom == null && info.priceTo == null) return "—";
  if (info.priceFrom != null && info.priceTo != null && info.priceFrom !== info.priceTo) {
    return `${faAmountFull(info.priceFrom, "")} تا ${faAmountFull(info.priceTo, "")}`;
  }
  return faAmountFull(info.priceFrom ?? info.priceTo);
}

function FactorBar({ label, value, weight, note, tone }: { label: string; value: number; weight: number; note: string; tone: string }) {
  const t = FACTOR_TONES[tone] ?? FACTOR_TONES.personal;
  return (
    <div className="flex items-center gap-2 min-w-[9.5rem] grow" title={note}>
      <div className="grow space-y-1">
        <div className="flex items-center justify-between gap-1">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className={`text-xs font-bold tabular-nums ${t.text}`}>{faDigits(value.toFixed(2))}</span>
        </div>
        <Progress value={value * 100} className={`h-1.5 ${t.track}`} indicatorClassName={t.bar} aria-label={`${label}: ${Math.round(value * 100)} درصد — وزن ${Math.round(weight * 100)}٪`} />
      </div>
      <span className="text-[10px] text-muted-foreground/70 tabular-nums shrink-0" title={`وزن این عامل: ${Math.round(weight * 100)}٪`}>وزن {faDigits(Math.round(weight * 100))}٪</span>
    </div>
  );
}

/** نوار بعد چندوجهی — پنج‌گانه (مالی/مکانی/فیزیکی/انسانی/زمانی) */
function DimensionBar({ label, value, hint }: { label: string; value: number; hint: string }) {
  const key = label.includes("مالی") ? "financial" : label.includes("مکانی") ? "spatial" : label.includes("فیزیکی") ? "physical" : label.includes("انسانی") ? "human" : "temporal";
  const style = DIMENSION_STYLES[key] ?? DIMENSION_STYLES.physical;
  return (
    <div className="flex items-center gap-2" title={hint}>
      <span className="text-[10px] text-muted-foreground w-14 shrink-0">{label}</span>
      <div className="grow h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${style.bar} transition-all duration-500`} style={{ width: `${Math.round(value * 100)}%` }} />
      </div>
      <span className={`text-[10px] font-bold tabular-nums w-8 text-end ${style.text}`}>{faDigits(Math.round(value * 100))}٪</span>
    </div>
  );
}

export function MatchCard({
  candidate,
  index,
  direction,
  showScores,
  feedbackState,
  onDetails,
  onAccept,
  onReject,
  onOpenFile,
  onOpenInTile,
}: {
  candidate: EnrichedCandidate;
  /** شمارهٔ ردیف در فهرست — یک‌مبنا با ارقام فارسی */
  index: number;
  direction: "listing_to_request" | "request_to_listing";
  showScores: boolean;
  feedbackState: "accepted" | "rejected" | undefined;
  onDetails: (c: EnrichedCandidate) => void;
  onAccept: (c: EnrichedCandidate) => void;
  onReject: (c: EnrichedCandidate) => void;
  /** PN-028/رابعاً-الف/ب — باز کردن پروندهٔ حرفه‌ای (فایل درخواست/فایل آگهی) */
  onOpenFile: (code: string, kind: "request" | "listing") => void;
  onOpenInTile: (code: string) => void;
}) {
  const bucket = MATCH_BUCKET_STYLES[candidate.bucket];
  const BucketIcon = BUCKET_ICONS[bucket.icon];
  const isL2R = direction === "listing_to_request"; // آگهی → درخواست: گزینه‌ها درخواست‌اند
  const info = candidate.info;
  const topPrediction = candidate.predictions[0];

  return (
    <article className={`rounded-xl border bg-card p-4 space-y-3 shadow-sm shadow-black/5 ${bucket.ring}`} aria-label={`گزینهٔ شمارهٔ ${faDigits(index)} — ${isL2R ? candidate.requestLabel ?? "درخواست" : `ملک ${faDigits(candidate.listingCode ?? "")}`}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 grow space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="inline-flex items-center justify-center min-w-7 h-7 px-1.5 rounded-lg bg-gradient-to-b from-primary/15 to-primary/5 border border-primary/20 text-xs font-extrabold text-primary tabular-nums"
              title={`ردیف ${faDigits(index)}`}
              aria-label={`ردیف ${faDigits(index)}`}
            >
              {faDigits(index)}
            </span>
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 h-6 text-[11px] font-bold ${bucket.chip}`}>
              <BucketIcon className="w-3.5 h-3.5" aria-hidden /> {bucket.label} — امتیاز {faDigits(candidate.score.toFixed(2))}
            </span>
            {/* پیشنهاد تصمیم هوشمند — PN-014 */}
            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 h-6 text-[11px] font-bold ${DECISION_TONES[candidate.decision.tone]}`} title={candidate.decision.hint}>
              <Brain className="w-3.5 h-3.5" aria-hidden /> {candidate.decision.title}
            </span>
            {info?.expertBranch && info.expertBranch !== "تعیین نشده" ? (
              <Badge variant="outline" className={`text-[10px] border-0 ${branchBadgeClass(info.expertBranch)}`} title="شعبهٔ کارشناس سطر مقابل — از سامانهٔ PM">
                {info.expertBranch}
              </Badge>
            ) : null}
          </div>
          <h3 className="text-sm font-bold leading-relaxed line-clamp-2">
            {isL2R ? candidate.requestLabel ?? candidate.requestId : `ملک ${faDigits(candidate.listingCode ?? "")}`}
          </h3>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {info ? (
              <>
                <span className="inline-flex items-center gap-1" title="کد سطر مقابل">
                  <UserRound className="w-3.5 h-3.5" aria-hidden /> {isL2R ? "مشتری" : "مالک"}: <b className="text-foreground">{info.ownerName ?? "—"}</b>
                </span>
                {info.region ? (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5" aria-hidden /> {info.region}
                  </span>
                ) : null}
                <span className="inline-flex items-center gap-1" dir="ltr">
                  <Wallet className="w-3.5 h-3.5" aria-hidden /> {matchPriceLabel(info)}
                </span>
                {info.lastSeenAt ? (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" aria-hidden /> {faRelative(info.lastSeenAt)}
                  </span>
                ) : null}
              </>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-primary/10 border border-primary/20 px-2 py-0.5 font-extrabold text-primary" dir="ltr">
              {info?.mobile ?? "بدون شماره"}
            </span>
            {info?.expertName ? (
              <span className="text-muted-foreground">کارشناس: <b className="text-foreground">{info.expertName}</b></span>
            ) : null}
          </div>
          {candidate.hardFilterNotes.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {candidate.hardFilterNotes.map((n) => (
                <Badge key={n} variant="outline" className="text-[10px] text-emerald-700 border-emerald-300">{n}</Badge>
              ))}
            </div>
          ) : null}
        </div>
        {feedbackState ? (
          <Badge variant="outline" className="shrink-0">{feedbackState === "accepted" ? "پذیرفته شد ✓" : "رد شد ✗"}</Badge>
        ) : null}
      </div>

      {showScores && candidate.dimensions ? (
        <div className="rounded-lg border border-sec-m5-200 bg-sec-m5-50/40 p-2.5 space-y-1.5" aria-label="تحلیل چندوجهی پنج‌گانه">
          <p className="text-[10px] font-extrabold flex items-center gap-1 text-sec-m5-700 dark:text-sec-m5-400">
            <Compass className="w-3.5 h-3.5" aria-hidden /> تحلیل چندوجهی (مالی · مکانی · فیزیکی · انسانی · زمانی)
          </p>
          {candidate.dimensions.map((d) => (
            <DimensionBar key={d.key} label={d.label} value={d.value} hint={`${d.hint} — عوامل: ${d.factors.join("، ")}`} />
          ))}
        </div>
      ) : null}

      {showScores ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5 pt-1 border-t">
          {candidate.analysis.map((f) => (
            <FactorBar key={f.key} label={f.label} value={f.value} weight={f.weight} note={f.note} tone={f.tone} />
          ))}
        </div>
      ) : null}

      {/* هوشمندی سرتاسری: پوشش سیگنال + نخستین پیش‌بینی رد + سهم عوامل */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
        <span title="کسر وزن عوامل با دادهٔ واقعی — عوامل بی‌داده خنثی (۰٫۵) ارزیابی شده‌اند">
          پوشش سیگنال: <b className={candidate.signalCoverage >= 0.7 ? "text-emerald-600" : candidate.signalCoverage >= 0.5 ? "text-amber-600" : "text-rose-600"}>{faDigits(Math.round(candidate.signalCoverage * 100))}٪</b>
        </span>
        {topPrediction ? (
          <span title={`${candidate.predictions.length} دلیل احتمالی رد پیش‌بینی شده — جزئیات در «جزئیات تحلیل»`}>
            ریسک نخستِ رد: <b className="text-amber-600">{topPrediction.title}</b> ({faDigits(topPrediction.likely)}٪)
          </span>
        ) : null}
        <span title="سهم عامل برتر در امتیاز نهایی">
          عامل برتر: <b className="text-foreground">{[...candidate.analysis].sort((a, b) => b.contribution - a.contribution)[0]?.label ?? "—"}</b>
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => onDetails(candidate)} aria-label="جزئیات تحلیل با تحلیل هوشمند امتیازدهی و پیش‌بینی دلایل رد">
          <Info className="w-3.5 h-3.5" aria-hidden /> جزئیات تحلیل
        </Button>
        {/* PN-028/رابعاً-الف/ب — «فایل درخواست»/«فایل آگهی»: پروندهٔ حرفه‌ای کامل سطر مقابل */}
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 hover:border-sec-m5-400 hover:text-sec-m5-600 font-bold"
          onClick={() => info && onOpenFile(info.code, isL2R ? "request" : "listing")}
          disabled={!info}
          aria-label={`فایل ${isL2R ? "درخواست" : "آگهی"} ${faDigits(info?.code ?? "")} — پروندهٔ کامل حرفه‌ای`}
        >
          <FileText className="w-3.5 h-3.5" aria-hidden /> فایل {isL2R ? "درخواست" : "آگهی"}
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900" onClick={() => onAccept(candidate)} disabled={feedbackState !== undefined} aria-label="پذیرش تطبیق — سوخت حلقهٔ یادگیری وزن‌ها">
          <ThumbsUp className="w-3.5 h-3.5" aria-hidden /> پذیرش
        </Button>
        {/* PN-028/رابعاً-ج — رد با دلایل ساختاریافته (دیالوگ چندانتخابی + سایر) */}
        <Button variant="outline" size="sm" className="gap-1.5 text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 border-rose-200 dark:border-rose-900" onClick={() => onReject(candidate)} disabled={feedbackState !== undefined} aria-label="رد پیشنهاد تطبیق با انتخاب دلایل — سوخت یادگیری مغز ملکا">
          <ThumbsDown className="w-3.5 h-3.5" aria-hidden /> رد
        </Button>
      </div>
    </article>
  );
}
