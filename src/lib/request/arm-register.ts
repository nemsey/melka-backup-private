/**
 * مجری «ثبت در سامانه ARM» — ثبت گام‌به‌گام درخواست ملک در سامانه ARM ملک تبریز
 * ------------------------------------------------------
 * عین فرآیند ثبت یک کاربر عادی در خود سامانه (new-request-page) — هیچ گامی دور نمی‌شود:
 *   گام ۰  اعتبارسنجی کامل ۴ گام (همان zod خود سامانه)
 *   گام ۱  اطلاعات مشتری: جستجوی کاربر با موبایل (users/info/mobile-number) و در صورت نبود،
 *          ایجاد کاربر (users/create) — موبایل بدون صفر، عین خود سامانه
 *   گام ۲  اطلاعات مکانی درخواست: شناسه‌های رسمی کشور/استان/شهر + مناطق و محله‌ها (areaAndLine)
 *   گام ۳  جزییات درخواست: شناسه‌های نوع معامله/کاربری/ملک + فرم پویای دسته‌بندی
 *   گام ۴  اطلاعات تکمیلی: نحوه پرداخت ({label,value} → value) + جدیت + توضیحات مشاور
 *   ثبت    POST requests + addToURL ["create"] (نهایی) یا ["create","draft"] (پیش‌نویس)
 *   ویرایش PUT requests/update/{id} — عین edit-request-page خود سامانه
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
import { validateRequest, buildCreatePayload, parseJson, tradeTypeRequestLabel, buildingTypeLabel, propertyTypeLabel, paymentMethodLabel, seriousnessLabel } from "./types";
import { IRAN_COUNTRY_ID, AZ_SHARGHI_STATE_ID, TABRIZ_CITY, toArmMobile, splitName, execWithArmToken } from "@/lib/listing/crm-transfer";
import { jalaliToDate } from "@/lib/jalali";

// ===================== گزارش گام‌به‌گام =====================

export interface RegistrationStep {
  key: string;
  title: string;
  status: "pending" | "done" | "failed" | "skipped";
  detail: string;
}

export interface RegistrationResult {
  ok: boolean;
  mode: "create" | "draft" | "update";
  steps: RegistrationStep[];
  armRequestId?: string;
  armMessage?: string;
  customerId?: string;
  customerCreated?: boolean;
  error?: string;
}

// ===================== گام ۱: جستجو/ایجاد مشتری در آرم =====================

async function resolveCustomer(
  fullName: string,
  mobile: string,
  exec: <T>(fn: (token: string) => Promise<T>) => Promise<T>
): Promise<{ customerId: string; created: boolean; name?: string; step: RegistrationStep }> {
  const armMobile = toArmMobile(mobile);

  // ۱.جستجو — GET users/info/mobile-number/{mobile} (عین owner-info-step خود سامانه)
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
        title: "گام ۱ — اطلاعات مشتری: کاربر موجود در آرم",
        status: "done",
        detail: `درخواست‌دهنده «${name || fullName}» با شماره ${armMobile} در سامانه آرم یافت شد و به این درخواست متصل شد.`,
      },
    };
  }

  // ۲.ایجاد — POST users/create (عین addToURL خود سامانه: firstName + lastName + mobileNumber)
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
    throw new MelkApiError("UNKNOWN", "ایجاد کاربر مشتری در سامانه آرم ناموفق بود.", 502, false);
  }
  return {
    customerId: newId,
    created: true,
    step: {
      key: "customer",
      title: "گام ۱ — اطلاعات مشتری: ایجاد کاربر جدید در آرم",
      status: "done",
      detail: `درخواست‌دهنده «${fullName}» با شماره ${armMobile} در سامانه آرم ایجاد شد (نام: ${firstName} / نام‌خانوادگی: ${lastName}).`,
    },
  };
}

// ===================== اجرای کامل ثبت درخواست =====================

/**
 * ثبت گام‌به‌گام درخواست در سامانه ARM — مثل یک کاربر عادی، بدون دور زدن هیچ گامی.
 * mode="create" ثبت نهایی، "draft" پیش‌نویس (عین دکمه «پیش نویس» خود سامانه)، "update" ویرایش رکورد آرم.
 */
