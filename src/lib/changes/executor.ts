/**
 * executor.ts — کاشی «تغییرات» · گام دوم (DIR-CHANGES-TILE-001)
 * ---------------------------------------------------------------------------
 * مجری دو قابلیت کاشی — هر دو با شناخت کامل گام اول (گزارش dir-reg-req-099-001):
 *
 *   قابلیت ۱ — ایجاد و تغییر «کدآگهی» (سامانه ARM ملک تبریز):
 *     · جستجو با کدآگهی (زنده: properties/info/by-code + جزئیات + مالک)
 *     · ثبت کدآگهی جدید — عین فرم ۵ گامی خود سامانه (validateListing →
 *       transferListingToCrm → properties/create) — مسیر زنده و اثبات‌شده
 *     · تغییر در کدآگهی موجود — PUT properties/update/{id} با بازسازی کامل
 *       بدنهٔ ویرایش عین edit-page خود سامانه (الگوی تأییدشدهٔ requests/update)
 *
 *   قابلیت ۲ — ایجاد و تغییر «کد درخواست» (سامانه ARM ملک تبریز):
 *     · جستجو با کد درخواست (محلی + زنده: requests/list/details/history/applicant)
 *     · ثبت کد درخواست جدید — عین ۰۹۹: اعتبارسنجی ۴ گامی → مشتری → مکان →
 *       جزییات → تکمیلی → POST requests/create → کد از فهرست زنده
 *     · اصلاح تاریخ تاریخچهٔ تغییرات — شاهکار ۰۹۹: PUT requests/update/{id}
 *       با آرایهٔ status با همان شناسه‌های عین و تاریخ هدف
 *     · ثبت رویداد تاریخچه با تاریخ دقیق (اقدام/توسط/تاریخ جلالی + ساعت)
 *
 * حمل‌ونقل: همهٔ تماس‌ها از طریق armCall — در حالت رلهٔ ترموکس خودکار به
 * صف رله با اولویت کاشی (۱۰ در حالت تمام‌ظرفیت) می‌روند (relay.ts · گام سوم).
 * توکن: resolveBestArmToken — تازه‌ترین توکن زندهٔ مالک (نشست/خزانه · عین ۰۹۹).
 */

import { db } from "@/lib/db";
import { armCall } from "@/lib/melk-api/client";
import { getMelkApiConfig } from "@/lib/melk-api/config";
import { resolveBestArmToken } from "@/lib/melk-api/arm-token-resolver";
import type { SessionContext } from "@/lib/auth/session";
import { audit } from "@/lib/auth/session";
import { isoToJalaliString } from "@/lib/jalali";
import { TABRIZ_AREAS, ALL_LINES } from "@/lib/divar/tabriz-locations";
import { transferListingToCrm, buildCreatePayload as buildListingPayload } from "@/lib/listing/crm-transfer";
import { createListing } from "@/lib/listing/store";
import type { ListingUpsertInput } from "@/lib/listing/types";
import { createRequest, createRequestEvent } from "@/lib/request/store";
import { registerRequestToArm, syncEventToArm } from "@/lib/request/arm-register";
import { buildCreatePayload as buildRequestPayload, parseJson } from "@/lib/request/types";
import {
  ARM_PATHS,
  CHANGES_TIMEOUT_MS,
  HISTORY_ACTION_TYPES,
  HISTORY_BY_DEFAULT,
  LOCATION_IDS,
  OWNER_IDENTITY,
  STANDARD_DEFAULTS,
  isoToJalaliHour,
  jalaliHourToIsoUtc,
  jalaliToIsoDate,
} from "./variables";

/* ═══════════════════ گزارش گام‌به‌گام (عین ۰۹۹) ═══════════════════ */

export interface ChangesStep {
  key: string;
  title: string;
  status: "pending" | "done" | "failed" | "skipped";
  detail: string;
}

export interface ChangesReport {
  ok: boolean;
  operation: string;
  steps: ChangesStep[];
  durationMs: number;
  /** داده‌های کلیدی نتیجه (کد/شناسه/تاریخ) */
  result?: Record<string, unknown>;
  error?: string;
}

/* ═══════════════════ توکن مالک + گارد اجرا (عین ۰۹۹) ═══════════════════ */

export interface OwnerExec {
  token: string;
  expIso: string | null;
  source: "session" | "vault";
  guard: SessionContext;
  exec: <T>(fn: (token: string) => Promise<T>) => Promise<T>;
}

/** حل‌کنندهٔ توکن مالک — تازه‌ترین توکن زنده از نشست‌ها/خزانه (عین ۰۹۹) */
export async function resolveOwnerExec(): Promise<OwnerExec> {
  const resolved = await resolveBestArmToken(db);
  if (!resolved || !resolved.token) {
    throw new Error("هیچ توکن ARM در دسترس نیست — اتصال به ملک تبریز در تنظیمات برقرار نیست.");
  }
  const guard = {
    sessionId: "changes-tile",
    personnelCode: OWNER_IDENTITY.personnelCode,
    displayName: OWNER_IDENTITY.fullName,
    role: "OWNER" as const,
    expiresAt: new Date(Date.now() + 3600_000),
    armTokens: { accessToken: resolved.token, refreshToken: "", userType: "realtor" as const },
  };
  return {
    token: resolved.token,
    expIso: resolved.expMs ? new Date(resolved.expMs).toISOString() : null,
    source: resolved.source,
    guard: guard as unknown as SessionContext,
    exec: <T>(fn: (token: string) => Promise<T>) => fn(resolved.token),
  };
}

/* ═══════════════════ کمک‌های ARM ═══════════════════ */

function call<T>(oe: OwnerExec, method: "GET" | "POST" | "PUT", path: string, opts: { body?: unknown; query?: Record<string, string>; timeoutMs?: number } = {}): Promise<{ data: T; message?: string }> {
  return armCall<T>({
    method,
    path,
    baseUrl: getMelkApiConfig().armApiBase,
    token: oe.token,
    body: opts.body,
    query: opts.query,
    timeoutMs: opts.timeoutMs ?? CHANGES_TIMEOUT_MS.lookup,
    maxRetries: 1,
  });
}

type ArmRow = Record<string, any>;

/** جستجوی ردیف درخواست در فهرست زندهٔ ARM (تازه‌ترین صفحه‌ها — عین ۰۹۹) */
async function scanRequestRow(oe: OwnerExec, code: string, maxPages = 8): Promise<ArmRow | null> {
  for (let page = 1; page <= maxPages; page++) {
    const res = await call<ArmRow>(oe, "GET", ARM_PATHS.requestsList, {
      query: { page: String(page), limit: "20" },
      timeoutMs: CHANGES_TIMEOUT_MS.lookup,
    }).catch(() => null);
    const list = (res?.data?.list ?? []) as ArmRow[];
    const row = list.find((r) => String(r.code ?? r.requestCode ?? "") === code);
    if (row) return row;
  }
  return null;
}

