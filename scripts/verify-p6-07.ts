/**
 * P6-07 — اثبات بایت‌به‌بایت: پشته Feature + Prediction هیچ اثری بر خروجی ایجنت‌ها ندارد
 * ------------------------------------------------------
 * پنج پیکربندی روی همان پایگاه ایزوله (با ریست کامل کاشی «requests» پیش از هر
 * پیکربندی و seed قطعی p303 عیناً مانند P4-07/P5-08 — درس «پیکربندی تازه»):
 *   A) RequestAgent() — بدون موتور (رفتار PHASE 3)
 *   B) بدنه‌های PHASE 4 — Context+Memory واقعی با ۱۲ رکورد حافظه
 *   C) B + RetrievalEngineImpl کامل (Hybrid + Reranker) تزریق و فراخوانی واقعی
 *   D) C + FeatureEngineImpl تزریق در engines.feature + استخراج واقعی هر چهار
 *      FeatureSet دامنه‌ای پیش از خروجی (بدون پیش‌بینی)
 *   E) D + PredictionEngineImpl + predictionRepository + فراخوانی واقعی متد
 *      افزودنی predict ایجنت (زیرکلاس نمونه‌مند) — حداقل یک پیش‌بینی PROPERTY
 *      واقعاً محاسبه، ذخیره و با findById بازیابی می‌شود
 *
 * خروجی learningStats + renderInsights باید در هر پنج پیکربندی «بایت‌به‌بایت»
 * یکسان باشد. علاوه بر آن:
 *   گارد ۱: ۱۶ فایل مسیر خروجی عیناً با تگ pre-phase6-baseline + engine-deps.ts
 *            با گارد «دقیقاً فقط تغییر مصوب P6-06» (فیلد اختیاری + import تایپ —
 *            هر تغییر دیگر = شکست). این تفکیک صادقانه است: دستور P6-06 هم افزودن
 *            فیلد را خواست و هم گارد ۱۷ فایل را؛ تنش با گارد دقیق‌تر حل شد.
 *   گارد ۲: سیم‌کشی زنده — ویژگی‌ها واقعاً استخراج و پیش‌بینی واقعاً ذخیره می‌شود
 *
 * ⚠️ روی پایگاه ایزوله اجرا شود:
 *   DATABASE_URL=file:/home/z/my-project/db/test-repository.db MELK_TOKEN_KEY=test bun scripts/verify-p6-07.ts
 * داده p303 در پایان پاک می‌شود (اسکریپت خود-تمیزشونده).
 */

import { readFileSync } from "node:fs";

// ===================== گارد ۱: فایل‌های مسیر خروجی =====================

