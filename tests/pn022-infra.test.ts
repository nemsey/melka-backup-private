/**
 * pn022-infra.test.ts — PN-022-A: زیرساخت — مهاجرت PG · Feature Factory · گاردها
 * =============================================================================
 * پوشش: گواه مهاجرت ۵۹مدلی · بنچمارک هشت‌سنجه‌ای · اسکیمای دوقلو · مولد کاشی ·
 * سه گارد تازه · CI هشت‌گامی با ۲۱ گارد · شواهد جلسه
 */

import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/* ═══════ ۱) مهاجرت PostgreSQL ═══════ */
describe("PN-022-A/مرحلهٔ۳ · مهاجرت PostgreSQL (فقط تست)", () => {
  test("پ-۱) اسکیمای دوقلو موجود و با provider=postgresql", () => {
    const src = readFileSync("prisma/schema.postgres.prisma", "utf8");
    expect(src).toContain('provider = "postgresql"');
    expect(src).toContain('env("DATABASE_PG_TEST_URL")');
    // هرگز همان env تولید را نمی‌خواند
    expect(src).not.toContain('env("DATABASE_URL")');
  });

  test("پ-۲) توازن مدل‌ها: هر مدل در هر دو اسکیما (۷۰ — ن۰۵۵: −۱ OtpRateLimit · PN-025: +۳ · PN-031: +۲ رلهٔ موبایل · ن۰۵۷: +۱ RelayJob · ن۰۶۳: +۱ GlmProbe)", () => {
    const models = (p: string) => [...readFileSync(p, "utf8").matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]);
    const sq = models("prisma/schema.prisma");
    const pg = models("prisma/schema.postgres.prisma");
    expect(sq.length).toBe(70); // 59 پایه + علّی PN-023-A + 3 حافظه PN-025 + 1 درس‌های رد PN-028 + 2 رلهٔ PN-031 + 1 RelayJob ن۰۵۷ + 1 GlmProbe ن۰۶۳ − 1 OtpRateLimit (ن۰۵۵ · صفر-محدودیت)
    expect(new Set(pg)).toEqual(new Set(sq));
  });

  test("پ-۳) گواه مهاجرت: ۵۹ مدل · صفر اختلاف · ۳۵۵k ردیف", () => {
    const w = JSON.parse(readFileSync("download/pn022/pg/postgres-migration.json", "utf8"));
    expect(w.totals.models).toBe(59);
    expect(w.totals.ok).toBe(59);
    expect(w.totals.mismatch).toBe(0);
    expect(w.totals.totalRows).toBeGreaterThan(350000);
    expect(w.guarantees.productionUntouched).toContain("SQLite");
  });

  test("پ-۴) گواه مهاجرت: هر مدل سه شماره دارد و همه برابر", () => {
    const w = JSON.parse(readFileSync("download/pn022/pg/postgres-migration.json", "utf8"));
    for (const m of w.perModel) {
      expect(m.diff).toBe(0);
      expect(m.status).toBe("OK");
    }
  });

  test("پ-۵) بنچمارک: هشت سنجه با اعداد خام دو موتور", () => {
    const b = JSON.parse(readFileSync("download/pn022/pg/postgres-benchmark.json", "utf8"));
    expect(b.results).toHaveLength(8);
    for (const r of b.results) {
      expect(r.sqliteMs).toBeGreaterThanOrEqual(0);
      expect(r.pgMs).toBeGreaterThanOrEqual(0);
      expect(r.sqliteRuns).toHaveLength(3); // میانهٔ ۳ اجرا
      expect(r.pgRuns).toHaveLength(3);
    }
  });

  test("پ-۶) صداقت بنچمارک: یادداشت هدف (هم‌زمانی نه تک‌کوئری) مستند است", () => {
    const b = JSON.parse(readFileSync("download/pn022/pg/postgres-benchmark.json", "utf8"));
    expect(b.verdict.honestNote).toContain("هم‌زمانی");
  });

  test("پ-۷) خط لولهٔ مهاجرت: سه ابزار موجود", () => {
    expect(existsSync("scripts/pg-migrate/pg-lifecycle.ts")).toBe(true);
    expect(existsSync("scripts/pg-migrate/pg-migrate.ts")).toBe(true);
    expect(existsSync("scripts/pg-migrate/pg-benchmark.ts")).toBe(true);
  });

  test("پ-۸) نقاط موتور-ویژه مهر خورده (سوییچ PN-022-C ردیابی‌پذیر)", () => {
    const sites: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory() && !["node_modules", ".next"].includes(e.name)) walk(join(dir, e.name));
        else if (e.name.endsWith(".ts")) {
          const lines = readFileSync(join(dir, e.name), "utf8").split("\n");
          lines.forEach((ln, i) => {
            if (ln.includes("$queryRawUnsafe") || ln.includes("$executeRawUnsafe")) {
              if (ln.includes("PRAGMA") || ln.includes("VACUUM")) sites.push(`${join(dir, e.name)}:${i + 1}`);
            }
          });
        }
      }
    };
    walk("src");
    expect(sites.length).toBeGreaterThanOrEqual(4); // quick_check · integrity · VACUUM×2
    for (const site of sites) {
      const file = site.split(":")[0]!;
      const line = Number(site.split(":")[1]);
      const window = readFileSync(file, "utf8").split("\n").slice(Math.max(0, line - 4), line).join("\n");
      expect(window).toContain("ENGINE: sqlite-only");
    }
  });
});

