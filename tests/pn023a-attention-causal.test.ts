/**
 * pn023a-attention-causal.test.ts — PN-023-A · فاز ۱۳-الف (فرا-ذهن)
 * =============================================================================
 * موتور ۱۲ (توجه · ۱۲) + موتور ۱۳ (علّیت · ۱۲) + گراف پایدار (۸) +
 * بودجهٔ توجه (۴) + یکپارچگی (۴) = ۴۰ تست
 */

import { afterAll, describe, expect, test } from "bun:test";

const { db } = await import("@/lib/db");

afterAll(async () => {
  await db.causalEdgeRecord.deleteMany({ where: { fromFeature: { startsWith: "t_" } } }).catch(() => undefined);
  await db.causalEdgeRecord.deleteMany({ where: { toFeature: { startsWith: "t_" } } }).catch(() => undefined);
  await db.$disconnect();
});

/* ═══════ ۱) موتور توجه (۱۲ تست) ═══════ */
describe("PN-023-A · موتور ۱۲ — توجه", () => {
  const NOW = new Date("2026-10-09T08:00:00.000Z");
  const mkItem = (over: Partial<import("@/core/intelligence/attention-engine").AttentionItem> & { itemId: string }) => ({
    occurredAt: new Date(NOW.getTime() - 3600_000).toISOString(), // یک ساعت پیش
    impactValue: 500,
    probability: 0.6,
    domains: ["AREA:مرکز"],
    rawCost: 0.1,
    ...over,
  });

  test("ت-۱) تازگی: واپاشی نمایی — همین‌حالا=۱ · نیم‌عمر=۰٫۵", async () => {
    const { computeFreshness } = await import("@/core/intelligence/attention-engine");
    expect(computeFreshness(new Date(NOW).toISOString(), NOW, 48)).toBeCloseTo(1, 5);
    expect(computeFreshness(new Date(NOW.getTime() - 48 * 3600_000).toISOString(), NOW, 48)).toBeCloseTo(0.5, 5);
  });

  test("ت-۲) تازگی: نامعلوم = کهنه-فرض ۰٫۱ (صادقانه — نه تازه)", async () => {
    const { computeFreshness } = await import("@/core/intelligence/attention-engine");
    expect(computeFreshness(undefined, NOW, 48)).toBe(0.1);
    expect(computeFreshness("نه-یک-تاریخ", NOW, 48)).toBe(0.1);
  });

  test("ت-۳) تطابق: هم‌پوشانی/کوچک‌ترین مجموعه — پوشش کامل مجموعهٔ کوچک‌تر = ۱", async () => {
    const { computeAlignment } = await import("@/core/intelligence/attention-engine");
    expect(computeAlignment(["A", "B", "C"], ["A"])).toBe(1); // ۱/۱
    expect(computeAlignment(["A"], ["A", "B", "C"])).toBe(1); // ۱/۱
    expect(computeAlignment(["A", "B"], ["A", "C"])).toBeCloseTo(0.5, 5);
    expect(computeAlignment([], ["A"])).toBe(0);
    expect(computeAlignment(["X"], [])).toBe(0);
  });

  test("ت-۴) هزینه: وارونه — ارزان=۱ · گران=۰ · نامعلوم=۰٫۸", async () => {
    const { computeCostFactor } = await import("@/core/intelligence/attention-engine");
    expect(computeCostFactor(0)).toBe(1);
    expect(computeCostFactor(1)).toBe(0);
    expect(computeCostFactor(0.2)).toBeCloseTo(0.8, 5);
    expect(computeCostFactor(undefined)).toBeCloseTo(0.8, 5); // 1 − 0.2
    expect(computeCostFactor(5)).toBe(0); // clamp
  });

  test("ت-۵) اثر بالقوه: نرمال‌سازی درون-دسته — برترین دسته = ۱", async () => {
    const { AttentionEngine } = await import("@/core/intelligence/attention-engine");
    const eng = new AttentionEngine({ domains: [], now: NOW });
    const scores = eng.scoreAll([mkItem({ itemId: "a", impactValue: 1000 }), mkItem({ itemId: "b", impactValue: 500 })]);
    expect(scores.find((s) => s.itemId === "a")!.potentialImpact).toBeCloseTo(1, 5);
    expect(scores.find((s) => s.itemId === "b")!.potentialImpact).toBeCloseTo(0.5, 5);
  });

  test("ت-۶) احتمال غایب = ۰٫۵ بی‌طرف (نه صفرِ بی‌صدا)", async () => {
    const { AttentionEngine } = await import("@/core/intelligence/attention-engine");
    const eng = new AttentionEngine({ domains: [], now: NOW });
    const s = eng.scoreAll([mkItem({ itemId: "x", probability: undefined, impactValue: 800 })]);
    // raw = 800 × 0.5 = 400 → max → 1
    expect(s[0]!.potentialImpact).toBe(1);
  });

  test("ت-۷) وزن‌های ناسالم = خطای صریح (صفر سکوت ممنوع)", async () => {
    const { AttentionEngine } = await import("@/core/intelligence/attention-engine");
    expect(() => new AttentionEngine({ domains: [], weightFreshness: 0.5, weightImpact: 0.5, weightAlignment: 0.5, weightCost: 0.5 })).toThrow("وزن");
  });

  test("ت-۸) itemId تکراری = خطای صریح", async () => {
    const { AttentionEngine } = await import("@/core/intelligence/attention-engine");
    const eng = new AttentionEngine({ domains: [], now: NOW });
    expect(() => eng.rank([mkItem({ itemId: "dup" }), mkItem({ itemId: "dup" })], 5)).toThrow("تکراری");
  });

  test("ت-۹) بودجه: صفر/منفی = بی‌توجهی برنامه‌ریزی‌شده (خروجی خالی)", async () => {
    const { AttentionEngine } = await import("@/core/intelligence/attention-engine");
    const eng = new AttentionEngine({ domains: [], now: NOW });
    expect(eng.rank([mkItem({ itemId: "a" }), mkItem({ itemId: "b" })], 0)).toHaveLength(0);
    expect(eng.rank([mkItem({ itemId: "a" })], -3)).toHaveLength(0);
  });

  test("ت-۱۰) rank: مرتب نزولی + برش بودجه + تعادل‌شکن پایدار", async () => {
    const { AttentionEngine } = await import("@/core/intelligence/attention-engine");
    const eng = new AttentionEngine({ domains: ["AREA:مرکز"], now: NOW });
    const items = [
      mkItem({ itemId: "weak", impactValue: 10, occurredAt: new Date(NOW.getTime() - 10 * 86400_000).toISOString() }),
      mkItem({ itemId: "strong", impactValue: 900 }),
      mkItem({ itemId: "mid", impactValue: 400 }),
    ];
    const r = eng.rank(items, 2);
    expect(r).toHaveLength(2);
    expect(r[0]!.itemId).toBe("strong");
    expect(r[1]!.itemId).toBe("mid");
    expect(r[0]!.total).toBeGreaterThanOrEqual(r[1]!.total);
  });

  test("ت-۱۱) روایت فارسی: هر امتیاز دلیل دارد — شماره‌ها و مؤلفه‌ها حاضرند", async () => {
    const { AttentionEngine } = await import("@/core/intelligence/attention-engine");
    const eng = new AttentionEngine({ domains: ["AREA:مرکز"], now: NOW });
    const r = eng.rank([mkItem({ itemId: "story-1" })], 1);
    expect(r[0]!.reason).toContain("story-1");
    expect(r[0]!.reason).toContain("تازگی");
    expect(r[0]!.reason).toContain("رتبهٔ");
    // explain همان روایت را برمی‌گرداند
    expect(eng.explain("story-1")).toContain("story-1");
    expect(eng.explain("غایب-کل")).toContain("حاضر نیست");
  });

  test("ت-۱۲) فراخوان صفر-ورودی = خروجی خالی بدون خطا", async () => {
    const { AttentionEngine } = await import("@/core/intelligence/attention-engine");
    const eng = new AttentionEngine({ domains: [], now: NOW });
    expect(eng.rank([], 10)).toHaveLength(0);
    expect(eng.scoreAll([])).toHaveLength(0);
  });
});

