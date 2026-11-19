"use client";

/**
 * StepReport — نمایشگر گزارش گام‌به‌گام عملیات کاشی «تغییرات»
 * ------------------------------------------------------
 * عین الگوی گزارش ۰۹۹ (register-request.ts): هر گام با وضعیت + جزئیات فارسی.
 */

import { CheckCircle2, XCircle, MinusCircle, Clock } from "lucide-react";
import type { ChangesStep, ChangesReport } from "@/lib/changes/executor";
import { Badge } from "@/components/ui/badge";

const STATUS_META: Record<ChangesStep["status"], { icon: typeof CheckCircle2; className: string; label: string }> = {
  done: { icon: CheckCircle2, className: "text-emerald-600", label: "انجام شد" },
  failed: { icon: XCircle, className: "text-red-600", label: "ناموفق" },
  skipped: { icon: MinusCircle, className: "text-muted-foreground", label: "رد شد" },
  pending: { icon: Clock, className: "text-amber-600", label: "در انتظار" },
};

export function StepReport({ report }: { report: ChangesReport }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-2" data-testid="changes-step-report">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2">
          <Badge variant={report.ok ? "default" : "destructive"} className={report.ok ? "bg-emerald-600 hover:bg-emerald-600" : ""}>
            {report.ok ? "عملیات موفق" : "عملیات ناموفق"}
          </Badge>
          <span className="text-xs text-muted-foreground" dir="ltr">
            {report.operation} · {(report.durationMs / 1000).toFixed(1)}s
          </span>
        </div>
        {report.result && "requestCode" in report.result && report.result.requestCode ? (
          <Badge variant="outline" className="font-mono" dir="ltr">
            کد درخواست: {String(report.result.requestCode)}
          </Badge>
        ) : null}
        {report.result && "propertyCode" in report.result && report.result.propertyCode ? (
          <Badge variant="outline" className="font-mono" dir="ltr">
            کدآگهی: {String(report.result.propertyCode)}
          </Badge>
        ) : null}
      </div>
      <ol className="space-y-1.5">
        {report.steps.map((s, i) => {
          const meta = STATUS_META[s.status] ?? STATUS_META.pending;
          const Icon = meta.icon;
          return (
            <li key={`${s.key}-${i}`} className="flex items-start gap-2 rounded-lg bg-background/60 p-2 border border-border/50">
              <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${meta.className}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium leading-5">{s.title}</div>
                <div className="text-[11px] leading-5 text-muted-foreground break-words" dir="auto">{s.detail}</div>
              </div>
            </li>
          );
        })}
      </ol>
      {report.error ? <p className="text-xs text-red-600 font-medium px-1">{report.error}</p> : null}
    </div>
  );
}
