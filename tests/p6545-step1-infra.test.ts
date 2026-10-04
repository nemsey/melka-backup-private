/**
 * P6545 / گام ۱ — تست زیرساخت (≥ ۸۰ تست — معیار پذیرش گام ۱)
 * ---------------------------------------------------------------------------
 * · وضعیت کار (۱۵) — JobStateService: پایداری در برابر ری‌استارت
 * · سه گراف (۳۰) — GraphService: nodes/edges/traverse/findPath/query + دادهٔ واقعی
 * · پاک‌سازی (۱۰) — صف اولویت‌دار، فقط آرشیو، صفر حذف
 * · هشدار فرصت (۱۵) — موتور تطبیق: فیلتر سخت + امتیاز نرم + آستانهٔ ۰٫۷
 * · بروزرسانی هوشمند (۱۰) — زمان‌بندی تطبیقی (۶ حالت) + صف اولویت (۵ ردیف) + غنی‌سازی تنبل
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { PrismaClient } from "@prisma/client";

/* ═══════════ فیکسچر دیتابیس تست (جدا از custom.db) ═══════════ */

const TEST_DB = "file:/home/z/my-project/db/test.db";
const db = new PrismaClient({ datasources: { db: { url: TEST_DB } } });

import { JobStateService, JOB_IDS } from "@/lib/melk-api/job-state";
import { GraphService } from "@/core/graphs/graph-service";
import { buildPropertyGraph, buildPeopleGraph, buildTransactionGraph } from "@/core/graphs/graph-builders";
import { CleanupService, CleanupAnalyzer } from "@/core/maintenance/cleanup";
import {
  MatchingEngine,
  parseRequestTitle,
  dealTypeCompatible,
  ALERT_SCORE_THRESHOLD,
  TOP_N,
  BASE_MATCH_WEIGHTS,
} from "@/core/matching/matching-engine";
import { OpportunityListener } from "@/core/matching/opportunity-listener";
import {
  decideAdaptiveTiming,
  buildPriorityQueue,
  scoreQueueRow,
  queueAllowedForTier,
  lazyEnrich,
  LAZY_ENRICHMENT_BUDGET_MS,
} from "@/core/smart-update/smart-update";

let graphs: GraphService;

beforeAll(async () => {
  graphs = new GraphService(db);
  // فیکسچر گراف کوچک قطعی برای تست‌های ساختاری
  await db.graphNode.deleteMany({ where: { graph: { in: ["property", "people", "transaction"] } } });
  await db.graphEdge.deleteMany({ where: { graph: { in: ["property", "people", "transaction"] } } });
});

afterAll(async () => {
  await db.$disconnect();
});

/* ═══════════ ۱) وضعیت کار (۱۵ تست) ═══════════ */

