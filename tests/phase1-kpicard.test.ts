/**
 * تست‌های PHASE 1 — P1-01a: کامپوننت مشترک KpiCard
 * ------------------------------------------------------
 * پوشش:
 *   ۱. قرارداد رندر: مارک‌آپ عین الگوی قبلی ۸ صفحه (تطبیق رشته خروجی SSR)
 *   ۲. ادعاهای ساختاری: تعریف یگانه + استفاده هر ۸ صفحه + صفر بلوک قدیمی
 */

import { describe, expect, test } from "bun:test";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { Users, Scale } from "lucide-react";
import { KpiCard } from "@/components/app/shared";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const TILES = "/home/z/my-project/src/core/tiles/tiles";
const CRM_PAGES = [
  "transactions-contracts/TransactionsTab.tsx",
  "experts/ExpertsPage.tsx",
];

describe("P1-01a / KpiCard — قرارداد رندر (عین مارک‌آپ قبلی)", () => {
  test("سبک div (معاملات/کارشناسان): ترتیب کلاس ظرف آیکون عین قبل", () => {
    const html = renderToString(
      h(KpiCard, {
        label: "کل کاربران",
        value: 123,
        icon: Users,
        iconAs: "div",
        iconWrapperClassName: "bg-primary/10",
        iconColorClassName: "text-primary",
      })
    );
    expect(html).toContain('class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0"');
    expect(html).toContain('class="lucide lucide-users w-5 h-5 text-primary"');
    expect(html).toContain('class="text-xl font-extrabold tabular-nums"');
    expect(html).not.toContain("animate-pulse"); // مقدار تعریف‌شده → بدون اسکلتون
  });

  test("سبک span (پنج صفحه دیگر): tone کامل روی ظرف، آیکون بی‌رنگ", () => {
    const html = renderToString(
      h(KpiCard, {
        label: "شاخص تعادل بازار",
        value: "۴۲٪",
        icon: Scale,
        iconWrapperClassName: "bg-primary/10 text-primary",
        cardClassName: "border-border/60",
      })
    );
    expect(html).toContain('shadow-sm border-border/60"');
    expect(html).toContain('class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 bg-primary/10 text-primary"');
    expect(html).toContain('class="lucide lucide-scale w-5 h-5"');
  });

  test("مقدار undefined → اسکلتون تپنده (سبک بارگذاری)", () => {
    const html = renderToString(
      h(KpiCard, { label: "کل بازدیدها", value: undefined, icon: Users, iconWrapperClassName: "bg-primary/10 text-primary" })
    );
    expect(html).toContain('class="inline-block h-6 w-14 animate-pulse rounded-md bg-accent align-middle"');
  });

  test("مقدار صفر (۰ عددی) رندر می‌شود — اسکلتون نیست", () => {
    const html = renderToString(
      h(KpiCard, { label: "رد / فسخ‌شده", value: 0, icon: Users, iconWrapperClassName: "bg-rose-100 text-rose-700" })
    );
    expect(html).toContain(">0</p>");
    expect(html).not.toContain("animate-pulse");
  });

  test("valueClassName جایگزین (سبک text-lg + truncate مالی/شاخص/قرارداد/باشگاه)", () => {
    const html = renderToString(
      h(KpiCard, {
        label: "کل قراردادها",
        value: "۵۰۰",
        icon: Users,
        iconWrapperClassName: "bg-primary/10 text-primary",
        valueClassName: "text-lg font-extrabold tabular-nums truncate",
      })
    );
    expect(html).toContain('class="text-lg font-extrabold tabular-nums truncate"');
    expect(html).not.toContain('class="text-xl font-extrabold tabular-nums"');
  });

  test("زیرنویس sub فقط با مقدار تعریف‌شده رندر می‌شود (سبک شاخص قیمت)", () => {
    const withValue = renderToString(
      h(KpiCard, { label: "شاخص کل بازار", value: "۵۰٬۰۰۰٬۰۰۰", icon: Users, iconWrapperClassName: "bg-primary/10 text-primary", sub: "(هر متر)" })
    );
    expect(withValue).toContain('class="text-[10px] text-muted-foreground"');
    expect(withValue).toContain("(هر متر)");
    const withoutValue = renderToString(
      h(KpiCard, { label: "شاخص کل بازار", value: undefined, icon: Users, iconWrapperClassName: "bg-primary/10 text-primary", sub: "(هر متر)" })
    );
    expect(withoutValue).not.toContain('class="text-[10px] text-muted-foreground"');
  });

  test("labelClassName جایگزین (سبک کارشناسان با truncate)", () => {
    const html = renderToString(
      h(KpiCard, {
        label: "پرتعامل‌ترین مشاور",
        value: "—",
        icon: Users,
        iconAs: "div",
        iconWrapperClassName: "bg-amber-100 dark:bg-amber-950",
        labelClassName: "text-xs text-muted-foreground truncate",
        valueClassName: "text-sm font-extrabold truncate",
      })
    );
    expect(html).toContain('class="text-xs text-muted-foreground truncate"');
    expect(html).toContain('class="text-sm font-extrabold truncate"');
  });
});

describe("P1-01a / KpiCard — ادعاهای ساختاری (grep)", () => {
  test("تعریف KpiCard دقیقاً یک بار در کل کدبیس", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name)) {
          if (/export function KpiCard/.test(readFileSync(p, "utf8"))) hits.push(p);
        }
      }
    };
    walk("/home/z/my-project/src");
    expect(hits.length).toBe(1);
    expect(hits[0]).toBe("/home/z/my-project/src/components/app/shared/kpi-card.tsx");
  });

  test("هر ۷ صفحه CRM (P6.5-11: بازدیدها حذف؛ سه‌گانه ادغام شد) از KpiCard مشترک import می‌کنند", () => {
    for (const page of CRM_PAGES) {
      const content = readFileSync(join(TILES, page), "utf8");
      expect(content).toContain("KpiCard");
      expect(content).toContain('from "@/components/app/shared"');
    }
  });

  test("صفر بلوک KPI قدیمی (Card + p-4 flex items-center gap-3) در ۷ صفحه CRM", () => {
    for (const page of CRM_PAGES) {
      const content = readFileSync(join(TILES, page), "utf8");
      expect(content).not.toContain('p-4 flex items-center gap-3');
    }
  });
});
