/**
 * مجری «انتقال به CRM» — ثبت گام‌به‌گام فایل آگهی در سامانه ARM ملک تبریز
 * ------------------------------------------------------
 * عین فرآیند ثبت یک کاربر عادی در خود سامانه (new-property-page) — هیچ گامی دور نمی‌شود:
 *   گام ۰  اعتبارسنجی کامل ۵ گام (همان zod خود سامانه)
 *   گام ۱  اطلاعات مالک: جستجوی کاربر با موبایل (users/info/mobile-number) و در صورت نبود،
 *          ایجاد کاربر (users/create) — موبایل بدون صفر، عین خود سامانه
 *   گام ۲  اطلاعات مکانی: شناسه‌های رسمی کشور/استان/شهر/منطقه/محله آرم + مختصات
 *   گام ۳  اطلاعات معامله: شناسه‌های نوع معامله/کاربری/ملک + معاوضه + فرم پویای دسته
 *   گام ۴  رسانه: تصاویر (اولین = اصلی) + ویدیو + اسناد
 *   گام ۵  توضیحات مشاوران: قیمت فایل/مطلوبیت/نحوه یافتن/وضعیت/جدیت/دلیل فروش
 *   ثبت    POST properties + addToURL ["create"] (نهایی) یا ["create","draft"] (پیش‌نویس)
 *
 * کشف‌های کلیدی از باندل رسمی (object-util): سریال‌سازی مقادیر فرم —
 *   هر شیء {userId} → userId، {_id} → _id، {value} → value؛ مقادیر تهی/خالی حذف می‌شوند.
 */

import { MelkApiError } from "@/lib/melk-api/types";
import { armCall } from "@/lib/melk-api/client";
import { getMelkApiConfig } from "@/lib/melk-api/config";
import { updateSessionArmTokens } from "@/lib/auth/session";
import type { SessionContext } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { validateListing } from "./types";
import { TABRIZ_CITY_ID } from "@/lib/divar/tabriz-locations";

// ===================== شناسه‌های ثابت جغرافیایی (کشف زنده از API آرم) =====================

export const IRAN_COUNTRY_ID = "614ed19700cace6eac4f9ded";
export const AZ_SHARGHI_STATE_ID = "614ed19700cace6eac4f9df0";
export const TABRIZ_CITY = TABRIZ_CITY_ID;

// ===================== گزارش گام‌به‌گام =====================

export interface TransferStep {
  key: string;
  title: string;
  status: "pending" | "done" | "failed" | "skipped";
  detail: string;
}

export interface TransferResult {
  ok: boolean;
  mode: "create" | "draft";
  steps: TransferStep[];
  armPropertyId?: string;
  armMessage?: string;
  customerId?: string;
  customerCreated?: boolean;
  error?: string;
}

/** موبایل به فرمت آرم — بدون صفر ابتدایی (عین خود سامانه: «شماره موبایل (بدون صفر)») */
export function toArmMobile(mobile: string): string {
  const digits = mobile.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/\D/g, "");
  return digits.startsWith("0") ? digits.slice(1) : digits;
}

/** تفکیک نام کامل به نام/نام‌خانوادگی (users/create آرم دو فیلد جداگانه می‌خواهد) */
export function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

// ===================== گام ۱: جستجو/ایجاد مشتری در آرم =====================

async function resolveCustomer(
  fullName: string,
  mobile: string,
  exec: <T>(fn: (token: string) => Promise<T>) => Promise<T>
): Promise<{ customerId: string; created: boolean; name?: string; step: TransferStep }> {
  const armMobile = toArmMobile(mobile);

  // ۱.جستجو — GET users/info/mobile-number/{mobile}
  const found = await exec<{ _id?: string; userId?: string; fullName?: string; firstName?: string; lastName?: string; mobileNumber?: string } | null>(
    (token) =>
      armCall<{ _id?: string; userId?: string; fullName?: string; firstName?: string; lastName?: string; mobileNumber?: string }>({
        method: "GET",
        path: `users/info/mobile-number/${encodeURIComponent(armMobile)}`,
        baseUrl: getMelkApiConfig().armApiBase,
        token,
        timeoutMs: getMelkApiConfig().timeoutMs,
        maxRetries: 1,
      }).then((r) => r.data).catch(() => null)
  );

  if (found && (found._id || found.userId)) {
    const id = found.userId ?? found._id ?? "";
    const name = found.fullName ?? [found.firstName, found.lastName].filter(Boolean).join(" ");
    return {
      customerId: id,
      created: false,
      name,
      step: {
        key: "customer",
        title: "گام ۱ — اطلاعات مالک: کاربر موجود در آرم",
        status: "done",
        detail: `کاربر «${name || fullName}» با شماره ${armMobile} در سامانه آرم یافت شد و به این آگهی متصل شد.`,
      },
    };
  }

  // ۲.ایجاد — POST users/create (عین addToURL خود سامانه)
  const { firstName, lastName } = splitName(fullName);
  const created = await exec<{ _id?: string; userId?: string }>((token) =>
    armCall<{ _id?: string; userId?: string }>({
      method: "POST",
      path: "users/create",
      baseUrl: getMelkApiConfig().armApiBase,
      token,
      body: { firstName, lastName, mobileNumber: armMobile },
      timeoutMs: getMelkApiConfig().timeoutMs,
      maxRetries: 0,
    }).then((r) => r.data)
  );

  const newId = created?.userId ?? created?._id ?? "";
  if (!newId) {
    throw new MelkApiError("UNKNOWN", "ایجاد کاربر مالک در سامانه آرم ناموفق بود.", 502, false);
  }
  return {
    customerId: newId,
    created: true,
    step: {
      key: "customer",
      title: "گام ۱ — اطلاعات مالک: ایجاد کاربر جدید در آرم",
      status: "done",
      detail: `کاربر «${fullName}» با شماره ${armMobile} در سامانه آرم ایجاد شد (نام: ${firstName} / نام‌خانوادگی: ${lastName}).`,
    },
  };
}