/** جستجوی ردیف آگهی در فهرست زندهٔ ARM */
async function scanPropertyRow(oe: OwnerExec, armPropertyId: string, maxPages = 8): Promise<ArmRow | null> {
  for (let page = 1; page <= maxPages; page++) {
    const res = await call<ArmRow>(oe, "GET", ARM_PATHS.propertiesList, {
      query: { page: String(page), limit: "20" },
      timeoutMs: CHANGES_TIMEOUT_MS.lookup,
    }).catch(() => null);
    const list = (res?.data?.list ?? []) as ArmRow[];
    const row = list.find((r) => String(r._id ?? "") === armPropertyId);
    if (row) return row;
  }
  return null;
}

/** تاریخچهٔ زندهٔ تغییرات درخواست — منبع کشف‌شدهٔ ۰۹۹ */
async function fetchRequestHistory(oe: OwnerExec, armRequestId: string): Promise<ArmRow[]> {
  const res = await call<ArmRow>(oe, "GET", ARM_PATHS.requestHistory(armRequestId), { timeoutMs: CHANGES_TIMEOUT_MS.lookup });
  return ((res.data as any)?.list ?? []) as ArmRow[];
}

/* ═══════════════════════════════════════════════════════════════════
 * قابلیت ۲ — کد درخواست
 * ═══════════════════════════════════════════════════════════════════ */

/* ---------- جستجو ---------- */

export interface RequestLookupResult {
  ok: boolean;
  code: string;
  local: {
    id: string;
    requestCode: string | null;
    armRequestId: string | null;
    customerName: string | null;
    customerMobile: string | null;
    actorName: string | null;
    title: string | null;
    status: string;
    source: string;
    events: Array<{ name: string; date: string | null; hour: string | null; display: string | null }>;
  } | null;
  arm: {
    armRequestId: string;
    title: string | null;
    relatedRealtor: string | null;
    relatedCustomer: string | null;
    createdAt: string | null;
    code: string;
    history: Array<{ id: string; action: string | null; actionTypeId: string | null; realtor: string | null; date: string | null; display: string | null }>;
  } | null;
  error?: string;
}

/** جستجوی کد درخواست — محلی + زنده (فهرست/تاریخچه) */
export async function lookupRequestByCode(code: string): Promise<RequestLookupResult> {
  const clean = code.trim();
  const rec = await db.requestRecord.findUnique({ where: { requestCode: clean }, include: { events: { orderBy: { createdAt: "desc" } } } });
  let arm: RequestLookupResult["arm"] = null;
  let armRequestId = rec?.armRequestId ?? null;

  try {
    const oe = await resolveOwnerExec();
    if (!armRequestId) {
      // رکورد محلی نبود یا شناسهٔ آرم ندارد → جستجوی زندهٔ فهرست
      const row = await scanRequestRow(oe, clean);
      if (row) armRequestId = String(row._id ?? "");
    }
    if (armRequestId) {
      const [row, history] = await Promise.all([
        scanRequestRow(oe, clean).catch(() => null),
        fetchRequestHistory(oe, armRequestId).catch(() => [] as ArmRow[]),
      ]);
      arm = {
        armRequestId,
        title: row?.title ?? null,
        relatedRealtor: row?.relatedRealtor ?? null,
        relatedCustomer: row?.relatedCustomer ?? null,
        createdAt: row?.createdAt ?? null,
        code: clean,
        history: history.map((e) => ({
          id: String(e._id ?? ""),
          action: e.actionType?.name ?? null,
          actionTypeId: e.actionType?._id ?? (typeof e.actionType === "string" ? e.actionType : null) ?? null,
          realtor: e.realtor?.fullName ?? null,
          date: e.date ?? null,
          display: isoToJalaliHour(e.date ?? null),
        })),
      };
    }
  } catch (e) {
    return {
      ok: false,
      code: clean,
      local: rec
        ? {
            id: rec.id, requestCode: rec.requestCode, armRequestId: rec.armRequestId,
            customerName: rec.customerName, customerMobile: rec.customerMobile, actorName: rec.actorName,
            title: rec.title, status: rec.status, source: rec.source,
            events: rec.events.map((ev) => ({ name: ev.eventTypeName, date: ev.date, hour: ev.hour, display: ev.date ? `${ev.hour ?? ""} | ${ev.date}` : null })),
          }
        : null,
      arm: null,
      error: `جستجوی زندهٔ ARM ناموفق: ${(e as Error).message}`,
    };
  }

  return {
    ok: Boolean(rec || arm),
    code: clean,
    local: rec
      ? {
          id: rec.id, requestCode: rec.requestCode, armRequestId: rec.armRequestId,
          customerName: rec.customerName, customerMobile: rec.customerMobile, actorName: rec.actorName,
          title: rec.title, status: rec.status, source: rec.source,
          events: rec.events.map((ev) => ({ name: ev.eventTypeName, date: ev.date, hour: ev.hour, display: ev.date ? `${ev.hour ?? ""} | ${ev.date}` : null })),
        }
      : null,
    arm,
    error: rec || arm ? undefined : `درخواستی با کد ${clean} یافت نشد (نه محلی، نه زندهٔ ARM).`,
  };
}

/* ---------- ثبت کد درخواست جدید (عین ۰۹۹) ---------- */

export interface CreateRequestSpec {
  customerName: string;
  customerMobile: string;
  /** شناسه‌های رسمی کاتالوگ ARM — پیش‌فرض‌ها از variables (فروش/مسکونی/آپارتمان) */
  tradeTypeId?: string;
  buildingTypeId?: string;
  propertyTypeId?: string;
  /** فرم پویای دسته (متراژ/قیمت از-تا · امکانات…) — مقادیر خام عین ۰۹۹ */
  inputs?: Record<string, unknown>;
  userPaymentMethod?: string;
  userSeriousity?: string;
  customerDescription?: string;
  realtorDescription?: string;
  /** مناطق/محله‌ها — پیش‌فرض: کل تبریز (۱۳۰ منطقه/۹۲۶ محله — الگوی «بدون محدودیت» ۰۹۹) */
  areaIds?: string[];
  areaNames?: string[];
  lineIds?: string[];
  lineNames?: string[];
}

/** رویداد تاریخچهٔ همراه ثبت (اقدام/توسط/تاریخ دقیق — عین دستور مالک ۰۹۹) */
export interface HistoryEventSpec {
  eventTypeId?: string;
  eventTypeName?: string;
  byName?: string;
  byCode?: string;
  /** جلالی ۱۴۰۵/۰۸/۲۰ یا ISO */
  date: string;
  hour: string;
  message?: string | null;
}