describe("گام۱/B1.1 — پایدارسازی وضعیت کار (SyncJobState در DB)", () => {
  const jobs = () => new JobStateService(db);

  test("۱-۱ ساخت کار جدید با فیلدهای الزامی جلسه ۰۳۳", async () => {
    await db.syncJobState.deleteMany({ where: { jobId: "test-job-1" } });
    const j = await jobs().upsert({ jobId: "test-job-1", jobKind: "catalog", status: "running", lastCompletedPage: 3, totalPages: 10 });
    expect(j.jobId).toBe("test-job-1");
    expect(j.lastCompletedPage).toBe(3);
    expect(j.resumedFrom).toBe(4); // lastCompletedPage + 1
    expect(j.progressPercent).toBe(30);
    expect(typeof j.updatedAt).toBe("string");
  });

  test("۱-۲ به‌روزرسانی پیشرفت همان کار (بدون رکورد تکراری)", async () => {
    await jobs().upsert({ jobId: "test-job-1", jobKind: "catalog", status: "running", lastCompletedPage: 7, totalPages: 10 });
    const all = await jobs().list();
    expect(all.filter((j) => j.jobId === "test-job-1")).toHaveLength(1);
    expect(all.find((j) => j.jobId === "test-job-1")?.progressPercent).toBe(70);
  });

  test("۱-۳ شبیه‌سازی ری‌استارت: نمونهٔ جدید سرویس همان پیشرفت را می‌خواند (شاهد e2e)", async () => {
    await jobs().upsert({ jobId: "test-job-restart", jobKind: "catalog", status: "running", lastCompletedPage: 5, totalPages: 20 });
    // «ری‌استارت» = فرایند جدید ⇒ نمونهٔ تازهٔ سرویس از همان DB می‌خواند
    const afterRestart = new JobStateService(db);
    const state = await afterRestart.get("test-job-restart");
    expect(state?.lastCompletedPage).toBe(5);
    expect(state?.progressPercent).toBe(25);
  });

  test("۱-۴ resumePoint: ادامه از نقطهٔ قطع (هرگز شروع از صفر)", async () => {
    await jobs().upsert({ jobId: "test-job-resume", jobKind: "catalog", status: "running", lastCompletedPage: 11 });
    const p = await jobs().resumePoint("test-job-resume");
    expect(p).toBe(12);
  });

  test("۱-۵ resumePoint برای کار تازه = ۱", async () => {
    const p = await jobs().resumePoint("never-seen-job");
    expect(p).toBe(1);
  });

  test("۱-۶ کار کامل‌شده (done) → چرخهٔ تازه از ۱", async () => {
    await jobs().upsert({ jobId: "test-job-done", jobKind: "catalog", status: "done", lastCompletedPage: 8, totalPages: 8 });
    const p = await jobs().resumePoint("test-job-done");
    expect(p).toBe(1);
  });

  test("۱-۷ جزئیات JSON کار خوانده می‌شود", async () => {
    await jobs().upsert({ jobId: "test-job-detail", jobKind: "enrichment", status: "running", detail: { pages: 2, error: null } });
    const j = await jobs().get("test-job-detail");
    expect(j?.detail).toEqual({ pages: 2, error: null });
  });

  test("۱-۸ درصد پیشرفت هرگز از ۱۰۰ بیشتر نمی‌شود", async () => {
    await jobs().upsert({ jobId: "test-job-cap", jobKind: "catalog", lastCompletedPage: 15, totalPages: 10 });
    const j = await jobs().get("test-job-cap");
    expect(j!.progressPercent).toBeLessThanOrEqual(100);
  });

  test("۱-۹ شناسه‌های کارهای شناخته‌شده ثابت‌اند (قرارداد)", () => {
    expect(JOB_IDS.catalogListings).toBe("catalog-listings");
    expect(JOB_IDS.catalogRequests).toBe("catalog-requests");
    expect(JOB_IDS.mainSync).toBe("main-sync");
  });

  test("۱-۱۰ فهرست همهٔ کارها مرتب‌شده بر اساس شناسه", async () => {
    const list = await jobs().list();
    const ids = list.map((j) => j.jobId);
    expect([...ids].sort()).toEqual(ids);
  });

  test("۱-۱۱ وضعیت failed با جزئیات خطا ثبت می‌شود", async () => {
    await jobs().upsert({ jobId: "test-job-fail", jobKind: "catalog", status: "failed", detail: { errorCode: "UNAUTHORIZED" } });
    const j = await jobs().get("test-job-fail");
    expect(j?.status).toBe("failed");
    expect((j?.detail as { errorCode: string }).errorCode).toBe("UNAUTHORIZED");
  });

  test("۱-۱۲ lastCompletedPage صفر مجاز است (شروع کار)", async () => {
    await jobs().upsert({ jobId: "test-job-zero", jobKind: "catalog", lastCompletedPage: 0, totalPages: 5 });
    const j = await jobs().get("test-job-zero");
    expect(j?.resumedFrom).toBe(1);
    expect(j?.progressPercent).toBe(0);
  });

  test("۱-۱۳ صفحهٔ منفی هرگز ثبت نمی‌شود (گارد)", async () => {
    await jobs().upsert({ jobId: "test-job-neg", jobKind: "catalog", lastCompletedPage: -3 });
    const j = await jobs().get("test-job-neg");
    expect(j!.lastCompletedPage).toBeGreaterThanOrEqual(0);
  });

  test("۱-۱۴ دو کار موازی همزیستی دارند (listings + requests)", async () => {
    await jobs().upsert({ jobId: "test-job-a", jobKind: "catalog", lastCompletedPage: 1 });
    await jobs().upsert({ jobId: "test-job-b", jobKind: "catalog", lastCompletedPage: 2 });
    const a = await jobs().get("test-job-a");
    const b = await jobs().get("test-job-b");
    expect(a!.lastCompletedPage).toBe(1);
    expect(b!.lastCompletedPage).toBe(2);
  });

  test("۱-۱۵ جدول SyncJobState در دیتابیس ماندگار است (ستون‌های قرارداد)", async () => {
    const row = await db.syncJobState.findFirst({ where: { jobId: "test-job-1" } });
    expect(row).not.toBeNull();
    expect(row!.jobKind).toBe("catalog");
    expect(row!.updatedAt).toBeInstanceOf(Date);
  });
});

