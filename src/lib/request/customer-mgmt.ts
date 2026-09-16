/**
 * موتور «مدیریت مشتریان» — شاهکار ایجنت کاشی «درخواست ملک»
 * ------------------------------------------------------
 * نقش و هدف اصلی ایجنت این کاشی: مدیریت مشتریان (Customer Management).
 * این موتور، سوپر-مغز ایجنت است و از داده‌های واقعی اپ ساخته می‌شود:
 *
 *  ۱. پروفایل ۳۶۰ درجه مشتری — تجمیع درخواست‌ها + رویدادها + آگهی‌های مالک + معاملات/قراردادها
 *  ۲. امتیاز سلامت مشتری (۰-۱۰۰) — تازگی تعامل + بسامد + جدیت + آمادگی مالی + کامل‌بودن
 *  ۳. چرخه عمر مشتری — جدید ← در تعامل ← جدی ← آماده معامله ← معامله‌شده / راکد
 *  ۴. اقدام بعدی (Next Best Action) — برای هر مشتری، هوشمندانه و اولویت‌بندی‌شده
 *  ۵. تطبیق درخواست ↔ آگهی (شاهکار) — عین «آگهی‌های پیشنهادی» خود سامانه آرم،
 *     با موتور امتیازدهی پنج‌بخشی: منطقه + نوع معامله + نوع ملک + بازه قیمت + بازه متراژ
 *  ۶. بخش‌بندی A/B/C + هشدار ریزش
 */

import { db } from "@/lib/db";
import type { RequestRecord, RequestEventRecord, ListingRecord } from "@prisma/client";
import { parseJson, USER_SERIOUSNESS, PAYMENT_METHODS, tradeTypeRequestLabel, propertyTypeLabel, buildingTypeLabel } from "./types";
import { computeCompleteness } from "./types";

// ===================== انواع خروجی =====================

// انواع و ثابت‌های چرخه عمر/اقدام بعدی/پروفایل — ماژول خالص مشترک UI↔سرور (P1-03)
export {
  type LifecycleStage,
  LIFECYCLE_FA,
  LIFECYCLE_COLOR,
  type Segment,
  type NextAction,
  ACTION_FA,
  type RequestMatch,
  type CustomerProfile,
  type CustomerManagementSummary,
} from "@/lib/types/customer-lifecycle";

import type {
  LifecycleStage,
  NextAction,
  CustomerProfile,
  CustomerManagementSummary,
  RequestMatch,
  Segment,
} from "@/lib/types/customer-lifecycle";

// ===================== نرمال‌سازی موبایل =====================

function normalizeMobile(m: string | null | undefined): string | null {
  if (!m) return null;
  const digits = m.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/\D/g, "");
  if (/^09\d{9}$/.test(digits)) return digits;
  if (/^9\d{9}$/.test(digits)) return `0${digits}`;
  return null;
}

// ===================== جدیت و پرداخت به امتیاز =====================

function seriousnessScore(id: string | null | undefined): number {
  const idx = USER_SERIOUSNESS.findIndex((s) => s.id === id);
  // خیلی زیاد=4 → 20، زیاد=3 → 15، متوسط=2 → 10، کم=1 → 5، نبود=0
  if (idx < 0) return 0;
  return [0, 5, 10, 15, 20][idx] ?? 0;
}

function paymentReadinessScore(id: string | null | undefined): number {
  // نقدی=۱۰ (آماده کامل)، ملک و نقد=۷، با فروش ملک=۴، تهاتر=۲، نبود=۰
  switch (id) {
    case PAYMENT_METHODS[0].id: return 10;
    case PAYMENT_METHODS[1].id: return 7;
    case PAYMENT_METHODS[2].id: return 4;
    case PAYMENT_METHODS[3].id: return 2;
    default: return 0;
  }
}

// ===================== موتور تطبیق درخواست ↔ آگهی (شاهکار) =====================

const MATCH_WEIGHTS = { area: 30, trade: 20, property: 15, price: 20, space: 15 } as const;