/* ═══════ ۲) Feature Factory ═══════ */
describe("PN-022-A/مرحلهٔ۴ · Feature Factory", () => {
  test("ف-۱) اعتبارسنجی نام: kebab-case معتبر؛ نام‌های نامعتبر رد", async () => {
    const { isValidTileName } = await import("../scripts/feature-factory/tile-new");
    expect(isValidTileName("contracts")).toBe(true);
    expect(isValidTileName("market-index")).toBe(true);
    expect(isValidTileName("Bad")).toBe(false);
    expect(isValidTileName("x")).toBe(false);
    expect(isValidTileName("with_underscore")).toBe(false);
    expect(isValidTileName("1abc")).toBe(false);
    expect(isValidTileName("")).toBe(false);
  });

  test("ف-۲) kebabToPascal: contracts → Contracts · multi-word → MultiWord", async () => {
    const { kebabToPascal } = await import("../scripts/feature-factory/tile-new");
    expect(kebabToPascal("contracts")).toBe("Contracts");
    expect(kebabToPascal("market-index")).toBe("MarketIndex");
  });

  test("ف-۳) generateTile: شش فایل تولید می‌کند در مقصد tmp", async () => {
    const { generateTile } = await import("../scripts/feature-factory/tile-new");
    const tmp = mkdtempSync(join(tmpdir(), "pn022-factory-"));
    const r = generateTile({ name: "test-tile", targetRoot: tmp });
    expect(r.ok).toBe(true);
    expect(r.files).toHaveLength(6);
    expect(r.register).toBe(false); // اسکلت هرگز ثبت نمی‌شود
    const rels = r.files.map((f) => f.path);
    expect(rels).toContain("src/core/tiles/tiles/test-tile/index.ts");
    expect(rels).toContain("src/core/agent/test-tile-agent.ts");
    expect(rels).toContain("src/core/repositories/interfaces/test-tile.repository.ts");
    expect(rels).toContain("src/app/api/test-tile/route.ts");
    expect(rels).toContain("tests/pn022-tile-test-tile.test.ts");
    rmSync(tmp, { recursive: true, force: true });
  });

  test("ف-۴) تولید: بدنه‌های منطق TILE_SKELETON (fail-loud) و بدون نشت رجیستری", async () => {
    const { generateTile } = await import("../scripts/feature-factory/tile-new");
    const tmp = mkdtempSync(join(tmpdir(), "pn022-factory-"));
    generateTile({ name: "loud-tile", targetRoot: tmp });
    const agent = readFileSync(join(tmp, "src/core/agent/loud-tile-agent.ts"), "utf8");
    const repo = readFileSync(join(tmp, "src/core/repositories/interfaces/loud-tile.repository.ts"), "utf8");
    const route = readFileSync(join(tmp, "src/app/api/loud-tile/route.ts"), "utf8");
    const tile = readFileSync(join(tmp, "src/core/tiles/tiles/loud-tile/index.ts"), "utf8");
    expect(agent).toContain("TILE_SKELETON");
    expect(repo).toContain("TILE_SKELETON");
    expect(route).toContain("TILE_SKELETON");
    expect(tile).not.toContain("tileRegistry.register");
    rmSync(tmp, { recursive: true, force: true });
  });

  test("ف-۵) صفر overwrite: نام موجود = خطای صریح", async () => {
    const { generateTile } = await import("../scripts/feature-factory/tile-new");
    const tmp = mkdtempSync(join(tmpdir(), "pn022-factory-"));
    generateTile({ name: "dup-tile", targetRoot: tmp });
    expect(() => generateTile({ name: "dup-tile", targetRoot: tmp })).toThrow("صفر overwrite");
    rmSync(tmp, { recursive: true, force: true });
  });

  test("ف-۶) نام نامعتبر = خطای اعتبارسنجی فارسی", async () => {
    const { generateTile } = await import("../scripts/feature-factory/tile-new");
    const tmp = mkdtempSync(join(tmpdir(), "pn022-factory-"));
    expect(() => generateTile({ name: "InvalidName", targetRoot: tmp })).toThrow("kebab-case");
    rmSync(tmp, { recursive: true, force: true });
  });

  test("ف-۷) --register: ثبت رجیستری فقط با پرچم صریح", async () => {
    const { generateTile } = await import("../scripts/feature-factory/tile-new");
    const tmp = mkdtempSync(join(tmpdir(), "pn022-factory-"));
    const r = generateTile({ name: "reg-tile", targetRoot: tmp, register: true });
    expect(r.register).toBe(true);
    const tile = readFileSync(join(tmp, "src/core/tiles/tiles/reg-tile/index.ts"), "utf8");
    expect(tile).toContain("tileRegistry.register");
    rmSync(tmp, { recursive: true, force: true });
  });

  test("ف-۸) گواه رسمی feature-factory.json: شش فایل · ≥۱۲۰ خط", () => {
    const w = JSON.parse(readFileSync("download/pn022/feature-factory.json", "utf8"));
    expect(w.ok).toBe(true);
    expect(w.name).toBe("contracts");
    expect(w.files).toHaveLength(6);
    expect(w.totalLines).toBeGreaterThanOrEqual(120);
    expect(w.guarantees.noRegistryLeak).toBeTruthy();
  });

  test("ف-۹) دستور tile:new در package.json", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    expect(pkg.scripts["tile:new"]).toContain("tile-new.ts");
  });
});

