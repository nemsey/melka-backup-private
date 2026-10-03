/**
 * لایه ذخیره‌سازی درخواست‌های ملک (کاشی «درخواست ملک»)
 * ------------------------------------------------------
 * - ثبت دستی (گام‌به‌گام ۴ مرحله‌ای — عین فرم آرم؛ بخش «الف»)
 * - ثبت اتوماتیک (فرم پرشونده → پس از تکمیل، ثبت مستقیم در آرم — بخش «ب»)
 * - آمار کلی برای KPI و ایجنت
 */

import { db } from "@/lib/db";
import type { RequestRecord } from "@prisma/client";
import {
  validateRequest,
  computeCompleteness,
  parseJson,
  toRequestRow,
  type RequestUpsertInput,
  type RequestRow,
} from "./types";
import type { RequestRecordRow } from "./types";

// ===================== ساخت داده رکورد از ورودی فرم =====================

function toRecordData(input: RequestUpsertInput) {
  return {
    source: input.source ?? "manual",
    customerName: input.customerName?.trim() || null,
    customerMobile: input.customerMobile?.trim() || null,
    armCustomerId: input.armCustomerId ?? null,
    countryId: input.countryId ?? null,
    stateId: input.stateId ?? null,
    cityId: input.cityId ?? null,
    areaIdsJson: input.areaIds && input.areaIds.length > 0 ? JSON.stringify(input.areaIds) : null,
    areaNamesJson: input.areaNames && input.areaNames.length > 0 ? JSON.stringify(input.areaNames) : null,
    lineIdsJson: input.lineIds && input.lineIds.length > 0 ? JSON.stringify(input.lineIds) : null,
    lineNamesJson: input.lineNames && input.lineNames.length > 0 ? JSON.stringify(input.lineNames) : null,
    tradeTypeId: input.tradeTypeId ?? null,
    buildingTypeId: input.buildingTypeId ?? null,
    propertyTypeId: input.propertyTypeId ?? null,
    inputsJson: input.inputs && Object.keys(input.inputs).length > 0 ? JSON.stringify(input.inputs) : null,
    customerDescription: input.customerDescription?.trim() || null,
    userPaymentMethod: input.userPaymentMethod ?? null,
    userSeriousity: input.userSeriousity ?? null,
    realtorDescription: input.realtorDescription?.trim() || null,
  };
}

// ===================== ثبت / ویرایش =====================

export interface CreateRequestResult {
  ok: boolean;
  record: RequestRecord | null;
  errors: { step: number; field: string; message: string }[];
}

/** ثبت درخواست جدید — اگر ۴ گام کامل بود status=ready وگرنه draft */
export async function createRequest(input: RequestUpsertInput, actorCode: string): Promise<CreateRequestResult> {
  const v = validateRequest(input);
  const data = toRecordData(input);
  const record = await db.requestRecord.create({
    data: { ...data, status: v.ok ? "ready" : "draft", actorCode },
  });
  return { ok: v.ok, record, errors: v.errors };
}

