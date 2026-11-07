/**
 * P4-07 — اثبات بایت‌به‌بایت: بدنه‌های PHASE 4 هیچ اثری بر خروجی ایجنت‌ها ندارند
 * ------------------------------------------------------
 * چهار پیکربندی روی همان پایگاه ایزوله (با ریست کامل کاشی «requests» پیش از هر پیکربندی —
 * الگوی P3-03؛ seed قطعی p303 عیناً همان):
 *   A) RequestAgent() — بدون موتور (رفتار PHASE 3)
 *   B) RequestAgent({engines: createDefaultEngineDeps()}) — Placeholder پیش‌فرض
 *   C) RequestAgent({engines: بدنه‌های واقعی PHASE 4}) — ContextEngineImpl +
 *      MemoryEngineImpl با ۱۲ رکورد حافظه از پیش کاشته‌شده
 *   D) مانند C + فراخوانی observe()×۳ و assembleContext()×۲ «پیش از» خروجی
 *      (زیرکلاس نمونه‌مند — اثبات اینکه سیم‌کشی زنده است و بازه‌ها بی‌اثر)
 *
 * خروجی learningStats + renderInsights (همه فیلدها) باید در هر چهار پیکربندی
 * «بایت‌به‌بایت» یکسان باشد. علاوه بر آن، گارد آغازین ثابت می‌کند فایل‌های مسیر
 * خروجی (دو ایجنت + والد + ۱۱ قرارداد + engine-deps) عیناً با تگ
 * pre-phase4-baseline هم‌خوان‌اند — تنها تغییر لایه هوشمندی: دو متد افزودنی
 * در base-intelligent-agent.ts که همین اثبات، بی‌اثری‌شان را نشان می‌دهد.
 *
 * پوشش DivarAgent: فایل آن طبق گارد آغازین بایت‌به‌بایت با baseline یکی است و
 * مسیر مشترکش (BaseIntelligentAgent/BaseLearningAgent) توسط همین چهار پیکربندی
 * پوشش داده می‌شود — به همین دلیل seed جداگانه p304 لازم نیست.
 *
 * ⚠️ طبق E.3 روی پایگاه ایزوله db/test-repository.db اجرا شود:
 *   DATABASE_URL=file:/home/z/my-project/db/test-repository.db MELK_TOKEN_KEY=test bun scripts/verify-p4-07.ts
 * داده p303- در پایان پاک می‌شود (اسکریپت خود-تمیزشونده).
 */

import { readFileSync } from "node:fs";
import type { EngineDeps } from "../src/core/intelligence/engine-deps";

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
  const proc = Bun.spawnSync(["git", "show", `pre-phase4-baseline:${path}`], { cwd: "/home/z/my-project" });
  if (proc.exitCode !== 0) throw new Error(`git show pre-phase4-baseline:${path} ناموفق بود`);
  return new TextDecoder().decode(proc.stdout);
}

function verifyUntouchedFiles(): void {
  const drifted: string[] = [];
  for (const f of GUARD_FILES) {
    if (gitShow(f) !== readFileSync(`/home/z/my-project/${f}`, "utf8")) drifted.push(f);
  }
  if (drifted.length > 0) {
    throw new Error(`فایل‌های مسیر خروجی نسبت به pre-phase4-baseline تغییر کرده‌اند: ${drifted.join("، ")}`);
  }
  console.log(`✓ گارد ۱: هر ${GUARD_FILES.length} فایل مسیر خروجی عیناً با pre-phase4-baseline هم‌خوان است`);
}

// ===================== کاشت قطعی داده p303 (عیناً الگوی P3-03) =====================

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

  // ---------- درخواست‌ها (۵ مشتری × ۷ درخواست) ----------
  // مشتری A — قهرمان: کامل + جدیت خیلی زیاد + تطبیق قوی + رویدادهای اخیر
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

  // مشتری B — ناقص (گام ۴ ناقص): COMPLETE_REQUEST path
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

  // مشتری C — راکد (بدون رویداد، ۳۵ روز): DORMANT + CHURN
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

  // مشتری D — ثبت آرم ناموفق: ARM_SYNC failed path
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

  // مشتری E — کامل و آماده اما ثبت‌نشده: readyNotRegistered path
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

  // مشتری تبدیل‌شده — نام تطبیقی با معامله موجود (چسبنده به داده واقعی پایگاه)
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

  // ---------- رویدادها (مشتری A: ۵ رویداد اخیر؛ B: ۱؛ D: ۳ قدیمی‌تر) ----------
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
  // بازخورد/حافظه قطعی دوباره کاشته می‌شود — وضعیت آغازین هر چهار پیکربندی یکسان
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

/** کاشت ۱۲ رکورد حافظه در موتور واقعی PHASE 4 — واژگان هم‌دامنه با بینش‌های کاشی */
async function seedRealEngineMemory(): Promise<EngineDeps["memory"] & { query(q: { tileId: string }): Promise<unknown[]> }> {
  const { MemoryEngineImpl } = await import("../src/core/intelligence/memory/memory-engine");
  const engine = new MemoryEngineImpl();
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
  return engine;
}

