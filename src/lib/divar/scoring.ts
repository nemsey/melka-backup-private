/**
 * چهار فیلتر هوشمند ایجنت فایل‌یابی + امتیاز نهایی ۱ تا ۱۰۰
 * ------------------------------------------------------
 * قوانین مالک (نسخه ۳):
 *  ۱) فایل غیرشخصی (مشاور/دپارتمان املاک) کاملاً رد می‌شود — هرگز ذخیره/دسته‌بندی نمی‌شود
 *  ۲) فقط فایل‌های شخصی امتیازدهی و دسته‌بندی می‌شوند
 *  ۳) امتیاز پیش‌فرض (جمع = ۱۰۰):
 *     ۵۰ «درصد شخصی‌بودن» + ۲۰ «درصد زیرقیمت‌بودن»
 *     + ۲۰ «سایر فاکتورهای فایل بهینه» (شاهکار ایجنت) + ۱۰ «تطبیق مکان با تنظیمات مکان کاربر»
 *     (هر چهار وزن در تنظیمات ایجنت قابل افزایش/کاهش‌اند)
 */

import { matchTabrizLocation, type LocationMatchResult } from "./tabriz-locations";
import type { DivarSettings } from "./config";
import type { PublisherKind } from "./client";

// ===================== ۱) فیلتر هوشمند «شخصی بودن» =====================

/** برچسب فارسی نوع آگهی‌دهنده — عین برچسب زیر نقشه دیوار */
export const PUBLISHER_KIND_LABELS: Record<PublisherKind, string> = {
  personal: "شخصی (مالک)",
  agent: "مشاور املاک",
  department: "دپارتمان املاک",
  business: "کسب‌وکار املاک",
};

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

/**
 * تحلیل هوشمند شخصی‌بودن آگهی دیوار — امتیاز ۰ تا ۱۰۰
 * قوی‌ترین سیگنال: برچسب رسمی دیوار زیر نقشه (BUSINESS_SECTION) —
 * آگهی مشاور/دپارتمان املاک هرگز «شخصی» تلقی نمی‌شود؛ آگهی بدون کسب‌وکار املاک، شخصی است.
 */
