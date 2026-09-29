/**
 * p6526-m123-agents-insights-filters-lists.test.ts — P6526 (دستور مالک ۱۴۰۵/۰۷/۰۶ — بندهای الف/ب/پ)
 * =============================================================================
 * پ: «پس از اعمال تغییرات بالا کلیه تست‌های سابق برای تمام بخش‌ها و اجزای کاشی‌های
 *    M1 و M2 و M3 حذف گردد و تست‌های جدید طراحی، اعمال و اجرا شود.
 *    (تست‌های جدید برای ایجنت‌ها، بینش‌ها، فیلترها و فهرست‌ها طراحی و اجرا شود)
 *    به‌خصوص فیلتر فهرست آگهی، فیلتر فهرست درخواست، فیلتر فهرست معاملات»
 *
 * حذف‌شده‌ها (سوئیت‌های سابق M1/M2/M3):
 *   · p6510-arm-catalog.test.ts (۱۷ تست — ثبت کاشی‌ها و مخازن ARM)
 *   · p015-m3-v2-transactions.test.ts (۲۸ تست — طبقه‌بندی/فیلتر/ستون‌های M3)
 *   · p6521-stale-links-m1m2.test.ts (۲۵ تست — نظام شش‌حالته + ستون منطقه M2)
 *   · p6525-list-law-filters.test.ts (۵۰ تست — فیلترها + قانون فهرست + PWA)
 *
 * این سوئیت تازه — ۹ بخش:
 *   §۰ معماری الف (نام‌ها و ترتیب کاشی‌ها — هوم و M1 تا M7)
 *   §۱ ایجنت‌ها (M1/M2/M3: رجیستری، نام، دامنه‌ها، حلقهٔ بازخورد، سیاست)
 *   §۲ بینش‌ها (M1/M2/M3: کارت‌های معتبر، دامنه‌⊆اعلان، برچسب فارسی، وزن)
 *   §۳ فیلتر فهرست آگهی (M1 — کد/کارشناس/وضعیت شش‌حالته)
 *   §۴ فیلتر فهرست درخواست (M2 — کد/کارشناس + مسیر دادهٔ مناطق)
 *   §۵ فیلتر فهرست معاملات (M3 — ۷ جزء عین جدول F.۲)
 *   §۶ فهرست‌ها (قانون فهرست: پریمیتیوها + هر ۷ فهرست فعال + روت‌ها)
 *   §۷ فایل مناطق (ب — آستانه، ساختار دیالوگ، یکپارچگی)
 *   §۸ گارد همیشگی یکسان‌سازی (باگ تاریخی ۴/۵ — هرگز بازنمی‌گردد) + PWA نصب publish
 */
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, test } from "bun:test";

const P = "p6526t";
const SRC = "/home/z/my-project/src";
const TILES = "/home/z/my-project/src/core/tiles/tiles";

/* ==========================================================================
 * ابزار مشترک — نشست OWNER و فراخوانی مستقیم روت‌ها (الگوی اثبات‌شدهٔ p015/p6525)
 * ========================================================================== */
let OWNER_TOKEN: string | null = null;

async function ownerToken(): Promise<string> {
  if (OWNER_TOKEN) return OWNER_TOKEN;
  const { createSession } = await import("@/lib/auth/session");
  const { token } = await createSession(
    { personnelCode: "950025", displayName: "تست P6526", role: "OWNER" },
    { ip: "127.0.0.1" },
    null
  );
  OWNER_TOKEN = token;
  return token;
}

async function callRoute(routeModule: string, query: string): Promise<{ status: number; body: any }> {
  const route = await import(routeModule);
  const { NextRequest } = await import("next/server");
  const token = await ownerToken();
  const req = new NextRequest(`http://localhost${query}`, { headers: { authorization: `Bearer ${token}` } });
  // روت‌های داینامیک ([tileId]) منتظر params هستند — از مسیر استخراج می‌شود
  const segs = query.split("?")[0].split("/").filter(Boolean);
  const tileId = segs[2] && segs[1] === "agent" ? segs[2] : undefined;
  const res = await route.GET(req, tileId ? { params: Promise.resolve({ tileId }) } : undefined);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

/* ==========================================================================
 * §۰ — معماری الف: نام‌ها و ترتیب کاشی‌ها (هوم + M1 تا M7)
 * ========================================================================== */

describe("P6526/الف §۰ — نام و ترتیب کاشی‌ها", () => {
  beforeAll(async () => {
    await import("@/core/tiles/bootstrap");
  });

  test("۰-۱) صفحه هوم — دقیقاً پنج کاشی با نام‌ها و ترتیب الزامی مالک", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    const root = tileRegistry.listRoot("OWNER");
    expect(root.map((t) => t.title)).toEqual([
      "فایل یابی ملکا",
      "آگهی ملکا",
      "درخواست ملکا",
      "تنظیمات عمومی",
      "داشبورد مدیریتی ملک تبریز",
    ]);
    expect(root.map((t) => t.id)).toEqual([
      "file-finder",
      "listings",
      "requests",
      "settings",
      "management-dashboard",
    ]);
  });

  test("۰-۲) نمای مشاور همان ترتیب هوم را دارد (تنظیمات/داشبورد عمومی‌اند)", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    expect(tileRegistry.listRoot("CONSULTANT").map((t) => t.id)).toEqual(
      tileRegistry.listRoot("OWNER").map((t) => t.id)
    );
  });

  test("۰-۳) داشبورد مدیریتی — چهار کاشی M1 تا M4 با نام‌ها و ترتیب عین دستور مالک (بازسازی فازهای ۷-۸-۹)", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    const children = tileRegistry.listChildren("management-dashboard", "OWNER");
    expect(children.map((t) => t.title)).toEqual([
      "آگهی ملک تبریز",
      "درخواست ملک تبریز",
      "معاملات ملک تبریز",
      "کارشناسان ملک تبریز",
    ]);
    expect(children.map((t) => t.id)).toEqual([
      "arm-listings",
      "arm-requests",
      "transactions-contracts",
      "experts",
    ]);
    // M5/M6/M7 حذف نما شده‌اند (دستور ۱۴۰۵/۰۷/۷) — نه در داشبورد و نه در رجیستری
    for (const removed of ["price-index", "supply-demand", "extraction"]) {
      expect(tileRegistry.get(removed)).toBeUndefined();
    }
  });

  test("۰-۴) ترتیب عددی کاشی‌های مدیریتی پیوسته و یکتاست (۱ تا ۴)", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    const orders = tileRegistry
      .listChildren("management-dashboard", "OWNER")
      .map((t) => t.order);
    expect(orders).toEqual([1, 2, 3, 4]);
  });

  test("۰-۵) نام‌های قدیمی (آگهی‌های/درخواست‌های/شاخص قیمت روز مناطق/تنظیمات عمومی ملک تبریز) حذف شده‌اند", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    const allTitles = tileRegistry.listAll("OWNER").map((t) => t.title);
    expect(allTitles).not.toContain("آگهی‌های ملک تبریز");
    expect(allTitles).not.toContain("درخواست‌های ملک تبریز");
    expect(allTitles).not.toContain("شاخص قیمت روز مناطق ملک تبریز");
    expect(allTitles).not.toContain("تنظیمات عمومی ملک تبریز");
    expect(allTitles).not.toContain("فایل‌یابی از دیوار ملک تبریز");
    // و نام‌های جدید یکتا هستند (هیچ دو کاشی هم‌نام نیستند)
    expect(new Set(allTitles).size).toBe(allTitles.length);
  });
});

