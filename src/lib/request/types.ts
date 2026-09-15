/**
 * انواع و ثابت‌های کاشی «درخواست ملک» — عین ساختار ۴ گامی فرم ثبت درخواست سامانه ARM
 * ------------------------------------------------------
 * منبع کشف: باندل رسمی arm.melketabriz.ir (new-request-page + request-validator +
 * use-dynamic-action + forms-tab) + تست زنده API (arus-api.melketabriz.ir/api/apm)
 *
 * چهار گام (عین خود سامانه):
 *   ۱. اطلاعات مشتری           — customer {name, _id} → جستجو/ایجاد با موبایل (بدون صفر)
 *   ۲. اطلاعات مکانی درخواست    — کشور/استان/شهر (پیش‌فرض) + منطقه و محله (چندانتخابی)
 *   ۳. جزییات درخواست           — نوع معامله (برچسب nameRequest!) / کاربری / ملک + فرم پویای دسته
 *   ۴. اطلاعات تکمیلی درخواست   — نحوه پرداخت (پول مشتری) + جدیت مشتری + توضیحات مشاور
 *
 * دکمه‌ها عین خود سامانه: قبلی / بعدی (تا customer._id معتبر غیرفعال) / پیش‌نویس (از گام ۲+)
 * ثبت: POST requests + addToURL ["create"] با سریال‌سازی عین خود سامانه:
 *   removeEmpty → استخراج شناسه ({userId}/{_id}/{value} → خام) + area/line از areaAndLine
 */

// ===================== فهرست‌های مرجع (کشف زنده از API آرم — ۱۴۰۵/۰۶/۲۴) =====================

/** نوع معامله — trade-types/list (زنده؛ برچسب درخواستی nameRequest عین خود سامانه) */
export interface TradeTypeRef {
  id: string;
  name: string;
  nameRequest: string;
  isRental: boolean;
}

export const TRADE_TYPES: readonly TradeTypeRef[] = [
  { id: "614ed62da50555f0a54c1eca", name: "فروش", nameRequest: "خرید", isRental: false },
  { id: "614ed63aa50555f0a54c1ed3", name: "پیش فروش", nameRequest: "پیش خرید", isRental: false },
  { id: "614ed649a50555f0a54c1edc", name: "رهن و اجاره", nameRequest: "رهن و اجاره", isRental: true },
  { id: "614ed790a50555f0a54c1ee5", name: "مشارکت در ساخت", nameRequest: "مشارکت در ساخت", isRental: false },
];

/** نوع کاربری — building-types/list (زنده؛ tradeTypes مجاز هر کاربری عین خود سامانه) */
export interface BuildingTypeRef {
  id: string;
  name: string;
  tradeTypeIds: string[];
}

export const BUILDING_TYPES: readonly BuildingTypeRef[] = [
  { id: "614edc35a50555f0a54c1f12", name: "مسکونی", tradeTypeIds: ["614ed62da50555f0a54c1eca", "614ed63aa50555f0a54c1ed3", "614ed649a50555f0a54c1edc", "614ed790a50555f0a54c1ee5"] },
  { id: "614edc47a50555f0a54c1f1b", name: "مسکونی با تجاری", tradeTypeIds: ["614ed62da50555f0a54c1eca", "614ed63aa50555f0a54c1ed3", "614ed649a50555f0a54c1edc", "614ed790a50555f0a54c1ee5"] },
  { id: "614edc58a50555f0a54c1f24", name: "باغ و ویلا", tradeTypeIds: ["614ed62da50555f0a54c1eca", "614ed63aa50555f0a54c1ed3"] },
  { id: "614edc66a50555f0a54c1f2d", name: "تجاری-خدماتی", tradeTypeIds: ["614ed62da50555f0a54c1eca", "614ed63aa50555f0a54c1ed3", "614ed649a50555f0a54c1edc", "614ed790a50555f0a54c1ee5"] },
  { id: "614edc8ba50555f0a54c1f36", name: "صنعتی", tradeTypeIds: ["614ed62da50555f0a54c1eca", "614ed63aa50555f0a54c1ed3", "614ed649a50555f0a54c1edc"] },
  { id: "61d6b43e3b9c7375c9f48d2a", name: "مزروعی-کشاورزی", tradeTypeIds: ["614ed62da50555f0a54c1eca", "614ed63aa50555f0a54c1ed3", "614ed649a50555f0a54c1edc"] },
  { id: "61d6b52d3b9c7375c9f48d5a", name: "دامداری-شیلات", tradeTypeIds: ["614ed62da50555f0a54c1eca", "614ed63aa50555f0a54c1ed3", "614ed649a50555f0a54c1edc"] },
];