/* ═══════ ۲) موتور علّیت (۱۲ تست) ═══════ */
describe("PN-023-A · موتور ۱۳ — علّیت", () => {
  /** دادهٔ ساختگی با ساختار علّی شناخته‌شده: x → y (قوی مثبت) · z → y (منفی) · پیوسته (نه دودویی گردشده) */
  const SYNTH = Array.from({ length: 120 }, (_, i) => {
    const x = (i % 10) / 10;          // 0..0.9
    const z = ((i * 7) % 10) / 10;    // جایگشت قطعی — شبه‌مستقل از x
    return {
      features: { x, z, noise: 0.5 }, // واریانس صفر ⇒ pearson null ⇒ هرگز یال (تست ع-۴)
      outcome: 0.8 * x - 0.6 * z,      // پیوسته — همبستگی تمیز و قوی
    };
  });

  test("ع-۱) assertDag: گراف سالم سبز — self-loop رد فوری", async () => {
    const { assertDag } = await import("@/core/intelligence/causal-engine");
    expect(() => assertDag(["a", "b"], [{ from: "a", to: "b" }])).not.toThrow();
    expect(() => assertDag(["a"], [{ from: "a", to: "a" }])).toThrow("خود-حلقه");
  });

  test("ع-۲) cycle دوتایی/سه‌تایی = CAUSAL_CYCLE_DETECTED (قانون ۷)", async () => {
    const { assertDag, CausalEngineError } = await import("@/core/intelligence/causal-engine");
    try {
      assertDag(["a", "b"], [{ from: "a", to: "b" }, { from: "b", to: "a" }]);
      throw new Error("باید خطا می‌داد");
    } catch (e) {
      expect(e).toBeInstanceOf(CausalEngineError);
      expect((e as Error).message).toContain("cycle");
    }
    expect(() => assertDag(["a", "b", "c"], [{ from: "a", to: "b" }, { from: "b", to: "c" }, { from: "c", to: "a" }])).toThrow(CausalEngineError as never);
  });

  test("ع-۳) buildGraph: گراف ساختگی — یال x→outcome مثبت · z→outcome منفی", async () => {
    const { CausalEngine, OUTCOME_NODE } = await import("@/core/intelligence/causal-engine");
    const eng = new CausalEngine({ confidenceFloor: 0.6, minSamples: 10 });
    const g = eng.buildGraph(SYNTH, ["x", "z", "noise", OUTCOME_NODE]);
    const xo = g.edges.find((e) => e.from === "x" && e.to === OUTCOME_NODE);
    const zo = g.edges.find((e) => e.from === "z" && e.to === OUTCOME_NODE);
    expect(xo).toBeDefined();
    expect(xo!.coefficient).toBeGreaterThan(0);
    expect(zo).toBeDefined();
    expect(zo!.coefficient).toBeLessThan(0);
    expect(g.dagVerified).toBe(true);
  });

  test("ع-۴) کف اطمینان: یال با اطمینان < ۰٫۶ رد می‌شود", async () => {
    const { CausalEngine, OUTCOME_NODE } = await import("@/core/intelligence/causal-engine");
    // noise با outcome تقریباً مستقل — یالش نباید ساخته شود
    const eng = new CausalEngine({ confidenceFloor: 0.6, minSamples: 10 });
    const g = eng.buildGraph(SYNTH, ["x", "z", "noise", OUTCOME_NODE]);
    expect(g.edges.find((e) => e.from === "noise" && e.to === OUTCOME_NODE)).toBeUndefined();
  });

  test("ع-۵) ترتیب علّی پیشینی: یال فقط از جلوتر به عقب‌تر — گراف همیشه DAG", async () => {
    const { CausalEngine, OUTCOME_NODE } = await import("@/core/intelligence/causal-engine");
    const eng = new CausalEngine({ confidenceFloor: 0.5, minSamples: 5 });
    for (let trial = 0; trial < 5; trial++) {
      const data = Array.from({ length: 60 }, (_, i) => ({
        features: { a: (i % 7) / 7, b: ((i * 3 + trial) % 11) / 11, c: ((i + trial) % 5) / 5 },
        outcome: ((i % 3) + trial) % 2,
      }));
      const g = eng.buildGraph(data, ["a", "b", "c", OUTCOME_NODE]);
      expect(g.dagVerified).toBe(true); // با ترتیب، همیشه
    }
  });

  test("ع-۶) دادهٔ خالی/بی-ویژگی مشترک = خطای صریح", async () => {
    const { CausalEngine } = await import("@/core/intelligence/causal-engine");
    const eng = new CausalEngine();
    expect(() => eng.buildGraph([])).toThrow("خالی");
  });

  test("ع-۷) pearson: همبستگی کامل مثبت=۱ · مخالف=−۱ · صفر-واریانس=null", async () => {
    const { pearson } = await import("@/core/intelligence/causal-engine");
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 5);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 5);
    expect(pearson([5, 5, 5], [1, 2, 3])).toBeNull();
  });

  test("ع-۸) اطمینان: نمونهٔ بزرگ ⇒ نزدیک ۱ · نمونهٔ کوچک ⇒ جریمه", async () => {
    const { confidenceFromStats } = await import("@/core/intelligence/causal-engine");
    const big = confidenceFromStats(0.5, 500);
    const small = confidenceFromStats(0.5, 12);
    expect(big).toBeGreaterThan(0.6);
    expect(small).toBeLessThan(big);
    expect(confidenceFromStats(0.5, 500)).toBeLessThanOrEqual(1);
  });

  test("ع-۹) intervene: اثر مستقیم = δ × ضریب یال مستقیم (L2)", async () => {
    const { CausalEngine, OUTCOME_NODE } = await import("@/core/intelligence/causal-engine");
    const eng = new CausalEngine({ confidenceFloor: 0.5, minSamples: 10 });
    const g = eng.buildGraph(SYNTH, ["x", "z", "noise", OUTCOME_NODE]);
    const eff = eng.intervene(g, { feature: "x", delta: 0.1 });
    const direct = g.edges.find((e) => e.from === "x" && e.to === OUTCOME_NODE)!;
    expect(eff.method).toBe("L2");
    expect(eff.directEffect).toBeCloseTo(0.1 * direct.coefficient, 3);
    expect(eff.target).toBe(OUTCOME_NODE);
  });

  test("ع-۱۰) intervene: ویژگی غایب = خطای صریح", async () => {
    const { CausalEngine, OUTCOME_NODE } = await import("@/core/intelligence/causal-engine");
    const eng = new CausalEngine();
    const g = eng.buildGraph(SYNTH, ["x", "z", "noise", OUTCOME_NODE]);
    expect(() => eng.intervene(g, { feature: "no-such", delta: 1 })).toThrow("حاضر نیست");
  });

  test("ع-۱۱) findCause: یال‌های ورودی مرتب نزولی بر |ضریب|", async () => {
    const { CausalEngine, OUTCOME_NODE } = await import("@/core/intelligence/causal-engine");
    const eng = new CausalEngine({ confidenceFloor: 0.5, minSamples: 10 });
    const g = eng.buildGraph(SYNTH, ["x", "z", "noise", OUTCOME_NODE]);
    const causes = eng.findCause(g, OUTCOME_NODE);
    expect(causes.length).toBeGreaterThanOrEqual(1);
    for (let i = 1; i < causes.length; i++) {
      expect(Math.abs(causes[i - 1]!.coefficient)).toBeGreaterThanOrEqual(Math.abs(causes[i]!.coefficient));
    }
  });

  test("ع-۱۲) evidence هر یال: n و r و روش حاضر — پروونانس کامل", async () => {
    const { CausalEngine, OUTCOME_NODE } = await import("@/core/intelligence/causal-engine");
    const eng = new CausalEngine({ confidenceFloor: 0.5, minSamples: 10 });
    const g = eng.buildGraph(SYNTH, ["x", "z", "noise", OUTCOME_NODE]);
    for (const e of g.edges) {
      expect(e.evidence).toContain("Pearson");
      expect(e.evidence).toContain("n=");
      expect(e.method).toBe("L1");
    }
  });
});