const GUARD_FILES = [
  "src/core/agent/request-agent.ts",
  "src/core/agent/divar-agent.ts",
  "src/core/agent/base-agent.ts",
  "src/core/agent/index.ts",
  // engine-deps.ts — گارد ویژه (پایین‌تر)
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

const ENGINE_DEPS = "src/core/intelligence/engine-deps.ts";

function gitShow(path: string): string {
  const proc = Bun.spawnSync(["git", "show", `pre-phase6-baseline:${path}`], { cwd: "/home/z/my-project" });
  if (proc.exitCode !== 0) throw new Error(`git show pre-phase6-baseline:${path} ناموفق بود`);
  return new TextDecoder().decode(proc.stdout);
}

function verifyUntouchedFiles(): void {
  const drifted: string[] = [];
  for (const f of GUARD_FILES) {
    if (gitShow(f) !== readFileSync(`/home/z/my-project/${f}`, "utf8")) drifted.push(f);
  }
  if (drifted.length > 0) {
    throw new Error(`فایل‌های مسیر خروجی نسبت به pre-phase6-baseline تغییر کرده‌اند: ${drifted.join("، ")}`);
  }
  console.log(`✓ گارد ۱-الف: هر ${GUARD_FILES.length} فایل مسیر خروجی عیناً با pre-phase6-baseline هم‌خوان است`);
}

/**
 * گارد ویژه engine-deps.ts — بازسازی دقیق: baseline + دو درج مصوب P6-06.
 * هر تفاوت دیگر (حتی یک نویسه) گارد را می‌شکند.
 */
function verifyEngineDepsSanctionedDiff(): void {
  const baseline = gitShow(ENGINE_DEPS);
  const current = readFileSync(`/home/z/my-project/${ENGINE_DEPS}`, "utf8");

  const expected = baseline
    .replace(
      'import type { SafetyEngine } from "./engines/safety";',
      'import type { SafetyEngine } from "./engines/safety";\nimport type { PredictionRepository } from "./prediction/prediction-repository";',
    )
    .replace(
      "  safety?: SafetyEngine;\n}",
      "  safety?: SafetyEngine;\n  /**\n   * PHASE 6 (P6-06) — فیلد افزودنی اختیاری: انبار پیش‌بینی برای متد\n   * predict ایجنت. غیبتش = رفتار قبل (ذخیره نمی‌شود). افزودنی — همه\n   * مصرف‌کننده‌های موجود EngineDeps بدون تغییر معتبر می‌مانند.\n   */\n  predictionRepository?: PredictionRepository;\n}",
    );

  if (current !== expected) {
    throw new Error(
      "engine-deps.ts فقط باید تغییر مصوب P6-06 را داشته باشد (import تایپ + فیلد اختیاری predictionRepository). تفاوت دیگری یافت شد.",
    );
  }
  console.log("✓ گارد ۱-ب: engine-deps.ts — دقیقاً فقط تغییر مصوب P6-06 (فیلد اختیاری + import تایپ)؛ هیچ تفاوت دیگر نیست");
}

// ===================== کاشت قطعی داده p303 (عیناً الگوی P4-07/P5-08) =====================

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

/**
 * استخراج زنده چهار FeatureSet دامنه‌ای با FeatureEngineImpl —
 * بازار از دو آگهی لیلِ کاشته (ls-0 فعال + ls-3 بایگانی)؛ ملک از آگهی
 * ائل‌گلی کاشته (ls-1) + فیلدهای فیکسچر برای فیلدهای خارج از شِما
 * (rooms/floor/… در جدول آگهی نیستند — سنداً ثبت شد)؛ مشتری/کارشناس فیکسچر.
 */
async function extractProofFeatureSets() {
  const { FeatureEngineImpl } = await import("../src/core/intelligence/feature/feature-engine");
  const engine = new FeatureEngineImpl(); // بدون کش — حتمی

  // بازار لیل از داده کاشته: 3B/100 و 2.8B/95 (تومان بر متر)
  const market = await engine.extractMarketFeatures("1", {
    areaId: "1",
    snapshotDate: new Date(ANCHOR),
    samples: [
      { pricePerMeter: 3_000_000_000 / 100 },
      { pricePerMeter: 2_800_000_000 / 95 },
    ],
    priceTrend7d: 0.01,
    priceTrend30d: 0.03,
    volumeTrend7d: -0.02,
    volatility: 0.05,
    supplyDemandRatio: 1.2,
  });

  // ملک ائل‌گلی (ls-1): قیمت/مساحت/منطقه از DB؛ بقیه فیکسچر
  const property = await engine.extractPropertyFeatures(
    {
      id: "p303-ls-1",
      areaId: "2",
      areaName: "ائل‌گلی",
      price: 2_600_000_000,
      pricePerMeter: 2_600_000_000 / 88,
      propertyType: "apartment",
      tradeType: "sell",
      meterage: 88,
      rooms: 2,
      floor: 3,
      age: 10,
      hasElevator: true,
      hasParking: false,
      photoCount: 8,
      hasVideo: false,
      description: "آپارتمان ائل‌گلی نزدیک پارک elementType معتبر",
      publisherType: "personal",
      publishedHoursAgo: 36,
      priceChangeCount: 1,
      previousPriceDelta: -100_000_000,
    },
    market,
    { keywordScore: 1.5 },
  );

  // مشتری از درخواست a0 (علی محمدی) — فیلدهای رفتاری فیکسچر
  const customer = await engine.extractCustomerFeatures({
    id: "p303-req-a0",
    recencyDays: 3,
    frequencyCount: 6,
    monetaryValue: 3_000_000_000,
    responseRate: 0.8,
    seriousnessScore: 0.9,
    budgetCompatibility: 0.85,
    activityScore: 0.7,
    previousInquiries: 2,
    previousVisits: 1,
    previousTransactions: 0,
    preferredAreas: ["لیل", "ائل‌گلی"],
    preferredPropertyTypes: ["apartment"],
    preferredTradeType: "buy",
  });

  // کارشناس فیکسچر
  const expert = await engine.extractExpertFeatures({
    id: "p303-exp-0",
    personnelCode: "300000",
    activeDaysLast30: 22,
    interactionsLast30: 140,
    responseRate: 0.9,
    conversionRate: 0.35,
    cooperationScore: 0.8,
    currentLoad: 9,
    capacityScore: 0.6,
    networkSize: 15,
    networkQuality: 0.7,
  });

  return { engine, market, property, customer, expert };
}

// ===================== اصلی =====================

async function main() {
  verifyUntouchedFiles();
  verifyEngineDepsSanctionedDiff();

  const { db } = await import("../src/lib/db");
  await seedP303();

  const { RequestAgent } = await import("../src/core/agent/request-agent");
  const { ContextEngineImpl } = await import("../src/core/intelligence/context/context-engine");
  const { RetrievalEngineImpl } = await import("../src/core/intelligence/retrieval/retrieval-engine");
  const { PredictionEngineImpl } = await import("../src/core/intelligence/prediction/prediction-engine");
  const { InMemoryPredictionRepository } = await import("../src/core/intelligence/prediction/prediction-repository");
  type PredictionRecordT = import("../src/core/intelligence/prediction/prediction-record").PredictionRecord;
  type PropertyPayloadT = import("../src/core/intelligence/prediction/prediction-record").PropertyPredictionPayload;

  // --- پیکربندی A: بدون موتور (رفتار PHASE 3) ---
  await resetRequestsTile();
  const outA = await capture(new RequestAgent());

  // --- پیکربندی B: بدنه‌های PHASE 4 ---
  await resetRequestsTile();
  const b = await seedRealEngineMemory();
  const outB = await capture(
    new RequestAgent({
      engines: { context: new ContextEngineImpl({ memory: b.engine }), memory: b.engine },
    }),
  );

  // --- پیکربندی C: B + موتور بازیابی کامل (Hybrid + Reranker) ---
  await resetRequestsTile();
  const c = await seedRealEngineMemory();
  const retrievalC = await RetrievalEngineImpl.create({ store: c.store }); // با رتبه‌بند پیش‌فرض
  const agentC = new RequestAgent({
    engines: {
      context: new ContextEngineImpl({ memory: c.engine }),
      memory: c.engine,
      retrieval: retrievalC,
    },
  });
  const retrievedC = await retrievalC.retrieve({ tileId: "requests", query: "جامعه مشتریان درخواست", k: 5 });
  const outC = await capture(agentC);

  // --- پیکربندی D: C + FeatureEngine تزریق + استخراج واقعی چهار FeatureSet ---
  await resetRequestsTile();
  const d = await seedRealEngineMemory();
  const retrievalD = await RetrievalEngineImpl.create({ store: d.store });
  const featsD = await extractProofFeatureSets();
  const agentD = new RequestAgent({
    engines: {
      context: new ContextEngineImpl({ memory: d.engine }),
      memory: d.engine,
      retrieval: retrievalD,
      feature: featsD.engine,
    },
  });
  const retrievedD = await retrievalD.retrieve({ tileId: "requests", query: "ولیعصر ائل‌گلی", k: 3 });
  const outD = await capture(agentD);

  // --- پیکربندی E: D + PredictionEngine + متد افزودنی predict ایجنت (زیرکلاس نمونه‌مند) ---
  await resetRequestsTile();
  const e = await seedRealEngineMemory();
  const retrievalE = await RetrievalEngineImpl.create({ store: e.store });
  const featsE = await extractProofFeatureSets();
  const predictionRepo = new InMemoryPredictionRepository();
  class PredictingRequestAgent extends RequestAgent {
    async pubPredict<T extends PredictionRecordT>(
      type: "PROPERTY" | "CUSTOMER" | "EXPERT" | "MARKET",
      entityId: string,
      data: unknown,
    ): Promise<T | null> {
      return this.predict<T>(type, entityId, data);
    }
  }
  const agentE = new PredictingRequestAgent({
    engines: {
      context: new ContextEngineImpl({ memory: e.engine }),
      memory: e.engine,
      retrieval: retrievalE,
      feature: featsE.engine,
      prediction: new PredictionEngineImpl(),
      predictionRepository: predictionRepo,
    },
  });
  // پیش‌بینی واقعی پیش از خروجی — سیم‌کشی زنده
  const predictionE = await agentE.pubPredict<PredictionRecordT & { payload: PropertyPayloadT }>(
    "PROPERTY",
    "p303-ls-1",
    { property: featsE.property, market: featsE.market },
  );
  const predictionE2 = await agentE.pubPredict<PredictionRecordT>(
    "CUSTOMER",
    "p303-req-a0",
    { customer: featsE.customer },
  );
  const outE = await capture(agentE);

  // --- گارد ۲: سیم‌کشی زنده ---
  if (retrievedC.hitCount === 0) throw new Error("سیم‌کشی مرده: بازیابی C نتیجه نداد");
  if (retrievedD.hitCount === 0) throw new Error("سیم‌کشی مرده: بازیابی D نتیجه نداد");

  // ویژگی‌ها واقعاً استخراج شدند
  if (featsD.property.areaId !== "2" || featsD.property.underpriceRatio === undefined) {
    throw new Error("سیم‌کشی مرده: FeatureSet ملک ساخته نشد");
  }
  if (featsD.market.sampleSize !== 2 || featsD.market.medianPricePerMeter <= 0) {
    throw new Error("سیم‌کشی مرده: FeatureSet بازار از داده کاشته ساخته نشد");
  }
  if (featsD.customer.preferredAreas.length !== 2 || featsD.expert.personnelCode !== "300000") {
    throw new Error("سیم‌کشی مرده: FeatureSet مشتری/کارشناس ساخته نشد");
  }

  // پیش‌بینی واقعاً محاسبه، ذخیره و بازیابی شد (شاهد findById مصوب دستور)
  if (!predictionE) throw new Error("سیم‌کشی مرده: پیش‌بینی PROPERTY از مسیر ایجنت null بود");
  if (predictionE.probability <= 0 || predictionE.probability > 1) throw new Error("احتمال خارج از بازه");
  if (predictionE.drivers.length < 3) throw new Error(`drivers کمتر از ۳: ${predictionE.drivers.length}`);
  if (!predictionE.payload || predictionE.payload.transactionProbability === undefined) throw new Error("payload ۹فیلدی ملک ساخته نشد");
  const storedE = await predictionRepo.findById(predictionE.predictionId);
  if (!storedE) throw new Error("شاهد findById شکست خورد — پیش‌بینی در انبار نیست");
  if (!predictionE2) throw new Error("سیم‌کشی مرده: پیش‌بینی CUSTOMER از مسیر ایجنت null بود");
  const storedCount = (await predictionRepo.findByEntity("p303-ls-1", "property")).length;
  if (storedCount < 1) throw new Error("findByEntity پیش‌بینی را برنگرداند");

  console.log(`✓ گارد ۲: سیم‌کشی زنده — بازیابی C: ${retrievedC.hitCount} · D: ${retrievedD.hitCount} نتیجه؛ چهار FeatureSet ساخته شد (بازار: ${featsD.market.sampleSize} نمونه، میانه ${Math.round(featsD.market.medianPricePerMeter / 1e6)}M/m²)؛ پیش‌بینی PROPERTY محاسبه+ذخیره+بازیابی شد (probability=${predictionE.probability.toFixed(3)}، drivers=${predictionE.drivers.length}، expectedRevenue=${Math.round(predictionE.payload.expectedRevenue / 1e6)}M)؛ CUSTOMER هم ذخیره شد`);

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

  cmp("A (بدون موتور/PHASE 3) ⇔ B (بدنه‌های PHASE 4)", outA, outB);
  cmp("A ⇔ C (B + Retrieval کامل Hybrid+Reranker)", outA, outC);
  cmp("A ⇔ D (C + FeatureEngine + استخراج واقعی چهار FeatureSet)", outA, outD);
  cmp("A ⇔ E (D + PredictionEngine + predict ایجنت + ذخیره واقعی)", outA, outE);
  cmp("D ⇔ E (تنها اثر افزودن موتور پیش‌بینی)", outD, outE);

  // خلاصه محتوایی برای گزارش
  const parsed = JSON.parse(outA) as { rendered: { insights: { key: string }[]; policyVersion: number; memoryHits: number } };
  console.log(`\nبینش‌های پیکربندی A: ${parsed.rendered.insights.length} کارت — ${parsed.rendered.insights.map((i) => i.key).join("، ")}`);
  console.log(`نسخه سیاست: ${parsed.rendered.policyVersion} · خاطره‌های مؤثر: ${parsed.rendered.memoryHits}`);
  console.log(`نمونه پیش‌بینی E: type=${predictionE.predictionType} probability=${predictionE.probability.toFixed(3)} confidence=${predictionE.confidence.toFixed(3)} model=${predictionE.modelVersion}`);
  console.log(`بازه زمانی موردانتظار: ${predictionE.expectedTimeWindow?.minDays}–${predictionE.expectedTimeWindow?.maxDays} روز (محتمل‌ترین: ${predictionE.expectedTimeWindow?.mostLikelyDays})`);

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
    console.error(`\nنتیجه: ${failures} مقایسه ناموفق — پشته PHASE 6 بر خروجی اثر گذاشته است!`);
    process.exit(1);
  }
  console.log("\nنتیجه: هر پنج پیکربندی بایت‌به‌بایت یکسان‌اند — بی‌اثری پشته Feature + Prediction بر خروجی اثبات شد.");
}

main().catch((err) => {
  console.error("خطای verify-p6-07:", err);
  process.exit(1);
});