/** ثبت کد درخواست در سامانه ARM — گام‌به‌گام عین کاربر عادی (هیچ گام دور نمی‌شود) */
export async function createRequestCode(
  spec: CreateRequestSpec,
  history: HistoryEventSpec | null,
  actor: { code: string; name: string },
): Promise<ChangesReport> {
  const t0 = Date.now();
  const steps: ChangesStep[] = [];
  const step = (key: string, title: string, status: ChangesStep["status"], detail: string) => {
    steps.push({ key, title, status, detail });
  };

  try {
    const oe = await resolveOwnerExec();
    step("token", "توکن مالک ARM", "done", `توکن زنده از «${oe.source === "session" ? "نشست مالک" : "خزانه"}»${oe.expIso ? ` (اعتبار تا ${oe.expIso})` : ""}.`);

    // ورودی کامل (منطقه/محله = کل تبریز — الگوی استاندارد ۰۹۹)
    const areaIds = spec.areaIds ?? TABRIZ_AREAS.map((a) => a.id);
    const areaNames = spec.areaNames ?? TABRIZ_AREAS.map((a) => a.n);
    const lineIds = spec.lineIds ?? ALL_LINES.map((l) => l.id);
    const lineNames = spec.lineNames ?? ALL_LINES.map((l) => l.n);
    const tradeTypeId = spec.tradeTypeId ?? "614ed62da50555f0a54c1eca";
    const buildingTypeId = spec.buildingTypeId ?? "614edc35a50555f0a54c1f12";
    const propertyTypeId = spec.propertyTypeId ?? "614ee704a50555f0a54c227d";
    const userPaymentMethod = spec.userPaymentMethod ?? STANDARD_DEFAULTS.userPaymentMethod;
    const userSeriousity = spec.userSeriousity ?? STANDARD_DEFAULTS.userSeriousity;
    const inputs = spec.inputs ?? {};

    // ثبت محلی (اعتبارسنجی ۴ گامی داخل createRequest)
    const created = await createRequest(
      {
        source: "auto",
        customerName: spec.customerName,
        customerMobile: spec.customerMobile,
        countryId: LOCATION_IDS.country,
        stateId: LOCATION_IDS.state,
        cityId: LOCATION_IDS.city,
        areaIds, areaNames, lineIds, lineNames,
        tradeTypeId, buildingTypeId, propertyTypeId,
        inputs,
        userPaymentMethod, userSeriousity,
        customerDescription: spec.customerDescription,
        realtorDescription: spec.realtorDescription,
      },
      actor.code,
    );
    if (!created.record) {
      step("local-create", "ثبت محلی پیش از ARM", "failed", `اعتبارسنجی ۴ گامی ناقص: ${created.errors.map((e) => e.message).join("؛ ")}`);
      return { ok: false, operation: "request-create", steps, durationMs: Date.now() - t0, error: "اطلاعات ۴ گامی کامل نیست." };
    }
    step("local-create", "ثبت محلی (اعتبارسنجی ۴ گامی)", "done", `رکورد ${created.record.id} با اعتبارسنجی ${created.ok ? "کامل" : "ناقص"} ساخته شد.`);
    await db.requestRecord.update({ where: { id: created.record.id }, data: { actorName: actor.name } });

    // رویداد هوشمند — بهترین‌تلاش (عین ۰۹۹)
    try {
      const { emitEvent } = await import("@/lib/intelligence/blackboard");
      await emitEvent("request.created", { requestId: created.record.id, source: "auto", actor: actor.code });
    } catch {
      /* هرگز ثبت را نمی‌شکند */
    }

    // ثبت گام‌به‌گام در ARM (عین کاربر عادی)
    const reg = await registerRequestToArm(oe.guard, created.record.id, "create", oe.exec);
    for (const s of reg.steps) steps.push({ key: `arm-${s.key}`, title: s.title, status: s.status, detail: s.detail });
    if (!reg.ok || !reg.armRequestId) {
      return { ok: false, operation: "request-create", steps, durationMs: Date.now() - t0, error: reg.error ?? "ثبت در ARM ناموفق بود." };
    }

    // کد درخواست از فهرست زنده
    let requestCode = "";
    let armRow: ArmRow | null = null;
    for (let page = 1; page <= 3 && !armRow; page++) {
      const res = await call<ArmRow>(oe, "GET", ARM_PATHS.requestsList, { query: { page: String(page), limit: "20" }, timeoutMs: CHANGES_TIMEOUT_MS.lookup }).catch(() => null);
      const list = (res?.data?.list ?? []) as ArmRow[];
      armRow = list.find((r) => r._id === reg.armRequestId) ?? null;
    }
    if (!armRow) {
      step("arm-code", "یافتن کد درخواست از فهرست زنده", "failed", "ردیف درخواست تازه در فهرست ARM یافت نشد (ثبت موفق بود؛ فهرست ممکن است با تأخیر بروزرسانی شود).");
      return { ok: false, operation: "request-create", steps, durationMs: Date.now() - t0, error: "کد درخواست از فهرست زنده دریافت نشد." };
    }
    requestCode = String(armRow.code ?? armRow.requestCode ?? "");
    step("arm-code", "کد درخواست از فهرست زنده", "done", `کد درخواست ${requestCode} · عنوان خودکار: «${armRow.title ?? "—"}» · کارشناس: ${armRow.relatedRealtor ?? "—"}.`);

    // تکمیل ستون‌های کاتالوگ رکورد محلی (عین ۰۹۹)
    const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
    const inputsRow = (armRow.inputs ?? {}) as ArmRow;
    await db.requestRecord.update({
      where: { id: created.record.id },
      data: {
        requestCode,
        title: typeof armRow.title === "string" ? armRow.title : null,
        actorName: typeof armRow.relatedRealtor === "string" && armRow.relatedRealtor ? armRow.relatedRealtor : actor.name,
        status: "ready",
        customerName: typeof armRow.relatedCustomer === "string" && armRow.relatedCustomer ? armRow.relatedCustomer : spec.customerName,
        priceFrom: num(armRow.totalPrice_from),
        priceTo: num(armRow.totalPrice_to),
        spaceFrom: num(inputsRow.space_from),
        spaceTo: num(inputsRow.space_to),
        createdAt: armRow.createdAt ? new Date(armRow.createdAt) : undefined,
      },
    });

    // رویداد تاریخچه با تاریخ دقیق اعلامی (اقدام/توسط/تاریخ — عین ۰۹۹)
    if (history) {
      const eventTypeId = history.eventTypeId ?? HISTORY_ACTION_TYPES.createRealtor.id;
      const eventTypeName = history.eventTypeName ?? HISTORY_ACTION_TYPES.createRealtor.name;
      const byName = history.byName ?? HISTORY_BY_DEFAULT.name;
      const byCode = history.byCode ?? HISTORY_BY_DEFAULT.code;
      const isoDate = jalaliToIsoDate(history.date);
      if (!isoDate) {
        step("history-event", "ثبت رویداد تاریخچه با تاریخ دقیق", "failed", `قالب تاریخ «${history.date}» نامعتبر است — نمونه: 1405/08/20.`);
      } else {
        // شاهد تاریخچهٔ زندهٔ ARM (بهترین‌تلاش)
        let armHistory: ArmRow[] = [];
        try {
          armHistory = await fetchRequestHistory(oe, reg.armRequestId);
        } catch {
          /* شاهد بهترین‌تلاش */
        }
        const event = await createRequestEvent(
          { requestId: created.record.id, eventTypeId, eventTypeName, flags: {}, date: isoDate, hour: history.hour, message: history.message ?? null },
          byCode,
        );
        await db.requestEventRecord.update({
          where: { id: event.id },
          data: {
            armSyncJson: JSON.stringify({
              at: new Date().toISOString(),
              kind: "change-history-entry",
              byOwnerDirective: true,
              demanded: { اقدام: eventTypeName, توسط: byName, تاریخ: `${history.hour}|${isoToJalaliHourDisplay(isoDate, history.hour)}` },
              armRequestCode: requestCode,
              armRequestId: reg.armRequestId,
              armAutoHistoryEntry: armHistory[0]
                ? { action: (armHistory[0].actionType ?? {}).name, realtor: ((armHistory[0].realtor ?? {}) as ArmRow).fullName, date: armHistory[0].date }
                : null,
            }),
          },
        });
        step("history-event", "ثبت رویداد تاریخچه با تاریخ دقیق", "done", `اقدام: ${eventTypeName} · توسط: ${byName} · تاریخ: ${history.hour} | ${isoDate} (نمایش عین UI: «${eventTypeName} · تاریخ ${isoJalaliDisplay(isoDate)} ساعت ${history.hour}»).`);
      }
    }

    await audit("CHANGES_REQUEST_CREATE", actor.code, `code=${requestCode} arm=${reg.armRequestId} by=changes-tile`).catch(() => undefined);

    return {
      ok: true,
      operation: "request-create",
      steps,
      durationMs: Date.now() - t0,
      result: { requestCode, armRequestId: reg.armRequestId, customerId: reg.customerId ?? null, title: armRow.title ?? null, relatedRealtor: armRow.relatedRealtor ?? null },
    };
  } catch (e) {
    step("fatal", "اجرای عملیات", "failed", (e as Error).message);
    return { ok: false, operation: "request-create", steps, durationMs: Date.now() - t0, error: (e as Error).message };
  }
}

