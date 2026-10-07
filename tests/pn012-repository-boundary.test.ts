/**
 * PN-012 · BLOCK 1 — تست‌های مرز Repository (بند ۱.۳)
 * ------------------------------------------------------------------------
 * «audit-repository-boundary.sh --strict PASS · صفر db.* در src/app/api/**»
 * به‌علاوهٔ رفتار صحیح لایهٔ سرویس تازه (src/lib/services/).
 */

import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const API_DIR = "src/app/api";
const SERVICES_DIR = "src/lib/services";

function collectRoutes(dir: string, prefix: string[] = []): string[][] {
  const out: string[][] = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...collectRoutes(full, [...prefix, entry]));
    else if (entry === "route.ts") out.push(prefix);
  }
  return out;
}

const routes = collectRoutes(API_DIR);

describe("PN-012 BLOCK 1 — مرز Repository (بند ۱.۳)", () => {
  test("۱-م-۱ صفر فراخوانی db.* در همهٔ روت‌ها (هدف ۳۱→۰ تسویه شد)", () => {
    const offenders: Array<{ route: string; hits: number }> = [];
    for (const seg of routes) {
      if (seg[0] === "v1") continue; // آینه — تست ۳ جداگانه
      const src = readFileSync(path.join(API_DIR, ...seg, "route.ts"), "utf8");
      const hits = (src.match(/\bdb\.[a-zA-Z]/g) ?? []).length;
      if (hits > 0) offenders.push({ route: seg.join("/"), hits });
    }
    expect(offenders).toEqual([]);
  });

  test("۱-م-۲ آینه‌های v1 نیز صفر db.* دارند", () => {
    for (const seg of routes) {
      if (seg[0] !== "v1") continue;
      const src = readFileSync(path.join(API_DIR, ...seg, "route.ts"), "utf8");
      expect((src.match(/\bdb\.[a-zA-Z]/g) ?? []).length).toBe(0);
    }
  });

  test("۱-م-۳ لایهٔ سرویس تازه موجود است: coverage · market-index · crm-import · master-auth", () => {
    for (const f of ["coverage.ts", "market-index.ts", "crm-import.ts", "master-auth.ts"]) {
      expect(existsSync(path.join(SERVICES_DIR, f))).toBe(true);
    }
  });

  test("۱-م-۴ سرویس coverage: قرارداد گزارش چهار کاشی (M1-M4)", async () => {
    const src = readFileSync(path.join(SERVICES_DIR, "coverage.ts"), "utf8");
    expect(src).toContain("getCoverageReport");
    for (const t of ["M1 آگهی ملک تبریز", "M2 درخواست ملک تبریز", "M3 معاملات ملک تبریز", "M4 کارشناسان ملک تبریز"]) {
      expect(src).toContain(t);
    }
    expect(src).toContain("incompleteRecords");
  });

  test("۱-م-۵ سرویس market-index: پنج مؤلفهٔ شاخص", () => {
    const src = readFileSync(path.join(SERVICES_DIR, "market-index.ts"), "utf8");
    expect(src).toContain("monthlyTrend");
    expect(src).toContain("byArea");
    expect(src).toContain("byType");
    expect(src).toContain("txVsListing");
    expect(src).toContain("volume");
  });

  test("۱-م-۶ سرویس crm-import: چهار موجودیت + سقف‌ها", () => {
    const src = readFileSync(path.join(SERVICES_DIR, "crm-import.ts"), "utf8");
    for (const e of ['"listings"', '"requests"', '"transactions"', '"experts"']) {
      expect(src).toContain(e);
    }
    expect(src).toContain("MAX_ROWS = 25_000");
  });

  test("۱-م-۷ سرویس crm-import: معناشناسی سلول (ارقام فارسی/جلالی/بولی)", async () => {
    const mod = await import("../src/lib/services/crm-import");
    expect(mod.cellText({ text: "  hello " })).toBe("hello");
    expect(mod.digitsOnly("۰۹۱۲۳۴۵۶۷")).toBe("091234567");
    expect(mod.cellNum("۱٬۲۵۰")).toBe(1250);
    expect(mod.cellBool("بله")).toBe(true);
    expect(mod.cellBool("خیر")).toBe(false);
    expect(mod.cellDate("1404/05/03")).toBeInstanceOf(Date);
  });

  test("۱-م-۸ سرویس master-auth: هش کد مستر از DB خوانده می‌شود (نه در روت)", async () => {
    const src = readFileSync(path.join(SERVICES_DIR, "master-auth.ts"), "utf8");
    expect(src).toContain("getMasterCodeHash");
    expect(src).toContain("getMasterCodeState");
    expect(src).toContain("appMeta.findUnique");
  });

  test("۱-م-۹ سرویس master-auth: getMasterCodeState — کد تستی عمومی هرگز env-معتبر نیست", async () => {
    const { getMasterCodeState, isEnvCodeValid } = await import("../src/lib/services/master-auth");
    expect(isEnvCodeValid("00000000")).toBe(false); // کد تستی عمومی — قانون SEC-1
    const state = await getMasterCodeState("00000000");
    // test.db هش کد مستر ندارد (fixture) → منبع تشخیص none — رفتار صحیح
    expect(["database", "none"]).toContain(state.masterAuth);
    expect(state.dbHash).toBeNull();
  });

  test("۱-م-۱۰ روت‌های لاغر: coverage/market-index فقط Auth+Service+Response", () => {
    const cov = readFileSync(path.join(API_DIR, "coverage", "route.ts"), "utf8");
    expect(cov).toContain("requireSessionAsync");
    expect(cov).toContain("getCoverageReport");
    expect(cov.length).toBeLessThan(1500); // لاغرِ واقعی
    const mi = readFileSync(path.join(API_DIR, "market-index", "route.ts"), "utf8");
    expect(mi).toContain("getMarketIndex");
    expect(mi.length).toBeLessThan(1500);
  });

  test("۱-م-۱۱ روت ایمپورت: اعتبارسنجی فایل (حجم/امضا) در روت، منطق در سرویس", () => {
    const imp = readFileSync(path.join(API_DIR, "crm", "import", "[entity]", "route.ts"), "utf8");
    expect(imp).toContain("MAX_BYTES");
    expect(imp).toContain("0x50"); // امضای ZIP (xlsx)
    expect(imp).toContain("readSheet");
    expect(imp).toContain("runImport");
  });

  test("۱-م-۱۲ روت health: بدون db.* اما با دیده‌بان همانی کد مستر", () => {
    const h = readFileSync(path.join(API_DIR, "health", "route.ts"), "utf8");
    expect(h).toContain("getMasterCodeState");
    expect(h).toContain("masterLayersConsistent");
    expect((h.match(/\bdb\.[a-zA-Z]/g) ?? []).length).toBe(0);
  });

  test("۱-م-۱۳ روت master-login: fallback دیتابیس از سرویس می‌خواند", () => {
    const ml = readFileSync(path.join(API_DIR, "auth", "master-login", "route.ts"), "utf8");
    expect(ml).toContain("getMasterCodeHash");
    expect((ml.match(/\bdb\.[a-zA-Z]/g) ?? []).length).toBe(0);
  });

  test("۱-م-۱۴ روت export: شمارش متقاطع از سرویس expertListingCounts", () => {
    const ex = readFileSync(path.join(API_DIR, "crm", "export", "[entity]", "route.ts"), "utf8");
    expect(ex).toContain("expertListingCounts");
    expect((ex.match(/\bdb\.[a-zA-Z]/g) ?? []).length).toBe(0);
  });

  test("۱-م-۱۵ رفتار سرویس پوشش با DB تست: خروجی واقعی چهار کاشی", async () => {
    const { getCoverageReport } = await import("../src/lib/services/coverage");
    const report = await getCoverageReport();
    expect(report.ok).toBe(true);
    expect(report.tier).toBeGreaterThanOrEqual(1);
    expect(Object.keys(report.tiles)).toEqual(["m1", "m2", "m3", "m4"]);
    for (const t of Object.values(report.tiles)) {
      expect(t.total).toBeGreaterThanOrEqual(0);
      expect(t.columns.length).toBeGreaterThan(5);
      expect(t.columns[0]).toHaveProperty("fillPath");
    }
    expect(report.incompleteRecords).toHaveProperty("m1");
    expect(report.incompleteRecords).toHaveProperty("m2");
  });
});
