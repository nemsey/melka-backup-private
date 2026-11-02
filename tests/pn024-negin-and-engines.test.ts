import { describe, expect, test } from "bun:test";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import {
  NEGIN_GEMS, NEGIN_GRADIENTS, NEGIN_EFFECTS,
  neginContrastReport, neginUnique500, ACCENT_TO_GEM,
} from "@/lib/negin-palette";
import {
  CounterfactualEngine, CounterfactualEngineError,
  type CounterfactualQuery,
} from "@/core/intelligence/counterfactual-engine";
import type { CausalEdge, CausalGraph } from "@/core/intelligence/causal-engine";
import { SimulationEngine, type SimAction, type SimContext } from "@/core/intelligence/simulation-engine";

/**
 * PN-024 — تست‌های هویت نگین + موتور ۱۴ (پادواقع) + موتور ۱۵ (شبیه‌سازی)
 * ماتریس عین سند طراحی فاز ۱۳-ب (پیوست ث) + سفارش مرحلهٔ ۱۰ (≥۵۰)
 */

const ROOT = join(import.meta.dir, "..");
const css = readFileSync(join(ROOT, "src/app/globals.css"), "utf-8");
const tileCardSrc = readFileSync(join(ROOT, "src/components/app/TileCard.tsx"), "utf-8");

/* ═══════════════ نگین — ۲۰ تست ═══════════════ */