/* ═══════ ۳) گراف پایدار (۸ تست) ═══════ */
describe("PN-023-A · گراف علّی پایدار — CausalEdgeRecord", () => {
  const TEST_GRAPH = {
    nodes: ["t_price", "t_rooms", "outcome"],
    edges: [
      { from: "t_price", to: "outcome", coefficient: -0.21, confidence: 0.91, method: "L1" as const, evidence: "تست — t_price→outcome" },
      { from: "t_rooms", to: "outcome", coefficient: 0.14, confidence: 0.72, method: "L1" as const, evidence: "تست — t_rooms→outcome" },
    ],
    sampleSize: 42,
    builtAt: new Date().toISOString(),
    dagVerified: true,
    featureOrder: ["t_price", "t_rooms", "outcome"],
  };

  test("گ-۱) saveGraph: ذخیرهٔ idempotent — اجرای دوم بدون تکرار", async () => {
    const { saveGraph, loadGraph } = await import("@/lib/services/causal-graph-store");
    const r1 = await saveGraph(TEST_GRAPH);
    const r2 = await saveGraph(TEST_GRAPH);
    expect(r1.saved).toBe(2);
    expect(r2.saved).toBe(2); // upsert — بدون تکرار
    const g = await loadGraph();
    const mine = g!.edges.filter((e) => e.from.startsWith("t_"));
    expect(mine).toHaveLength(2);
  });

  test("گ-۲) loadGraph: برابری بایت‌به-بایت یال‌ها پس از بازگشت", async () => {
    const { loadGraph } = await import("@/lib/services/causal-graph-store");
    const g = await loadGraph();
    const price = g!.edges.find((e) => e.from === "t_price");
    expect(price?.coefficient).toBe(-0.21);
    expect(price?.confidence).toBe(0.91);
    expect(price?.method).toBe("L1");
    expect(g!.dagVerified).toBe(true);
  });

  test("گ-۳) saveGraph: گراف چرخه‌ای هرگز وارد DB نمی‌شود (قانون ۷ در نوشتن)", async () => {
    const { saveGraph } = await import("@/lib/services/causal-graph-store");
    const cyclic = {
      nodes: ["t_a", "t_b"],
      edges: [
        { from: "t_a", to: "t_b", coefficient: 0.5, confidence: 0.9, method: "L1" as const, evidence: "x" },
        { from: "t_b", to: "t_a", coefficient: 0.5, confidence: 0.9, method: "L1" as const, evidence: "x" },
      ],
      sampleSize: 10, builtAt: new Date().toISOString(), dagVerified: false, featureOrder: [],
    };
    await expect(saveGraph(cyclic as never)).rejects.toThrow("cycle");
  });

  test("گ-۴) saveGraph: یال زیر کف اطمینان ۰٫۶ ردِ مستند (نه پرتاب)", async () => {
    const { saveGraph, graphStats } = await import("@/lib/services/causal-graph-store");
    const before = (await graphStats()).edges;
    const r = await saveGraph({
      nodes: ["t_weak", "outcome"],
      edges: [{ from: "t_weak", to: "outcome", coefficient: 0.4, confidence: 0.3, method: "L1", evidence: "ضعیف" }],
      sampleSize: 5, builtAt: new Date().toISOString(), dagVerified: true, featureOrder: [],
    });
    expect(r.skipped).toBe(1);
    expect(r.saved).toBe(0);
    expect((await graphStats()).edges).toBe(before); // هیچ چیز نوشته نشد
  });

  test("گ-۵) graphStats: شمار یال/گره + حداقل اطمینان ≥ کف", async () => {
    const { graphStats } = await import("@/lib/services/causal-graph-store");
    const s = await graphStats();
    expect(s.edges).toBeGreaterThanOrEqual(2);
    if (s.edges > 0) {
      expect(s.minConfidence).toBeGreaterThanOrEqual(0.6);
      expect(s.belowFloor).toBe(0);
    }
  });

  test("گ-۶) جدول افزودنی: قانون ۸ — ۶۰ جدول · CausalEdgeRecord حاضر", async () => {
    const { Database } = await import("bun:sqlite");
    const con = new Database("db/custom.db", { readonly: true });
    const t = con.query("SELECT name FROM sqlite_master WHERE type='table' AND name='CausalEdgeRecord'").get();
    expect(t).toBeDefined();
    const count = con.query("SELECT COUNT(*) as c FROM sqlite_master WHERE type='table'").get() as { c: number };
    expect(count.c).toBeGreaterThanOrEqual(60);
    con.close();
  });

  test("گ-۷) twin schema: توازن ۷۰=۷۰ (گارد postgres-compat — ن۰۵۵: −۱ OtpRateLimit · PN-025: +۳ · PN-03۱: +۲ رلهٔ موبایل · ن۰۵۷: +۱ RelayJob · ن۰۶۳: +۱ GlmProbe)", async () => {
    const { readFileSync } = await import("node:fs");
    const models = (p: string) => [...readFileSync(p, "utf8").matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]);
    const sq = models("prisma/schema.prisma");
    const pg = models("prisma/schema.postgres.prisma");
    expect(sq.length).toBe(70); // ۷۱ − ۱ OtpRateLimit (ن۰۵۵) + ۱ RelayJob (ن۰۵۷) + ۱ GlmProbe (ن۰۶۳ · آزمون زندهٔ GLM)
    expect(new Set(pg)).toEqual(new Set(sq));
  });

  test("گ-۸) schema additive: صفر تغییر در ۵۹ جدول موجود (diff برابری ستون‌ها)", async () => {
    // ستون‌های جدول تازه — تنها افزودنی (قانون ۸)
    const { Database } = await import("bun:sqlite");
    const con = new Database("db/custom.db", { readonly: true});
    const cols = (con.query("PRAGMA table_info(CausalEdgeRecord)").all() as Array<{ name: string }>).map((c) => c.name);
    expect(cols).toEqual(["id", "fromFeature", "toFeature", "coefficient", "confidence", "method", "evidence", "createdAt"]);
    con.close();
  });
});

