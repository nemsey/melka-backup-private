/**
 * P6545 / گام ۲ — BLOCK 2.1: موتور تطبیق دوجهتهٔ ملکا (جلسه ۰۳۰ سؤال ۱۰)
 * ---------------------------------------------------------------------------
 * تب ۱ — آگهی → درخواست: ورودی کدملک، خروجی ۵ درخواست برتر با امتیاز و دلیل
 * تب ۲ — درخواست → آگهی: ورودی کد درخواست، خروجی ۵ آگهی برتر
 *
 * فیلتر سخت (شرط لازم):
 *   · معکوس نوع معامله: فروش↔خرید/پیش‌خرید · رهن‌واجاره↔رهن/اجاره
 *   · تلاقی قیمت (اگر بازهٔ درخواست معلوم باشد)
 *   · تلاقی منطقه (اگر مناطق درخواست معلوم باشد)
 *   · نوع ملک (اگر در عنوان درخواست نام برده باشد)
 *   · وضعیت فعال: درخواست‌های زنده × آگهی‌های «منتشر شده»
 *
 * امتیاز نرم (۵ عامل عین جلسه ۰۳۳):
 *   فاصله قیمت + نزدیکی جغرافیایی + تناسب متراژ + تازگی + سابقه کارشناس
 *
 * حلقهٔ یادگیری: پذیرش/رد هر تطبیق ثبت → پیامد → Evaluation → وزن‌های شخصی
 * (LearningEngine Tier-aware — صفر اجرای خودکار).
 *
 * قید: آستانهٔ انتشار هشدار فرصت = ۰٫۷ (BLOCK 1.4) — فقط هشدار، صفر اجرا.
 */

import type { PrismaClient } from "@prisma/client";
import type { LearningTier } from "@/core/intelligence/contracts-p7-p11";

/* ───────────────────────── انواع ───────────────────────── */

export interface ListingProfile {
  propertyCode: string;
  tradeTypeName: string | null; // فروش | رهن و اجاره | …
  propertyTypeName: string | null; // آپارتمان | ویلا | زمین | مغازه | …
  price: number | null;
  meterage: number | null;
  areaName: string | null;
  lineName: string | null;
  ownerCode: string | null; // کارشناس ثبت‌کننده
  status: string | null; // منتشر شده | معامله شده
  syncedAt: Date;
}

export interface RequestProfile {
  id: string;
  requestCode: string | null;
  title: string | null;
  customerName: string | null;
  status: string;
  tradeTypeName: string | null; // غنی‌نشده معمولاً null — از عنوان استخراج می‌شود
  propertyTypeName: string | null;
  priceFrom: number | null;
  priceTo: number | null;
  areaNames: string[];
  meterageFrom: number | null; // از عنوان («۷۰ الی ۹۰ متری»)
  meterageTo: number | null;
  tradeIntent: TradeIntent; // استخراج‌شده از عنوان
  wantedPropertyTypes: string[]; // کلیدواژه‌های نوع ملک در عنوان
}

export type TradeIntent = "buy" | "rent" | "unknown";

/**
 * اطلاعات کامل هر گزینهٔ پیشنهادی — الزام گام پنجم (ن۰۰۱ BLOCK 2.1):
 * وقتی کد آگهی داده می‌شود، گزینه‌های کد درخواست با اطلاعات کامل عرضه شوند — و بالعکس.
 * یعنی هر گزینهٔ پیشنهادی شامل: کد، نام مالک، موبایل، منطقه، قیمت، تازگی.
 */
export interface MatchOptionInfo {
  /** کد درخواست (تب ۱) یا کد ملک (تب ۲) */
  code: string;
  /** نام مالک (تب ۲) یا نام مشتری درخواست‌دهنده (تب ۱) */
  ownerName: string | null;
  /** موبایل */
  mobile: string | null;
  /** منطقه — نام یا فهرست مناطق */
  region: string | null;
  /** قیمت — عدد یا بازهٔ از/تا (برای آگهی: from = to = قیمت ملک) */
  priceFrom: number | null;
  priceTo: number | null;
  /** تازگی — زمان مرجع (آخرین بروزرسانی/همگام‌سازی) برای نمایش نسبی */
  lastSeenAt: string | null;
}