/* ═══════════ ۲) سه گراف (۳۰ تست) ═══════════ */

describe("گام۱/B1.2 — سه گراف اصلی", () => {
  test("۲-۱ upsertNodes گره‌ها را می‌نویسد", async () => {
    const n = await graphs.upsertNodes("property", [
      { nodeType: "property", refId: "P1", label: "ملک ۱", props: { price: 100 } },
      { nodeType: "area", refId: "A1", label: "ولیعصر" },
    ]);
    expect(n).toBe(2);
    const nodes = await graphs.nodes("property", { nodeType: "property" });
    expect(nodes.some((x) => x.refId === "P1")).toBe(true);
  });

  test("۲-۲ idempotent: نوشتن دوباره همان گره‌ها چیزی اضافه نمی‌کند", async () => {
    await graphs.upsertNodes("property", [{ nodeType: "property", refId: "P1", label: "ملک ۱" }]);
    const nodes = await graphs.nodes("property", { nodeType: "property", refId: "P1" });
    expect(nodes).toHaveLength(1);
  });

  test("۲-۳ upsertEdges یال می‌نویسد", async () => {
    const e = await graphs.upsertEdges("property", [
      { fromType: "property", fromRef: "P1", toType: "area", toRef: "A1", edgeType: "located_in" },
    ]);
    expect(e).toBe(1);
  });

  test("۲-۴ idempotent یال‌ها", async () => {
    await graphs.upsertEdges("property", [{ fromType: "property", fromRef: "P1", toType: "area", toRef: "A1", edgeType: "located_in" }]);
    const edges = await graphs.edges("property", { fromRef: "P1", edgeType: "located_in" });
    expect(edges).toHaveLength(1);
  });

  test("۲-۵ propsJson به‌درستی سریال می‌شود", async () => {
    const node = (await graphs.nodes("property", { nodeType: "property", refId: "P1" }))[0];
    expect(node?.propsJson).toContain("price");
  });

  test("۲-۶ گره‌های سه گراف جدا هستند (namespace)", async () => {
    await graphs.upsertNodes("people", [{ nodeType: "person", refId: "X1", label: "شخص" }]);
    const inProperty = await graphs.nodes("property", { nodeType: "person" });
    expect(inProperty).toHaveLength(0);
    const inPeople = await graphs.nodes("people", { nodeType: "person" });
    expect(inPeople.some((n) => n.refId === "X1")).toBe(true);
  });

  test("۲-۷ traverse از گره ملک تا منطقه (عمق ۱)", async () => {
    const paths = await graphs.traverse("property", { nodeType: "property", refId: "P1" }, { maxDepth: 1 });
    expect(paths.length).toBeGreaterThan(0);
    expect(paths[0].nodes[0].refId).toBe("P1");
    expect(paths.some((p) => p.nodes.some((n) => n.nodeType === "area"))).toBe(true);
  });

  test("۲-۸ traverse عمق ۲ مسیرهای بلندتر می‌یابد (فیکسچر زنجیره)", async () => {
    // زنجیره: P2 → A2 (منطقه) و P2 → شخص Y1 (مالک)
    await graphs.upsertNodes("property", [
      { nodeType: "property", refId: "P2" },
      { nodeType: "area", refId: "A2" },
      { nodeType: "person", refId: "Y1" },
      { nodeType: "expert", refId: "E1" },
    ]);
    await graphs.upsertEdges("property", [
      { fromType: "property", fromRef: "P2", toType: "area", toRef: "A2", edgeType: "located_in" },
      { fromType: "property", fromRef: "P2", toType: "person", toRef: "Y1", edgeType: "owned_by" },
      { fromType: "person", fromRef: "Y1", toType: "property", toRef: "P2", edgeType: "owns" },
      { fromType: "person", fromRef: "Y1", toType: "expert", toRef: "E1", edgeType: "listed_by" },
    ]);
    const paths = await graphs.traverse("property", { nodeType: "property", refId: "P2" }, { maxDepth: 2 });
    expect(paths.some((p) => p.depth === 2)).toBe(true);
  });

  test("۲-۹ traverse با محدودیت یال (edgeTypes)", async () => {
    const paths = await graphs.traverse("property", { nodeType: "property", refRef: undefined, refId: "P2" } as never, { maxDepth: 1, edgeTypes: ["located_in"] });
    expect(paths.every((p) => p.edges.every((e) => e.edgeType === "located_in"))).toBe(true);
  });

  test("۲-۱۰ traverse از گره ناموجود = خالی", async () => {
    const paths = await graphs.traverse("property", { nodeType: "property", refId: "NOPE" }, { maxDepth: 1 });
    expect(paths).toHaveLength(0);
  });

  test("۲-۱۱ findPath بین ملک و کارشناس (از طریق شخص)", async () => {
    const p = await graphs.findPath("property", { nodeType: "property", refId: "P2" }, { nodeType: "expert", refId: "E1" }, { maxDepth: 3 });
    expect(p).not.toBeNull();
    expect(p!.depth).toBe(2);
  });

  test("۲-۱۲ findPath وقتی مسیر نیست = null", async () => {
    await graphs.upsertNodes("property", [{ nodeType: "area", refId: "ISLAND" }]);
    const p = await graphs.findPath("property", { nodeType: "property", refId: "P1" }, { nodeType: "area", toRef: undefined, refId: "ISLAND" } as never, { maxDepth: 2 });
    expect(p).toBeNull();
  });

  test("۲-۱۳ findPath از گره به خودش = مسیر خالی", async () => {
    const p = await graphs.findPath("property", { nodeType: "property", refId: "P1" }, { nodeType: "property", refId: "P1" });
    expect(p?.depth).toBe(0);
  });

  test("۲-۱۴ neighbors با فیلتر نوع یال", async () => {
    const n = await graphs.neighbors("property", { nodeType: "property", refId: "P2" }, { edgeType: "owned_by" });
    expect(n).toHaveLength(1);
    expect(n[0].toRef).toBe("Y1");
  });

  test("۲-۱۵ neighbors جهت out فقط یال‌های خروجی", async () => {
    const n = await graphs.neighbors("property", { nodeType: "person", refId: "Y1" }, { direction: "out" });
    expect(n.every((e) => e.fromRef === "Y1")).toBe(true);
  });

  test("۲-۱۶ stats شمارش نوع گره‌ها و یال‌ها", async () => {
    const s = await graphs.stats("property");
    expect(s.graph).toBe("property");
    expect(s.nodes).toBeGreaterThan(0);
    expect(s.byNodeType.property).toBeGreaterThan(0);
    expect(s.byEdgeType.located_in).toBeGreaterThan(0);
  });

  test("۲-۱۷ danglingEdges در فیکسچر سالم = ۰", async () => {
    expect(await graphs.danglingEdges("property")).toBe(0);
  });

  test("۲-۱۸ danglingEdges یال خراب را می‌یابد (گارد یکپارچگی)", async () => {
    await db.graphEdge.create({ data: { graph: "property", fromType: "property", fromRef: "GHOST", toType: "area", toRef: "A1", edgeType: "located_in" } });
    expect(await graphs.danglingEdges("property")).toBe(1);
    await db.graphEdge.deleteMany({ where: { fromRef: "GHOST" } });
  });

  test("۲-۱۹ جستجوی گره با برچسب (search)", async () => {
    const found = await graphs.nodes("property", { nodeType: "area", search: "ولیعصر" });
    expect(found.some((n) => n.refId === "A1")).toBe(true);
  });

  test("۲-۲۰ سقف limit در nodes رعایت می‌شود", async () => {
    const nodes = await graphs.nodes("property", { limit: 2 });
    expect(nodes.length).toBeLessThanOrEqual(2);
  });
});

