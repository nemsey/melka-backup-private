/**
 * سه فیلتر هوشمند ایجنت فایل‌یابی + امتیاز نهایی ۱ تا ۱۰۰
 * ------------------------------------------------------
 * ۱) شخصی‌بودن — مهم‌ترین فیلتر: تشخیص آگهی مالک از آگهی مشاور املاک
 * ۲) زیرقیمت — مقایسه قیمت هر متر با آمار آگهی‌های مشابه همان محله (ترکیبی با آرم)
 * ۳) مکان — تطبیق با منطقه/محله‌های سامانه آرم (متنی + مختصات)
 */

import { matchTabrizLocation, type LocationMatchResult } from "./tabriz-locations";
import type { DivarSettings } from "./config";

// ===================== ۱) فیلتر هوشمند «شخصی بودن» =====================

export interface PersonalSignal {
  key: string;
  label: string;
  /** سهم این سیگنال در امتیاز (مثبت = شخصی، منفی = مشاور) */
  weight: number;
  hit: boolean;
  evidence: string;
}

export interface PersonalScoreResult {
  score: number; // 0..100
  isBroker: boolean;
  confidence: "high" | "medium" | "low";
  signals: PersonalSignal[];
}

/** واژگان قوی مشاور املاک — عین ساختار اکوسیستم دیوار/تبریز */
const BROKER_KEYWORDS: { words: string[]; label: string; weight: number }[] = [
  { words: ["مشاور املاک", "مشاورِ املاک", "مشاوری املاک"], label: "عبارت «مشاور املاک»", weight: 55 },
  { words: ["املاک ", "املاک-", "آژانس", "املاک."], label: "نام آژانس/املاک", weight: 40 },
  { words: ["مشاور شما", "مشاور ملکی", "با مشاور", "همکار", "همکاران"], label: "ادبیات مشاوره‌ای", weight: 25 },
  { words: ["دیوار حرفه‌ای", "دیوار حرفه ای", "حرفه‌ای", "حرفه ای"], label: "برچسب حرفه‌ای دیوار", weight: 35 },
  { words: ["فایل دربست", "فایل های", "چند فایل", "فایلهای", "فایل‌های", "ارائه فایل", "انبوه فایل"], label: "ادبیات فایل‌فروشی", weight: 30 },
  { words: ["مجموعه ", "گروه ", "شرکت "], label: "ساختار شرکتی", weight: 20 },
  { words: ["ماهونده", "ماهنامه", "کارمزد"], label: "ادبیات کارمزدی", weight: 20 },
];

/** واژگان قوی شخصی بودن مالک */
const PERSONAL_KEYWORDS: { words: string[]; label: string; weight: number }[] = [
  { words: ["بدون واسطه", "مستقیم از مالک", "از مالک", "مالک هستم", "مالک خودم", "ملک خودم"], label: "اعلام «بدون واسطه/مالک»", weight: 45 },
  { words: ["ضرورت مالی", "فوری", "فوری فروش", "نیاز مالی", "بدهی", "فوریه", "تعطیل ملک"], label: "ضرورت شخصی فروش", weight: 30 },
  { words: ["تنها مالک", "مالک اول", "یک مالک", "مالک تک"], label: "تکیه بر مالکیت واحد", weight: 30 },
  { words: ["سند تکبرگ", "سند آماده", "آماده انتقال", "فوری تحویل"], label: "اسناد شخصی آماده", weight: 12 },
  { words: ["قابل معامله مستقیم", "معامله مستقیم", "خرید مستقیم"], label: "معامله مستقیم", weight: 20 },
];