/** ویرایش درخواست (کلید «ویرایش») — گام‌های پرشده بازنویسی، جای‌خالی‌ها فقط در صورت ارسال */
export async function updateRequest(id: string, input: RequestUpsertInput, actorCode?: string): Promise<CreateRequestResult> {
  const existing = await db.requestRecord.findUnique({ where: { id } });
  if (!existing) {
    return { ok: false, record: null, errors: [{ step: 0, field: "id", message: "درخواست یافت نشد." }] };
  }
  // ادغام با داده موجود — فیلدهای ارسال‌شده جایگزین، بقیه حفظ
  const merged: RequestUpsertInput = {
    customerName: input.customerName ?? existing.customerName ?? undefined,
    customerMobile: input.customerMobile ?? existing.customerMobile ?? undefined,
    armCustomerId: input.armCustomerId ?? existing.armCustomerId ?? undefined,
    countryId: input.countryId ?? existing.countryId ?? undefined,
    stateId: input.stateId ?? existing.stateId ?? undefined,
    cityId: input.cityId ?? existing.cityId ?? undefined,
    areaIds: input.areaIds ?? parseJson<string[]>(existing.areaIdsJson, []),
    areaNames: input.areaNames ?? parseJson<string[]>(existing.areaNamesJson, []),
    lineIds: input.lineIds ?? parseJson<string[]>(existing.lineIdsJson, []),
    lineNames: input.lineNames ?? parseJson<string[]>(existing.lineNamesJson, []),
    tradeTypeId: input.tradeTypeId ?? existing.tradeTypeId ?? undefined,
    buildingTypeId: input.buildingTypeId ?? existing.buildingTypeId ?? undefined,
    propertyTypeId: input.propertyTypeId ?? existing.propertyTypeId ?? undefined,
    inputs: input.inputs ?? parseJson<Record<string, unknown>>(existing.inputsJson, {}),
    customerDescription: input.customerDescription ?? existing.customerDescription ?? undefined,
    userPaymentMethod: input.userPaymentMethod ?? existing.userPaymentMethod ?? undefined,
    userSeriousity: input.userSeriousity ?? existing.userSeriousity ?? undefined,
    realtorDescription: input.realtorDescription ?? existing.realtorDescription ?? undefined,
  };
  const v = validateRequest(merged);
  const data = toRecordData(merged);
  const record = await db.requestRecord.update({
    where: { id },
    data: {
      ...data,
      status: v.ok ? "ready" : "draft",
      ...(actorCode ? { actorCode } : {}),
    },
  });
  return { ok: v.ok, record, errors: v.errors };
}

// ===================== فهرست و آمار =====================

export interface RequestStats {
  total: number;
  manual: number;
  auto: number;
  ready: number;
  draft: number;
  armRegistered: number;
  armPending: number;
  eventsTotal: number;
  eventsThisWeek: number;
  newThisWeek: number;
}

export interface ListRequestsResult {
  rows: RequestRow[];
  stats: RequestStats;
}

/**
 * شرط دامنهٔ اختیاری (P6.5-04-i) — خروجی helper مرکزی scope.ts از مسیر روت.
 * undefined = بدون فیلتر (OWNER/تجمیعی) · مقدار = محدود به کارشناس/شعبه.
 */
export interface RequestScopeConstraint {
  actorCode?: string;
  branchId?: string;
}

export async function listRequests(
  filter?: { source?: "manual" | "auto" },
  scope?: RequestScopeConstraint
): Promise<ListRequestsResult> {
  const where: { source?: string | { not: string }; actorCode?: string; branchId?: string } = {};
  // P6.5-10 — رکوردهای کاتالوگ ARM (source='arm') فقط در کاشی «درخواست‌های ملک تبریز»
  // دیده می‌شوند؛ کاشی «درخواست ملک» فایل‌های محلی دفتر است (پیش‌فرض: بدون arm)
  where.source = filter?.source ?? { not: "arm" };
  // P6.5-04-i — فیلتر دامنه فقط از helper مرکزی (صفر فیلتر دست‌نویس در روت‌ها)
  if (scope?.actorCode !== undefined) where.actorCode = scope.actorCode;
  if (scope?.branchId !== undefined) where.branchId = scope.branchId;
  const records = await db.requestRecord.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: 500,
  });
  const eventCounts = await db.requestEventRecord.groupBy({ by: ["requestId"], _count: { _all: true } });
  const countMap = new Map(eventCounts.map((e) => [e.requestId, e._count._all]));
  const rows = records.map((r) => toRequestRow(r as unknown as RequestRecordRow, countMap.get(r.id) ?? 0));

  const now = Date.now();
  const weekAgo = 7 * 86400_000;
  // P6.5-04-i — آمار رویدادها هم‌خوان با نمای دامنه‌دار (فقط رویدادهای درخواست‌های همین نما)
  const scopedIds = new Set(records.map((r) => r.id));
  const eventsAll = (await db.requestEventRecord.findMany({ select: { createdAt: true, requestId: true } })).filter((e) =>
    scopedIds.has(e.requestId)
  );
  const stats: RequestStats = {
    total: records.length,
    manual: records.filter((r) => r.source === "manual").length,
    auto: records.filter((r) => r.source === "auto").length,
    ready: records.filter((r) => r.status === "ready").length,
    draft: records.filter((r) => r.status === "draft").length,
    armRegistered: records.filter((r) => Boolean(r.armRequestId)).length,
    armPending: records.filter((r) => !r.armRequestId && r.status === "ready").length,
    eventsTotal: eventsAll.length,
    eventsThisWeek: eventsAll.filter((e) => now - e.createdAt.getTime() < weekAgo).length,
    newThisWeek: records.filter((r) => now - r.createdAt.getTime() < weekAgo).length,
  };
  return { rows, stats };
}

