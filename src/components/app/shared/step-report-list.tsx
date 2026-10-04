"use client";

/**
 * StepReportList — گزارش گام‌های ثبت ARM (P1-01)
 * ------------------------------------------------------
 * ادغام سه تعریف تکراری با ساختار یکسان:
 *   • TransferStepUI  (CrmTransferDialog — «انتقال به CRM»)
 *   • StepReport      (ArmRegisterDialog — «ثبت در سامانه ARM»)
 *   • ArmStepReport   (NewRequestDialog — ویزارد ثبت درخواست)
 *
 * سه گونه رندر (variant) — عین مارک‌آپ قبلی هر دیالوگ، بدون تغییر DOM:
 *   • "compact"  — فهرست با شماره فارسی + آیکون وضعیت (CrmTransferDialog)
 *   • "detailed" — کارت‌های حاشیه‌دار با نشان دایره‌ای (ArmRegisterDialog)
 *   • "inline"   — ردیف‌های فشرده با برچسب وضعیت متنی (NewRequestDialog)
 */

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { faNumber } from "@/lib/format";

/** وضعیت هر گام ثبت — عین قرارداد سه تعریف قبلی */
export type StepReportStatus = "pending" | "done" | "failed" | "skipped";

/** یک گام گزارش ثبت ARM — نوع مشترک یگانه (جایگزین TransferStepUI/StepReport/ArmStepReport) */
export interface StepReportItem {
  key: string;
  title: string;
  status: StepReportStatus;
  detail: string;
}

const FA_STEP_NUMBERS = ["۱", "۲", "۳", "۴", "۵", "۶", "۷"] as const;

/** آیکون وضعیت — سبک CrmTransferDialog */
function CompactStatusIcon({ status }: { status: StepReportStatus }) {
  if (status === "done") return <CheckCircle2 className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" aria-hidden />;
  if (status === "failed") return <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" aria-hidden />;
  if (status === "skipped") return <XCircle className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden />;
  return <Loader2 className="w-4 h-4 animate-spin text-amber-600 shrink-0" aria-hidden />;
}

export interface StepReportListProps {
  steps: StepReportItem[];
  variant?: "compact" | "detailed" | "inline";
}

export function StepReportList({ steps, variant = "compact" }: StepReportListProps) {
  if (variant === "detailed") {
    return (
      <ol className="space-y-1.5">
        {steps.map((s, i) => (
          <li key={`${s.key}-${i}`} className="rounded-lg border p-2.5 text-[11px] leading-5 flex gap-2">
            <span
              className={`shrink-0 w-5 h-5 rounded-full grid place-content-center ${
                s.status === "done" ? "bg-teal-500 text-white" : s.status === "failed" ? "bg-rose-500 text-white" : "bg-muted text-muted-foreground"
              }`}
            >
              {s.status === "done" ? <CheckCircle2 className="w-3 h-3" aria-hidden /> : s.status === "failed" ? <XCircle className="w-3 h-3" aria-hidden /> : faNumber(i + 1)}
            </span>
            <div className="min-w-0">
              <b>{s.title}</b>
              <p className="text-muted-foreground">{s.detail}</p>
            </div>
          </li>
        ))}
      </ol>
    );
  }

  if (variant === "inline") {
    return (
      <ol className="space-y-1.5">
        {steps.map((s, i) => (
          <li key={s.key} className="text-[11px] leading-5 flex gap-2">
            <span
              className={`shrink-0 w-4 h-4 rounded-full grid place-content-center ${
                s.status === "done" ? "bg-teal-500 text-white" : s.status === "failed" ? "bg-rose-500 text-white" : "bg-muted text-muted-foreground"
              }`}
            >
              {faNumber(i + 1)}
            </span>
            <span>
              <b>{s.title}</b>
              <span className={`me-1 ms-1 ${s.status === "done" ? "text-teal-600" : s.status === "failed" ? "text-rose-600" : "text-muted-foreground"}`}>
                {s.status === "done" ? "انجام شد" : s.status === "failed" ? "ناموفق" : "در انتظار"}
              </span>
              <br />
              <span className="text-muted-foreground">{s.detail}</span>
            </span>
          </li>
        ))}
      </ol>
    );
  }

  return (
    <ol className="space-y-2">
      {steps.map((s, i) => (
        <li key={s.key} className="flex gap-2 items-start">
          <span className="text-[10px] text-muted-foreground mt-0.5 shrink-0">{FA_STEP_NUMBERS[i] ?? i + 1}.</span>
          <CompactStatusIcon status={s.status} />
          <div className="min-w-0">
            <p className="text-xs font-bold leading-5">{s.title}</p>
            <p className="text-[11px] text-muted-foreground leading-5 break-words">{s.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
