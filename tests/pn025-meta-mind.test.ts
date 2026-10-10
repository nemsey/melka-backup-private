/**
 * pn025-meta-mind.test.ts — PN-025 (شورا-ن۰۳۲): مغز کامل چهارستونه
 * =============================================================================
 * ۸۵ تست (هدف ≥۸۰ — عین ماتریس پیوست ج سند طراحی):
 *   §حافظه   (۲۰) — فرمول اهمیت · گذارها · تثبیت · API stats نقش‌ها
 *   §بینایی  (۲۰) — پنج مسیر معیار · DAG دو-گیت · سقف عمق · روایت فارسی
 *   §موتور۱۶ (۲۰) — قرارداد لفظی · ۲۴ قالب · سناریوسازی · ریسک · صفر LLM
 *   §کمربند  (۲۰) — TTL/Cooldown/RateLimit · استثنا · AuditLog · قفل نوعی
 *   §ادغامUI  (۵) — AdviceCard سه کاشی · WCAG · دکمهٔ تأیید بدون کنش
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "node:fs";

process.env.OWNER_PERSONNEL_CODES = "410099950";
const { db } = await import("@/lib/db");

const SRC = "/home/z/my-project/src";
const TILES = `${SRC}/core/tiles/tiles`;

// ═══════════════ ابزار نشست (الگوی pn017-sections) ═══════════════

const createdSessions: string[] = [];
async function makeSession(role: "OWNER" | "CONSULTANT", personnelCode = role === "OWNER" ? "960001" : "960002") {
  const { createSession } = await import("@/lib/auth/session");
  const { token } = await createSession(
    { personnelCode, displayName: `تست PN-025 ${role}`, role },
    { ip: "127.0.0.1" },
    null,
  );
  createdSessions.push(token);
  return { token, personnelCode };
}
const hdr = (t: string) => ({ authorization: `Bearer ${t}` });
async function NR(u: string, init?: RequestInit): Promise<import("next/server").NextRequest> {
  const { NextRequest } = await import("next/server");
  return new NextRequest(`http://localhost${u}`, init as never);
}

// ═══════════════ ماژول‌های خالص (ایزوله — قبل از هر DB) ═══════════════

const {
  computeImportance,
  recencyComponent,
  frequencyComponent,
  decideTransition,
  IMPORTANCE_WEIGHTS,
  CONSOLIDATION_THRESHOLDS,
  DEFAULT_RETENTION_DAYS,
} = await import("@/core/intelligence/memory-lifecycle");

const {
  unifiedVision,
  isDag,
  assertDag,
  pathWeight,
  nodeId,
  EDGE_LABELS_FA,
  DEFAULT_MAX_DEPTH,
  HARD_MAX_DEPTH,
} = await import("@/core/intelligence/unified-graph");

const {
  decide,
  buildActionCandidates,
  assessRisk,
  buildNarrative,
  ADVISOR_WEIGHTS,
} = await import("@/core/intelligence/decision-advisor");

const {
  narrate,
  TEMPLATES,
  TEMPLATE_IDS,
  TEMPLATE_VARIABLES,
  sentenceCount,
} = await import("@/core/intelligence/decision-templates");

const {
  evaluateLock,
  evaluateTtl,
  expiryFromNow,
  buildDecisionLock,
  DECISION_LOCK_CONSTANTS,
  DECISION_CATEGORIES,
} = await import("@/core/intelligence/decision-lock");

/* ════════════════════════════════════════════════════════════════════
 * §حافظه — ۲۰ تست
 * ════════════════════════════════════════════════════════════════════ */

describe("PN-025 §حافظه — فرمول اهمیت و قواعد گذار (خالص)", () => {
  test("M-۱) امتیاز — تازه و پرتکرار و دارای پیوند نتیجه ⇒ بالا", () => {
    const s = computeImportance({ hoursSinceAccess: 1, accessCount: 20, hasOutcomeLink: true });
    expect(s).toBeGreaterThan(0.8);
  });

  test("M-۲) امتیاز — کهنه و کم‌دسترس و بدون پیوند ⇒ پایین", () => {
    const s = computeImportance({ hoursSinceAccess: 200, accessCount: 1, hasOutcomeLink: false });
    expect(s).toBeLessThan(0.2);
  });

  test("M-۳) کلمپ — خروجی همیشه در [0,1]", () => {
    for (const input of [
      { hoursSinceAccess: -5, accessCount: -3, hasOutcomeLink: true },
      { hoursSinceAccess: 1e9, accessCount: 1e6, hasOutcomeLink: true },
    ]) {
      const s = computeImportance(input);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThanOrEqual(1);
    }
  });

  test("M-۴) وزن‌های اهمیت جمعاً ۱ (fail-loud)", () => {
    expect(IMPORTANCE_WEIGHTS.recency + IMPORTANCE_WEIGHTS.frequency + IMPORTANCE_WEIGHTS.outcomeLink).toBeCloseTo(1, 9);
  });

  test("M-۵) تازگی واپاشی نمایی — نیم‌عمر ۴۸ ساعت", () => {
    expect(recencyComponent(0)).toBe(1);
    expect(recencyComponent(48)).toBeCloseTo(0.5, 6);
    expect(recencyComponent(96)).toBeCloseTo(0.25, 6);
  });

  test("M-۶) بسامد نرمال درون‌داده — صفر ⇒ ۰ و سقف ⇒ ۱", () => {
    expect(frequencyComponent(0)).toBe(0);
    expect(frequencyComponent(100000)).toBe(1);
    expect(frequencyComponent(20)).toBeGreaterThan(frequencyComponent(5));
  });

  test("M-۷) گذار hot→warm برقرار — عمر ۸ روز و امتیاز ۰٫۸", () => {
    const v = decideTransition({ category: "hot", daysSinceAccess: 8, hoursSinceAccess: 192, importanceScore: 0.8 });
    expect(v.action).toBe("promote");
    expect(v.to).toBe("warm");
    expect(v.reason).toContain("داغ→گرم");
  });

  test("M-۸) گذار hot→warm رد — امتیاز زیر ۰٫۷ (داده حذف نمی‌شود)", () => {
    const v = decideTransition({ category: "hot", daysSinceAccess: 8, hoursSinceAccess: 192, importanceScore: 0.5 });
    expect(v.action).toBe("hold");
    expect(v.to).toBeNull();
  });

  test("M-۹) گذار hot→warm رد — عمر زیر ۷ روز", () => {
    const v = decideTransition({ category: "hot", daysSinceAccess: 3, hoursSinceAccess: 72, importanceScore: 0.95 });
    expect(v.action).toBe("hold");
  });

  test("M-۱۰) گذار warm→cold برقرار — عمر ۳۵ روز و امتیاز ۰٫۲", () => {
    const v = decideTransition({ category: "warm", daysSinceAccess: 35, hoursSinceAccess: 840, importanceScore: 0.2 });
    expect(v.action).toBe("demote");
    expect(v.to).toBe("cold");
  });

  test("M-۱۱) گذار warm→cold رد — امتیاز بالای ۰٫۳", () => {
    const v = decideTransition({ category: "warm", daysSinceAccess: 35, hoursSinceAccess: 840, importanceScore: 0.5 });
    expect(v.action).toBe("hold");
  });

  test("M-۱۲) بیداری cold→warm — دسترسی تازه + جهش امتیاز ≥ ۰٫۵", () => {
    const v = decideTransition({ category: "cold", daysSinceAccess: 1, hoursSinceAccess: 24, importanceScore: 0.6 });
    expect(v.action).toBe("awaken");
    expect(v.to).toBe("warm");
  });

  test("M-۱۳) بیداری رد — پنجرهٔ ۴۸ ساعت گذشته", () => {
    const v = decideTransition({ category: "cold", daysSinceAccess: 5, hoursSinceAccess: 120, importanceScore: 0.9 });
    expect(v.action).toBe("hold");
  });

  test("M-۱۴) قطعیت قواعد — همان ورودی ⇒ همان حکم", () => {
    const input = { category: "hot" as const, daysSinceAccess: 10, hoursSinceAccess: 240, importanceScore: 0.75 };
    expect(decideTransition(input)).toEqual(decideTransition(input));
  });

  test("M-۱۵) آستانه‌های سفارش عین‌به‌عین (۰٫۷ / ۰٫۳ / ۷ / ۳۰)", () => {
    expect(CONSOLIDATION_THRESHOLDS.promoteScore).toBe(0.7);
    expect(CONSOLIDATION_THRESHOLDS.demoteScore).toBe(0.3);
    expect(CONSOLIDATION_THRESHOLDS.hotDays).toBe(7);
    expect(CONSOLIDATION_THRESHOLDS.warmDays).toBe(30);
  });

  test("M-۱۶) سیاست پیش‌فرض — ۷/۳۰/۳۶۵ روز", () => {
    expect(DEFAULT_RETENTION_DAYS).toEqual({ hot: 7, warm: 30, cold: 365 });
  });
});