/* ═══════ ۳) سه گارد تازه ═══════ */
describe("PN-022-A/مرحلهٔ۵ · سه گارد تازه", () => {
  test("گ-۱) گارد postgres-compat: گزارش PASS با نقاط موتور مهر‌خورده", () => {
    const r = JSON.parse(readFileSync("download/pn022/guards-postgres-compat.json", "utf8"));
    expect(r.verdict).toBe("PASS");
    expect(r.engineSites.length).toBeGreaterThanOrEqual(4);
    expect(r.engineSites.every((s: { marked: boolean }) => s.marked)).toBe(true);
  });

  test("گ-۲) گارد tile-contract: همهٔ کاشی‌های موجود با قرارداد سالم", () => {
    const r = JSON.parse(readFileSync("download/pn022/guards-tile-contract.json", "utf8"));
    expect(r.verdict).toBe("PASS");
    expect(r.tiles.length).toBeGreaterThanOrEqual(11); // ن۰۶۳ (PN-038/فاز ۲): هوم یک‌پارچه — M6/M7/ظرف/دو کاشی کهنه حذف → ۱۱
  });

  test("گ-۳) گارد feature-factory: مولد سالم (تولید آزمایشی + صفر overwrite + رد نام بد)", () => {
    const r = JSON.parse(readFileSync("download/pn022/guards-feature-factory.json", "utf8"));
    expect(r.verdict).toBe("PASS");
  });

  test("گ-۴) CI: سه گام تازه ۵-ر/ش/ص در ci.sh ثبت شده", () => {
    const ci = readFileSync("scripts/ci.sh", "utf8");
    expect(ci).toContain("گام ۵-ر: postgres-compat");
    expect(ci).toContain("گام ۵-ش: tile-contract");
    expect(ci).toContain("گام ۵-ص: feature-factory");
  });

  test("گ-۵) CI: مجموع گاردها در گام ۵ (۱۸ پایه + ۳ ن۲۲ + ۲ ن۲۳-الف + ۴ ن۰۲۴ + ۳ ن۰۲۵)", () => {
    const ci = readFileSync("scripts/ci.sh", "utf8");
    // گام ۵ تا آغاز گام ۶ — گاردهای ساختاری (chunk-integrity در گام ۸ جدا است)
    const step5 = ci.slice(ci.indexOf("۵) Audit باغ"), ci.indexOf("── ۶) Perf Budget"));
    const count = (step5.match(/bash scripts\/audit-[a-z-]+\.sh/g) ?? []).length;
    expect(count).toBe(30); // PN-025: ۲۷ + memory-lifecycle + unified-graph + decision-lock
  });

  test("گ-۶) اسکریپت‌های گارد اجرایی هستند", () => {
    for (const g of ["audit-postgres-compat.sh", "audit-tile-contract.sh", "audit-feature-factory.sh"]) {
      expect(existsSync(join("scripts", g))).toBe(true);
    }
  });
});