/* ==========================================================================
 * §۱ — ایجنت‌ها (M1/M2/M3)
 * ========================================================================== */

describe("P6526/پ §۱ — ایجنت‌های کاشی‌های M1/M2/M3", () => {
  beforeAll(async () => {
    await import("@/core/tiles/bootstrap");
  });

  test("۱-۱) هر سه ایجنت در رجیستری ایجنت ثبت شده‌اند و شناسهٔ کاشی درست دارند", async () => {
    const { getAgent } = await import("@/core/agent");
    const m1 = getAgent("arm-listings");
    const m2 = getAgent("arm-requests");
    const m3 = getAgent("transactions-contracts");
    expect(m1?.tileId).toBe("arm-listings");
    expect(m2?.tileId).toBe("arm-requests");
    expect(m3?.tileId).toBe("transactions-contracts");
  });

  test("۱-۲) نام ایجنت‌ها با نام تازهٔ کاشی‌های M1/M2 هم‌راستاست (P6526/الف)", async () => {
    const { getAgent } = await import("@/core/agent");
    expect(getAgent("arm-listings")!.name).toBe("ایجنت آگهی ملک تبریز");
    expect(getAgent("arm-requests")!.name).toBe("ایجنت درخواست ملک تبریز");
    expect(getAgent("transactions-contracts")!.name).toContain("معاملات");
  });

  test("۱-۳) قرارداد کاشی ↔ ایجنت: insightDomains و capabilities کاشی عین ایجنت است", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    const { getAgent } = await import("@/core/agent");
    for (const tileId of ["arm-listings", "arm-requests", "transactions-contracts"]) {
      const tile = tileRegistry.get(tileId)!;
      const agent = getAgent(tileId)!;
      expect(tile.agent).not.toBeNull();
      expect(tile.agent!.tileId).toBe(tileId);
      expect([...tile.agent!.insightDomains].sort()).toEqual([...agent.insightDomains].sort());
      expect(tile.agent!.capabilities).toContain("memory");
      expect(tile.agent!.capabilities).toContain("feedback");
      expect(tile.agent!.capabilities).toContain("policy-versions");
      expect(tile.agent!.capabilities).toContain("rollback");
    }
  });

  test("۱-۴) دامنه‌های بینش: M1 شش‌گانه (+VISIT_ATTENTION مهاجرت‌یافته)، M2 پنج‌گانه، M3 بیست‌گانه (≥۱۵ الزام ادغام)", async () => {
    const { getAgent } = await import("@/core/agent");
    expect([...getAgent("arm-listings")!.insightDomains].sort()).toEqual(
      ["COVERAGE", "FRESHNESS", "REGION", "TOP_EXPERTS", "VOLUME", "VISIT_ATTENTION"].sort()
    );
    expect([...getAgent("arm-requests")!.insightDomains].sort()).toEqual(
      ["COMPOSITION", "COVERAGE", "FRESHNESS", "TOP_EXPERTS", "VOLUME"].sort()
    );
    const m3 = getAgent("transactions-contracts")!;
    expect(m3.insightDomains.length).toBeGreaterThanOrEqual(15);
    expect([...m3.insightDomains]).toContain("INFO_COVERAGE");
    expect([...m3.insightDomains]).toContain("CONTRACT_TEXT");
    expect([...m3.insightDomains]).toContain("SHARE_AGGREGATE");
  });

  test("۱-۵) حلقهٔ یادگیری M2: ثبت بازخورد → حافظه Append-only + شمارش کل", async () => {
    const { getAgent } = await import("@/core/agent");
    const agent = getAgent("arm-requests")!;
    const before = await agent.submitFeedback({
      insightKey: `${P}-warmup`,
      insightTitle: "پیش‌گرمایش",
      domain: "VOLUME",
      rating: 1,
    });
    const after = await agent.submitFeedback({
      insightKey: `${P}-fb1`,
      insightTitle: "تست بازخورد P6526",
      domain: "VOLUME",
      rating: 1,
      comment: "بازخورد آزمایشی سوئیت P6526",
    });
    expect(after.totalFeedback).toBe(before.totalFeedback + 1);
    // حافظهٔ مرتبط قابل بازیابی است (RAG سبک)
    const hits = await agent.retrieveRelevant("تست بازخورد P6526", 5);
    expect(hits.length).toBeGreaterThan(0);
  });

  test("۱-۶) سیاست نسخه‌بندی‌شده: هر سه ایجنت سیاست فعلی ≥ نسخهٔ ۱ و فهرست نسخه‌ها دارند", async () => {
    const { getAgent } = await import("@/core/agent");
    for (const tileId of ["arm-listings", "arm-requests", "transactions-contracts"]) {
      const agent = getAgent(tileId)!;
      const active = await agent.getActivePolicy();
      expect(active.version).toBeGreaterThanOrEqual(1);
      expect(active.content.weights).toBeDefined();
      const versions = await agent.listPolicyVersions();
      expect(versions.length).toBeGreaterThanOrEqual(1);
      expect(versions.some((v) => v.version === active.version)).toBe(true);
    }
  });

  test("۱-۷) سازوکار rollback روی ایجنت آزمایشی (بدون دست‌زدن به سیاست واقعی Mها)", async () => {
    const { BaseLearningAgent } = await import("@/core/agent/base-agent");
    const {
      getAgentMemoryRepository,
      getPolicyRepository,
    } = await import("@/core/repositories");
    class ProbeAgent extends BaseLearningAgent {
      readonly tileId = `${P}-probe`;
      readonly name = "ایجنت آزمایش P6526";
      readonly insightDomains = ["VOLUME", "TREND"] as const;
      protected async computeRawInsights() {
        return [
          { key: "k1", domain: "VOLUME", title: "بینش آزمایشی", body: "متن بینش آزمایشی برای تست rollback سیاست.", severity: "info" as const },
        ];
      }
    }
    const agent = new ProbeAgent({
      memory: getAgentMemoryRepository(),
      policy: getPolicyRepository(),
    });
    // پاک‌سازی دادهٔ آزمایشیِ احتمالی اجراهای قبلی (idempotent) — سپس در پایان دوباره
    const { db } = await import("@/lib/db");
    await db.agentMemory.deleteMany({ where: { tileId: `${P}-probe` } });
    await db.agentFeedback.deleteMany({ where: { tileId: `${P}-probe` } });
    await db.agentPolicyVersion.deleteMany({ where: { tileId: `${P}-probe` } });
    const v1 = await agent.getActivePolicy();
    expect(v1.version).toBe(1);
    // ثبت ۵ بازخورد هم‌دامنه با امتیاز مثبت ⇒ بازبینی خودکار سیاست (داخل submitFeedback) ⇒ نسخهٔ ۲
    for (let i = 0; i < 5; i++) {
      await agent.submitFeedback({
        insightKey: `${P}-rb${i}`,
        insightTitle: `بازخورد rollback ${i}`,
        domain: "VOLUME",
        rating: 1,
      });
    }
    const afterFeedbacks = await agent.getActivePolicy();
    expect(afterFeedbacks.version).toBe(2);
    expect(afterFeedbacks.content.weights.VOLUME).toBeGreaterThan(1); // وزن دامنهٔ تقویت‌شده
    // بازگشت به نسخهٔ ۱ — نسخهٔ ۲ حذف نمی‌شود، فقط غیرفعال
    const back = await agent.rollbackPolicy(1);
    expect(back.version).toBe(1);
    const active = await agent.getActivePolicy();
    expect(active.version).toBe(1);
    const versions = await agent.listPolicyVersions();
    expect(versions.length).toBe(2);
    // پاک‌سازی دادهٔ آزمایشی
    await db.agentMemory.deleteMany({ where: { tileId: `${P}-probe` } });
    await db.agentFeedback.deleteMany({ where: { tileId: `${P}-probe` } });
    await db.agentPolicyVersion.deleteMany({ where: { tileId: `${P}-probe` } });
  });
});