export function scorePersonalAd(input: {
  title: string;
  description?: string | null;
  /** برچسب کسب‌وکار کنار (اگر از Kenar آمده باشد) */
  businessName?: string | null;
  /** آیا حساب آگهی‌دهنده کسب‌وکار است (کنار: business_data) */
  isBusinessAccount?: boolean | null;
  /** نوع آگهی‌دهنده — برچسب رسمی دیوار زیر نقشه (مشاور/دپارتمان/شخصی) */
  publisherType?: PublisherKind | null;
  /** نام کسب‌وکار املاک از کارت زیر نقشه دیوار */
  publisherName?: string | null;
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

  // سیگنال رسمی برچسب زیر نقشه دیوار (BUSINESS_SECTION) — قطعی‌ترین منبع تشخیص
  const publisher = input.publisherType ?? null;
  if (publisher === "agent" || publisher === "department" || publisher === "business") {
    const label = PUBLISHER_KIND_LABELS[publisher];
    signals.push({
      key: "divar:publisher",
      label: input.publisherName ? `برچسب دیوار زیر نقشه: ${label} (${input.publisherName})` : `برچسب دیوار زیر نقشه: ${label}`,
      weight: -85,
      hit: true,
      evidence: "از BUSINESS_SECTION صفحه آگهی دیوار",
    });
    brokerScore += 85;
  } else if (publisher === "personal") {
    signals.push({
      key: "divar:publisher",
      label: "برچسب دیوار: آگهی شخصی — فاقد کسب‌وکار املاک",
      weight: 30,
      hit: true,
      evidence: "صفحه آگهی دیوار بدون BUSINESS_SECTION است",
    });
    personalScore += 30;
  }

  // ترکیب: پایه ۵۰ (خنثی)؛ سیگنال‌های مشاور منفی و شخصی مثبت
  let score = 50 - brokerScore + personalScore;
  score = Math.max(0, Math.min(100, score));
  // برچسب رسمی کسب‌وکار → سقف قطعی: آگهی مشاور/دپارتمان هرگز «شخصی» نمی‌شود
  if (publisher === "agent" || publisher === "department" || publisher === "business") {
    score = Math.min(score, 8);
  }

  // اطمینان: تعداد سیگنال‌های فعال
  const activeSignals = signals.filter((s) => s.hit).length;
  const confidence: "high" | "medium" | "low" =
    activeSignals >= 3 ? "high" : activeSignals >= 1 ? "medium" : "low";

  return {
    score: Math.round(score),
    isBroker: brokerScore >= 35 || input.isBusinessAccount === true || publisher != null && publisher !== "personal",
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

/** امتیاز مکان با احتساب فیلتر انتخابی کاربر (اجتماع: منطقه یا محله — هم‌راستا با lineInSelection) */
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
  const a = input.selectedAreaIds ?? [];
  const l = input.selectedLineIds ?? [];
  // فیلتر فعال و آگهی بیرون از انتخاب (منطقه و محله) → امتیاز صفر
  if (a.length || l.length) {
    const inArea = a.length > 0 && a.includes(match.areaId ?? "");
    const inLine = l.length > 0 && match.lineId != null && l.includes(match.lineId);
    if (!inArea && !inLine) {
      return { ...match, score: 0, reason: `${match.reason} — بیرون از محدوده انتخابی شما.` };
    }
  }
  return match;
}

// ===================== ۴) فیلتر «سایر فاکتورهای فایل بهینه» — شاهکار ایجنت =====================

export interface OtherFactor {
  key: "urgency" | "freshness" | "completeness" | "content" | "readiness" | "location";
  label: string;
  /** امتیاز این فاکتور ۰ تا ۱۰۰ */
  score: number;
  /** سهم این فاکتور در ترکیب نهایی (جمع وزن‌ها = ۱۰۰) */
  weight: number;
  evidence: string;
}

export interface OtherFactorsResult {
  /** امتیاز ترکیبی ۰ تا ۱۰۰ */
  score: number;
  factors: OtherFactor[];
  reason: string;
}

/** واژگان فوریت/انگیزه فروش‌دهنده — روان‌شناسی معامله: مالکِ تحت‌فشار، تخفیف می‌دهد */
const URGENCY_STRONG = ["ضرورت مالی", "نیاز مالی", "فوری فروش", "فوریه", "تسویه", "بدهی", "قسط", "چک", "قرض", "فوراً فروش"];
const URGENCY_MEDIUM = ["فوری", "مهاجرت", "بیماری", "تعطیل ملک", "تخفیف", "کاهش قیمت", "زیر قیمت", "ارزان‌تر از", "مهلت"];
const URGENCY_SOFT = ["توافقی", "قابل مذاکره", "قابل معامله", "معاوضه"];

/** واژگان آمادگی معامله — سند پاک، ملک خالی، انتقال سریع */
const READINESS_DEED = ["سند تک‌برگ", "تک برگ", "تک‌برگ", "شش‌دانگ", "شش دانگ", "سند آماده", "آماده انتقال", "قولنامه"];
const READINESS_EMPTY = ["خالی", "خالی قابل تحویل", "قابل تحویل فوری", "تحویل فوری", "خالی است"];

/** واژگان صداقت — مالکی که عیب ملک را می‌گوید، قابل‌اعتماد است و قیمتش واقعی‌تر است */
const HONESTY_WORDS = ["قدیمی", "فرسوده", "نیاز به تعمیر", "نیاز به نوسازی", "خرابی", "نیمه‌کاره", "اسکلت", "کلنگی", "کاری نیازی", "نیاز به تعمیر دارد"];
/** ادبیات تبلیغاتی توخالی — کپی‌پیست مشاورانه بدون اطلاعات واقعی */
const MARKETING_NOISE = ["فرصت سرمایه‌گذاری", "موقعیت عالی", "دردنیافتنی", "بصرفه", "موقعیت استثنایی", "ارزان‌ترین"];

/**
 * شاهکار ایجنت — امتیاز «سایر فاکتورهای فایل بهینه» (۰ تا ۱۰۰)
 * شش فاکتور نکته‌سنج، هر یک با شواهد فارسی شفاف:
 *  ۱) فوریت و انگیزه فروش‌دهنده (۲۵) — مالکِ با انگیزه، ارزش مذاکره دارد
 *  ۲) تازگی انتشار (۱۵) — ساعات نخست، فرصت شکار پیش از رقبا
 *  ۳) تکمیل و شفافیت داده‌ها (۲۰) — فایلِ کامل = ریسک اطلاعاتی کم
 *  ۴) کیفیت و اصالت محتوا (۱۵) — توضیحات مستند + صداقت در عیوب
 *  ۵) آمادگی معامله (۱۵) — سند پاک، ملک خالی، قیمت منعطف
 *  ۶) دقت مکان (۱۰) — نگاشت مطمئن به محله آرم = قیاس بازار قابل‌اعتماد
 */
export function scoreOtherFactors(input: {
  title: string;
  description?: string | null;
  priceTotal?: number | null;
  pricePerMeter?: number | null;
  meterage?: number | null;
  rooms?: number | null;
  floor?: number | null;
  buildYear?: number | null;
  photoCount?: number | null;
  /** زمان واقعی انتشار آگهی — برای فاکتور تازگی */
  publishedAt?: Date | null;
  now?: Date;
  /** نتیجه تطبیق مکان با رجیستری آرم (برای فاکتور دقت مکان) */
  location?: { score: number; reason?: string } | null;
}): OtherFactorsResult {
  const text = `${input.title} ${input.description ?? ""}`.replace(/\u200c/g, " ");
  const has = (w: string) => text.includes(w.replace(/\u200c/g, " "));
  const factors: OtherFactor[] = [];

  // ---------- ۱) فوریت و انگیزه فروش‌دهنده ----------
  {
    let s = 35; // پایه خنثی: فروش‌نده معمولی
    const strong = URGENCY_STRONG.filter(has);
    const medium = URGENCY_MEDIUM.filter(has);
    const soft = URGENCY_SOFT.filter(has);
    s += strong.length * 22 + medium.length * 12 + soft.length * 6;
    s = Math.min(100, s);
    const ev = strong.length || medium.length || soft.length
      ? [...strong.slice(0, 2), ...medium.slice(0, 2), ...soft.slice(0, 1)].map((w) => `«${w}»`).join("، ")
      : "هیچ نشانه فوریت/انگیزه در متن نیست — فروش‌نده آرام و بدون فشار زمانی";
    factors.push({ key: "urgency", label: "فوریت و انگیزه فروش‌دهنده", score: s, weight: 25, evidence: ev });
  }

  // ---------- ۲) تازگی انتشار ----------
  {
    const now = input.now ?? new Date();
    let s: number;
    let ev: string;
    if (!input.publishedAt) {
      s = 0;
      ev = "زمان انتشار واقعی در دسترس نیست.";
    } else {
      const hours = Math.max(0, (now.getTime() - input.publishedAt.getTime()) / 3600_000);
      if (hours <= 2) { s = 100; ev = "تازه‌ترین وضعیت — کمتر از ۲ ساعت از انتشار گذشته (فرصت نخستین تماس)"; }
      else if (hours <= 6) { s = 88; ev = `حدود ${Math.round(hours)} ساعت از انتشار گذشته — هنوز زود است.`; }
      else if (hours <= 12) { s = 75; ev = `حدود ${Math.round(hours)} ساعت از انتشار گذشته.`; }
      else if (hours <= 24) { s = 60; ev = "حدود یک روز از انتشار گذشته — رقبا احتمالاً دیده‌اند."; }
      else if (hours <= 48) { s = 40; ev = `دو روز از انتشار گذشته (${Math.round(hours)} ساعت).`; }
      else if (hours <= 72) { s = 22; ev = "سه روز از انتشار گذشته — فرصت شکار رو به کاهش."; }
      else { s = 10; ev = `بیش از ${Math.floor(hours / 24)} روز از انتشار گذشته — فایل کهنه است.`; }
    }
    factors.push({ key: "freshness", label: "تازگی انتشار", score: s, weight: 15, evidence: ev });
  }

  // ---------- ۳) تکمیل و شفافیت داده‌ها ----------
  {
    // ساختار داده‌ها: قیمت، هرمتر، متراژ، اتاق، طبقه، سال ساخت، تصاویر
    const parts: { ok: boolean; w: number; name: string }[] = [
      { ok: input.priceTotal != null, w: 15, name: "قیمت کل" },
      { ok: input.pricePerMeter != null, w: 10, name: "قیمت هر متر" },
      { ok: input.meterage != null, w: 15, name: "متراژ" },
      { ok: input.rooms != null, w: 10, name: "اتاق" },
      { ok: input.floor != null, w: 10, name: "طبقه" },
      { ok: input.buildYear != null, w: 15, name: "سال ساخت" },
    ];
    const pc = input.photoCount ?? 0;
    const photoScore = pc >= 8 ? 25 : pc >= 3 ? 20 : pc >= 1 ? 10 : 0;
    let s = parts.reduce((acc, p) => acc + (p.ok ? p.w : 0), 0) + photoScore;
    // نکته‌سنجی: قیمت «توافقی» شفاف است اما ارزش‌گذاری را ناممکن می‌کند
    if (input.priceTotal == null && (has("توافقی") || has("تمدید"))) s = Math.min(s, 55);
    s = Math.min(100, s);
    const missing = parts.filter((p) => !p.ok).map((p) => p.name);
    const ev = `${pc >= 3 ? `${pc} تصویر واقعی` : pc >= 1 ? "فقط " + pc + " تصویر" : "بدون تصویر"}${missing.length ? "؛ داده غایب: " + missing.join("، ") : "؛ داده‌ها کامل است"}`;
    factors.push({ key: "completeness", label: "تکمیل و شفافیت داده‌ها", score: s, weight: 20, evidence: ev });
  }

  // ---------- ۴) کیفیت و اصالت محتوا ----------
  {
    const desc = (input.description ?? "").replace(/\u200c/g, " ").trim();
    const len = desc.length;
    let s: number;
    if (len >= 500) s = 85;
    else if (len >= 150) s = 70;
    else if (len >= 40) s = 45;
    else s = 15;
    // نکته‌سنجی: توضیحات دارای عدد (متراژ/قیمت/طبقه واقعی) = مستند، نه شعار
    if (/\d/.test(desc)) s += 6;
    // نکته‌سنجی: صداقت — اعلام عیب، نشانه مالک واقعی و قیمت واقعی
    const honest = HONESTY_WORDS.filter(has);
    s += Math.min(14, honest.length * 7);
    // نکته‌سنجی: ادبیات تبلیغاتی توخالی = کپی‌پیس، اعتبار محتوا را می‌خورد
    const noise = MARKETING_NOISE.filter(has);
    s -= Math.min(15, noise.length * 6);
    s = Math.max(0, Math.min(100, s));
    const evBits: string[] = [];
    evBits.push(len >= 150 ? `توضیحات مستند (${len} نویسه)` : len >= 40 ? "توضیحات کوتاه" : "توضیحات تقریباً خالی");
    if (honest.length) evBits.push(`صداقت در عیوب: ${honest.slice(0, 2).map((w) => `«${w}»`).join("، ")}`);
    if (noise.length) evBits.push(`ادبیات تبلیغاتی: ${noise.slice(0, 2).map((w) => `«${w}»`).join("، ")}`);
    factors.push({ key: "content", label: "کیفیت و اصالت محتوا", score: s, weight: 15, evidence: evBits.join("؛ ") });
  }

  // ---------- ۵) آمادگی معامله ----------
  {
    let s = 30; // پایه: معامله‌پذیری معمولی
    const deed = READINESS_DEED.filter(has);
    const empty = READINESS_EMPTY.filter(has);
    const flexible = URGENCY_SOFT.filter(has);
    s += Math.min(40, deed.length * 22);
    s += Math.min(25, empty.length * 15);
    s += Math.min(15, flexible.length * 8);
    if (has("معاوضه")) s -= 10; // معاوضه: پیچیدگی معامله نقدی
    if (input.priceTotal != null) s += 5; // قیمت قطعی = شفافیت
    s = Math.max(0, Math.min(100, s));
    const evBits: string[] = [];
    if (deed.length) evBits.push(`اسناد: ${deed.slice(0, 2).map((w) => `«${w}»`).join("، ")}`);
    if (empty.length) evBits.push("ملک خالی/قابل تحویل");
    if (flexible.length) evBits.push("قیمت منعطف");
    if (!evBits.length) evBits.push("نشانه خاصی از آمادگی معامله در متن نیست");
    factors.push({ key: "readiness", label: "آمادگی معامله", score: s, weight: 15, evidence: evBits.join("؛ ") });
  }

  // ---------- ۶) دقت مکان ----------
  {
    const loc = input.location ?? null;
    const s = loc ? Math.max(0, Math.min(100, loc.score)) : 0;
    const ev = loc
      ? loc.score >= 70 ? "نگاشت مطمئن به محله آرم (متنی + مختصات) — قیاس بازار قابل‌اعتماد" : "نگاشت مکانی با اطمینان متوسط"
      : "بدون نشانه مکانی قابل‌اتکا";
    factors.push({ key: "location", label: "دقت مکان", score: s, weight: 10, evidence: ev });
  }

  // ---------- ترکیب نهایی ----------
  const wsum = factors.reduce((acc, f) => acc + f.weight, 0) || 100;
  const score = Math.round(factors.reduce((acc, f) => acc + f.score * f.weight, 0) / wsum);
  const top = [...factors].sort((a, b) => b.score * b.weight - a.score * a.weight)[0];
  const reason =
    top && top.score >= 65
      ? `قوی‌ترین فاکتور: «${top.label}» (${top.evidence})`
      : "هیچ فاکتور بهینه‌سازی برجسته‌ای در این فایل دیده نمی‌شود — فایل متعارف است.";
  return { score: Math.max(0, Math.min(100, score)), factors, reason };
}

// ===================== قانون مالک: رد کامل فایل‌های غیرشخصی =====================

/**
 * آیا این آگهی «غیرشخصی» است و باید کاملاً رد شود؟ (قانون ۱ و ۲ مالک)
 * نکته‌سنجی: برچسب رسمی دیوار زیر نقشه قطعی‌ترین منبع است؛
 * برچسب «شخصی» + سیگنال متنی قوی شخصی، بر نوفه متنی ضعیف غلبه می‌کند.
 */
export function shouldAutoReject(personal: PersonalScoreResult, publisherType?: string | null): boolean {
  const pt = publisherType ?? null;
  if (pt === "agent" || pt === "department" || pt === "business") return true;
  if (pt === "personal" && personal.score >= 65) return false; // برچسب رسمی شخصی + متن قوی
  return personal.isBroker;
}

// ===================== امتیاز نهایی و دسته‌بندی =====================

export interface TotalScoreInput {
  personal: number;
  underprice: number;
  other: number;
  location: number;
  settings: Pick<DivarSettings, "weightPersonal" | "weightUnderprice" | "weightOther" | "weightLocation" | "huntThreshold" | "followThreshold">;
}

export type AdBucket = "hunt" | "follow" | "review";

export interface TotalScoreResult {
  total: number;
  bucket: AdBucket;
  breakdown: { personal: number; underprice: number; other: number; location: number };
}

/**
 * امتیاز نهایی ۱ تا ۱۰۰ — فقط فایل‌های شخصی به اینجا می‌رسند (غیرشخصی‌ها کامل رد شده‌اند).
 * پیش‌فرض مالک (نسخه ۳): ۵۰ شخصی‌بودن + ۲۰ زیرقیمت + ۲۰ سایر فاکتورهای بهینه + ۱۰ مکان (قابل تنظیم).
 */
export function computeTotalScore(input: TotalScoreInput): TotalScoreResult {
  const wp = Math.max(0, input.settings.weightPersonal);
  const wu = Math.max(0, input.settings.weightUnderprice);
  const wo = Math.max(0, input.settings.weightOther);
  const wl = Math.max(0, input.settings.weightLocation);
  const sum = wp + wu + wo + wl;
  const wsum = sum > 0 ? sum : 100;
  const total = Math.round(
    (input.personal * wp + input.underprice * wu + input.other * wo + input.location * wl) / wsum
  );
  const hunt = Math.max(1, Math.min(99, input.settings.huntThreshold));
  const follow = Math.max(1, Math.min(hunt - 1, input.settings.followThreshold));
  const bucket: AdBucket = total > hunt ? "hunt" : total >= follow ? "follow" : "review";
  return {
    total: Math.max(1, Math.min(100, total)),
    bucket,
    breakdown: { personal: input.personal, underprice: input.underprice, other: input.other, location: input.location },
  };
}

/** پیش‌بینی هوشمند دلایل احتمالی رد آگهی توسط کاربر (کلید جزییات) — فقط فایل‌های شخصی */
export function predictRejectReasons(input: {
  personal: PersonalScoreResult;
  underprice: UnderpriceResult;
  location: LocationMatchResult;
  /** تحلیل سایر فاکتورهای بهینه (شاهکار ایجنت) */
  other?: OtherFactorsResult | null;
  pricePerMeter: number | null;
}): { key: string; title: string; likely: number; hint: string }[] {
  const out: { key: string; title: string; likely: number; hint: string }[] = [];
  // غیرشخصی‌ها هرگز به فهرست نمی‌رسند؛ این بررسی صرفاً حاشیه‌ای است (فایل مرزی)
  if (input.personal.isBroker || input.personal.score < 35) {
    out.push({ key: "broker", title: "شخصی‌بودن فایل قطعی نیست", likely: 70, hint: "امتیاز شخصی‌بودن پایین است" });
  }
  if (input.personal.score >= 35 && input.personal.score < 60) {
    out.push({ key: "semi-personal", title: "شخصی‌بودن آگهی قطعی نیست", likely: 55, hint: "نشانه‌های متناقص در متن آگهی" });
  }
  if (input.pricePerMeter == null) {
    out.push({ key: "no-price", title: "قیمت آگهی درج نشده / قابل استخراج نیست", likely: 70, hint: "قیمت هر متر نامشخص" });
  } else if (input.underprice.percentBelow != null && input.underprice.percentBelow < 0) {
    out.push({ key: "overpriced", title: "قیمت بالاتر از بازار است", likely: 75, hint: "زیرقیمت نیست" });
  }
  if (input.underprice.percentBelow != null && input.underprice.percentBelow < 5 && input.pricePerMeter != null) {
    out.push({ key: "not-underpriced", title: "قیمت معمولی است — شکار نمی‌ارزد", likely: 45, hint: "تخفیف معنادار ندارد" });
  }
  if (input.location.score < 40) {
    out.push({ key: "location", title: "موقعیت مکانی نامشخص/خارج از محدوده", likely: 60, hint: input.location.reason });
  }
  // شاهکار ایجنت — پیش‌بینی از روی فاکتورهای بهینه
  const other = input.other ?? null;
  if (other) {
    const byKey = new Map(other.factors.map((f) => [f.key, f]));
    const freshness = byKey.get("freshness");
    if (freshness && freshness.score <= 22) {
      out.push({ key: "stale", title: "فایل کهنه است — فرصت شکار گذشته", likely: 60, hint: freshness.evidence });
    }
    const completeness = byKey.get("completeness");
    if (completeness && completeness.score <= 40) {
      out.push({ key: "thin-data", title: "داده‌های فایل ناقص است (ارزیابی سخت)", likely: 55, hint: completeness.evidence });
    }
    const urgency = byKey.get("urgency");
    if (urgency && urgency.score <= 35) {
      out.push({ key: "no-motivation", title: "فروش‌نده انگیزه/فوریت ندارد", likely: 40, hint: "مذاکره تخفیف سخت می‌شود" });
    }
    const content = byKey.get("content");
    if (content && content.score <= 30) {
      out.push({ key: "weak-content", title: "توضیحات آگهی ضعیف/توخالی است", likely: 40, hint: content.evidence });
    }
  }
  out.push({ key: "already-sold", title: "ملک قبلاً فروخته/تماس بی‌پاسخ", likely: 25, hint: "ایجنت از روی الگوی ردهای قبلی شما" });
  out.push({ key: "condition", title: "وضعیت ساختمان/سند مشکل‌دار", likely: 25, hint: "نیازمند بازدید حضوری" });
  out.push({ key: "other", title: "دلیل دیگر (در توضیحات بنویسید)", likely: 10, hint: "خودتان شرح دهید" });
  return out;
}
