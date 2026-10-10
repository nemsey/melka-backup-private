"use client";

/**
 * AdviceCard — کارت مشورهٔ مغز ملکا (PN-025 / فاز ۱۳-ج / مرحلهٔ ۸)
 * ---------------------------------------------------------------------------
 * مؤلفهٔ مشترک سه کاشی حیاتی (M5 تطبیق · فایل‌یابی · M7 شاخص):
 * توصیه + روایت + بدیل‌ها + ریسک — با دو حالت:
 *   · مشورهٔ کامل (DecisionAdvice) — با دکمهٔ «تأیید می‌کنم» (فقط AuditLog)
 *   · قفل کمربند ({ locked, message }) — پیام احترام + تایمر باقی‌مانده
 *
 * قید مطلق: دکمهٔ تأیید هیچ کنش واقعی انجام نمی‌دهد (requiresApproval) —
 * صفر LLM در سرور، صفر auto_execute در کل زنجیره.
 *
 * WCAG AA: رنگ نشان ریسک از خانواده‌های رجیستری (low=emerald · medium=amber · high=rose).
 */

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BrainCircuit, CheckCircle2, Lock, RefreshCcw, Loader2 } from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { faNumber } from "@/lib/format";

/** قرارداد خروجی — نسخهٔ سادهٔ مشاور برای UI (عین سرویس) */
interface AdvicePayload {
  decisionId?: string;
  recommendation?: string;
  narrative?: string;
  confidence?: number;
  basedOn?: Partial<Record<"attention" | "causal" | "counterfactual" | "simulation" | "memory" | "vision", string>>;
  alternatives?: Array<{ label: string; score: number; rationale: string }>;
  risk?: "low" | "medium" | "high";
  requiresApproval?: boolean;
  autoExecute?: boolean;
  locked?: boolean;
  message?: string;
  remainingHours?: number;
}

const RISK_BADGE: Record<string, string> = {
  low: "border-0 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  medium: "border-0 bg-amber-500/15 text-amber-700 dark:text-amber-300",
  high: "border-0 bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

const RISK_LABEL_FA: Record<string, string> = { low: "ریسک کم", medium: "ریسک متوسط", high: "ریسک بالا" };

export function AdviceCard({ endpoint, title }: { endpoint: string; title?: string }) {
  const [advice, setAdvice] = useState<AdvicePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [acknowledged, setAcknowledged] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<{ ok: boolean; advice: AdvicePayload }>(endpoint);
      setAdvice(res.advice);
      setAcknowledged(false);
    } catch {
      setAdvice(null); // بی‌صدا — مشوره لطیف است نه حیاتی
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <Card className="border-primary/20" data-testid="advice-card-loading">
        <CardContent className="p-4">
          <Skeleton className="h-16 w-full rounded-lg" />
        </CardContent>
      </Card>
    );
  }

  if (!advice) return null; // بی‌شور مشوره نبود — سکوت محترمانه

  // ═══ حالت قفل کمربند — پیام احترام ═══
  if (advice.locked) {
    return (
      <Card className="border-dashed border-primary/25 bg-muted/20" data-testid="advice-card-locked">
        <CardContent className="p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Lock className="w-4.5 h-4.5 text-primary" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold flex items-center gap-1.5">
              مغز ملکا فعلاً ساکت است
              {advice.remainingHours ? (
                <span className="text-xs font-normal text-muted-foreground">— حدود {faNumber(advice.remainingHours)} ساعت دیگر</span>
              ) : null}
            </p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{advice.message}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // ═══ حالت مشورهٔ کامل ═══
  return (
    <Card
      className="border-primary/30 bg-gradient-to-l from-primary/[0.06] to-transparent"
      data-testid="advice-card"
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-bold flex items-center gap-1.5">
            <BrainCircuit className="w-4.5 h-4.5 text-primary" aria-hidden />
            {title ?? "توصیهٔ مغز ملکا"}
          </p>
          <div className="flex items-center gap-1.5">
            {advice.risk ? (
              <Badge variant="secondary" className={`text-[10px] ${RISK_BADGE[advice.risk] ?? ""}`}>
                {RISK_LABEL_FA[advice.risk] ?? "ریسک نامشخص"}
              </Badge>
            ) : null}
            <button
              type="button"
              className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
              onClick={() => void load()}
              aria-label="تازه‌سازی توصیه"
            >
              <RefreshCcw className="w-3 h-3" aria-hidden />
            </button>
          </div>
        </div>

        <p className="text-sm font-extrabold text-foreground leading-relaxed">{advice.recommendation}</p>
        <p className="text-xs text-muted-foreground leading-relaxed">{advice.narrative}</p>

        {advice.alternatives && advice.alternatives.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {advice.alternatives.slice(0, 3).map((alt, i) => (
              <Badge key={i} variant="outline" className="text-[10px] gap-1 font-normal">
                بدیل {faNumber(i + 1)}: {alt.label}
              </Badge>
            ))}
          </div>
        ) : null}

        {advice.basedOn && Object.keys(advice.basedOn).length > 0 ? (
          <details className="text-[10px] text-muted-foreground">
            <summary className="cursor-pointer select-none hover:text-foreground transition-colors">شواهد پشت این توصیه</summary>
            <ul className="mt-1.5 space-y-1">
              {Object.entries(advice.basedOn).map(([k, v]) => (
                <li key={k} className="leading-relaxed">— {v}</li>
              ))}
            </ul>
          </details>
        ) : null}

        <div className="flex items-center gap-2 pt-1">
          {acknowledged ? (
            <span className="text-[11px] text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden /> ثبت شد — منتظر اقدام شما
            </span>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px] gap-1.5"
              onClick={() => setAcknowledged(true)}
              aria-label="تأیید دیدن توصیه — سامانه هیچ کنشی انجام نمی‌دهد"
            >
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden /> تأیید می‌کنم
            </Button>
          )}
          <span className="text-[10px] text-muted-foreground">
            سامانه هرگز خودش اجرا نمی‌کند — تصمیم و اجرا با شماست
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