/** جزئیات یک درخواست + رویدادهایش */
export async function getRequestDetails(id: string): Promise<{ row: RequestRow; events: RequestEventRow[] } | null> {
  const rec = await db.requestRecord.findUnique({ where: { id }, include: { events: { orderBy: { createdAt: "desc" } } } });
  if (!rec) return null;
  const row = toRequestRow(rec as unknown as RequestRecordRow, rec.events.length);
  const events = rec.events.map(toEventRow);
  return { row, events };
}

// ===================== رویدادها (کلید «ثبت رویداد») =====================

export interface RequestEventRow {
  id: string;
  requestId: string;
  eventTypeId: string;
  eventTypeName: string;
  flags: { needTime?: boolean; needHour?: boolean; needMessage?: boolean; needProperty?: boolean };
  date: string | null;
  hour: string | null;
  propertyCode: string | null;
  armPropertyId: string | null;
  message: string | null;
  armEventId: string | null;
  armSyncedAt: string | null;
  createdAt: string;
}

import type { RequestEventRecord } from "@prisma/client";

export function toEventRow(e: RequestEventRecord): RequestEventRow {
  return {
    id: e.id,
    requestId: e.requestId,
    eventTypeId: e.eventTypeId,
    eventTypeName: e.eventTypeName,
    flags: parseJson<RequestEventRow["flags"]>(e.eventTypeFlagsJson, {}),
    date: e.date,
    hour: e.hour,
    propertyCode: e.propertyCode,
    armPropertyId: e.armPropertyId,
    message: e.message,
    armEventId: e.armEventId,
    armSyncedAt: e.armSyncedAt?.toISOString() ?? null,
    createdAt: e.createdAt.toISOString(),
  };
}

export interface CreateEventInput {
  requestId: string;
  eventTypeId: string;
  eventTypeName: string;
  flags?: RequestEventRow["flags"];
  date?: string | null;
  hour?: string | null;
  propertyCode?: string | null;
  armPropertyId?: string | null;
  message?: string | null;
}

/** ثبت رویداد محلی — عین فرم request-events خود سامانه (نوع + تاریخ + ساعت + کدآگهی + پیام) */
export async function createRequestEvent(input: CreateEventInput, actorCode: string): Promise<RequestEventRecord> {
  const event = await db.requestEventRecord.create({
    data: {
      requestId: input.requestId,
      eventTypeId: input.eventTypeId,
      eventTypeName: input.eventTypeName,
      eventTypeFlagsJson: input.flags ? JSON.stringify(input.flags) : null,
      date: input.date ?? null,
      hour: input.hour ?? null,
      propertyCode: input.propertyCode ?? null,
      armPropertyId: input.armPropertyId ?? null,
      message: input.message ?? null,
      actorCode,
    },
  });
  // رویداد جدید یعنی درخواست فعال بوده — updatedAt والد را تازه کن (عین رفتار خود سامانه)
  await db.requestRecord.update({ where: { id: input.requestId }, data: { updatedAt: new Date() } }).catch(() => undefined);
  return event;
}