/* ═══════ ۴) شواهد جلسه ═══════ */
describe("PN-022-A · شواهد جلسه", () => {
  test("ش-۱) lock-form: ورود ۴/۴ + ۶/۶ مجاز", () => {
    const w = JSON.parse(readFileSync("download/pn022/lock-form.json", "utf8"));
    expect(w.entry).toContain("۴/۴");
    expect(w.phase0_identity.actualHeadAtEntry).toBe("6f6242b");
    expect(w.phase0_identity.chainIndex).toBe(21);
  });

  test("ش-۲) diagnosis-resolved: هر ۹ مورد با resolved=true و نمرهٔ ۱۰۰", () => {
    const w = JSON.parse(readFileSync("download/pn022/step1/diagnosis-resolved.json", "utf8"));
    for (const key of ["I3", "I4", "I5", "I6", "I7", "I8", "I9"]) {
      expect(w.fixes[key]?.resolved).toBe(true);
    }
    expect(w.i10.resolved).toBe(true);
    expect(w.finalDiagnosis.healthScoreAfter).toBe(100);
    expect(w.finalDiagnosis.remainingAlerts).toHaveLength(0);
  });

  test("ش-۳) diagnosis-resolved: بrier قهرمان ۰٫۲۲۵۶ روی ۷۷۲ جفت (عین PN-018)", () => {
    const w = JSON.parse(readFileSync("download/pn022/step1/diagnosis-resolved.json", "utf8"));
    expect(w.fixes.I4.brierScore).toBe(0.2256);
    expect(w.fixes.I4.sampleSize).toBe(772);
  });

  test("ش-۴) diagnosis-resolved: رانش تازه هر سه < ۰٫۰۵", () => {
    const w = JSON.parse(readFileSync("download/pn022/step1/diagnosis-resolved.json", "utf8"));
    for (const rep of w.fixes.I5.freshCycle.reports) {
      expect(rep.magnitude).toBeLessThan(0.05);
    }
    expect(w.fixes.I5.freshCycle.pairsBaseline).toBe(386);
  });

  test("ش-۵) analysis امنیتی I7: حکم خطای کلاینت + ترمیم ریشهٔ نقش", () => {
    const w = JSON.parse(readFileSync("download/pn022/step1/diagnosis-resolved.json", "utf8"));
    expect(w.fixes.I7.analysis.verdict).toContain("خطای سمت کلاینت");
    expect(w.fixes.I7.analysis.rootCauseFix).toContain("رجیستری");
    expect(w.fixes.I7.adjudicationAction).toBe("ACCESS_DENIED_ADJUDICATED");
  });

  test("ش-۶) تحلیل ریشه‌ای I3: یتیمی مستقل از سن (پارادوکس شکاف سنک رد شده)", () => {
    const w = JSON.parse(readFileSync("download/pn022/step1/diagnosis-resolved.json", "utf8"));
    const ages = w.fixes.I3.ageIndependentOrphanProof;
    const pcts = Object.values(ages).map((a: unknown) => (a as { pct: number }).pct);
    expect(pcts.length).toBe(4);
    const spread = Math.max(...pcts) - Math.min(...pcts);
    expect(spread).toBeLessThanOrEqual(10); // ~ثابت در ۳۰/۹۰/۱۸۰/۳۶۵ روز
    expect(w.fixes.I3.sourceEnrichmentCoverage.coveragePct).toBe(100);
  });
});