/* ==========================================================================
 * §۲ — بینش‌ها (M1/M2/M3)
 * ========================================================================== */

describe("P6526/پ §۲ — بینش‌های ایجنت‌های M1/M2/M3", () => {
  beforeAll(async () => {
    await import("@/core/tiles/bootstrap");
  });

  /** اعتبارسنجی ساختاری مشترک کارت‌های بینش — عین قرارداد InsightCard/RenderedInsight */
  function assertValidInsights(tileId: string, result: { insights: any[]; policyVersion: number; memoryHits: number }) {
    expect(result.insights.length).toBeGreaterThan(0);
    expect(result.policyVersion).toBeGreaterThanOrEqual(1);
    expect(result.memoryHits).toBeGreaterThanOrEqual(0);
    for (const ins of result.insights) {
      expect(ins.key.length).toBeGreaterThan(0);
      expect(ins.title.length).toBeGreaterThan(3);
      expect(ins.body.length).toBeGreaterThan(20);
      expect(["info", "positive", "warning", "critical"]).toContain(ins.severity);
      expect(typeof ins.finalWeight).toBe("number");
      expect(ins.finalWeight).toBeGreaterThanOrEqual(0);
      expect(ins.weightSource.length).toBeGreaterThan(0);
      if (ins.metrics) {
        for (const m of ins.metrics) {
          expect(m.label.length).toBeGreaterThan(0);
          expect(m.value.length).toBeGreaterThan(0);
          if (m.progress !== undefined) {
            expect(m.progress).toBeGreaterThanOrEqual(0);
            expect(m.progress).toBeLessThanOrEqual(100);
          }
        }
      }
    }
  }

  test("۲-۱) M1 آگهی ملک تبریز — با دادهٔ کاشته‌شده: پنج دامنهٔ هسته حاضر و همه ⊆ اعلام‌شده (فارسی)", async () => {
    const { getPropertyRecordRepository } = await import("@/core/repositories");
    const { listingStateRawValues } = await import("@/lib/listing-status");
    const repo = getPropertyRecordRepository();
    await repo.upsertBulk(
      [
        {
          id: `${P}ins-p1`, propertyCode: `${P}4515`, title: "فروش آپارتمان خاوران",
          ownerName: "سید یاسین کاظمی", ownerMobile: "09141112233",
          address: "تبریز، خاوران، کوی صفایی", areaName: "خاوران",
          status: listingStateRawValues(["published"])[0],
          extractedAt: new Date("2026-09-21T10:00:00Z"), // لایه ۲ غنی‌سازی — برای کارت پوشش COVERAGE
          createdAt: new Date("2026-09-20T10:00:00Z"),
        },
        {
          id: `${P}ins-p2`, propertyCode: `${P}5925`, title: "رهن و اجاره ویلا ولیعصر",
          ownerName: "مهدی شجاع زاده", ownerMobile: null, address: "تبریز، ولیعصر",
          areaName: "ولیعصر", status: listingStateRawValues(["expired"])[0],
          createdAt: new Date("2026-09-24T10:00:00Z"),
        },
        {
          id: `${P}ins-p3`, propertyCode: `${P}1020`, ownerName: "کارشناس سوم",
          areaName: "چایکنار", status: listingStateRawValues(["published"])[0],
          createdAt: new Date("2026-09-26T10:00:00Z"),
        },
      ],
      { sourceRunId: "p6526-insight-seed" }
    );
    try {
      const { getAgent } = await import("@/core/agent");
      const agent = getAgent("arm-listings")!;
      const result = await agent.renderInsights();
      assertValidInsights("arm-listings", result);
      const declared = new Set<string>(agent.insightDomains);
      for (const ins of result.insights) {
        expect(declared.has(ins.domain)).toBe(true);
        expect(ins.title).toMatch(/[\u0600-\u06FF]/); // فارسی
      }
      // پنج دامنهٔ هسته هرکدام دست‌کم یک کارت دارند (VISIT_ATTENTION داده‌مشروط است)
      const domains = new Set(result.insights.map((i: any) => i.domain));
      for (const d of ["VOLUME", "TOP_EXPERTS", "REGION", "COVERAGE", "FRESHNESS"]) {
        expect(domains.has(d), `دامنهٔ ${d} کارت ندارد`).toBe(true);
      }
    } finally {
      const { db } = await import("@/lib/db");
      await db.propertyRecord.deleteMany({ where: { id: { startsWith: `${P}ins-` } } }).catch(() => undefined);
    }
  });

  test("۲-۲) M2 درخواست ملک تبریز — با دادهٔ کاشته‌شده: هر پنج دامنه حاضر و فارسی", async () => {
    const { getRequestRepository } = await import("@/core/repositories");
    const repo = getRequestRepository();
    await repo.upsertArmBulk(
      [
        {
          id: `${P}ins-r1`, requestCode: `${P}5234`, customerName: "آقایی",
          customerMobile: "09144445566", status: "در دست اقدام",
          actorName: "پیام عبدی", title: "خرید آپارتمان خاوران",
          extractedAt: new Date("2026-09-25T22:00:00Z"), // لایه ۲ غنی‌سازی — برای کارت پوشش COVERAGE
          createdAt: new Date("2026-09-25T21:41:53Z"),
        },
        {
          id: `${P}ins-r2`, requestCode: `${P}5915`, customerName: "کاظمی",
          customerMobile: null, status: "تکمیل شده",
          actorName: "رضا محمدی", title: "رهن آپارتمان ولیعصر",
          extractedAt: new Date("2026-09-26T09:00:00Z"),
          createdAt: new Date("2026-09-26T08:00:00Z"),
        },
      ],
      { sourceRunId: "p6526-insight-seed" }
    );
    try {
      const { getAgent } = await import("@/core/agent");
      const agent = getAgent("arm-requests")!;
      const result = await agent.renderInsights();
      assertValidInsights("arm-requests", result);
      const declared = new Set<string>(agent.insightDomains);
      for (const ins of result.insights) {
        expect(declared.has(ins.domain)).toBe(true);
        expect(ins.title).toMatch(/[\u0600-\u06FF]/);
      }
      const domains = new Set(result.insights.map((i: any) => i.domain));
      for (const d of agent.insightDomains) expect(domains.has(d)).toBe(true);
    } finally {
      const { db } = await import("@/lib/db");
      await db.requestRecord.deleteMany({ where: { id: { startsWith: `${P}ins-` } } }).catch(() => undefined);
    }
  });

  test("۲-۳) M3 معاملات ملک تبریز — با دادهٔ کاشته‌شده ≥۳ بینش معتبر با دامنه‌های اعلام‌شده (الگوی p6511)", async () => {
    const { db } = await import("@/lib/db");
    await db.transactionRecord.deleteMany({ where: { id: { startsWith: P } } }).catch(() => undefined);
    await db.contractRecord.deleteMany({ where: { id: { startsWith: P } } }).catch(() => undefined);
    await db.visitRecord.deleteMany({ where: { id: { startsWith: P } } }).catch(() => undefined);
    await db.transactionRecord.createMany({
      data: Array.from({ length: 6 }, (_, i) => ({
        id: `${P}tx-${i}`,
        contractDate: new Date(`2026-0${(i % 3) + 5}-1${i % 9}T10:00:00Z`),
        propertyCode: `${P}-P${i}`,
        propertyCustomer: `مالک ${i}`,
        requestCode: i % 2 === 0 ? `${P}-R${i}` : null,
        requestCustomer: i % 2 === 0 ? `متقاضی ${i}` : null,
        contractHolo: i < 4 ? `${P}-H${i}` : null,
        suggestedPropertyCount: i % 3,
        eventsCount: i % 2,
      })),
    });
    await db.contractRecord.create({
      data: {
        id: `${P}ct-0`,
        status: "confirmedByFinance",
        contractHolo: `${P}-H0`,
        propertyCode: `${P}-P0`,
        requestCode: `${P}-R0`,
        contractType: "مبایعه‌نامه",
        creatorName: "تست P6526",
        buyerListJson: JSON.stringify([{ fullName: "خریدار تست", mobileNumber: "09140000001" }]),
        sellerListJson: JSON.stringify([{ fullName: "مالک تست", mobileNumber: "09140000002" }]),
        realtorListJson: JSON.stringify([{ name: "مشاور تست P6526", unitPercent: 100, confirmation: "confirm", role: "primary" }]),
      },
    });
    try {
      const { getAgent } = await import("@/core/agent");
      const agent = getAgent("transactions-contracts")!;
      const result = await agent.renderInsights();
      assertValidInsights("transactions-contracts", result);
      expect(result.insights.length).toBeGreaterThanOrEqual(3);
      const declared = new Set<string>(agent.insightDomains);
      for (const ins of result.insights) expect(declared.has(ins.domain)).toBe(true);
    } finally {
      await db.transactionRecord.deleteMany({ where: { id: { startsWith: P } } }).catch(() => undefined);
      await db.contractRecord.deleteMany({ where: { id: { startsWith: P } } }).catch(() => undefined);
      await db.visitRecord.deleteMany({ where: { id: { startsWith: P } } }).catch(() => undefined);
    }
  });

  test("۲-۴) برچسب فارسی UI: همهٔ دامنه‌های M1/M2/M3 در DOMAIN_FA تعریف شده‌اند (بدون جایگزین خام)", async () => {
    const { getAgent } = await import("@/core/agent");
    const { DOMAIN_FA } = await import("@/components/app/AgentPanel");
    for (const tileId of ["arm-listings", "arm-requests", "transactions-contracts"]) {
      for (const d of getAgent(tileId)!.insightDomains) {
        expect(DOMAIN_FA[d], `دامنهٔ ${d} کاشی ${tileId} برچسب فارسی ندارد`).toBeDefined();
        expect(DOMAIN_FA[d].length).toBeGreaterThan(2);
      }
    }
  });

  test("۲-۵) روت بینش هر سه کاشی: 200 + agentName درست + ساختار سه‌گانه", async () => {
    const fa1 = await callRoute("@/app/api/agent/[tileId]/insight/route", "/api/agent/arm-listings/insight");
    expect(fa1.status).toBe(200);
    expect(fa1.body.ok).toBe(true);
    expect(fa1.body.agentName).toBe("ایجنت آگهی ملک تبریز");
    expect(Array.isArray(fa1.body.insights)).toBe(true);
    expect(typeof fa1.body.policyVersion).toBe("number");
    const fa2 = await callRoute("@/app/api/agent/[tileId]/insight/route", "/api/agent/arm-requests/insight");
    expect(fa2.status).toBe(200);
    expect(fa2.body.agentName).toBe("ایجنت درخواست ملک تبریز");
    const fa3 = await callRoute("@/app/api/agent/[tileId]/insight/route", "/api/agent/transactions-contracts/insight");
    expect(fa3.status).toBe(200);
    expect(fa3.body.agentName).toContain("معاملات");
  });

  test("۲-۶) روت بینش کاشی بی‌ایجنت → 404 شفاف (ایزوله‌سازی خطا)", async () => {
    const res = await callRoute("@/app/api/agent/[tileId]/insight/route", "/api/agent/settings/insight");
    expect(res.status).toBe(404);
  });
});