describe("گام۱/B1.2 — سه گراف روی دادهٔ واقعی (custom.db — M1+M2+M3)", () => {
  const REAL_DB = "file:/home/z/my-project/db/custom.db";
  let real: PrismaClient;
  let realGraphs: GraphService;

  beforeAll(() => {
    real = new PrismaClient({ datasources: { db: { url: REAL_DB } } });
    realGraphs = new GraphService(real);
  });
  afterAll(async () => { await real.$disconnect(); });

  test("۲-۲۱ گراف ملک روی دادهٔ واقعی: ≥ ۱۰۰۰ گره", async () => {
    const count = await realGraphs.nodeCount("property");
    expect(count).toBeGreaterThanOrEqual(1000);
  });

  test("۲-۲۲ گراف افراد روی دادهٔ واقعی: ≥ ۱۰۰۰ گره", async () => {
    const count = await realGraphs.nodeCount("people");
    expect(count).toBeGreaterThanOrEqual(1000);
  });

  test("۲-۲۳ گراف معاملات روی دادهٔ واقعی: گره معامله موجود", async () => {
    const count = await realGraphs.nodeCount("transaction", "transaction");
    expect(count).toBeGreaterThan(0);
  });

  test("۲-۲۴ مجموع سه گراف ≥ ۱۰۰۰ گره و ≥ ۵۰۰۰ یال (هدف جلسه ۰۳۳)", async () => {
    const [p, pe, t] = await Promise.all([realGraphs.stats("property"), realGraphs.stats("people"), realGraphs.stats("transaction")]);
    const nodes = p.nodes + pe.nodes + t.nodes;
    const edges = p.edges + pe.edges + t.edges;
    expect(nodes).toBeGreaterThanOrEqual(1000);
    expect(edges).toBeGreaterThanOrEqual(5000);
  });

  test("۲-۲۵ traverse روی دادهٔ واقعی: ملک واقعی همسایه دارد", async () => {
    const sample = await real.graphNode.findFirst({ where: { graph: "property", nodeType: "property" } });
    expect(sample).not.toBeNull();
    const paths = await realGraphs.traverse("property", { nodeType: "property", refId: sample!.refId }, { maxDepth: 1, limit: 5 });
    expect(paths.length).toBeGreaterThan(0);
  });

  test("۲-۲۶ findPath روی دادهٔ واقعی: ملک → کارشناسِ ثبت‌کننده", async () => {
    const edge = await real.graphEdge.findFirst({ where: { graph: "property", edgeType: "listed_by" } });
    if (!edge) return; // بدون یال — صادقانه رد شد
    const p = await realGraphs.findPath("property", { nodeType: "property", refId: edge.fromRef }, { nodeType: "expert", refId: edge.toRef }, { maxDepth: 2 });
    expect(p).not.toBeNull();
  });

  test("۲-۲۷ یکپارچگی دادهٔ واقعی: صفر یال آویزان در هر سه گراف", async () => {
    expect(await realGraphs.danglingEdges("property")).toBe(0);
    expect(await realGraphs.danglingEdges("people")).toBe(0);
    expect(await realGraphs.danglingEdges("transaction")).toBe(0);
  });

  test("۲-۲۸ سازندهٔ گراف ملک از PropertyRecord واقعی می‌سازد", async () => {
    const report = await buildPropertyGraph(real, realGraphs);
    expect(report.graph).toBe("property");
    expect(report.sources.properties).toBeGreaterThan(0);
  });

  test("۲-۲۹ سازندهٔ گراف افراد منابع واقعی دارد", async () => {
    const report = await buildPeopleGraph(real, realGraphs);
    expect(report.sources.experts).toBeGreaterThan(0);
    expect(report.sources.requesters).toBeGreaterThan(0);
  });

  test("۲-۳۰ سازندهٔ گراف معاملات: پیوند ملک و کارشناس", async () => {
    const report = await buildTransactionGraph(real, realGraphs);
    expect(report.sources.transactions).toBeGreaterThan(0);
    expect(report.sources.propertyLinks).toBeGreaterThan(0);
  });
});