/** نوع ملک — property-types/list?buildingType (زنده؛ بر اساس نوع کاربری) */
export const PROPERTY_TYPES: Record<string, { id: string; name: string }[]> = {
  // مسکونی
  "614edc35a50555f0a54c1f12": [
    { id: "614ee704a50555f0a54c227d", name: "آپارتمان" },
    { id: "614ee750a50555f0a54c228e", name: "خانه،حیاط،ویلایی" },
    { id: "614ee798a50555f0a54c22a5", name: "زمین یا ملک کلنگی" },
    { id: "614ee784a50555f0a54c229c", name: "ساختمان" },
  ],
  // مسکونی با تجاری
  "614edc47a50555f0a54c1f1b": [
    { id: "614f1ee6a50555f0a54c2605", name: "خانه،حیاط" },
    { id: "614f1f11a50555f0a54c2617", name: "زمین" },
    { id: "614f1eeea50555f0a54c260e", name: "ساختمان" },
  ],
  // باغ و ویلا
  "614edc58a50555f0a54c1f24": [
    { id: "614f2ec1a50555f0a54c2719", name: "باغ" },
    { id: "614f2ed8a50555f0a54c2722", name: "زمین" },
    { id: "614f2eb6a50555f0a54c2710", name: "ویلا" },
  ],
  // تجاری-خدماتی
  "614edc66a50555f0a54c1f2d": [
    { id: "614f3e31a50555f0a54c2acf", name: "مغازه" },
    { id: "614f3e3aa50555f0a54c2ae7", name: "دفترکار" },
    { id: "614f52d4a50555f0a54c2f62", name: "زمین تجاری" },
    { id: "614f52e3a50555f0a54c2f7a", name: "زمین خدماتی" },
    { id: "614f52f4a50555f0a54c2f92", name: "زمین خدماتی تجاری" },
    { id: "614f5239a50555f0a54c2eea", name: "ساختمان" },
    { id: "614f525fa50555f0a54c2f02", name: "پاساژ" },
    { id: "614f526ca50555f0a54c2f1a", name: "هتل" },
    { id: "614f52c7a50555f0a54c2f4a", name: "انباری" },
    { id: "614f527ea50555f0a54c2f32", name: "جایگاه سوخت" },
    { id: "61d2b74d17fa375953c6631b", name: "زیرزمین" },
  ],
  // صنعتی
  "614edc8ba50555f0a54c1f36": [
    { id: "614f8450a50555f0a54c3bbf", name: "زمین" },
    { id: "614f620ba50555f0a54c30a5", name: "کارخانه" },
    { id: "614f6220a50555f0a54c30d5", name: "کارگاه" },
    { id: "614f6214a50555f0a54c30bd", name: "سوله" },
    { id: "614f622aa50555f0a54c30ed", name: "سردخانه" },
  ],
  // مزروعی-کشاورزی
  "61d6b43e3b9c7375c9f48d2a": [
    { id: "614f8462a50555f0a54c3bd7", name: "زمین" },
    { id: "614f6247a50555f0a54c3105", name: "گلخانه" },
  ],
  // دامداری-شیلات
  "61d6b52d3b9c7375c9f48d5a": [
    { id: "614f8442a50555f0a54c3ba7", name: "زمین" },
    { id: "61d6b58f3b9c7375c9f48d65", name: "گاوداری" },
    { id: "61d6b5a03b9c7375c9f48d6b", name: "مرغداری" },
    { id: "61d6b5b63b9c7375c9f48d71", name: "پرورش ماهی" },
  ],
};