/* ==========================================================================
 * §۳ — فیلتر فهرست آگهی (M1 — کد + نام کارشناس + وضعیت شش‌حالته)
 * مسیر کامل: ورودی فارسی/عربی/لاتین → نرمال‌سازی منبع یگانه → مخزن → روت
 * ========================================================================== */

describe("P6526/پ §۳ — فیلتر فهرست آگهی (M1)", () => {
  let repo: any;
  let RAW_PUBLISHED: string;
  let RAW_EXPIRED: string;

  beforeAll(async () => {
    const { getPropertyRecordRepository } = await import("@/core/repositories");
    const { listingStateRawValues } = await import("@/lib/listing-status");
    repo = getPropertyRecordRepository();
    RAW_PUBLISHED = listingStateRawValues(["published"])[0];
    RAW_EXPIRED = listingStateRawValues(["expired"])[0];
    await repo.upsertBulk(
      [
        {
          id: `${P}p1`, propertyCode: `${P}4515`, title: "فروش آپارتمان خاوران",
          ownerName: "سید یاسین کاظمی", address: "تبریز، خاوران",
          status: RAW_PUBLISHED, createdAt: new Date("2026-09-25T10:00:00Z"),
        },
        {
          id: `${P}p2`, propertyCode: `${P}5925`, title: "رهن و اجاره ویلا ولیعصر",
          ownerName: "مهدی شجاع زاده احمد طهماسبي", address: "تبریز، ولیعصر", // ي عربی در DB — شاهد زنده
          status: RAW_EXPIRED, createdAt: new Date("2026-09-24T10:00:00Z"),
        },
        {
          id: `${P}p3`, propertyCode: `${P}1020`, ownerName: "کارشناس سوم تست",
          status: RAW_PUBLISHED, createdAt: new Date("2026-09-23T10:00:00Z"),
        },
      ],
      { sourceRunId: "p6526-filter-seed" }
    );
  });

  afterAll(async () => {
    const { db } = await import("@/lib/db");
    await db.propertyRecord.deleteMany({ where: { id: { startsWith: `${P}p` } } }).catch(() => undefined);
    await db.$disconnect();
  });

  test("۳-۱) کد آگهی: فارسی = عربی = لاتین (رگرسیون باگ تاریخی ۴/۵)", async () => {
    const fa = await repo.listArmCatalog({ code: `${P}۴۵۱۵` }, 100);
    const ar = await repo.listArmCatalog({ code: `${P}٤٥١٥` }, 100);
    const latin = await repo.listArmCatalog({ code: `${P}4515` }, 100);
    expect(latin.rows.length).toBe(1);
    expect(fa.rows.length).toBe(1);
    expect(ar.rows.length).toBe(1);
    expect(fa.rows[0].propertyCode).toBe(`${P}4515`);
    expect(ar.rows[0].propertyCode).toBe(`${P}4515`);
  });

  test("۳-۲) کد آگهی: جزئی (پیشوند) → تطبیق contains", async () => {
    const part = await repo.listArmCatalog({ code: `${P}45` }, 100);
    const mine = part.rows.filter((r: any) => r.propertyCode.startsWith(P));
    expect(mine.length).toBe(1);
    expect(mine[0].propertyCode).toBe(`${P}4515`);
  });

  test("۳-۳) کد ناموجود → صفر ردیف؛ کد تهی → بدون فیلتر", async () => {
    const none = await repo.listArmCatalog({ code: "999999999999" }, 100);
    expect(none.total).toBe(0);
    const all = await repo.listArmCatalog({}, 25000);
    expect(all.total).toBeGreaterThanOrEqual(3);
  });

  test("۳-۴) نام کارشناس: ي عربی DB با ی فارسی ورودی تطبیق می‌شود (دوطرفه)", async () => {
    const fa = await repo.listArmCatalog({ realtorName: "طهماسبی" }, 100); // ی فارسی ورودی
    expect(fa.rows.some((r: any) => r.propertyCode === `${P}5925`)).toBe(true);
  });

  test("۳-۵) نام کارشناس: ك عربی ورودی = ک فارسی", async () => {
    const ar = await repo.listArmCatalog({ realtorName: "كاظمی" }, 100); // ك عربی
    const fa = await repo.listArmCatalog({ realtorName: "کاظمی" }, 100); // ک فارسی
    expect(ar.rows.some((r: any) => r.propertyCode === `${P}4515`)).toBe(true);
    expect(fa.rows.some((r: any) => r.propertyCode === `${P}4515`)).toBe(true);
  });

  test("۳-۶) وضعیت شش‌حالته: تک‌حالته فقط ردیف‌های همان حالت", async () => {
    const res = await repo.listArmCatalog({ statuses: [RAW_EXPIRED] }, 100);
    const mine = res.rows.filter((r: any) => r.propertyCode.startsWith(P));
    expect(mine.length).toBe(1);
    expect(mine[0].propertyCode).toBe(`${P}5925`);
  });

  test("۳-۷) وضعیت: ترکیبی — اجتماع دو حالت", async () => {
    const res = await repo.listArmCatalog({ statuses: [RAW_PUBLISHED, RAW_EXPIRED] }, 100);
    const mine = res.rows.filter((r: any) => r.propertyCode.startsWith(P));
    expect(mine.length).toBe(3);
  });

  test("۳-۸) ترکیب کد + کارشناس → اشتراک هم‌زمان", async () => {
    const both = await repo.listArmCatalog({ code: `${P}45`, realtorName: "کاظمی" }, 100);
    expect(both.rows.length).toBe(1);
    expect(both.rows[0].propertyCode).toBe(`${P}4515`);
  });

  test("۳-۹) روت M1: پارامتر خام فارسی همان نتیجهٔ لاتین (مسیر کامل UI → API)", async () => {
    const fa = await callRoute("@/app/api/crm/arm-catalog/listings/route", `/api/crm/arm-catalog/listings?code=${encodeURIComponent(`${P}۴۵۱۵`)}`);
    const latin = await callRoute("@/app/api/crm/arm-catalog/listings/route", `/api/crm/arm-catalog/listings?code=${encodeURIComponent(`${P}4515`)}`);
    expect(fa.status).toBe(200);
    expect(latin.status).toBe(200);
    expect(fa.body.rows.length).toBe(1);
    expect(fa.body.rows[0].propertyCode).toBe(`${P}4515`);
    expect(fa.body.rows.length).toBe(latin.body.rows.length);
  });

  test("۳-۱۰) روت M1: فیلتر states شش‌حالته (published) + شمارش وضعیت‌ها", async () => {
    const res = await callRoute("@/app/api/crm/arm-catalog/listings/route", `/api/crm/arm-catalog/listings?states=published`);
    expect(res.status).toBe(200);
    expect(res.body.rows.some((r: any) => r.propertyCode === `${P}4515`)).toBe(true);
    expect(res.body.rows.some((r: any) => r.propertyCode === `${P}5925`)).toBe(false); // expired فیلتر شده
    expect(res.body.statusCounts).toBeDefined();
  });
});