export interface MatchCandidate {
  requestId: string;
  score: number;
  hardPassed: boolean;
  reasons: Array<{ factor: string; value: number; weight: number; note: string }>;
  hardFilterNotes: string[];
  /** پوشش سیگنال واقعی — کسر وزن عواملی که داده‌شان موجود بود (۰ تا ۱) */
  signalCoverage: number;
  /** الزام گام پنجم ن۰۰۱ — اطلاعات کامل گزینه */
  info?: MatchOptionInfo;
}

export interface MatchResult {
  direction: "listing_to_request" | "request_to_listing";
  listingCode: string | null;
  requestId: string | null;
  candidates: Array<MatchCandidate & { listingCode?: string; requestLabel?: string }>;
  weightsUsed: MatchWeights;
  tier: LearningTier;
  evaluatedAt: string;
}

/* ───────────────────────── وزن‌ها (Tier-aware + شخصی‌سازی‌پذیر) ───────────────────────── */

export interface MatchWeights {
  priceDistance: number;
  geoProximity: number;
  meterageFit: number;
  freshness: number;
  expertHistory: number;
  propertyTypeMatch: number;
}

/** وزن‌های پایه — مجموع = ۱ (Tier 0: همین پایه) */
export const BASE_MATCH_WEIGHTS: MatchWeights = {
  priceDistance: 0.25,
  geoProximity: 0.15,
  meterageFit: 0.2,
  freshness: 0.15,
  expertHistory: 0.1,
  propertyTypeMatch: 0.15,
};

/** آستانهٔ انتشار هشدار فرصت (BLOCK 1.4 — جلسه ۰۳۳) */
export const ALERT_SCORE_THRESHOLD = 0.7;

/** سقف خروجی — ۵ برتر (عین جلسه ۰۳۳) */
export const TOP_N = 5;

/* ───────────────────────── استخراج نیت از عنوان درخواست ───────────────────────── */

/** واژه‌های نوع ملک قابل تطبیق (عنوان → نام نوع PropertyRecord) */
const PROPERTY_TYPE_KEYWORDS: Array<{ keywords: string[]; type: string }> = [
  { keywords: ["آپارتمان"], type: "آپارتمان" },
  { keywords: ["ویلا"], type: "ویلا" },
  { keywords: ["زمین", "کلنگی"], type: "زمین" },
  { keywords: ["مغازه", "تجاری"], type: "مغازه" },
  { keywords: ["باغ"], type: "باغ" },
  { keywords: ["خانه", "مسکونی"], type: "آپارتمان" },
];