/** نحوه پرداخت (پول مشتری) — user-payment-methods/list (زنده) */
export interface PaymentMethodRef {
  id: string;
  name: string;
}

export const PAYMENT_METHODS: readonly PaymentMethodRef[] = [
  { id: "61a39bf0f06329efdeacbbef", name: "نقدی" },
  { id: "61b4adae67a91fbc73ec891a", name: "ملک و نقد" },
  { id: "61b4adc567a91fbc73ec8924", name: "با فروش ملک" },
  { id: "61b4b26567a91fbc73ec8cdd", name: "تهاتر با کالا" },
];

/** جدیت مشتری — user-seriousness/list (زنده) */
export interface SeriousnessRef {
  id: string;
  name: string;
}

export const USER_SERIOUSNESS: readonly SeriousnessRef[] = [
  { id: "61a7536b0927675c45489a59", name: "خیلی زیاد" },
  { id: "61a753650927675c45489a4f", name: "زیاد" },
  { id: "61a7535f0927675c45489a3b", name: "متوسط" },
  { id: "61a39c18f06329efdeacbe47", name: "کم" },
];

// ===================== برچسب‌های فارسی =====================

/** برچسب درخواستی نوع معامله (nameRequest عین خود سامانه: فروش→خرید) */
export function tradeTypeRequestLabel(id: string | null | undefined): string {
  const t = TRADE_TYPES.find((x) => x.id === id);
  return t?.nameRequest ?? t?.name ?? id ?? "—";
}

export function buildingTypeLabel(id: string | null | undefined): string {
  return BUILDING_TYPES.find((b) => b.id === id)?.name ?? id ?? "—";
}

export function propertyTypeLabel(id: string | null | undefined, buildingTypeId?: string | null): string {
  const list = buildingTypeId ? PROPERTY_TYPES[buildingTypeId] ?? [] : [];
  const found = list.find((p) => p.id === id) ?? Object.values(PROPERTY_TYPES).flat().find((p) => p.id === id);
  return found?.name ?? id ?? "—";
}

export function paymentMethodLabel(id: string | null | undefined): string {
  return PAYMENT_METHODS.find((p) => p.id === id)?.name ?? id ?? "—";
}

export function seriousnessLabel(id: string | null | undefined): string {
  return USER_SERIOUSNESS.find((s) => s.id === id)?.name ?? id ?? "—";
}

/** آیا این نوع معامله برای این نوع کاربری مجاز است؟ (عین قید tradeTypes خود سامانه) */
export function buildingAllowsTrade(buildingTypeId: string | null | undefined, tradeTypeId: string | null | undefined): boolean {
  if (!buildingTypeId || !tradeTypeId) return false;
  const b = BUILDING_TYPES.find((x) => x.id === buildingTypeId);
  return Boolean(b?.tradeTypeIds.includes(tradeTypeId as never));
}

// ===================== ورودی فرم ۴ گامی =====================

export interface RequestUpsertInput {
  id?: string;
  source?: "manual" | "auto";

  // گام ۱ — اطلاعات مشتری (عین owner-info-step: نام + موبایل؛ شناسه آرم پس از جستجو/ایجاد)
  customerName?: string;
  customerMobile?: string;
  armCustomerId?: string | null;

  // گام ۲ — اطلاعات مکانی درخواست
  countryId?: string;
  stateId?: string;
  cityId?: string;
  areaIds?: string[];
  areaNames?: string[];
  lineIds?: string[];
  lineNames?: string[];