export async function registerRequestToArm(
  guard: SessionContext,
  requestId: string,
  mode: "create" | "draft" | "update",
  exec: <T>(fn: (token: string) => Promise<T>) => Promise<T>
): Promise<RegistrationResult> {
  const steps: RegistrationStep[] = [];
  const record = await db.requestRecord.findUnique({ where: { id: requestId } });
  if (!record) {
    return { ok: false, mode, steps, error: "درخواست یافت نشد." };
  }

  const inputs = parseJson<Record<string, unknown>>(record.inputsJson, {});
  const areaIds = parseJson<string[]>(record.areaIdsJson, []);
  const areaNames = parseJson<string[]>(record.areaNamesJson, []);
  const lineIds = parseJson<string[]>(record.lineIdsJson, []);
  const lineNames = parseJson<string[]>(record.lineNamesJson, []);

  // ---------- گام ۰: اعتبارسنجی ۴ گامی ----------
  const v = validateRequest({
    customerName: record.customerName ?? undefined,
    customerMobile: record.customerMobile ?? undefined,
    cityId: record.cityId ?? undefined,
    areaIds,
    tradeTypeId: record.tradeTypeId ?? undefined,
    buildingTypeId: record.buildingTypeId ?? undefined,
    propertyTypeId: record.propertyTypeId ?? undefined,
    userPaymentMethod: record.userPaymentMethod ?? undefined,
    userSeriousity: record.userSeriousity ?? undefined,
  });
  if (!v.ok) {
    steps.push({
      key: "validate",
      title: "گام ۰ — اعتبارسنجی اطلاعات ۴ گامی",
      status: "failed",
      detail: `اطلاعات ناقص است: ${v.errors.map((e) => e.message).join("؛ ")}`,
    });
    return { ok: false, mode, steps, error: "اطلاعات ۴ گامی کامل نیست — ابتدا درخواست را کامل کنید." };
  }
  steps.push({
    key: "validate",
    title: "گام ۰ — اعتبارسنجی اطلاعات ۴ گامی",
    status: "done",
    detail: "هر ۴ گام کامل است: اطلاعات مشتری، اطلاعات مکانی درخواست، جزییات درخواست و اطلاعات تکمیلی.",
  });

  // ---------- گام ۱: جستجو/ایجاد مشتری ----------
  let customerId = record.armCustomerId ?? "";
  let customerCreated = false;
  if (customerId && mode === "update") {
    steps.push({
      key: "customer",
      title: "گام ۱ — اطلاعات مشتری: کاربر پیش‌تر متصل است",
      status: "done",
      detail: `کاربر آرم ${customerId} از ثبت قبلی به یاد سپرده شده است.`,
    });
  } else if (customerId) {
    // در ثبت جدید، مشتری ممکن است از قبل (جستجوی زنده فرم) متصل شده باشد
    steps.push({
      key: "customer",
      title: "گام ۱ — اطلاعات مشتری: کاربر متصل‌شده از فرم",
      status: "done",
      detail: `مشتری «${record.customerName}» پیش‌تر در جستجوی زنده فرم به کاربر آرم ${customerId} متصل شده است.`,
    });
  } else {
    try {
      const res = await resolveCustomer(record.customerName ?? "", record.customerMobile ?? "", exec);
      customerId = res.customerId;
      customerCreated = res.created;
      steps.push(res.step);
    } catch (err) {
      const e = err instanceof MelkApiError ? err : new MelkApiError("UNKNOWN", (err as Error)?.message ?? "خطای نامشخص", 502, false);
      steps.push({
        key: "customer",
        title: "گام ۱ — اطلاعات مشتری: جستجو/ایجاد کاربر در آرم",
        status: "failed",
        detail: e.message,
      });
      return { ok: false, mode, steps, error: e.message, customerId };
    }
  }

  // ---------- گام ۲: اطلاعات مکانی درخواست ----------
  steps.push({
    key: "location",
    title: "گام ۲ — اطلاعات مکانی درخواست",
    status: "done",
    detail: `ایران ← آذربایجان شرقی ← تبریز ← ${areaNames.length} منطقه (${areaNames.slice(0, 3).join("، ")}${areaNames.length > 3 ? " و…" : ""})${lineNames.length > 0 ? ` ← ${lineNames.length} محله` : ""} — شناسه‌های رسمی منطقه‌بندی آرم ارسال می‌شود (عین areaAndLine خود سامانه).`,
  });

  // ---------- گام ۳: جزییات درخواست ----------
  steps.push({
    key: "details",
    title: "گام ۳ — جزییات درخواست",
    status: "done",
    detail: `نوع معامله «${tradeTypeRequestLabel(record.tradeTypeId)}»، نوع کاربری «${buildingTypeLabel(record.buildingTypeId)}»، نوع ملک «${propertyTypeLabel(record.propertyTypeId, record.buildingTypeId)}»${Object.keys(inputs).length > 0 ? `، فرم دسته‌بندی با ${Object.keys(inputs).length} فیلد (متراژ/قیمت از-تا، امکانات…)` : ""}${record.customerDescription ? "، همراه توضیحات مشتری" : ""}.`,
  });

  // ---------- گام ۴: اطلاعات تکمیلی درخواست ----------
  steps.push({
    key: "supplementary",
    title: "گام ۴ — اطلاعات تکمیلی درخواست",
    status: "done",
    detail: `نحوه پرداخت (پول مشتری) «${paymentMethodLabel(record.userPaymentMethod)}»، جدیت مشتری «${seriousnessLabel(record.userSeriousity)}»${record.realtorDescription ? "، همراه توضیحات مشاور" : ""} — عین گام ۴ خود سامانه.`,
  });

  // ---------- بدنه نهایی (عین سریال‌سازی خود سامانه) ----------
  const payload = buildCreatePayload({
    customerId,
    countryId: record.countryId ?? IRAN_COUNTRY_ID,
    stateId: record.stateId ?? AZ_SHARGHI_STATE_ID,
    cityId: record.cityId ?? TABRIZ_CITY,
    areaIds,
    lineIds,
    tradeTypeId: record.tradeTypeId ?? "",
    buildingTypeId: record.buildingTypeId ?? "",
    propertyTypeId: record.propertyTypeId ?? "",
    inputs,
    customerDescription: record.customerDescription,
    userPaymentMethod: record.userPaymentMethod ?? "",
    userSeriousity: record.userSeriousity ?? "",
    realtorDescription: record.realtorDescription,
  });

  // ---------- ثبت / ویرایش ----------
  try {
    const isUpdate = mode === "update" && Boolean(record.armRequestId);
    const result = await exec<{ _id?: string; id?: string }>((token) =>
      armCall<{ _id?: string; id?: string }>({
        method: isUpdate ? "PUT" : "POST",
        path: isUpdate
          ? `requests/update/${encodeURIComponent(record.armRequestId as string)}`
          : mode === "draft"
            ? "requests/create/draft"
            : "requests/create",
        baseUrl: getMelkApiConfig().armApiBase,
        token,
        body: payload,
        timeoutMs: getMelkApiConfig().timeoutMs,
        maxRetries: 1,
      }).then((r) => r.data)
    );
    const armRequestId = result?._id ?? result?.id ?? (isUpdate ? record.armRequestId ?? "" : "");
    steps.push({
      key: "submit",
      title: isUpdate ? "به‌روزرسانی درخواست در سامانه آرم" : mode === "draft" ? "ثبت پیش‌نویس درخواست در سامانه آرم" : "ثبت نهایی درخواست در سامانه آرم",
      status: "done",
      detail: armRequestId
        ? `درخواست با شناسه ${armRequestId} در سامانه آرم ثبت شد.`
        : "درخواست در سامانه آرم ثبت شد.",
    });

    await db.requestRecord.update({
      where: { id: requestId },
      data: {
        armCustomerId: customerId,
        armRequestId: armRequestId || record.armRequestId,
        armRegisteredAt: new Date(),
        armRegistrationJson: JSON.stringify({ steps, mode, at: new Date().toISOString(), customerId, customerCreated }),
        status: "ready",
      },
    });
    return { ok: true, mode, steps, armRequestId, customerId, customerCreated };
  } catch (err) {
    const e = err instanceof MelkApiError ? err : new MelkApiError("UNKNOWN", (err as Error)?.message ?? "خطای ثبت در آرم", 502, false);
    steps.push({
      key: "submit",
      title: mode === "update" ? "به‌روزرسانی در سامانه آرم" : mode === "draft" ? "ثبت پیش‌نویس در سامانه آرم" : "ثبت نهایی درخواست در سامانه آرم",
      status: "failed",
      detail: e.message,
    });
    await db.requestRecord
      .update({
        where: { id: requestId },
        data: { armRegistrationJson: JSON.stringify({ steps, mode, at: new Date().toISOString(), customerId, failed: true, error: e.message }) },
      })
      .catch(() => undefined);
    return { ok: false, mode, steps, error: e.message, customerId };
  }
}

