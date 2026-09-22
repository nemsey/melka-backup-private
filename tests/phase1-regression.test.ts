/**
 * تست‌های PHASE 1 — P1-06: گیت پایانی فاز (Phase Gate)
 * ------------------------------------------------------
 * قفل رفتار PHASE 1 تا فازهای بعدی — هر رگرسیون روی دستاوردهای این فاز
 * (اجزای مشترک، مرز لایه‌ای، منطق دامنه، تایپ‌چک، کد مرده) اینجا قرمز می‌شود.
 */

import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = "/home/z/my-project";
const TILES = join(ROOT, "src/core/tiles/tiles");
const SHARED = join(ROOT, "src/components/app/shared");
const CRM_PAGES = [
  "transactions-contracts/TransactionsTab.tsx",
  "experts/ExpertsPage.tsx",
  "supply-demand/SupplyDemandPage.tsx",
  "price-index/PriceIndexPage.tsx",
];

describe("P1-06 / گیت فاز — اجزای مشترک یگانه", () => {
  test("هر چهار جزء مشترک در shared/ تعریف شده‌اند", () => {
    expect(existsSync(join(SHARED, "kpi-card.tsx"))).toBe(true);
    expect(existsSync(join(SHARED, "step-report-list.tsx"))).toBe(true);
    expect(existsSync(join(SHARED, "data-source.tsx"))).toBe(true);
    expect(existsSync(join(SHARED, "use-tile-data.tsx") )).toBe(false); // ts نه tsx
    expect(existsSync(join(SHARED, "use-tile-data.ts"))).toBe(true);
    expect(existsSync(join(SHARED, "index.ts"))).toBe(true);
  });

  test("صفر تعریف تکراری هر یک از اجزای مشترک در کل src", () => {
    const defs = ["export function KpiCard", "export function StepReportList", "export function DataSourceWarning", "export function DataSourceAlert", "export function useTileData"];
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(ts|tsx)$/.test(e.name)) {
          const c = readFileSync(p, "utf8");
          for (const d of defs) if (c.includes(d)) hits.push(`${p}: ${d}`);
        }
      }
    };
    walk(join(ROOT, "src"));
    expect(hits.length).toBe(5); // KpiCard + StepReportList + DataSourceWarning + DataSourceAlert + useTileData (همه در shared/)
    expect(hits.every((h) => h.startsWith(SHARED))).toBe(true);
  });
});

describe("P1-06 / گیت فاز — صفحات CRM", () => {
  test("هیچ صفحه CRM بویلرپلیت دستی بارگذاری ندارد (setLoading)", () => {
    for (const p of CRM_PAGES) {
      expect(readFileSync(join(TILES, p), "utf8")).not.toContain("setLoading");
    }
  });

  test("هیچ صفحه CRM رابط محلی DataSourceInfo تعریف نمی‌کند", () => {
    for (const p of CRM_PAGES) {
      expect(readFileSync(join(TILES, p), "utf8")).not.toContain("interface DataSourceInfo");
    }
  });
});

describe("P1-06 / گیت فاز — تایپ‌چک و build", () => {
  test("ignoreBuildErrors خاموش است (next.config.ts)", () => {
    const c = readFileSync(join(ROOT, "next.config.ts"), "utf8");
    expect(c).toContain("ignoreBuildErrors: false");
    expect(c).not.toContain("ignoreBuildErrors: true");
  });

  test("tsc هیچ استثنایی برای src نمی‌خواهد (بدون ts-ignore/ts-expect-error جدید در ناحیه UI)", () => {
    // شمارش @ts-ignore/@ts-expect-error در ناحیه UI — باید صفر بماند
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith(".tsx")) {
          const c = readFileSync(p, "utf8");
          if (/@ts-ignore|@ts-expect-error/.test(c)) offenders.push(p);
        }
      }
    };
    walk(join(ROOT, "src/components/app"));
    walk(join(ROOT, "src/core/tiles"));
    expect(offenders).toEqual([]);
  });
});

describe("P1-06 / گیت فاز — کد مرده حذف‌شده برنمی‌گردد", () => {
  test("روت ریشه /api (scaffold) وجود ندارد", () => {
    expect(existsSync(join(ROOT, "src/app/api/route.ts"))).toBe(false);
  });

  test("توابع مرده حذف‌شده در کدبیس نیستند (خارج از همین فایل تست)", () => {
    const gone = ["getKenarKey", "divarSecretEnvKey", "readDivarPhoneToken"];
    const SELF = __filename;
    const walk = (dir: string): string[] => {
      const found: string[] = [];
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) found.push(...walk(p));
        else if (/\.(ts|tsx)$/.test(e.name)) {
          if (p === SELF) continue; // خود این فایل تست نام‌ها را ذکر می‌کند
          const c = readFileSync(p, "utf8");
          for (const g of gone) if (c.includes(g)) found.push(`${p}: ${g}`);
        }
      }
      return found;
    };
    expect(walk(join(ROOT, "src"))).toEqual([]);
    expect(walk(join(ROOT, "tests"))).toEqual([]);
  });
});

describe("P1-06 / گیت فاز — منطق دامنه", () => {
  test("analyzers توابع دامنه DTO را صادر می‌کند", async () => {
    const mod = await import("@/core/agent/analyzers");
    expect(typeof mod.monthlyCounts).toBe("function");
    expect(typeof mod.demandLevel).toBe("function");
    expect(typeof mod.marketTilt).toBe("function");
    expect(typeof mod.cooperationDegree).toBe("function");
    expect(typeof mod.areaTrendMatrix).toBe("function");
    expect(typeof mod.parseFaAmount).toBe("function");
  });
});
