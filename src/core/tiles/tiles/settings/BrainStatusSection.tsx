"use client";

/**
 * بخش «مغز ملکا» در تنظیمات — ادغام کاشی «مغز ملکا» با بخش تنظیمات
 * (DIR-FF-TILE-003 · دستور مالک ۱۴۰۵/۰۸/۳۰ · ثانیاً)
 * ------------------------------------------------------
 * کاشی M6 «مغز ملکا — یادگیری و Tier» (P6545/گام۲) در این بخش ادغام شد و
 * سپس کاشی مستقل حذف گردید (حذف نما — تمام داده‌های یادگیری/تختهٔ سیاه/
 * ایجنت در پایگاه ماندگارند — قانون دادهٔ مقدس).
 *
 * تمام محتوای هر دو نما، یکجا و بدون کاستی:
 *   ۱) موتورهای هوشمندی + حلقهٔ سرنوشت + داوری صادقانه + چرخهٔ بزرگ ۰۲۷
 *   ۲) Tier فعلی با نوار پیشرفت + n نتیجهٔ باقی‌مانده تا Tier بعدی (نظام Tier)
 *   ۳) روند Brier (خام و کالیبره‌شده — ترمیم مصوب جلسه ۰۳۳)
 *   ۴) چهار تب: خودتشخیصی (۲۵ بررسی) · در انتظار شورا · تختهٔ سیاه · فرا-ذهن
 *      (موتورهای ۱۲-۱۵: توجه/علّیت/پادواقع/شبیه‌سازی)
 * منبع: GET /api/intelligence/status + GET /api/intelligence/blackboard
 */

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BrainCircuit, RefreshCcw, Loader2, Activity, Gauge, Link2, GitBranch, Gem, Radar,
  Workflow, GitCompareArrows, FlaskConical, Layers, ClipboardCheck, Clock,
} from "lucide-react";
import { api as apiCall, ApiClientError } from "@/lib/client/api";
import { faDateTime, faNumber, faDigits } from "@/lib/format";

interface EngineStatus {
  id: string;
  title: string;
  bodyPhase: string;
  hasBody: boolean;
}

interface BrainStatus {
  ok: boolean;
  engines: EngineStatus[];
  enginesWithBody: number;
  enginesTotal: number;
  outcomeLoop: {
    tileId: string;
    predictions: number;
    outcomes: { positive: number; negative: number; total: number };
    linked: number;
    ranAt: string;
    reproduction: { note: string; source: string };
  };
  evaluation: {
    sampleSize: number;
    brierScore?: number;
    lift?: number;
    verdict: string;
    calibration?: { bucket: string; predicted: number; observed: number }[];
    windowDays: number;
  };
  daemon: { alive: boolean; runs: number; lastRunAt: string | null; intervalMinutes: number };
  learning: { latestVersion: number; active: boolean; rationale: string; createdAt: string } | null;
  /** PN-024 ثانیاً — فرا-ذهن: موتورهای ۱۲-۱۵ (خواستهٔ مالک جلسهٔ ۰۳۱) */
  metaMind?: MetaMindStatus;
  phases: Record<string, string>;
  coreCycle?: {
    ranAt: string;
    tier: number;
    tierBasis: { linkedOutcomes: number; distinctPeriods: number };
    p7: {
      outcomesCollected: number;
      coveragePercent: number;
      brier: number;
      lift: number;
      ece: number;
      verdict: string;
      rationale: string;
      learning: { learned: boolean; reason: string; tier: number };
      shadow: { verdict: string; shadowBrier: number; primaryBrier: number };
      drift: { type: string; magnitude: number; action: string; rationale: string };
      evaluation: { metrics: { brierScore: number; lift: number; ece: number }; verdict: string };
      calibration?: { applied: boolean; mapVersion: string | null; rawBrier: number; calibratedBrier: number; rawLift: number; calibratedLift: number };
      brierTarget: number;
    };
    p8: { decisionsCount: number; safetyAllPassed: boolean; blockedCount: number; plansCount: number; sample: Array<{ decisionType: string; proposedAction: string; confidence: number; autoExecute: boolean }> };
    p9: { policyEvaluations: Array<{ policyId: string; verdict: string; rationale: string }>; governance: { passed: number; failed: number; criticalViolations: string[]; details: string[] } };
    p10: { systemHealth: string; overallScore: number; problems: Array<{ checkId: string; details: string }>; checks: Array<{ id: string; name: string; status: string; details: string }>; checksSummary: { pass: number; warn: number; fail: number } };
    p11: { pendingProposals: Array<{ id: string; sourceCheckId: string; severity: string; action: string; rationale: string }>; executedCount: number; gateReviews: Array<{ proposalId: string; summary: string }> };
  };
}