  // گام ۳ — جزییات درخواست
  tradeTypeId?: string;
  buildingTypeId?: string;
  propertyTypeId?: string;
  /** فرم پویای دسته‌بندی — {createName: value} (مقادیر خام سریال‌شده) */
  inputs?: Record<string, unknown>;
  customerDescription?: string;

  // گام ۴ — اطلاعات تکمیلی درخواست
  userPaymentMethod?: string;
  userSeriousity?: string;
  realtorDescription?: string;
}

// ===================== اعتبارسنجی ۴ گامی (عین zod خود سامانه) =====================

export interface RequestValidationError {
  step: 1 | 2 | 3 | 4;
  field: string;
  message: string;
}

export interface RequestValidationResult {
  ok: boolean;
  errors: RequestValidationError[];
}

/** موبایل معتبر ایران (۱۱ رقم با ۰۹ یا ۱۰ رقم بدون صفر) */
export function isValidIranMobile(mobile: string): boolean {
  const digits = mobile.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/\D/g, "");
  return /^09\d{9}$/.test(digits) || /^9\d{9}$/.test(digits);
}

/**
 * اعتبارسنجی کامل ۴ گام — همان قیود zod خود سامانه:
 *   گام ۱: customer {name, _id} — «بعدی» تا تعیین مشتری فعال نیست
 *   گام ۲: city اجباری + منطقه/محله (areaAndLine)
 *   گام ۳: tradeType + buildingType + propertyType اجباری (z.object بدون optional)
 *   گام ۴: userPaymentMethod + userSeriousity اجباری (آبجکت {label,value} در خود سامانه)
 */
export function validateRequest(input: RequestUpsertInput): RequestValidationResult {
  const errors: RequestValidationError[] = [];

  // ---------- گام ۱: اطلاعات مشتری ----------
  if (!input.customerName || input.customerName.trim().length < 3) {
    errors.push({ step: 1, field: "customerName", message: "نام و نام خانوادگی درخواست‌دهنده (گام ۱) الزامی است." });
  }
  if (!input.customerMobile || !isValidIranMobile(input.customerMobile)) {
    errors.push({ step: 1, field: "customerMobile", message: "شماره موبایل مشتری (گام ۱) معتبر نیست — نمونه: ۰۹۱۴۱۲۳۴۵۶۷." });
  }

  // ---------- گام ۲: اطلاعات مکانی درخواست ----------
  if (!input.cityId) {
    errors.push({ step: 2, field: "cityId", message: "شهر (گام ۲) الزامی است." });
  }
  if (!input.areaIds || input.areaIds.length === 0) {
    errors.push({ step: 2, field: "areaIds", message: "حداقل یک منطقه (گام ۲ — منطقه و محله) انتخاب کنید." });
  }

  // ---------- گام ۳: جزییات درخواست ----------
  if (!input.tradeTypeId) {
    errors.push({ step: 3, field: "tradeTypeId", message: "نوع معامله (گام ۳) الزامی است." });
  }
  if (!input.buildingTypeId) {
    errors.push({ step: 3, field: "buildingTypeId", message: "نوع کاربری (گام ۳) الزامی است." });
  }
  if (!input.propertyTypeId) {
    errors.push({ step: 3, field: "propertyTypeId", message: "نوع ملک (گام ۳) الزامی است." });
  }
  if (input.tradeTypeId && input.buildingTypeId && !buildingAllowsTrade(input.buildingTypeId, input.tradeTypeId)) {
    errors.push({ step: 3, field: "tradeTypeId", message: "این نوع معامله برای این نوع کاربری مجاز نیست (عین خود سامانه)." });
  }
  if (input.buildingTypeId && input.propertyTypeId) {
    const allowed = PROPERTY_TYPES[input.buildingTypeId] ?? [];
    if (!allowed.some((p) => p.id === input.propertyTypeId)) {
      errors.push({ step: 3, field: "propertyTypeId", message: "این نوع ملک برای این نوع کاربری مجاز نیست (عین خود سامانه)." });
    }
  }

  // ---------- گام ۴: اطلاعات تکمیلی درخواست ----------
  if (!input.userPaymentMethod) {
    errors.push({ step: 4, field: "userPaymentMethod", message: "نحوه پرداخت / پول مشتری (گام ۴) الزامی است." });
  }
  if (!input.userSeriousity) {
    errors.push({ step: 4, field: "userSeriousity", message: "جدیت مشتری (گام ۴) الزامی است." });
  }

  return { ok: errors.length === 0, errors };
}

