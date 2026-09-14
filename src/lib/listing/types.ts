/**
 * انواع و ثابت‌های کاشی «آگهی» — عین ساختار ۵ گامی فرم ثبت آگهی سامانه ARM
 * ------------------------------------------------------
 * منبع کشف: باندل رسمی arm.melketabriz.ir (new-property-page) + تست زنده API
 *
 * پنج گام (عین خود سامانه):
 *   ۱. اطلاعات مالک        — customer {fullName, mobileNumber} → کاربر آرم
 *   ۲. اطلاعات مکانی ملک   — استان/شهر/منطقه/محله + کد پستی ۱۰ رقمی + آدرس
 *   ۳. اطلاعات معامله      — نوع معامله/کاربری/ساختمان + معاوضه + فرم پویای دسته
 *   ۴. تصاویر و اسناد ملک  — حداکثر ۱۵ تصویر / ۲ ویدیو / ۱۰ سند
 *   ۵. توضیحات مشاوران     — قیمت فایل، مطلوبیت، نحوه یافتن، نوع فایل، جدیت، دلیل فروش
 */

import type { ListingRecord } from "@prisma/client";

// ===================== گام ۳: فهرست‌های مرجع (کشف زنده از API آرم) =====================

/** نوع معامله — trade-types/list (زنده) */
export const TRADE_TYPES = [
  { id: "614ed62da50555f0a54c1eca", name: "فروش" },
  { id: "614ed63aa50555f0a54c1ed2", name: "پیش فروش" },
  { id: "614ed649a50555f0a54c1edb", name: "رهن و اجاره" },
  { id: "614ed790a50555f0a54c1ee6", name: "مشارکت در ساخت" },
] as const;

/** نوع کاربری (ساختمان) — building-types/list (زنده) */
export const BUILDING_TYPES = [
  { id: "614edc35a50555f0a54c1f1e", name: "مسکونی" },
  { id: "614edc47a50555f0a54c1f30", name: "مسکونی با تجاری" },
  { id: "614edc58a50555f0a54c1f42", name: "باغ و ویلا" },
  { id: "614edc66a50555f0a54c1f56", name: "تجاری-خدماتی" },
  { id: "614edc8ba50555f0a54c1f7c", name: "صنعتی" },
  { id: "61d6b43e3b9c7375c9f48d8f", name: "مزروعی-کشاورزی" },
  { id: "61d6b52d3b9c7375c9f48da9", name: "دامداری-شیلات" },
] as const;

/** نوع ملک — property-types/list (زنده؛ ۳۲ مورد — پرکاررده‌ها) */
export const PROPERTY_TYPES = [
  { id: "614ee704a50555f0a54c227d", name: "آپارتمان" },
  { id: "614ee750a50555f0a54c228e", name: "خانه،حیاط،ویلایی" },
  { id: "614f1ee6a50555f0a54c2605", name: "خانه،حیاط" },
  { id: "614ee798a50555f0a54c22a5", name: "زمین یا ملک کلنگی" },
  { id: "614f8450a50555f0a54c3bbf", name: "زمین" },
  { id: "614f52d4a50555f0a54c2f62", name: "زمین تجاری" },
  { id: "614f3e3aa50555f0a54c2ae7", name: "دفترکار" },
  { id: "614f3e31a50555f0a54c2acf", name: "مغازه" },
  { id: "614f2ec1a50555f0a54c2719", name: "باغ" },
  { id: "614f1eeea50555f0a54c260e", name: "ساختمان" },
  { id: "614f8442a50555f0a54c3ba7", name: "سوله" },
  { id: "614f52c7a50555f0a54c2f4a", name: "انباری" },
] as const;

/** معاوضه — PROPERTY_CHANGEABLE_WITH (enums-persian زنده)؛ «مایل نیستم» انحصاری است */
export const CHANGEABLE_WITH = [
  { value: "notChangeable", label: "مایل نیستم" },
  { value: "land", label: "زمین / ملک کلنگی" },
  { value: "office", label: "دفتر کار" },
  { value: "store", label: "مغازه" },
  { value: "villa", label: "ویلا" },
  { value: "factory", label: "کارخانه" },
  { value: "apartment", label: "واحد آپارتمان" },
  { value: "car", label: "خودرو" },
  { value: "others", label: "سایر" },
] as const;