/** تحلیل هوشمند شخصی‌بودن آگهی دیوار — امتیاز ۰ تا ۱۰۰ */
export function scorePersonalAd(input: {
  title: string;
  description?: string | null;
  /** برچسب کسب‌وکار کنار (اگر از Kenar آمده باشد) */
  businessName?: string | null;
  /** آیا حساب آگهی‌دهنده کسب‌وکار است (کنار: business_data) */
  isBusinessAccount?: boolean | null;
}): PersonalScoreResult {
  const text = `${input.title} ${input.description ?? ""}`.replace(/\u200c/g, " ");
  const signals: PersonalSignal[] = [];
  let brokerScore = 0;
  let personalScore = 0;

  for (const group of BROKER_KEYWORDS) {
    const hit = group.words.some((w) => text.includes(w));
    signals.push({
      key: `broker:${group.label}`,
      label: group.label,
      weight: -group.weight,
      hit,
      evidence: hit ? `در متن آگهی یافت شد` : "یافت نشد",
    });
    if (hit) brokerScore += group.weight;
  }
  for (const group of PERSONAL_KEYWORDS) {
    const hit = group.words.some((w) => text.includes(w));
    signals.push({
      key: `personal:${group.label}`,
      label: group.label,
      weight: group.weight,
      hit,
      evidence: hit ? "در متن آگهی یافت شد" : "یافت نشد",
    });
    if (hit) personalScore += group.weight;
  }

  // سیگنال رسمی کنار (معتبرترین): business_data
  if (input.isBusinessAccount === true || input.businessName) {
    signals.push({
      key: "kenar:business",
      label: input.businessName ? `حساب کسب‌وکار رسمی (${input.businessName})` : "حساب کسب‌وکار رسمی",
      weight: -60,
      hit: true,
      evidence: "از API رسمی کنار دیوار",
    });
    brokerScore += 60;
  } else if (input.isBusinessAccount === false) {
    signals.push({
      key: "kenar:business",
      label: "حساب شخصی (غیرکسب‌وکار)",
      weight: 40,
      hit: true,
      evidence: "از API رسمی کنار دیوار",
    });
    personalScore += 40;
  }

  // ترکیب: پایه ۵۰ (خنثی)؛ سیگنال‌های مشاور منفی و شخصی مثبت
  let score = 50 - brokerScore + personalScore;
  score = Math.max(0, Math.min(100, score));

  // اطمینان: تعداد سیگنال‌های فعال
  const activeSignals = signals.filter((s) => s.hit).length;
  const confidence: "high" | "medium" | "low" =
    activeSignals >= 3 ? "high" : activeSignals >= 1 ? "medium" : "low";

  return {
    score: Math.round(score),
    isBroker: brokerScore >= 35 || input.isBusinessAccount === true,
    confidence,
    signals: signals.filter((s) => s.hit || Math.abs(s.weight) >= 30),
  };
}

// ===================== ۲) فیلتر هوشمند «زیر قیمت بودن» =====================

export interface UnderpriceResult {
  score: number; // 0..100
  percentBelow: number | null; // درصد زیر بودن قیمت هر متر نسبت به مرجع
  referencePerMeter: number | null; // میانگین مرجع (تومان بر متر)
  sampleCount: number;
  confidence: "high" | "medium" | "low";
  method: "divar+arm" | "divar" | "arm" | "none";
  reason: string;
}

export interface MarketRef {
  medianPerMeter: number | null;
  sampleCount: number;
  source: "divar" | "arm" | "blend";
}

/**
 * امتیاز زیرقیمت — شاهکار ایجنت:
 * درصد زیر بودن «قیمت هر متر» آگهی نسبت به میانگین آگهی‌های مشابه همان محله
 * (ترکیب وزن‌دار با قیمت‌های سامانه آرم در صورت وجود).
 * نرمال‌سازی: ~۰٪ زیر = امتیاز ۵۰؛ ۳۰٪+ زیر = امتیاز ۱۰۰؛ ۱۵٪+ بالاتر = ۰
 */