// ===================== ساخت بدنه نهایی (عین سریال‌سازی خود سامانه) =====================

export interface CrmPayloadInput {
  customerId: string;
  areaId: string;
  areaName: string;
  lineId: string;
  lineName: string;
  latitude?: number | null;
  longitude?: number | null;
  postalCode?: string | null;
  address: string;
  tradeTypeId: string;
  propertyTypeId: string;
  buildingTypeId: string;
  changeWith: string[];
  inputs: Record<string, string>;
  images: string[];
  videos: string[];
  priceEvaluation: string;
  desirabilityLevel?: string | null;
  fileFinding: string;
  fileType: string[];
  userSeriousness: string;
  sellReason?: string | null;
  description?: string | null;
  isLuxury?: boolean;
  isVacation?: boolean;
  isUrgent?: boolean;
  notifyBySms?: boolean;
}

/** بدنه properties/create — مقادیر شیء‌ای به شناسه خام تبدیل می‌شوند (عین d() خود سامانه) */
export function buildCreatePayload(input: CrmPayloadInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    customer: input.customerId,
    country: IRAN_COUNTRY_ID,
    state: AZ_SHARGHI_STATE_ID,
    city: TABRIZ_CITY,
    area: input.areaId,
    line: input.lineId,
    address: input.address,
    tradeType: input.tradeTypeId,
    propertyType: input.propertyTypeId,
    buildingType: input.buildingTypeId,
    changeWith: input.changeWith,
    inputs: input.inputs,
    priceEvaluation: input.priceEvaluation,
    fileFinding: input.fileFinding,
    fileType: input.fileType,
    userSeriousity: input.userSeriousness,
    description: input.description ?? "",
  };
  // مقادیر اختیاری — فقط وقتی مقدار دارند (عین removeEmpty خود سامانه)
  if (input.postalCode) payload.postal_code = input.postalCode;
  if (input.desirabilityLevel) payload.desirabilityLevel = input.desirabilityLevel;
  if (input.sellReason) payload.sellReason = input.sellReason;
  if (input.latitude != null && input.longitude != null) payload.location = { lat: input.latitude, lng: input.longitude };
  if (input.images.length > 0) payload.images = input.images;
  if (input.videos.length > 0) payload.videos = input.videos;
  if (input.isLuxury) payload.isLuxury = true;
  if (input.isVacation) payload.isVacation = true;
  if (input.isUrgent) payload.isUrgent = true;
  if (input.notifyBySms) payload.notifyBySms = true;
  return payload;
}

// ===================== اجرای کامل انتقال =====================

/**
 * انتقال گام‌به‌گام فایل آگهی به سامانه ARM.
 * exec تابع اجرای توکن‌دار است (با تمدید خودکار در صورت انقضا).
 */
