/**
 * /api/crm/lookup — استخراج زنده اطلاعات از سامانه واقعی ملک تبریز
 * ------------------------------------------------------
 * POST { kind: "property" | "request", code: string }
 *   • kind=property (کدآگهی): زنجیره عین خود سامانه ARM —
 *       properties/info/by-code/{code} → properties/details → properties/owner
 *       خروجی: نام و نام‌خانوادگی مالک (آگهی‌دهنده) + شماره تماس + آدرس ملک
 *   • kind=request (کددرخواست): زنجیره —
 *       requests/list?code=… → requests/details → requests/applicant
 *       خروجی: نام و نام‌خانوادگی درخواست‌دهنده (مشتری) + شماره تماس
 *
 * نکته‌های مهندسی:
 *   • داده هرگز کش نمی‌شود — هر استعلام زنده از arus-api.melketabriz.ir است.
 *   • توکن ARM نشست جاری استفاده می‌شود؛ در صورت انقضا، با refreshToken
 *     تمدید و یک‌بار تلاش مجدد می‌شود (توکن جدید در نشست ذخیره می‌شود).
 *   • هر استعلام در LookupLog ثبت می‌شود (فقط افزودنی — حسابرسی + حافظه ایجنت).
 * GET — تاریخچه استعلام‌های اخیر (برای ایجنت و شفافیت)
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { audit, updateSessionArmTokens } from "@/lib/auth/session";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { getMelkProvider } from "@/lib/melk-api/provider";
import { MelkApiError, type PropertyLookupResult, type RequestLookupResult } from "@/lib/melk-api/types";

/** اجرای یک استعلام با تمدید خودکار توکن ARM در صورت انقضا */
async function withArmRefresh<T>(
  sessionId: string,
  accessToken: string,
  refreshToken: string,
  exec: (token: string) => Promise<T>
): Promise<T> {
  try {
    return await exec(accessToken);
  } catch (err) {
    const e = err as MelkApiError;
    if ((e.code === "UNAUTHORIZED" || e.code === "OTP_INVALID") && refreshToken) {
      const provider = getMelkProvider();
      const refreshed = await provider.refreshArmToken(refreshToken);
      await updateSessionArmTokens(sessionId, refreshed);
      return exec(refreshed.accessToken);
    }
    throw err;
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  // استعلام فقط با نشست دارای توکن ARM ممکن است (مسیر ورود با کد پرسنلی + پیامک)
  if (!guard.armTokens?.accessToken) {
    return errorResponse(
      new MelkApiError(
        "PRECONDITION_FAILED",
        "برای استخراج اطلاعات از سامانه ملک تبریز باید با «کد پرسنلی + پیامک» وارد شوید. ورود مدیر محلی به داده‌های سامانه دسترسی زنده ندارد.",
        412,
        false
      )
    );
  }

  let body: { kind?: string; code?: string };
  try {
    body = (await request.json()) as { kind?: string; code?: string };
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "بدنه درخواست نامعتبر است.", 400, false));
  }

  const kind = body.kind === "request" ? "request" : body.kind === "property" ? "property" : null;
  const code = String(body.code ?? "").trim();

  if (!kind) {
    return errorResponse(new MelkApiError("UNKNOWN", "نوع استعلام باید «property» (کدآگهی) یا «request» (کددرخواست) باشد.", 400, false));
  }
  if (!code || code.length < 2 || code.length > 40) {
    return errorResponse(
      new MelkApiError("UNKNOWN", kind === "property" ? "کدآگهی معتبر (۲ تا ۴۰ نویسه) وارد کنید." : "کددرخواست معتبر (۲ تا ۴۰ نویسه) وارد کنید.", 400, false)
    );
  }
  // پاک‌سازی کد: فقط رقم/حرف لاتین (ارقام فارسی هم پذیرفته و تبدیل می‌شوند)
  const normalizedCode = code.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[^A-Za-z0-9-]/g, "");
  if (!normalizedCode) {
    return errorResponse(new MelkApiError("UNKNOWN", "کد واردشده معتبر نیست.", 400, false));
  }

  const provider = getMelkProvider();
  const accessToken = guard.armTokens.accessToken;
  const refreshToken = guard.armTokens.refreshToken ?? "";

  try {
    if (kind === "property") {
      const result = await withArmRefresh<PropertyLookupResult>(
        guard.sessionId,
        accessToken,
        refreshToken,
        (t) => provider.lookupPropertyByCode(t, normalizedCode)
      );

      // ثبت فقط افزودنی استعلام — حسابرسی + حافظه ایجنت
      await db.lookupLog.create({
        data: {
          kind: "PROPERTY",
          code: normalizedCode,
          found: true,
          personName: result.owner?.fullName ?? null,
          personMobile: result.owner?.mobile ?? null,
          address: result.address && result.address !== "—" ? result.address : null,
          actorCode: guard.personnelCode,
        },
      });
      await audit("LOOKUP_PROPERTY", guard.personnelCode, `کدآگهی ${normalizedCode}`);

      return Response.json({
        ok: true,
        kind: "property",
        result,
        warnings: [
          ...(result.owner ? [] : ["اطلاعات تماس مالک برای این آگهی در دسترس نیست (مجوز یا ثبت ناقص در سامانه)."]),
          ...(result.address === "—" ? ["آدرس ملک برای این آگهی ثبت نشده است."] : []),
        ],
      });
    }

    const result = await withArmRefresh<RequestLookupResult>(
      guard.sessionId,
      accessToken,
      refreshToken,
      (t) => provider.lookupRequestByCode(t, normalizedCode)
    );

    await db.lookupLog.create({
      data: {
        kind: "REQUEST",
        code: normalizedCode,
        found: true,
        personName: result.applicant?.fullName ?? null,
        personMobile: result.applicant?.mobile ?? null,
        actorCode: guard.personnelCode,
      },
    });
    await audit("LOOKUP_REQUEST", guard.personnelCode, `کددرخواست ${normalizedCode}`);

    return Response.json({
      ok: true,
      kind: "request",
      result,
      warnings: [
        ...(result.applicant ? [] : ["اطلاعات تماس درخواست‌دهنده برای این درخواست در دسترس نیست (مجوز یا ثبت ناقص در سامانه)."]),
      ],
    });
  } catch (err) {
    const e = err instanceof MelkApiError ? err : new MelkApiError("UNKNOWN", (err as Error)?.message ?? "خطای نامشخص", 500, false);

    // ثبت استعلام ناموفق — فقط افزودنی
    await db.lookupLog
      .create({
        data: {
          kind: kind === "property" ? "PROPERTY" : "REQUEST",
          code: normalizedCode,
          found: false,
          actorCode: guard.personnelCode,
          errorNote: e.message.slice(0, 300),
        },
      })
      .catch(() => undefined);

    return errorResponse(e);
  }
}

/** GET — تاریخچه استعلام‌های اخیر (برای ایجنت و شفافیت) */
export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit") ?? 50), 1), 200);
  const kind = request.nextUrl.searchParams.get("kind");

  const where = kind === "property" || kind === "request" ? { kind: kind.toUpperCase() } : {};

  const [rows, total] = await Promise.all([
    db.lookupLog.findMany({ where, orderBy: { createdAt: "desc" }, take: limit }),
    db.lookupLog.count({ where }),
  ]);

  return Response.json({ ok: true, rows, total });
}
