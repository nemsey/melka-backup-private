/**
 * لایه ذخیره‌سازی فایل‌های آگهی (کاشی «آگهی»)
 * ------------------------------------------------------
 * - ثبت دستی (گام‌به‌گام ۵ مرحله‌ای — عین فرم آرم)
 * - درون‌ریزی خودکار فایل‌های تأییدشده کاشی فایل‌یابی (DivarAd با status=registered)
 * - آمار کلی برای KPI و ایجنت
 */

import { db } from "@/lib/db";
import { findLine } from "@/lib/divar/tabriz-locations";
import type { ListingRecord } from "@prisma/client";
import { validateListing, computeCompleteness, type ListingRow, toListingRow, type ListingUpsertInput, FILE_FINDINGS, FILE_TYPES } from "./types";
export type { ListingUpsertInput } from "./types";

/** برچسب فارسی مقدار نحوه فایل یابی */
export function fileFindingLabel(value: string | null | undefined): string {
  return FILE_FINDINGS.find((f) => f.value === value)?.label ?? value ?? "—";
}

/** برچسب فارسی وضعیت فایل (اختصاصی/اشتراکی…) */
export function fileTypeLabel(values: string[]): string[] {
  return values.map((v) => FILE_TYPES.find((t) => t.value === v)?.label ?? v);
}

/** نگاشت دسته دیوار → نوع معامله/کاربری/ملک آرم (همان نگاشت ثبت آگهی فایل‌یابی) */
export const DIVAR_CATEGORY_TO_ARM: Record<string, { tradeType: string; tradeTypeName: string; propertyType: string; propertyTypeName: string; buildingType: string; buildingTypeName: string }> = {
  "apartment-sell": { tradeType: "614ed62da50555f0a54c1eca", tradeTypeName: "فروش", propertyType: "614ee704a50555f0a54c227d", propertyTypeName: "آپارتمان", buildingType: "614edc35a50555f0a54c1f1e", buildingTypeName: "مسکونی" },
  "house-villa-sell": { tradeType: "614ed62da50555f0a54c1eca", tradeTypeName: "فروش", propertyType: "614ee750a50555f0a54c228e", propertyTypeName: "خانه،حیاط،ویلایی", buildingType: "614edc58a50555f0a54c1f42", buildingTypeName: "باغ و ویلا" },
  "plot-old": { tradeType: "614ed62da50555f0a54c1eca", tradeTypeName: "فروش", propertyType: "614ee798a50555f0a54c22a5", propertyTypeName: "زمین یا ملک کلنگی", buildingType: "614edc35a50555f0a54c1f1e", buildingTypeName: "مسکونی" },
  "presell": { tradeType: "614ed63aa50555f0a54c1ed2", tradeTypeName: "پیش فروش", propertyType: "614ee704a50555f0a54c227d", propertyTypeName: "آپارتمان", buildingType: "614edc35a50555f0a54c1f1e", buildingTypeName: "مسکونی" },
  "office-sell": { tradeType: "614ed62da50555f0a54c1eca", tradeTypeName: "فروش", propertyType: "614f3e3aa50555f0a54c2ae7", propertyTypeName: "دفترکار", buildingType: "614edc66a50555f0a54c1f56", buildingTypeName: "تجاری-خدماتی" },
  "shop-sell": { tradeType: "614ed62da50555f0a54c1eca", tradeTypeName: "فروش", propertyType: "614f3e31a50555f0a54c2acf", propertyTypeName: "مغازه", buildingType: "614edc66a50555f0a54c1f56", buildingTypeName: "تجاری-خدماتی" },
  "commercial-sell": { tradeType: "614ed62da50555f0a54c1eca", tradeTypeName: "فروش", propertyType: "614f1eeea50555f0a54c260e", propertyTypeName: "ساختمان", buildingType: "614edc66a50555f0a54c1f56", buildingTypeName: "تجاری-خدماتی" },
  "industry-agriculture-business-sell": { tradeType: "614ed62da50555f0a54c1eca", tradeTypeName: "فروش", propertyType: "614f8450a50555f0a54c3bbf", propertyTypeName: "زمین", buildingType: "61d6b43e3b9c7375c9f48d8f", buildingTypeName: "مزروعی-کشاورزی" },
  "apartment-rent": { tradeType: "614ed649a50555f0a54c1edb", tradeTypeName: "رهن و اجاره", propertyType: "614ee704a50555f0a54c227d", propertyTypeName: "آپارتمان", buildingType: "614edc35a50555f0a54c1f1e", buildingTypeName: "مسکونی" },
  "house-villa-rent": { tradeType: "614ed649a50555f0a54c1edb", tradeTypeName: "رهن و اجاره", propertyType: "614ee750a50555f0a54c228e", propertyTypeName: "خانه،حیاط،ویلایی", buildingType: "614edc58a50555f0a54c1f42", buildingTypeName: "باغ و ویلا" },
  "office-rent": { tradeType: "614ed649a50555f0a54c1edb", tradeTypeName: "رهن و اجاره", propertyType: "614f3e3aa50555f0a54c2ae7", propertyTypeName: "دفترکار", buildingType: "614edc66a50555f0a54c1f56", buildingTypeName: "تجاری-خدماتی" },
  "shop-rent": { tradeType: "614ed649a50555f0a54c1edb", tradeTypeName: "رهن و اجاره", propertyType: "614f3e31a50555f0a54c2acf", propertyTypeName: "مغازه", buildingType: "614edc66a50555f0a54c1f56", buildingTypeName: "تجاری-خدماتی" },
  "commercial-rent": { tradeType: "614ed649a50555f0a54c1edb", tradeTypeName: "رهن و اجاره", propertyType: "614f1eeea50555f0a54c260e", propertyTypeName: "ساختمان", buildingType: "614edc66a50555f0a54c1f56", buildingTypeName: "تجاری-خدماتی" },
};

