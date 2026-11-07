/**
 * P5-08 — اثبات بایت‌به‌بایت: پشته بازیابی PHASE 5 هیچ اثری بر خروجی ایجنت‌ها ندارد
 * ------------------------------------------------------
 * چهار پیکربندی روی همان پایگاه ایزوله (با ریست کامل کاشی «requests» پیش از هر
 * پیکربندی و seed قطعی p303 عیناً مانند P4-07 — درس «پیکربندی تازه در اثبات»):
 *   A) RequestAgent() — بدون موتور (رفتار PHASE 3)
 *   B) بدنه‌های PHASE 4 — Context+Memory واقعی با ۱۲ رکورد حافظه («فقط VectorSearch»)
 *   C) B + RetrievalEngineImpl (Hybrid بدون Reranker — reranker: null) تزریق در
 *      engines.retrieval + فراخوانی واقعی retrieve پیش از خروجی
 *   D) C با رتبه‌بند + Citation: بازیابی کامل + assembleCitations با بازیاب غنی
 *      (Hybrid+Reranker از طریق ContextItemRetriever) — زیرکلاس نمونه‌مند
 *
 * خروجی learningStats + renderInsights باید در هر چهار پیکربندی «بایت‌به‌بایت»
 * یکسان باشد. علاوه بر آن:
 *   گارد ۱: هر ۱۷ فایل مسیر خروجی عیناً با تگ pre-phase5-baseline هم‌خوان است
 *   گارد ۲: سیم‌کشی زنده — بازیابی واقعاً نتیجه می‌دهد و ارجاع‌ها واقعاً تولید
 *            می‌شوند (موقعیت با slice راستی‌آزمایی می‌شود)
 *
 * ⚠️ طبق E.3 روی پایگاه ایزوله db/test-repository.db اجرا شود:
 *   DATABASE_URL=file:/home/z/my-project/db/test-repository.db MELK_TOKEN_KEY=test bun scripts/verify-p5-08.ts
 * داده p303 در پایان پاک می‌شود (اسکریپت خود-تمیزشونده).
 */

import { readFileSync } from "node:fs";
import type {
  AssembleWithCitationsOptions,
  ContextItemRetriever,
} from "../src/core/intelligence/context/context-engine";

// ===================== گارد ۱: فایل‌های مسیر خروجی دست‌نخورده =====================

const GUARD_FILES = [
  "src/core/agent/request-agent.ts",
  "src/core/agent/divar-agent.ts",
  "src/core/agent/base-agent.ts",
  "src/core/agent/index.ts",
  "src/core/intelligence/engine-deps.ts",
  "src/core/intelligence/engines/context.ts",
  "src/core/intelligence/engines/memory.ts",
  "src/core/intelligence/engines/retrieval.ts",
  "src/core/intelligence/engines/feature.ts",
  "src/core/intelligence/engines/prediction.ts",
  "src/core/intelligence/engines/decision.ts",
  "src/core/intelligence/engines/action-planner.ts",
  "src/core/intelligence/engines/outcome.ts",
  "src/core/intelligence/engines/evaluation.ts",
  "src/core/intelligence/engines/learning.ts",
  "src/core/intelligence/engines/safety.ts",
  "src/core/intelligence/engines/index.ts",
];

function gitShow(path: string): string {
  const proc = Bun.spawnSync(["git", "show", `pre-phase5-baseline:${path}`], { cwd: "/home/z/my-project" });
  if (proc.exitCode !== 0) throw new Error(`git show pre-phase5-baseline:${path} ناموفق بود`);
  return new TextDecoder().decode(proc.stdout);
}

function verifyUntouchedFiles(): void {
  const drifted: string[] = [];
  for (const f of GUARD_FILES) {
    if (gitShow(f) !== readFileSync(`/home/z/my-project/${f}`, "utf8")) drifted.push(f);
  }
  if (drifted.length > 0) {
    throw new Error(`فایل‌های مسیر خروجی نسبت به pre-phase5-baseline تغییر کرده‌اند: ${drifted.join("، ")}`);
  }
  console.log(`✓ گارد ۱: هر ${GUARD_FILES.length} فایل مسیر خروجی عیناً با pre-phase5-baseline هم‌خوان است`);
}

// ===================== کاشت قطعی داده p303 (عیناً الگوی P4-07) =====================

