/**
 * /api/requests — کاشی «درخواست ملک»
 * ------------------------------------------------------
 * GET  — فهرست درخواست‌ها + آمار + فهرست‌های مرجع ۴ گامی (متا) + مدیریت مشتریان
 * POST — ثبت درخواست (گام‌به‌گام ۴ مرحله‌ای — عین فرم آرم)
 *        الف: ثبت دستی (مالک حضوری) → ذخیره محلی
 *        ب: ثبت اتوماتیک (autoRegister=true) → بلافاصله ثبت گام‌به‌گام در سامانه آرم
 */

import { NextRequest } from "next/server";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";
import { audit } from "@/lib/auth/session";
// P6.5-04-i — دامنه فقط از helper مرکزی (تک‌نقطه تصمیم)
import { ownerLoginPath, personalScopeWhere, resolveEntityAccess } from "@/lib/access/scope";
import { witnessScopedRead } from "@/lib/audit";
import { createRequest, listRequests } from "@/lib/request/store";
import { registerRequestToArm } from "@/lib/request/arm-register";
import { execWithArmToken } from "@/lib/listing/crm-transfer";
import { buildCustomerManagement } from "@/lib/request/customer-mgmt";
import {
  TRADE_TYPES, BUILDING_TYPES, PROPERTY_TYPES, PAYMENT_METHODS, USER_SERIOUSNESS,
  type RequestUpsertInput,
} from "@/lib/request/types";
import { IRAN_COUNTRY_ID, AZ_SHARGHI_STATE_ID, TABRIZ_CITY } from "@/lib/listing/crm-transfer";

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  try {
    const url = new URL(request.url);
    const source = url.searchParams.get("source");
    const withCustomers = url.searchParams.get("customers") === "1";
    const filter: { source?: "manual" | "auto" } | undefined = source === "manual" || source === "auto" ? { source } : undefined;

    // P6.5-04-i — دامنه از helper مرکزی: مالک ⇒ صفر فیلتر (همهٔ درخواست‌ها)؛
    // مشاور ⇒ فقط درخواست‌های خودش (ماتریس §۵.۳)؛ DENY_ALL ⇒ fail-closed
    const access = resolveEntityAccess(guard, "request");
    const scopeWhere = personalScopeWhere(access);
    if (scopeWhere === null) {
      await witnessScopedRead(guard, "request", 0, access.isOwnerRead, ownerLoginPath(guard));
      return Response.json({ ok: true, rows: [], stats: { total: 0, manual: 0, auto: 0, ready: 0, draft: 0, armRegistered: 0, armPending: 0, eventsTotal: 0, eventsThisWeek: 0, newThisWeek: 0 }, meta: { tradeTypes: TRADE_TYPES, buildingTypes: BUILDING_TYPES, propertyTypes: PROPERTY_TYPES, paymentMethods: PAYMENT_METHODS, userSeriousness: USER_SERIOUSNESS, geo: { countryId: IRAN_COUNTRY_ID, stateId: AZ_SHARGHI_STATE_ID, cityId: TABRIZ_CITY } }, requirements: { armToken: Boolean(guard.armTokens?.accessToken), message: guard.armTokens?.accessToken ? "توکن سامانه آرم موجود است — ثبت گام‌به‌گام در آرم آماده است." : "برای ثبت در سامانه آرم باید با «کد پرسنلی + پیامک» وارد شوید (ورود مدیر محلی توکن آرم ندارد)." } });
    }
    const { rows, stats } = await listRequests(filter, scopeWhere ?? undefined);
    await witnessScopedRead(guard, "request", rows.length, access.isOwnerRead, ownerLoginPath(guard));

    // مدیریت مشتریان (شاهکار ایجنت) — فقط هنگام درخواست صریح (تب مشتریان)
    const customers = withCustomers ? await buildCustomerManagement() : null;

    return Response.json({
      ok: true,
      rows,
      stats,
      ...(customers ? { customers: customers.customers, customerStats: customers.stats } : {}),
      meta: {
        tradeTypes: TRADE_TYPES,
        buildingTypes: BUILDING_TYPES,
        propertyTypes: PROPERTY_TYPES,
        paymentMethods: PAYMENT_METHODS,
        userSeriousness: USER_SERIOUSNESS,
        geo: { countryId: IRAN_COUNTRY_ID, stateId: AZ_SHARGHI_STATE_ID, cityId: TABRIZ_CITY },
      },
      requirements: {
        armToken: Boolean(guard.armTokens?.accessToken),
        message: guard.armTokens?.accessToken
          ? "توکن سامانه آرم موجود است — ثبت گام‌به‌گام در آرم آماده است."
          : "برای ثبت در سامانه آرم باید با «کد پرسنلی + پیامک» وارد شوید (ورود مدیر محلی توکن آرم ندارد).",
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

  let body: RequestUpsertInput & { autoRegister?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "بدنه درخواست نامعتبر است.", 400, false));
  }

  try {
    // پیش‌فرض‌های جغرافیایی عین خود سامانه (ایران/آذربایجان شرقی/تبریز)
    const input: RequestUpsertInput = {
      ...body,
      countryId: body.countryId ?? IRAN_COUNTRY_ID,
      stateId: body.stateId ?? AZ_SHARGHI_STATE_ID,
      cityId: body.cityId ?? TABRIZ_CITY,
    };

    // الف: ثبت دستی (مالک حضوری) — ذخیره محلی با همان ۴ گام کامل
    const result = await createRequest(input, guard.personnelCode);

    // ب: ثبت اتوماتیک — پس از تکمیل فرم، ثبت مستقیم و گام‌به‌گام در سامانه آرم
    let arm: Awaited<ReturnType<typeof registerRequestToArm>> | null = null;
    if (body.autoRegister && result.ok && result.record) {
      if (!guard.armTokens?.accessToken) {
        await audit("REQUEST_CREATE", guard.personnelCode, `id=${result.record.id} auto=notoken`);
        return Response.json({
          ok: true,
          id: result.record.id,
          complete: true,
          errors: [],
          arm: null,
          message:
            "درخواست محلی ثبت شد، اما ثبت اتوماتیک در سامانه آرم نیاز به «کد پرسنلی + پیامک» دارد — از کلید «ثبت در سامانه ARM» روی کارت پس از ورود استفاده کنید.",
        });
      }
      arm = await registerRequestToArm(guard, result.record.id, "create", (fn) => execWithArmToken(guard, fn));
    }

    await audit("REQUEST_CREATE", guard.personnelCode, `id=${result.record?.id} ok=${result.ok} auto=${body.autoRegister ? 1 : 0} armOk=${arm?.ok ?? -1}`);

    return Response.json({
      ok: true,
      id: result.record?.id,
      complete: result.ok,
      errors: result.errors,
      arm: arm ? { ok: arm.ok, steps: arm.steps, armRequestId: arm.armRequestId ?? null, error: arm.error ?? null } : null,
      message: arm
        ? arm.ok
          ? "درخواست ثبت شد و گام‌به‌گام (مثل کاربر عادی) در سامانه آرم ملک تبریز ثبت گردید."
          : `درخواست محلی ثبت شد؛ ثبت در سامانه آرم ناموفق بود: ${arm.error ?? ""}`
        : result.ok
          ? "درخواست با هر ۴ گام کامل ثبت شد — آماده ثبت در سامانه آرم و مدیریت رویدادها."
          : "درخواست به‌عنوان پیش‌نویس ثبت شد — گام‌های ناقص را از کلید «ویرایش» ادامه دهید.",
    });
  } catch (err) {
    const e = err instanceof MelkApiError ? err : new MelkApiError("UNKNOWN", (err as Error)?.message ?? "خطای ثبت درخواست", 500, false);
    return errorResponse(e);
  }
}