// ===================== اصلی =====================

async function main() {
  verifyUntouchedFiles();

  const { db } = await import("../src/lib/db");
  await seedP303();

  const { RequestAgent } = await import("../src/core/agent/request-agent");
  const { createDefaultEngineDeps } = await import("../src/core/intelligence/engine-deps");
  const { ContextEngineImpl } = await import("../src/core/intelligence/context/context-engine");

  // --- پیکربندی A: بدون موتور (رفتار PHASE 3) ---
  await resetRequestsTile();
  const outA = await capture(new RequestAgent());

  // --- پیکربندی B: Placeholder پیش‌فرض ---
  await resetRequestsTile();
  const outB = await capture(new RequestAgent({ engines: createDefaultEngineDeps() }));

  // --- پیکربندی C: بدنه‌های واقعی PHASE 4 با حافظه پیش‌کاشته ---
  await resetRequestsTile();
  const memEngineC = await seedRealEngineMemory();
  const outC = await capture(
    new RequestAgent({
      engines: { context: new ContextEngineImpl({ memory: memEngineC }), memory: memEngineC },
    }),
  );

  // --- پیکربندی D: مانند C + observe/assembleContext پیش از خروجی ---
  await resetRequestsTile();
  const memEngineD = await seedRealEngineMemory();
  class InstrumentedRequestAgent extends (await import("../src/core/agent/request-agent")).RequestAgent {
    async pubObserve(kind: string, payload: Record<string, unknown>) {
      await this.observe(kind, payload);
    }
    async pubAssembleContext() {
      return this.assembleContext("insight-render", { text: "جامعه مشتریان درخواست", signals: ["سیگنال زنده آزمون p407"] });
    }
  }
  const agentD = new InstrumentedRequestAgent({
    engines: { context: new ContextEngineImpl({ memory: memEngineD }), memory: memEngineD },
  });
  await agentD.pubObserve("P407_OBS_1", { text: "مشاهده پیش از رندر شماره یک" });
  await agentD.pubObserve("P407_OBS_2", { text: "مشاهده پیش از رندر شماره دو" });
  await agentD.pubObserve("P407_OBS_3", { text: "مشاهده پیش از رندر شماره سه" });
  const wcD = await agentD.pubAssembleContext();
  const outD = await capture(agentD);

  // --- گارد ۲: سیم‌کشی زنده است (مشاهدات واقعاً ثبت و زمینه واقعاً مونتاژ شده) ---
  const dMemories = await memEngineD.query({ tileId: "requests" });
  if (dMemories.length < 15) {
    throw new Error(`سیم‌کشی مرده: انتظار ≥۱۵ رکورد حافظه (۱۲ کاشته + ۳ مشاهده) در موتور D بود؛ یافت شد: ${dMemories.length}`);
  }
  if (!wcD || wcD.contextText.length === 0 || !wcD.contextText.includes("سیگنال زنده آزمون p407")) {
    throw new Error("سیم‌کشی مرده: WorkingContext مونتاژنشده یا سیگنال زنده در آن نیست");
  }
  console.log(`✓ گارد ۲: سیم‌کشی زنده — ${dMemories.length} رکورد در موتور D؛ زمینه ${wcD.tokenEstimate} توکنی مونتاژ شد (${wcD.memories.length} خاطره + ${wcD.signals.length} سیگنال)`);

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

  cmp("A (بدون موتور/PHASE 3) ⇔ B (Placeholder پیش‌فرض)", outA, outB);
  cmp("A (بدون موتور/PHASE 3) ⇔ C (بدنه‌های واقعی + ۱۲ خاطره)", outA, outC);
  cmp("A (بدون موتور/PHASE 3) ⇔ D (بدنه‌های واقعی + observe/assemble پیش از خروجی)", outA, outD);
  cmp("C ⇔ D", outC, outD);

  // خلاصه محتوایی برای گزارش
  const parsed = JSON.parse(outA) as { rendered: { insights: { key: string }[]; policyVersion: number; memoryHits: number } };
  console.log(`\nبینش‌های پیکربندی A: ${parsed.rendered.insights.length} کارت — ${parsed.rendered.insights.map((i) => i.key).join("، ")}`);
  console.log(`نسخه سیاست: ${parsed.rendered.policyVersion} · خاطره‌های مؤثر: ${parsed.rendered.memoryHits}`);

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
    console.error(`\nنتیجه: ${failures} مقایسه ناموفق — بدنه‌های PHASE 4 بر خروجی اثر گذاشته‌اند!`);
    process.exit(1);
  }
  console.log("\nنتیجه: هر چهار پیکربندی بایت‌به‌بایت یکسان‌اند — بی‌اثری بدنه‌های PHASE 4 بر خروجی اثبات شد.");
}

main().catch((err) => {
  console.error("خطای verify-p4-07:", err);
  process.exit(1);
});