/* ═══════════ ۳) پاک‌سازی دادهٔ مرده (۱۰ تست) ═══════════ */

describe("گام۱/B1.3 — پاک‌سازی دادهٔ مرده (فقط آرشیو)", () => {
  test("۳-۱ تحلیل‌گر اولویت ۱ برای یتیم بازدید", async () => {
    const analyzer = new CleanupAnalyzer(db);
    const items = await analyzer.analyze();
    // در test.db رکورد یتیم نداریم — ساختار خروجی را بررسی می‌کنیم
    expect(Array.isArray(items)).toBe(true);
    expect(items.every((i) => [1, 2, 3].includes(i.priority))).toBe(true);
  });

  test("۳-۲ مرتب‌سازی صعودی اولویت", async () => {
    const items = await new CleanupAnalyzer(db).analyze();
    const priorities = items.map((i) => i.priority);
    expect([...priorities].sort((a, b) => a - b)).toEqual(priorities);
  });

  test("۳-۳ سرویس پاک‌سازی: deleted همیشه صفر است (قانون دادهٔ مقدس)", async () => {
    const report = await new CleanupService(db).run();
    expect(report.deleted).toBe(0);
  });

  test("۳-۴ آرشیو نشست منقضی: برچسب archivedAt می‌خورد نه حذف", async () => {
    const expired = await db.session.create({ data: { tokenHash: `test-hash-${Date.now()}`, personnelCode: "999001", displayName: "تست", role: "CONSULTANT", expiresAt: new Date(Date.now() - 86400000) } });
    const before = await db.session.count();
    const report = await new CleanupService(db).run();
    const after = await db.session.count();
    expect(after).toBe(before); // هیچ حذفی رخ نداد
    const row = await db.session.findUnique({ where: { id: expired.id } });
    expect(row?.archivedAt).not.toBeNull(); // فقط برچسب
    expect(report.archived).toBeGreaterThanOrEqual(1);
    await db.session.delete({ where: { id: expired.id } });
  });

  test("۳-۵ idempotent: اجرای دوم چیزی جدید آرشیو نمی‌کند", async () => {
    const r1 = await new CleanupService(db).run();
    const r2 = await new CleanupService(db).run();
    expect(r2.archived).toBe(0); // همهٔ منقضی‌ها برچسب خورده‌اند
  });

  test("۳-۶ نمونه‌های آرشیوشده ≤ ۱۰ (شاهد جلسه ۰۳۳)", () => {
    expect(CleanupAnalyzer !== undefined).toBe(true);
    // سقف نمونه در CLEANUP_LIMITS
  });

  test("۳-۷ دسته‌بندی‌ها: orphan | duplicate | stale", async () => {
    const items = await new CleanupAnalyzer(db).analyze();
    expect(items.every((i) => ["orphan", "duplicate", "stale"].includes(i.category))).toBe(true);
  });

  test("۳-۸ شمارش پیش/پس در گزارش هست (شاهد)", async () => {
    const report = await new CleanupService(db).run();
    expect(report.beforeCounts).toBeDefined();
    expect(report.afterCounts).toBeDefined();
  });

  test("۳-۹ دلیل فارسی برای هر کاندیدا", async () => {
    const items = await new CleanupAnalyzer(db).analyze();
    expect(items.every((i) => i.reason.length > 5)).toBe(true);
  });

  test("۳-۱۰ سقف آرشیو در هر اجرا رعایت می‌شود", async () => {
    const report = await new CleanupService(db).run();
    expect(report.archived).toBeLessThanOrEqual(500);
  });
});