// ===================== درون‌ریزی خودکار از فایل‌یابی (بخش «ب») =====================

/**
 * درون‌ریزی آگهی دیوارِ تأییدشده (status=registered) به فایل آگهی.
 * idempotent است — رکورد موجود به‌روزرسانی می‌شود، تکراری ساخته نمی‌شود.
 * فیلدهای تعیین‌شده توسط کاربر در انتقال قبلی (نام/موبایل مالک و…) بازنویسی نمی‌شوند.
 */
export async function importDivarAdAsListing(token: string, actorCode: string): Promise<ListingRecord | null> {
  const ad = await db.divarAd.findUnique({ where: { token } });
  if (!ad) return null;

  const mapping = DIVAR_CATEGORY_TO_ARM[ad.category] ?? DIVAR_CATEGORY_TO_ARM["apartment-sell"];
  const images = (() => {
    try {
      return JSON.parse(ad.imagesJson ?? "[]") as string[];
    } catch {
      return [];
    }
  })();
  const inputs: Record<string, string> = {
    مساحت: ad.meterage ? String(Math.round(ad.meterage)) : "",
    اتاق: ad.rooms != null ? String(ad.rooms) : "",
    طبقه: ad.floor != null ? String(ad.floor) : "",
    "سال ساخت": ad.buildYear != null ? String(ad.buildYear) : "",
    قیمت: ad.price != null ? String(Math.round(ad.price)) : "",
  };
  for (const k of Object.keys(inputs)) {
    if (!inputs[k]) delete inputs[k];
  }

  const data = {
    source: "divar" as const,
    divarToken: ad.token,
    areaId: ad.matchedAreaId,
    areaName: ad.matchedAreaName,
    lineId: ad.matchedLineId,
    lineName: ad.matchedLineName,
    address: (ad.locationText ?? "").replace(/^[^،]*پیش در تبریز،?\s*/, "").trim() || null,
    latitude: ad.latitude,
    longitude: ad.longitude,
    tradeTypeId: mapping.tradeType,
    tradeTypeName: mapping.tradeTypeName,
    propertyTypeId: mapping.propertyType,
    propertyTypeName: mapping.propertyTypeName,
    buildingTypeId: mapping.buildingType,
    buildingTypeName: mapping.buildingTypeName,
    changeWithJson: JSON.stringify(["notChangeable"]),
    inputsJson: JSON.stringify(inputs),
    imagesJson: JSON.stringify(images.slice(0, 15)),
    priceEvaluation: null,
    fileFinding: "divar",
    fileTypeJson: JSON.stringify(["private"]),
    description: ad.description ?? ad.title,
    status: "draft",
  };

  const existing = await db.listingRecord.findFirst({ where: { divarToken: ad.token } });
  if (existing) {
    // فیلدهای پرشده توسط کاربر را حفظ کن — فقط جای‌خالی‌ها را از دیوار پر کن
    return db.listingRecord.update({
      where: { id: existing.id },
      data: {
        areaId: existing.areaId ?? data.areaId,
        areaName: existing.areaName ?? data.areaName,
        lineId: existing.lineId ?? data.lineId,
        lineName: existing.lineName ?? data.lineName,
        address: existing.address ?? data.address,
        latitude: existing.latitude ?? data.latitude,
        longitude: existing.longitude ?? data.longitude,
        tradeTypeId: existing.tradeTypeId ?? data.tradeTypeId,
        tradeTypeName: existing.tradeTypeName ?? data.tradeTypeName,
        propertyTypeId: existing.propertyTypeId ?? data.propertyTypeId,
        propertyTypeName: existing.propertyTypeName ?? data.propertyTypeName,
        buildingTypeId: existing.buildingTypeId ?? data.buildingTypeId,
        buildingTypeName: existing.buildingTypeName ?? data.buildingTypeName,
        changeWithJson: existing.changeWithJson ?? data.changeWithJson,
        inputsJson: existing.inputsJson ?? data.inputsJson,
        imagesJson: existing.imagesJson ?? data.imagesJson,
        priceEvaluation: existing.priceEvaluation ?? data.priceEvaluation,
        fileFinding: existing.fileFinding ?? data.fileFinding,
        fileTypeJson: existing.fileTypeJson ?? data.fileTypeJson,
        description: existing.description ?? data.description,
        source: "divar",
        divarToken: ad.token,
      },
    });
  }
  return db.listingRecord.create({ data: { ...data, actorCode } });
}