/** نمایش جلالی تاریخ ISO (برای متن گام) */
function isoJalaliDisplay(isoDate: string): string {
  return isoToJalaliString(isoDate);
}

/** نمایش «۱۴۰۵/۰۸/۲۰» از تاریخ جلالی ورودی کاربر */
function isoToJalaliHourDisplay(isoDate: string, hour: string): string {
  return `${isoJalaliDisplay(isoDate)} ساعت ${hour}`;
}

/* ---------- اصلاح/تغییر کد درخواست موجود (شاهکار ۰۹۹) ---------- */

export interface RequestUpdateSpec {
  code: string;
  /** پچ فیلدها (اختیاری) — روی بدنهٔ ویرایش اعمال می‌شود */
  inputsPatch?: Record<string, unknown>;
  userPaymentMethod?: string;
  userSeriousity?: string;
  realtorDescription?: string;
  customerDescription?: string;
  flags?: { urgent?: boolean; luxury?: boolean; changeable?: boolean; ocasion?: boolean; deposite?: boolean; confirmSms?: boolean; isRental?: boolean };
  /** اصلاح تاریخ تاریخچه — تاریخ هدف همهٔ مدخل‌ها (ISO UTC؛ از جلالی+ساعت ساخته می‌شود) */
  historyTarget?: { date: string; hour: string } | null;
}

/**
 * تغییر در کد درخواست موجود — PUT requests/update/{id} با بدنهٔ کامل ویرایش
 * (عین edit-request-page) + آرایهٔ status با همان شناسه‌های عین و تاریخ هدف.
 */
