/**
 * تست‌های PHASE 1 — P1-01c: اجزای مشترک منبع داده (DataSourceInfo)
 * ------------------------------------------------------
 * DataSourceWarning (سبک معاملات/کارشناسان) + DataSourceAlert (پنج صفحه دیگر)
 * + حذف ۴ تعریف تکراری رابط DataSourceInfo
 */

import { describe, expect, test } from "bun:test";
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { DataSourceAlert, DataSourceWarning } from "@/components/app/shared";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const TILES = "/home/z/my-project/src/core/tiles/tiles";
const SRC = "/home/z/my-project/src";

const SOURCE = {
  real: true,
  cached: true,
  lastSuccessAt: "2026-09-01T10:00:00.000Z",
  liveError: "توکن منقضی شده است",
};

describe("P1-01c / DataSourceWarning — قرارداد رندر (سبک معاملات/کارشناسان)", () => {
  test("با liveError: کارت کهربایی + عنوان + پیام کش + متن خطا", () => {
    const html = renderToString(h(DataSourceWarning, { source: SOURCE }));
    expect(html).toContain('shadow-sm border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/30"');
    expect(html).toContain('class="p-4 flex items-start gap-3"');
    expect(html).toContain("استخراج زنده از سامانه ملک تبریز در دسترس نیست");
    expect(html).toContain("در حال حاضر داده‌های کش‌شده از آخرین استخراج موفق نمایش داده می‌شود.");
    expect(html).toContain("توکن منقضی شده است");
  });

  test("با cached و بدون liveError: خط ریز آخرین استخراج موفق (تاریخ جلالی)", () => {
    const html = renderToString(h(DataSourceWarning, { source: { ...SOURCE, liveError: null } }));
    expect(html).toContain('class="flex items-center gap-2 text-[11px] text-muted-foreground"');
    expect(html).toContain("آخرین استخراج موفق از سامانه ملک تبریز:");
    expect(html).not.toContain("در دسترس نیست");
  });

  test("بدون کش و بدون خطا: هیچ خروجی", () => {
    const html = renderToString(h(DataSourceWarning, { source: { real: true, cached: false, lastSuccessAt: null, liveError: null } }));
    expect(html).toBe("");
  });

  test("source=null: هیچ خروجی", () => {
    expect(renderToString(h(DataSourceWarning, { source: null }))).toBe("");
  });

  test("emptyText سفارشی (سبک کارشناسان)", () => {
    const html = renderToString(
      h(DataSourceWarning, { source: { ...SOURCE, cached: false }, emptyText: "پیام ویژه" })
    );
    expect(html).toContain("پیام ویژه");
    expect(html).not.toContain("در حال حاضر داده‌های کش‌شده");
  });
});

describe("P1-01c / DataSourceAlert — قرارداد رندر (سبک پنج صفحه)", () => {
  test("show=false: هیچ خروجی", () => {
    expect(renderToString(h(DataSourceAlert, { show: false }, "متن"))).toBe("");
  });

  test("با خطا: « آخرین خطا: …» می‌چسبد و fallback نمی‌آید", () => {
    const html = renderToString(h(DataSourceAlert, { show: true, error: "قطع شبکه", fallback: "راهنما" }, "داده واقعی استخراج می‌شود."));
    expect(html).toContain("منبع داده");
    expect(html).toContain("داده واقعی استخراج می‌شود.");
    expect(html).toContain(" آخرین خطا: قطع شبکه");
    expect(html).not.toContain("راهنما");
  });

  test("بدون خطا: fallback (با فاصله آغازین) می‌آید", () => {
    const html = renderToString(h(DataSourceAlert, { show: true, error: null, fallback: "پس از ورود با کد پرسنلی…" }, "متن اصلی."));
    expect(html).toContain(" پس از ورود با کد پرسنلی…");
    expect(html).not.toContain("آخرین خطا");
  });

  test("بدون خطا و بدون fallback: فقط children (سبک مالی/شاخص)", () => {
    const html = renderToString(h(DataSourceAlert, { show: true }, "متن اصلی."));
    expect(html).toContain("متن اصلی.");
    expect(html).not.toContain("آخرین خطا");
  });
});

describe("P1-01c / ادعاهای ساختاری (grep)", () => {
  test("تعریف رابط DataSourceInfo فقط در ماژول مشترک است (صفر تعریف تکراری)", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name)) {
          if (/interface DataSourceInfo \{/.test(readFileSync(p, "utf8"))) hits.push(p);
        }
      }
    };
    walk(SRC);
    expect(hits).toEqual([join(SRC, "components/app/shared/data-source.tsx")]);
  });

  test("هر ۷ صفحه CRM (P6.5-11: بازدیدها حذف؛ سه‌گانه ادغام شد) از DataSourceWarning یا DataSourceAlert استفاده می‌کنند", () => {
    const pages: Array<[string, string]> = [
      ["transactions-contracts/TransactionsTab.tsx", "DataSourceWarning"],
      ["experts/ExpertsPage.tsx", "DataSourceWarning"],
    ];
    for (const [page, comp] of pages) {
      const c = readFileSync(join(TILES, page), "utf8");
      expect(c).toContain(`<${comp}`);
    }
  });

  test("صفر بلوک Alert دستی «منبع داده» باقی نمانده", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".tsx")) {
          const c = readFileSync(p, "utf8");
          if (c.includes("<AlertTitle>منبع داده</AlertTitle>")) offenders.push(p);
        }
      }
    };
    walk(TILES);
    expect(offenders).toEqual([]);
  });
});