const ANCHOR = Date.now();
const at = (days: number) => new Date(ANCHOR - days * 86400_000);

const BUY = "61a0-p303-buy";
const APT = "61a0-p303-apartment";
const RES = "61a0-p303-residential";
const SER_VHIGH = "61a7536b0927675c45489a59"; // خیلی زیاد → ۲۰
const SER_HIGH = "61a753650927675c45489a4f"; // زیاد → ۱۵
const PAY_CASH = "61a39bf0f06329efdeacbbef"; // نقدی → ۱۰
const PAY_MIXED = "61b4adae67a91fbc73ec891a"; // ملک و نقد → ۷

async function seedP303() {
  const { db } = await import("../src/lib/db");

  // پاک‌سازی idempotent
  await db.requestEventRecord.deleteMany({ where: { requestId: { startsWith: "p303-req-" } } });
  await db.requestRecord.deleteMany({ where: { id: { startsWith: "p303-req-" } } });
  await db.listingRecord.deleteMany({ where: { id: { startsWith: "p303-ls-" } } });

  // ---------- آگهی‌های دفتر (برای موتور تطبیق) ----------
  await db.listingRecord.createMany({
    data: [
      {
        id: "p303-ls-0", source: "manual", customerName: "مالک آگهی صفر", customerMobile: "09142000000",
        areaId: "1", areaName: "لیل", tradeTypeId: BUY, tradeTypeName: "خرید",
        propertyTypeId: APT, propertyTypeName: "آپارتمان", buildingTypeId: RES,
        inputsJson: JSON.stringify({ "قیمت": 3000000000, "مساحت": 100 }),
        status: "active", actorCode: "300000", createdAt: at(40), updatedAt: at(40),
      },
      {
        id: "p303-ls-1", source: "divar", customerName: "مالک آگهی یک", customerMobile: "09142000001",
        areaId: "2", areaName: "ائل‌گلی", tradeTypeId: BUY, tradeTypeName: "خرید",
        propertyTypeId: APT, propertyTypeName: "آپارتمان", buildingTypeId: RES,
        inputsJson: JSON.stringify({ "قیمت": 2600000000, "مساحت": 88 }),
        status: "active", actorCode: "300000", createdAt: at(35), updatedAt: at(35),
      },
      {
        id: "p303-ls-2", source: "manual", customerName: "مالک آگهی دو", customerMobile: "09142000002",
        areaId: "5", areaName: "باغمیشه", tradeTypeId: "61a0-p303-rent", tradeTypeName: "رهن و اجاره",
        propertyTypeId: "61a0-p303-office", propertyTypeName: "دفتر اداری", buildingTypeId: "61a0-p303-commercial",
        inputsJson: JSON.stringify({ "قیمت": 700000000, "مساحت": 60 }),
        status: "active", actorCode: "300000", createdAt: at(30), updatedAt: at(30),
      },
      {
        id: "p303-ls-3", source: "manual", customerName: "مالک آگهی بایگانی", customerMobile: "09142000003",
        areaId: "1", areaName: "لیل", tradeTypeId: BUY, tradeTypeName: "خرید",
        propertyTypeId: APT, propertyTypeName: "آپارتمان", buildingTypeId: RES,
        inputsJson: JSON.stringify({ "قیمت": 2800000000, "مساحت": 95 }),
        status: "archived", actorCode: "300000", createdAt: at(60), updatedAt: at(50),
      },
    ],
  });

  // ---------- درخواست‌ها ----------
  await db.requestRecord.createMany({
    data: [
      {
        id: "p303-req-a0", source: "manual", customerName: "علی محمدی", customerMobile: "09141000001",
        cityId: "1", areaIdsJson: JSON.stringify(["1", "2"]), areaNamesJson: JSON.stringify(["لیل", "ائل‌گلی"]),
        tradeTypeId: BUY, tradeTypeName: "خرید", buildingTypeId: RES, propertyTypeId: APT, propertyTypeName: "آپارتمان",
        inputsJson: JSON.stringify({ totalPrice_from: 2000000000, totalPrice_to: 4000000000, space_from: 80, space_to: 120 }),
        userPaymentMethod: PAY_CASH, userPaymentMethodName: "نقدی", userSeriousity: SER_VHIGH, userSeriousityName: "خیلی زیاد",
        status: "ready", armRequestId: "p303-arm-a0", armRegisteredAt: at(9),
        actorCode: "300000", createdAt: at(12.3), updatedAt: at(3.25),
      },
      {
        id: "p303-req-a1", source: "auto", customerName: "علی محمدی", customerMobile: "09141000001",
        cityId: "1", areaIdsJson: JSON.stringify(["1"]), areaNamesJson: JSON.stringify(["لیل"]),
        tradeTypeId: BUY, tradeTypeName: "خرید", buildingTypeId: RES, propertyTypeId: APT,
        inputsJson: JSON.stringify({ totalPrice_from: 2500000000, totalPrice_to: 3500000000, space_from: 85, space_to: 110 }),
        userPaymentMethod: PAY_MIXED, userPaymentMethodName: "ملک و نقد", userSeriousity: SER_HIGH, userSeriousityName: "زیاد",
        status: "ready", armRequestId: "p303-arm-a1", armRegisteredAt: at(8),
        actorCode: "300000", createdAt: at(11.1), updatedAt: at(4.6),
      },
    ],
  });

  await db.requestRecord.create({
    data: {
      id: "p303-req-b0", source: "manual", customerName: "حسن احمدی", customerMobile: "09141000002",
      cityId: "1", areaIdsJson: JSON.stringify(["2"]), areaNamesJson: JSON.stringify(["ائل‌گلی"]),
      tradeTypeId: BUY, tradeTypeName: "خرید", buildingTypeId: RES, propertyTypeId: APT,
      inputsJson: JSON.stringify({ totalPrice_from: 1500000000, totalPrice_to: 2500000000, space_from: 70, space_to: 95 }),
      status: "draft",
      actorCode: "300000", createdAt: at(10.5), updatedAt: at(10.4),
    },
  });

  await db.requestRecord.create({
    data: {
      id: "p303-req-c0", source: "auto", customerName: "رضا کریمی", customerMobile: "09141000003",
      cityId: "1", areaIdsJson: JSON.stringify(["5"]), areaNamesJson: JSON.stringify(["باغمیشه"]),
      tradeTypeId: BUY, tradeTypeName: "خرید", buildingTypeId: RES, propertyTypeId: APT,
      inputsJson: JSON.stringify({ totalPrice_from: 1000000000, totalPrice_to: 2000000000, space_from: 60, space_to: 90 }),
      userPaymentMethod: PAY_MIXED, userPaymentMethodName: "ملک و نقد", userSeriousity: SER_HIGH, userSeriousityName: "زیاد",
      status: "ready",
      actorCode: "300000", createdAt: at(35.2), updatedAt: at(35.1),
    },
  });

  await db.requestRecord.create({
    data: {
      id: "p303-req-d0", source: "manual", customerName: "امیر موسوی", customerMobile: "09141000004",
      cityId: "1", areaIdsJson: JSON.stringify(["9"]), areaNamesJson: JSON.stringify(["سعیدآباد"]),
      tradeTypeId: BUY, tradeTypeName: "خرید", buildingTypeId: RES, propertyTypeId: APT,
      inputsJson: JSON.stringify({ totalPrice_from: 1800000000, totalPrice_to: 2800000000, space_from: 75, space_to: 100 }),
      userPaymentMethod: PAY_CASH, userPaymentMethodName: "نقدی", userSeriousity: SER_HIGH, userSeriousityName: "زیاد",
      status: "ready", armRegistrationJson: JSON.stringify({ failed: true, steps: [{ key: "search", title: "جستجوی مشتری", status: "fail", detail: "نبود توکن" }] }),
      actorCode: "300000", createdAt: at(6.8), updatedAt: at(5.6),
    },
  });

  await db.requestRecord.create({
    data: {
      id: "p303-req-e0", source: "manual", customerName: "کامران صادقی", customerMobile: "09141000005",
      cityId: "1", areaIdsJson: JSON.stringify(["7"]), areaNamesJson: JSON.stringify(["زعفرانیه"]),
      tradeTypeId: BUY, tradeTypeName: "خرید", buildingTypeId: RES, propertyTypeId: APT,
      inputsJson: JSON.stringify({ totalPrice_from: 3000000000, totalPrice_to: 5000000000, space_from: 100, space_to: 140 }),
      userPaymentMethod: PAY_CASH, userPaymentMethodName: "نقدی", userSeriousity: SER_VHIGH, userSeriousityName: "خیلی زیاد",
      status: "ready",
      actorCode: "300000", createdAt: at(2.9), updatedAt: at(2.8),
    },
  });

  const convertedTx = await db.transactionRecord.findFirst({ where: { requestCustomer: { not: null } }, select: { requestCustomer: true } });
  if (convertedTx?.requestCustomer) {
    await db.requestRecord.create({
      data: {
        id: "p303-req-f0", source: "auto", customerName: convertedTx.requestCustomer, customerMobile: "09141000006",
        cityId: "1", areaIdsJson: JSON.stringify(["1"]), areaNamesJson: JSON.stringify(["لیل"]),
        tradeTypeId: BUY, tradeTypeName: "خرید", buildingTypeId: RES, propertyTypeId: APT,
        inputsJson: JSON.stringify({ totalPrice_from: 2000000000, totalPrice_to: 3000000000, space_from: 80, space_to: 100 }),
        userPaymentMethod: PAY_CASH, userPaymentMethodName: "نقدی", userSeriousity: SER_VHIGH, userSeriousityName: "خیلی زیاد",
        status: "ready", armRequestId: "p303-arm-f0", armRegisteredAt: at(20),
        actorCode: "300000", createdAt: at(25.4), updatedAt: at(21.2),
      },
    });
  }

  const events = [
    { id: "p303-ev-0", requestId: "p303-req-a0", eventTypeId: "61a0-call", eventTypeName: "تماس", createdAt: at(3.25), armEventId: "arm-ev-0" },
    { id: "p303-ev-1", requestId: "p303-req-a0", eventTypeId: "61a0-call", eventTypeName: "تماس", createdAt: at(5.1), armEventId: null },
    { id: "p303-ev-2", requestId: "p303-req-a0", eventTypeId: "61a0-visit", eventTypeName: "بازدید", createdAt: at(6.2), armEventId: "arm-ev-2" },
    { id: "p303-ev-3", requestId: "p303-req-a1", eventTypeId: "61a0-msg", eventTypeName: "پیام", createdAt: at(4.6), armEventId: null },
    { id: "p303-ev-4", requestId: "p303-req-a1", eventTypeId: "61a0-call", eventTypeName: "تماس", createdAt: at(7.3), armEventId: null },
    { id: "p303-ev-5", requestId: "p303-req-b0", eventTypeId: "61a0-call", eventTypeName: "تماس", createdAt: at(10.4), armEventId: null },
    { id: "p303-ev-6", requestId: "p303-req-d0", eventTypeId: "61a0-visit", eventTypeName: "بازدید", createdAt: at(5.6), armEventId: null },
    { id: "p303-ev-7", requestId: "p303-req-d0", eventTypeId: "61a0-call", eventTypeName: "تماس", createdAt: at(6.5), armEventId: null },
    { id: "p303-ev-8", requestId: "p303-req-d0", eventTypeId: "61a0-msg", eventTypeName: "پیام", createdAt: at(6.6), armEventId: null },
  ];
  await db.requestEventRecord.createMany({
    data: events.map((e) => ({ ...e, date: "1405/06/20", hour: "10:30", actorCode: "300000", armSyncJson: e.armEventId ? JSON.stringify({ ok: true }) : null })),
  });
}