/** استخراج نیت معامله + نوع ملک + بازهٔ متراژ از عنوان فارسی درخواست */
export function parseRequestTitle(title: string | null): {
  tradeIntent: TradeIntent;
  wantedPropertyTypes: string[];
  meterageFrom: number | null;
  meterageTo: number | null;
} {
  if (!title) return { tradeIntent: "unknown", wantedPropertyTypes: [], meterageFrom: null, meterageTo: null };
  let intent: TradeIntent = "unknown";
  if (/^پیش\s*خرید/.test(title) || /^خرید/.test(title)) intent = "buy";
  else if (/^رهن/.test(title) || /^اجاره/.test(title)) intent = "rent";
  else if (/خرید/.test(title.slice(0, 15))) intent = "buy";
  else if (/رهن|اجاره/.test(title.slice(0, 15))) intent = "rent";

  const wantedPropertyTypes: string[] = [];
  for (const { keywords, type } of PROPERTY_TYPE_KEYWORDS) {
    if (keywords.some((k) => title.includes(k)) && !wantedPropertyTypes.includes(type)) wantedPropertyTypes.push(type);
  }

  // متراژ: «۷۰ الی ۹۰ متری» یا «۸۰ متری» (ارقام فارسی و لاتین)
  const faDigits = "۰۱۲۳۴۵۶۷۸۹";
  const norm = title.replace(/[۰-۹]/g, (d) => String(faDigits.indexOf(d)));
  const rangeMatch = norm.match(/(\d{2,4})\s*(?:الی|تا)\s*(\d{2,4})\s*متر/);
  const singleMatch = norm.match(/(\d{2,4})\s*متر/);
  let meterageFrom: number | null = null;
  let meterageTo: number | null = null;
  if (rangeMatch) {
    meterageFrom = Number(rangeMatch[1]);
    meterageTo = Number(rangeMatch[2]);
  } else if (singleMatch) {
    meterageFrom = Number(singleMatch[1]);
    meterageTo = Number(singleMatch[1]);
  }
  return { tradeIntent: intent, wantedPropertyTypes, meterageFrom, meterageTo };
}

/** معکوس نوع معامله: فروش↔خرید · رهن‌واجاره↔رهن */
export function dealTypeCompatible(listingTrade: string | null, intent: TradeIntent, requestTrade: string | null): boolean {
  const lt = listingTrade ?? "";
  if (intent === "buy") return lt.includes("فروش");
  if (intent === "rent") return lt.includes("رهن") || lt.includes("اجاره");
  // نیت نامعلوم: اگر نام معاملهٔ غنی‌شده هست، همان معیار
  if (requestTrade) {
    if (requestTrade.includes("خرید") || requestTrade.includes("پیش")) return lt.includes("فروش");
    if (requestTrade.includes("رهن") || requestTrade.includes("اجاره")) return lt.includes("رهن") || lt.includes("اجاره");
  }
  return true; // بدون سیگنال — فیلتر سخت رد نمی‌کند (نرم ارزیابی می‌شود)
}

/** وضعیت‌های فعال درخواست (تقاضای زنده) */
export const ACTIVE_REQUEST_STATUSES = ["سرنخ", "فرصت", "در انتظار تایید", "در انتظار معامله", "ready"];

/* ───────────────────────── موتور تطبیق ───────────────────────── */

export interface MatchingEngineOptions {
  db: PrismaClient;
  tier?: LearningTier;
  /** وزن‌های شخصی‌شده (از حلقهٔ یادگیری) — پیش‌فرض BASE_MATCH_WEIGHTS */
  weights?: Partial<MatchWeights>;
  /** سقف کاندیدای بررسی‌شده در هر جهت (کارایی) */
  candidateLimit?: number;
}

export class MatchingEngine {
  private readonly db: PrismaClient;
  readonly tier: LearningTier;
  readonly weights: MatchWeights;

  constructor(opts: MatchingEngineOptions) {
    this.db = opts.db;
    this.tier = opts.tier ?? 3;
    const w = { ...BASE_MATCH_WEIGHTS };
    if (opts.weights) Object.assign(w, opts.weights);
    // نرمال‌سازی مجموع روی ۱
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    if (sum > 0) for (const k of Object.keys(w) as Array<keyof MatchWeights>) w[k] = w[k] / sum;
    this.weights = w;
  }