export async function transferListingToCrm(
  guard: SessionContext,
  listingId: string,
  mode: "create" | "draft",
  exec: <T>(fn: (token: string) => Promise<T>) => Promise<T>
): Promise<TransferResult> {
  const steps: TransferStep[] = [];
  const listing = await db.listingRecord.findUnique({ where: { id: listingId } });
  if (!listing) {
    return { ok: false, mode, steps, error: "فایل آگهی یافت نشد." };
  }

  // ---------- گام ۰: اعتبارسنجی ۵ گامی ----------
  const parse = <T,>(json: string | null, fallback: T): T => {
    try {
      return json ? (JSON.parse(json) as T) : fallback;
    } catch {
      return fallback;
    }
  };
  const inputs = parse<Record<string, string>>(listing.inputsJson, {});
  const changeWith = parse<string[]>(listing.changeWithJson, []);
  const images = parse<string[]>(listing.imagesJson, []);
  const videos = parse<string[]>(listing.videosJson, []);
  const fileType = parse<string[]>(listing.fileTypeJson, []);

  const v = validateListing({
    customerName: listing.customerName,
    customerMobile: listing.customerMobile,
    areaId: listing.areaId,
    lineId: listing.lineId,
    address: listing.address,
    postalCode: listing.postalCode,
    tradeTypeId: listing.tradeTypeId,
    buildingTypeId: listing.buildingTypeId,
    propertyTypeId: listing.propertyTypeId,
    changeWith,
    inputs,
    priceEvaluation: listing.priceEvaluation,
    fileFinding: listing.fileFinding,
    fileType,
    userSeriousness: listing.userSeriousness,
  });
  if (!v.ok) {
    const byStep = new Map<number, string[]>();
    for (const e of v.errors) {
      byStep.set(e.step, [...(byStep.get(e.step) ?? []), e.message]);
    }
    steps.push({
      key: "validate",
      title: "گام ۰ — اعتبارسنجی اطلاعات ۵ گامی",
      status: "failed",
      detail: `اطلاعات ناقص است: ${v.errors.map((e) => e.message).join("؛ ")}`,
    });
    return { ok: false, mode, steps, error: "اطلاعات ۵ گامی کامل نیست — ابتدا فایل را تکمیل کنید." };
  }
  steps.push({
    key: "validate",
    title: "گام ۰ — اعتبارسنجی اطلاعات ۵ گامی",
    status: "done",
    detail: "هر ۵ گام کامل است: مالک، مکان، معامله، رسانه و توضیحات مشاوران.",
  });

  // ---------- گام ۱: جستجو/ایجاد مشتری ----------
  let customerId = listing.armCustomerId ?? "";
  let customerCreated = false;
  if (customerId) {
    steps.push({
      key: "customer",
      title: "گام ۱ — اطلاعات مالک: کاربر پیش‌تر متصل است",
      status: "done",
      detail: `کاربر آرم ${customerId} از انتقال قبلی به یاد سپرده شده است.`,
    });
  } else {
    try {
      const res = await resolveCustomer(listing.customerName ?? "", listing.customerMobile ?? "", exec);
      customerId = res.customerId;
      customerCreated = res.created;
      steps.push(res.step);
    } catch (err) {
      const e = err instanceof MelkApiError ? err : new MelkApiError("UNKNOWN", (err as Error)?.message ?? "خطای نامشخص", 502, false);
      steps.push({
        key: "customer",
        title: "گام ۱ — اطلاعات مالک: جستجو/ایجاد کاربر در آرم",
        status: "failed",
        detail: e.message,
      });
      return { ok: false, mode, steps, error: e.message, customerId };
    }
  }

  // ---------- گام ۲: اطلاعات مکانی ----------
  steps.push({
    key: "location",
    title: "گام ۲ — اطلاعات مکانی ملک",
    status: "done",
    detail: `ایران ← آذربایجان شرقی ← تبریز ← منطقه «${listing.areaName}» ← محله «${listing.lineName}»${listing.postalCode ? ` ← کد پستی ${listing.postalCode}` : ""} — شناسه‌های رسمی منطقه‌بندی آرم ارسال می‌شود.`,
  });

  // ---------- گام ۳: اطلاعات معامله ----------
  steps.push({
    key: "transaction",
    title: "گام ۳ — اطلاعات معامله",
    status: "done",
    detail: `نوع معامله «${listing.tradeTypeName}»، کاربری «${listing.buildingTypeName}»، نوع ملک «${listing.propertyTypeName}»، معاوضه ${changeWith.length > 0 ? "ثبت" : "—"}، مشخصات: ${Object.entries(inputs)
      .map(([k, val]) => `${k}=${val}`)
      .join("، ")}.`,
  });

  // ---------- گام ۴: رسانه ----------
  steps.push({
    key: "media",
    title: "گام ۴ — تصاویر و اسناد ملک",
    status: images.length + videos.length > 0 ? "done" : "skipped",
    detail:
      images.length + videos.length > 0
        ? `${images.length} تصویر${images.length > 0 ? " (نخستین = تصویر اصلی)" : ""}${videos.length > 0 ? ` و ${videos.length} ویدیو` : ""} به ثبت آگهی پیوست می‌شود.`
        : "بدون تصویر و ویدیو — آگهی بدون عکس هم در سامانه قابل ثبت است (عین فرم آرم).",
  });

  // ---------- گام ۵: توضیحات مشاوران ----------
  steps.push({
    key: "descriptions",
    title: "گام ۵ — توضیحات مشاوران",
    status: "done",
    detail: `قیمت فایل ثبت، نحوه فایل‌یابی «${listing.fileFinding}»، وضعیت فایل «${fileType.join("، ")}»، جدیت مشتری و توضیحات ارسال می‌شود.`,
  });

  // ---------- ثبت نهایی ----------
  const payload = buildCreatePayload({
    customerId,
    areaId: listing.areaId ?? "",
    areaName: listing.areaName ?? "",
    lineId: listing.lineId ?? "",
    lineName: listing.lineName ?? "",
    latitude: listing.latitude,
    longitude: listing.longitude,
    postalCode: listing.postalCode,
    address: listing.address ?? "",
    tradeTypeId: listing.tradeTypeId ?? "",
    propertyTypeId: listing.propertyTypeId ?? "",
    buildingTypeId: listing.buildingTypeId ?? "",
    changeWith,
    inputs,
    images,
    videos,
    priceEvaluation: listing.priceEvaluation ?? "",
    desirabilityLevel: listing.desirabilityLevel,
    fileFinding: listing.fileFinding ?? "",
    fileType,
    userSeriousness: listing.userSeriousness ?? "",
    sellReason: listing.sellReason,
    description: listing.description,
    isLuxury: listing.isLuxury,
    isVacation: listing.isVacation,
    isUrgent: listing.isUrgent,
    notifyBySms: listing.notifyBySms,
  });

  try {
    const result = await exec<{ _id?: string; id?: string }>((token) =>
      armCall<{ _id?: string; id?: string }>({
        method: "POST",
        path: mode === "draft" ? "properties/create/draft" : "properties/create",
        baseUrl: getMelkApiConfig().armApiBase,
        token,
        body: payload,
        timeoutMs: getMelkApiConfig().timeoutMs,
        maxRetries: 1,
      }).then((r) => r.data)
    );
    const armPropertyId = result?._id ?? result?.id ?? "";
    steps.push({
      key: "submit",
      title: mode === "draft" ? "ثبت پیش‌نویس در سامانه آرم" : "ثبت نهایی آگهی در سامانه آرم",
      status: "done",
      detail: armPropertyId
        ? `آگهی با شناسه ${armPropertyId} در سامانه آرم ثبت شد.`
        : "آگهی در سامانه آرم ثبت شد.",
    });

    // به‌روزرسانی رکورد محلی
    await db.listingRecord.update({
      where: { id: listingId },
      data: {
        armCustomerId: customerId,
        armPropertyId: armPropertyId || null,
        crmTransferredAt: new Date(),
        crmTransferJson: JSON.stringify({ steps, mode, at: new Date().toISOString(), customerId, customerCreated }),
        status: mode === "draft" ? listing.status : "ready",
      },
    });
    return { ok: true, mode, steps, armPropertyId, customerId, customerCreated };
  } catch (err) {
    const e = err instanceof MelkApiError ? err : new MelkApiError("UNKNOWN", (err as Error)?.message ?? "خطای ثبت در آرم", 502, false);
    steps.push({
      key: "submit",
      title: mode === "draft" ? "ثبت پیش‌نویس در سامانه آرم" : "ثبت نهایی آگهی در سامانه آرم",
      status: "failed",
      detail: e.message,
    });
    // ثبت گزارش شکست (بدون تغییر وضعیت انتقال)
    await db.listingRecord
      .update({
        where: { id: listingId },
        data: { crmTransferJson: JSON.stringify({ steps, mode, at: new Date().toISOString(), customerId, failed: true, error: e.message }) },
      })
      .catch(() => undefined);
    return { ok: false, mode, steps, error: e.message, customerId };
  }
}

// ===================== ساز و کار توکن‌دار با تمدید خودکار =====================

/** اجرای یک فراخوانی توکن‌دار با تمدید خودکار توکن آرم در صورت انقضا */
export async function execWithArmToken<T>(
  guard: SessionContext,
  fn: (token: string) => Promise<T>
): Promise<T> {
  if (!guard.armTokens?.accessToken) {
    throw new MelkApiError(
      "PRECONDITION_FAILED",
      "انتقال به سامانه آرم نیاز به ورود با «کد پرسنلی + پیامک» دارد — نشست مدیر محلی توکن آرم ندارد.",
      412,
      false
    );
  }
  try {
    return await fn(guard.armTokens.accessToken);
  } catch (err) {
    const e = err as MelkApiError;
    if ((e.code === "UNAUTHORIZED" || e.code === "OTP_INVALID") && guard.armTokens.refreshToken) {
      const { getMelkProvider } = await import("@/lib/melk-api/provider");
      const refreshed = await getMelkProvider().refreshArmToken(guard.armTokens.refreshToken);
      await updateSessionArmTokens(guard.sessionId, refreshed);
      return fn(refreshed.accessToken);
    }
    throw err;
  }
}