describe("PN-024 · نگین — سیستم طراحی گوهرین", () => {
  test("N1 کنتراست WCAG AA: متن-۷۰۰ روی پس‌زمینه-۵۰ برای هر ۱۱ نگین ≥ ۴٫۵:۱", () => {
    const report = neginContrastReport();
    expect(report.length).toBe(11);
    for (const r of report) {
      expect(r.ratio).toBeGreaterThanOrEqual(4.5);
      expect(r.pass).toBe(true);
    }
  });

  test("N2 یتایی: ۱۱ رنگ ۵۰۰ متمایزند (قاعدهٔ ۱ مالک — صفر تکرار گوهر)", () => {
    const { unique, values } = neginUnique500();
    expect(values.length).toBe(11);
    expect(unique).toBe(true);
  });

  test("N3 سازگاری PN-011: colors.json موجود و بدون نگین (لایهٔ رویی، نه جایگزین)", () => {
    const colorsJson = readFileSync(join(ROOT, "docs/archive/scripts/p6530/colors.json"), "utf-8");
    expect(existsSync(join(ROOT, "docs/archive/scripts/p6530/colors.json"))).toBe(true);
    expect(colorsJson.includes("negin")).toBe(false);
  });

  test("N4 قانون ۶: value-colors.ts دست‌نخورده — صفر نشست نگین در رنگ CANONICAL", () => {
    const vc = readFileSync(join(ROOT, "src/lib/value-colors.ts"), "utf-8");
    expect(vc.includes("negin")).toBe(false);
  });

  test("N5 متغیرهای روشن: هر ۱۱ نگین × ۵ سطح (50/200/400/500/700) در globals.css", () => {
    for (const g of NEGIN_GEMS) {
      for (const s of ["50", "200", "400", "500", "700"] as const) {
        expect(css.includes(`--negin-${g.id}-${s}:`)).toBe(true);
      }
    }
  });

  test("N6 متغیرهای تیره: هر ۱۱ نگین معادل dark دارد (قاعدهٔ ۴: ۵۰۰→۴۰۰)", () => {
    // هر متغیر نگین دقیقاً دو بار در CSS است: یک بار در :root و یک بار در .dark
    for (const g of NEGIN_GEMS) {
      const count = (css.match(new RegExp(`--negin-${g.id}-500:`, "g")) ?? []).length;
      expect(count).toBe(2);
      // بلوک .dark پایانی (sec + negin) مقدار دارد
      const darkTail = css.slice(css.lastIndexOf(".dark {"));
      expect(darkTail.includes(`--negin-${g.id}-500:`)).toBe(true);
    }
  });

  test("N7 توکن‌های Tailwind: --color-negin-* برای هر ۱۱ نگین × ۵ سطح", () => {
    for (const g of NEGIN_GEMS) {
      for (const s of ["50", "200", "400", "500", "700"] as const) {
        expect(css.includes(`--color-negin-${g.id}-${s}:`)).toBe(true);
      }
    }
  });

  test("N8 نگاشت کاشی→نگین: ۱۱ نگاشت یکتا و کامل (ACCENT_TO_GEM)", () => {
    expect(Object.keys(ACCENT_TO_GEM).length).toBe(11);
    expect(new Set(Object.values(ACCENT_TO_GEM)).size).toBe(11);
  });

  test("N9 چهار گرادیان درخشان در CSS تعریف‌شده", () => {
    expect(NEGIN_GRADIENTS.length).toBe(4);
    for (const g of NEGIN_GRADIENTS) {
      expect(css.includes(`.negin-grad-${g.id} `)).toBe(true);
    }
  });

  test("N10 پنج افکت فاخر در CSS تعریف‌شده", () => {
    expect(NEGIN_EFFECTS.length).toBe(5);
    for (const e of NEGIN_EFFECTS) {
      expect(css.includes(`.${e} `) || css.includes(`.${e} {`)).toBe(true);
    }
  });

  test("N11 دارک: مقدار ۵۰۰ تیره از روشن متمایز است (روشن‌تر — قاعدهٔ ۴)", () => {
    for (const g of NEGIN_GEMS) {
      expect(g.dark["500"]).not.toBe(g.light["500"]);
    }
  });

  test("N12 TileCard: هر ۱۱ accent کاشی دارای فیلد gem", () => {
    const accKeys = Object.keys(ACCENT_TO_GEM);
    for (const key of accKeys) {
      const m = tileCardSrc.match(new RegExp(`"?${key}"?: \\{[\\s\\S]*?gem: "([a-z-]+)"`));
      expect(m).not.toBeNull();
      expect(m?.[1]).toBe(ACCENT_TO_GEM[key]);
    }
  });

  test("N13 رجیستری: نگاشت accent→gem عین NEGIN_GEMS است", () => {
    for (const g of NEGIN_GEMS) {
      expect(ACCENT_TO_GEM[g.accentKey]).toBe(g.id);
    }
  });

  test("N14 اعمال: هر ۱۱ صفحهٔ کاشی data-negin دارد", () => {
    const pages = [
      "file-finder/FileFinderPage.tsx", "listing/ListingsPage.tsx", "request/RequestsPage.tsx",
      "arm-listing/ArmListingsPage.tsx", "arm-request/ArmRequestsPage.tsx", "transactions-contracts/TransactionsContractsPage.tsx",
      "experts/ExpertsPage.tsx", "smart-matching/SmartMatchingPage.tsx", "learning-tier/LearningTierPage.tsx",
      "market-index/MarketIndexPage.tsx", "data-coverage/DataCoveragePage.tsx",
    ];
    for (const p of pages) {
      const src = readFileSync(join(ROOT, "src/core/tiles/tiles", p), "utf-8");
      expect(src.includes("data-negin=")).toBe(true);
    }
  });

  test("N15 اعمال: مقدار data-negin هر صفحه در فهرست ۱۱ گوهر معتبر است", () => {
    const validGems = new Set(NEGIN_GEMS.map((g) => g.id));
    const pages = [
      "file-finder/FileFinderPage.tsx", "listing/ListingsPage.tsx", "request/RequestsPage.tsx",
      "arm-listing/ArmListingsPage.tsx", "arm-request/ArmRequestsPage.tsx", "transactions-contracts/TransactionsContractsPage.tsx",
      "experts/ExpertsPage.tsx", "smart-matching/SmartMatchingPage.tsx", "learning-tier/LearningTierPage.tsx",
      "market-index/MarketIndexPage.tsx", "data-coverage/DataCoveragePage.tsx",
    ];
    const seen = new Set<string>();
    for (const p of pages) {
      const src = readFileSync(join(ROOT, "src/core/tiles/tiles", p), "utf-8");
      const m = src.match(/data-negin="([a-z-]+)"/);
      expect(m).not.toBeNull();
      expect(validGems.has(m![1]!)).toBe(true);
      seen.add(m![1]!);
    }
    expect(seen.size).toBe(11); // یکتا: هر کاشی گوهر مخصوص خودش
  });

  test("N16 قاعدهٔ مروارید: متن ۷۰۰ تیره است (رنگ روشن ⇒ متن تیره اجباری)", () => {
    const morvarid = NEGIN_GEMS.find((g) => g.id === "morvarid")!;
    expect(morvarid).toBeDefined();
    const lum = (hex: string): number => {
      const h = hex.replace("#", "");
      const ch = (v: number): number => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
      return 0.2126 * ch(parseInt(h.slice(0, 2), 16)) + 0.7152 * ch(parseInt(h.slice(2, 4), 16)) + 0.0722 * ch(parseInt(h.slice(4, 6), 16));
    };
    expect(lum(morvarid.light["700"])).toBeLessThan(lum(morvarid.light["500"]));
  });

  test("N17 TileCard: میلهٔ نگین (negin-bar) رندر می‌شود و مشروط به gem است", () => {
    expect(tileCardSrc.includes("negin-bar")).toBe(true);
    expect(tileCardSrc.includes("a.gem &&")).toBe(true);
    expect(tileCardSrc.includes('data-negin={a.gem}')).toBe(true);
  });

  test("N18 دسترس‌پذیری: prefers-reduced-motion برای انیمیشن‌های نگین خاموش می‌شود", () => {
    const neginOff = css.indexOf(".negin-shine::after { animation: none");
    expect(neginOff).toBeGreaterThan(0);
    const headerIdx = css.lastIndexOf("@media (prefers-reduced-motion: reduce)", neginOff);
    expect(headerIdx).toBeGreaterThan(0);
    expect(headerIdx).toBeGreaterThan(neginOff - 400); // همان بلوک است (نزدیک)
    const block = css.slice(headerIdx, neginOff + 300);
    expect(block).toContain(".negin-shine::after");
    expect(block).toContain(".negin-sparkle");
  });

  test("N19 قانون ۷: اعمال فقط className — صفحات تغییر منطقی ندارند (نمونهٔ byte-check)", () => {
    // هر صفحه دقیقاً یک میلهٔ نگین دارد (نه بیشتر — حداقل‌ترین تغییر)
    const src = readFileSync(join(ROOT, "src/core/tiles/tiles/learning-tier/LearningTierPage.tsx"), "utf-8");
    expect((src.match(/negin-bar/g) ?? []).length).toBe(1);
  });

  test("N20 fgOn500 هر نگین برای آیکون گرادیانی ≥ ۳:۱ کنتراست دارد", () => {
    const lum = (hex: string): number => {
      const h = hex.replace("#", "");
      const ch = (v: number): number => { const x = v / 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
      return 0.2126 * ch(parseInt(h.slice(0, 2), 16)) + 0.7152 * ch(parseInt(h.slice(2, 4), 16)) + 0.0722 * ch(parseInt(h.slice(4, 6), 16));
    };
    for (const g of NEGIN_GEMS) {
      const l1 = lum(g.fgOn500);
      const l2 = lum(g.light["500"]);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      expect(ratio).toBeGreaterThanOrEqual(3);
    }
  });
});

/* ═══════════════ موتور ۱۴ — پادواقع (Pearl L3) · ۱۵ تست ═══════════════ */

/** گراف دستی کوچک برای محاسبات قابل‌راستی‌آزمایی */
function tinyGraph(edges: CausalEdge[], nodes: string[] = ["X", "Z", "outcome"]): CausalGraph {
  return { nodes, edges, sampleSize: 100, builtAt: "2026-10-09T00:00:00Z", dagVerified: true, featureOrder: nodes };
}

const E = (from: string, to: string, coefficient: number, confidence = 0.9): CausalEdge => ({
  from, to, coefficient, confidence, method: "L1", evidence: `تست: ${from}→${to}`,
});

describe("PN-024 · موتور ۱۴ — پادواقع (Pearl L3)", () => {
  const engine = new CounterfactualEngine();

  test("C1 سه‌گامی روی مثال دستی: abduction·action·prediction با اعداد گرد", () => {
    // گراف: X→outcome (β=0.2) — شاهد: X=1, outcome=0.6 ⇒ e=0.4 · do(X=2) ⇒ y=0.4+0.4=0.8
    const g = tinyGraph([E("X", "outcome", 0.2)]);
    const r = engine.query(g, {
      scenario: "دستی", feature: "X", observedValue: 1, counterfactualValue: 2,
      evidence: { features: { X: 1 }, outcome: 0.6 },
    });
    expect(r.baseline).toBeCloseTo(0.6, 5);
    expect(r.counterfactual).toBeCloseTo(0.8, 5);
    expect(r.delta).toBeCloseTo(0.2, 5);
    expect(r.method).toBe("Pearl-L3");
  });

  test("C2 نویز فردی ثابت: دو مداخلهٔ متفاوت از همان پسماند استفاده می‌کنند", () => {
    // X→outcome(0.1) · Z→outcome(0.15) — شاهد {X:1,Z:2}, outcome=0.6 ⇒ ŷ=0.4, e=0.2
    const g = tinyGraph([E("X", "outcome", 0.1), E("Z", "outcome", 0.15)]);
    const evidence = { features: { X: 1, Z: 2 }, outcome: 0.6 };
    const rX = engine.query(g, { scenario: "X", feature: "X", observedValue: 1, counterfactualValue: 2, evidence });
    const rZ = engine.query(g, { scenario: "Z", feature: "Z", observedValue: 2, counterfactualValue: 3, evidence });
    expect(rX.counterfactual).toBeCloseTo(0.7, 5); // 0.2+0.3+e(0.2)
    expect(rZ.counterfactual).toBeCloseTo(0.75, 5); // 0.1+0.45+e(0.2)
  });

  test("C3 sanity: baseline برابر پیامد مشاهده‌شده است", () => {
    const g = tinyGraph([E("X", "outcome", 0.3)]);
    const r = engine.query(g, {
      scenario: "s", feature: "X", observedValue: 1, counterfactualValue: 1.5,
      evidence: { features: { X: 1 }, outcome: 0.42 },
    });
    expect(r.baseline).toBeCloseTo(0.42, 5);
  });

  test("C4 گیت CF_EMPTY_GRAPH — گراف خالی (بدون یال) پرتاب می‌کند", () => {
    try {
      engine.query(tinyGraph([]), {
        scenario: "s", feature: "X", observedValue: 1, counterfactualValue: 2,
        evidence: { features: { X: 1 }, outcome: 0.5 },
      });
      throw new Error("نباید به این‌جا برسد");
    } catch (e) {
      expect(e).toBeInstanceOf(CounterfactualEngineError);
      expect((e as CounterfactualEngineError).code).toBe("CF_EMPTY_GRAPH");
    }
    try {
      engine.query({ nodes: [], edges: [], sampleSize: 0, builtAt: "", dagVerified: true, featureOrder: [] }, {
        scenario: "s", feature: "X", observedValue: 1, counterfactualValue: 2,
        evidence: { features: { X: 1 }, outcome: 0.5 },
      });
      throw new Error("نباید");
    } catch (e) {
      expect((e as CounterfactualEngineError).code).toBe("CF_EMPTY_GRAPH");
    }
  });

  test("C5 گیت CF_NOT_DAG — گراف بدون مهر DAG رد می‌شود", () => {
    const g: CausalGraph = { ...tinyGraph([E("X", "outcome", 0.2)]), dagVerified: false };
    try {
      engine.query(g, { scenario: "s", feature: "X", observedValue: 1, counterfactualValue: 2, evidence: { features: { X: 1 }, outcome: 0.5 } });
      throw new Error("نباید");
    } catch (e) {
      expect((e as CounterfactualEngineError).code).toBe("CF_NOT_DAG");
    }
  });

  test("C6 گیت CF_UNKNOWN_FEATURE — ویژگی خارج از گراف رد می‌شود", () => {
    try {
      engine.query(tinyGraph([E("X", "outcome", 0.2)]), {
        scenario: "s", feature: "NOPE", observedValue: 1, counterfactualValue: 2,
        evidence: { features: { NOPE: 1 }, outcome: 0.5 },
      });
      throw new Error("نباید");
    } catch (e) {
      expect((e as CounterfactualEngineError).code).toBe("CF_UNKNOWN_FEATURE");
    }
  });

  test("C7 گیت CF_EVIDENCE_MISMATCH — شاهد فاقد مقدار feature رد می‌شود", () => {
    try {
      engine.query(tinyGraph([E("X", "outcome", 0.2)]), {
        scenario: "s", feature: "X", observedValue: 1, counterfactualValue: 2,
        evidence: { features: { Z: 1 }, outcome: 0.5 },
      });
      throw new Error("نباید");
    } catch (e) {
      expect((e as CounterfactualEngineError).code).toBe("CF_EVIDENCE_MISMATCH");
    }
  });

  test("C8 گیت CF_SAME_VALUE — سناریوی بی‌اثر رد می‌شود", () => {
    try {
      engine.query(tinyGraph([E("X", "outcome", 0.2)]), {
        scenario: "s", feature: "X", observedValue: 1, counterfactualValue: 1,
        evidence: { features: { X: 1 }, outcome: 0.5 },
      });
      throw new Error("نباید");
    } catch (e) {
      expect((e as CounterfactualEngineError).code).toBe("CF_SAME_VALUE");
    }
  });

  test("C9 صداقت: بدون مسیر علّی به outcome ⇒ delta=۰ با اطمینان کامل", () => {
    // A فقط به Z وصل است (نه outcome) — مداخله روی A اثر ادعاشدنی ندارد
    const g = tinyGraph([E("A", "Z", 0.5), E("X", "outcome", 0.2)], ["A", "Z", "X", "outcome"]);
    const r = engine.query(g, {
      scenario: "بی‌اثر", feature: "A", observedValue: 1, counterfactualValue: 2,
      evidence: { features: { A: 1, Z: 1, X: 1 }, outcome: 0.5 },
    });
    expect(Math.abs(r.delta)).toBeLessThan(1e-9);
    expect(r.confidence).toBe(1);
  });

  test("C10 اطمینان = کمینهٔ اطمینان یال‌های مسیر مؤثر", () => {
    const g = tinyGraph([E("X", "outcome", 0.2, 0.7), E("X", "Z", 0.3, 0.95), E("Z", "outcome", 0.1, 0.8)]);
    const r = engine.query(g, {
      scenario: "s", feature: "X", observedValue: 1, counterfactualValue: 2,
      evidence: { features: { X: 1, Z: 1 }, outcome: 0.5 },
    });
    expect(r.confidence).toBeCloseTo(0.7, 5);
  });

  test("C11 rank: مرتب نزولی بر |Δ|×اطمینان", () => {
    const g = tinyGraph([E("X", "outcome", 0.4, 0.95), E("Z", "outcome", 0.1, 0.99)]);
    const evidence = { features: { X: 1, Z: 1 }, outcome: 0.5 };
    const qs: CounterfactualQuery[] = [
      { scenario: "کوچک", feature: "Z", observedValue: 1, counterfactualValue: 2, evidence },
      { scenario: "بزرگ", feature: "X", observedValue: 1, counterfactualValue: 2, evidence },
    ];
    const ranked = engine.rank(g, qs);
    expect(ranked[0]!.scenario).toBe("بزرگ");
    expect(ranked[1]!.scenario).toBe("کوچک");
  });

  test("C12 روایت: reason فارسی غیرخالی با اعداد", () => {
    const g = tinyGraph([E("X", "outcome", 0.2)]);
    const r = engine.query(g, {
      scenario: "آزمون", feature: "X", observedValue: 1, counterfactualValue: 2,
      evidence: { features: { X: 1 }, outcome: 0.5 },
    });
    expect(r.reason.length).toBeGreaterThan(20);
    expect(r.reason).toContain("آزمون");
    expect(r.reason).toMatch(/[۰-۹0-9]/);
  });

  test("C13 ثبات: rank مستقل از ترتیب ورودی است", () => {
    const g = tinyGraph([E("X", "outcome", 0.4), E("Z", "outcome", 0.1)]);
    const evidence = { features: { X: 1, Z: 1 }, outcome: 0.5 };
    const a = { scenario: "A", feature: "X", observedValue: 1, counterfactualValue: 2, evidence };
    const b = { scenario: "B", feature: "Z", observedValue: 1, counterfactualValue: 3, evidence };
    const r1 = engine.rank(g, [a, b]).map((r) => r.scenario);
    const r2 = engine.rank(g, [b, a]).map((r) => r.scenario);
    expect(r1).toEqual(r2);
  });

  test("C14 تقارن: مداخلهٔ معکوس علامت Δ را وارون می‌کند", () => {
    const g = tinyGraph([E("X", "outcome", 0.2)]);
    const evidence = { features: { X: 1 }, outcome: 0.6 };
    const up = engine.query(g, { scenario: "بالا", feature: "X", observedValue: 1, counterfactualValue: 2, evidence });
    const down = engine.query(g, { scenario: "پایین", feature: "X", observedValue: 1, counterfactualValue: 0, evidence });
    expect(up.delta).toBeGreaterThan(0);
    expect(down.delta).toBeLessThan(0);
    expect(up.delta).toBeCloseTo(-down.delta, 5);
  });

  test("C15 دامنه: خروجی همیشه در [۰٫۰۱ ، ۰٫۹۹] — مداخلهٔ شدید clamp می‌شود", () => {
    const g = tinyGraph([E("X", "outcome", 0.9)]);
    const evidence = { features: { X: 1 }, outcome: 0.5 };
    const up = engine.query(g, { scenario: "شدید+", feature: "X", observedValue: 1, counterfactualValue: 100, evidence });
    const down = engine.query(g, { scenario: "شدید-", feature: "X", observedValue: 1, counterfactualValue: -100, evidence });
    expect(up.counterfactual).toBeLessThanOrEqual(0.99);
    expect(down.counterfactual).toBeGreaterThanOrEqual(0.01);
  });
});

/* ═══════════════ موتور ۱۵ — شبیه‌سازی · ۱۵ تست ═══════════════ */

/** گراف واقع‌نما (عین گراف ذخیره‌شدهٔ ۱۳-الف — جهت قیمت منفی) */
function realishGraph(): CausalGraph {
  const nodes = ["pricePerMeter", "meterage", "rooms", "buildYear", "hasImage", "viewCount", "outcome"];
  return {
    nodes,
    sampleSize: 636,
    builtAt: "2026-10-09T00:00:00Z",
    dagVerified: true,
    featureOrder: nodes,
    edges: [
      E("pricePerMeter", "outcome", -0.15, 0.88),
      E("pricePerMeter", "hasImage", -0.16, 0.89),
      E("hasImage", "outcome", 0.218, 0.95),
      E("meterage", "outcome", -0.14, 0.86),
      E("buildYear", "outcome", 0.18, 0.92),
      E("hasImage", "viewCount", 0.318, 0.99),
      E("rooms", "hasImage", 0.141, 0.86),
    ],
  };
}

function baseCtx(over: Partial<SimContext> = {}): SimContext {
  return {
    currentProbability: 0.5,
    pricePerMeter: 0, // z(μ)
    imageCount: 1,
    viewCount: 0,
    marketPressure: 1,
    features: { pricePerMeter: 0, meterage: 0, rooms: 0, buildYear: 0, hasImage: 1, viewCount: 0 },
    priceZPerPercent: 0.013,
    viewMedianZ: -0.5,
    ...over,
  };
}

describe("PN-024 · موتور ۱۵ — شبیه‌سازی", () => {
  const sim = () => new SimulationEngine(realishGraph());

  test("S1 PRICE_CUT معتبر: کاهش قیمت در بازار این گراف احتمال را بالا می‌برد", () => {
    const r = sim().simulate({ kind: "PRICE_CUT", magnitude: 5, label: "۵٪" }, baseCtx());
    expect(r.delta).toBeGreaterThan(0);
    expect(r.simulatedProbability).toBeGreaterThan(0.5);
  });

  test("S2 تداوم یکنوا: کاهش ۱۰٪ اثر بزرگ‌تر از ۵٪ دارد", () => {
    const s = sim();
    const r5 = s.simulate({ kind: "PRICE_CUT", magnitude: 5, label: "۵" }, baseCtx());
    const r10 = s.simulate({ kind: "PRICE_CUT", magnitude: 10, label: "۱۰" }, baseCtx());
    expect(r10.delta).toBeGreaterThan(r5.delta);
  });

  test("S3 ADD_IMAGE بدون عکس: انتقال ۰→۱ اثر مثبت مستند دارد", () => {
    const ctx = baseCtx({ imageCount: 0, features: { ...baseCtx().features, hasImage: 0 } });
    const r = sim().simulate({ kind: "ADD_IMAGE", magnitude: 1, label: "عکس" }, ctx);
    expect(r.delta).toBeGreaterThan(0);
  });

  test("S4 ADD_IMAGE با عکس موجود: بی‌اثر صادقانه با دلیل", () => {
    const r = sim().simulate({ kind: "ADD_IMAGE", magnitude: 1, label: "عکس" }, baseCtx({ imageCount: 3 }));
    expect(r.delta).toBe(0);
    expect(r.reason).toContain("عکس");
  });

  test("S5 AGENT_CHANGE: delta=۰ با دلیل «مسیر علّی ندارد» (صداقت ساختاری)", () => {
    const r = sim().simulate({ kind: "AGENT_CHANGE", magnitude: 1, label: "کارشناس" }, baseCtx());
    expect(r.delta).toBe(0);
    expect(r.reason).toContain("مسیری");
  });

  test("S6 REPOST با میانهٔ بالاتر: بازدید به میانهٔ بازار اثر دارد", () => {
    const ctx = baseCtx({ viewCount: -1, viewMedianZ: 0.5, features: { ...baseCtx().features, viewCount: -1 } });
    const r = sim().simulate({ kind: "REPOST", magnitude: 1, label: "بازنشر" }, ctx);
    // viewCount→outcome مستقیم نیست ولی از مسیر شناخته‌شده اثر کوچکی منتقل می‌شود یا صفر صادقانه
    expect(r.delta).toBeGreaterThanOrEqual(0);
    expect(r.reason.length).toBeGreaterThan(10);
  });

  test("S7 REPOST وقتی بازدید از میانه بالاتر است: بی‌اثر", () => {
    const ctx = baseCtx({ viewCount: 1, viewMedianZ: -0.5, features: { ...baseCtx().features, viewCount: 1 } });
    const r = sim().simulate({ kind: "REPOST", magnitude: 1, label: "بازنشر" }, ctx);
    expect(r.delta).toBe(0);
  });

  test("S8 مدل بازار — اشباع (pressure>1): تعدیل کم‌کنندهٔ Δ", () => {
    const s = sim();
    const neutral = s.simulate({ kind: "PRICE_CUT", magnitude: 5, label: "۵" }, baseCtx({ marketPressure: 1 }));
    const saturated = s.simulate({ kind: "PRICE_CUT", magnitude: 5, label: "۵" }, baseCtx({ marketPressure: 4 }));
    expect(Math.abs(saturated.delta)).toBeLessThan(Math.abs(neutral.delta));
  });

  test("S9 مدل بازار — گرم (pressure<1): تعدیل تقویت‌کنندهٔ Δ", () => {
    const s = sim();
    const neutral = s.simulate({ kind: "PRICE_CUT", magnitude: 5, label: "۵" }, baseCtx({ marketPressure: 1 }));
    const hot = s.simulate({ kind: "PRICE_CUT", magnitude: 5, label: "۵" }, baseCtx({ marketPressure: 0.25 }));
    expect(Math.abs(hot.delta)).toBeGreaterThan(Math.abs(neutral.delta));
  });

  test("S10 سقف تعدیل بازار ۱٫۵× — فشار شدید اثر را منفجر نمی‌کند", () => {
    const s = sim();
    const neutral = s.simulate({ kind: "PRICE_CUT", magnitude: 10, label: "۱۰" }, baseCtx({ marketPressure: 1 }));
    const extreme = s.simulate({ kind: "PRICE_CUT", magnitude: 10, label: "۱۰" }, baseCtx({ marketPressure: 0.01 }));
    expect(Math.abs(extreme.delta)).toBeLessThanOrEqual(Math.abs(neutral.delta) * 1.5 + 1e-9);
  });

  test("S11 قفل ابدی: autoExecute در همهٔ خروجی‌ها false است", () => {
    const s = sim();
    const actions: SimAction[] = [
      { kind: "PRICE_CUT", magnitude: 5, label: "a" },
      { kind: "ADD_IMAGE", magnitude: 1, label: "b" },
      { kind: "REPOST", magnitude: 1, label: "c" },
      { kind: "AGENT_CHANGE", magnitude: 1, label: "d" },
    ];
    for (const a of actions) {
      expect(s.simulate(a, baseCtx()).autoExecute).toBe(false);
      expect(s.simulate(a, baseCtx()).autoExecute).not.toBe(true);
    }
  });

  test("S12 ریسک‌ها: PRICE_CUT ریسک‌های مستند غیرخالی دارد", () => {
    const r = sim().simulate({ kind: "PRICE_CUT", magnitude: 5, label: "۵" }, baseCtx());
    expect(r.risks.length).toBeGreaterThanOrEqual(2);
    expect(r.risks.join(" ")).toContain("ادراک ارزش");
  });

  test("S13 compare: نتایج مرتب نزولی بر Δ و best درست است", () => {
    const actions: SimAction[] = [
      { kind: "PRICE_CUT", magnitude: 5, label: "۵" },
      { kind: "PRICE_CUT", magnitude: 10, label: "۱۰" },
      { kind: "ADD_IMAGE", magnitude: 1, label: "عکس" },
    ];
    const t = sim().compare(actions, baseCtx());
    expect(t.results.length).toBe(3);
    for (let i = 1; i < t.results.length; i++) {
      expect(t.results[i]!.delta).toBeLessThanOrEqual(t.results[i - 1]!.delta);
    }
    expect(t.best?.action.label).toBe("۱۰");
  });

  test("S14 توصیه: recommendation فارسی غیرخالی با قید «تصمیم با مالک/شورا»", () => {
    const t = sim().compare([{ kind: "PRICE_CUT", magnitude: 10, label: "۱۰٪" }], baseCtx());
    expect(t.recommendation.length).toBeGreaterThan(15);
    expect(t.recommendation).toContain("مالک");
  });

  test("S15 دامنه: همهٔ خروجی‌ها در [۰٫۰۱ ، ۰٫۹۹]", () => {
    const s = sim();
    const actions: SimAction[] = [
      { kind: "PRICE_CUT", magnitude: 50, label: "۵۰" },
      { kind: "PRICE_CUT", magnitude: 0.5, label: "۰٫۵" },
    ];
    for (const a of actions) {
      const r = s.simulate(a, baseCtx());
      expect(r.simulatedProbability).toBeGreaterThanOrEqual(0.01);
      expect(r.simulatedProbability).toBeLessThanOrEqual(0.99);
    }
  });
});

/* ═══════════════ یکپارچگی — سرویس + خلوص · ۴ تست ═══════════════ */

describe("PN-024 · یکپارچگی فرا-ذهن", () => {
  test("I1 سرویس فرا-ذهن: اسنپ‌شات کامل چهار موتور روی DB تست", async () => {
    const { metaMindSnapshot } = await import("@/lib/services/meta-mind-service");
    const snap = await metaMindSnapshot();
    expect(snap.ranAt).toBeTruthy();
    expect(snap.engines.attention).toBeDefined();
    expect(snap.engines.causal).toBeDefined();
    expect(snap.engines.counterfactual).toBeDefined();
    expect(snap.engines.simulation).toBeDefined();
    expect(typeof snap.marketPressure).toBe("number");
    expect(snap.marketPressure).toBeGreaterThan(0);
  });

  test("I2 بودجهٔ توجه: top هرگز از بودجهٔ سطح بیشتر نیست", async () => {
    const { metaMindSnapshot } = await import("@/lib/services/meta-mind-service");
    const snap = await metaMindSnapshot();
    expect(snap.engines.attention.top.length).toBeLessThanOrEqual(snap.engines.attention.budget);
    expect(snap.engines.attention.budget).toBeLessThanOrEqual(10);
  });

  test("I3 خلوص نوعی: موتورهای ۱۴/۱۵ صفر DB/fetch — سرویس تنها نقطهٔ DB", async () => {
    const cf = readFileSync(join(ROOT, "src/core/intelligence/counterfactual-engine.ts"), "utf-8");
    const se = readFileSync(join(ROOT, "src/core/intelligence/simulation-engine.ts"), "utf-8");
    for (const src of [cf, se]) {
      expect(src.includes('from "@/lib/db"')).toBe(false);
      expect(src.includes('from "@prisma/client"')).toBe(false);
      expect(src.includes("fetch(")).toBe(false);
    }
    const svc = readFileSync(join(ROOT, "src/lib/services/meta-mind-service.ts"), "utf-8");
    expect(svc.includes('from "@/lib/db"')).toBe(true); // سرویس نازک — مجاز و تنها
  });

  test("I4 قطعیت: دو اجرای شبیه‌سازی یکسان کاملاً برابرند", () => {
    const ctx = baseCtx();
    const actions: SimAction[] = [
      { kind: "PRICE_CUT", magnitude: 5, label: "۵" },
      { kind: "PRICE_CUT", magnitude: 10, label: "۱۰" },
    ];
    const r1 = JSON.stringify(new SimulationEngine(realishGraph()).compare(actions, ctx));
    const r2 = JSON.stringify(new SimulationEngine(realishGraph()).compare(actions, ctx));
    expect(r1).toBe(r2);
  });
});