export function scoreUnderprice(input: {
  pricePerMeter: number | null;
  ref: MarketRef | null;
  armRefPerMeter?: number | null;
  armWeight?: number;
  minSample?: number;
}): UnderpriceResult {
  const minSample = input.minSample ?? 4;
  const armWeight = Math.min(Math.max(input.armWeight ?? 0.35, 0), 0.9);
  if (!input.pricePerMeter || !(input.pricePerMeter > 0)) {
    return { score: 0, percentBelow: null, referencePerMeter: null, sampleCount: 0, confidence: "low", method: "none", reason: "قیمت هر متر برای این آگهی قابل استخراج نیست." };
  }
  const divarRef = (input.ref?.sampleCount ?? 0) >= minSample ? input.ref?.medianPerMeter ?? null : null;
  const armRef = input.armRefPerMeter && input.armRefPerMeter > 0 ? input.armRefPerMeter : null;

  let reference: number | null = null;
  let method: UnderpriceResult["method"] = "none";
  if (divarRef && armRef) {
    reference = divarRef * (1 - armWeight) + armRef * armWeight;
    method = "divar+arm";
  } else if (divarRef) {
    reference = divarRef;
    method = "divar";
  } else if (armRef) {
    reference = armRef;
    method = "arm";
  }
  if (!reference || reference <= 0) {
    return {
      score: 0,
      percentBelow: null,
      referencePerMeter: null,
      sampleCount: input.ref?.sampleCount ?? 0,
      confidence: "low",
      method: "none",
      reason: `آمار کافی برای محله این آگهی در دسترس نیست (حداقل ${minSample} آگهی مشابه لازم است).`,
    };
  }

  const percentBelow = ((reference - input.pricePerMeter) / reference) * 100;
  const sampleCount = input.ref?.sampleCount ?? 0;
  // نرمال‌سازی درصد به امتیاز
  let score: number;
  if (percentBelow <= -15) score = 0;
  else if (percentBelow >= 30) score = 100;
  else score = 50 + (percentBelow / 30) * 50 * (percentBelow > 0 ? 1.2 : 0.9);
  score = Math.max(0, Math.min(100, score));

  const confidence: "high" | "medium" | "low" =
    method === "divar+arm" ? "high" : sampleCount >= minSample * 2 || method === "arm" ? "medium" : "low";

  const fa = (n: number) => Math.round(n).toLocaleString("en-US").replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
  const reason =
    percentBelow >= 0
      ? `قیمت هر متر این آگهی حدود ${fa(percentBelow)}٪ زیر میانگین مرجع (${fa(reference)} تومان بر متر، ${fa(sampleCount)} نمونه، روش ${method === "divar+arm" ? "ترکیبی دیوار+آرم" : method === "divar" ? "آگهی‌های مشابه دیوار" : "سامانه آرم"}) است.`
      : `قیمت هر متر این آگهی حدود ${fa(-percentBelow)}٪ بالاتر از میانگین مرجع است — فایل گران محسوب می‌شود.`;

  return {
    score: Math.round(score),
    percentBelow: Math.round(percentBelow * 10) / 10,
    referencePerMeter: Math.round(reference),
    sampleCount,
    confidence,
    method,
    reason,
  };
}

// ===================== ۳) فیلتر هوشمند «مکان» =====================

export { matchTabrizLocation, type LocationMatchResult };

/** امتیاز مکان با احتساب فیلتر انتخابی کاربر */
export function scoreLocation(input: {
  title: string;
  locationText?: string | null;
  description?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  selectedAreaIds: string[];
  selectedLineIds: string[];
}): LocationMatchResult {
  const match = matchTabrizLocation(input);
  // اگر کاربر محدوده انتخاب کرده و آگهی بیرون آن است → امتیاز صفر
  if ((input.selectedAreaIds.length > 0 || input.selectedLineIds.length > 0) && match.lineId) {
    const inArea = !input.selectedAreaIds.length || input.selectedAreaIds.includes(match.areaId ?? "");
    const inLine = !input.selectedLineIds.length || input.selectedLineIds.includes(match.lineId);
    if (!inArea || !inLine) {
      return { ...match, score: 0, reason: `${match.reason} — بیرون از محدوده انتخابی شما.` };
    }
  }
  return match;
}