export async function updateRequestCode(spec: RequestUpdateSpec, actor: { code: string; name: string }): Promise<ChangesReport> {
  const t0 = Date.now();
  const steps: ChangesStep[] = [];
  const step = (key: string, title: string, status: ChangesStep["status"], detail: string) => steps.push({ key, title, status, detail });

  try {
    const code = spec.code.trim();
    const rec = await db.requestRecord.findUnique({ where: { requestCode: code } });
    if (!rec) {
      return { ok: false, operation: "request-update", steps: [{ key: "lookup", title: "جستجوی رکورد محلی", status: "failed", detail: `درخواست ${code} در آینهٔ محلی یافت نشد.` }], durationMs: Date.now() - t0, error: "رکورد محلی یافت نشد." };
    }
    step("lookup", "جستجوی رکورد محلی", "done", `درخواست ${code} (${rec.title ?? "بدون عنوان"}) · شناسهٔ ARM: ${rec.armRequestId ?? "—"} · متقاضی: ${rec.customerName ?? "—"}.`);

    const oe = await resolveOwnerExec();
    if (!rec.armRequestId) {
      step("token", "توکن مالک ARM", "failed", "رکورد محلی شناسهٔ ARM ندارد — ابتدا از مسیر ثبت، در ARM ثبت شود.");
      return { ok: false, operation: "request-update", steps, durationMs: Date.now() - t0, error: "شناسهٔ ARM موجود نیست." };
    }
    step("token", "توکن مالک ARM", "done", `توکن زنده از «${oe.source === "session" ? "نشست مالک" : "خزانه"}».`);

    // وضعیت فعلی (پایهٔ مقایسه) — تاریخچه + ردیف
    const beforeHistory = await fetchRequestHistory(oe, rec.armRequestId);
    const beforeRow = await scanRequestRow(oe, code);
    step("before", "وضعیت فعلی تاریخچهٔ زنده", "done",
      beforeHistory.length
        ? beforeHistory.map((e) => `${e.actionType?.name ?? "?"} · ${e.realtor?.fullName ?? "?"} · ${isoToJalaliHour(e.date ?? null) ?? e.date ?? "?"}`).join(" ┃ ")
        : "تاریخچهٔ زنده خالی است.");

    // تاریخ هدف (اگر اصلاح تاریخ خواسته شد)
    let targetIso: string | null = null;
    if (spec.historyTarget) {
      targetIso = jalaliHourToIsoUtc(spec.historyTarget.date, spec.historyTarget.hour);
      if (!targetIso) {
        step("target-date", "اعتبارسنجی تاریخ هدف", "failed", `قالب تاریخ/ساعت نامعتبر: ${spec.historyTarget.date} ${spec.historyTarget.hour} — نمونه: 1405/08/20 و 17:30.`);
        return { ok: false, operation: "request-update", steps, durationMs: Date.now() - t0, error: "تاریخ هدف نامعتبر است." };
      }
      step("target-date", "تاریخ هدف (جلالی → ISO)", "done", `${spec.historyTarget.date} ساعت ${spec.historyTarget.hour} تهران = ${targetIso}.`);
    }

    // بدنهٔ ویرایش عین edit-request-page (buildCreatePayload) + پچ‌ها
    const areaIds = parseJson<string[]>(rec.areaIdsJson, []);
    const lineIds = parseJson<string[]>(rec.lineIdsJson, []);
    const mergedInputs = { ...parseJson<Record<string, unknown>>(rec.inputsJson, {}), ...(spec.inputsPatch ?? {}) };
    const payload = buildRequestPayload({
      customerId: rec.armCustomerId ?? "",
      countryId: rec.countryId ?? LOCATION_IDS.country,
      stateId: rec.stateId ?? LOCATION_IDS.state,
      cityId: rec.cityId ?? LOCATION_IDS.city,
      areaIds, lineIds,
      tradeTypeId: rec.tradeTypeId ?? "",
      buildingTypeId: rec.buildingTypeId ?? "",
      propertyTypeId: rec.propertyTypeId ?? "",
      inputs: mergedInputs,
      customerDescription: spec.customerDescription ?? rec.customerDescription,
      userPaymentMethod: spec.userPaymentMethod ?? rec.userPaymentMethod ?? "",
      userSeriousity: spec.userSeriousity ?? rec.userSeriousity ?? "",
      realtorDescription: spec.realtorDescription ?? rec.realtorDescription,
    });

    // آرایهٔ status — همان شناسه‌های عین با تاریخ هدف (الگوی تأییدشدهٔ ۰۹۹)
    if (targetIso && beforeHistory.length > 0) {
      const mk = (e: ArmRow, date: string) => ({
        _id: e._id,
        actionType: e.actionType?._id ?? e.actionType,
        currentStatus: typeof e.currentStatus === "string" ? e.currentStatus : e.currentStatus?._id,
        currentInbox: typeof e.currentInbox === "string" ? e.currentInbox : e.currentInbox?._id,
        customer: e.customer && typeof e.customer === "object" ? e.customer._id : e.customer ?? null,
        realtor: e.realtor?._id ?? e.realtor,
        outOfArea: e.outOfArea ?? false,
        date,
      });
      (payload as ArmRow).status = beforeHistory.map((e) => mk(e, targetIso));
      step("status-array", "آرایهٔ status با شناسه‌های عین و تاریخ هدف", "done", `${beforeHistory.length} مدخل تاریخچه با همان شناسه‌ها و تاریخ ${targetIso} بازسازی شد.`);
    }

    // بازتأیید پرچم‌های فعلی با مقدار جاری (محافظ در برابر replace کامل — عین ۰۹۹)
    if (beforeRow) {
      const f = spec.flags ?? {};
      (payload as ArmRow).urgent = f.urgent ?? beforeRow.urgent ?? false;
      (payload as ArmRow).luxury = f.luxury ?? beforeRow.luxury ?? false;
      (payload as ArmRow).changeable = f.changeable ?? beforeRow.changeable ?? false;
      (payload as ArmRow).ocasion = f.ocasion ?? beforeRow.ocasion ?? false;
      (payload as ArmRow).deposite = f.deposite ?? beforeRow.deposite ?? false;
      (payload as ArmRow).confirmSMS = f.confirmSms ?? beforeRow.confirmSMS ?? true;
      (payload as ArmRow).isRental = f.isRental ?? beforeRow.isRental ?? false;
      if (Array.isArray(beforeRow.changeWith)) (payload as ArmRow).changeWith = beforeRow.changeWith;
      step("flags", "بازتأیید پرچم‌های ردیف", "done", `urgent=${(payload as ArmRow).urgent} · luxury=${(payload as ArmRow).luxury} · changeable=${(payload as ArmRow).changeable} · ocasion=${(payload as ArmRow).ocasion} · deposite=${(payload as ArmRow).deposite} · confirmSMS=${(payload as ArmRow).confirmSMS}.`);
    }

    // اجرای PUT
    const putRes = await call<ArmRow>(oe, "PUT", ARM_PATHS.requestUpdate(rec.armRequestId), { body: payload, timeoutMs: CHANGES_TIMEOUT_MS.write });
    step("put", "PUT requests/update/{id}", "done", `پاسخ سامانه: ${putRes.message ?? "ثبت شد"} ${putRes.data?._id ? `· شناسه: ${putRes.data._id}` : ""}.`);

    // راستی‌آزمایی زندهٔ تاریخچه پس از اعمال
    let verdict: { total: number; withTarget: number } | null = null;
    if (targetIso) {
      await new Promise((r) => setTimeout(r, 2500));
      const afterHistory = await fetchRequestHistory(oe, rec.armRequestId);
      const withTarget = afterHistory.filter((e) => e.date === targetIso).length;
      verdict = { total: afterHistory.length, withTarget };
      step("verify", "راستی‌آزمایی زندهٔ تاریخچه", withTarget === afterHistory.length && afterHistory.length > 0 ? "done" : "failed",
        `${withTarget}/${afterHistory.length} مدخل با تاریخ هدف ${targetIso} ${withTarget === afterHistory.length ? "— اصلاح کامل ✓" : "— اصلاح ناقص"}.`);
      // شاهد محلی: رویداد آینه با نتیجهٔ راستی‌آزمایی
      if (afterHistory.length > 0) {
        await createRequestEvent(
          {
            requestId: rec.id,
            eventTypeId: HISTORY_ACTION_TYPES.createRealtor.id,
            eventTypeName: "بررسی درخواست",
            flags: {},
            date: null,
            hour: null,
            message: null,
          },
          actor.code,
        ).then(async (ev) =>
          db.requestEventRecord.update({
            where: { id: ev.id },
            data: {
              armSyncJson: JSON.stringify({
                at: new Date().toISOString(),
                kind: "history-date-fix",
                byOwnerDirective: true,
                targetIso,
                demanded: { تاریخ: `${spec.historyTarget?.hour}|${spec.historyTarget?.date}` },
                armRequestCode: code,
                verdict,
                before: beforeHistory.map((e) => ({ action: e.actionType?.name, date: e.date })),
                after: afterHistory.map((e) => ({ action: e.actionType?.name, date: e.date })),
              }),
            },
          }),
        ).catch(() => undefined);
      }
    }

    await audit("CHANGES_REQUEST_UPDATE", actor.code, `code=${code} historyFix=${targetIso ? "yes" : "no"} ok=true by=changes-tile`).catch(() => undefined);

    return {
      ok: targetIso ? Boolean(verdict && verdict.withTarget === verdict.total && verdict.total > 0) : true,
      operation: "request-update",
      steps,
      durationMs: Date.now() - t0,
      result: { requestCode: code, armRequestId: rec.armRequestId, historyFix: targetIso, verdict },
    };
  } catch (e) {
    step("fatal", "اجرای عملیات", "failed", (e as Error).message);
    return { ok: false, operation: "request-update", steps, durationMs: Date.now() - t0, error: (e as Error).message };
  }
}