export { execWithArmToken };

// ===================== همگام‌سازی رویداد با آرم (کلید «ثبت رویداد») =====================

/**
 * ثبت رویداد در سامانه آرم — عین request-events/create خود سامانه:
 * بدنه: {eventType, requestProperty, date?, hour?, property?, message?}
 * تاریخ/ساعت جلالی فرم به ISO تبدیل می‌شوند (عین Date-picker خود سامانه).
 */
export async function syncEventToArm(
  guard: SessionContext,
  eventInput: {
    requestId: string;
    eventTypeId: string;
    date?: string | null;
    hour?: string | null;
    propertyCode?: string | null;
    message?: string | null;
  },
  exec: <T>(fn: (token: string) => Promise<T>) => Promise<T>
): Promise<{ ok: boolean; armEventId?: string; armPropertyId?: string; propertyTitle?: string; error?: string }> {
  const record = await db.requestRecord.findUnique({ where: { id: eventInput.requestId } });
  if (!record) return { ok: false, error: "درخواست یافت نشد." };
  if (!record.armRequestId) {
    return { ok: false, error: "این درخواست هنوز در سامانه آرم ثبت نشده است — ابتدا با کلید «ثبت در سامانه ARM» ثبتش کنید." };
  }

  // کدآگهی → شناسه آگهی آرم (عین جستجوی زنده فرم رویداد خود سامانه: properties/info/by-code/{code}/title)
  let armPropertyId: string | undefined;
  let propertyTitle: string | undefined;
  if (eventInput.propertyCode && eventInput.propertyCode.trim()) {
    const found = await exec<{ _id?: string; title?: string } | null>((token) =>
      armCall<{ _id?: string; title?: string }>({
        method: "GET",
        path: `properties/info/by-code/${encodeURIComponent(eventInput.propertyCode!.trim())}/title`,
        baseUrl: getMelkApiConfig().armApiBase,
        token,
        timeoutMs: getMelkApiConfig().timeoutMs,
        maxRetries: 1,
      }).then((r) => r.data).catch(() => null)
    );
    if (!found?._id) {
      return { ok: false, error: `آگهی با کد «${eventInput.propertyCode}» در سامانه آرم یافت نشد — کد را بررسی کنید.` };
    }
    armPropertyId = found._id;
    propertyTitle = found.title;
  }

  // تاریخ ISO («2026-09-15…») یا جلالی («1405/06/24») → Date (عین Date-picker خود سامانه)
  const parseDate = (s: string): Date | null => {
    const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (iso) {
      const d = new Date(`${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}T00:00:00`);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    const m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
    if (m) return jalaliToDate(Number(m[1]), Number(m[2]), Number(m[3]));
    return null;
  };

  const body: Record<string, unknown> = {
    eventType: eventInput.eventTypeId,
    requestProperty: record.armRequestId,
  };
  if (eventInput.date) {
    const d = parseDate(eventInput.date);
    if (d) body.date = d.toISOString();
  }
  if (eventInput.hour && eventInput.date) {
    const d = parseDate(eventInput.date);
    const hm = eventInput.hour.match(/^(\d{1,2}):(\d{2})$/);
    if (d && hm) {
      d.setHours(Number(hm[1]), Number(hm[2]), 0, 0);
      body.hour = d.toISOString();
    }
  }
  if (armPropertyId) body.property = armPropertyId;
  if (eventInput.message && eventInput.message.trim()) body.message = eventInput.message.trim();

  try {
    const result = await exec<{ _id?: string; id?: string }>((token) =>
      armCall<{ _id?: string; id?: string }>({
        method: "POST",
        path: "request-events/create",
        baseUrl: getMelkApiConfig().armApiBase,
        token,
        body,
        timeoutMs: getMelkApiConfig().timeoutMs,
        maxRetries: 1,
      }).then((r) => r.data)
    );
    return { ok: true, armEventId: result?._id ?? result?.id, armPropertyId, propertyTitle };
  } catch (err) {
    const e = err instanceof MelkApiError ? err : new MelkApiError("UNKNOWN", (err as Error)?.message ?? "خطای ثبت رویداد در آرم", 502, false);
    return { ok: false, armPropertyId, propertyTitle, error: e.message };
  }
}

// ===================== فهرست انواع رویداد (توکن‌دار — request-event-types) =====================

export interface ArmEventType {
  id: string;
  name: string;
  needTime?: boolean;
  needHour?: boolean;
  needMessage?: boolean;
  needProperty?: boolean;
}

/** دریافت انواع رویداد از خود سامانه — نیازمند توکن آرم (همان صفحه رویداد خود سامانه) */
export async function fetchEventTypes(
  exec: <T>(fn: (token: string) => Promise<T>) => Promise<T>
): Promise<{ types: ArmEventType[]; live: boolean; error?: string }> {
  try {
    const data = await exec<{ list?: ArmEventType[] } | ArmEventType[] | null>((token) =>
      armCall<{ list?: ArmEventType[] } | ArmEventType[]>({
        method: "GET",
        path: "request-event-types/list",
        baseUrl: getMelkApiConfig().armApiBase,
        token,
        timeoutMs: getMelkApiConfig().timeoutMs,
        maxRetries: 1,
      }).then((r) => r.data)
    );
    const list = Array.isArray(data) ? data : data?.list ?? [];
    if (list.length > 0) return { types: list, live: true };
    return { types: [], live: true, error: "سامانه آرم فهرست انواع رویداد را خالی برگرداند." };
  } catch (err) {
    const e = err as MelkApiError;
    return { types: [], live: false, error: e.message };
  }
}