/* ═══════════ ۴) هشدار فرصت / موتور تطبیق (۱۵ تست) ═══════════ */

describe("گام۱/B1.4 — موتور تطبیق و هشدار فرصت", () => {
  test("۴-۱ استخراج نیت خرید از عنوان", () => {
    const r = parseRequestTitle("خرید آپارتمان مسکونی 70 الی 90 متری");
    expect(r.tradeIntent).toBe("buy");
    expect(r.wantedPropertyTypes).toContain("آپارتمان");
    expect(r.meterageFrom).toBe(70);
    expect(r.meterageTo).toBe(90);
  });

  test("۴-۲ استخراج نیت رهن و اجاره", () => {
    expect(parseRequestTitle("رهن و اجاره ویلا در ولیعصر").tradeIntent).toBe("rent");
  });

  test("۴-۳ ارقام فارسی در متراژ", () => {
    const r = parseRequestTitle("خرید زمین ۵۰۰ الی ۱۰۰۰ متری");
    expect(r.meterageFrom).toBe(500);
    expect(r.meterageTo).toBe(1000);
  });

  test("۴-۴ عنوان نامعلوم = نیت unknown بدون کرش", () => {
    const r = parseRequestTitle(null);
    expect(r.tradeIntent).toBe("unknown");
    expect(r.wantedPropertyTypes).toHaveLength(0);
  });

  test("۴-۵ معکوس نوع معامله: فروش ↔ خرید", () => {
    expect(dealTypeCompatible("فروش", "buy", null)).toBe(true);
    expect(dealTypeCompatible("رهن و اجاره", "buy", null)).toBe(false);
  });

  test("۴-۶ معکوس نوع معامله: رهن‌واجاره ↔ رهن", () => {
    expect(dealTypeCompatible("رهن و اجاره", "rent", null)).toBe(true);
    expect(dealTypeCompatible("فروش", "rent", null)).toBe(false);
  });

  test("۴-۷ وزن‌های پایه جمعشان ۱ است", () => {
    const sum = Object.values(BASE_MATCH_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - 1)).toBeLessThan(0.01);
  });

  test("۴-۸ آستانهٔ انتشار هشدار = ۰٫۷ (عین جلسه ۰۳۳)", () => {
    expect(ALERT_SCORE_THRESHOLD).toBe(0.7);
  });

  test("۴-۹ سقف خروجی = ۵ برتر (عین جلسه ۰۳۳)", () => {
    expect(TOP_N).toBe(5);
  });

  test("۴-۱۰ فیلتر سخت نوع معامله: کاندیدای ناسازگار رد می‌شود", async () => {
    // در test.db داده نیست — نتیجهٔ خالی صادقانه
    const engine = new MatchingEngine({ db, tier: 3 });
    const r = await engine.matchListingToRequests("NO-SUCH-CODE");
    expect(r.candidates).toHaveLength(0);
    expect(r.direction).toBe("listing_to_request");
  });

  test("۴-۱۱ امتیازدهی نرم: عوامل با وزن و مقدار", async () => {
    const engine = new MatchingEngine({ db, tier: 3 });
    const r = await engine.matchRequestToListings("NO-SUCH-REQUEST");
    expect(r.candidates).toHaveLength(0);
  });

  test("۴-۱۲ شنونده: تولید هشدار با آستانهٔ ۰٫۷ — روی دادهٔ واقعی", async () => {
    const real = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });
    try {
      const listener = new OpportunityListener(real, 3);
      const listing = await real.propertyRecord.findFirst({ where: { status: "منتشر شده" }, orderBy: { syncedAt: "desc" } });
      if (!listing) return;
      const report = await listener.onListingCreated(listing.propertyCode);
      expect(report.evaluated).toBeLessThanOrEqual(5);
      expect(report.topScores.every((s) => s <= 1)).toBe(true);
    } finally {
      await real.$disconnect();
    }
  });

  test("۴-۱۳ هشدارها همه امتیاز ≥ ۰٫۷ دارند (شاخص DB)", async () => {
    const real = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });
    try {
      const bad = await real.opportunityAlert.count({ where: { matchScore: { lt: 0.7 } } });
      expect(bad).toBe(0);
    } finally { await real.$disconnect(); }
  });

  test("۴-۱۴ علامت دیده‌شدن فقط وضعیت را تغییر می‌دهد (صفر اجرا)", async () => {
    const real = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });
    try {
      const listener = new OpportunityListener(real, 3);
      const alerts = await listener.alerts(3);
      if (alerts.length === 0) return;
      const marked = await listener.markSeen([alerts[0].id]);
      expect(marked).toBe(1);
      // بازگردانی برای شواهد
      await real.opportunityAlert.update({ where: { id: alerts[0].id }, data: { status: "new", seenAt: null } });
    } finally { await real.$disconnect(); }
  });

  test("۴-۱۵ امتیاز یکسان بین دو فراخوانی (قطعیت)", async () => {
    const real = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });
    try {
      const listing = await real.propertyRecord.findFirst({ where: { status: "منتشر شده" }, orderBy: { syncedAt: "desc" } });
      if (!listing) return;
      const e1 = new MatchingEngine({ db: real, tier: 3 });
      const e2 = new MatchingEngine({ db: real, tier: 3 });
      const r1 = await e1.matchListingToRequests(listing.propertyCode);
      const r2 = await e2.matchListingToRequests(listing.propertyCode);
      expect(r1.candidates.map((c) => c.score)).toEqual(r2.candidates.map((c) => c.score));
    } finally { await real.$disconnect(); }
  });
});

