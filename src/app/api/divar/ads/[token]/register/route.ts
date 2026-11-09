/**
 * /api/divar/ads/[token]/register — کلید «ثبت آگهی» (ثبت خودکار در سامانه ARM)
 * ------------------------------------------------------
 * GET  — پیش‌نویس آماده: نگاشت کامل داده آگهی دیوار به فرم ۵ مرحله‌ای ثبت آگهی آرم
 *        (مالک ← مکان ← معامله ← تصاویر ← توضیحات مشاوران) + فهرست اطلاعات ناقص
 * POST — ثبت نهایی از مسیر «همان خط لولهٔ کاشی آگهی»:
 *        درون‌ریزی آگهی دیوار به فایل آگهی (شناسه‌های زندهٔ آرم) →
 *        اعتبارسنجی ۵ گامی → جستجو/ایجاد مشتری (users/info/mobile-number → users/create) →
 *        POST properties/create با توکن نشست کاربر
 *
 * PN-080 (۲۰۲۶-۱۱-۱۰ · حکم مالک: «بهینه‌سازی ثبت آگهی در سامانه arm»):
 *   ریشهٔ شکست ۴ ثبت پیشین («فیلد کشور را بررسی کنید» + رد شناسه‌های کهنه):
 *   این مسیر پیش‌تر نام‌های فارسی (کشور/استان/شهر/نوع‌ها) و مقدار تومانی
 *   priceEvaluation می‌فرستاد؛ قرارداد واقعی آرم «شناسه‌های خام» است
 *   (کشف باندل + عین crm-transfer). اکنون ثبت از همان مجری اثبات‌شدهٔ
 *   transferListingToCrm می‌گذرد — صفر بدنهٔ دست‌ساز.
 */

import { NextRequest } from "next/server";
import { getMarketRepository } from "@/core/repositories";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";
import { audit } from "@/lib/auth/session";
import { findLine } from "@/lib/divar/tabriz-locations";
import { DIVAR_CATEGORY_TO_ARM, importDivarAdAsListing, applyDivarRegisterInputs } from "@/lib/listing/store";
import {
  PRICE_EVALUATIONS,
  USER_SERIOUSNESS,
  FILE_TYPES,
  FILE_FINDINGS,
} from "@/lib/listing/types";
import { transferListingToCrm, execWithArmToken } from "@/lib/listing/crm-transfer";
import { DIVAR_REAL_ESTATE_CATEGORIES } from "@/lib/divar/config";