  private toRequestProfile(r: {
    id: string; requestCode: string | null; title: string | null; customerName: string | null;
    status: string; tradeTypeName: string | null; propertyTypeName: string | null;
    priceFrom: number | null; priceTo: number | null; areaNamesJson: string | null;
  }): RequestProfile {
    const parsed = parseRequestTitle(r.title);
    let areaNames: string[] = [];
    if (r.areaNamesJson) {
      try { const v = JSON.parse(r.areaNamesJson); if (Array.isArray(v)) areaNames = v.filter((x) => typeof x === "string"); } catch { /* لایهٔ خام */ }
    }
    return {
      id: r.id, requestCode: r.requestCode, title: r.title, customerName: r.customerName,
      status: r.status, tradeTypeName: r.tradeTypeName, propertyTypeName: r.propertyTypeName,
      priceFrom: r.priceFrom, priceTo: r.priceTo, areaNames,
      meterageFrom: parsed.meterageFrom, meterageTo: parsed.meterageTo,
      tradeIntent: parsed.tradeIntent, wantedPropertyTypes: parsed.wantedPropertyTypes,
    };
  }

  /** تب ۱ — آگهی → ۵ درخواست برتر */
  async matchListingToRequests(listingCode: string): Promise<MatchResult> {
    const listing = await this.db.propertyRecord.findFirst({ where: { propertyCode: listingCode } });
    if (!listing) {
      return { direction: "listing_to_request", listingCode, requestId: null, candidates: [], weightsUsed: this.weights, tier: this.tier, evaluatedAt: new Date().toISOString() };
    }
    const profile: ListingProfile = {
      propertyCode: listing.propertyCode, tradeTypeName: listing.tradeTypeName,
      propertyTypeName: listing.propertyTypeName, price: listing.price,
      meterage: listing.meterage, areaName: listing.areaName, lineName: listing.lineName,
      ownerCode: listing.ownerCode, status: listing.status, syncedAt: listing.syncedAt,
    };
    // کاندیداها: درخواست‌های فعال
    const rows = await this.db.requestRecord.findMany({
      where: { status: { in: ACTIVE_REQUEST_STATUSES } },
      select: { id: true, requestCode: true, title: true, customerName: true, customerMobile: true, status: true, tradeTypeName: true, propertyTypeName: true, priceFrom: true, priceTo: true, areaNamesJson: true, updatedAt: true },
      take: this.candidateLimit ?? 3000,
      orderBy: { updatedAt: "desc" },
    });
    // سابقهٔ کارشناسِ آگهی — از گراف معاملات (یال brokered_by)
    const ownerTx = listing.ownerCode
      ? await this.db.graphEdge.count({ where: { graph: "transaction", edgeType: "brokered_by", toRef: listing.ownerCode } })
      : 0;

    const scored: Array<MatchCandidate & { requestLabel: string }> = [];
    for (const r of rows) {
      const req = this.toRequestProfile(r);
      const s = this.score(profile, req, ownerTx);
      // گام پنجم ن۰۰۱ — گزینهٔ درخواست با اطلاعات کامل: کد، نام مشتری، موبایل، مناطق، بازهٔ قیمت، تازگی
      const info: MatchOptionInfo = {
        code: r.requestCode ?? r.id,
        ownerName: r.customerName,
        mobile: r.customerMobile,
        region: req.areaNames.length > 0 ? req.areaNames.slice(0, 3).join("، ") : null,
        priceFrom: r.priceFrom,
        priceTo: r.priceTo,
        lastSeenAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : null,
      };
      if (s.hardPassed) scored.push({ ...s, requestId: req.id, requestLabel: req.title ?? req.id, info });
    }
    scored.sort((a, b) => b.score - a.score);
    return {
      direction: "listing_to_request",
      listingCode,
      requestId: null,
      candidates: scored.slice(0, TOP_N),
      weightsUsed: this.weights,
      tier: this.tier,
      evaluatedAt: new Date().toISOString(),
    };
  }