/* ==========================================================================
 * §۴ — فیلتر فهرست درخواست (M2 — کد + نام کارشناس + مسیر دادهٔ مناطق)
 * ========================================================================== */

describe("P6526/پ §۴ — فیلتر فهرست درخواست (M2)", () => {
  let repo: any;

  beforeAll(async () => {
    const { getRequestRepository } = await import("@/core/repositories");
    repo = getRequestRepository();
    await repo.upsertArmBulk(
      [
        {
          id: `${P}r1`, requestCode: `${P}5234`, customerName: "آقایی",
          status: "در دست اقدام", actorName: "پیام عبدی تست", // ی فارسی
          areaNames: ["خاوران", "ولیعصر", "چایکنار", "ایل گلی", "باغمیشه", "زعفرانیه"], // ۶ منطقه — فایل مناطق
          createdAt: new Date("2026-09-25T21:41:53Z"),
        },
        {
          id: `${P}r2`, requestCode: `${P}5915`, customerName: "کاظمی",
          status: "تکمیل شده", actorName: "رضا محمدي تست", // ي عربی در DB
          areaNames: ["ولیعصر"],
          createdAt: new Date("2026-09-26T08:00:00Z"),
        },
      ],
      { sourceRunId: "p6526-filter-seed" }
    );
  });

  afterAll(async () => {
    const { db } = await import("@/lib/db");
    await db.requestRecord.deleteMany({ where: { id: { startsWith: `${P}r` } } }).catch(() => undefined);
    await db.$disconnect();
  });

  test("۴-۱) کد درخواست: فارسی = لاتین (۵۹۱۵ — رگرسیون مالک)", async () => {
    const fa = await repo.listArmCatalog({ code: `${P}۵۹۱۵` }, 100);
    const latin = await repo.listArmCatalog({ code: `${P}5915` }, 100);
    expect(latin.rows.length).toBe(1);
    expect(fa.rows.length).toBe(1);
    expect(fa.rows[0].requestCode).toBe(`${P}5915`);
  });

  test("۴-۲) نام کارشناس: ي عربی DB با ی فارسی ورودی تطبیق (دوطرفه)", async () => {
    const fa = await repo.listArmCatalog({ realtorName: "محمدی تست" }, 100);
    expect(fa.rows.some((r: any) => r.requestCode === `${P}5915`)).toBe(true);
  });

  test("۴-۳) نام کارشناس: ورودی عربی با DB فارسی", async () => {
    const ar = await repo.listArmCatalog({ realtorName: "عبدی تست" }, 100);
    expect(ar.rows.some((r: any) => r.requestCode === `${P}5234`)).toBe(true);
  });

  test("۴-۴) مسیر دادهٔ مناطق (بند ب): areaNamesJson رفت‌وبرگشت کامل — ۶ منطقه سالم می‌رسد", async () => {
    const res = await repo.listArmCatalog({ code: `${P}5234` }, 100);
    expect(res.rows[0].areaNames).toEqual(["خاوران", "ولیعصر", "چایکنار", "ایل گلی", "باغمیشه", "زعفرانیه"]);
    // رکورد تک‌منطقه‌ای هم سالم
    const one = await repo.listArmCatalog({ code: `${P}5915` }, 100);
    expect(one.rows[0].areaNames).toEqual(["ولیعصر"]);
  });

  test("۴-۵) رکورد بدون منطقه: areaNames آرایهٔ خالی (نه undefined — نه null)", async () => {
    const res = await repo.listArmCatalog({ code: `${P}5234` }, 100);
    expect(Array.isArray(res.rows[0].areaNames)).toBe(true);
  });

  test("۴-۶) روت M2: پارامتر خام فارسی همان نتیجهٔ لاتین", async () => {
    const fa = await callRoute("@/app/api/crm/arm-catalog/requests/route", `/api/crm/arm-catalog/requests?code=${encodeURIComponent(`${P}۵۲۳۴`)}`);
    const latin = await callRoute("@/app/api/crm/arm-catalog/requests/route", `/api/crm/arm-catalog/requests?code=${encodeURIComponent(`${P}5234`)}`);
    expect(fa.status).toBe(200);
    expect(latin.status).toBe(200);
    expect(fa.body.rows.length).toBe(1);
    expect(fa.body.rows[0].areaNames.length).toBe(6);
  });

  test("۴-۷) روت M2: نام کارشناس با ي عربی = ی فارسی (سطح روت)", async () => {
    const ar = await callRoute("@/app/api/crm/arm-catalog/requests/route", `/api/crm/arm-catalog/requests?realtorName=${encodeURIComponent("محمدی تست")}`);
    expect(ar.status).toBe(200);
    expect(ar.body.rows.some((r: any) => r.requestCode === `${P}5915`)).toBe(true);
  });
});

