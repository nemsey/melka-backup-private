"use client";

/**
 * بخش «مغز هوشمند ملکا» — شفافیت فازهای ۷ تا ۱۱ (سند ۰۲۷) در تنظیمات عمومی
 * ------------------------------------------------------
 * نمایش زندهٔ وضعیت ۱۱ موتور هوشمندی، حلقهٔ سرنوشت، ارزیابی صادقانه،
 * چرخهٔ بزرگ سند ۰۲۷ (P7 یادگیری · P8 تصمیم · P9 حاکمیت · P10 خودتشخیصی ·
 * P11 خودترمیمی کنترل‌شده) و دیمن v2.
 * منبع: GET /api/intelligence/status (نیازمند نشست معتبر).
 */

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BrainCircuit, RefreshCcw, Loader2, Activity, Gauge, Link2, GitBranch, Gem, Radar, Workflow, GitCompareArrows, FlaskConical } from "lucide-react";
import { api as apiCall, ApiClientError } from "@/lib/client/api";
import { faDateTime, faNumber } from "@/lib/format";

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
    p7: { outcomesCollected: number; coveragePercent: number; brier: number; lift: number; ece: number; verdict: string; rationale: string; learning: { learned: boolean; reason: string; tier: number }; shadow: { verdict: string; shadowBrier: number; primaryBrier: number }; drift: { type: string; magnitude: number; action: string; rationale: string } };
    p8: { decisionsCount: number; safetyAllPassed: boolean; blockedCount: number; plansCount: number; sample: Array<{ decisionType: string; proposedAction: string; confidence: number; autoExecute: boolean }> };
    p9: { policyEvaluations: Array<{ policyId: string; verdict: string; rationale: string }>; governance: { passed: number; failed: number; criticalViolations: string[]; details: string[] } };
    p10: { systemHealth: string; overallScore: number; problems: Array<{ checkId: string; details: string }>; checksSummary: { pass: number; warn: number; fail: number } };
    p11: { pendingProposals: Array<{ id: string; sourceCheckId: string; severity: string; action: string; rationale: string }>; executedCount: number; gateReviews: Array<{ proposalId: string; summary: string }> };
  };
}

const VERDICT_FA: Record<string, string> = {
  INSUFFICIENT_DATA: "داده کافی نیست",
  BELOW_BASELINE: "پایین‌تر از خط پایه",
  AT_BASELINE: "هم‌خط با خط پایه",
  ABOVE_BASELINE: "بالاتر از خط پایه",
};

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiCall<BrainStatus>("/api/intelligence/status", { method: "GET" });
      setStatus(data);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "خطا در دریافت وضعیت مغز هوشمند");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <BrainCircuit className="w-5 h-5 text-sec-ai-700" aria-hidden /> مغز هوشمند و یادگیر ملکا
        </CardTitle>
        <CardDescription>فازهای ۷ تا ۱۱ (سند ۰۲۷) + فرا-ذهن فاز ۱۳ (موتورهای ۱۲ تا ۱۵ — توجه، علّیت، پادواقع، شبیه‌سازی)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!status && !error && (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> در حال دریافت وضعیت زنده…
          </p>
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

            {/* ═══ PN-024 ثانیاً — فرا-ذهن: موتورهای ۱۲ تا ۱۵ روی دادهٔ واقعی ═══ */}
            {status.metaMind && (
              <div className="space-y-3 rounded-lg border p-3" data-negin="nili">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold flex items-center gap-2">
                    <Gem className="w-4 h-4 text-negin-nili-500" aria-hidden /> فرا-ذهن ملکا — چهار موتور تازه (فاز ۱۳)
                  </p>
                  <span className="text-[11px] text-muted-foreground">اجرای زنده: {faDateTime(status.metaMind.ranAt)}</span>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  {/* موتور ۱۲ — توجه */}
                  <div className="rounded border p-2.5 text-xs">
                    <p className="font-bold flex items-center gap-1.5"><Radar className="w-3.5 h-3.5 text-negin-nili-500" aria-hidden /> موتور ۱۲ — توجه</p>
                    <p className="text-muted-foreground mt-1">
                      {faNumber(status.metaMind.engines.attention.considered)} آگهی تازه بررسی · بودجهٔ روزانه: {faNumber(status.metaMind.engines.attention.budget)} مورد
                    </p>
                    <p className="mt-1.5 font-medium">۱۰ برتر روز:</p>
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
                  فشار بازار: {faNumber(status.metaMind.marketPressure)} (نسبت عرضه/تقاضا — تعدیل‌کنندهٔ Δ شبیه‌سازی) · جزئیات کامل در کاشی M6 «مغز ملکا — یادگیری و Tier»
                </p>
              </div>
            )}

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