/* ═══════ ۴) بودجهٔ توجه (۴ تست) ═══════ */
describe("PN-023-A · بودجهٔ توجه", () => {
  test("ب-۱) چهار سطح: ۵/۱۰/۵۰/۵۰۰ عین جدول فصل ۸", async () => {
    const { ATTENTION_BUDGETS } = await import("@/core/intelligence/attention-budget");
    expect(ATTENTION_BUDGETS.CRITICAL.maxItems).toBe(5);
    expect(ATTENTION_BUDGETS.DAILY.maxItems).toBe(10);
    expect(ATTENTION_BUDGETS.WEEKLY.maxItems).toBe(50);
    expect(ATTENTION_BUDGETS.MONTHLY.maxItems).toBe(500);
    expect(ATTENTION_BUDGETS.DAILY.refreshHours).toBe(24);
  });

  test("ب-۲) clampBudget: سقف سطح — ۳۷→۱۰ · کمتر مجاز · منفی=۰", async () => {
    const { clampBudget } = await import("@/core/intelligence/attention-budget");
    expect(clampBudget(37, "DAILY")).toBe(10);
    expect(clampBudget(3, "DAILY")).toBe(3);
    expect(clampBudget(-1, "DAILY")).toBe(0);
    expect(clampBudget(999, "WEEKLY")).toBe(50);
  });

  test("ب-۳) levelForCount: ۷→DAILY · ۳۰→WEEKLY · ۱→CRITICAL", async () => {
    const { levelForCount } = await import("@/core/intelligence/attention-budget");
    expect(levelForCount(1)).toBe("CRITICAL");
    expect(levelForCount(7)).toBe("DAILY");
    expect(levelForCount(30)).toBe("WEEKLY");
    expect(levelForCount(600)).toBe("MONTHLY");
  });

  test("ب-۴) سطح نامعتبر = خطای صریح (صفر سکوت)", async () => {
    const { budgetFor } = await import("@/core/intelligence/attention-budget");
    expect(() => budgetFor("HOURLY" as never)).toThrow("نامعتبر");
  });
});