/* ---------- ثبت رویداد تاریخچه با تاریخ دقیق ---------- */

export async function registerRequestHistoryEvent(
  code: string,
  spec: HistoryEventSpec,
  actor: { code: string; name: string },
): Promise<ChangesReport> {
  const t0 = Date.now();
  const steps: ChangesStep[] = [];
  const step = (key: string, title: string, status: ChangesStep["status"], detail: string) => steps.push({ key, title, status, detail });

  try {
    const clean = code.trim();
    const rec = await db.requestRecord.findUnique({ where: { requestCode: clean } });
    if (!rec) {
      return { ok: false, operation: "request-event", steps: [{ key: "lookup", title: "جستجوی رکورد محلی", status: "failed", detail: `درخواست ${clean} یافت نشد.` }], durationMs: Date.now() - t0, error: "رکورد یافت نشد." };
    }
    step("lookup", "جستجوی رکورد محلی", "done", `درخواست ${clean} · شناسهٔ ARM: ${rec.armRequestId ?? "—"} · متقاضی: ${rec.customerName ?? "—"}.`);

    const isoDate = jalaliToIsoDate(spec.date);
    if (!isoDate) {
      return { ok: false, operation: "request-event", steps: [{ key: "date", title: "اعتبارسنجی تاریخ", status: "failed", detail: `قالب تاریخ «${spec.date}» نامعتبر — نمونه: 1405/08/20.` }], durationMs: Date.now() - t0, error: "تاریخ نامعتبر است." };
    }
    step("date", "تبدیل تاریخ جلالی", "done", `${spec.date} → ${isoDate} (قالب ISO عین قرارداد ذخیرهٔ خود سامانه).`);

    const eventTypeId = spec.eventTypeId ?? HISTORY_ACTION_TYPES.createRealtor.id;
    const eventTypeName = spec.eventTypeName ?? HISTORY_ACTION_TYPES.createRealtor.name;
    const byName = spec.byName ?? HISTORY_BY_DEFAULT.name;
    const byCode = spec.byCode ?? HISTORY_BY_DEFAULT.code;

    // همگام‌سازی با آرم (اگر درخواست در آرم ثبت شده — POST request-events/create)
    let arm: { ok: boolean; armEventId?: string; error?: string } | null = null;
    if (rec.armRequestId) {
      try {
        const oe = await resolveOwnerExec();
        const r = await syncEventToArm(oe.guard, { requestId: rec.id, eventTypeId, date: isoDate, hour: spec.hour, propertyCode: null, message: spec.message ?? null }, oe.exec);
        arm = { ok: r.ok, armEventId: r.armEventId, error: r.error };
        step("arm-sync", "ثبت رویداد در خود سامانهٔ ARM", r.ok ? "done" : "failed", r.ok ? `رویداد در ARM ثبت شد${r.armEventId ? ` (شناسه: ${r.armEventId})` : ""}.` : `همگام‌سازی ARM ناموفق: ${r.error ?? "?"}`);
      } catch (e) {
        arm = { ok: false, error: (e as Error).message };
        step("arm-sync", "ثبت رویداد در خود سامانهٔ ARM", "failed", (e as Error).message);
      }
    } else {
      step("arm-sync", "ثبت رویداد در خود سامانهٔ ARM", "skipped", "درخواست هنوز در ARM ثبت نشده — رویداد فقط در آینهٔ محلی ثبت می‌شود.");
    }

    // ثبت محلی (همیشه) — عین قرارداد رویداد خود سامانه با تاریخ جلالی + ساعت
    const event = await createRequestEvent(
      { requestId: rec.id, eventTypeId, eventTypeName, flags: {}, date: isoDate, hour: spec.hour, message: spec.message ?? null },
      byCode,
    );
    await db.requestEventRecord.update({
      where: { id: event.id },
      data: {
        armEventId: arm?.armEventId ?? null,
        armSyncedAt: arm?.ok ? new Date() : null,
        armSyncJson: JSON.stringify({
          at: new Date().toISOString(),
          kind: "change-history-entry",
          byOwnerDirective: true,
          demanded: { اقدام: eventTypeName, توسط: byName, تاریخ: `${spec.hour}|${spec.date}` },
          armRequestCode: clean,
          arm: arm ? { ok: arm.ok, armEventId: arm.armEventId ?? null, error: arm.error ?? null } : null,
        }),
      },
    }).catch(() => undefined);
    step("local-event", "ثبت رویداد در تاریخچهٔ تغییرات (آینهٔ محلی)", "done", `اقدام: ${eventTypeName} · توسط: ${byName} · تاریخ: ${spec.hour} | ${isoDate} — نمایش عین UI: «${eventTypeName} · تاریخ ${isoJalaliDisplay(isoDate)} ساعت ${spec.hour}».`);

    await audit("CHANGES_REQUEST_EVENT", actor.code, `code=${clean} type=${eventTypeName} date=${isoDate} hour=${spec.hour} arm=${arm ? (arm.ok ? "ok" : "fail") : "local"} by=changes-tile`).catch(() => undefined);

    return { ok: true, operation: "request-event", steps, durationMs: Date.now() - t0, result: { requestCode: clean, eventId: event.id, armEventId: arm?.armEventId ?? null, اقدام: eventTypeName, توسط: byName, تاریخ: `${spec.hour} | ${isoDate}` } };
  } catch (e) {
    step("fatal", "اجرای عملیات", "failed", (e as Error).message);
    return { ok: false, operation: "request-event", steps, durationMs: Date.now() - t0, error: (e as Error).message };
  }
}

/* ═══════════════════════════════════════════════════════════════════
 * قابلیت ۱ — کدآگهی
 * ═══════════════════════════════════════════════════════════════════ */

/* ---------- جستجو ---------- */

export interface ListingLookupResult {
  ok: boolean;
  code: string;
  arm: {
    armPropertyId: string;
    title: string | null;
    relatedRealtor: string | null;
    code: string;
  } | null;
  details: Array<{ label: string; value: string; unit?: string | null }> | null;
  owner: { name: string | null; mobile: string | null } | null;
  localListingId: string | null;
  error?: string;
}