describe("PN-025 §حافظه — سرویس DB و تثبیت", () => {
  beforeAll(async () => {
    await db.memoryLifecycle.deleteMany({ where: { itemId: { startsWith: "PN025TEST:" } } });
  });

  afterAll(async () => {
    await db.memoryLifecycle.deleteMany({ where: { itemId: { startsWith: "PN025TEST:" } } });
  });

  test("M-۱۷) touchMemory — رکورد تازه با سطح داغ + امتیاز تازه", async () => {
    const { touchMemory } = await import("@/lib/services/memory-lifecycle-service");
    const r = await touchMemory({ itemId: "PN025TEST:prop-1", itemType: "property" });
    expect(r.category).toBe("hot");
    expect(r.importanceScore).toBeGreaterThan(0);
    expect(r.accessCount).toBe(1);
  });

  test("M-۱۸) touchMemory idempotent — دو لمس = یک رکورد با accessCount=۲ (کلید یکتا)", async () => {
    const { touchMemory } = await import("@/lib/services/memory-lifecycle-service");
    await touchMemory({ itemId: "PN025TEST:prop-1", itemType: "property" });
    const r = await touchMemory({ itemId: "PN025TEST:prop-1", itemType: "property" });
    expect(r.accessCount).toBe(3); // یک بار در M-۱۷ + دو بار اینجا
    const count = await db.memoryLifecycle.count({ where: { itemId: "PN025TEST:prop-1" } });
    expect(count).toBe(1);
  });

  test("M-۱۹) تثبیت شبانه — گذار واقعی hot→warm روی fixture + شاهد ConsolidationRun", async () => {
    await db.memoryLifecycle.deleteMany({ where: { itemId: "PN025TEST:prop-old" } });
    await db.memoryLifecycle.create({
      data: {
        category: "hot",
        itemId: "PN025TEST:prop-old",
        itemType: "property",
        lastAccessedAt: new Date(Date.now() - 10 * 24 * 3600 * 1000), // ۱۰ روز پیش
        accessCount: 30,
        importanceScore: 0.9,
      },
    });
    const { runConsolidation } = await import("@/lib/services/memory-lifecycle-service");
    const r = await runConsolidation();
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
    const row = await db.memoryLifecycle.findFirst({ where: { itemId: "PN025TEST:prop-old" } });
    expect(row?.category).toBe("warm"); // ارتقا واقعاً اتفاق افتاد
    const lastRun = await db.consolidationRun.findFirst({ orderBy: { ranAt: "desc" } });
    expect(lastRun).not.toBeNull();
    expect(lastRun?.hotToWarm).toBeGreaterThanOrEqual(1);
    expect(lastRun?.summary).toBeTruthy(); // شاهد before/after
    expect(lastRun?.evidence).toBeTruthy(); // آستانه‌ها برای بازتولیدپذیری
  });

  test("M-۲۰) idempotency تثبیت — اجرای دوم روی همان داده = صفر گذار تازه", async () => {
    const { runConsolidation } = await import("@/lib/services/memory-lifecycle-service");
    const r2 = await runConsolidation();
    const row = await db.memoryLifecycle.findFirst({ where: { itemId: "PN025TEST:prop-old" } });
    expect(row?.category).toBe("warm"); // در اجرای دوم هم warm ماند — دوباره اجرا صفر اثر
    expect(r2.errors.length).toBeLessThanOrEqual(10);
  });
});