// ===================== ریست قطعی کاشی requests پیش از هر پیکربندی =====================

async function resetRequestsTile() {
  const { db } = await import("../src/lib/db");
  await db.agentMemory.deleteMany({ where: { tileId: "requests" } });
  await db.agentFeedback.deleteMany({ where: { tileId: "requests" } });
  await db.agentPolicyVersion.deleteMany({ where: { tileId: "requests" } });
  await db.agentFeedback.createMany({
    data: [
      { tileId: "requests", insightKey: "p303-fb-0", insightTitle: "جامعه مشتریان", rating: 1, comment: "جامعه مشتریان مفید بود", context: JSON.stringify({ domain: "COMMUNITY_MGMT" }) },
      { tileId: "requests", insightKey: "p303-fb-1", insightTitle: "امتیاز سلامت مشتریان", rating: 1, comment: null, context: JSON.stringify({ domain: "CUST_HEALTH" }) },
      { tileId: "requests", insightKey: "p303-fb-2", insightTitle: "چرخه عمر مشتریان", rating: -1, comment: "چرخه عمر گنگ بود", context: JSON.stringify({ domain: "LIFECYCLE_MGMT" }) },
      { tileId: "requests", insightKey: "p303-fb-3", insightTitle: "اقدام بعدی", rating: 1, comment: null, context: JSON.stringify({ domain: "NEXT_ACTION" }) },
      { tileId: "requests", insightKey: "p303-fb-4", insightTitle: "موتور تطبیق درخواست", rating: 1, comment: "تطبیق عالی بود", context: JSON.stringify({ domain: "MATCH" }) },
      { tileId: "requests", insightKey: "p303-fb-5", insightTitle: "هشدار ریزش", rating: -1, comment: null, context: JSON.stringify({ domain: "CHURN" }) },
      { tileId: "requests", insightKey: "p303-fb-6", insightTitle: "رویدادها", rating: 1, comment: null, context: JSON.stringify({ domain: "EVENT_MGMT" }) },
    ],
  });
  await db.agentMemory.createMany({
    data: [
      { tileId: "requests", kind: "INTERACTION", payload: JSON.stringify({ at: at(1.2).toISOString(), note: "رندر قبلی جامعه مشتریان" }) },
      { tileId: "requests", kind: "INTERACTION", payload: JSON.stringify({ at: at(2.4).toISOString(), note: "رندر قبلی امتیاز سلامت" }) },
      { tileId: "requests", kind: "FEEDBACK", payload: JSON.stringify({ at: at(3.1).toISOString(), note: "بازخورد تطبیق" }) },
    ],
  });
}