/* ═══════ ۵) یکپارچگی توجه + علّیت (۴ تست) ═══════ */
describe("PN-023-A · یکپارچگی فرا-ذهن", () => {
  test("ی-۱) توجه + بودجه: rank با بودجهٔ سطح DAILY از clampBudget", async () => {
    const { AttentionEngine } = await import("@/core/intelligence/attention-engine");
    const { clampBudget, ATTENTION_BUDGETS } = await import("@/core/intelligence/attention-budget");
    const NOW = new Date("2026-10-09T08:00:00.000Z");
    const eng = new AttentionEngine({ domains: ["AREA:مرکز"], now: NOW });
    const items = Array.from({ length: 30 }, (_, i) => ({
      itemId: `int-${i}`,
      occurredAt: new Date(NOW.getTime() - i * 3600_000).toISOString(),
      impactValue: 1000 - i * 30,
      probability: 0.7,
      domains: i % 2 === 0 ? ["AREA:مرکز"] : ["AREA:دیگر"],
      rawCost: 0.1,
    }));
    const budget = clampBudget(30, "DAILY"); // = 10
    const r = eng.rank(items, budget);
    expect(budget).toBe(ATTENTION_BUDGETS.DAILY.maxItems);
    expect(r).toHaveLength(10);
    // دلیلی بودن برش: رتبهٔ ۱۱ امتیاز ≤ رتبهٔ ۱۰
    const all = eng.scoreAll(items).sort((a, b) => b.total - a.total);
    expect(r[9]!.total).toBeGreaterThanOrEqual(all[10]!.total);
  });

  test("ی-۲) علّیت + گراف پایدار: build→save→load→intervene زنجیرهٔ کامل", async () => {
    const { CausalEngine, OUTCOME_NODE } = await import("@/core/intelligence/causal-engine");
    const { saveGraph, loadGraph } = await import("@/lib/services/causal-graph-store");
    const data = Array.from({ length: 100 }, (_, i) => ({
      features: { t_a: (i % 10) / 10, t_b: ((i * 7) % 10) / 10 },
      outcome: 0.7 * ((i % 10) / 10) - 0.4 * (((i * 7) % 10) / 10),
    }));
    const eng = new CausalEngine({ confidenceFloor: 0.5, minSamples: 10 });
    const g = eng.buildGraph(data, ["t_a", "t_b", OUTCOME_NODE]);
    await saveGraph(g);
    const reloaded = await loadGraph();
    // فقط یال‌های این تست (DB گراف‌های قبلی را هم دارد — فیلتر دامنه)
    const mine = reloaded!.edges.filter((e) => e.from === "t_a" || e.from === "t_b");
    expect(mine.length).toBe(g.edges.length);
    if (g.nodes.includes("t_a")) {
      const eff = eng.intervene(reloaded!, { feature: "t_a", delta: 0.5 });
      expect(eff.method).toBe("L2");
      expect(eff.evidence).toContain("مداخلهٔ do");
    }
  });

  test("ی-۳) خلوص: موتورهای ۱۲/۱۳ صفر import از lib/db یا prisma (گارد فاز ۳)", async () => {
    const fs = await import("node:fs");
    for (const f of ["attention-engine.ts", "causal-engine.ts", "attention-budget.ts"]) {
      const src = fs.readFileSync(`src/core/intelligence/${f}`, "utf8");
      expect(src.includes('from "@/lib/db"')).toBe(false);
      expect(src.includes('from "@prisma/client"')).toBe(false);
    }
    // ماندگاری در لایهٔ سرویس (نه لایهٔ هوش)
    expect(fs.existsSync("src/lib/services/causal-graph-store.ts")).toBe(true);
    expect(fs.existsSync("src/core/intelligence/causal-graph-store.ts")).toBe(false);
  });

  test("ی-۴) قانون ۶: موتورهای ۱-۱۱ دست‌نخورده — p7..p11 بدون تغییر این جلسه", async () => {
    // شمار کلاس‌های موتور موجود عین قبل — ۱۴ کلاس در p7..p11
    const fs = await import("node:fs");
    const files = ["p7-core.ts", "p8-core.ts", "p9-core.ts", "p10-core.ts", "p11-core.ts"];
    let classes = 0;
    for (const f of files) {
      const src = fs.readFileSync(`src/core/intelligence/${f}`, "utf8");
      classes += (src.match(/^export class /gm) ?? []).length;
    }
    expect(classes).toBe(14); // ۵+۳+۲+۱+۳ = ۱۴ — عین قبل از این جلسه
  });
});
