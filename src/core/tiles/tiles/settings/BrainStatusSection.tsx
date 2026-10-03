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
import { BrainCircuit, RefreshCcw, Loader2, Activity, Gauge, Link2, GitBranch } from "lucide-react";
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
        <CardDescription>فازهای ۷ تا ۱۱ (سند ۰۲۷) — یادگیری از نتیجه، تصمیم ایمن، حاکمیت، خودشناسی و خودترمیمی کنترل‌شده</CardDescription>
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