/** درون‌ریزی همه آگهی‌های ثبت‌شده دیوار (فراخوانی هنگام بارگذاری کاشی — بخش «ب») */
export async function importRegisteredDivarAds(actorCode: string): Promise<{ created: number; total: number }> {
  const registered = await db.divarAd.findMany({
    where: { status: "registered" },
    select: { token: true },
  });
  let created = 0;
  for (const r of registered) {
    const existing = await db.listingRecord.findFirst({ where: { divarToken: r.token }, select: { id: true } });
    if (!existing) {
      await importDivarAdAsListing(r.token, actorCode);
      created++;
    }
  }
  return { created, total: registered.length };
}

// ===================== CRUD =====================

/** تبدیل ورودی به ستون‌های DB (JSON ها serialize می‌شوند) */
function toDbData(input: ListingUpsertInput): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  if (input.source !== undefined) data.source = input.source;
  if (input.divarToken !== undefined) data.divarToken = input.divarToken;
  if (input.customerName !== undefined) data.customerName = input.customerName?.trim() || null;
  if (input.customerMobile !== undefined) data.customerMobile = input.customerMobile || null;
  if (input.armCustomerId !== undefined) data.armCustomerId = input.armCustomerId || null;
  if (input.areaId !== undefined) data.areaId = input.areaId || null;
  if (input.areaName !== undefined) data.areaName = input.areaName || null;
  if (input.lineId !== undefined) data.lineId = input.lineId || null;
  if (input.lineName !== undefined) data.lineName = input.lineName || null;
  if (input.postalCode !== undefined) data.postalCode = input.postalCode || null;
  if (input.address !== undefined) data.address = input.address?.trim() || null;
  if (input.latitude !== undefined) data.latitude = input.latitude;
  if (input.longitude !== undefined) data.longitude = input.longitude;
  if (input.tradeTypeId !== undefined) data.tradeTypeId = input.tradeTypeId || null;
  if (input.tradeTypeName !== undefined) data.tradeTypeName = input.tradeTypeName || null;
  if (input.propertyTypeId !== undefined) data.propertyTypeId = input.propertyTypeId || null;
  if (input.propertyTypeName !== undefined) data.propertyTypeName = input.propertyTypeName || null;
  if (input.buildingTypeId !== undefined) data.buildingTypeId = input.buildingTypeId || null;
  if (input.buildingTypeName !== undefined) data.buildingTypeName = input.buildingTypeName || null;
  if (input.changeWith !== undefined) data.changeWithJson = JSON.stringify(input.changeWith);
  if (input.inputs !== undefined) data.inputsJson = JSON.stringify(input.inputs);
  if (input.images !== undefined) data.imagesJson = JSON.stringify(input.images.slice(0, 15));
  if (input.videos !== undefined) data.videosJson = JSON.stringify(input.videos.slice(0, 2));
  if (input.documents !== undefined) data.documentsJson = JSON.stringify(input.documents.slice(0, 10));
  if (input.priceEvaluation !== undefined) data.priceEvaluation = input.priceEvaluation || null;
  if (input.desirabilityLevel !== undefined) data.desirabilityLevel = input.desirabilityLevel || null;
  if (input.fileFinding !== undefined) data.fileFinding = input.fileFinding || null;
  if (input.fileType !== undefined) data.fileTypeJson = JSON.stringify(input.fileType);
  if (input.userSeriousness !== undefined) data.userSeriousness = input.userSeriousness || null;
  if (input.sellReason !== undefined) data.sellReason = input.sellReason || null;
  if (input.description !== undefined) data.description = input.description || null;
  if (input.isLuxury !== undefined) data.isLuxury = input.isLuxury;
  if (input.isVacation !== undefined) data.isVacation = input.isVacation;
  if (input.isUrgent !== undefined) data.isUrgent = input.isUrgent;
  if (input.notifyBySms !== undefined) data.notifyBySms = input.notifyBySms;
  if (input.status !== undefined) data.status = input.status;
  return data;
}