/** جستجوی کدآگهی — زنده از خود سامانه (properties/info/by-code عین فرم رویداد) */
export async function lookupListingByCode(code: string): Promise<ListingLookupResult> {
  const clean = code.trim();
  try {
    const oe = await resolveOwnerExec();
    const res = await call<ArmRow>(oe, "GET", ARM_PATHS.propertyByCode(clean));
    const data = res.data ?? {};
    const armPropertyId = String(data._id ?? data.id ?? "");
    if (!armPropertyId) {
      return { ok: false, code: clean, arm: null, details: null, owner: null, localListingId: null, error: `آگهی با کد «${clean}» در سامانه آرم یافت نشد.` };
    }

    // جزئیات + مالک (بهترین‌تلاش — موازی)
    const [detRes, ownRes] = await Promise.all([
      call<ArmRow>(oe, "GET", ARM_PATHS.propertyDetails(armPropertyId)).catch(() => null),
      call<ArmRow>(oe, "GET", ARM_PATHS.propertyOwner(armPropertyId)).catch(() => null),
    ]);
    const details = Array.isArray(detRes?.data?.details)
      ? (detRes.data.details as Array<{ label?: string; value?: unknown; unit?: string | null }>).map((d) => ({ label: String(d.label ?? ""), value: String(d.value ?? ""), unit: d.unit ?? null }))
      : null;
    const ownerRow = ownRes?.data ?? {};
    const owner = {
      name: ownerRow.fullName ?? ([ownerRow.firstName, ownerRow.lastName].filter(Boolean).join(" ") || null),
      mobile: ownerRow.mobileNumber ?? null,
    };

    const local = await db.listingRecord.findFirst({ where: { armPropertyId } });

    return {
      ok: true,
      code: clean,
      arm: { armPropertyId, title: data.title ?? null, relatedRealtor: data.relatedRealtor ?? null, code: clean },
      details,
      owner: owner.name || owner.mobile ? owner : null,
      localListingId: local?.id ?? null,
    };
  } catch (e) {
    return { ok: false, code: clean, arm: null, details: null, owner: null, localListingId: null, error: (e as Error).message };
  }
}

/* ---------- ثبت کدآگهی جدید (۵ گامی — مسیر زندهٔ اثبات‌شده) ---------- */

export interface CreateListingSpec extends ListingUpsertInput {}

export async function createListingCode(spec: CreateListingSpec, actor: { code: string; name: string }): Promise<ChangesReport> {
  const t0 = Date.now();
  const steps: ChangesStep[] = [];
  const step = (key: string, title: string, status: ChangesStep["status"], detail: string) => steps.push({ key, title, status, detail });

  try {
    // ثبت فایل محلی (اعتبارسنجی ۵ گامی داخل createListing)
    const created = await createListing({ ...spec, source: undefined } as ListingUpsertInput, actor.code);
    if (!created.record) {
      step("local-create", "ثبت فایل آگهی (اعتبارسنجی ۵ گامی)", "failed", `خطا در ساخت رکورد محلی.`);
      return { ok: false, operation: "listing-create", steps, durationMs: Date.now() - t0, error: "خطای ساخت رکورد محلی." };
    }
    step("local-create", "ثبت فایل آگهی (اعتبارسنجی ۵ گامی)", created.ok ? "done" : "failed",
      created.ok ? `فایل ${created.record.id} با اعتبارسنجی کامل ساخته شد.` : `اعتبارسنجی ناقص: ${created.errors.map((e) => e.message).join("؛ ")}`);
    if (!created.ok) {
      return { ok: false, operation: "listing-create", steps, durationMs: Date.now() - t0, error: "اطلاعات ۵ گامی کامل نیست." };
    }

    // انتقال به سامانه ARM (۵ گام عین کاربر عادی)
    const oe = await resolveOwnerExec();
    step("token", "توکن مالک ARM", "done", `توکن زنده از «${oe.source === "session" ? "نشست مالک" : "خزانه"}»${oe.expIso ? ` (اعتبار تا ${oe.expIso})` : ""}.`);
    const tr = await transferListingToCrm(oe.guard, created.record.id, "create", oe.exec);
    for (const s of tr.steps) steps.push({ key: `arm-${s.key}`, title: s.title, status: s.status, detail: s.detail });
    if (!tr.ok || !tr.armPropertyId) {
      return { ok: false, operation: "listing-create", steps, durationMs: Date.now() - t0, error: tr.error ?? "ثبت در ARM ناموفق بود." };
    }

    // کدآگهی از فهرست زنده
    let propertyCode = "";
    const row = await scanPropertyRow(oe, tr.armPropertyId, 6);
    if (row) propertyCode = String(row.code ?? row.propertyCode ?? "");
    step("arm-code", "کدآگهی از فهرست زنده", propertyCode ? "done" : "failed",
      propertyCode ? `کدآگهی ${propertyCode} · عنوان: «${row?.title ?? "—"}» · کارشناس: ${row?.relatedRealtor ?? "—"}.` : "ردیف آگهی تازه در فهرست زنده یافت نشد (ثبت موفق بود؛ فهرست با تأخیر بروزرسانی می‌شود).");

    await audit("CHANGES_LISTING_CREATE", actor.code, `code=${propertyCode} arm=${tr.armPropertyId} by=changes-tile`).catch(() => undefined);

    return {
      ok: Boolean(propertyCode),
      operation: "listing-create",
      steps,
      durationMs: Date.now() - t0,
      result: { propertyCode, armPropertyId: tr.armPropertyId, customerId: tr.customerId ?? null, title: row?.title ?? null },
    };
  } catch (e) {
    step("fatal", "اجرای عملیات", "failed", (e as Error).message);
    return { ok: false, operation: "listing-create", steps, durationMs: Date.now() - t0, error: (e as Error).message };
  }
}

/* ---------- تغییر در کدآگهی موجود ---------- */

export interface ListingUpdateSpec {
  code: string;
  /** پچ فیلدها — روی فایل محلی پیوندخورده اعمال و دوباره به ARM فرستاده می‌شود */
  inputsPatch?: Record<string, string>;
  userSeriousness?: string;
  priceEvaluation?: string;
  description?: string;
  flags?: { isLuxury?: boolean; isVacation?: boolean; isUrgent?: boolean; notifyBySms?: boolean };
}