interface BlackboardEntryView { namespace: string; engineId: string; at: string; hash: string; payload: unknown }

const VERDICT_FA: Record<string, string> = {
  INSUFFICIENT_DATA: "داده کافی نیست",
  BELOW_BASELINE: "پایین‌تر از خط پایه",
  AT_BASELINE: "هم‌خط با خط پایه",
  ABOVE_BASELINE: "بالاتر از خط پایه",
};

/** نظام Tier — همان قرارداد کاشی M6 (صداقت Tier ۴: سه دورهٔ متمایز لازم است) */
const TIER_MIN_OUTCOMES = [0, 10, 20, 50, 70];

/** PN-024 ثانیاً — قرارداد فرا-ذهن (موتورهای ۱۲-۱۵) */
interface MetaMindStatus {
  ranAt: string;
  engines: {
    attention: { alive: boolean; top: Array<{ itemId: string; total: number; reason: string }>; considered: number; budget: number; budgetLevel: string };
    causal: { alive: boolean; nodes: number; edges: number; sampleSize: number; dagVerified: boolean; refIntervention: { feature: string; delta: number; totalEffect: number; paths: number } | null };
    counterfactual: { alive: boolean; scenarios: Array<{ scenario: string; baseline: number; counterfactual: number; delta: number; confidence: number; reason: string }>; evidenceNote: string };
    simulation: { alive: boolean; comparison: { results: Array<{ action: { label: string }; simulatedProbability: number; delta: number; confidence: number; risks: string[]; autoExecute: false; reason: string }>; best: { action: { label: string }; delta: number } | null; recommendation: string } | null };
  };
  marketPressure: number;
  notes: string[];
}