/** نحوه فایل یابی — گام ۵ (fileFinding؛ مقادیر ایستای خود سامانه — کشف از باندل رسمی) */
export const FILE_FINDINGS = [
  { value: "officeVisit", label: "مراجعه به دفتر" },
  { value: "officeCall", label: "تماس با دفتر" },
  { value: "divar", label: "فضای مجازی (دیوار، واتس‌آپ و غیره)" },
  { value: "areaSearch", label: "حضور در منطقه" },
] as const;

/** وضعیت فایل — گام ۵ (fileType چندانتخابی؛ مقادیر ایستای خود سامانه) */
export const FILE_TYPES = [
  { value: "private", label: "اختصاصی" },
  { value: "shareReal", label: "اشتراکی با املاک" },
  { value: "shareOwner", label: "اشتراکی با مالک" },
] as const;

/** جدیت مشتری — user-seriousness/list (زنده) */
export const USER_SERIOUSNESS = [
  { id: "61a7536b0927675c45489a59", name: "خیلی زیاد" },
  { id: "61a753650927675c45489a4f", name: "زیاد" },
  { id: "61a7535f0927675c45489a3b", name: "متوسط" },
  { id: "61a39c18f06329efdeacbe47", name: "کم" },
] as const;

/** مطلوبیت فایل — گام ۵ (desirabilityLevel؛ property-desirability-level/list زنده) */
export const DESIRABILITY_LEVELS = [
  { id: "61a7d9c615a8b67e5ef93753", name: "کم" },
  { id: "61a7d9d615a8b67e5ef9375d", name: "متوسط" },
  { id: "61a7d9eb15a8b67e5ef93767", name: "خوب" },
  { id: "61a7da4815a8b67e5ef93771", name: "عالی" },
] as const;

/** قیمت فایل — گام ۵ (priceEvaluation؛ property-price-evaluation/list زنده) */
export const PRICE_EVALUATIONS = [
  { id: "61a7daad15a8b67e5ef93799", name: "بسیار بالاتر از قیمت کارشناسی" },
  { id: "61a7dad215a8b67e5ef937a3", name: "نسبتا بالاتر از قیمت کارشناسی" },
  { id: "61a7dae115a8b67e5ef937ad", name: "قیمت کارشناسی" },
  { id: "61a7dafe15a8b67e5ef937c1", name: "زیر قیمت کارشناسی" },
] as const;

/** دلیل فروش — گام ۵ (sellReason؛ property-sell-reasons/list زنده — ۱۵ مورد) */
export const SELL_REASONS = [
  { id: "6513f45fb58cb42930e421f4", name: "خرید یک آپارتمان با قیمت بیشتر" },
  { id: "6513f468b58cb42930e421ff", name: "خرید یک یا چند آپارتمان کوچکتر" },
  { id: "6513f47ab58cb42930e42215", name: "خرید خانه و حیاط" },
  { id: "6513f472b58cb42930e4220a", name: "خرید زمین مسکونی" },
  { id: "6513f4a2b58cb42930e43121", name: "خرید زمین باغی" },
  { id: "6513f4aab58cb42930e43297", name: "خرید زمین جهت احداث ویلا" },
  { id: "6513f498b58cb42930e42d16", name: "خرید ویلا" },
  { id: "6513f486b58cb42930e42220", name: "خرید مغازه" },
  { id: "6513f48fb58cb42930e42510", name: "خرید واحد خدماتی" },
  { id: "6513f4b3b58cb42930e4340d", name: "خرید ملک صنعتی" },
  { id: "6513f4c3b58cb42930e4344c", name: "صرفا رهن و اجاره" },
  { id: "6513f4cbb58cb42930e43457", name: "مشارکت در ساخت" },
  { id: "6513f4ddb58cb42930e43477", name: "سرمایه گذاری" },
  { id: "6513f4bbb58cb42930e4341f", name: "صرفا فروشنده به هر دلیل" },
  { id: "6513f4d4b58cb42930e43467", name: "سایر و یا عدم اطلاع" },
] as const;

/** برچسب فارسی قیمت فایل (priceEvaluation — id → نام) */
export function priceEvaluationLabel(id: string | null | undefined): string {
  return PRICE_EVALUATIONS.find((p) => p.id === id)?.name ?? id ?? "—";
}

/** برچسب فارسی جدیت مشتری (userSeriousity — id → نام) */
export function seriousnessLabel(id: string | null | undefined): string {
  return USER_SERIOUSNESS.find((s) => s.id === id)?.name ?? id ?? "—";
}

/** برچسب فارسی مطلوبیت فایل */
export function desirabilityLabel(id: string | null | undefined): string {
  return DESIRABILITY_LEVELS.find((d) => d.id === id)?.name ?? id ?? "—";
}