// ===================== کامل‌بودن ۴ گامی (برای نوار پیشرفت کارت) =====================

export interface RequestCompleteness {
  steps: { step: 1 | 2 | 3 | 4; label: string; complete: boolean }[];
  completeCount: number;
  total: 4;
}

export function computeCompleteness(input: {
  customerName?: string | null;
  customerMobile?: string | null;
  cityId?: string | null;
  areaIdsJson?: string | null;
  tradeTypeId?: string | null;
  buildingTypeId?: string | null;
  propertyTypeId?: string | null;
  userPaymentMethod?: string | null;
  userSeriousity?: string | null;
}): RequestCompleteness {
  const areaIds = parseJson<string[]>(input.areaIdsJson, []);
  const steps = [
    { step: 1 as const, label: "اطلاعات مشتری", complete: Boolean(input.customerName && input.customerMobile) },
    { step: 2 as const, label: "اطلاعات مکانی درخواست", complete: Boolean(input.cityId && areaIds.length > 0) },
    { step: 3 as const, label: "جزییات درخواست", complete: Boolean(input.tradeTypeId && input.buildingTypeId && input.propertyTypeId) },
    { step: 4 as const, label: "اطلاعات تکمیلی درخواست", complete: Boolean(input.userPaymentMethod && input.userSeriousity) },
  ];
  return { steps, completeCount: steps.filter((s) => s.complete).length, total: 4 };
}

// ===================== ساخت بدنه requests/create (عین سریال‌سازی خود سامانه) =====================

/**
 * سریال‌سازی عین object-util خود سامانه:
 *   - removeEmpty: مقادیر تهی/خالی/undefined حذف می‌شوند
 *   - استخراج شناسه: هر {userId} → userId، {_id} → _id، {value} → value
 * سپس area/line از areaAndLine به سطح بدنه می‌آیند (عین new-request-page).
 */
export function buildCreatePayload(input: {
  customerId: string;
  countryId: string;
  stateId: string;
  cityId: string;
  areaIds: string[];
  lineIds: string[];
  tradeTypeId: string;
  buildingTypeId: string;
  propertyTypeId: string;
  inputs: Record<string, unknown>;
  customerDescription?: string | null;
  userPaymentMethod: string;
  userSeriousity: string;
  realtorDescription?: string | null;
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    customer: input.customerId,
    country: input.countryId,
    state: input.stateId,
    city: input.cityId,
    area: input.areaIds,
    line: input.lineIds,
    tradeType: input.tradeTypeId,
    buildingType: input.buildingTypeId,
    propertyType: input.propertyTypeId,
    userPaymentMethod: input.userPaymentMethod,
    userSeriousity: input.userSeriousity,
  };
  if (Object.keys(input.inputs).length > 0) payload.inputs = input.inputs;
  if (input.customerDescription && input.customerDescription.trim()) payload.customerDescription = input.customerDescription.trim();
  if (input.realtorDescription && input.realtorDescription.trim()) payload.realtorDescription = input.realtorDescription.trim();
  return payload;
}

// ===================== عنوان درخواست (عین ستون «نوع و متراژ درخواست» خود سامانه) =====================

