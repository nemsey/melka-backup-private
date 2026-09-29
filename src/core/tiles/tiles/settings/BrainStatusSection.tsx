"use client";

/**
 * بخش «مغز هوشمند ملکا» — شفافیت فازهای ۷/۸/۹ در تنظیمات عمومی
 * ------------------------------------------------------
 * نمایش زندهٔ وضعیت ۱۱ موتور هوشمندی، حلقهٔ سرنوشت (پیش‌بینی/پیامد روی
 * دادهٔ واقعی ARM)، ارزیابی صادقانه (Brier / کالیبراسیون / Lift) و دیمن v2.
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
        <CardDescription>فازهای ۷ تا ۹ — موتورهای هوشمندی، حلقهٔ سرنوشت و ارزیابی صادقانه روی دادهٔ واقعی</CardDescription>
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
                فاز ۷ ✓ فاز ۸ ✓ فاز ۹ ✓
              </Badge>
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