function num(v: unknown): number | null {
  if (v == null || v === "" || v === true || v === false) return null;
  const n = Number(String(v).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[,،\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** قیمت و متراژ آگهی — از inputsJson آگهی (کلیدهای فارسی: قیمت/مساحت) */
function listingMetrics(l: ListingRecord): { price: number | null; space: number | null } {
  const inputs = parseJson<Record<string, unknown>>(l.inputsJson, {});
  return { price: num(inputs["قیمت"]) ?? num(inputs.price) ?? num(inputs.totalPrice), space: num(inputs["مساحت"]) ?? num(inputs.space) };
}

/** تطبیق یک درخواست با همه آگهی‌های آماده دفتر — خروجی نزولی بر اساس امتیاز */
export function matchRequestToListings(
  request: RequestRecord,
  listings: ListingRecord[],
  limit = 5
): RequestMatch[] {
  const areaIds = new Set(parseJson<string[]>(request.areaIdsJson, []));
  const inputs = parseJson<Record<string, unknown>>(request.inputsJson, {});
  const priceFrom = num(inputs.totalPrice_from) ?? num(inputs.deposite_price_from);
  const priceTo = num(inputs.totalPrice_to) ?? num(inputs.deposite_price_to);
  const spaceFrom = num(inputs.space_from);
  const spaceTo = num(inputs.space_to);
  const propLabel = propertyTypeLabel(request.propertyTypeId, request.buildingTypeId);

  const matches: RequestMatch[] = [];
  for (const l of listings) {
    if (l.status === "archived") continue;
    const bd: { label: string; got: number; max: number }[] = [];

    // ۱. منطقه — آگهی در یکی از مناطق منتخب درخواست (۳۰ امتیاز)
    const areaHit = l.areaId ? areaIds.has(l.areaId) : false;
    bd.push({ label: "تطبیق منطقه", got: areaHit ? MATCH_WEIGHTS.area : 0, max: MATCH_WEIGHTS.area });

    // ۲. نوع معامله — خرید در برابر فروشِ همان دسته (۲۰ امتیاز)
    const tradeHit = l.tradeTypeId === request.tradeTypeId;
    bd.push({ label: "تطبیق نوع معامله", got: tradeHit ? MATCH_WEIGHTS.trade : 0, max: MATCH_WEIGHTS.trade });

    // ۳. نوع ملک/کاربری (۱۵ امتیاز — نوع ملک کامل، کاربری نصف)
    let propGot = 0;
    if (l.propertyTypeId === request.propertyTypeId && request.propertyTypeId) propGot = MATCH_WEIGHTS.property;
    else if (l.buildingTypeId === request.buildingTypeId && request.buildingTypeId) propGot = Math.round(MATCH_WEIGHTS.property / 2);
    bd.push({ label: "تطبیق نوع ملک", got: propGot, max: MATCH_WEIGHTS.property });

    // ۴. بازه قیمت (۲۰ امتیاز — درون بازه کامل، نزدیک بازه نصف)
    const { price } = listingMetrics(l);
    let priceGot = 0;
    if (price && (priceFrom || priceTo)) {
      const from = priceFrom ?? priceTo!;
      const to = priceTo ?? priceFrom!;
      if (price >= from && price <= to) priceGot = MATCH_WEIGHTS.price;
      else {
        const slack = to * 0.15;
        if (price >= from - slack && price <= to + slack) priceGot = Math.round(MATCH_WEIGHTS.price / 2);
      }
    } else if (!priceFrom && !priceTo) {
      priceGot = Math.round(MATCH_WEIGHTS.price / 2); // درخواست بدون بازه قیمت — خنثی
    }
    bd.push({ label: "تناسب قیمت", got: priceGot, max: MATCH_WEIGHTS.price });

    // ۵. بازه متراژ (۱۵ امتیاز)
    const { space } = listingMetrics(l);
    let spaceGot = 0;
    if (space && (spaceFrom || spaceTo)) {
      const from = spaceFrom ?? spaceTo!;
      const to = spaceTo ?? spaceFrom!;
      if (space >= from && space <= to) spaceGot = MATCH_WEIGHTS.space;
      else if (Math.abs(space - (from + to) / 2) <= ((to - from) || 40) / 2 + 25) spaceGot = Math.round(MATCH_WEIGHTS.space / 2);
    } else if (!spaceFrom && !spaceTo) {
      spaceGot = Math.round(MATCH_WEIGHTS.space / 2);
    }
    bd.push({ label: "تناسب متراژ", got: spaceGot, max: MATCH_WEIGHTS.space });

    const score = bd.reduce((s, x) => s + x.got, 0);
    const band: RequestMatch["band"] = score >= 70 ? "عالی" : score >= 40 ? "خوب" : "ضعیف";
    if (score < 25) continue; // تطبیق‌های بی‌ربط حذف

    const lInputs = parseJson<Record<string, unknown>>(l.inputsJson, {});
    const lPrice = lInputs["قیمت"] ?? lInputs.totalPrice;
    matches.push({
      requestId: request.id,
      requestTitle: `${tradeTypeRequestLabel(request.tradeTypeId)} ${propLabel}`,
      listingId: l.id,
      listingTitle: `${l.propertyTypeName ?? propertyTypeLabel(l.propertyTypeId, l.buildingTypeId)} — ${l.areaName ?? buildingTypeLabel(l.buildingTypeId)}`,
      listingPrice: lPrice != null ? String(lPrice) : null,
      score,
      band,
      breakdown: bd,
    });
  }
  return matches.sort((a, b) => b.score - a.score).slice(0, limit);
}

// ===================== امتیاز سلامت و چرخه عمر =====================

export function computeHealth(args: {
  lastInteractionDays: number | null;
  eventCount: number;
  maxSeriousness: number;
  maxPayment: number;
  completenessRatio: number;
}): { score: number; breakdown: { label: string; got: number; max: number }[] } {
  // ۱. تازگی تعامل (۳۵) — امروز=۳۵، ≤۷ روز=۲۸، ≤۱۴=۲۰، ≤۳۰=۱۰، بیشتر=۳، هیچ=۰
  const recency = args.lastInteractionDays == null ? 0 : args.lastInteractionDays <= 1 ? 35 : args.lastInteractionDays <= 7 ? 28 : args.lastInteractionDays <= 14 ? 20 : args.lastInteractionDays <= 30 ? 10 : 3;
  // ۲. بسامد تعامل (۲۵) — ۵+ رویداد=۲۵، ۳-۴=۱۸، ۲=۱۲، ۱=۷، ۰=۰
  const freq = args.eventCount >= 5 ? 25 : args.eventCount >= 3 ? 18 : args.eventCount === 2 ? 12 : args.eventCount === 1 ? 7 : 0;
  // ۳. جدیت (۲۰)
  const serio = args.maxSeriousness;
  // ۴. آمادگی مالی (۱۰)
  const pay = args.maxPayment;
  // ۵. کامل‌بودن پرونده (۱۰)
  const comp = Math.round(args.completenessRatio * 10);

  const breakdown = [
    { label: "تازگی تعامل", got: recency, max: 35 },
    { label: "بسامد پیگیری", got: freq, max: 25 },
    { label: "جدیت مشتری", got: serio, max: 20 },
    { label: "آمادگی مالی", got: pay, max: 10 },
    { label: "کامل‌بودن پرونده", got: comp, max: 10 },
  ];
  return { score: Math.min(100, breakdown.reduce((s, x) => s + x.got, 0)), breakdown };
}

export function computeStage(args: {
  eventCount: number;
  daysSinceInteraction: number | null;
  maxSeriousness: number;
  hasStrongMatch: boolean;
  convertedDeals: number;
}): LifecycleStage {
  if (args.convertedDeals > 0) return "CONVERTED";
  if (args.daysSinceInteraction != null && args.daysSinceInteraction > 30) return "DORMANT";
  if (args.hasStrongMatch && args.maxSeriousness >= 15) return "READY_TO_DEAL";
  if (args.maxSeriousness >= 15 || args.eventCount >= 3) return "SERIOUS";
  if (args.eventCount >= 1) return "ENGAGED";
  return "NEW";
}

// ===================== اقدام بعدی (Next Best Action) =====================

export function computeNextActions(args: {
  name: string;
  daysSinceInteraction: number | null;
  eventCount: number;
  incompleteRequests: number;
  readyNotRegistered: number;
  strongMatches: RequestMatch[];
  stage: LifecycleStage;
  maxSeriousness: number;
}): NextAction[] {
  const actions: NextAction[] = [];

  if (args.daysSinceInteraction != null && args.daysSinceInteraction > 14 && args.stage !== "CONVERTED") {
    actions.push({
      kind: "CONTACT_OVERDUE",
      title: `${args.daysSinceInteraction} روز بی‌تماس — یک رویداد «تماس» ثبت کنید`,
      detail: `آخرین تعامل با «${args.name}» ${faDays(args.daysSinceInteraction)} روز پیش بوده است. مشتریان با بی‌تعاملی بیش از دو هفته، احتمال ریزش بالایی دارند — همین امروز تماس بگیرید و با کلید «ثبت رویداد» مستندش کنید.`,
      priority: 1,
    });
  }

  if (args.strongMatches.length > 0) {
    const best = args.strongMatches[0];
    const visitReady = best.score >= 70 && args.maxSeriousness >= 15;
    actions.push({
      kind: visitReady ? "ARRANGE_VISIT" : "INTRODUCE_MATCHES",
      title: visitReady
        ? `بازدید را هماهنگ کنید — تطبیق ${best.score}٪ با «${best.listingTitle}»`
        : `${args.strongMatches.length} آگهی منطبق برای معرفی — بهترین: ${best.score}٪`,
      detail: visitReady
        ? `جدیت مشتری بالا است و درخواستش با آگهی «${best.listingTitle}» تطبیق ${best.score}٪ دارد — شرایط هماهنگی بازدید مهیاست؛ یک رویداد «بازدید» با کدآگهی ثبت کنید.`
        : `درخواست‌های این مشتری با آگهی‌های دفتر شما تطبیق دارد (بهترین: «${best.listingTitle}» با ${best.score}٪). فهرست تطبیق‌ها را برایش بفرستید و واکنشش را با «ثبت رویداد» پیگیری کنید.`,
      priority: visitReady ? 1 : 2,
    });
  }

  if (args.incompleteRequests > 0) {
    actions.push({
      kind: "COMPLETE_REQUEST",
      title: `${args.incompleteRequests} درخواست ناقص — با کلید «ویرایش» تکمیل کنید`,
      detail: "درخواست ناقص یعنی معیارهای جست‌وجوی تطبیق ناقص: بازه قیمت/متراژ یا منطقه مفقود است. با تکمیل، موتور تطبیق دقیق‌تر می‌شود و آماده ثبت در سامانه آرم خواهد بود.",
      priority: 2,
    });
  }

  if (args.readyNotRegistered > 0) {
    actions.push({
      kind: "REGISTER_TO_ARM",
      title: `${args.readyNotRegistered} درخواست کاملِ ثبت‌نشده در سامانه آرم`,
      detail: "درخواست کامل محلی هنوز به سامانه آرم منتقل نشده — با کلید «ثبت در سامانه ARM» ثبت گام‌به‌گام (جستجوی مشتری ← شناسه‌ها ← ثبت نهایی) انجام می‌شود.",
      priority: 3,
    });
  }

  if (args.stage === "DORMANT") {
    actions.push({
      kind: "REACTIVATE",
      title: "مشتری راکد — کمپین بازگشت",
      detail: "این مشتری بیش از ۳۰ روز بدون تعامل است. یک تماس دلجویی + معرفی تطبیق‌های تازه (یا نرخ‌نامه به‌روز منطقه) می‌تواند او را بازگرداند.",
      priority: 2,
    });
  }

  if (actions.length === 0 && args.eventCount > 0 && args.stage !== "CONVERTED") {
    actions.push({
      kind: "NURTURE",
      title: "پیگیری نرم — روند تعامل خوب است",
      detail: "تعامل منظم دارد؛ ادامه دهید و هر تماس/بازدید را با «ثبت رویداد» مستند کنید تا حافظه مدیریت مشتریان کامل بماند.",
      priority: 3,
    });
  }

  return actions.sort((a, b) => a.priority - b.priority).slice(0, 3);
}

// ===================== جمع‌بندی کل (موتور اصلی) =====================

/**
 * ساخت نمای کامل مدیریت مشتریان از داده واقعی:
 * درخواست‌ها + رویدادها + آگهی‌های مالک + معاملات/قراردادها (۳۶۰ درجه).
 */
export async function buildCustomerManagement(): Promise<CustomerManagementSummary> {
  const [requests, events, listings, transactions, contracts] = await Promise.all([
    db.requestRecord.findMany({ orderBy: { updatedAt: "desc" }, take: 500 }).catch(() => [] as RequestRecord[]),
    db.requestEventRecord.findMany({ orderBy: { createdAt: "desc" }, take: 1000 }).catch(() => [] as RequestEventRecord[]),
    db.listingRecord.findMany({ where: { status: { not: "archived" } }, take: 500 }).catch(() => [] as ListingRecord[]),
    db.transactionRecord.findMany({ take: 500 }).catch(() => []),
    db.contractRecord.findMany({ take: 500 }).catch(() => []),
  ]);

  // نام‌های خریداران معامله‌شده (تبدیل‌شده‌ها) — از داده معاملات و قراردادها
  const convertedNames = new Set<string>();
  for (const t of transactions) {
    if (t.requestCustomer) convertedNames.add(normalizeName(t.requestCustomer));
  }
  for (const c of contracts) {
    try {
      const buyers = parseJson<{ fullName: string }[]>(c.buyerListJson, []);
      for (const b of buyers) convertedNames.add(normalizeName(b.fullName));
    } catch {
      /* ignore */
    }
  }

  // گروه‌بندی درخواست‌ها بر اساس موبایل مشتری
  const byMobile = new Map<string, RequestRecord[]>();
  for (const r of requests) {
    const mob = normalizeMobile(r.customerMobile);
    if (!mob) continue;
    byMobile.set(mob, [...(byMobile.get(mob) ?? []), r]);
  }

  // رویدادها بر اساس درخواست
  const eventsByRequest = new Map<string, RequestEventRecord[]>();
  for (const e of events) {
    eventsByRequest.set(e.requestId, [...(eventsByRequest.get(e.requestId) ?? []), e]);
  }

  // آگهی‌های مالک بر اساس موبایل مالک
  const listingsByMobile = new Map<string, ListingRecord[]>();
  for (const l of listings) {
    const mob = normalizeMobile(l.customerMobile);
    if (!mob) continue;
    listingsByMobile.set(mob, [...(listingsByMobile.get(mob) ?? []), l]);
  }

  const now = Date.now();
  const customers: CustomerProfile[] = [];

  for (const [mobile, reqs] of byMobile) {
    const reqEvents = reqs.flatMap((r) => eventsByRequest.get(r.id) ?? []);
    const lastInteraction = reqEvents.length > 0 ? reqEvents[0].createdAt : reqs[0].updatedAt;
    const daysSince = Math.floor((now - lastInteraction.getTime()) / 86400_000);

    // جدیت/پرداخت حداکثری بین درخواست‌ها
    const maxSeriousness = Math.max(...reqs.map((r) => seriousnessScore(r.userSeriousity)), 0);
    const maxPayment = Math.max(...reqs.map((r) => paymentReadinessScore(r.userPaymentMethod)), 0);

    // کامل‌بودن میانگین
    const completenessRatio =
      reqs.reduce((s, r) => s + computeCompleteness(r).completeCount / 4, 0) / Math.max(reqs.length, 1);

    // تطبیق‌ها (شاهکار) — همه درخواست‌های مشتری × آگهی‌های دفتر
    const allMatches = reqs.flatMap((r) => matchRequestToListings(r, listings, 3));
    const strongMatches = allMatches.filter((m) => m.score >= 70);
    const topMatchByRequest = new Map<string, number>();
    for (const m of allMatches) {
      topMatchByRequest.set(m.requestId, Math.max(topMatchByRequest.get(m.requestId) ?? 0, m.score));
    }

    const ownedListings = listingsByMobile.get(mobile) ?? [];
    const name = reqs.find((r) => r.customerName)?.customerName ?? "—";
    const convertedDeals = convertedNames.has(normalizeName(name)) ? 1 : 0;

    const health = computeHealth({
      lastInteractionDays: daysSince,
      eventCount: reqEvents.length,
      maxSeriousness,
      maxPayment,
      completenessRatio,
    });

    const stage = computeStage({
      eventCount: reqEvents.length,
      daysSinceInteraction: daysSince,
      maxSeriousness,
      hasStrongMatch: strongMatches.length > 0,
      convertedDeals,
    });

    const incompleteRequests = reqs.filter((r) => computeCompleteness(r).completeCount < 4).length;
    const readyNotRegistered = reqs.filter((r) => !r.armRequestId && computeCompleteness(r).completeCount === 4).length;

    const nextActions = computeNextActions({
      name,
      daysSinceInteraction: daysSince,
      eventCount: reqEvents.length,
      incompleteRequests,
      readyNotRegistered,
      strongMatches: strongMatches.slice(0, 3),
      stage,
      maxSeriousness,
    });

    const segment: Segment = health.score >= 70 ? "A" : health.score >= 40 ? "B" : "C";

    customers.push({
      mobile,
      name,
      requestCount: reqs.length,
      requests: reqs.map((r) => ({
        id: r.id,
        title: `${tradeTypeRequestLabel(r.tradeTypeId)} ${propertyTypeLabel(r.propertyTypeId, r.buildingTypeId)}`,
        status: r.status,
        completeness: { completeCount: computeCompleteness(r).completeCount, total: 4 },
        armRegistered: Boolean(r.armRequestId),
        seriousnessName: r.userSeriousity ? (USER_SERIOUSNESS.find((s) => s.id === r.userSeriousity)?.name ?? "—") : "—",
        paymentMethodName: r.userPaymentMethod ? (PAYMENT_METHODS.find((p) => p.id === r.userPaymentMethod)?.name ?? "—") : "—",
        eventCount: eventsByRequest.get(r.id)?.length ?? 0,
        topMatchScore: topMatchByRequest.get(r.id) ?? null,
        updatedAt: r.updatedAt.toISOString(),
      })),
      ownedListings: ownedListings.map((l) => ({
        id: l.id,
        title: `${l.propertyTypeName ?? ""} ${l.areaName ?? ""}`.trim() || "آگهی",
        price: (() => {
          const inputs = parseJson<Record<string, unknown>>(l.inputsJson, {});
          return inputs["قیمت"] != null ? String(inputs["قیمت"]) : null;
        })(),
      })),
      convertedDeals,
      eventCount: reqEvents.length,
      lastInteractionAt: lastInteraction.toISOString(),
      daysSinceInteraction: daysSince,
      healthScore: health.score,
      healthBreakdown: health.breakdown,
      stage,
      segment,
      nextActions,
      bestMatches: allMatches.slice(0, 3),
    });
  }

  customers.sort((a, b) => b.healthScore - a.healthScore);

  const stageCounts = customers.reduce(
    (acc, c) => {
      acc[c.stage] = (acc[c.stage] ?? 0) + 1;
      return acc;
    },
    { NEW: 0, ENGAGED: 0, SERIOUS: 0, READY_TO_DEAL: 0, CONVERTED: 0, DORMANT: 0 } as Record<LifecycleStage, number>
  );

  const allMatchesCount = customers.reduce((s, c) => s + c.bestMatches.length, 0);
  const strongCount = customers.reduce((s, c) => s + c.bestMatches.filter((m) => m.score >= 70).length, 0);

  return {
    customers,
    stats: {
      totalCustomers: customers.length,
      activeCustomers: customers.filter((c) => c.stage !== "DORMANT" && c.stage !== "CONVERTED").length,
      dormantCustomers: stageCounts.DORMANT,
      convertedCustomers: stageCounts.CONVERTED,
      avgHealth: customers.length > 0 ? Math.round(customers.reduce((s, c) => s + c.healthScore, 0) / customers.length) : 0,
      segmentA: customers.filter((c) => c.segment === "A").length,
      segmentB: customers.filter((c) => c.segment === "B").length,
      segmentC: customers.filter((c) => c.segment === "C").length,
      stageCounts,
      totalMatches: allMatchesCount,
      strongMatches: strongCount,
      overdueContacts: customers.filter((c) => (c.daysSinceInteraction ?? 999) > 14 && c.stage !== "CONVERTED").length,
    },
  };
}

function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").replace(/ی/g, "ی").replace(/ک/g, "ک");
}

function faDays(n: number): string {
  return String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}