// ===================== اجرای یک پیکربندی و دفع خروجی =====================

interface AgentLike {
  renderInsights(): Promise<{ insights: unknown[]; policyVersion: number; memoryHits: number }>;
  learningStats(): Promise<Record<string, unknown>>;
}

async function capture(agent: AgentLike): Promise<string> {
  const stats = await agent.learningStats(); // stats-first (عین الگوی P2-07)
  const rendered = await agent.renderInsights();
  return JSON.stringify({ stats, rendered }, null, 2);
}

/** کاشت ۱۲ رکورد حافظه در فروشگاه مشترک + ساخت موتور حافظه روی همان فروشگاه */
async function seedRealEngineMemory() {
  const { InMemoryStore } = await import("../src/core/intelligence/memory/memory-store");
  const { MemoryEngineImpl } = await import("../src/core/intelligence/memory/memory-engine");
  const store = new InMemoryStore();
  const engine = new MemoryEngineImpl({ store });
  const texts = [
    "جامعه مشتریان درخواست ملک رشد کرده است",
    "امتیاز سلامت مشتریان بهبود یافت",
    "چرخه عمر مشتریان فعال گزارش شد",
    "اقدام بعدی برای مشتری راکد تعیین شد",
    "موتور تطبیق درخواست سه تطبیق جدید یافت",
    "هشدار ریزش مشتری ارسال شد",
    "رویدادهای مشتری ثبت شد",
    "ثبت آرم برای درخواست آماده انجام شد",
    "درخواست ناقص مشتری تکمیل شد",
    "مشتری تبدیل‌شده به معامله شناسایی شد",
    "جامعه مشتریان گزارش هفتگی",
    "تطبیق درخواست با آگهی لیل",
  ];
  for (let i = 0; i < texts.length; i++) {
    await engine.append({
      tileId: "requests",
      layer: i % 2 === 0 ? "EPISODIC" : "SEMANTIC",
      kind: "OBS",
      payload: { text: texts[i], sentiment: i % 3 === 0 ? 1 : 0 },
    });
  }
  return { store, engine };
}