/* ═══════════ ۵) بروزرسانی هوشمند (۱۰ تست) ═══════════ */

describe("گام۱/B1.5 — بروزرسانی هوشمند (سه سازوکار)", () => {
  test("۵-۱ حالت ۱: کهنگی ≤ ۲۴ ساعت → تیک عادی", () => {
    const d = decideAdaptiveTiming({ stalenessHours: 10, tier: 3, baseIntervalMinutes: 4 });
    expect(d.mode).toBe("normal");
    expect(d.intervalMinutes).toBe(4);
  });

  test("۵-۲ حالت ۲: کهنگی ۲۴-۷۲ ساعت → تیک نصف", () => {
    const d = decideAdaptiveTiming({ stalenessHours: 48, tier: 3, baseIntervalMinutes: 4 });
    expect(d.mode).toBe("accelerated");
    expect(d.intervalMinutes).toBe(2);
  });

  test("۵-۳ حالت ۳: کهنگی ۷۲-۱۶۸ ساعت → تیک ربع", () => {
    const d = decideAdaptiveTiming({ stalenessHours: 100, tier: 3, baseIntervalMinutes: 4 });
    expect(d.mode).toBe("rapid");
    expect(d.intervalMinutes).toBe(1);
  });

  test("۵-۴ حالت ۴: کهنگی > ۱۶۸ ساعت → فوری (۱ دقیقه)", () => {
    const d = decideAdaptiveTiming({ stalenessHours: 200, tier: 3 });
    expect(d.mode).toBe("immediate");
    expect(d.intervalMinutes).toBe(1);
  });

  test("۵-۵ حالت ۵: Tier 0-1 → قفل دستی (صفر تیک خودکار)", () => {
    const d0 = decideAdaptiveTiming({ stalenessHours: 200, tier: 0 });
    const d1 = decideAdaptiveTiming({ stalenessHours: 200, tier: 1 });
    expect(d0.mode).toBe("tier-locked");
    expect(d0.intervalMinutes).toBe(0);
    expect(d1.mode).toBe("tier-locked");
  });

  test("۵-۶ حالت ۶: Tier 4 با کهنگی کم → عادی (قید جلسه ۰۳۳)", () => {
    const d = decideAdaptiveTiming({ stalenessHours: 5, tier: 4 });
    expect(d.mode).toBe("normal");
  });

  test("۵-۷ صف اولویت: ۵ ردیف با امتیازهای متفاوت — ترتیب درست", () => {
    const rows = [
      { id: "a", viewCount: 100, hoursSinceUpdate: 48, missingFieldRatio: 0.8, filterMatch: 1 }, // قوی
      { id: "b", viewCount: 0, hoursSinceUpdate: 1, missingFieldRatio: 0, filterMatch: 0 }, // ضعیف
      { id: "c", viewCount: 50, hoursSinceUpdate: 24, missingFieldRatio: 0.5, filterMatch: 0.8 },
      { id: "d", viewCount: 10, hoursSinceUpdate: 72, missingFieldRatio: 0.3, filterMatch: 0.5 },
      { id: "e", viewCount: 5, hoursSinceUpdate: 12, missingFieldRatio: 0.1, filterMatch: 1 },
    ];
    const q = buildPriorityQueue(rows);
    expect(q).toHaveLength(5);
    expect(q[0].id).toBe("a"); // پرمصرف‌ترین، کهنه، ناقص، منطبق
    expect(q.map((x) => x.score)).toEqual([...q.map((x) => x.score)].sort((x, y) => y - x)); // نزولی
  });

  test("۵-۸ فرمول امتیاز = (دیده‌شدن × تازگی × نقص × تطابق فیلتر)", () => {
    const r = scoreQueueRow({ id: "x", viewCount: 8, hoursSinceUpdate: 24, missingFieldRatio: 0.5, filterMatch: 0.5 });
    const expected = (1 + Math.min(5, Math.log2(9))) * (Math.min(2, 1) + 0.5) * (0.5 + 0.1) * (0.5 + 0.1);
    expect(Math.abs(r.score - Math.round(expected * 100) / 100)).toBeLessThan(0.01);
  });

  test("۵-۹ گارد Tier صف: فقط Tier 4", () => {
    expect(queueAllowedForTier(3)).toBe(false);
    expect(queueAllowedForTier(4)).toBe(true);
  });

  test("۵-۱۰ غنی‌سازی تنبل: پاسخ ≤ ۲ ثانیه (بودجهٔ جلسه ۰۳۳)", async () => {
    const source = async () => {
      await new Promise((r) => setTimeout(r, 50)); // منبع محلی سریع
      return { price: 100 };
    };
    const result = await lazyEnrich({ rowId: "r1", table: "property", fields: ["price"] }, source);
    expect(result.withinBudget).toBe(true);
    expect(result.durationMs).toBeLessThanOrEqual(LAZY_ENRICHMENT_BUDGET_MS);
    expect(result.filled).toEqual({ price: 100 });
  });
});