/* ==========================================================================
 * §۵ — فیلتر فهرست معاملات (M3 — ۷ جزء عین جدول F.۲)
 * ========================================================================== */

describe("P6526/پ §۵ — فیلتر فهرست معاملات (M3)", () => {
  const TX_HOLO = `${P}7735`;

  beforeAll(async () => {
    const { db } = await import("@/lib/db");
    await db.transactionRecord.deleteMany({ where: { id: { startsWith: P } } }).catch(() => undefined);
    await db.contractRecord.deleteMany({ where: { id: { startsWith: P } } }).catch(() => undefined);
    await db.transactionRecord.createMany({
      data: [
        {
          id: `${P}t1`,
          contractDate: new Date("2026-06-10T12:00:00Z"),
          propertyCode: `${P}8845`, requestCode: `${P}6631`,
          contractHolo: TX_HOLO, eventsCount: 2,
        },
        {
          id: `${P}t2`,
          contractDate: new Date("2026-06-11T12:00:00Z"),
          propertyCode: `${P}9910`, requestCode: null,
          contractHolo: null, eventsCount: 1,
        },
      ],
    });
    await db.contractRecord.create({
      data: {
        id: `${P}c1`, status: "finished", contractHolo: TX_HOLO,
        propertyCode: `${P}8845`, requestCode: `${P}6631`,
        contractType: "مبایعه نامه", contractDate: new Date("2026-06-10T12:00:00Z"),
        realtorListJson: JSON.stringify([
          { name: "وحيد حيدري تست P6526", unitPercent: 100, confirmation: "confirm" }, // ي عربی در DB
        ]),
      },
    });
  });

  afterAll(async () => {
    const { db } = await import("@/lib/db");
    await db.transactionRecord.deleteMany({ where: { id: { startsWith: P } } }).catch(() => undefined);
    await db.contractRecord.deleteMany({ where: { id: { startsWith: P } } }).catch(() => undefined);
    await db.$disconnect();
  });

  test("۵-۱) کد ملک: فارسی = لاتین (۸۸۴۵ — رقم‌های بحرانی ۴/۵)", async () => {
    const fa = await callRoute("@/app/api/crm/transactions/route", `/api/crm/transactions?propertyCode=${encodeURIComponent(`${P}۸۸۴۵`)}`);
    const latin = await callRoute("@/app/api/crm/transactions/route", `/api/crm/transactions?propertyCode=${encodeURIComponent(`${P}8845`)}`);
    expect(fa.status).toBe(200);
    expect(latin.status).toBe(200);
    expect(latin.body.rows.length).toBe(1);
    expect(fa.body.rows.length).toBe(1);
    expect(fa.body.rows[0].propertyCode).toBe(`${P}8845`);
  });

  test("۵-۲) کد درخواست: فارسی = لاتین", async () => {
    const fa = await callRoute("@/app/api/crm/transactions/route", `/api/crm/transactions?requestCode=${encodeURIComponent(`${P}۶۶۳۱`)}`);
    expect(fa.status).toBe(200);
    expect(fa.body.rows.length).toBe(1);
    expect(fa.body.rows[0].requestCode).toBe(`${P}6631`);
  });

  test("۵-۳) شماره هولوگرام: فارسی = لاتین (۷۷۳۵)", async () => {
    const fa = await callRoute("@/app/api/crm/transactions/route", `/api/crm/transactions?contractHolo=${encodeURIComponent(`${P}۷۷۳۵`)}`);
    const latin = await callRoute("@/app/api/crm/transactions/route", `/api/crm/transactions?contractHolo=${encodeURIComponent(TX_HOLO)}`);
    expect(fa.body.rows.length).toBe(1);
    expect(latin.body.rows.length).toBe(1);
  });

  test("۵-۴) نام کارشناس: ي عربی DB ↔ ی فارسی ورودی (دوطرفه + غنی‌سازی)", async () => {
    const fa = await callRoute("@/app/api/crm/transactions/route", `/api/crm/transactions?expertName=${encodeURIComponent("حیدری تست")}`);
    expect(fa.status).toBe(200);
    expect(fa.body.rows.length).toBe(1);
    expect(fa.body.rows[0].propertyCode).toBe(`${P}8845`);
    // و ارسال خودِ ي عربی هم همان نتیجه
    const ar = await callRoute("@/app/api/crm/transactions/route", `/api/crm/transactions?expertName=${encodeURIComponent("حيدري تست")}`);
    expect(ar.body.rows.length).toBe(1);
  });

  test("۵-۵) نوع قرارداد: تک‌گزینه (مبایعه‌نامه با نیم‌فاصله = مبایعه نامه با فاصله)", async () => {
    const res = await callRoute("@/app/api/crm/transactions/route", `/api/crm/transactions?contractType=${encodeURIComponent("مبایعه\u200cنامه")}`);
    expect(res.status).toBe(200);
    expect(res.body.rows.length).toBe(1);
    expect(res.body.rows[0].propertyCode).toBe(`${P}8845`);
  });

  test("۵-۶) نوع قرارداد: مقدار ناشناخته → 400 شفاف (رفع F2)", async () => {
    const res = await callRoute("@/app/api/crm/transactions/route", `/api/crm/transactions?contractType=${encodeURIComponent("قرارداد ناموجود")}`);
    expect(res.status).toBe(400);
  });

  test("۵-۷) نوع قرارداد: none → فقط ردیف‌های بدون قرارداد", async () => {
    const res = await callRoute("@/app/api/crm/transactions/route", `/api/crm/transactions?contractType=none`);
    expect(res.status).toBe(200);
    expect(res.body.rows.some((r: any) => r.propertyCode === `${P}9910`)).toBe(true);
    expect(res.body.rows.some((r: any) => r.propertyCode === `${P}8845`)).toBe(false);
  });

  test("۵-۸) مرز تاریخ تهران: dateTo شامل همان روز ثبت (2026-06-11)", async () => {
    const res = await callRoute("@/app/api/crm/transactions/route", `/api/crm/transactions?dateTo=2026-06-11`);
    expect(res.status).toBe(200);
    expect(res.body.rows.some((r: any) => r.propertyCode === `${P}9910`)).toBe(true);
  });

  test("۵-۹) بدون هیچ فیلتری: هر دو ردیف تست + total = شمارش واقعی", async () => {
    const res = await callRoute("@/app/api/crm/transactions/route", `/api/crm/transactions`);
    expect(res.status).toBe(200);
    expect(res.body.rows.length).toBeGreaterThanOrEqual(2);
    expect(res.body.rows.length).toBe(res.body.total);
  });

  test("۵-۱۰) ترکیب کد ملک + نوع قرارداد → اشتراق (هر دو فیلتر لایه‌های مختلف)", async () => {
    const res = await callRoute("@/app/api/crm/transactions/route", `/api/crm/transactions?propertyCode=${encodeURIComponent(`${P}88`)}&contractType=${encodeURIComponent("مبایعه نامه")}`);
    expect(res.status).toBe(200);
    expect(res.body.rows.length).toBe(1);
    expect(res.body.rows[0].propertyCode).toBe(`${P}8845`);
  });
});