// ===================== اصلی =====================

async function main() {
  verifyUntouchedFiles();

  const { db } = await import("../src/lib/db");
  await seedP303();

  const { RequestAgent } = await import("../src/core/agent/request-agent");
  const { ContextEngineImpl } = await import("../src/core/intelligence/context/context-engine");
  const { RetrievalEngineImpl } = await import("../src/core/intelligence/retrieval/retrieval-engine");
  const { createHybridRetriever } = await import("../src/core/intelligence/retrieval/hybrid-retriever");
  const { Reranker } = await import("../src/core/intelligence/retrieval/reranker");

  // --- پیکربندی A: بدون موتور (رفتار PHASE 3) ---
  await resetRequestsTile();
  const outA = await capture(new RequestAgent());

  // --- پیکربندی B: بدنه‌های PHASE 4 («فقط VectorSearch») ---
  await resetRequestsTile();
  const b = await seedRealEngineMemory();
  const outB = await capture(
    new RequestAgent({
      engines: { context: new ContextEngineImpl({ memory: b.engine }), memory: b.engine },
    }),
  );

  // --- پیکربندی C: B + موتور بازیابی ترکیبی بدون رتبه‌بند، تزریق و فراخوانی واقعی ---
  await resetRequestsTile();
  const c = await seedRealEngineMemory();
  const retrievalC = await RetrievalEngineImpl.create({ store: c.store, reranker: null });
  const agentC = new RequestAgent({
    engines: {
      context: new ContextEngineImpl({ memory: c.engine }),
      memory: c.engine,
      retrieval: retrievalC,
    },
  });
  const retrievedC = await retrievalC.retrieve({ tileId: "requests", query: "جامعه مشتریان درخواست", k: 5 });
  const retrievedC2 = await retrievalC.retrieve({ tileId: "requests", query: "ولیعصر ائل‌گلی", k: 3 });
  const outC = await capture(agentC);

  // --- پیکربندی D: پشته کامل — رتبه‌بند + ارجاع از مسیر Hybrid+Reranker ---
  await resetRequestsTile();
  const d = await seedRealEngineMemory();
  const retrievalD = await RetrievalEngineImpl.create({ store: d.store }); // با رتبه‌بند پیش‌فرض
  const hybridD = await createHybridRetriever({ store: d.store });
  const rerankerD = new Reranker();
  const richRetrieverD = {
    async retrieveForContext(tileId: string, text: string, topK?: number) {
      await hybridD.sync();
      const items = await hybridD.retriever.retrieve({ text, filter: { tileId } }, { topK: topK ?? 10 });
      return rerankerD.rerank(items, { text });
    },
  } as ContextItemRetriever;
  class InstrumentedRequestAgent extends RequestAgent {
    async pubObserve(kind: string, payload: Record<string, unknown>) {
      await this.observe(kind, payload);
    }
    async pubAssembleCitations(purpose: "insight-render", options?: AssembleWithCitationsOptions) {
      return this.assembleCitations(purpose, options);
    }
  }
  const agentD = new InstrumentedRequestAgent({
    engines: {
      context: new ContextEngineImpl({ memory: d.engine, maxMemories: 10 }),
      memory: d.engine,
      retrieval: retrievalD,
    },
  });
  await agentD.pubObserve("P508_OBS_1", { text: "مشاهده پیش از رندر شماره یک" });
  await agentD.pubObserve("P508_OBS_2", { text: "مشاهده پیش از رندر شماره دو" });
  const retrievedD = await retrievalD.retrieve({ tileId: "requests", query: "جامعه مشتریان درخواست", k: 5 });
  const citedD = await agentD.pubAssembleCitations("insight-render", {
    text: "جامعه مشتریان درخواست ملک",
    signals: ["سیگنال زنده آزمون p508"],
    retriever: richRetrieverD,
  });
  const outD = await capture(agentD);

  // --- گارد ۲: سیم‌کشی زنده ---
  if (retrievedC.hitCount === 0 || retrievedC2.hitCount === 0) {
    throw new Error(`سیم‌کشی مرده: بازیابی ترکیبی نتیجه نداد (C: ${retrievedC.hitCount}/${retrievedC2.hitCount})`);
  }
  if (retrievedD.hitCount === 0) {
    throw new Error("سیم‌کشی مرده: بازیابی با رتبه‌بند نتیجه نداد");
  }
  if (!citedD || citedD.citations.length === 0 || citedD.context.length === 0) {
    throw new Error("سیم‌کشی مرده: ارجاعی تولید نشد یا زمینه خالی است");
  }
  if (!citedD.context.includes("سیگنال زنده آزمون p508")) {
    throw new Error("سیم‌کشی مرده: سیگنال زنده در زمینه نیست");
  }
  for (const c of citedD.citations) {
    const [start, end] = c.positionInContext;
    if (start < 0 || end > citedD.context.length || end <= start) {
      throw new Error(`موقعیت ارجاع نامعتبر: [${start}, ${end}) در متنی به طول ${citedD.context.length}`);
    }
    if (c.relevanceScore <= 0) throw new Error("امتیاز ارتباط ارجاع غیرمثبت است");
  }
  const dMemories = await d.engine.query({ tileId: "requests" });
  if (dMemories.length < 14) {
    throw new Error(`سیم‌کشی مرده: انتظار ≥۱۴ رکورد (۱۲ کاشته + ۲ مشاهده)؛ یافت شد: ${dMemories.length}`);
  }
  console.log(`✓ گارد ۲: سیم‌کشی زنده — بازیابی C: ${retrievedC.hitCount}+${retrievedC2.hitCount} نتیجه؛ بازیابی D: ${retrievedD.hitCount} نتیجه؛ زمینه D با ${citedD.citations.length} ارجاع معتبر مونتاژ شد (${dMemories.length} رکورد در موتور)`);

  // --- مقایسه بایت‌به‌بایت ---
  let failures = 0;
  const cmp = (name: string, x: string, y: string) => {
    if (x === y) {
      console.log(`✓ ${name} — بایت‌به‌بایت یکسان (${x.length} نویسه)`);
    } else {
      failures += 1;
      console.error(`✗ ${name} — تفاوت! (${x.length} مقابل ${y.length})`);
      const n = Math.min(x.length, y.length);
      for (let i = 0; i < n; i++) {
        if (x[i] !== y[i]) {
          console.error(`  نخستین تفاوت در جای ${i}:\n  X: …${x.slice(Math.max(0, i - 60), i + 60)}…\n  Y: …${y.slice(Math.max(0, i - 60), i + 60)}…`);
          break;
        }
      }
    }
  };

  cmp("A (بدون موتور/PHASE 3) ⇔ B (بدنه‌های PHASE 4 / فقط Vector)", outA, outB);
  cmp("A ⇔ C (B + Hybrid بدون رتبه‌بند، تزریق و فراخوانی واقعی)", outA, outC);
  cmp("A ⇔ D (پشته کامل + Reranker + Citation + observe پیش از خروجی)", outA, outD);
  cmp("C ⇔ D", outC, outD);

  // خلاصه محتوایی برای گزارش
  const parsed = JSON.parse(outA) as { rendered: { insights: { key: string }[]; policyVersion: number; memoryHits: number } };
  console.log(`\nبینش‌های پیکربندی A: ${parsed.rendered.insights.length} کارت — ${parsed.rendered.insights.map((i) => i.key).join("، ")}`);
  console.log(`نسخه سیاست: ${parsed.rendered.policyVersion} · خاطره‌های مؤثر: ${parsed.rendered.memoryHits}`);
  console.log(`نمونه بازسازی بازیابی C (method=${retrievedC.method}): ${retrievedC.snippets.slice(0, 3).map((s) => s.text.slice(0, 24)).join(" | ")}`);
  console.log(`نمونه ارجاع D: memoryId=${citedD.citations[0].memoryId.slice(0, 8)}… score=${citedD.citations[0].relevanceScore.toFixed(3)} pos=[${citedD.citations[0].positionInContext}]`);

  // --- پاک‌سازی خود-تمیزشونده ---
  await db.requestEventRecord.deleteMany({ where: { requestId: { startsWith: "p303-req-" } } });
  await db.requestRecord.deleteMany({ where: { id: { startsWith: "p303-req-" } } });
  await db.listingRecord.deleteMany({ where: { id: { startsWith: "p303-ls-" } } });
  await db.agentMemory.deleteMany({ where: { tileId: "requests" } });
  await db.agentFeedback.deleteMany({ where: { tileId: "requests" } });
  await db.agentPolicyVersion.deleteMany({ where: { tileId: "requests" } });
  console.log("پاک‌سازی p303 انجام شد.");

  await db.$disconnect();

  if (failures > 0) {
    console.error(`\nنتیجه: ${failures} مقایسه ناموفق — پشته PHASE 5 بر خروجی اثر گذاشته است!`);
    process.exit(1);
  }
  console.log("\nنتیجه: هر چهار پیکربندی بایت‌به‌بایت یکسان‌اند — بی‌اثری پشته بازیابی PHASE 5 بر خروجی اثبات شد.");
}

main().catch((err) => {
  console.error("خطای verify-p5-08:", err);
  process.exit(1);
});
