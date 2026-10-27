"use client";

/**
 * گفت‌وگوی جزئیات تحلیل تطبیق — PN-014
 * ---------------------------------------------------------------------------
 * هم‌ارز AdDetailsDialog فایل‌یابی، متناسب با کارکرد تطبیق:
 *   · شناسنامهٔ گزینه (کد/مشتری/کارشناس/شعبه/قیمت/تازگی)
 *   · «تحلیل هوشمند امتیازدهی» — هر عامل با کارت رنگی + نوار پیشرفت + شاهد
 *     + وزن به‌کاررفته + سهم نهایی + منشأ وزن‌ها (پایه/آموخته)
 *   · «پیشنهاد تصمیم هوشمند» — سطح اقدام پیشنهادی ایجنت
 *   · «پیش‌بینی هوشمند دلایل احتمالی رد» — ردیف‌های شماره‌دار با احتمال و راهنما
 *   · پوشش سیگنال صادقانه (عوامل بی‌داده = خنثی، نه صفر)
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Sparkles, AlertTriangle, Brain, UserCheck, TrendingDown, MapPin, Ruler, Clock, ThumbsUp, ThumbsDown, ExternalLink, ShieldCheck } from "lucide-react";
import { faDigits, faRelative } from "@/lib/format";
import { branchBadgeClass } from "@/lib/value-colors";
import type { EnrichedCandidate, FactorAnalysis } from "@/core/matching/match-analysis";
import { matchPriceLabel } from "./MatchCard";

/** آیکن و رنگ هر عامل — هم‌خانوادهٔ پالت فایل‌یابی */
const FACTOR_VISUALS: Record<string, { icon: React.ComponentType<{ className?: string }>; box: string; bar: string; text: string }> = {
  underprice: { icon: TrendingDown, box: "border-amber-200/70 dark:border-amber-900/60 bg-amber-50/30 dark:bg-amber-950/10", bar: "bg-gradient-to-l from-amber-600 to-amber-400", text: "text-amber-700 dark:text-amber-400" },
  location: { icon: MapPin, box: "border-teal-200/70 dark:border-teal-900/60 bg-teal-50/30 dark:bg-teal-950/10", bar: "bg-gradient-to-l from-teal-600 to-cyan-500", text: "text-teal-700 dark:text-teal-400" },
  personal: { icon: Ruler, box: "border-teal-200/70 dark:border-teal-900/60 bg-teal-50/30 dark:bg-teal-950/10", bar: "bg-gradient-to-l from-teal-600 to-cyan-500", text: "text-teal-700 dark:text-teal-400" },
  other: { icon: UserCheck, box: "border-rose-200/70 dark:border-rose-900/60 bg-rose-50/30 dark:bg-rose-950/10", bar: "bg-gradient-to-l from-rose-600 to-rose-400", text: "text-rose-700 dark:text-rose-400" },
};

const DECISION_TONES: Record<string, { badge: string; box: string }> = {
  emerald: { badge: "bg-emerald-600 text-white", box: "border-emerald-200/70 dark:border-emerald-900/60 bg-emerald-50/40 dark:bg-emerald-950/10" },
  teal: { badge: "bg-teal-600 text-white", box: "border-teal-200/70 dark:border-teal-900/60 bg-teal-50/40 dark:bg-teal-950/10" },
  amber: { badge: "bg-amber-500 text-white", box: "border-amber-200/70 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/10" },
  muted: { badge: "bg-muted text-muted-foreground border", box: "" },
};

function FactorAnalysisCard({ f }: { f: FactorAnalysis }) {
  const v = FACTOR_VISUALS[f.tone] ?? FACTOR_VISUALS.personal;
  const Icon = v.icon;
  return (
    <div className={`rounded-xl border p-3 space-y-2 ${v.box}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-xs font-bold flex items-center gap-1.5 ${v.text}`}>
          <Icon className="w-3.5 h-3.5" aria-hidden /> {f.label}: {faDigits(Math.round(f.value * 100))}٪
        </span>
        <span className="flex items-center gap-1">
          <Badge variant="outline" className="text-[10px] tabular-nums" title="وزن این عامل در امتیاز نهایی">وزن {faDigits(Math.round(f.weight * 100))}٪</Badge>
          {!f.evidenceBacked ? (
            <Badge variant="secondary" className="text-[10px]" title="داده‌ای پشت این عامل نیست — مقدار خنثی ۰٫۵ (صداقت سیگنال)">خنثی</Badge>
          ) : (
            <Badge variant="secondary" className="text-[10px] gap-0.5"><ShieldCheck className="w-3 h-3" aria-hidden /> شاهد‌دار</Badge>
          )}
        </span>
      </div>
      <Progress value={f.value * 100} className="h-1.5 bg-muted" indicatorClassName={v.bar} aria-label={`${f.label}: ${Math.round(f.value * 100)} درصد`} />
      <p className="text-[11px] text-muted-foreground leading-5">
        {f.note} — سهم در امتیاز نهایی: <b className="text-foreground tabular-nums">{faDigits(f.contribution.toFixed(2))}</b>
      </p>
    </div>
  );
}