/** تغییر در کدآگهی — PUT properties/update/{id} با بازسازی بدنهٔ عین edit-page خود سامانه */
export async function updateListingCode(spec: ListingUpdateSpec, actor: { code: string; name: string }): Promise<ChangesReport> {
  const t0 = Date.now();
  const steps: ChangesStep[] = [];
  const step = (key: string, title: string, status: ChangesStep["status"], detail: string) => steps.push({ key, title, status, detail });

  try {
    const clean = spec.code.trim();
    // شناسایی آگهی با کد (زنده)
    const lookup = await lookupListingByCode(clean);
    if (!lookup.ok || !lookup.arm) {
      step("lookup", "جستجوی کدآگهی در خود سامانه", "failed", lookup.error ?? "آگهی یافت نشد.");
      return { ok: false, operation: "listing-update", steps, durationMs: Date.now() - t0, error: lookup.error ?? "آگهی یافت نشد." };
    }
    step("lookup", "جستجوی کدآگهی در خود سامانه", "done", `کدآگهی ${clean} · شناسهٔ ARM: ${lookup.arm.armPropertyId} · عنوان: «${lookup.arm.title ?? "—"}».`);

    // فایل محلی پیوندخورده (منبع بازسازی بدنهٔ کامل — عین الگوی ویرایش)
    const local = lookup.localListingId ? await db.listingRecord.findUnique({ where: { id: lookup.localListingId } }) : null;
    if (!local) {
      step("local-link", "فایل آگهی پیوندخورده", "failed", "این کدآگهی فایل محلی پیوندخورده ندارد — بدنهٔ کامل ویرایش قابل بازسازی نیست. ابتدا از مسیر «ثبت کدآگهی جدید» یا فایل‌های کاشی آگهی نسبت به پیوند اقدام شود.");
      return { ok: false, operation: "listing-update", steps, durationMs: Date.now() - t0, error: "فایل محلی پیوندخورده یافت نشد." };
    }
    step("local-link", "فایل آگهی پیوندخورده", "done", `فایل ${local.id} · مالک: ${local.customerName ?? "—"} · منطقه: ${local.areaName ?? "—"} / ${local.lineName ?? "—"}.`);

    const oe = await resolveOwnerExec();
    step("token", "توکن مالک ARM", "done", `توکن زنده از «${oe.source === "session" ? "نشست مالک" : "خزانه"}».`);

    // اعمال پچ‌ها روی فایل محلی (updateListing اعتبارسنجی ۵ گامی را دوباره اجرا می‌کند)
    const { updateListing } = await import("@/lib/listing/store");
    const updated = await updateListing(local.id, {
      inputs: { ...parseJson<Record<string, string>>(local.inputsJson, {}), ...(spec.inputsPatch ?? {}) } as Record<string, string>,
      userSeriousness: spec.userSeriousness,
      priceEvaluation: spec.priceEvaluation,
      description: spec.description,
      isLuxury: spec.flags?.isLuxury,
      isVacation: spec.flags?.isVacation,
      isUrgent: spec.flags?.isUrgent,
      notifyBySms: spec.flags?.notifyBySms,
    });
    if (!updated) {
      step("local-update", "اعمال تغییرات بر فایل محلی", "failed", "به‌روزرسانی فایل محلی ناموفق بود.");
      return { ok: false, operation: "listing-update", steps, durationMs: Date.now() - t0, error: "به‌روزرسانی محلی ناموفق." };
    }
    step("local-update", "اعمال تغییرات بر فایل محلی", "done", `پچ‌ها اعمال شد${Object.keys(spec.inputsPatch ?? {}).length ? ` (${Object.keys(spec.inputsPatch ?? {}).length} فیلد فرم)` : ""}${spec.flags ? " + پرچم‌ها" : ""}.`);

    // بازسازی بدنهٔ کامل ویرایش (عین سریال‌سازی خود سامانه) + PUT
    const parseArr = (s: string | null): string[] => {
      try { return s ? (JSON.parse(s) as string[]) : []; } catch { return []; }
    };
    const payload = buildListingPayload({
      customerId: local.armCustomerId ?? "",
      areaId: updated.areaId ?? "",
      areaName: updated.areaName ?? "",
      lineId: updated.lineId ?? "",
      lineName: updated.lineName ?? "",
      latitude: updated.latitude,
      longitude: updated.longitude,
      postalCode: updated.postalCode,
      address: updated.address ?? "",
      tradeTypeId: updated.tradeTypeId ?? "",
      propertyTypeId: updated.propertyTypeId ?? "",
      buildingTypeId: updated.buildingTypeId ?? "",
      changeWith: parseArr(updated.changeWithJson),
      inputs: parseJson<Record<string, string>>(updated.inputsJson, {}),
      images: parseArr(updated.imagesJson),
      videos: parseArr(updated.videosJson),
      priceEvaluation: updated.priceEvaluation ?? "",
      desirabilityLevel: updated.desirabilityLevel,
      fileFinding: updated.fileFinding ?? "",
      fileType: parseArr(updated.fileTypeJson),
      userSeriousness: updated.userSeriousness ?? "",
      sellReason: updated.sellReason,
      description: updated.description,
      isLuxury: updated.isLuxury,
      isVacation: updated.isVacation,
      isUrgent: updated.isUrgent,
      notifyBySms: updated.notifyBySms,
    });

    const putRes = await call<ArmRow>(oe, "PUT", ARM_PATHS.propertyUpdate(lookup.arm.armPropertyId), { body: payload, timeoutMs: CHANGES_TIMEOUT_MS.write });
    step("put", "PUT properties/update/{id}", "done", `پاسخ سامانه: ${putRes.message ?? "ثبت شد"}.`);
    await db.listingRecord.update({
      where: { id: updated.id },
      data: {
        crmTransferredAt: new Date(),
        crmTransferJson: JSON.stringify({ steps, mode: "update", at: new Date().toISOString(), by: "changes-tile", armPropertyId: lookup.arm.armPropertyId }),
      },
    }).catch(() => undefined);

    await audit("CHANGES_LISTING_UPDATE", actor.code, `code=${clean} arm=${lookup.arm.armPropertyId} ok=true by=changes-tile`).catch(() => undefined);

    return { ok: true, operation: "listing-update", steps, durationMs: Date.now() - t0, result: { propertyCode: clean, armPropertyId: lookup.arm.armPropertyId } };
  } catch (e) {
    step("fatal", "اجرای عملیات", "failed", (e as Error).message);
    return { ok: false, operation: "listing-update", steps, durationMs: Date.now() - t0, error: (e as Error).message };
  }
}

/* ═══════════════════ پشتیبانی UI: انواع رویداد زنده ═══════════════════ */

/** فهرست انواع رویداد زنده از خود سامانه (برای انتخاب اقدام) */
export async function fetchChangeEventTypes(): Promise<Array<{ id: string; name: string }>> {
  const oe = await resolveOwnerExec();
  const res = await call<ArmRow>(oe, "GET", ARM_PATHS.requestEventTypes);
  const list = (res.data?.list ?? (Array.isArray(res.data) ? res.data : [])) as ArmRow[];
  return list.map((t) => ({ id: String(t._id ?? t.id ?? ""), name: String(t.name ?? "") })).filter((t) => t.id && t.name);
}