  /** تب ۲ — درخواست → ۵ آگهی برتر */
  async matchRequestToListings(requestId: string): Promise<MatchResult> {
    const r = await this.db.requestRecord.findFirst({ where: { id: requestId } });
    if (!r) {
      return { direction: "request_to_listing", listingCode: null, requestId, candidates: [], weightsUsed: this.weights, tier: this.tier, evaluatedAt: new Date().toISOString() };
    }
    const req = this.toRequestProfile({
      id: r.id, requestCode: r.requestCode, title: r.title, customerName: r.customerName,
      status: r.status, tradeTypeName: r.tradeTypeName, propertyTypeName: r.propertyTypeName,
      priceFrom: r.priceFrom, priceTo: r.priceTo, areaNamesJson: r.areaNamesJson,
    });
    // کاندیداها: آگهی‌های منتشرشده
    const rows = await this.db.propertyRecord.findMany({
      where: { status: "منتشر شده" },
      select: { propertyCode: true, tradeTypeName: true, propertyTypeName: true, price: true, meterage: true, areaName: true, lineName: true, ownerCode: true, ownerName: true, ownerMobile: true, status: true, syncedAt: true, title: true },
      take: this.candidateLimit ?? 3000,
      orderBy: { syncedAt: "desc" },
    });
    // سابقهٔ کارشناسان — از گراف معاملات (یال‌های brokered_by)؛ منبع یگانهٔ دانش مشترک
    // (P6.5-04-i: صفر فیلتر دامنهٔ دست‌نویس — شمارش از گراف، نه فیلتر مستقیم ستون دامنه)
    const txByOwner = new Map<string, number>();
    const brokerEdges = await this.db.graphEdge.groupBy({ by: ["toRef"], _count: true, where: { graph: "transaction", edgeType: "brokered_by" } });
    for (const row of brokerEdges) txByOwner.set(row.toRef, row._count);

    const scored: Array<MatchCandidate & { listingCode: string }> = [];
    for (const row of rows) {
      const profile: ListingProfile = {
        propertyCode: row.propertyCode, tradeTypeName: row.tradeTypeName,
        propertyTypeName: row.propertyTypeName, price: row.price, meterage: row.meterage,
        areaName: row.areaName, lineName: row.lineName, ownerCode: row.ownerCode,
        status: row.status, syncedAt: row.syncedAt,
      };
      const ownerTx = row.ownerCode ? txByOwner.get(row.ownerCode) ?? 0 : 0;
      const s = this.score(profile, req, ownerTx);
      // گام پنجم ن۰۰۱ — گزینهٔ آگهی با اطلاعات کامل: کد، نام مالک، موبایل، منطقه، قیمت، تازگی
      const info: MatchOptionInfo = {
        code: row.propertyCode,
        ownerName: row.ownerName,
        mobile: row.ownerMobile,
        region: row.areaName,
        priceFrom: row.price,
        priceTo: row.price,
        lastSeenAt: row.syncedAt instanceof Date ? row.syncedAt.toISOString() : null,
      };
      if (s.hardPassed) scored.push({ ...s, requestId: req.id, listingCode: row.propertyCode, info });
    }
    scored.sort((a, b) => b.score - a.score);
    return {
      direction: "request_to_listing",
      listingCode: null,
      requestId,
      candidates: scored.slice(0, TOP_N),
      weightsUsed: this.weights,
      tier: this.tier,
      evaluatedAt: new Date().toISOString(),
    };
  }

