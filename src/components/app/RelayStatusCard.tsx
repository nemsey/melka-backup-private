"use client";

/**
 * RelayStatusCard — نمایشگر سلامت رله 🟢/🟡/🔴 (PN-038 · فاز ۴ · بند ۴.۲)
 * ---------------------------------------------------------------------------
 * شورا-ن۰۶۳: «نمایش وضعیت 🟢/🟡/🔴 در UI — RelayStatusCard.tsx»
 * سه لایهٔ پایش (نبض گوشی · فعالیت مسیر · تازگی داده/بکاپ) + حکم کلی.
 * هر ۶۰ ثانیه از /api/relay/health تازه می‌شود (اولین fetch فوری).
 */

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Card } from "@/components/ui/card";
import { Radio, RefreshCw } from "lucide-react";
import { api } from "@/lib/client/api";
import { faDateTime } from "@/lib/format";

interface RelayHealthLayer {
  key: "heartbeat" | "api-probe" | "full-sync";
  label: string;
  state: "green" | "yellow" | "red";
  detail: string;
  measuredAt: string;
}

interface RelayHealthReport {
  verdict: "green" | "yellow" | "red";
  verdictFa: string;
  layers: RelayHealthLayer[];
  computedAt: string;
}

const DOT_FA: Record<RelayHealthLayer["state"], string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-rose-500",
};

const VERDICT_BADGE: Record<RelayHealthReport["verdict"], { text: string; className: string }> = {
  green: { text: "🟢 رله سالم", className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30" },
  yellow: { text: "🟡 رله با هشدار", className: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30" },
  red: { text: "🔴 رله خاموش", className: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30" },
};

const LAYER_SHORT_FA: Record<RelayHealthLayer["key"], string> = {
  heartbeat: "نبض گوشی",
  "api-probe": "مسیر رله",
  "full-sync": "داده و بکاپ",
};

export function RelayStatusCard() {
  const [report, setReport] = useState<RelayHealthReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const r = await api<RelayHealthReport & { ok: boolean }>("/api/relay/health", { timeoutMs: 15_000 });
      setReport(r);
      setError(null);
    } catch (e) {
      setError(String((e as Error)?.message ?? e).slice(0, 120));
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 60_000); // پایش ۲۴ ساعته — هر دقیقه
    return () => clearInterval(t);
  }, [refresh]);

  const verdict = report?.verdict ?? "yellow";
  const badge = VERDICT_BADGE[verdict];

  return (
    <Card
      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 border-border/60 bg-card/60"
      data-testid="relay-status-card"
    >
      <div className="flex items-center gap-2">
        <Radio className="size-4 text-muted-foreground" aria-hidden />
        <span className="text-sm font-bold">پایش رلهٔ ملکا</span>
      </div>

      <Badge variant="outline" className={badge.className} data-testid="relay-verdict">
        {badge.text}
      </Badge>

      <TooltipProvider>
        <div className="flex items-center gap-3" data-testid="relay-layers">
          {(report?.layers ?? []).map((layer) => (
            <Tooltip key={layer.key}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={`${layer.label}: ${layer.detail}`}
                >
                  <span className={`size-2 rounded-full ${DOT_FA[layer.state]}`} aria-hidden />
                  {LAYER_SHORT_FA[layer.key]}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-72 text-xs leading-relaxed">
                <p className="font-bold mb-1">{layer.label}</p>
                <p>{layer.detail}</p>
              </TooltipContent>
            </Tooltip>
          ))}
          {!report && !error && <span className="text-xs text-muted-foreground">در حال سنجش…</span>}
          {error && <span className="text-xs text-rose-500" data-testid="relay-error">سنجش ناموفق — {error}</span>}
        </div>
      </TooltipProvider>

      <button
        type="button"
        onClick={() => void refresh()}
        className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        disabled={busy}
        aria-label="سنجش دوبارهٔ سلامت رله"
      >
        <RefreshCw className={`size-3.5 ${busy ? "animate-spin" : ""}`} aria-hidden />
        {report ? `آخرین سنجش: ${faDateTime(report.computedAt)}` : "سنجش"}
      </button>
    </Card>
  );
}