/** ساخت عنوان درخواست — مثل «خرید آپارتمان ۱۰۰ تا ۱۵۰ متری در منطقه ولیعصر» */
export function buildRequestTitle(rec: {
  tradeTypeId?: string | null;
  propertyTypeId?: string | null;
  buildingTypeId?: string | null;
  inputsJson?: string | null;
  areaNamesJson?: string | null;
}): string {
  const parts: string[] = [tradeTypeRequestLabel(rec.tradeTypeId)];
  parts.push(propertyTypeLabel(rec.propertyTypeId, rec.buildingTypeId));
  const inputs = parseJson<Record<string, unknown>>(rec.inputsJson, {});
  const spaceFrom = num(inputs.space_from ?? inputs.space);
  const spaceTo = num(inputs.space_to);
  if (spaceFrom && spaceTo && spaceFrom !== spaceTo) {
    parts.push(`${fa(String(spaceFrom))} تا ${fa(String(spaceTo))} متری`);
  } else if (spaceFrom || spaceTo) {
    parts.push(`${fa(String(spaceFrom || spaceTo))} متری`);
  }
  const areaNames = parseJson<string[]>(rec.areaNamesJson, []);
  if (areaNames.length > 0) {
    parts.push(`در منطقه ${areaNames.slice(0, 2).join(" و ")}`);
  }
  return parts.filter(Boolean).join(" ");
}

// ===================== ردیف نمایشی =====================

export interface RequestRow {
  id: string;
  source: string;
  code: string;
  title: string;
  customerName: string;
  customerMobile: string;
  armCustomerId: string | null;
  countryId: string | null;
  stateId: string | null;
  cityId: string | null;
  areaIds: string[];
  areaNames: string[];
  lineIds: string[];
  lineNames: string[];
  tradeTypeId: string | null;
  buildingTypeId: string | null;
  propertyTypeId: string | null;
  tradeTypeName: string;
  buildingTypeName: string;
  propertyTypeName: string;
  isRental: boolean;
  priceLabel: string;
  spaceLabel: string;
  userPaymentMethodId: string | null;
  userSeriousityId: string | null;
  paymentMethodName: string;
  seriousnessName: string;
  customerDescription: string | null;
  realtorDescription: string | null;
  inputs: Record<string, unknown>;
  status: string;
  completeness: RequestCompleteness;
  armRequestId: string | null;
  armRegisteredAt: string | null;
  armCustomerFound: boolean;
  eventCount: number;
  createdAt: string;
  updatedAt: string;
}

export function toRequestRow(rec: RequestRecordRow, eventCount = 0): RequestRow {
  const inputs = parseJson<Record<string, unknown>>(rec.inputsJson, {});
  const rental = TRADE_TYPES.find((t) => t.id === rec.tradeTypeId)?.isRental ?? false;
  const priceLabel = rental
    ? rangeLabel(inputs.deposite_price_from, inputs.deposite_price_to, inputs.rent_price_from, inputs.rent_price_to)
    : rangeLabel(inputs.totalPrice_from, inputs.totalPrice_to);
  const spaceLabel = rangeLabel(inputs.space_from, inputs.space_to);
  return {
    id: rec.id,
    source: rec.source,
    code: rec.armRequestId ? `آرم-${shortCode(rec.armRequestId)}` : `محلی-${shortCode(rec.id)}`,
    title: buildRequestTitle(rec),
    customerName: rec.customerName ?? "—",
    customerMobile: rec.customerMobile ?? "—",
    armCustomerId: rec.armCustomerId,
    countryId: rec.countryId,
    stateId: rec.stateId,
    cityId: rec.cityId,
    areaIds: parseJson<string[]>(rec.areaIdsJson, []),
    areaNames: parseJson<string[]>(rec.areaNamesJson, []),
    lineIds: parseJson<string[]>(rec.lineIdsJson, []),
    lineNames: parseJson<string[]>(rec.lineNamesJson, []),
    tradeTypeId: rec.tradeTypeId,
    buildingTypeId: rec.buildingTypeId,
    propertyTypeId: rec.propertyTypeId,
    tradeTypeName: tradeTypeRequestLabel(rec.tradeTypeId),
    buildingTypeName: buildingTypeLabel(rec.buildingTypeId),
    propertyTypeName: propertyTypeLabel(rec.propertyTypeId, rec.buildingTypeId),
    isRental: rental,
    priceLabel,
    spaceLabel,
    userPaymentMethodId: rec.userPaymentMethod,
    userSeriousityId: rec.userSeriousity,
    paymentMethodName: paymentMethodLabel(rec.userPaymentMethod),
    seriousnessName: seriousnessLabel(rec.userSeriousity),
    customerDescription: rec.customerDescription,
    realtorDescription: rec.realtorDescription,
    inputs,
    status: rec.status,
    completeness: computeCompleteness(rec),
    armRequestId: rec.armRequestId,
    armRegisteredAt: rec.armRegisteredAt?.toISOString() ?? null,
    armCustomerFound: Boolean(rec.armCustomerId),
    eventCount,
    createdAt: rec.createdAt.toISOString(),
    updatedAt: rec.updatedAt.toISOString(),
  };
}

