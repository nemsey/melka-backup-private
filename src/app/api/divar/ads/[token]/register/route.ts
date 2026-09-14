/**
 * /api/divar/ads/[token]/register — کلید «ثبت آگهی» (ثبت خودکار در سامانه ARM)
 * ------------------------------------------------------
 * GET  — پیش‌نویس آماده: نگاشت کامل داده آگهی دیوار به فرم ۵ مرحله‌ای ثبت آگهی آرم
 *        (مالک ← مکان ← معامله ← تصاویر ← توضیحات مشاوران) + فهرست اطلاعات ناقص
 * POST — ثبت نهایی: ارسال properties/create به سامانه آرم با توکن نشست کاربر
 *        (پیش‌پر خودکار + تکمیل اطلاعات ناقص توسط کاربر + تأیید نهایی)
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";
import { audit, updateSessionArmTokens } from "@/lib/auth/session";
import { getMelkProvider } from "@/lib/melk-api/provider";
import { armCall } from "@/lib/melk-api/client";
import { getMelkApiConfig } from "@/lib/melk-api/config";
import { findLine, TABRIZ_CITY_ID } from "@/lib/divar/tabriz-locations";
import { DIVAR_REAL_ESTATE_CATEGORIES } from "@/lib/divar/config";

/** نگاشت دسته دیوار به نوع معامله/کاربری سامانه آرم */
const CATEGORY_MAP: Record<string, { tradeType: string; propertyType: string; buildingType: string }> = {
  "apartment-sell": { tradeType: "فروش", propertyType: "مسکونی", buildingType: "آپارتمان" },
  "house-villa-sell": { tradeType: "فروش", propertyType: "مسکونی", buildingType: "خانه/ویلا" },
  "plot-old": { tradeType: "فروش", propertyType: "کلنگی", buildingType: "کلنگی" },
  "presell": { tradeType: "فروش", propertyType: "مسکونی", buildingType: "پیش‌فروش" },
  "office-sell": { tradeType: "فروش", propertyType: "تجاری/اداری", buildingType: "اداری" },
  "shop-sell": { tradeType: "فروش", propertyType: "تجاری/اداری", buildingType: "مغازه" },
  "commercial-sell": { tradeType: "فروش", propertyType: "تجاری/اداری", buildingType: "تجاری" },
  "industry-agriculture-business-sell": { tradeType: "فروش", propertyType: "صنعتی/کشاورزی", buildingType: "سایر" },
  "apartment-rent": { tradeType: "رهن و اجاره", propertyType: "مسکونی", buildingType: "آپارتمان" },
  "house-villa-rent": { tradeType: "رهن و اجاره", propertyType: "مسکونی", buildingType: "خانه/ویلا" },
  "office-rent": { tradeType: "رهن و اجاره", propertyType: "تجاری/اداری", buildingType: "اداری" },
  "shop-rent": { tradeType: "رهن و اجاره", propertyType: "تجاری/اداری", buildingType: "مغازه" },
  "commercial-rent": { tradeType: "رهن و اجاره", propertyType: "تجاری/اداری", buildingType: "تجاری" },
};

