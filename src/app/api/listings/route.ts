/**
 * /api/listings — کاشی «آگهی»
 * ------------------------------------------------------
 * GET  — فهرست فایل‌های آگهی + آمار + فهرست‌های مرجع ۵ گامی (متا)
 * POST — ثبت دستی فایل آگهی (گام‌به‌گام ۵ مرحله‌ای — عین فرم آرم)
 */

import { NextRequest } from "next/server";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";
import { audit } from "@/lib/auth/session";
import { createListing, listListings, importDivarAdAsListing, importRegisteredDivarAds } from "@/lib/listing/store";
import {
  TRADE_TYPES, PROPERTY_TYPES, BUILDING_TYPES, CHANGEABLE_WITH,
  FILE_FINDINGS, FILE_TYPES, USER_SERIOUSNESS, DESIRABILITY_LEVELS, PRICE_EVALUATIONS, SELL_REASONS,
  type ListingUpsertInput,
} from "@/lib/listing/types";

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  try {
    const url = new URL(request.url);
    const source = url.searchParams.get("source");
    const filter: { source?: "manual" | "divar" } | undefined = source === "manual" || source === "divar" ? { source } : undefined;

    // درون‌ریزی خودکار فایل‌های تأییدشده دیوار (بخش «ب») — idempotent
    await importRegisteredDivarAds(guard.personnelCode).catch(() => undefined);

    const { rows, stats } = await listListings(filter);
    return Response.json({
      ok: true,
      rows,
      stats,
      meta: {
        tradeTypes: TRADE_TYPES,
        propertyTypes: PROPERTY_TYPES,
        buildingTypes: BUILDING_TYPES,
        changeWith: CHANGEABLE_WITH,
        fileFindings: FILE_FINDINGS,
        fileTypes: FILE_TYPES,
        userSeriousness: USER_SERIOUSNESS,
        desirabilityLevels: DESIRABILITY_LEVELS,
        priceEvaluations: PRICE_EVALUATIONS,
        sellReasons: SELL_REASONS,
      },
      requirements: {
        armToken: Boolean(guard.armTokens?.accessToken),
        message: guard.armTokens?.accessToken
          ? "توکن سامانه آرم موجود است — انتقال به CRM آماده است."
          : "برای انتقال به CRM باید با «کد پرسنلی + پیامک» وارد شوید (ورود مدیر محلی توکن آرم ندارد).",
      },
    });
  } catch (err) {
    const e = err instanceof MelkApiError ? err : new MelkApiError("UNKNOWN", (err as Error)?.message ?? "خطای سروری", 500, false);
    return errorResponse(e);
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  let body: ListingUpsertInput & { divarToken?: string; importDivar?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "بدنه درخواست نامعتبر است.", 400, false));
  }

  try {
    // درون‌ریزی یک آگهی دیوار خاص (کلید ثبت از فایل‌یابی)
    if (body.importDivar && body.divarToken) {
      const rec = await importDivarAdAsListing(body.divarToken, guard.personnelCode);
      if (!rec) {
        return errorResponse(new MelkApiError("NOT_FOUND", "این آگهی دیوار یافت نشد.", 404, false));
      }
      await audit("LISTING_IMPORT_DIVAR", guard.personnelCode, `token=${body.divarToken}`);
      return Response.json({ ok: true, id: rec.id, message: "فایل از دیوار در کاشی آگهی ثبت شد." });
    }

    // ثبت دستی ۵ گامی
    const result = await createListing(body, guard.personnelCode);
    await audit("LISTING_CREATE", guard.personnelCode, `id=${result.record?.id} ok=${result.ok}`);
    return Response.json({
      ok: true,
      id: result.record?.id,
      complete: result.ok,
      errors: result.errors,
      message: result.ok
        ? "فایل آگهی دستی با هر ۵ گام کامل ثبت شد — آماده انتقال به CRM و اینستاگرام."
        : "فایل آگهی به عنوان پیش‌نویس ثبت شد — گام‌های ناقص را از دکمه «جزییات/تکمیل» ادامه دهید.",
    });
  } catch (err) {
    const e = err instanceof MelkApiError ? err : new MelkApiError("UNKNOWN", (err as Error)?.message ?? "خطای ثبت فایل", 500, false);
    return errorResponse(e);
  }
}