export function BrainStatusSection() {
  const [status, setStatus] = useState<BrainStatus | null>(null);
  const [board, setBoard] = useState<BlackboardEntryView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, blackboard] = await Promise.all([
        apiCall<BrainStatus>("/api/intelligence/status", { method: "GET" }),
        apiCall<{ ok: boolean; entries: BlackboardEntryView[] }>("/api/intelligence/blackboard?limit=30").catch(() => ({ ok: false, entries: [] as BlackboardEntryView[] })),
      ]);
      setStatus(data);
      setBoard(blackboard.entries ?? []);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "خطا در دریافت وضعیت مغز هوشمند");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // ── مشتقات Tier (نظام Tier — عین کاشی M6) ──
  const cycle = status?.coreCycle;
  const tier = cycle?.tier ?? 0;
  const outcomes = cycle?.tierBasis.linkedOutcomes ?? 0;
  const nextAt = tier < 4 ? TIER_MIN_OUTCOMES[tier + 1] : null;
  const tierProgress = nextAt ? Math.min(100, Math.round((outcomes / nextAt) * 100)) : 100;
  const periods = cycle?.tierBasis.distinctPeriods ?? 0;
  const tier4PeriodBlock = tier === 3 && nextAt !== null && outcomes >= nextAt && periods < 3;
  const checks = cycle?.p10.checks ?? [];
  const pass = checks.filter((c) => c.status === "pass").length;
  const warn = checks.filter((c) => c.status === "warn").length;
  const fail = checks.filter((c) => c.status === "fail").length;
  // پیشنهادهای در انتظار — قرارداد زندهٔ API هر دو نام را می‌دهد (proposals نام مستعار M8)
  const p11Alias = cycle?.p11 as unknown as { proposals?: Array<{ id: string; sourceCheckId: string; severity: string; status: string; rationale: string }> } | undefined;
  const proposals: Array<{ id: string; sourceCheckId: string; severity: string; status?: string; rationale: string }> =
    p11Alias?.proposals ??
    (cycle?.p11.pendingProposals ?? []).map((p) => ({ id: p.id, sourceCheckId: p.sourceCheckId, severity: p.severity, status: "pending", rationale: p.rationale }));

  return (
    <Card data-negin="nili">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <BrainCircuit className="w-5 h-5 text-sec-ai-700" aria-hidden /> مغز ملکا
        </CardTitle>
        <CardDescription>
          موتورهای هوشمندی + حلقهٔ سرنوشت + فازهای ۷ تا ۱۱ (سند ۰۲۷) + نظام Tier و روند یادگیری + تختهٔ سیاه + فرا-ذهن فاز ۱۳ (موتورهای ۱۲ تا ۱۵ — توجه، علّیت، پادواقع، شبیه‌سازی)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!status && !error && (
          <div className="space-y-2">
            <Skeleton className="h-24 w-full rounded-xl" />
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> در حال دریافت وضعیت زنده…
            </p>
          </div>
        )}
        {status && (
          <>
            {/* موتورها */}
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1.5 py-1.5 px-3">
                <Activity className="w-3.5 h-3.5" aria-hidden /> {faNumber(status.enginesWithBody)} از {faNumber(status.enginesTotal)} موتور با بدنهٔ کامل
              </Badge>
              <Badge variant="outline" className="gap-1.5 py-1.5 px-3">
                فاز ۷ ✓ ۸ ✓ ۹ ✓ ۱۰ ✓ ۱۱ ✓
              </Badge>
              {status.metaMind && (
                <Badge variant="outline" className="gap-1.5 py-1.5 px-3 text-negin-nili-700 dark:text-negin-nili-400">
                  <Gem className="w-3.5 h-3.5" aria-hidden /> فرا-ذهن ۱۳-الف+ب: ۴ موتور تازه
                </Badge>
              )}
              {status.coreCycle && (
                <Badge variant="outline" className="gap-1.5 py-1.5 px-3">
                  Tier {faNumber(status.coreCycle.tier)} — نظام رشد یادگیری
                </Badge>
              )}
              {status.daemon.alive && (
                <Badge variant="outline" className="gap-1.5 py-1.5 px-3">
                  دیمن v2 زنده — {faNumber(status.daemon.runs)} اجرا
                </Badge>
              )}
            </div>

            {/* حلقهٔ سرنوشت */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div className="rounded-lg border p-2.5">
                <div className="text-lg font-extrabold text-sec-ai-700">{faNumber(status.outcomeLoop.predictions)}</div>
                <div className="text-xs text-muted-foreground mt-0.5">پیش‌بینی واقعی</div>
              </div>
              <div className="rounded-lg border p-2.5">
                <div className="text-lg font-extrabold text-sec-ai-700">{faNumber(status.outcomeLoop.outcomes.total)}</div>
                <div className="text-xs text-muted-foreground mt-0.5">پیامد واقعی ARM</div>
              </div>
              <div className="rounded-lg border p-2.5">
                <div className="text-lg font-extrabold text-sec-ai-700">{faNumber(status.outcomeLoop.linked)}</div>
                <div className="text-xs text-muted-foreground mt-0.5">پیوند حلقهٔ بسته</div>
              </div>
              <div className="rounded-lg border p-2.5">
                <div className="text-lg font-extrabold text-sec-ai-700">
                  {typeof status.evaluation.brierScore === "number" ? faNumber(status.evaluation.brierScore) : "—"}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">نمرهٔ Brier</div>
              </div>
            </div>

            {/* ═══ نظام Tier — عین کاشی M6 ادغام‌شده (DIR-FF-TILE-003/ثانیاً) ═══ */}
            {cycle && (
              <div className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-sm font-bold flex items-center gap-2">
                    <Layers className="size-4 text-sec-m8-500" aria-hidden /> Tier فعلی: {faDigits(tier)} از ۴
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <Badge variant="outline">{faDigits(outcomes)} نتیجهٔ واقعی پیوندشده</Badge>
                    <Badge variant="outline">{faDigits(periods)} دورهٔ متمایز</Badge>
                  </div>
                </div>
                <Progress value={tierProgress} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  {tier4PeriodBlock
                    ? `نتیجه‌ها کافی است (${faDigits(outcomes)} ≥ ${faDigits(nextAt)}) — مانع ارتقا به Tier ۴: دوره‌های متمایز (${faDigits(periods)} از ۳)`
                    : nextAt
                      ? `تا Tier ${faDigits(tier + 1)}: ${faDigits(Math.max(0, nextAt - outcomes))} نتیجهٔ باقی‌مانده (سرحد: ${faDigits(nextAt)})`
                      : "Tier ۴ — کامل"}
                </p>
                <div className="grid gap-2 text-xs sm:grid-cols-3">
                  <div className="rounded border p-2">
                    <p className="text-muted-foreground">هدف Brier این Tier (تصمیم ۳ جلسه ۰۳۳)</p>
                    <p className="font-bold">{cycle.p7.brierTarget != null ? `≤ ${faDigits(cycle.p7.brierTarget.toFixed(2))}` : "—"}</p>
                  </div>
                  <div className="rounded border p-2">
                    <p className="text-muted-foreground">Brier فعال {cycle.p7.calibration?.applied ? "(کالیبره)" : ""}</p>
                    {/* حالت خالی صادقانه: بدون پیامد کافی، سنجه تهی است */}
                    <p className="font-bold">{cycle.p7.evaluation?.metrics?.brierScore != null ? faDigits(cycle.p7.evaluation.metrics.brierScore.toFixed(4)) : "— دادهٔ کافی نیست"}</p>
                  </div>
                  <div className="rounded border p-2">
                    <p className="text-muted-foreground">Lift</p>
                    <p className="font-bold">{cycle.p7.evaluation?.metrics?.lift != null ? `+${faDigits(cycle.p7.evaluation.metrics.lift.toFixed(1))}٪` : "—"}</p>
                  </div>
                </div>
                {/* ترمیم مصوب جلسه ۰۳۳ — بازکالیبراسیون */}
                {cycle.p7.calibration?.applied ? (
                  <div className="grid gap-2 text-xs sm:grid-cols-4 rounded border border-dashed p-2.5">
                    <div><p className="text-muted-foreground">Brier پیش از کالیبراسیون</p><p className="font-bold">{faDigits(cycle.p7.calibration.rawBrier.toFixed(4))}</p></div>
                    <div><p className="text-muted-foreground">Brier پس از کالیبراسیون</p><p className="font-bold text-emerald-600">{faDigits(cycle.p7.calibration.calibratedBrier.toFixed(4))}</p></div>
                    <div><p className="text-muted-foreground">Lift خام</p><p className="font-bold">+{faDigits(cycle.p7.calibration.rawLift.toFixed(1))}٪</p></div>
                    <div><p className="text-muted-foreground">Lift کالیبره</p><p className="font-bold text-emerald-600">+{faDigits(cycle.p7.calibration.calibratedLift.toFixed(1))}٪</p></div>
                  </div>
                ) : null}
              </div>
            )}

            {/* ارزیابی صادقانه */}
            <div className="text-sm space-y-1.5">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <Gauge className="w-4 h-4 shrink-0 text-sec-ai-700" aria-hidden />
                <span className="font-bold">داوری صادقانه:</span>
                <span>{faNumber(status.evaluation.sampleSize)} نمونه</span>
                {typeof status.evaluation.lift === "number" && (
                  <span>· Lift نسبت به خط پایه: {faNumber(Math.round(status.evaluation.lift * 1000) / 10)}٪</span>
                )}
                <Badge variant={status.evaluation.verdict === "ABOVE_BASELINE" ? "default" : "secondary"}>
                  {VERDICT_FA[status.evaluation.verdict] ?? status.evaluation.verdict}
                </Badge>
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {status.outcomeLoop.reproduction.note} — منبع: {status.outcomeLoop.reproduction.source}.
              </p>
            </div>

            {/* چرخهٔ بزرگ سند ۰۲۷ — P7 تا P11 */}
            {status.coreCycle && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
                  <div className="rounded-lg border p-2.5">
                    <div className="text-sm font-extrabold text-sec-ai-700">P7 یادگیری</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{faNumber(status.coreCycle.p7.outcomesCollected)} پیامد · پوشش {faNumber(status.coreCycle.p7.coveragePercent)}٪</div>
                  </div>
                  <div className="rounded-lg border p-2.5">
                    <div className="text-sm font-extrabold text-sec-ai-700">P8 تصمیم</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{faNumber(status.coreCycle.p8.decisionsCount)} تصمیم · صفر اجرای خودکار</div>
                  </div>
                  <div className="rounded-lg border p-2.5">
                    <div className="text-sm font-extrabold text-sec-ai-700">P9 حاکمیت</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{faNumber(status.coreCycle.p9.governance.passed)}/{faNumber(status.coreCycle.p9.governance.passed + status.coreCycle.p9.governance.failed)} قاعده برقرار</div>
                  </div>
                  <div className="rounded-lg border p-2.5">
                    <div className="text-sm font-extrabold text-sec-ai-700">P10 خودشناسی</div>
                    <div className="text-xs text-muted-foreground mt-0.5">امتیاز {faNumber(status.coreCycle.p10.overallScore)}/۱۰۰ · {faNumber(status.coreCycle.p10.checksSummary.pass)}+{faNumber(status.coreCycle.p10.checksSummary.warn)} از ۲۵ بررسی</div>
                  </div>
                  <div className="rounded-lg border p-2.5">
                    <div className="text-sm font-extrabold text-sec-ai-700">P11 ترمیم</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{faNumber(status.coreCycle.p11.pendingProposals.length)} پیشنهاد در انتظار شورا · {faNumber(status.coreCycle.p11.executedCount)} اجرا</div>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground leading-relaxed rounded-lg border border-dashed p-3 space-y-1">
                  <p><span className="font-bold">ارزیابی سند ۰۲۷:</span> {status.coreCycle.p7.rationale}</p>
                  <p><span className="font-bold">یادگیری Tier-aware:</span> {status.coreCycle.p7.learning.reason}</p>
                  <p><span className="font-bold">خودتشخیصی:</span> سلامت «{status.coreCycle.p10.systemHealth === "healthy" ? "سالم" : status.coreCycle.p10.systemHealth === "degraded" ? "نیازمند توجه" : "بحرانی"}» — {status.coreCycle.p10.problems.length} مشکل واقعی کشف‌شده (صفر پنهان‌کاری)</p>
                  {status.coreCycle.p10.problems.length > 0 && (
                    <ul className="list-disc ps-5 space-y-0.5">
                      {status.coreCycle.p10.problems.slice(0, 5).map((p) => (
                        <li key={p.checkId}>{p.checkId}: {p.details}</li>
                      ))}
                    </ul>
                  )}
                  <p><span className="font-bold">قفل ابدی:</span> هر ترمیم نیازمند تأیید شوراست — پیشنهادها ثبت می‌شوند، اجرا نمی‌شوند (autoExecute=false در همهٔ فازها).</p>
                </div>
              </div>
            )}

            {/* یادگیری */}
            {status.learning && (
              <div className="text-sm flex items-start gap-2 rounded-lg border border-dashed p-3">
                <GitBranch className="w-4 h-4 shrink-0 mt-0.5 text-sec-ai-700" aria-hidden />
                <div>
                  <span className="font-bold">یادگیری حلقه‌بسته:</span> نسخهٔ {faNumber(status.learning.latestVersion)} سیاست ایجنت M1
                  {status.learning.active ? " (فعال)" : ""} — {status.learning.rationale}
                </div>
              </div>
            )}

            {/* ═══ چهار تب — تمام محتوای کاشی M6 (خودتشخیصی/شورا/تختهٔ سیاه/فرا-ذهن) ═══ */}
            <Tabs defaultValue="checks">
              <TabsList className="grid w-full grid-cols-4 h-auto">
                <TabsTrigger value="checks" className="gap-1 text-xs py-1.5"><ClipboardCheck className="size-4" /> خودتشخیصی ({faDigits(checks.length || (status.coreCycle?.p10.checksSummary ? status.coreCycle.p10.checksSummary.pass + status.coreCycle.p10.checksSummary.warn + status.coreCycle.p10.checksSummary.fail : 0))})</TabsTrigger>
                <TabsTrigger value="pending" className="gap-1 text-xs py-1.5"><Clock className="size-4" /> در انتظار شورا ({faDigits(proposals.length)})</TabsTrigger>
                <TabsTrigger value="board" className="gap-1 text-xs py-1.5"><Layers className="size-4" /> تختهٔ سیاه</TabsTrigger>
                <TabsTrigger value="metamind" className="gap-1 text-xs py-1.5 text-negin-nili-700 dark:text-negin-nili-300"><Gem className="size-4" /> فرا-ذهن (۴ موتور)</TabsTrigger>
              </TabsList>

              {/* ۲۵ بررسی خودتشخیصی — فهرست کامل */}
              <TabsContent value="checks">
                <div className="rounded-lg border p-2.5">
                  <p className="text-xs font-bold mb-2">
                    ۲۵ بررسی خودتشخیصی — سلامت: {status.coreCycle ? (status.coreCycle.p10.systemHealth === "healthy" ? "سالم" : status.coreCycle.p10.systemHealth === "degraded" ? "کاهش‌یافته" : "بحرانی") : "—"}
                    {status.coreCycle ? ` · نمره ${faDigits(status.coreCycle.p10.overallScore)}/۱۰۰` : ""}
                    <span className="mr-2 inline-flex items-center gap-1 align-middle">
                      <Badge variant="outline" className="text-[10px] text-emerald-600">{faDigits(pass > 0 ? pass : (status.coreCycle?.p10.checksSummary.pass ?? 0))} سبز</Badge>
                      <Badge variant="outline" className="text-[10px] text-amber-600">{faDigits(warn > 0 ? warn : (status.coreCycle?.p10.checksSummary.warn ?? 0))} هشدار</Badge>
                      <Badge variant="outline" className="text-[10px] text-red-600">{faDigits(fail > 0 ? fail : (status.coreCycle?.p10.checksSummary.fail ?? 0))} قرمز</Badge>
                    </span>
                  </p>
                  <div className="max-h-80 overflow-auto space-y-1">
                    {checks.length > 0 ? checks.map((c) => (
                      <div key={c.id} className="flex items-center gap-2 rounded border p-2 text-xs">
                        <Badge className={c.status === "pass" ? "bg-emerald-600" : c.status === "warn" ? "bg-amber-500" : "bg-red-600"}>{c.status === "pass" ? "سبز" : c.status === "warn" ? "هشدار" : "قرمز"}</Badge>
                        <span className="w-24 shrink-0 text-muted-foreground" dir="ltr">{c.id}</span>
                        <span className="w-32 shrink-0 font-medium">{c.name}</span>
                        <span className="truncate text-muted-foreground">{c.details}</span>
                      </div>
                    )) : (
                      <p className="text-xs text-muted-foreground">فهرست تفکیکی بررسی در این چرخه ارسال نشده — خلاصهٔ سه‌گانه بالا معتبر است.</p>
                    )}
                  </div>
                </div>
              </TabsContent>

              {/* تصمیم‌های در انتظار شورا */}
              <TabsContent value="pending">
                <div className="rounded-lg border p-2.5">
                  <p className="text-xs font-bold mb-2">تصمیم‌های در انتظار تأیید شورا — صفر اجرای خودکار (قفل ابدی)</p>
                  {proposals.length === 0 ? (
                    <p className="text-xs text-muted-foreground">هیچ پیشنهاد ترمیمِ بازی در انتظار نیست.</p>
                  ) : (
                    <div className="max-h-80 overflow-auto space-y-1">
                      {proposals.map((p) => (
                        <div key={p.id} className="flex items-start gap-2 rounded border p-2 text-xs">
                          <Badge variant={p.severity === "critical" || p.severity === "high" ? "destructive" : "outline"}>{p.severity}</Badge>
                          <div className="flex-1">
                            <p className="font-medium" dir="ltr">{p.sourceCheckId} — {p.id}</p>
                            <p className="text-muted-foreground">{p.rationale}</p>
                          </div>
                          <Badge variant="outline">{p.status === "pending" ? "در انتظار" : p.status ?? "در انتظار"}</Badge>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="mt-2 text-[10px] text-muted-foreground">اجرا فقط پس از تأیید شورای عالی ملکا — auto_execute=false برای همیشه</p>
                </div>
              </TabsContent>

              {/* تختهٔ سیاه — رویدادهای بین‌کاشی */}
              <TabsContent value="board">
                <div className="rounded-lg border p-2.5">
                  <p className="text-xs font-bold mb-2">رویدادهای بین‌کاشی — تختهٔ سیاه (۳۰ رویداد اخیر)</p>
                  <div className="max-h-80 overflow-auto space-y-1">
                    {board.map((e, i) => (
                      <div key={i} className="flex items-center gap-2 rounded border p-2 text-[11px]">
                        <Badge variant="outline">{e.namespace}</Badge>
                        <span className="text-muted-foreground" dir="ltr">{e.engineId}</span>
                        <span className="truncate" dir="ltr">{JSON.stringify(e.payload).slice(0, 80)}</span>
                        <span className="mr-auto shrink-0 text-muted-foreground" dir="ltr">{e.at.slice(0, 19).replace("T", " ")}</span>
                      </div>
                    ))}
                    {board.length === 0 ? <p className="text-xs text-muted-foreground">تخته خالی است.</p> : null}
                  </div>
                </div>
              </TabsContent>

              {/* ═══ فرا-ذهن: موتورهای ۱۲ تا ۱۵ روی دادهٔ واقعی ═══ */}
              <TabsContent value="metamind">
                {status.metaMind ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-xs font-bold flex items-center gap-1.5">
                        <Gem className="w-3.5 h-3.5 text-negin-nili-500" aria-hidden /> فرا-ذهن ملکا — چهار موتور (فاز ۱۳)
                      </p>
                      <span className="text-[10px] text-muted-foreground">اجرای زنده: {faDateTime(status.metaMind.ranAt)}</span>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      {/* موتور ۱۲ — توجه */}
                      <div className="rounded border p-2.5 text-xs">
                        <p className="font-bold flex items-center gap-1.5"><Radar className="w-3.5 h-3.5 text-negin-nili-500" aria-hidden /> موتور ۱۲ — توجه</p>
                        <p className="text-muted-foreground mt-1">
                          {faNumber(status.metaMind.engines.attention.considered)} آگهی تازه بررسی · بودجهٔ {status.metaMind.engines.attention.budgetLevel === "DAILY" ? "روزانه" : status.metaMind.engines.attention.budgetLevel}: {faNumber(status.metaMind.engines.attention.budget)} مورد
                        </p>
                        <p className="mt-1.5 font-medium">برترین‌های روز:</p>
                        <ol className="list-decimal ps-4 mt-1 space-y-0.5">
                          {status.metaMind.engines.attention.top.slice(0, 5).map((t) => (
                            <li key={t.itemId} className="text-muted-foreground">
                              <span className="font-medium" dir="ltr">{t.itemId}</span> — امتیاز {faNumber(t.total)}
                              <span className="block text-[10px] leading-relaxed opacity-80">{t.reason}</span>
                            </li>
                          ))}
                        </ol>
                      </div>

                      {/* موتور ۱۳ — علّیت */}
                      <div className="rounded border p-2.5 text-xs">
                        <p className="font-bold flex items-center gap-1.5"><Workflow className="w-3.5 h-3.5 text-negin-nili-500" aria-hidden /> موتور ۱۳ — علّیت (Pearl L1+L2)</p>
                        {status.metaMind.engines.causal.alive ? (
                          <>
                            <p className="text-muted-foreground mt-1">
                              گراف DAG: {faNumber(status.metaMind.engines.causal.nodes)} گره · {faNumber(status.metaMind.engines.causal.edges)} یال · {faNumber(status.metaMind.engines.causal.sampleSize)} نمونهٔ واقعی
                              {status.metaMind.engines.causal.dagVerified ? " · صفر چرخه ✓" : ""}
                            </p>
                            {status.metaMind.engines.causal.refIntervention && (
                              <p className="mt-1.5 rounded bg-muted/50 p-2">
                                کشف کلیدی — do({status.metaMind.engines.causal.refIntervention.feature} += ۱):
                                <span className="font-bold text-emerald-600"> +{faNumber(Math.round(status.metaMind.engines.causal.refIntervention.totalEffect * 1000) / 10)}٪ احتمال معامله</span>
                                <span className="text-muted-foreground"> ({faNumber(status.metaMind.engines.causal.refIntervention.paths)} مسیر علّی)</span>
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="text-muted-foreground mt-1">گراف هنوز ساخته نشده — پس از اولین شاهد علّی فعال می‌شود.</p>
                        )}
                      </div>

                      {/* موتور ۱۴ — پادواقع */}
                      <div className="rounded border p-2.5 text-xs">
                        <p className="font-bold flex items-center gap-1.5"><GitCompareArrows className="w-3.5 h-3.5 text-negin-nili-500" aria-hidden /> موتور ۱۴ — پادواقع (Pearl L3)</p>
                        {status.metaMind.engines.counterfactual.scenarios.length > 0 ? (
                          <div className="mt-1 space-y-1.5">
                            {status.metaMind.engines.counterfactual.scenarios.map((s) => (
                              <p key={s.scenario} className="rounded bg-muted/50 p-2">
                                «{s.scenario}»: {faNumber(Math.round(s.baseline * 1000) / 10)}٪ → <span className="font-bold">{faNumber(Math.round(s.counterfactual * 1000) / 10)}٪</span>
                                <span className={s.delta >= 0 ? "font-bold text-emerald-600" : "font-bold text-red-600"}> (Δ {s.delta >= 0 ? "+" : ""}{faNumber(Math.round(s.delta * 1000) / 10)}٪)</span>
                                <span className="text-muted-foreground"> · اطمینان {faNumber(s.confidence)}</span>
                              </p>
                            ))}
                            <p className="text-[10px] text-muted-foreground">شاهد: {status.metaMind.engines.counterfactual.evidenceNote} — با نویز فردی ثابت (سه‌گامی Pearl)</p>
                          </div>
                        ) : (
                          <p className="text-muted-foreground mt-1">شاهد معیار کافی نیست — پس از غنی‌سازی معاملات فعال می‌شود.</p>
                        )}
                      </div>

                      {/* موتور ۱۵ — شبیه‌سازی */}
                      <div className="rounded border p-2.5 text-xs">
                        <p className="font-bold flex items-center gap-1.5"><FlaskConical className="w-3.5 h-3.5 text-negin-nili-500" aria-hidden /> موتور ۱۵ — شبیه‌سازی (آزمون تصمیم)</p>
                        {status.metaMind.engines.simulation.comparison ? (
                          <div className="mt-1 space-y-1">
                            {status.metaMind.engines.simulation.comparison!.results.map((r) => (
                              <p key={r.action.label} className="flex items-center justify-between rounded bg-muted/50 px-2 py-1">
                                <span>{r.action.label}</span>
                                <span className={r.delta > 0 ? "font-bold text-emerald-600" : r.delta < 0 ? "font-bold text-red-600" : "text-muted-foreground"}>
                                  Δ {r.delta >= 0 ? "+" : ""}{faNumber(Math.round(r.delta * 1000) / 10)}٪
                                </span>
                              </p>
                            ))}
                            <p className="text-[10px] leading-relaxed text-muted-foreground">{status.metaMind.engines.simulation.comparison!.recommendation}</p>
                            <p className="text-[10px] text-muted-foreground">قفل ابدی: شبیه‌سازی فقط پیشنهاد — صفر اجرای خودکار (auto_execute=false)</p>
                          </div>
                        ) : (
                          <p className="text-muted-foreground mt-1">در انتظار گراف و شاهد معیار.</p>
                        )}
                      </div>
                    </div>

                    <p className="text-[10px] text-muted-foreground">
                      فشار بازار: {faNumber(status.metaMind.marketPressure)} (نسبت عرضه/تقاضا — تعدیل‌کنندهٔ Δ شبیه‌سازی)
                    </p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground py-4 text-center">فرا-ذهن در این نسخه در دسترس نیست.</p>
                )}
              </TabsContent>
            </Tabs>

            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5" aria-hidden />
                آخرین اجرای حلقه: {status.daemon.lastRunAt ? faDateTime(status.daemon.lastRunAt) : "—"}
              </span>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()} disabled={loading}>
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : <RefreshCcw className="w-3.5 h-3.5" aria-hidden />}
                تازه‌سازی
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