/** ساختار رکورد درخواست (سازگار با Prisma RequestRecord — برای تست بدون ORM) */
export interface RequestRecordRow {
  id: string;
  source: string;
  customerName: string | null;
  customerMobile: string | null;
  armCustomerId: string | null;
  countryId: string | null;
  stateId: string | null;
  cityId: string | null;
  areaIdsJson: string | null;
  areaNamesJson: string | null;
  lineIdsJson: string | null;
  lineNamesJson: string | null;
  tradeTypeId: string | null;
  buildingTypeId: string | null;
  propertyTypeId: string | null;
  inputsJson: string | null;
  customerDescription: string | null;
  userPaymentMethod: string | null;
  userSeriousity: string | null;
  realtorDescription: string | null;
  status: string;
  armRegistrationJson: string | null;
  armRegisteredAt: Date | null;
  armRequestId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// ===================== ابزار =====================

export function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[,،\s]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function fa(s: string): string {
  return s.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

function shortCode(id: string): string {
  return id.slice(-6).toUpperCase();
}

/** برچسب بازه‌ای مبلغ — عین ستون «مبلغ درخواست» خود سامانه (totalPrice_from/to یا ودیعه/اجاره) */
function rangeLabel(from: unknown, to: unknown, rentFrom?: unknown, rentTo?: unknown): string {
  const f = num(from);
  const t = num(to);
  const rf = num(rentFrom);
  const rt = num(rentTo);
  const parts: string[] = [];
  if (f || t) {
    parts.push(f && t ? `${formatToman(f)} تا ${formatToman(t)}` : formatToman(f ?? t ?? 0));
  }
  if (rf || rt) {
    parts.push(`اجاره ${rf && rt ? `${formatToman(rf)} تا ${formatToman(rt)}` : formatToman(rf ?? rt ?? 0)}`);
  }
  return parts.length > 0 ? parts.join(" + ") : "—";
}

function formatToman(v: number): string {
  if (v >= 1_000_000_000) return `${fa((v / 1_000_000_000).toFixed(v % 1_000_000_000 === 0 ? 0 : 1))} میلیارد`;
  if (v >= 1_000_000) return `${fa(String(Math.round(v / 1_000_000)))} میلیون`;
  if (v >= 1_000) return `${fa(String(Math.round(v / 1_000)))} هزار`;
  return fa(String(v));
}

/** برچسب مکان درخواست — «ولیعصر، ایل گلی» یا «ولیعصر» */
export function locationLabel(areaNames: string[], lineNames: string[]): string {
  if (areaNames.length === 0) return "—";
  if (lineNames.length === 0) return areaNames.slice(0, 3).join("، ");
  return `${areaNames.slice(0, 2).join("، ")} (${lineNames.slice(0, 3).join("، ")})`;
}