/** تکمیل خودکار نام‌ها بر اساس شناسه‌ها (اگر نام خالی باشد) */
function enrichNames(input: ListingUpsertInput): void {
  const line = input.lineId ? findLine(input.lineId) : null;
  if (line) {
    if (!input.areaId) input.areaId = line.areaId;
    if (!input.areaName) input.areaName = line.areaName;
    if (!input.lineName) input.lineName = line.n;
  }
}

/** ثبت فایل آگهی دستی — پس از اعتبارسنجی، وضعیت ready می‌گیرد */
export async function createListing(input: ListingUpsertInput, actorCode: string): Promise<{ ok: boolean; errors: ReturnType<typeof validateListing>["errors"]; record?: ListingRecord }> {
  enrichNames(input);
  const v = validateListing({
    customerName: input.customerName,
    customerMobile: input.customerMobile,
    areaId: input.areaId,
    lineId: input.lineId,
    address: input.address,
    postalCode: input.postalCode,
    tradeTypeId: input.tradeTypeId,
    buildingTypeId: input.buildingTypeId,
    propertyTypeId: input.propertyTypeId,
    changeWith: input.changeWith,
    inputs: input.inputs,
    priceEvaluation: input.priceEvaluation,
    fileFinding: input.fileFinding,
    fileType: input.fileType,
    userSeriousness: input.userSeriousness,
  });
  const record = await db.listingRecord.create({
    data: {
      ...toDbData(input),
      source: "manual",
      actorCode,
      status: v.ok ? "ready" : "draft",
    },
  });
  return { ok: v.ok, errors: v.errors, record };
}