// ===================== امتیاز نهایی و دسته‌بندی =====================

export interface TotalScoreInput {
  personal: number;
  underprice: number;
  location: number;
  settings: Pick<DivarSettings, "weightPersonal" | "weightUnderprice" | "weightLocation" | "huntThreshold" | "followThreshold">;
}

export type AdBucket = "hunt" | "follow" | "review";

export interface TotalScoreResult {
  total: number;
  bucket: AdBucket;
  breakdown: { personal: number; underprice: number; location: number };
}

/** امتیاز نهایی ۱ تا ۱۰۰ با وزن‌های قابل تنظیم + دسته‌بندی شکار/پیگیری/بررسی */
export function computeTotalScore(input: TotalScoreInput): TotalScoreResult {
  const wp = Math.max(0, input.settings.weightPersonal);
  const wu = Math.max(0, input.settings.weightUnderprice);
  const wl = Math.max(0, input.settings.weightLocation);
  const sum = wp + wu + wl;
  const wsum = sum > 0 ? sum : 100;
  const total = Math.round(
    (input.personal * wp + input.underprice * wu + input.location * wl) / wsum
  );
  const hunt = Math.max(1, Math.min(99, input.settings.huntThreshold));
  const follow = Math.max(1, Math.min(hunt - 1, input.settings.followThreshold));
  const bucket: AdBucket = total > hunt ? "hunt" : total >= follow ? "follow" : "review";
  return {
    total: Math.max(1, Math.min(100, total)),
    bucket,
    breakdown: { personal: input.personal, underprice: input.underprice, location: input.location },
  };
}

/** پیش‌بینی هوشمند دلایل احتمالی رد آگهی توسط کاربر (کلید جزییات) */
export function predictRejectReasons(input: {
  personal: PersonalScoreResult;
  underprice: UnderpriceResult;
  location: LocationMatchResult;
  pricePerMeter: number | null;
}): { key: string; title: string; likely: number; hint: string }[] {
  const out: { key: string; title: string; likely: number; hint: string }[] = [];
  if (input.personal.isBroker || input.personal.score < 35) {
    out.push({ key: "broker", title: "آگهی مشاور املاک است (شخصی نیست)", likely: 85, hint: "امتیاز شخصی‌بودن پایین است" });
  }
  if (input.personal.score >= 35 && input.personal.score < 60) {
    out.push({ key: "semi-personal", title: "شخصی‌بودن آگهی قطعی نیست", likely: 55, hint: "نشانه‌های متناقص در متن آگهی" });
  }
  if (input.pricePerMeter == null) {
    out.push({ key: "no-price", title: "قیمت آگهی درج نشده / قابل استخراج نیست", likely: 70, hint: "قیمت هر متر نامشخص" });
  } else if (input.underprice.percentBelow != null && input.underprice.percentBelow < 0) {
    out.push({ key: "overpriced", title: "قیمت بالاتر از بازار است", likely: 75, hint: "زیرقیمت نیست" });
  }
  if (input.location.score < 40) {
    out.push({ key: "location", title: "موقعیت مکانی نامشخص/خارج از محدوده", likely: 60, hint: input.location.reason });
  }
  if (input.underprice.percentBelow != null && input.underprice.percentBelow < 5 && input.pricePerMeter != null) {
    out.push({ key: "not-underpriced", title: "قیمت معمولی است — شکار نمی‌ارزد", likely: 45, hint: "تخفیف معنادار ندارد" });
  }
  out.push({ key: "already-sold", title: "ملک قبلاً فروخته/تماس بی‌پاسخ", likely: 25, hint: "ایجنت از روی الگوی ردهای قبلی شما" });
  out.push({ key: "condition", title: "وضعیت ساختمان/سند مشکل‌دار", likely: 25, hint: "نیازمند بازدید حضوری" });
  out.push({ key: "other", title: "دلیل دیگر (در توضیحات بنویسید)", likely: 10, hint: "خودتان شرح دهید" });
  return out;
}