/** برچسب فارسی دلیل فروش */
export function sellReasonLabel(id: string | null | undefined): string {
  return SELL_REASONS.find((s) => s.id === id)?.name ?? id ?? "—";
}

/** برچسب فارسی معاوضه */
export function changeWithLabel(values: string[]): string[] {
  return values.map((v) => CHANGEABLE_WITH.find((c) => c.value === v)?.label ?? v);
}

/** برچسب فارسی وضعیت فایل (fileType) */
export function fileTypeLabels(values: string[]): string[] {
  return values.map((v) => FILE_TYPES.find((t) => t.value === v)?.label ?? v);
}

/** برچسب فارسی نحوه فایل‌یابی */
export function fileFindingLabelOf(value: string | null | undefined): string {
  return FILE_FINDINGS.find((f) => f.value === value)?.label ?? value ?? "—";
}

// ===================== اعتبارسنجی ۵ گامی (عین zod خود سامانه) =====================

export interface ListingValidationError {
  step: number;
  stepTitle: string;
  field: string;
  message: string;
}

const STEP_TITLES = ["اطلاعات مالک", "اطلاعات مکانی ملک", "اطلاعات معامله", "تصاویر و اسناد ملک", "توضیحات مشاوران"] as const;

/** نرمال‌سازی ارقام فارسی/عربی به لاتین */
export function toLatinDigits(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

/**
 * اعتبارسنجی کامل ۵ گام فایل آگهی — همان قواعد فرم خود سامانه آرم:
 * گام ۱: نام (≥۳ نویسه) + موبایل (۰۹… ۱۱ رقم)
 * گام ۲: منطقه/محله آرم + آدرس (≥۱) + کد پستی (خالی یا ۱۰ رقم)
 * گام ۳: نوع معامله/کاربری/ملک + معاوضه (حداقل ۱؛ «مایل نیستم» انحصاری) + مساحت
 * گام ۴: بدون الزام (آگهی بدون عکس/سند قابل ثبت است — عین فرم آرم)
 * گام ۵: قیمت فایل + نحوه یافتن + نوع فایل + جدیت
 */
export function validateListing(input: {
  customerName?: string | null;
  customerMobile?: string | null;
  areaId?: string | null;
  lineId?: string | null;
  address?: string | null;
  postalCode?: string | null;
  tradeTypeId?: string | null;
  buildingTypeId?: string | null;
  propertyTypeId?: string | null;
  changeWith?: string[];
  inputs?: Record<string, string>;
  priceEvaluation?: string | null;
  fileFinding?: string | null;
  fileType?: string[];
  userSeriousness?: string | null;
}): { ok: boolean; errors: ListingValidationError[] } {
  const errors: ListingValidationError[] = [];
  const mobile = toLatinDigits(String(input.customerMobile ?? "")).replace(/\D/g, "");

  if ((input.customerName ?? "").trim().length < 3) {
    errors.push({ step: 1, stepTitle: STEP_TITLES[0], field: "customerName", message: "نام و نام‌خانوادگی مالک را کامل وارد کنید." });
  }
  if (!/^09\d{9}$/.test(mobile)) {
    errors.push({ step: 1, stepTitle: STEP_TITLES[0], field: "customerMobile", message: "شماره موبایل مالک باید ۱۱ رقم و با ۰۹ شروع شود." });
  }
  if (!input.areaId) {
    errors.push({ step: 2, stepTitle: STEP_TITLES[1], field: "areaId", message: "منطقه ملک را از منطقه‌بندی آرم انتخاب کنید." });
  }
  if (!input.lineId) {
    errors.push({ step: 2, stepTitle: STEP_TITLES[1], field: "lineId", message: "محله ملک را از منطقه‌بندی آرم انتخاب کنید." });
  }
  if (!input.address || input.address.trim().length < 1) {
    errors.push({ step: 2, stepTitle: STEP_TITLES[1], field: "address", message: "آدرس ملک را وارد کنید." });
  }
  const postal = toLatinDigits(String(input.postalCode ?? "")).replace(/\D/g, "");
  if (postal && postal.length !== 10) {
    errors.push({ step: 2, stepTitle: STEP_TITLES[1], field: "postalCode", message: "کد پستی باید ۱۰ رقم باشد." });
  }
  if (!input.tradeTypeId) {
    errors.push({ step: 3, stepTitle: STEP_TITLES[2], field: "tradeTypeId", message: "نوع معامله را انتخاب کنید." });
  }
  if (!input.buildingTypeId) {
    errors.push({ step: 3, stepTitle: STEP_TITLES[2], field: "buildingTypeId", message: "نوع کاربری را انتخاب کنید." });
  }
  if (!input.propertyTypeId) {
    errors.push({ step: 3, stepTitle: STEP_TITLES[2], field: "propertyTypeId", message: "نوع ملک را انتخاب کنید." });
  }
  const changeWith = input.changeWith ?? [];
  if (changeWith.length === 0) {
    errors.push({ step: 3, stepTitle: STEP_TITLES[2], field: "changeWith", message: "معاوضه: حداقل یک مورد باید انتخاب شود." });
  } else if (changeWith.includes("notChangeable") && changeWith.length > 1) {
    errors.push({ step: 3, stepTitle: STEP_TITLES[2], field: "changeWith", message: "«مایل نیستم» نمی‌تواند با سایر گزینه‌ها همزمان انتخاب شود." });
  }
  const meterage = toLatinDigits(String(input.inputs?.["مساحت"] ?? "")).replace(/\D/g, "");
  if (!meterage) {
    errors.push({ step: 3, stepTitle: STEP_TITLES[2], field: "inputs.مساحت", message: "متراژ ملک را وارد کنید." });
  }
  if (!input.priceEvaluation) {
    errors.push({ step: 5, stepTitle: STEP_TITLES[4], field: "priceEvaluation", message: "قیمت فایل (نسبت با قیمت کارشناسی) را انتخاب کنید." });
  }
  if (!input.fileFinding) {
    errors.push({ step: 5, stepTitle: STEP_TITLES[4], field: "fileFinding", message: "نحوه پیدا شدن فایل را انتخاب کنید." });
  }
  if ((input.fileType ?? []).length === 0) {
    errors.push({ step: 5, stepTitle: STEP_TITLES[4], field: "fileType", message: "حداقل یک نوع فایل انتخاب کنید." });
  }
  if (!input.userSeriousness) {
    errors.push({ step: 5, stepTitle: STEP_TITLES[4], field: "userSeriousness", message: "جدیت مشتری را انتخاب کنید." });
  }
  return { ok: errors.length === 0, errors };
}

// ===================== ورودی ثبت/ویرایش =====================

export interface ListingUpsertInput {
  source?: "manual" | "divar";
  divarToken?: string | null;
  customerName?: string | null;
  customerMobile?: string | null;
  armCustomerId?: string | null;
  areaId?: string | null;
  areaName?: string | null;
  lineId?: string | null;
  lineName?: string | null;
  postalCode?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  tradeTypeId?: string | null;
  tradeTypeName?: string | null;
  propertyTypeId?: string | null;
  propertyTypeName?: string | null;
  buildingTypeId?: string | null;
  buildingTypeName?: string | null;
  changeWith?: string[];
  inputs?: Record<string, string>;
  images?: string[];
  videos?: string[];
  documents?: string[];
  priceEvaluation?: string | null;
  desirabilityLevel?: string | null;
  fileFinding?: string | null;
  fileType?: string[];
  userSeriousness?: string | null;
  sellReason?: string | null;
  description?: string | null;
  isLuxury?: boolean;
  isVacation?: boolean;
  isUrgent?: boolean;
  notifyBySms?: boolean;
  status?: string;
}

// ===================== ردیف فایل آگهی برای UI =====================

export interface ListingRow {
  id: string;
  source: "manual" | "divar";
  divarToken: string | null;
  customerName: string | null;
  customerMobile: string | null;
  armCustomerId: string | null;
  areaName: string | null;
  lineName: string | null;
  address: string | null;
  postalCode: string | null;
  tradeTypeName: string | null;
  propertyTypeName: string | null;
  buildingTypeName: string | null;
  changeWith: string[];
  inputs: Record<string, string>;
  images: string[];
  videos: string[];
  documents: string[];
  priceEvaluation: string | null;
  desirabilityLevel: string | null;
  fileFinding: string | null;
  fileType: string[];
  userSeriousness: string | null;
  sellReason: string | null;
  description: string | null;
  isLuxury: boolean;
  isVacation: boolean;
  isUrgent: boolean;
  notifyBySms: boolean;
  status: string;
  crmTransferredAt: string | null;
  armPropertyId: string | null;
  instagramPublishedAt: string | null;
  instagramMediaId: string | null;
  instagramPost: { kind: string; caption: string; tone: string; media: string[] } | null;
  completeness: { step: number; done: boolean; label: string }[];
  createdAt: string;
  updatedAt: string;
}

/** محاسبه کامل‌بودن هر گام (برای نمایش پیشرفت ۵ گامی) */
export function computeCompleteness(rec: {
  customerName: string | null;
  customerMobile: string | null;
  areaId: string | null;
  lineId: string | null;
  address: string | null;
  tradeTypeId: string | null;
  buildingTypeId: string | null;
  propertyTypeId: string | null;
  changeWithJson: string | null;
  inputsJson: string | null;
  imagesJson: string | null;
  priceEvaluation: string | null;
  fileFinding: string | null;
  fileTypeJson: string | null;
  userSeriousness: string | null;
}): { step: number; done: boolean; label: string }[] {
  const mobile = toLatinDigits(String(rec.customerMobile ?? "")).replace(/\D/g, "");
  const parse = <T,>(json: string | null, fallback: T): T => {
    try {
      return json ? (JSON.parse(json) as T) : fallback;
    } catch {
      return fallback;
    }
  };
  const inputs = parse<Record<string, string>>(rec.inputsJson, {});
  const changeWith = parse<string[]>(rec.changeWithJson, []);
  const fileType = parse<string[]>(rec.fileTypeJson, []);
  const images = parse<string[]>(rec.imagesJson, []);
  return [
    { step: 1, done: (rec.customerName ?? "").trim().length >= 3 && /^09\d{9}$/.test(mobile), label: "اطلاعات مالک" },
    { step: 2, done: Boolean(rec.areaId && rec.lineId && (rec.address ?? "").trim().length > 0), label: "اطلاعات مکانی ملک" },
    {
      step: 3,
      done: Boolean(rec.tradeTypeId && rec.buildingTypeId && rec.propertyTypeId && changeWith.length > 0 && inputs["مساحت"]),
      label: "اطلاعات معامله",
    },
    { step: 4, done: images.length > 0, label: "تصاویر و اسناد ملک" },
    {
      step: 5,
      done: Boolean(rec.priceEvaluation && rec.fileFinding && fileType.length > 0 && rec.userSeriousness),
      label: "توضیحات مشاوران",
    },
  ];
}

/** تبدیل رکورد به ردیف UI */
export function toListingRow(rec: ListingRecord): ListingRow {
  const parse = <T,>(json: string | null, fallback: T): T => {
    try {
      return json ? (JSON.parse(json) as T) : fallback;
    } catch {
      return fallback;
    }
  };
  let instagramPost: ListingRow["instagramPost"] = null;
  try {
    instagramPost = rec.instagramPostJson ? (JSON.parse(rec.instagramPostJson) as ListingRow["instagramPost"]) : null;
  } catch {
    instagramPost = null;
  }
  return {
    id: rec.id,
    source: (rec.source as "manual" | "divar") ?? "manual",
    divarToken: rec.divarToken,
    customerName: rec.customerName,
    customerMobile: rec.customerMobile,
    armCustomerId: rec.armCustomerId,
    areaName: rec.areaName,
    lineName: rec.lineName,
    address: rec.address,
    postalCode: rec.postalCode,
    tradeTypeName: rec.tradeTypeName,
    propertyTypeName: rec.propertyTypeName,
    buildingTypeName: rec.buildingTypeName,
    changeWith: parse<string[]>(rec.changeWithJson, []),
    inputs: parse<Record<string, string>>(rec.inputsJson, {}),
    images: parse<string[]>(rec.imagesJson, []),
    videos: parse<string[]>(rec.videosJson, []),
    documents: parse<string[]>(rec.documentsJson, []),
    priceEvaluation: rec.priceEvaluation,
    desirabilityLevel: rec.desirabilityLevel,
    fileFinding: rec.fileFinding,
    fileType: parse<string[]>(rec.fileTypeJson, []),
    userSeriousness: rec.userSeriousness,
    sellReason: rec.sellReason,
    description: rec.description,
    isLuxury: rec.isLuxury,
    isVacation: rec.isVacation,
    isUrgent: rec.isUrgent,
    notifyBySms: rec.notifyBySms,
    status: rec.status,
    crmTransferredAt: rec.crmTransferredAt?.toISOString() ?? null,
    armPropertyId: rec.armPropertyId,
    instagramPublishedAt: rec.instagramPublishedAt?.toISOString() ?? null,
    instagramMediaId: rec.instagramMediaId,
    instagramPost,
    completeness: computeCompleteness(rec),
    createdAt: rec.createdAt.toISOString(),
    updatedAt: rec.updatedAt.toISOString(),
  };
}