function categoryFa(value: string): string {
  return DIVAR_REAL_ESTATE_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const { token } = await ctx.params;
  const ad = await db.divarAd.findUnique({ where: { token } });
  if (!ad) {
    return errorResponse(new MelkApiError("NOT_FOUND", "این فایل یافت نشد.", 404, false));
  }

  const line = ad.matchedLineId ? findLine(ad.matchedLineId) : null;
  const mapping = CATEGORY_MAP[ad.category] ?? { tradeType: "فروش", propertyType: "مسکونی", buildingType: "آپارتمان" };

  // پیش‌نویس ۵ مرحله‌ای — عین ساختار ثبت آگهی خود سامانه آرم
  const draft = {
    step1_owner: {
      fullName: "",
      mobileNumber: "",
      hint: "پس از تماس با آگهی‌دهنده دیوار، نام و شماره مالک را وارد کنید — این داده در دیوار عمومی نیست.",
    },
    step2_location: {
      country: "ایران",
      state: "آذربایجان شرقی",
      city: "تبریز",
      cityId: TABRIZ_CITY_ID,
      areaId: ad.matchedAreaId,
      areaName: ad.matchedAreaName,
      lineId: ad.matchedLineId,
      lineName: ad.matchedLineName,
      postalCode: "",
      address: (ad.locationText ?? "").replace(/^[^،]*پیش در تبریز،?\s*/, "").trim(),
      latitude: ad.latitude,
      longitude: ad.longitude,
      hint: line ? `محله «${line.n}» (منطقه ${line.areaName}) مطابق منطقه‌بندی آرم انتخاب شد.` : "محله آرم برای این آگهی قابل تشخیص نبود — دستی انتخاب کنید.",
    },
    step3_transaction: {
      tradeType: mapping.tradeType,
      propertyType: mapping.propertyType,
      buildingType: mapping.buildingType,
      changeWith: ["notChangeable"],
      inputs: {
        مساحت: ad.meterage ? String(Math.round(ad.meterage)) : "",
        اتاق: ad.rooms != null ? String(ad.rooms) : "",
        طبقه: ad.floor != null ? String(ad.floor) : "",
        "سال ساخت": ad.buildYear != null ? String(ad.buildYear) : "",
      },
    },
    step4_media: {
      images: (() => {
        try { return JSON.parse(ad.imagesJson ?? "[]") as string[]; } catch { return []; }
      })(),
      hint: "تصاویر آگهی دیوار به سامانه آرم قابل انتقال است؛ در فرم آرم بارگذاری/انتقال انجام می‌شود.",
    },
    step5_description: {
      priceEvaluation: ad.price != null ? String(Math.round(ad.price)) : "",
      desirabilityLevel: "",
      fileFinding: "دیوار",
      fileType: ["خرید"],
      userSeriousity: "",
      sellReason: "",
      description: ad.description ?? ad.title,
    },
  };

  const missing: string[] = [];
  if (!draft.step1_owner.fullName) missing.push("نام و نام‌خانوادگی مالک (پس از تماس با آگهی‌دهنده)");
  if (!draft.step1_owner.mobileNumber) missing.push("شماره موبایل مالک");
  if (!draft.step2_location.lineId) missing.push("محله (منطقه‌بندی آرم)");
  if (!draft.step2_location.postalCode) missing.push("کد پستی ۱۰ رقمی");
  if (!draft.step3_transaction.inputs["مساحت"]) missing.push("متراژ ملک");

  return Response.json({
    ok: true,
    draft,
    missing,
    requirements: {
      armToken: Boolean(guard.armTokens?.accessToken),
      message: guard.armTokens?.accessToken
        ? "توکن سامانه آرم موجود است — پس از تکمیل اطلاعات ناقص، ثبت نهایی انجام می‌شود."
        : "برای ثبت در سامانه آرم باید با «کد پرسنلی + پیامک» وارد شوید (ورود مدیر محلی توکن آرم ندارد).",
    },
    categoryLabel: categoryFa(ad.category),
    scores: { total: ad.totalScore, bucket: ad.bucket },
  });
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  if (!guard.armTokens?.accessToken) {
    return errorResponse(
      new MelkApiError(
        "PRECONDITION_FAILED",
        "ثبت آگهی در سامانه آرم نیاز به ورود با «کد پرسنلی + پیامک» دارد — نشست مدیر محلی توکن آرم ندارد.",
        412,
        false
      )
    );
  }

  const { token } = await ctx.params;
  const ad = await db.divarAd.findUnique({ where: { token } });
  if (!ad) {
    return errorResponse(new MelkApiError("NOT_FOUND", "این فایل یافت نشد.", 404, false));
  }

  let body: {
    owner?: { fullName?: string; mobileNumber?: string };
    postalCode?: string;
    address?: string;
    lineId?: string;
    areaId?: string;
    tradeType?: string;
    propertyType?: string;
    buildingType?: string;
    priceEvaluation?: string;
    description?: string;
    inputs?: Record<string, string>;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "بدنه درخواست نامعتبر است.", 400, false));
  }

  const ownerName = String(body.owner?.fullName ?? "").trim();
  const ownerMobile = String(body.owner?.mobileNumber ?? "").replace(/\D/g, "");
  if (ownerName.length < 3) {
    return errorResponse(new MelkApiError("UNKNOWN", "نام و نام‌خانوادگی مالک را کامل وارد کنید.", 400, false));
  }
  if (!/^09\d{9}$/.test(ownerMobile)) {
    return errorResponse(new MelkApiError("UNKNOWN", "شماره موبایل مالک باید ۱۱ رقم و با ۰۹ شروع شود.", 400, false));
  }
  const lineId = body.lineId ?? ad.matchedLineId ?? "";
  const line = lineId ? findLine(lineId) : null;
  if (!line) {
    return errorResponse(new MelkApiError("UNKNOWN", "محله ملک را از منطقه‌بندی آرم انتخاب کنید.", 400, false));
  }
  const postalCode = String(body.postalCode ?? "").replace(/\D/g, "");
  if (postalCode && postalCode.length !== 10) {
    return errorResponse(new MelkApiError("UNKNOWN", "کد پستی باید ۱۰ رقم باشد.", 400, false));
  }

  const mapping = CATEGORY_MAP[ad.category] ?? { tradeType: "فروش", propertyType: "مسکونی", buildingType: "آپارتمان" };

  // بدنه ثبت — عین فرم خود سامانه آرم (properties/create)
  const payload = {
    customer: {
      fullName: ownerName,
      mobileNumber: ownerMobile,
    },
    country: "ایران",
    state: "آذربایجان شرقی",
    city: "تبریز",
    area: { name: line.areaName, _id: line.areaId },
    line: { name: line.n, _id: line.id },
    location: line.lat && line.lng ? { lat: line.lat, lng: line.lng } : null,
    postal_code: postalCode || undefined,
    address: String(body.address ?? ad.locationText ?? "").trim() || undefined,
    tradeType: body.tradeType ?? mapping.tradeType,
    propertyType: body.propertyType ?? mapping.propertyType,
    buildingType: body.buildingType ?? mapping.buildingType,
    changeWith: ["notChangeable"],
    inputs: body.inputs ?? {
      مساحت: ad.meterage ? String(Math.round(ad.meterage)) : "",
      اتاق: ad.rooms != null ? String(ad.rooms) : "",
      طبقه: ad.floor != null ? String(ad.floor) : "",
      "سال ساخت": ad.buildYear != null ? String(ad.buildYear) : "",
    },
    priceEvaluation: String(body.priceEvaluation ?? (ad.price != null ? Math.round(ad.price) : "")),
    fileFinding: "دیوار",
    fileType: ["خرید"],
    description: String(body.description ?? ad.description ?? ad.title).slice(0, 2000),
  };

  const cfg = getMelkApiConfig();

  const exec = async (accessToken: string) => {
    return armCall<unknown>({
      method: "POST",
      path: "properties/create",
      baseUrl: cfg.armApiBase,
      token: accessToken,
      body: payload,
      timeoutMs: cfg.timeoutMs,
      maxRetries: 1,
    });
  };

  try {
    let result;
    try {
      result = await exec(guard.armTokens.accessToken);
    } catch (err) {
      const e = err as MelkApiError;
      if ((e.code === "UNAUTHORIZED" || e.code === "OTP_INVALID") && guard.armTokens.refreshToken) {
        const provider = getMelkProvider();
        const refreshed = await provider.refreshArmToken(guard.armTokens.refreshToken);
        await updateSessionArmTokens(guard.sessionId, refreshed);
        result = await exec(refreshed.accessToken);
      } else {
        throw err;
      }
    }

    // ثبت موفق — وضعیت آگهی به registered تغییر می‌کند
    await db.divarAd.update({
      where: { token: ad.token },
      data: { status: "registered" },
    });

    // ---------- درون‌ریزی خودکار به کاشی «آگهی» (بخش «ب» قانون مالک) ----------
    // فایل‌هایی که کاربر در کاشی فایل‌یابی تأیید (ثبت) می‌کند، خودکار در کاشی آگهی ثبت می‌شوند.
    let listingId: string | null = null;
    try {
      const { importDivarAdAsListing } = await import("@/lib/listing/store");
      const listing = await importDivarAdAsListing(ad.token, guard.personnelCode);
      if (listing) {
        // اتصال به ثبت موفق CRM: شناسه آگهی آرم + گزارش گام‌ها
        const armId = (result.data as { _id?: string; id?: string } | null)?._id ?? (result.data as { _id?: string; id?: string } | null)?.id ?? null;
        await db.listingRecord
          .update({
            where: { id: listing.id },
            data: {
              armCustomerId: null,
              armPropertyId: armId ?? null,
              crmTransferredAt: new Date(),
              crmTransferJson: JSON.stringify({
                via: "file-finder-register",
                at: new Date().toISOString(),
                armId: armId ?? null,
                steps: [
                  { key: "customer", title: "گام ۱ — اطلاعات مالک", status: "done", detail: "از فرم ثبت فایل‌یابی ارسال شد." },
                  { key: "location", title: "گام ۲ — اطلاعات مکانی ملک", status: "done", detail: "منطقه/محله آرم از تطبیق دیوار." },
                  { key: "transaction", title: "گام ۳ — اطلاعات معامله", status: "done", detail: "نگاشت دسته دیوار به نوع‌های آرم." },
                  { key: "media", title: "گام ۴ — تصاویر و اسناد ملک", status: "done", detail: "تصاویر دیوار پیوست شد." },
                  { key: "descriptions", title: "گام ۵ — توضیحات مشاوران", status: "done", detail: "قیمت و توضیحات آگهی دیوار." },
                  { key: "submit", title: "ثبت نهایی در سامانه آرم", status: "done", detail: "از مسیر کاشی فایل‌یابی ثبت شد." },
                ],
              }),
            },
          })
          .catch(() => undefined);
        listingId = listing.id;
      }
    } catch {
      // درون‌ریزی ناموفق نباید ثبت موفق را خراب کند — در بارگذاری بعدی کاشی آگهی دوباره تلاش می‌شود
    }

    await audit("DIVAR_REGISTER", guard.personnelCode, `token=${ad.token} arm-ok`);
    return Response.json({
      ok: true,
      message: `آگهی با موفقیت در سامانه آرم ثبت شد. ${result.message ? `پیام سامانه: ${result.message}` : ""}${listingId ? " فایل در کاشی «آگهی» نیز ثبت شد." : ""}`,
      armResult: result.data,
      listingId,
    });
  } catch (err) {
    const e = err instanceof MelkApiError ? err : new MelkApiError("UNKNOWN", (err as Error)?.message ?? "خطای ثبت در آرم", 502, false);
    await audit("DIVAR_REGISTER_FAIL", guard.personnelCode, `token=${ad.token} ${e.message.slice(0, 100)}`).catch(() => undefined);
    return errorResponse(e);
  }
}
