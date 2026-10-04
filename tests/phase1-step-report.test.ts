/**
 * تست‌های PHASE 1 — P1-01b: کامپوننت مشترک StepReportList
 * ------------------------------------------------------
 * ادغام سه تعریف تکراری (TransferStepUI / StepReport / ArmStepReport)
 * در نوع یگانه StepReportItem + سه گونه رندر عین مارک‌آپ قبلی.
 */

import { describe, expect, test } from "bun:test";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { StepReportList, type StepReportItem } from "@/components/app/shared";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const SAMPLE: StepReportItem[] = [
  { key: "validate", title: "اعتبارسنجی ۴ گامی", status: "done", detail: "همه گام‌ها کامل است." },
  { key: "customer", title: "جستجوی مشتری در آرم", status: "failed", detail: "توکن منقضی شده است." },
  { key: "location", title: "شناسه‌های مکانی", status: "pending", detail: "در انتظار اجرا" },
  { key: "media", title: "رسانه", status: "skipped", detail: "بدون تصویر" },
];

describe("P1-01b / StepReportList — قرارداد رندر (عین مارک‌آپ قبلی)", () => {
  test("گونه compact (CrmTransferDialog): شماره فارسی + آیکون وضعیت", () => {
    const html = renderToString(h(StepReportList, { steps: SAMPLE }));
    expect(html).toContain('<ol class="space-y-2">');
    expect(html).toContain(">۱<!-- -->.</span>");
    expect(html).toContain(">۴<!-- -->.</span>");
    // آیکون وضعیت: done → teal CheckCircle2 / failed → rose XCircle / pending → amber Loader2
    expect(html).toContain("lucide-circle-check w-4 h-4 text-teal-600");
    expect(html).toContain("lucide-circle-x w-4 h-4 text-rose-600");
    expect(html).toContain("lucide-loader-circle w-4 h-4 animate-spin text-amber-600");
    expect(html).toContain('class="text-xs font-bold leading-5"');
    expect(html).toContain('class="text-[11px] text-muted-foreground leading-5 break-words"');
  });

  test("گونه detailed (ArmRegisterDialog): کارت حاشیه‌دار + نشان دایره‌ای + شماره فارسی", () => {
    const html = renderToString(h(StepReportList, { steps: SAMPLE, variant: "detailed" }));
    expect(html).toContain('<ol class="space-y-1.5">');
    expect(html).toContain('class="rounded-lg border p-2.5 text-[11px] leading-5 flex gap-2"');
    expect(html).toContain('class="shrink-0 w-5 h-5 rounded-full grid place-content-center bg-teal-500 text-white"');
    expect(html).toContain('class="shrink-0 w-5 h-5 rounded-full grid place-content-center bg-rose-500 text-white"');
    expect(html).toContain('class="shrink-0 w-5 h-5 rounded-full grid place-content-center bg-muted text-muted-foreground"');
    expect(html).toContain(">۳</span>"); // شماره گام pending (نمایه صفرمبنای ۲) با ارقام فارسی
  });

  test("گونه inline (NewRequestDialog): دایره ریز + برچسب وضعیت متنی", () => {
    const html = renderToString(h(StepReportList, { steps: SAMPLE, variant: "inline" }));
    expect(html).toContain('class="text-[11px] leading-5 flex gap-2"');
    expect(html).toContain('class="shrink-0 w-4 h-4 rounded-full grid place-content-center');
    expect(html).toContain("انجام شد");
    expect(html).toContain("ناموفق");
    expect(html).toContain("در انتظار");
  });

  test("گونه پیش‌فرض = compact", () => {
    const a = renderToString(h(StepReportList, { steps: SAMPLE }));
    const b = renderToString(h(StepReportList, { steps: SAMPLE, variant: "compact" }));
    expect(a).toBe(b);
  });
});

describe("P1-01b / StepReportList — ادعاهای ساختاری (grep)", () => {
  const SRC = "/home/z/my-project/src";

  test("تعریف StepReportList/StepReportItem دقیقاً یک بار", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name)) {
          if (/export (function StepReportList|interface StepReportItem|type StepReportItem)/.test(readFileSync(p, "utf8"))) hits.push(p);
        }
      }
    };
    walk(SRC);
    expect(hits.length).toBe(1);
    expect(hits[0]).toBe(join(SRC, "components/app/shared/step-report-list.tsx"));
  });

  test("صفر تعریف مستقیم TransferStepUI / interface StepReport در کدبیس", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name)) {
          const c = readFileSync(p, "utf8");
          if (/interface (TransferStepUI|StepReport) \{/.test(c)) offenders.push(p);
        }
      }
    };
    walk(SRC);
    expect(offenders).toEqual([]);
  });

  test("هر سه دیالوگ گام از StepReportList مشترک استفاده می‌کنند", () => {
    const dialogs = [
      "core/tiles/tiles/listing/CrmTransferDialog.tsx",
      "core/tiles/tiles/request/ArmRegisterDialog.tsx",
      "core/tiles/tiles/request/NewRequestDialog.tsx",
    ];
    for (const d of dialogs) {
      const c = readFileSync(join(SRC, d), "utf8");
      expect(c).toContain("<StepReportList");
      expect(c).toContain('from "@/components/app/shared"');
    }
  });

  test("ArmStepReport صرفاً alias سازگاری به نوع مشترک است", () => {
    const c = readFileSync(join(SRC, "core/tiles/tiles/request/NewRequestDialog.tsx"), "utf8");
    expect(c).toContain("export type ArmStepReport = StepReportItem;");
  });
});