export function MatchDetailsDialog({
  candidate,
  index,
  direction,
  weightsSource,
  weightsFeedbackCount,
  weightsUsed,
  feedbackState,
  onAccept,
  onReject,
  onOpenInTile,
  onClose,
}: {
  candidate: EnrichedCandidate | null;
  index: number;
  direction: "listing_to_request" | "request_to_listing";
  weightsSource: "base" | "learned" | undefined;
  weightsFeedbackCount: number | undefined;
  weightsUsed: Record<string, number>;
  feedbackState: "accepted" | "rejected" | undefined;
  onAccept: (c: EnrichedCandidate) => void;
  onReject: (c: EnrichedCandidate) => void;
  onOpenInTile: (code: string) => void;
  onClose: () => void;
}) {
  const isL2R = direction === "listing_to_request";
  return (
    <Dialog open={candidate !== null} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
        {candidate ? (
          <>
            <DialogHeader className="text-right space-y-1">
              <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
                <span className="inline-flex items-center justify-center min-w-7 h-7 px-1.5 rounded-lg bg-gradient-to-b from-primary/15 to-primary/5 border border-primary/20 text-xs font-extrabold text-primary tabular-nums">{faDigits(index)}</span>
                {isL2R ? candidate.requestLabel ?? candidate.requestId : `ملک ${faDigits(candidate.listingCode ?? "")}`}
                <Badge className="bg-sec-m5-500 text-white text-[10px]">امتیاز {faDigits(candidate.score.toFixed(2))}</Badge>
                <Badge variant="outline" className="text-[10px] tabular-nums">پوشش سیگنال {faDigits(Math.round(candidate.signalCoverage * 100))}٪</Badge>
                {weightsSource === "learned" ? (
                  <Badge className="bg-sec-m5-500 text-white text-[10px]" title={`وزن‌ها از ${faDigits(weightsFeedbackCount ?? 0)} بازخورد شما آموخته شده`}>
                    <Sparkles className="size-3" aria-hidden /> وزن‌های آموخته ({faDigits(weightsFeedbackCount ?? 0)} بازخورد)
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">وزن‌های پایه</Badge>
                )}
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground leading-5">
                {feedbackState
                  ? `برای این گزینه بازخورد «${feedbackState === "accepted" ? "پذیرش" : "رد"}» ثبت شده — سوخت حلقهٔ یادگیری وزن‌ها.`
                  : "تحلیل کامل امتیازدهی و پیش‌بینی دلایل رد — پیشنهاد فقط؛ تصمیم و اجرا با مالک."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              {/* شناسنامهٔ گزینه */}
              {candidate.info ? (
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-md border border-sec-m5-200 bg-sec-m5-50/60 p-3 text-xs sm:grid-cols-3">
                  <span className="text-muted-foreground">کد: <b className="text-foreground">{faDigits(candidate.info.code)}</b></span>
                  <span className="text-muted-foreground">{isL2R ? "مشتری" : "مالک"}: <b className="text-foreground">{candidate.info.ownerName ?? "—"}</b></span>
                  <span dir="ltr" className="text-muted-foreground">{candidate.info.mobile ?? "—"}</span>
                  <span className="text-muted-foreground">منطقه: <b className="text-foreground">{candidate.info.region ?? "—"}</b></span>
                  <span className="text-muted-foreground" dir="auto">قیمت: <b className="text-foreground">{matchPriceLabel(candidate.info)}</b></span>
                  <span className="text-muted-foreground">تازگی: <b className="text-foreground">{candidate.info.lastSeenAt ? faRelative(candidate.info.lastSeenAt) : "—"}</b></span>
                  <span className="text-muted-foreground">کارشناس: <b className="text-foreground">{candidate.info.expertName ?? "—"}</b></span>
                  <span className="text-muted-foreground flex items-center gap-1">
                    شعبه:
                    {candidate.info.expertBranch && candidate.info.expertBranch !== "تعیین نشده" ? (
                      <Badge variant="outline" className={`text-[10px] border-0 ${branchBadgeClass(candidate.info.expertBranch)}`}>{candidate.info.expertBranch}</Badge>
                    ) : (
                      <b className="text-foreground">—</b>
                    )}
                  </span>
                  <span className="flex items-center">
                    <Button size="sm" variant="ghost" className="h-5 gap-1 px-1.5 text-[10px] text-sec-m5-600" onClick={() => onOpenInTile(candidate.info!.code)}>
                      <ExternalLink className="size-3" aria-hidden /> مشاهده در کاشی {isL2R ? "درخواست" : "آگهی"}
                    </Button>
                  </span>
                </div>
              ) : null}

              {/* فیلترهای سخت گذشته */}
              {candidate.hardFilterNotes.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {candidate.hardFilterNotes.map((n) => <Badge key={n} variant="outline" className="text-[10px] text-emerald-700 border-emerald-300">{n}</Badge>)}
                </div>
              ) : null}

              {/* پیشنهاد تصمیم هوشمند */}
              <div>
                <h4 className="text-sm font-bold mb-2 flex items-center gap-1.5"><Brain className="w-4 h-4 text-sec-m5-500" aria-hidden /> پیشنهاد تصمیم هوشمند</h4>
                <div className={`rounded-xl border p-3 flex items-center justify-between gap-3 ${DECISION_TONES[candidate.decision.tone].box}`}>
                  <div className="min-w-0">
                    <p className="text-sm font-bold">{candidate.decision.title}</p>
                    <p className="text-[11px] text-muted-foreground leading-5 mt-0.5">{candidate.decision.hint}</p>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <Button size="sm" variant="outline" className="h-7 gap-1 text-emerald-600" onClick={() => onAccept(candidate)} disabled={feedbackState !== undefined}>
                      <ThumbsUp className="size-3" aria-hidden /> پذیرش
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 gap-1 text-rose-600" onClick={() => onReject(candidate)} disabled={feedbackState !== undefined}>
                      <ThumbsDown className="size-3" aria-hidden /> رد
                    </Button>
                  </div>
                </div>
              </div>

              {/* تحلیل هوشمند امتیازدهی — عین ساختار فایل‌یابی */}
              <div>
                <h4 className="text-sm font-bold mb-2 flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-primary" aria-hidden /> تحلیل هوشمند امتیازدهی</h4>
                <div className="space-y-3">
                  {candidate.analysis.map((f) => <FactorAnalysisCard key={f.key} f={f} />)}
                </div>
                <p className="text-[10px] text-muted-foreground mt-2 leading-5">
                  وزن‌های به‌کاررفته: {Object.entries(weightsUsed).map(([k, v]) => `${k} ${faDigits(Math.round(v * 100))}٪`).join(" · ")}
                  {weightsSource === "learned" ? " — آموخته از بازخوردهای پذیرش/رد شما (حلقهٔ یادگیری)" : " — پایه؛ با هر پذیرش/رد شخصی می‌شود"}
                </p>
              </div>

              {/* پیش‌بینی هوشمند دلایل احتمالی رد — عین فایل‌یابی */}
              <div>
                <h4 className="text-sm font-bold mb-2 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-amber-600" aria-hidden /> پیش‌بینی هوشمند دلایل احتمالی رد</h4>
                <div className="rounded-xl border divide-y text-xs">
                  {candidate.predictions.map((p, pi) => (
                    <div key={p.key} className="p-2.5 flex items-center justify-between gap-2">
                      <span className="font-medium flex items-center gap-2 min-w-0">
                        <span className="inline-flex items-center justify-center w-4.5 h-4.5 min-w-4.5 rounded-md bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 font-bold text-[9px] tabular-nums shrink-0" aria-label={`ردیف ${faDigits(pi + 1)}`}>{faDigits(pi + 1)}</span>
                        <span className="truncate">{p.title}</span>
                      </span>
                      <span className="text-muted-foreground text-[10px] shrink-0">احتمال {faDigits(p.likely)}٪ — {p.hint}</span>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1">
                  <Clock className="w-3 h-3" aria-hidden /> پیش‌بینی از عوامل همین تطبیق — با بازخورد رد شما دقیق‌تر می‌شود.
                </p>
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