function categoryFa(value: string): string {
  return DIVAR_REAL_ESTATE_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const { token } = await ctx.params;
  const ad = await getMarketRepository().findAdByToken(token);
  if (!ad) {
    return errorResponse(new MelkApiError("NOT_FOUND", "این فایل یافت نشد.", 404, false));
  }

  const line = ad.matchedLineId ? findLine(ad.matchedLineId) : null;
  const mapping = DIVAR_CATEGORY_TO_ARM[ad.category] ?? DIVAR_CATEGORY_TO_ARM["apartment-sell"];

  const images = (() => {
    try {
      return JSON.parse(ad.imagesJson ?? "[]") as string[];
    } catch {
      return [];
    }
  })();

  // پیش‌نویس ۵ مرحله‌ای — عین ساختار ثبت آگهی خود سامانه آرم (قرارداد شناسه‌ای)
  const draft = {
    step1_owner: {
      fullName: "",
      mobileNumber: "",
      hint: "پس از تماس با آگهی‌دهنده دیوار، نام و شماره مالک را وارد کنید — این داده در دیوار عمومی نیست. اگر مالک در آرم موجود باشد به‌همان متصل می‌شود، وگرنه به‌طور خودکار ایجاد خواهد شد.",
    },
    step2_location: {
      country: "ایران",
      state: "آذربایجان شرقی",
      city: "تبریز",
      areaId: ad.matchedAreaId,
      areaName: ad.matchedAreaName,
      lineId: ad.matchedLineId,
      lineName: ad.matchedLineName,
      postalCode: "",
      address: (ad.locationText ?? "").replace(/^[^،]*پیش در تبریز،?\s*/, "").trim(),
      latitude: ad.latitude,
      longitude: ad.longitude,
      hint: line
        ? `محله «${line.n}» (منطقه ${line.areaName}) مطابق منطقه‌بندی آرم انتخاب شد.`
        : "محله آرم برای این آگهی قابل تشخیص نبود — دستی انتخاب کنید.",
    },
    step3_transaction: {
      tradeTypeId: mapping.tradeType,
      tradeTypeName: mapping.tradeTypeName,
      propertyTypeId: mapping.propertyType,
      propertyTypeName: mapping.propertyTypeName,
      buildingTypeId: mapping.buildingType,
      buildingTypeName: mapping.buildingTypeName,
      changeWith: ["notChangeable"],
      inputs: {
        مساحت: ad.meterage ? String(Math.round(ad.meterage)) : "",
        اتاق: ad.rooms != null ? String(ad.rooms) : "",
        طبقه: ad.floor != null ? String(ad.floor) : "",
        "سال ساخت": ad.buildYear != null ? String(ad.buildYear) : "",
      },
    },
    step4_media: {
      images: images.slice(0, 15),
      hint: "تا ۱۵ تصویر نخست آگهی دیوار به فرم رسانهٔ آرم پیوست می‌شود (نخستین = تصویر اصلی).",
    },
    step5_description: {
      // مقادیر پیش‌فرض جهت ثبت سریع — کاربر در پنجره می‌تواند تغییر دهد
      priceEvaluation: "61a7dae115a8b67e5ef937ad", // قیمت کارشناسی
      userSeriousness: "61a7535f0927675c45489a3b", // متوسط
      fileFinding: "divar",
      fileFindingLabel: FILE_FINDINGS.find((f) => f.value === "divar")?.label ?? "دیوار",
      fileType: ["private"],
      description: ad.description ?? ad.title,
      divarPriceToman: ad.price,
    },
    options: {
      priceEvaluations: PRICE_EVALUATIONS,
      userSeriousness: USER_SERIOUSNESS,
      fileTypes: FILE_TYPES,
    },
  };

  const missing: string[] = [];
  if (!draft.step1_owner.fullName) missing.push("نام و نام‌خانوادگی مالک (پس از تماس با آگهی‌دهنده)");
  if (!draft.step1_owner.mobileNumber) missing.push("شماره موبایل مالک");
  if (!draft.step2_location.lineId) missing.push("محله (منطقه‌بندی آرم)");
  if (!draft.step2_location.address) missing.push("آدرس ملک");
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
  const ad = await getMarketRepository().findAdByToken(token);
  if (!ad) {
    return errorResponse(new MelkApiError("NOT_FOUND", "این فایل یافت نشد.", 404, false));
  }

  let body: {
    owner?: { fullName?: string; mobileNumber?: string };
    postalCode?: string;
    address?: string;
    lineId?: string;
    priceEvaluation?: string;
    userSeriousness?: string;
    fileType?: string[];
    description?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "بدنه درخواست نامعتبر است.", 400, false));
  }

  // ---------- اعتبارسنجی ورودی‌های کاربر ----------
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
  const address = String(body.address ?? (ad.locationText ?? "").replace(/^[^،]*پیش در تبریز،?\s*/, "").trim()).trim();
  if (!address) {
    return errorResponse(new MelkApiError("UNKNOWN", "آدرس ملک را وارد کنید (فیلد اجباری فرم آرم).", 400, false));
  }
  const priceEvaluation = String(body.priceEvaluation ?? "61a7dae115a8b67e5ef937ad");
  if (!PRICE_EVALUATIONS.some((p) => p.id === priceEvaluation)) {
    return errorResponse(new MelkApiError("UNKNOWN", "قیمت فایل (نسبت با قیمت کارشناسی) نامعتبر است.", 400, false));
  }
  const userSeriousness = String(body.userSeriousness ?? "61a7535f0927675c45489a3b");
  if (!USER_SERIOUSNESS.some((s) => s.id === userSeriousness)) {
    return errorResponse(new MelkApiError("UNKNOWN", "جدیت مشتری نامعتبر است.", 400, false));
  }
  const fileType = Array.isArray(body.fileType) && body.fileType.length > 0 ? body.fileType : ["private"];
  if (!fileType.every((t) => FILE_TYPES.some((f) => f.value === t))) {
    return errorResponse(new MelkApiError("UNKNOWN", "وضعیت فایل (اختصاصی/اشتراکی) نامعتبر است.", 400, false));
  }

  // ---------- درون‌ریزی به کاشی آگهی (شناسه‌های زندهٔ آرم — PN-080) ----------
  const listing = await importDivarAdAsListing(ad.token, guard.personnelCode);
  if (!listing) {
    return errorResponse(new MelkApiError("UNKNOWN", "آماده‌سازی فایل آگهی برای ثبت ناموفق بود.", 500, false));
  }

  // ورودی‌های کاربر روی فایل آگهی می‌نشیند (آخرین ویرایش کاربر مقدم است — لایهٔ lib)
  await applyDivarRegisterInputs(listing.id, {
    ownerName,
    ownerMobile,
    postalCode,
    address,
    lineId: line.id,
    priceEvaluation,
    userSeriousness,
    fileType,
    description: String(body.description ?? ad.description ?? ad.title).slice(0, 2000),
  });

  // ---------- اجرای ثبت از مجری اثبات‌شدهٔ کاشی آگهی ----------
  try {
    const result = await transferListingToCrm(guard, listing.id, "create", (fn) => execWithArmToken(guard, fn));
    if (!result.ok) {
      await audit("DIVAR_REGISTER_FAIL", guard.personnelCode, `token=${ad.token} ${(result.error ?? "").slice(0, 100)}`).catch(() => undefined);
      return Response.json(
        {
          ok: false,
          error: result.error ?? "ثبت در سامانه آرم ناموفق بود.",
          steps: result.steps,
          message: result.error ?? "ثبت در سامانه آرم ناموفق بود.",
        },
        { status: (result.error ?? "").includes("کامل نیست") ? 400 : 502 }
      );
    }

    // ثبت موفق — وضعیت آگهی دیوار به registered تغییر می‌کند
    await getMarketRepository().setAdStatus(ad.token, "registered");
    await audit("DIVAR_REGISTER", guard.personnelCode, `token=${ad.token} arm=${result.armPropertyId ?? "?"} listing=${listing.id}`);

    return Response.json({
      ok: true,
      message:
        `آگهی با موفقیت در سامانه آرم ثبت شد. ${result.armPropertyId ? `شناسهٔ آرم: ${result.armPropertyId}. ` : ""}` +
        `فایل در کاشی «آگهی» نیز ثبت شد (گام‌های اجرا در کارت انتقال آن ثبت شده است).`,
      armPropertyId: result.armPropertyId ?? null,
      customerId: result.customerId ?? null,
      customerCreated: result.customerCreated ?? false,
      listingId: listing.id,
      steps: result.steps,
    });
  } catch (err) {
    const e = err instanceof MelkApiError ? err : new MelkApiError("UNKNOWN", (err as Error)?.message ?? "خطای ثبت در آرم", 502, false);
    await audit("DIVAR_REGISTER_FAIL", guard.personnelCode, `token=${ad.token} ${e.message.slice(0, 100)}`).catch(() => undefined);
    return errorResponse(e);
  }
}