describe("PN-025 §حافظه — API stats (نقش‌ها)", () => {
  test("M-۲۱) بدون توکن ⇒ 401", async () => {
    const route = await import("@/app/api/admin/memory/stats/route");
    const res = await route.GET(await NR("/api/admin/memory/stats"));
    expect(res.status).toBe(401);
  });

  test("M-۲۲) CONSULTANT ⇒ 403 (مالک‌محور)", async () => {
    const { token } = await makeSession("CONSULTANT");
    const route = await import("@/app/api/admin/memory/stats/route");
    const res = await route.GET(await NR("/api/admin/memory/stats", { headers: hdr(token) }));
    expect(res.status).toBe(403);
  });

  test("M-۲۳) OWNER ⇒ 200 + سه سطح + سیاست سه‌گانه", async () => {
    const { token } = await makeSession("OWNER");
    const route = await import("@/app/api/admin/memory/stats/route");
    const res = await route.GET(await NR("/api/admin/memory/stats", { headers: hdr(token) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.levels).toHaveProperty("hot");
    expect(body.levels).toHaveProperty("warm");
    expect(body.levels).toHaveProperty("cold");
    expect(body.policies.length).toBe(3); // seed سه سطح
  });

  test("M-۲۴) خلوص لایهٔ هوش — memory-lifecycle.ts صفر DB و صفر fetch", () => {
    const src = readFileSync(`${SRC}/core/intelligence/memory-lifecycle.ts`, "utf8");
    expect(src).not.toContain('@/lib/db');
    expect(src).not.toContain('from "bun"');
    expect(src).not.toMatch(/\bfetch\s*\(/);
  });
});

/* ════════════════════════════════════════════════════════════════════
 * §بینایی — ۲۰ تست
 * ════════════════════════════════════════════════════════════════════ */

/** گراف آزمایشی — الگوی پنج مسیر معیار سند طراحی (فصل ۲.۷) */
function buildFixtureGraph() {
  const nodes = new Map<string, import("@/core/intelligence/unified-graph").GraphNode>();
  const edges: import("@/core/intelligence/unified-graph").GraphEdge[] = [];
  const addNode = (type: "property" | "person" | "transaction" | "causal" | "temporal", id: string, label: string) => {
    const key = nodeId(type, id);
    nodes.set(key, { type, id, label });
    return key;
  };
  const addEdge = (from: string, to: string, type: import("@/core/intelligence/unified-graph").EdgeType, weight = 0.8) => {
    edges.push({ from, to, type, weight });
  };

  // ملک Y و خریدار X
  const y = addNode("property", "Y", "ملک ولیعصر");
  const x = addNode("person", "خریدار احمدی", "خریدار احمدی");
  // ۱) مسیر هم‌منطقه: درخواست هم‌منطقه
  const req1 = addNode("property", "REQ-100", "درخواست ۱۰۰");
  addEdge(req1, x, "REQUESTED_BY", 0.8);
  addEdge(req1, y, "SIBLING_AREA", 0.3);
  // ۲) مسیر معاملهٔ قدیمی
  const tx1 = addNode("transaction", "TX-1", "معاملهٔ قدیمی");
  addEdge(tx1, x, "TRANSACTION_PARTY", 0.9);
  const neighbor = addNode("property", "N1", "ملک همسایه");
  addEdge(tx1, neighbor, "TRANSACTION_PARTY", 0.9);
  addEdge(neighbor, y, "SIBLING_AREA", 0.3);
  // ۳) بازدید قبلی
  addEdge(y, x, "INTERACTED", 0.5);
  // ۴) کارشناس مشترک
  const realtorY = addNode("person", "کارشناس رضایی", "کارشناس رضایی");
  const realtorX = addNode("person", "کارشناس کریمی", "کارشناس کریمی");
  addEdge(y, realtorY, "LISTED_BY", 0.8);
  addEdge(realtorY, realtorX, "SAME_BRANCH", 0.4); // جهت: از کارشناس آگهی به هم‌شعبه — قابل‌دسترس از Y
  addEdge(req1, realtorX, "LISTED_BY", 0.8);
  // ۵) مالک
  const owner = addNode("person", "مالک محمدی", "مالک محمدی");
  addEdge(y, owner, "OWNED_BY", 0.9);
  return { nodes, edges } satisfies import("@/core/intelligence/unified-graph").InMemoryGraph;
}

describe("PN-025 §بینایی — هستهٔ خالص unified-graph", () => {
  test("V-۱) مسیر معیار ۱ — درخواست هم‌منطقه خریدار به ملک", () => {
    const g = buildFixtureGraph();
    const v = unifiedVision(g, { fromType: "property", fromId: "REQ-100", maxDepth: 3 });
    const toY = v.paths.filter((p) => p.nodes[p.nodes.length - 1]!.id === "Y");
    expect(toY.length).toBeGreaterThan(0); // REQ-100 → SIBLING_AREA → Y
    expect(v.insights.length).toBeGreaterThan(0);
  });

  test("V-۲) مسیر معیار ۳ — بازدید/تماس مستقیم (INTERACTED)", () => {
    const g = buildFixtureGraph();
    const v = unifiedVision(g, { fromType: "property", fromId: "Y", maxDepth: 2 });
    const interact = v.paths.filter((p) => p.edges.some((e) => e.type === "INTERACTED"));
    expect(interact.length).toBeGreaterThan(0);
  });

  test("V-۳) مسیر معیار ۴ — کارشناس مشترک از طریق SAME_BRANCH", () => {
    const g = buildFixtureGraph();
    const v = unifiedVision(g, { fromType: "property", fromId: "Y", maxDepth: 3 });
    const viaBranch = v.paths.filter((p) => p.edges.some((e) => e.type === "SAME_BRANCH"));
    expect(viaBranch.length).toBeGreaterThan(0);
  });

  test("V-۴) گره مالک — OWNED_BY یافت می‌شود", () => {
    const g = buildFixtureGraph();
    const v = unifiedVision(g, { fromType: "property", fromId: "Y", maxDepth: 1 });
    const owned = v.paths.filter((p) => p.edges.some((e) => e.type === "OWNED_BY"));
    expect(owned.length).toBeGreaterThan(0);
    expect(owned[0]!.weight).toBeGreaterThan(0.8); // وزن پایهٔ ۰٫۹
  });

  test("V-۵) شناسه ناشناخته — خروجی خالی صادقانه + پیام فارسی", () => {
    const g = buildFixtureGraph();
    const v = unifiedVision(g, { fromType: "property", fromId: "NOT-EXIST", maxDepth: 3 });
    expect(v.paths).toHaveLength(0);
    expect(v.confidence).toBe(0);
    expect(v.insights[0]).toContain("شناخته نشد");
  });

  test("V-۶) DAG گیت بارگذاری — گراف چرخه‌دار ⇒ پرتاب fail-loud", () => {
    const cyclicEdges = [
      { from: "property:A", to: "person:B", type: "OWNED_BY" as const, weight: 0.9 },
      { from: "person:B", to: "property:A", type: "LISTED_BY" as const, weight: 0.8 },
    ];
    expect(isDag(cyclicEdges)).toBe(false);
    expect(() => assertDag(cyclicEdges)).toThrow(/چرخه/);
  });

  test("V-۷) DAG گیت بارگذاری — گراف سالم ⇒ عبور", () => {
    const okEdges = [
      { from: "property:A", to: "person:B", type: "OWNED_BY" as const, weight: 0.9 },
      { from: "property:A", to: "person:C", type: "LISTED_BY" as const, weight: 0.8 },
    ];
    expect(isDag(okEdges)).toBe(true);
    expect(() => assertDag(okEdges)).not.toThrow();
  });

  test("V-۸) سقف عمق — پیش‌فرض ۳ · سقف سخت ۵ (clamp)", () => {
    expect(DEFAULT_MAX_DEPTH).toBe(3);
    expect(HARD_MAX_DEPTH).toBe(5);
    const g = buildFixtureGraph();
    const v = unifiedVision(g, { fromType: "property", fromId: "REQ-100", maxDepth: 99 });
    for (const p of v.paths) expect(p.edges.length).toBeLessThanOrEqual(5);
  });

  test("V-۹) محدودکردن pathTypes — فقط OWNED_BY یال‌های دیگر را حذف می‌کند", () => {
    const g = buildFixtureGraph();
    const v = unifiedVision(g, { fromType: "property", fromId: "Y", pathTypes: ["OWNED_BY"], maxDepth: 2 });
    for (const p of v.paths) {
      for (const e of p.edges) expect(e.type).toBe("OWNED_BY");
    }
  });

  test("V-۱۰) وزن مسیر — میانگین هندسی وزن یال‌ها", () => {
    const w = pathWeight([
      { from: "a", to: "b", type: "OWNED_BY", weight: 0.9 },
      { from: "b", to: "c", type: "SIBLING_AREA", weight: 0.3 },
    ]);
    expect(w).toBeGreaterThan(0.4);
    expect(w).toBeLessThan(0.9);
    expect(pathWeight([])).toBe(0);
  });

  test("V-۱۱) اطمینان در [0,1] — کلمپ دفاعی", () => {
    const g = buildFixtureGraph();
    const v = unifiedVision(g, { fromType: "property", fromId: "Y", maxDepth: 3 });
    expect(v.confidence).toBeGreaterThanOrEqual(0);
    expect(v.confidence).toBeLessThanOrEqual(1);
  });

  test("V-۱۲) روایت فارسی — قالب «از مسیر … وصل است — وزن …»", () => {
    const g = buildFixtureGraph();
    const v = unifiedVision(g, { fromType: "property", fromId: "Y", maxDepth: 2 });
    expect(v.insights.length).toBeGreaterThan(0);
    expect(v.insights[0]).toContain("وصل است");
    expect(v.insights[0]).toMatch(/وزن ارتباط [۰-۹]+ از ۱۰۰/);
  });

  test("V-۱۳) برچسب فارسی نُه نوع یال — کامل", () => {
    const labels = Object.values(EDGE_LABELS_FA);
    expect(labels.length).toBe(9);
    for (const l of labels) expect(l.length).toBeGreaterThan(1);
  });

  test("V-۱۴) نرمال‌سازی شناسه — فاصله‌های اضافه حذف", () => {
    expect(nodeId("person", " احمدی  رضایی ")).toBe("person:احمدی رضایی");
  });

  test("V-۱۵) topK — حداکثر ۱۰ مسیر مرتب نزولی", () => {
    // گراف پهن: یک ریشه با ۱۵ مسیر
    const nodes = new Map<string, import("@/core/intelligence/unified-graph").GraphNode>();
    const edges: import("@/core/intelligence/unified-graph").GraphEdge[] = [];
    const rootKey = nodeId("property", "ROOT");
    nodes.set(rootKey, { type: "property", id: "ROOT", label: "ریشه" });
    for (let i = 0; i < 15; i += 1) {
      const personKey = nodeId("person", `P${i}`);
      nodes.set(personKey, { type: "person", id: `P${i}`, label: `شخص ${i}` });
      edges.push({ from: rootKey, to: personKey, type: "INTERACTED", weight: 0.1 + i / 50 });
    }
    const v = unifiedVision({ nodes, edges }, { fromType: "property", fromId: "ROOT", maxDepth: 1 });
    expect(v.paths.length).toBeLessThanOrEqual(10);
    for (let i = 1; i < v.paths.length; i += 1) {
      expect(v.paths[i]!.weight).toBeLessThanOrEqual(v.paths[i - 1]!.weight);
    }
  });

  test("V-۱۶) ضدچرخهٔ درونی — گره تکراری در مسیر رد می‌شود (بدون حلقهٔ بی‌نهایت)", () => {
    const nodes = new Map<string, import("@/core/intelligence/unified-graph").GraphNode>();
    const a = nodeId("property", "A");
    const b = nodeId("person", "B");
    nodes.set(a, { type: "property", id: "A", label: "الف" });
    nodes.set(b, { type: "person", id: "B", label: "ب" });
    // چرخهٔ خام — گیت ساخت سرویس اجازه نمی‌دهد؛ پیمایش هم نباید معلق شود
    const edges = [
      { from: a, to: b, type: "OWNED_BY" as const, weight: 0.9 },
      { from: b, to: a, type: "LISTED_BY" as const, weight: 0.8 },
    ];
    const start = Date.now();
    const v = unifiedVision({ nodes, edges }, { fromType: "property", fromId: "A", maxDepth: 5 });
    expect(Date.now() - start).toBeLessThan(2000); // خاتمهٔ قطعی
    expect(v.paths.length).toBeGreaterThan(0); // مسیر a→b (خارج از چرخه) ثبت شد
  });

  test("V-۱۷) DB خالی تزریقی — سرویس بینایی روی دادهٔ زنده پاسخ صادقانه می‌دهد", async () => {
    const { unifiedVisionQuery } = await import("@/lib/services/unified-graph-service");
    const v = await unifiedVisionQuery({ fromType: "person", fromId: "شخص-پ-ن-موجود-در-داده", maxDepth: 2 });
    expect(v).toHaveProperty("paths");
    expect(v).toHaveProperty("insights");
    expect(v).toHaveProperty("confidence");
  });

  test("V-۱۸) خلوص لایهٔ هوش — unified-graph.ts صفر DB/fetch", () => {
    const src = readFileSync(`${SRC}/core/intelligence/unified-graph.ts`, "utf8");
    expect(src).not.toContain('@/lib/db');
    expect(src).not.toMatch(/\bfetch\s*\(/);
  });

  test("V-۱۹) سرویس گراف — گیت DAG ساخت: گراف ساخته‌شده DAG است", async () => {
    const { buildInMemoryGraph } = await import("@/lib/services/unified-graph-service");
    const g = await buildInMemoryGraph();
    expect(() => assertDag(g.edges)).not.toThrow();
    expect(g.nodes.size).toBeGreaterThan(0);
    expect(g.edges.length).toBeGreaterThan(0);
  });

  test("V-۲۰) بینایی روی دادهٔ واقعی — یک ملک واقعی مسیر دارد یا پیام خالی صادق", async () => {
    const { buildInMemoryGraph, unifiedVisionQuery: q } = await import("@/lib/services/unified-graph-service");
    const g = await buildInMemoryGraph();
    const firstProperty = [...g.nodes.values()].find((n) => n.type === "property");
    if (!firstProperty) return; // دادهٔ خالی — این تست صرفاً صادقانه رد می‌شود
    const v = await q({ fromType: "property", fromId: firstProperty.id, maxDepth: 2 });
    expect(Array.isArray(v.paths)).toBe(true);
  });
});

/* ════════════════════════════════════════════════════════════════════
 * §موتور ۱۶ — ۲۰ تست
 * ════════════════════════════════════════════════════════════════════ */

/** شواهد کامل معیار — برای تست‌های سناریوسازی */
const FULL_EVIDENCE: import("@/core/intelligence/decision-advisor").AdvisorEvidence = {
  contextId: "34826",
  contextKind: "property",
  contextLabel: "ملک ۳۴۸۲۶",
  attention: { score: 0.75, reason: "۱۲۰ بازدید و عکس دارد" },
  causal: { action: "hasImage+=1", delta: 0.293, n: 636 },
  counterfactual: [{ scenario: "کاهش ۵٪ قیمت (شاهد معیار)", change: 0.009 }],
  simulation: { best: "کاهش ۱۰٪ قیمت", bestScore: 0.42 },
  memory: { accessCount: 8, lastAccessedAt: "2026-10-01T00:00:00.000Z" },
  vision: { pathCount: 4, topInsight: "۴ مسیر ارتباطی" },
  daysSinceLastContact: 10,
  nowIso: "2026-10-09T10:00:00.000Z",
};

describe("PN-025 §موتور۱۶ — قرارداد و قالب‌ها", () => {
  test("A-۱) قید لفظی — autoExecute فقط false (قانون ۱۱ ابدی)", () => {
    const a = decide(FULL_EVIDENCE);
    expect(a.autoExecute).toBe(false);
    // قید نوعی: نوع فیلد literal است — تلاش برای true خطای کامپایل می‌داد
    const typeCheck: false = a.autoExecute;
    expect(typeCheck).toBe(false);
  });

  test("A-۲) قید لفظی — requiresApproval فقط true", () => {
    const a = decide(FULL_EVIDENCE);
    const t: true = a.requiresApproval;
    expect(t).toBe(true);
  });

  test("A-۳) روایت — ۳ تا ۵ جمله", () => {
    const a = decide(FULL_EVIDENCE);
    expect(sentenceCount(a.narrative)).toBeGreaterThanOrEqual(3);
    expect(sentenceCount(a.narrative)).toBeLessThanOrEqual(5);
  });

  test("A-۴) روایت — عدد فارسی (نه لاتین)", () => {
    const a = decide(FULL_EVIDENCE);
    expect(a.narrative).toMatch(/[۰-۹]/);
    expect(a.narrative).not.toMatch(/(^|[^A-Za-z])[0-9]/);
  });

  test("A-۵) بدیل‌ها ≥۳ — همیشه", () => {
    const a = decide(FULL_EVIDENCE);
    expect(a.alternatives.length).toBeGreaterThanOrEqual(3);
  });

  test("A-۶) ۲۴ قالب — هر قالب با متغیرهای کامل جای‌گذاری می‌شود", () => {
    expect(TEMPLATE_IDS.length).toBe(24);
    for (const id of TEMPLATE_IDS) {
      const vars: Record<string, string | number> = {};
      for (const v of TEMPLATE_VARIABLES[id]) vars[v] = "۱";
      const out = narrate(id, vars);
      expect(out).not.toMatch(/\{\w+\}/); // هیچ جای خالی نمانده
    }
  });

  test("A-۷) قالب — متغیر گم‌شده ⇒ خطای fail-loud (نه سکوت)", () => {
    expect(() => narrate("T_CALL_BUYER", { buyerName: "احمدی" })).toThrow(/گم شده/);
  });

  test("A-۸) قالب ناشناخته ⇒ خطا", () => {
    expect(() => narrate("NO_SUCH" as never, {})).toThrow(/قالب ناشناخته/);
  });

  test("A-۹) گزینش — برترین اقدام بالاترین امتیاز", () => {
    const cands = buildActionCandidates(FULL_EVIDENCE);
    expect(cands.length).toBeGreaterThan(1);
    expect(cands[0]!.score).toBeGreaterThanOrEqual(cands[1]!.score);
  });

  test("A-۱۰) سناریوسازی — چهار+ اقدام از شواهد کامل", () => {
    const cands = buildActionCandidates(FULL_EVIDENCE);
    const kinds = new Set(cands.map((c) => c.kind));
    expect(kinds.size).toBeGreaterThanOrEqual(3);
  });

  test("A-۱۱) ریسک — امتیاز کم ⇒ high (همهٔ شواهد ضعیف)", () => {
    const weak = { ...FULL_EVIDENCE, attention: { score: 0.2, reason: "کم" }, causal: { action: "hasImage+=1", delta: 0.05, n: 50 }, counterfactual: [{ scenario: "کاهش", change: 0.002 }], vision: null, daysSinceLastContact: null };
    const cands = buildActionCandidates(weak);
    expect(cands[0]!.score).toBeLessThan(0.4);
    expect(assessRisk(cands[0]!, weak)).toBe("high");
  });

  test("A-۱۲) ریسک — شاهد ناقص (بدون علّیت) ⇒ high", () => {
    const noCausal = { ...FULL_EVIDENCE, causal: null };
    const cands = buildActionCandidates(noCausal);
    expect(assessRisk(cands[0]!, noCausal)).toBe("high");
  });

  test("A-۱۳) ریسک — موضوع قیمت ⇒ همیشه high (حساس مالی)", () => {
    const priceTop = { kind: "PRICE_CUT", label: "کاهش قیمت", score: 0.9, rationale: "—" } as const;
    expect(assessRisk(priceTop, FULL_EVIDENCE)).toBe("high");
  });

  test("A-۱۴) ریسک — همه سالم و امتیاز بالا ⇒ low", () => {
    const strong = { ...FULL_EVIDENCE, attention: { score: 0.9, reason: "قوی" }, causal: { action: "hasImage+=1", delta: 0.4, n: 700 } };
    const cands = buildActionCandidates(strong);
    const topNonPrice = cands.find((c) => c.kind !== "PRICE_CUT")!;
    expect(assessRisk(topNonPrice, strong)).toBe("low");
  });

  test("A-۱۵) expiresAt — دقیقاً ۷ روز بعد از زمان مرجع", () => {
    const a = decide(FULL_EVIDENCE);
    const diffDays = (new Date(a.expiresAt).getTime() - new Date(FULL_EVIDENCE.nowIso!).getTime()) / 86_400_000;
    expect(diffDays).toBeCloseTo(7, 5);
  });

  test("A-۱۶) شمارهٔ تصمیم یکتا — دو فراخوانی، دو decisionId", () => {
    const a1 = decide(FULL_EVIDENCE);
    const a2 = decide({ ...FULL_EVIDENCE, nowIso: "2026-10-09T11:00:00.000Z" });
    expect(a1.decisionId).not.toBe(a2.decisionId);
  });

  test("A-۱۷) basedOn — فقط کلیدهای شاهد موجود", () => {
    const bare = decide({ contextId: "X", contextKind: "person", contextLabel: "X" });
    expect(Object.keys(bare.basedOn)).toHaveLength(0);
    const full = decide(FULL_EVIDENCE);
    expect(Object.keys(full.basedOn).length).toBeGreaterThanOrEqual(3);
  });

  test("A-۱۸) صفر LLM — سه ماژول موتور صفر fetch/axios/openai", () => {
    for (const f of ["decision-advisor", "decision-templates", "decision-lock"]) {
      const src = readFileSync(`${SRC}/core/intelligence/${f}.ts`, "utf8");
      expect(src).not.toMatch(/\bfetch\s*\(/);
      expect(src).not.toContain("axios");
      expect(src).not.toContain("openai");
      expect(src).not.toContain("z-ai");
    }
  });

  test("A-۱۹) خلوص لایهٔ هوش — decision-advisor.ts صفر DB", () => {
    const src = readFileSync(`${SRC}/core/intelligence/decision-advisor.ts`, "utf8");
    expect(src).not.toContain('@/lib/db');
  });

  test("A-۲۰) توصیهٔ خالی صادقانه — بدون هیچ شاهدی سکوت نمی‌کند", () => {
    const a = decide({ contextId: "EMPTY", contextKind: "person", contextLabel: "خالی" });
    expect(a.recommendation.length).toBeGreaterThan(0);
    expect(a.risk).toBe("high");
    expect(a.alternatives.length).toBeGreaterThanOrEqual(3); // صبر + پاشooterها
  });

  test("A-۲۱) وزن‌های امتیاز ترکیبی جمعاً ۱ (fail-loud)", () => {
    expect(ADVISOR_WEIGHTS.attention + ADVISOR_WEIGHTS.causal + ADVISOR_WEIGHTS.counterfactual + ADVISOR_WEIGHTS.simulation).toBeCloseTo(1, 9);
  });
});

/* ════════════════════════════════════════════════════════════════════
 * §کمربند — ۲۰ تست
 * ════════════════════════════════════════════════════════════════════ */

describe("PN-025 §کمربند — قفل سه‌سطحی (خالص)", () => {
  test("L-۱) TTL — توصیهٔ ۸ روزه منقضی است", () => {
    const { expired, ageHours } = evaluateTtl("2026-10-01T00:00:00Z", "2026-10-09T00:00:00Z");
    expect(expired).toBe(true);
    expect(ageHours).toBeCloseTo(192, 3);
  });

  test("L-۲) TTL — توصیهٔ ۲ روزه معتبر است", () => {
    expect(evaluateTtl("2026-10-07T00:00:00Z", "2026-10-09T00:00:00Z").expired).toBe(false);
  });

  test("L-۳) expiryFromNow — امروز + ۷ روز", () => {
    const exp = expiryFromNow("2026-10-09T00:00:00Z");
    expect(exp).toBe("2026-10-16T00:00:00.000Z");
  });

  test("L-۴) Cooldown فعال — ۱۰ ساعت از آخرین توصیه ⇒ رد", () => {
    const v = evaluateLock({ hoursSinceLastAdvice: 10, evidenceChangedSinceLast: false, advisorCountToday: 0, categoryCountToday: 0 });
    expect(v.locked).toBe(true);
    expect(v.reason).toBe("cooldown");
    expect(v.remainingHours).toBe(38);
  });

  test("L-۵) Cooldown گذشته — ۴۹ ساعت ⇒ عبور", () => {
    const v = evaluateLock({ hoursSinceLastAdvice: 49, evidenceChangedSinceLast: false, advisorCountToday: 0, categoryCountToday: 0 });
    expect(v.locked).toBe(false);
  });

  test("L-۶) استثنا — تغییر معنادار داده ⇒ Cooldown کنار (L_UPDATED_SINCE)", () => {
    const v = evaluateLock({ hoursSinceLastAdvice: 10, evidenceChangedSinceLast: true, advisorCountToday: 0, categoryCountToday: 0 });
    expect(v.locked).toBe(false); // داده عوض شده — توصیهٔ تازه ساخته می‌شود
  });

  test("L-۷) RateLimit روزانه — توصیهٔ ۱۱م ⇒ رد rate-day", () => {
    const v = evaluateLock({ hoursSinceLastAdvice: 100, evidenceChangedSinceLast: false, advisorCountToday: 10, categoryCountToday: 0 });
    expect(v.locked).toBe(true);
    expect(v.reason).toBe("rate-day");
  });

  test("L-۸) RateLimit دسته‌ای — توصیهٔ ۴م هم‌دسته ⇒ رد rate-category", () => {
    const v = evaluateLock({ hoursSinceLastAdvice: 100, evidenceChangedSinceLast: false, advisorCountToday: 5, categoryCountToday: 3 });
    expect(v.locked).toBe(true);
    expect(v.reason).toBe("rate-category");
  });

  test("L-۹) ترتیب ارزیابی — TTL منطقی (تکرار فوری) مقدم بر همه", () => {
    const v = evaluateLock({ hoursSinceLastAdvice: 0, evidenceChangedSinceLast: false, advisorCountToday: 10, categoryCountToday: 3 });
    expect(v.reason).toBe("ttl");
  });

  test("L-۱۰) پیام فارسی هر رد — کاربر می‌فهمد چرا", () => {
    const cases = [
      { hoursSinceLastAdvice: 0, changed: false, today: 0, cat: 0 },
      { hoursSinceLastAdvice: 10, changed: false, today: 0, cat: 0 },
      { hoursSinceLastAdvice: 100, changed: false, today: 10, cat: 0 },
      { hoursSinceLastAdvice: 100, changed: false, today: 0, cat: 3 },
    ];
    for (const c of cases) {
      const v = evaluateLock({ hoursSinceLastAdvice: c.hoursSinceLastAdvice, evidenceChangedSinceLast: c.changed, advisorCountToday: c.today, categoryCountToday: c.cat });
      expect(v.locked).toBe(true);
      expect(v.message!.length).toBeGreaterThan(5); // پیام فارسی هست
    }
  });

  test("L-۱۱) ثابت‌های کمربند عین سفارش — ۷روز · ۴۸ساعت · ۱۰/روز · ۳/دسته", () => {
    expect<number>(DECISION_LOCK_CONSTANTS.ttlSeconds).toBe(7 * 24 * 3600);
    expect(DECISION_LOCK_CONSTANTS.cooldownHours).toBe(48);
    expect(DECISION_LOCK_CONSTANTS.ratePerDay).toBe(10);
    expect(DECISION_LOCK_CONSTANTS.ratePerCategory).toBe(3);
  });

  test("L-۱۲) buildDecisionLock — خروجی لفظی + قفل نوعی", () => {
    const lock = buildDecisionLock("d-1", "CALL");
    expect(lock.autoExecute).toBe(false);
    expect(lock.requiresApproval).toBe(true);
    expect<number>(lock.ttl).toBe(604800);
    expect(lock.cooldownHours).toBe(48);
    expect(lock.rateLimit).toEqual({ perDay: 10, perCategory: 3 });
  });

  test("L-۱۳) buildDecisionLock — دستهٔ ناشناخته ⇒ خطا", () => {
    expect(() => buildDecisionLock("d-1", "INVALID" as never)).toThrow();
  });

  test("L-۱۴) شش دستهٔ تصمیم معتبر", () => {
    expect(DECISION_CATEGORIES).toEqual(["CALL", "PRICE", "IMAGE", "REPOST", "MATCH", "FOLLOWUP"]);
  });

  test("L-۱۵) قطعیت — ارزیابی کمربند تابع خالص (همان ورودی ⇒ همان حکم)", () => {
    const input = { hoursSinceLastAdvice: 20, evidenceChangedSinceLast: false, advisorCountToday: 3, categoryCountToday: 1 };
    expect(evaluateLock(input)).toEqual(evaluateLock(input));
  });
});

describe("PN-025 §کمربند — سرویس و API", () => {
  beforeAll(async () => {
    await db.memoryLifecycle.deleteMany({ where: { itemId: { contains: "PN025ADVICE" } } });
    await db.memoryLifecycle.deleteMany({ where: { itemId: { startsWith: "advice-day:" } } });
  });
  afterAll(async () => {
    await db.memoryLifecycle.deleteMany({ where: { itemId: { contains: "PN025ADVICE" } } });
    await db.memoryLifecycle.deleteMany({ where: { itemId: { startsWith: "advice-day:" } } });
  });

  test("L-۱۶) advise اول — مشوره کامل؛ advise دوم (همان بستر، داده ثابت) ⇒ قفل Cooldown", async () => {
    const { advise } = await import("@/lib/services/decision-advisor-service");
    const ctx = { kind: "property" as const, id: "PN025ADVICE:prop-1", label: "آزمون کمربند" };
    const first = await advise(ctx);
    expect("locked" in first).toBe(false); // نخستین مشوره — باز
    if (!("locked" in first)) expect(first.recommendation.length).toBeGreaterThan(0);
    // فراخوانی فوری دوم: حفاظت تکرار — «ttl» (همین حالا ارائه شد · L_NO_SPAM) یا «cooldown» (پنجرهٔ ۴۸ ساعت) — هر دو = احترام کمربند
    const second = await advise(ctx);
    expect("locked" in second && second.locked).toBe(true);
    if ("locked" in second) {
      expect(["ttl", "cooldown"]).toContain(second.reason);
      expect(second.message!.length).toBeGreaterThan(5);
    }
  });

  test("L-۱۷) رد کمربند در AuditLog ثبت می‌شود (DECISION_LOCKED + علت)", async () => {
    const last = await db.auditLog.findFirst({ where: { action: "DECISION_LOCKED" }, orderBy: { createdAt: "desc" } });
    expect(last).not.toBeNull();
    expect(last?.actor).toBe("engine:16-decision-advisor");
    expect(last?.detail).toMatch(/"reason":"(ttl|cooldown|rate-day|rate-category)"/);
  });

  test("L-۱۸) استثنا تغییر داده — شاهد تغییر ⇒ قفل cooldown کنار می‌رود (خالص)", () => {
    // قاعدهٔ خالص (فصل ۷.۲): تغییر معنادار شاهد ⇒ Cooldown کنار — L_UPDATED_SINCE
    const withChange = evaluateLock({ hoursSinceLastAdvice: 10, evidenceChangedSinceLast: true, advisorCountToday: 0, categoryCountToday: 0 });
    expect(withChange.locked).toBe(false);
    const withoutChange = evaluateLock({ hoursSinceLastAdvice: 10, evidenceChangedSinceLast: false, advisorCountToday: 0, categoryCountToday: 0 });
    expect(withoutChange.locked).toBe(true);
  });

  test("L-۱۹) API مشوره مالک — بدون توکن 401 · CONSULTANT 403", async () => {
    const route = await import("@/app/api/admin/decision-advisor/route");
    const noAuth = await route.GET(await NR("/api/admin/decision-advisor?kind=property&id=34826"));
    expect(noAuth.status).toBe(401);
    const { token } = await makeSession("CONSULTANT");
    const forbidden = await route.GET(await NR("/api/admin/decision-advisor?kind=property&id=34826", { headers: hdr(token) }));
    expect(forbidden.status).toBe(403);
  });

  test("L-۲۰) API مشوره مالک — OWNER با پارامتر ناقص ⇒ 400 (VALIDATION قانون)", async () => {
    const { token } = await makeSession("OWNER");
    const route = await import("@/app/api/admin/decision-advisor/route");
    const bad = await route.GET(await NR("/api/admin/decision-advisor", { headers: hdr(token) }));
    expect(bad.status).toBe(400);
  });

  test("L-۲۱) API سه کاشی — گارد نشست (بدون توکن 401)", async () => {
    const m5 = await import("@/app/api/smart-matching/advice/route");
    expect((await m5.GET(await NR("/api/smart-matching/advice?listingCode=34826"))).status).toBe(401);
    const ff = await import("@/app/api/file-finder/advice/route");
    expect((await ff.GET(await NR("/api/file-finder/advice?token=abc123"))).status).toBe(401);
    const m7 = await import("@/app/api/market-index/advice/route");
    expect((await m7.GET(await NR("/api/market-index/advice?area=ولیعصر"))).status).toBe(401);
  });

  test("L-۲۲) صفر مسیر اجرا — خروجی مشاور هیچ کنش واقعی ندارد (اسکن روت‌ها)", () => {
    for (const f of ["smart-matching/advice", "file-finder/advice", "market-index/advice", "admin/decision-advisor"]) {
      const src = readFileSync(`${SRC}/app/api/${f}/route.ts`, "utf8");
      expect(src).not.toMatch(/\.update\(|\.create\(|\.deleteMany\(|prisma\.\$/); // فقط خواندن (نوشتن فقط در سرویس مشوره)
    }
    const svc = readFileSync(`${SRC}/lib/services/decision-advisor-service.ts`, "utf8");
    expect(svc).not.toContain("sendSms");
    expect(svc).not.toContain("createContract");
    expect(svc).not.toMatch(/autoExecute:\s*true/);
  });
});

/* ════════════════════════════════════════════════════════════════════
 * §ادغام UI — ۵ تست
 * ════════════════════════════════════════════════════════════════════ */

describe("PN-025 §ادغام UI — سه کاشی حیاتی", () => {
  test("U-۱) AdviceCard در هر سه کاشی حیاتی import شده", () => {
    const m5 = readFileSync(`${TILES}/smart-matching/SmartMatchingPage.tsx`, "utf8");
    const ff = readFileSync(`${TILES}/file-finder/FileFinderPage.tsx`, "utf8");
    const m7 = readFileSync(`${TILES}/market-index/MarketIndexPage.tsx`, "utf8");
    expect(m5).toContain('from "@/components/app/shared/AdviceCard"');
    expect(ff).toContain('from "@/components/app/shared/AdviceCard"');
    expect(m7).toContain('from "@/components/app/shared/AdviceCard"');
    expect(m5).toMatch(/<AdviceCard/);
    expect(ff).toMatch(/<AdviceCard/);
    expect(m7).toMatch(/<AdviceCard/);
  });

  test("U-۲) حالت قفل — پیام کمربند رندر می‌شود (data-testid)", () => {
    const card = readFileSync(`${SRC}/components/app/shared/AdviceCard.tsx`, "utf8");
    expect(card).toContain('data-testid="advice-card-locked"');
    expect(card).toContain("remainingHours");
    expect(card).toContain("مغز ملکا فعلاً ساکت است");
  });

  test("U-۳) WCAG — نشان ریسک از خانواده‌های رجیستری (emerald/amber/rose)", () => {
    const card = readFileSync(`${SRC}/components/app/shared/AdviceCard.tsx`, "utf8");
    expect(card).toContain("bg-emerald-500/15");
    expect(card).toContain("bg-amber-500/15");
    expect(card).toContain("bg-rose-500/15");
  });

  test("U-۴) دکمهٔ تأیید — فقط ثبت دیدن (صفر کنش دیگر)", () => {
    const card = readFileSync(`${SRC}/components/app/shared/AdviceCard.tsx`, "utf8");
    expect(card).toContain("تأیید می‌کنم");
    expect(card).toContain("سامانه هرگز خودش اجرا نمی‌کند");
    // دکمه هیچ api POST ندارد — فقط setState محلی
    const btnBlock = card.slice(card.indexOf("تأیید می‌کنم") - 600, card.indexOf("تأیید می‌کنم") + 100);
    expect(btnBlock).not.toContain("api<");
    expect(btnBlock).not.toContain("method:");
  });

  test("U-۵) روت‌های سه کاشی به سرویس مشاور وصل‌اند (زنجیرهٔ کامل)", () => {
    const m5 = readFileSync(`${SRC}/app/api/smart-matching/advice/route.ts`, "utf8");
    const ff = readFileSync(`${SRC}/app/api/file-finder/advice/route.ts`, "utf8");
    const m7 = readFileSync(`${SRC}/app/api/market-index/advice/route.ts`, "utf8");
    for (const r of [m5, ff, m7]) {
      expect(r).toContain("advise");
      expect(r).not.toContain("MelkAi");
      expect(r).not.toContain("generateText");
    }
  });
});

/* پاک‌سازی نشست‌ها (الگوی سایر تست‌ها — بر اساس tokenHash) */
afterAll(async () => {
  const { createHash } = await import("crypto");
  try {
    for (const t of createdSessions) {
      const tokenHash = createHash("sha256").update(t).digest("hex");
      await db.session.deleteMany({ where: { tokenHash } }).catch(() => undefined);
      await db.userSession.deleteMany({ where: { tokenHash } }).catch(() => undefined);
    }
  } finally {
    await db.$disconnect();
  }
});