  /* ── فیلتر سخت + امتیاز نرم (منبع یگانه برای هر دو جهت) ── */
  private score(listing: ListingProfile, req: RequestProfile, ownerTxCount: number): MatchCandidate {
    const reasons: MatchCandidate["reasons"] = [];
    const hardFilterNotes: string[] = [];

    // فیلتر سخت ۱ — معکوس نوع معامله
    const dealOk = dealTypeCompatible(listing.tradeTypeName, req.tradeIntent, req.tradeTypeName);
    if (!dealOk) return { requestId: req.id, score: 0, hardPassed: false, reasons: [], hardFilterNotes: ["نوع معامله ناسازگار"], signalCoverage: 0 };

    // فیلتر سخت ۲ — تلاقی قیمت (فقط وقتی بازهٔ درخواست معلوم است)
    let priceHardPass = true;
    if (req.priceFrom != null && req.priceTo != null && listing.price != null) {
      const tolerance = 0.1;
      priceHardPass = listing.price >= req.priceFrom * (1 - tolerance) && listing.price <= req.priceTo * (1 + tolerance);
      if (!priceHardPass) return { requestId: req.id, score: 0, hardPassed: false, reasons: [], hardFilterNotes: [`قیمت ${listing.price} خارج از بازهٔ ${req.priceFrom}-${req.priceTo}`], signalCoverage: 0 };
      hardFilterNotes.push(`تلاقی قیمت ✓ (${req.priceFrom}-${req.priceTo})`);
    }

    // فیلتر سخت ۳ — تلاقی منطقه (فقط وقتی مناطق درخواست معلوم است)
    if (req.areaNames.length > 0 && listing.areaName) {
      const regionOk = req.areaNames.includes(listing.areaName);
      if (!regionOk) return { requestId: req.id, score: 0, hardPassed: false, reasons: [], hardFilterNotes: [`منطقهٔ ${listing.areaName} در مناطق درخواست نیست`], signalCoverage: 0 };
      hardFilterNotes.push(`تلاقی منطقه ✓ (${listing.areaName})`);
    }

    // فیلتر سخت ۴ — نوع ملک (فقط وقتی در عنوان درخواست نام برده شده)
    let typeHardPass = true;
    const wantedTypes = req.wantedPropertyTypes.length > 0 ? req.wantedPropertyTypes : req.propertyTypeName ? [req.propertyTypeName] : [];
    if (wantedTypes.length > 0 && listing.propertyTypeName) {
      const normalize = (s: string) => s.replace(/\s+/g, "");
      typeHardPass = wantedTypes.some((t) => normalize(listing.propertyTypeName ?? "").includes(normalize(t)) || normalize(t).includes(normalize(listing.propertyTypeName ?? "")));
      if (!typeHardPass) return { requestId: req.id, score: 0, hardPassed: false, reasons: [], hardFilterNotes: [`نوع ملک ${listing.propertyTypeName} ≠ ${wantedTypes.join("/")}`], signalCoverage: 0 };
      hardFilterNotes.push(`نوع ملک ✓ (${listing.propertyTypeName})`);
    }

    /* ── امتیاز نرم ── */
    // ۱) فاصله قیمت — ۱ اگر داخل بازه؛ خارج بازه با فاصلهٔ نسبی افت می‌کند؛ نامعلوم = خنثی ۰٫۵
    const availableWeight = { price: false, geo: false, meterage: false, type: false };
    let priceDistance = 0.5;
    if (req.priceFrom != null && req.priceTo != null && listing.price != null) {
      availableWeight.price = true;
      if (listing.price >= req.priceFrom && listing.price <= req.priceTo) priceDistance = 1;
      else {
        const center = (req.priceFrom + req.priceTo) / 2;
        const rel = Math.abs(listing.price - center) / Math.max(center, 1);
        priceDistance = Math.max(0, 1 - rel * 2);
      }
    }
    reasons.push({ factor: "فاصله قیمت", value: round2(priceDistance), weight: round2(this.weights.priceDistance), note: req.priceFrom != null ? `بازهٔ ${req.priceFrom}-${req.priceTo}` : "بدون بازهٔ قیمت (خنثی)" });

    // ۲) نزدیکی جغرافیایی — همان منطقه ۱ · همان شهر ۰٫۵ · نامعلوم ۰٫۵
    let geo = 0.5;
    if (req.areaNames.length > 0 && listing.areaName) { availableWeight.geo = true; geo = req.areaNames.includes(listing.areaName) ? 1 : 0.3; }
    reasons.push({ factor: "نزدیکی جغرافیایی", value: round2(geo), weight: round2(this.weights.geoProximity), note: listing.areaName ?? "بدون منطقه" });

    // ۳) تناسب متراژ — داخل بازهٔ عنوان ۱؛ خارج بازه افت خطی؛ نامعلوم ۰٫۵
    let meterageFit = 0.5;
    if (req.meterageFrom != null && req.meterageTo != null && listing.meterage != null) {
      availableWeight.meterage = true;
      if (listing.meterage >= req.meterageFrom && listing.meterage <= req.meterageTo) meterageFit = 1;
      else {
        const span = Math.max(req.meterageTo - req.meterageFrom, 1);
        const dist = listing.meterage < req.meterageFrom ? req.meterageFrom - listing.meterage : listing.meterage - req.meterageTo;
        meterageFit = Math.max(0, 1 - dist / (span * 2));
      }
    }
    reasons.push({ factor: "تناسب متراژ", value: round2(meterageFit), weight: round2(this.weights.meterageFit), note: req.meterageFrom != null ? `${req.meterageFrom}-${req.meterageTo} متر` : "بدون بازهٔ متراژ (خنثی)" });

    // ۴) تازگی آگهی — < ۷ روز ۱ · افت تا ۳۰ روز · بعد ۰٫۱
    const ageDays = (Date.now() - new Date(listing.syncedAt).getTime()) / 86400000;
    const freshness = ageDays <= 7 ? 1 : ageDays >= 30 ? 0.1 : Math.max(0.1, 1 - (ageDays - 7) / 23);
    reasons.push({ factor: "تازگی آگهی", value: round2(freshness), weight: round2(this.weights.freshness), note: `${Math.round(ageDays)} روز` });

    // ۵) سابقهٔ کارشناس — تعداد معاملات ثبت‌شدهٔ کارشناسِ آگهی (نرمال تا ۱۰ معامله)
    // صداقت سیگنال: بدون کد کارشناس (ownerCode=null در کل دادهٔ فعلی) = خنثی ۰٫۵ نه صفر
    const hasExpertSignal = ownerTxCount >= 0 && listing.ownerCode != null;
    const expertHistory = listing.ownerCode == null ? 0.5 : Math.min(1, ownerTxCount / 10);
    reasons.push({ factor: "سابقه کارشناس", value: round2(expertHistory), weight: round2(this.weights.expertHistory), note: hasExpertSignal ? `${ownerTxCount} معامله` : "بدون کد کارشناس (خنثی)" });

    // ۶) تطابق نوع ملک (نرم — وقتی فیلتر سخت سیگنالی نداشت)
    if (wantedTypes.length > 0) availableWeight.type = true;
    const typeMatch = wantedTypes.length === 0 ? 0.5 : listing.propertyTypeName && wantedTypes.some((t) => listing.propertyTypeName!.includes(t) || t.includes(listing.propertyTypeName!)) ? 1 : 0;
    reasons.push({ factor: "تطابق نوع ملک", value: round2(typeMatch), weight: round2(this.weights.propertyTypeMatch), note: listing.propertyTypeName ?? "نامعلوم" });

    const score = reasons.reduce((sum, r) => sum + r.value * r.weight, 0);
    // پوشش سیگنال واقعی: کسر وزن عوامل با دادهٔ موجود (قیمت/منطقه/متراژ/نوع) + عوامل همیشه‌موجود (تازگی/سابقه)
    const signalWeight =
      (availableWeight.price ? this.weights.priceDistance : 0) +
      (availableWeight.geo ? this.weights.geoProximity : 0) +
      (availableWeight.meterage ? this.weights.meterageFit : 0) +
      (availableWeight.type ? this.weights.propertyTypeMatch : 0) +
      this.weights.freshness +
      (listing.ownerCode != null ? this.weights.expertHistory : 0);
    const signalCoverage = round2(Math.min(1, signalWeight));
    return { requestId: req.id, score: round2(score), hardPassed: true, reasons, hardFilterNotes, signalCoverage };
  }

  private candidateLimit?: number;
  setCandidateLimit(n: number | undefined) { this.candidateLimit = n; }
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