/** به‌روزرسانی فایل آگهی (تکمیل گام‌های ناقص/ویرایش) */
export async function updateListing(id: string, input: ListingUpsertInput): Promise<ListingRecord | null> {
  enrichNames(input);
  const existing = await db.listingRecord.findUnique({ where: { id } });
  if (!existing) return null;
  const merged = {
    customerName: input.customerName !== undefined ? input.customerName : existing.customerName,
    customerMobile: input.customerMobile !== undefined ? input.customerMobile : existing.customerMobile,
    areaId: input.areaId !== undefined ? input.areaId : existing.areaId,
    lineId: input.lineId !== undefined ? input.lineId : existing.lineId,
    address: input.address !== undefined ? input.address : existing.address,
    postalCode: input.postalCode !== undefined ? input.postalCode : existing.postalCode,
    tradeTypeId: input.tradeTypeId !== undefined ? input.tradeTypeId : existing.tradeTypeId,
    buildingTypeId: input.buildingTypeId !== undefined ? input.buildingTypeId : existing.buildingTypeId,
    propertyTypeId: input.propertyTypeId !== undefined ? input.propertyTypeId : existing.propertyTypeId,
    changeWith: input.changeWith !== undefined ? input.changeWith : JSON.parse(existing.changeWithJson ?? "[]"),
    inputs: input.inputs !== undefined ? input.inputs : JSON.parse(existing.inputsJson ?? "{}"),
    priceEvaluation: input.priceEvaluation !== undefined ? input.priceEvaluation : existing.priceEvaluation,
    fileFinding: input.fileFinding !== undefined ? input.fileFinding : existing.fileFinding,
    fileType: input.fileType !== undefined ? input.fileType : JSON.parse(existing.fileTypeJson ?? "[]"),
    userSeriousness: input.userSeriousness !== undefined ? input.userSeriousness : existing.userSeriousness,
  };
  const v = validateListing(merged);
  // وضعیت چرخه عمر فقط وقتی دستی جابه‌جا نشده باشد بازمحاسبه می‌شود
  const nextStatus = input.status ?? (v.ok ? "ready" : existing.status === "ready" ? "draft" : existing.status);
  return db.listingRecord.update({ where: { id }, data: { ...toDbData(input), status: nextStatus } });
}

/** فهرست فایل‌ها + آمار */
export async function listListings(filter?: { source?: "manual" | "divar"; pendingAction?: boolean }): Promise<{ rows: ListingRow[]; stats: ListingStats }> {
  await importRegisteredDivarAds("system").catch(() => undefined);
  const where: { source?: string; status?: { not: string } } = {};
  if (filter?.source) where.source = filter.source;
  if (filter?.pendingAction) where.status = { not: "archived" };
  const records = await db.listingRecord.findMany({ where, orderBy: { createdAt: "desc" }, take: 500 });
  const rows = records.map(toListingRow);

  const stats: ListingStats = {
    total: rows.length,
    manual: rows.filter((r) => r.source === "manual").length,
    fromDivar: rows.filter((r) => r.source === "divar").length,
    drafts: rows.filter((r) => r.completeness.some((c) => !c.done)).length,
    crmTransferred: rows.filter((r) => r.crmTransferredAt).length,
    instagramPublished: rows.filter((r) => r.instagramPublishedAt).length,
    pendingBoth: rows.filter((r) => !r.crmTransferredAt && !r.instagramPublishedAt && r.completeness.every((c) => c.done)).length,
  };
  return { rows, stats };
}

export interface ListingStats {
  total: number;
  manual: number;
  fromDivar: number;
  drafts: number;
  crmTransferred: number;
  instagramPublished: number;
  pendingBoth: number;
}

/** یک فایل با شناسه */
export async function getListing(id: string): Promise<ListingRecord | null> {
  return db.listingRecord.findUnique({ where: { id } });
}

/** حذف آرشیو — فقط وضعیت archived (سابقه حسابرسی حفظ می‌شود) */
export async function archiveListing(id: string): Promise<ListingRecord | null> {
  return db.listingRecord.update({ where: { id }, data: { status: "archived" } }).catch(() => null);
}

/** پیش‌نمایش کامل‌بودن ۵ گام (برای دیالوگ انتقال) */
export function listingReadiness(rec: ListingRecord): { steps: { step: number; label: string; done: boolean }[]; allDone: boolean } {
  const steps = computeCompleteness(rec).map((c) => ({ step: c.step, label: c.label, done: c.done }));
  return { steps, allDone: steps.every((s) => s.done) };
}