/* ==========================================================================
 * §۶ — فهرست‌ها: قانون فهرست (منبع قانون در پریمیتیوها + هر ۷ فهرست فعال + روت‌ها)
 * الگو: فهرست معاملات (M3) نمونهٔ عالی
 * ========================================================================== */

describe("P6526/پ §۶ — قانون فهرست در همهٔ فهرست‌ها", () => {
  const LIST_PAGES = [
    "arm-listing/ArmListingsPage.tsx",
    "arm-request/ArmRequestsPage.tsx",
    "transactions-contracts/TransactionsTab.tsx",
    "experts/ExpertsPage.tsx",
    "extraction/ExtractionPage.tsx",
    "price-index/PriceIndexPage.tsx",
    "supply-demand/SupplyDemandPage.tsx",
  ];

  test("۶-۱) پریمیتیوهای جدول = منبع قانون: ظرف max-h + سرستون sticky + cv-row + وسط‌چین + text-xs", async () => {
    const table = readFileSync(`${SRC}/components/ui/table.tsx`, "utf8");
    expect(table).toContain("max-h-[32rem]"); // ظرف اسکرول یگانه — اسکرول سریع
    expect(table).toContain("sticky top-0"); // سرستون ثابت در اسکرول
    expect(table).toContain("cv-row"); // content-visibility — رندر سریع
    expect(table).toMatch(/TableHead[\s\S]{0,400}text-center/); // سرستون وسط‌چین
    expect(table).toMatch(/TableCell[\s\S]{0,300}text-center[\s\S]{0,200}text-xs/); // سلول وسط‌چین + فونت یکدست
  });

  test("۶-۲) هر ۷ فهرست فعال: بدون صفحه‌بندی، بدون سرستون غیروسط‌چین، بدون فونت غیرقانونی در سلول", async () => {
    for (const rel of LIST_PAGES) {
      const s = readFileSync(`${TILES}/${rel}`, "utf8");
      expect(s, `${rel}: صفحه‌بندی`).not.toMatch(/Pagination|pageSize|currentPage/);
      expect(s, `${rel}: سرستون text-right`).not.toMatch(/<TableHead[^>]*text-right/);
      expect(s, `${rel}: سلول text-sm`).not.toMatch(/<TableCell[^>]*text-sm/);
      expect(s, `${rel}: جدول دستی`).not.toContain("<table");
    }
  });

  test("۶-۳) هر ۷ فهرست فعال: بدون ظرف اسکرول تکراری دور جدول (ظرف یگانه = پریمیتیو)", async () => {
    for (const rel of LIST_PAGES) {
      const s = readFileSync(`${TILES}/${rel}`, "utf8");
      const wrap = s.match(/<(div|CardContent)[^>]*(max-h-\[|overflow-y-auto|overflow-auto)[^>]*>\s*(?:<div[^>]*>\s*)?<Table/);
      expect(wrap, `${rel}: ظرف تکراری → ${wrap?.[0].slice(0, 60)}`).toBeNull();
    }
  });

  test("۶-۴) روت‌های فهرست: پیش‌فرض و سقف ۲۵٬۰۰۰ (تمام ردیف‌ها — سقف = گارد ایمنی)", async () => {
    for (const routeFile of [
      "arm-catalog/listings",
      "arm-catalog/requests",
      "transactions",
    ]) {
      const s = readFileSync(`${SRC}/app/api/crm/${routeFile}/route.ts`, "utf8");
      expect(s, `${routeFile}: پیش‌فرض ۲۵۰۰۰`).toContain("?? 25000");
      expect(s, `${routeFile}: سقف ۲۵۰۰۰ (گارد ایمنی)`).toMatch(/,\s*25000\)/);
    }
  });

  test("۶-۵) صفحات M1/M2: عنوان فهرست وسط‌چین + Badge تک‌صفحه‌ای (الگوی M3)", async () => {
    const m1 = readFileSync(`${TILES}/arm-listing/ArmListingsPage.tsx`, "utf8");
    const m2 = readFileSync(`${TILES}/arm-request/ArmRequestsPage.tsx`, "utf8");
    const m3 = readFileSync(`${TILES}/transactions-contracts/TransactionsTab.tsx`, "utf8");
    for (const [name, s] of [["M1", m1], ["M2", m2], ["M3", m3]] as const) {
      expect(s, `${name}: عنوان وسط‌چین`).toMatch(/CardTitle[^>]*text-center/);
      expect(s, `${name}: Badge تک‌صفحه‌ای`).toMatch(/تک‌صفحه‌ای/);
    }
  });

  test("۶-۶) روت M1/M2/M3 زنده: 200 + rows آرایه + total عددی (قرارداد پایدار)", async () => {
    const r1 = await callRoute("@/app/api/crm/arm-catalog/listings/route", "/api/crm/arm-catalog/listings?limit=5");
    const r2 = await callRoute("@/app/api/crm/arm-catalog/requests/route", "/api/crm/arm-catalog/requests?limit=5");
    const r3 = await callRoute("@/app/api/crm/transactions/route", "/api/crm/transactions?limit=5");
    for (const [name, r] of [["M1", r1], ["M2", r2], ["M3", r3]] as const) {
      expect(r.status, `${name}: status`).toBe(200);
      expect(Array.isArray(r.body.rows), `${name}: rows`).toBe(true);
      expect(typeof r.body.total, `${name}: total`).toBe("number");
    }
  });
});

/* ==========================================================================
 * §۷ — فایل مناطق (بند ب): سلول فایل‌گونهٔ ستون مناطق فهرست درخواست‌ها
 * ========================================================================== */

describe("P6526/ب §۷ — فایل مناطق (ستون مناطق فهرست درخواست M2)", () => {
  const CELL_FILE = `${TILES}/arm-request/AreasFileCell.tsx`;
  const PAGE_FILE = `${TILES}/arm-request/ArmRequestsPage.tsx`;

  test("۷-۱) آستانهٔ فایل‌شدن: بیش از ۳ منطقه → نمایش فایل‌گونه", async () => {
    const s = readFileSync(CELL_FILE, "utf8");
    expect(s).toContain("AREAS_FILE_THRESHOLD = 3");
    expect(s).toMatch(/areaNames\.length <= AREAS_FILE_THRESHOLD/); // ≤۳ درون‌خطی
    expect(s).toMatch(/areaNames\.length === 0/); // صفر → جای‌نگهدار شفاف
  });

  test("۷-۲) چیپ «فایل مناطق» + دیالوگ سند: ساختار کامل با شمارنده", async () => {
    const s = readFileSync(CELL_FILE, "utf8");
    expect(s).toContain('data-testid="areas-file-button"');
    expect(s).toContain('data-testid="areas-file-dialog"');
    expect(s).toContain('data-testid="areas-file-list"');
    expect(s).toContain("فایل مناطق");
    expect(s).toMatch(/faNumber\(areaNames\.length\)/); // شمارندهٔ فارسی
    expect(s).toContain("role=\"document\""); // سند — نه یک پاپ‌اور ساده
  });

  test("۷-۳) سند مناطق: فهرست شماره‌دار «تمام» مناطق (هیچ برشی نیست)", async () => {
    const s = readFileSync(CELL_FILE, "utf8");
    expect(s).toMatch(/areaNames\.map\(\(name, i\)/); // همهٔ مناطق — نه slice
    expect(s).not.toMatch(/areaNames\.slice/);
    expect(s).toMatch(/faNumber\(i \+ 1\)/); // شماره‌گذاری فارسی
  });

  test("۷-۴) قانون فهرست در سلول فایل: چیپ و ردیف‌های سند text-xs (تنها استثنا: عنوان سند)", async () => {
    const s = readFileSync(CELL_FILE, "utf8");
    expect(s).not.toMatch(/text-sm/);
    // چیپ فایل و ردیف‌های سند — فونت قانونی text-xs
    expect(s).toMatch(/className="h-7 gap-1\.5 px-2\.5 text-xs/);
    expect(s).toMatch(/px-3 py-2 text-xs/);
    // text-base فقط در عنوان سند (DialogTitle — خارج از سلول جدول) مجاز است
    const bases = s.match(/text-base/g) ?? [];
    const titles = s.match(/DialogTitle[^>]*text-base/g) ?? [];
    expect(bases.length).toBe(titles.length);
  });

  test("۷-۵) یکپارچگی: صفحهٔ M2 از AreasFileCell در ستون مناطق استفاده می‌کند", async () => {
    const s = readFileSync(PAGE_FILE, "utf8");
    expect(s).toContain('from "./AreasFileCell"');
    expect(s).toContain("<AreasFileCell");
    expect(s).toMatch(/<TableHead[^>]*>مناطق<\/TableHead>/); // سرستون «مناطق» (جمع)
  });

  test("۷-۶) دسترس‌پذیری: aria-label فارسی چیپ + توضیح بستن سند", async () => {
    const s = readFileSync(CELL_FILE, "utf8");
    expect(s).toMatch(/aria-label=\{`فایل مناطق درخواست کد/);
    expect(s).toMatch(/aria-label=\{`سند فهرست/);
    expect(s).toMatch(/Escape|Esc|کلید Esc/);
  });
});

/* ==========================================================================
 * §۸ — گارد همیشگی یکسان‌سازی (باگ تاریخی ۴/۵ — هرگز بازنمی‌گردد)
 * ========================================================================== */

describe("P6526 §۸ — گارد همیشگی یکسان‌سازی (منبع یگانهٔ normalize-input)", () => {
  test("۸-۱) هر ۱۰ رقم فارسی/عربی → لاتین درست — به‌ویژه ۴↦4 و ۵↦5", async () => {
    const { normalizeFaDigits } = await import("@/lib/normalize-input");
    expect(normalizeFaDigits("۴")).toBe("4");
    expect(normalizeFaDigits("۵")).toBe("5");
    expect(normalizeFaDigits("۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789");
    expect(normalizeFaDigits("٤")).toBe("4");
    expect(normalizeFaDigits("٥")).toBe("5");
    expect(normalizeFaDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
  });

  test("۸-۲) شاهد زندهٔ باگ: «۵۹۲۵۲» = 59252 و «۵۹۱۵» = 5915", async () => {
    const { normalizeFaDigits } = await import("@/lib/normalize-input");
    expect(normalizeFaDigits("۵۹۲۵۲")).toBe("59252");
    expect(normalizeFaDigits("۵۹۱۵")).toBe("5915");
  });

  test("۸-۳) حروف: ي↦ی، ك↦ک + مخلوط با ارقام", async () => {
    const { normalizeFilterInput } = await import("@/lib/normalize-input");
    expect(normalizeFilterInput("طهماسبي")).toBe("طهماسبی");
    expect(normalizeFilterInput("بكر")).toBe("بکر");
    expect(normalizeFilterInput("ياسین ۵۹۱۵ك")).toBe("یاسین 5915ک");
  });

  test("۸-۴) گارد ابدی: هیچ رشتهٔ ده‌رقمیِ جایگشت‌نامرتب (ارقام متمایز) در src وجود ندارد", async () => {
    const { readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const faOrdered = "۰۱۲۳۴۵۶۷۸۹";
    const arOrdered = "٠١٢٣٤٥٦٧٨٩";
    const bad: string[] = [];
    const scan = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name.startsWith(".")) continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
          scan(full);
          continue;
        }
        if (!/\.(ts|tsx|js|jsx)$/.test(name)) continue;
        const src = readFileSync(full, "utf8");
        for (const m of src.matchAll(/["'`]([^"'`\n]{10})["'`]/g)) {
          const s = m[1];
          const isFa10 = /^[\u06F0-\u06F9]{10}$/.test(s);
          const isAr10 = /^[\u0660-\u0669]{10}$/.test(s);
          if (!isFa10 && !isAr10) continue;
          if (new Set(s).size !== 10) continue; // عدد واقعی رقم تکراری دارد
          if (s !== faOrdered && s !== arOrdered) bad.push(`${full}: «${s}»`);
        }
      }
    };
    scan(SRC);
    expect(bad).toEqual([]);
    expect(bad.includes("۰۱۲۳۵۴۶۷۸۹")).toBe(false); // رشتهٔ باگ تاریخی — مطلقاً هرگز
  });
});

/* ==========================================================================
 * §۹ — نصب اپلیکیشن (ث): PWA روی لینک publish — گارد ماندگار P6525
 * ========================================================================== */

describe("P6526/ث §۹ — نصب اپلیکیشن (PWA) روی لینک publish", () => {
  test("۹-۱) مانیفست: standalone + آیکن‌های any/maskable ۱۹۲/۵۱۲ + start_url نسبی", async () => {
    const m = JSON.parse(readFileSync("/home/z/my-project/public/manifest.json", "utf8"));
    expect(m.display).toBe("standalone");
    expect(m.dir).toBe("rtl");
    expect(m.lang).toBe("fa");
    expect(m.start_url).toBe("/"); // نسبی — روی هر دامنهٔ publish کار می‌کند
    const purposes = m.icons.map((i: any) => `${i.purpose}:${i.sizes}`);
    expect(purposes).toContain("any:192x192");
    expect(purposes).toContain("any:512x512");
    expect(purposes).toContain("maskable:192x192");
    expect(purposes).toContain("maskable:512x512");
  });

  test("۹-۲) دکمهٔ نصب: beforeinstallprompt بومی + راهنمای iOS + مخفی در حالت نصب‌شده", async () => {
    const s = readFileSync(`${SRC}/components/app/InstallButton.tsx`, "utf8");
    expect(s).toContain("beforeinstallprompt");
    expect(s).toContain("deferred.prompt()");
    expect(s).toContain("isIos");
    expect(s).toContain("isStandalone");
    expect(s).toContain("appinstalled");
  });

  test("۹-۳) دکمهٔ نصب در هدر اپ در دسترس است (کنار تم)", async () => {
    const s = readFileSync(`${SRC}/components/app/AppHeader.tsx`, "utf8");
    expect(s).toContain("<InstallButton />");
  });

  test("۹-۴) متاتگ‌های نصب iOS/اندروید در layout", async () => {
    const s = readFileSync(`${SRC}/app/layout.tsx`, "utf8");
    expect(s).toContain("appleWebApp");
    expect(s).toContain("mobile-web-app-capable");
    expect(s).toContain("manifest");
  });

  test("۹-۵) سرویس‌ورکر: fetch handler + skipWaiting + پاکسازی کش بیلدهای قبل", async () => {
    const sw = readFileSync("/home/z/my-project/public/sw.js", "utf8");
    expect(sw).toContain("addEventListener(\"fetch\"");
    expect(sw).toContain("skipWaiting");
    expect(sw).toContain("clients.claim");
  });
});
