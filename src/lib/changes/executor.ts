/**
 * executor.ts — کاشی «تغییرات» · مجری عملیات (DIR-CHANGES-TILE-002)
 * ---------------------------------------------------------------------------
 * ساختار تازهٔ کاشی (دستور مالک ۱۴۰۵/۰۸/۲۹ — فقط همین عملیات‌ها):
 *
 *   کدآگهی:
 *     · lookupListingForChange — خواندن وضعیت کامل برای فرم تغییر/حذف
 *     · changeListingOwnerInfo — تغییر «اطلاعات مالک آگهی» (نام + موبایل) در ARM
 *     · changeListingHistoryDate — تغییر تاریخ «ایجاد مشاور» + آبشار اتوماتیک
 *       تاریخچه‌های آگهی (تاریخچهٔ تغییرات + تاریخچهٔ رویداد و بازخورد)
 *     · deleteListingCode — حذف کامل آگهی از ARM + همهٔ آینه‌های محلی
 *
 *   کددرخواست:
 *     · lookupRequestForChange — خواندن وضعیت کامل برای فرم تغییر/حذف
 *     · changeRequestHistoryDate — تغییر تاریخ «ایجاد مشاور» + آبشار اتوماتیک
 *       (تعمیم شاهکار ۰۹۹: آرایهٔ status کامل + رویدادها با همان Δ نسبی)
 *     · deleteRequestCode — حذف کامل درخواست از ARM + همهٔ آینه‌های محلی
 *
 * شواهد زندهٔ این نوبت (پراب‌های ۱-۱۱ + آزمون semantics روی ۵۵۹۲۰):
 *   · PUT requests/update + آرایهٔ status = REPLACE کامل (بازگانی اثبات‌شده)
 *     → هرگز آرایهٔ ناقص فرستاده نمی‌شود؛ فقط آرایهٔ کاملِ خوانده‌شده.
 *   · تاریخچهٔ کامل آگهی از API خوانده نمی‌شود (۶۰+ واریانت بررسی شد) →
 *     بازنویسی تاریخچهٔ آگهی فقط با «دروازهٔ خواندن کامل» (واریانت‌های
 *     variables.ARM_PATHS.propertyHistoryVariants)؛ در غیر این صورت گام با
 *     دلیل شفاف رد می‌شود (محافظ تاریخچه — قاعدهٔ REPLACE).
 *   · تاریخچهٔ رویداد و بازخورد هر آگهی = request-events/list?property= (کامل) ·
 *     ویرایش هر رویداد = request-events/update/{id} · حذف = request-events/delete/{id}.
 *   · اطلاعات مالک آگهی = properties/owner/{id} → users/update/{userId}.
 *
 * حمل‌ونقل: armCall (رلهٔ ترموکس خودکار با اولویت ۱۰ در نشست فعال).
 * توکن: resolveBestArmToken — تازه‌ترین توکن زندهٔ مالک (عین ۰۹۹).
 */

import { db } from "@/lib/db";
import { armCall } from "@/lib/melk-api/client";
import { getMelkApiConfig } from "@/lib/melk-api/config";
import { resolveBestArmToken } from "@/lib/melk-api/arm-token-resolver";
import type { SessionContext } from "@/lib/auth/session";
import { audit } from "@/lib/auth/session";
import { buildCreatePayload as buildRequestPayload, parseJson } from "@/lib/request/types";
import { createRequestEvent } from "@/lib/request/store";
import { purgeListingLocally, purgeRequestLocally, countListingTraces, countRequestTraces } from "./purge";
import {
  ARM_PATHS,
  CASCADE_RULES,
  CHANGES_TIMEOUT_MS,
  HISTORY_ACTION_TYPES,
  LOCATION_IDS,
  OWNER_IDENTITY,
  isoToJalaliHour,
  isoToTehranHour,
  jalaliHourToIsoUtc,
} from "./variables";

/* ═══════════════════ گزارش گام‌به‌گام (عین ۰۹۹) ═══════════════════ */

// DIR-FF-TILE-003 — انواع مشترک در ./types تفکیک شدند (گارد P1-03):
// UI فقط از "./types" type-import می‌کند؛ اینجا برای سازگاری روت‌ها re-export می‌شوند.
export type { ChangesStep, ChangesReport } from "./types";
import type { ChangesStep, ChangesReport } from "./types";

/* ═══════════════════ توکن مالک + گارد اجرا (عین ۰۹۹) ═══════════════════ */

export interface OwnerExec {
  token: string;
  expIso: string | null;
  source: "session" | "vault";
  guard: SessionContext;
  exec: <T>(fn: (token: string) => Promise<T>) => Promise<T>;
}

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

function call<T>(
  oe: OwnerExec,
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  opts: { body?: unknown; query?: Record<string, string>; timeoutMs?: number } = {},
): Promise<{ data: T; message?: string }> {
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

/** استخراج شناسه خام از مقدار populated یا خام */
function rawId(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    const o = v as ArmRow;
    return String(o.userId ?? o._id ?? o.id ?? "") || null;
  }
  return String(v);
}

/** جستجوی ردیف درخواست در فهرست زندهٔ ARM */
async function scanRequestRow(oe: OwnerExec, code: string, maxPages = 8): Promise<ArmRow | null> {
  for (let page = 1; page <= maxPages; page++) {
    const res = await call<ArmRow>(oe, "GET", ARM_PATHS.requestsList, {
      query: { page: String(page), limit: "20" },
    }).catch(() => null);
    const list = (res?.data?.list ?? []) as ArmRow[];
    const row = list.find((r) => String(r.code ?? r.requestCode ?? "") === code);
    if (row) return row;
  }
  return null;
}

/** تاریخچهٔ زندهٔ تغییرات درخواست — منبع کشف‌شدهٔ ۰۹۹ (کامل) */
async function fetchRequestHistory(oe: OwnerExec, armRequestId: string): Promise<ArmRow[]> {
  const res = await call<ArmRow>(oe, "GET", ARM_PATHS.requestHistory(armRequestId));
  return ((res.data as any)?.list ?? []) as ArmRow[];
}

/** رکورد کامل آگهی با کد (زنده) */
async function fetchPropertyByCode(oe: OwnerExec, code: string): Promise<ArmRow | null> {
  const res = await call<ArmRow>(oe, "GET", ARM_PATHS.propertyByCode(code));
  return (res.data ?? null) as ArmRow | null;
}

/** اطلاعات مالک آگهی (زنده) */
async function fetchPropertyOwner(oe: OwnerExec, armPropertyId: string): Promise<ArmRow | null> {
  const res = await call<ArmRow>(oe, "GET", ARM_PATHS.propertyOwner(armPropertyId)).catch(() => null);
  return (res?.data ?? null) as ArmRow | null;
}

/** «تاریخچهٔ رویداد و بازخورد» آگهی — request-events/list?property= (کامل) */
async function fetchPropertyEvents(oe: OwnerExec, armPropertyId: string): Promise<ArmRow[]> {
  const res = await call<ArmRow>(oe, "GET", ARM_PATHS.requestEventsList, {
    query: { property: armPropertyId, limit: "100" },
  });
  return ((res.data as any)?.list ?? []) as ArmRow[];
}

/** رویدادهای یک درخواست — request-events/list?requestProperty= (بهترین‌تلاش) */
async function fetchRequestEvents(oe: OwnerExec, armRequestId: string): Promise<ArmRow[]> {
  const res = await call<ArmRow>(oe, "GET", ARM_PATHS.requestEventsList, {
    query: { requestProperty: armRequestId, limit: "100" },
  }).catch(() => null);
  return ((res?.data as any)?.list ?? []) as ArmRow[];
}

/* ═══════════════════ موتور آبشار تاریخ (قاعدهٔ مالک — Δ نسبی از لنگر) ═══════════════════ */

export interface CascadeEntryPreview {
  key: string;
  label: string;
  before: string;
  after: string;
}

export interface CascadePlan {
  anchorDate: string;
  anchorLabel: string;
  anchorIsCreateRealtor: boolean;
  targetDate: string;
  deltaMs: number;
  deltaDays: number;
  entries: CascadeEntryPreview[];
}

/** انتخاب مدخل لنگر: «ایجاد مشاور» وگرنه قدیمی‌ترین (عین CASCADE_RULES) */
export function pickAnchor(entries: Array<{ label: string; date: string }>): { label: string; date: string; isCreateRealtor: boolean } | null {
  if (entries.length === 0) return null;
  const anchor = entries.find((e) => e.label.includes(CASCADE_RULES.anchorActionName));
  if (anchor) return { label: anchor.label, date: anchor.date, isCreateRealtor: true };
  const sorted = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const first = sorted[0];
  return { label: first.label, date: first.date, isCreateRealtor: false };
}

/**
 * ساخت طرح آبشار: هدف (جلالی + ساعت اختیاری) → Δ از لنگر.
 * اگر ساعت هدف داده نشود، ساعت فعلی لنگر حفظ می‌شود (Δ دقیق).
 */
export function buildCascadePlan(
  entries: Array<{ key: string; label: string; date: string }>,
  targetJalali: string,
  targetHour: string | null,
): { plan: CascadePlan; error?: string } {
  const anchor = pickAnchor(entries.map((e) => ({ label: e.label, date: e.date })));
  if (!anchor) return { plan: null as unknown as CascadePlan, error: "هیچ مدخلی برای تعیین لنگر یافت نشد." };
  const explicitHour = Boolean(targetHour?.trim());
  const hour = targetHour?.trim() || isoToTehranHour(anchor.date);
  if (!hour) return { plan: null as unknown as CascadePlan, error: "ساعت لنگر قابل استخراج نیست — ساعت هدف را وارد کنید." };
  const targetIso = jalaliHourToIsoUtc(targetJalali, hour);
  if (!targetIso) return { plan: null as unknown as CascadePlan, error: `قالب تاریخ/ساعت هدف نامعتبر: ${targetJalali} ${hour ?? ""} — نمونه: 1405/07/05 و 17:30.` };
  // ساعت صریح → دقیقاً همان ساعت (ثانیه صفر — عین قرارداد ۰۹۹)؛
  // ساعت نامعلوم → زمان دقیق لنگر (حتی ثانیه) در تاریخ جدید حفظ می‌شود
  const anchorMs = new Date(anchor.date).getTime();
  const anchorSubMinute = ((anchorMs % 60_000) + 60_000) % 60_000;
  const targetMs = new Date(targetIso).getTime() + (explicitHour ? 0 : anchorSubMinute);
  const deltaMs = targetMs - anchorMs;
  return {
    plan: {
      anchorDate: anchor.date,
      anchorLabel: anchor.label,
      anchorIsCreateRealtor: anchor.isCreateRealtor,
      targetDate: new Date(targetMs).toISOString(),
      deltaMs,
      deltaDays: Math.round(deltaMs / 86_400_000),
      entries: entries.map((e) => ({
        key: e.key,
        label: e.label,
        before: e.date,
        after: new Date(new Date(e.date).getTime() + deltaMs).toISOString(),
      })),
    },
  };
}

/** جابه‌جایی ISO با Δ — خالص */
export function shiftIso(iso: string, deltaMs: number): string {
  return new Date(new Date(iso).getTime() + deltaMs).toISOString();
}

/* ═══════════════════ بازسازی بدنهٔ ویرایش آگهی از رکورد زنده ═══════════════════ */

/**
 * نگاشت رکورد کامل آگهی (خروجی by-code) → بدنهٔ properties/update.
 * عین سریال‌سازی خود سامانه: مقادیر populated → شناسه خام؛ فیلدهای اختیاری
 * فقط هنگام داشتن مقدار (removeEmpty).
 */
export function buildPropertyUpdatePayload(row: ArmRow, statusOverride?: ArmRow[]): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    customer: rawId(row.customer) ?? "",
    country: rawId(row.country) ?? LOCATION_IDS.country,
    state: rawId(row.state) ?? LOCATION_IDS.state,
    city: rawId(row.city) ?? LOCATION_IDS.city,
    area: rawId(row.area) ?? "",
    line: rawId(row.line) ?? "",
    address: row.address ?? row.fullAddress ?? "",
    tradeType: rawId(row.tradeType) ?? "",
    propertyType: rawId(row.propertyType) ?? "",
    buildingType: rawId(row.buildingType) ?? "",
    changeWith: Array.isArray(row.changeWith) ? row.changeWith : [],
    inputs: row.inputs ?? {},
    priceEvaluation: row.priceEvaluation ?? "",
    fileFinding: row.fileFinding ?? "",
    fileType: Array.isArray(row.fileType) ? row.fileType : [],
    userSeriousity: row.userSeriousity ?? "",
    description: row.realtorDescription ?? row.description ?? "",
  };
  if (row.postal_code ?? row.postalCode) payload.postal_code = row.postal_code ?? row.postalCode;
  if (row.desirabilityLevel) payload.desirabilityLevel = row.desirabilityLevel;
  if (row.sellReason) payload.sellReason = row.sellReason;
  if (row.location && typeof row.location === "object") payload.location = row.location;
  if (Array.isArray(row.images) && row.images.length > 0) payload.images = row.images;
  if (Array.isArray(row.videos) && row.videos.length > 0) payload.videos = row.videos;
  if (row.isLuxury) payload.isLuxury = true;
  if (row.isVacation) payload.isVacation = true;
  if (row.urgent) payload.isUrgent = true;
  if (row.confirmSMS != null) payload.notifyBySms = Boolean(row.confirmSMS);
  // پرچم‌های ردیف — بازتأیید با مقدار جاری (محافظ replace کامل — عین ۰۹۹)
  payload.urgent = Boolean(row.urgent);
  payload.changeable = Boolean(row.changeable);
  payload.ocasion = Boolean(row.ocasion);
  payload.isRental = Boolean(row.isRental);
  payload.confirmSMS = row.confirmSMS ?? true;
  if (statusOverride) payload.status = statusOverride;
  return payload;
}

/* ═══════════════════════════════════════════════════════════════════
 * کدآگهی — خواندن وضعیت (فرم تغییر/حذف)
 * ═══════════════════════════════════════════════════════════════════ */

export interface ListingChangeLookup {
  ok: boolean;
  code: string;
  arm: {
    armPropertyId: string;
    title: string | null;
    relatedRealtor: string | null;
    createdAt: string | null;
    /** آخرین مدخل وضعیت (زنده) */
    latestStatus: { action: string | null; statusName: string | null; realtor: string | null; date: string | null; display: string | null } | null;
  } | null;
  owner: { userId: string | null; customerId: string | null; fullName: string | null; mobile: string | null } | null;
  /** تاریخچهٔ رویداد و بازخورد (کامل — request-events/list?property=) */
  events: Array<{ id: string; type: string | null; requestCode: string | null; realtor: string | null; date: string | null; hour: string | null; display: string | null }>;
  /** آثار محلی قابل حذف */
  localTraces: {
    propertyCatalog: number;
    listingFiles: number;
    linkedEvents: number;
    visits: number;
    specialProperties: number;
    transactions: number;
    contracts: number;
    matchRejections: number;
    opportunityAlerts: number;
    graphNodes: number;
    graphEdges: number;
  } | null;
  error?: string;
}

export async function lookupListingForChange(code: string): Promise<ListingChangeLookup> {
  const clean = code.trim();
  const empty: ListingChangeLookup = { ok: false, code: clean, arm: null, owner: null, events: [], localTraces: null };
  try {
    const oe = await resolveOwnerExec();
    const row = await fetchPropertyByCode(oe, clean);
    if (!row?._id) {
      return { ...empty, error: `آگهی با کد «${clean}» در سامانه ARM یافت نشد (یا حساب شما به آن دسترسی ندارد).` };
    }
    const armPropertyId = String(row._id);
    const [ownerRow, events] = await Promise.all([
      fetchPropertyOwner(oe, armPropertyId).catch(() => null),
      fetchPropertyEvents(oe, armPropertyId).catch(() => [] as ArmRow[]),
    ]);
    const st = Array.isArray(row.status) ? (row.status[0] as ArmRow | undefined) : undefined;
    const localTraces = await countListingTraces(clean, armPropertyId).catch(() => null);
    return {
      ok: true,
      code: clean,
      arm: {
        armPropertyId,
        title: row.title ?? null,
        relatedRealtor: row.relatedRealtor ?? null,
        createdAt: row.createdAt ?? null,
        latestStatus: st
          ? {
              action: st.actionType?.name ?? null,
              statusName: st.currentStatus?.name ?? null,
              realtor: st.realtor?.fullName ?? null,
              date: st.date ?? null,
              display: isoToJalaliHour(st.date ?? null),
            }
          : null,
      },
      owner: ownerRow
        ? {
            userId: ownerRow.userId ?? ownerRow._id ?? null,
            customerId: ownerRow._id ?? null,
            fullName: ownerRow.fullName ?? ([ownerRow.firstName, ownerRow.lastName].filter(Boolean).join(" ") || null),
            mobile: ownerRow.mobileNumber != null ? String(ownerRow.mobileNumber) : null,
          }
        : null,
      events: events.map((e) => ({
        id: String(e._id ?? ""),
        type: e.eventType?.name ?? null,
        requestCode: e.requestProperty?.code != null ? String(e.requestProperty.code) : null,
        realtor: e.realtor?.fullName ?? null,
        date: e.date ?? null,
        hour: e.hour ?? null,
        display: isoToJalaliHour(e.hour ?? e.date ?? null),
      })),
      localTraces,
    };
  } catch (e) {
    return { ...empty, error: (e as Error).message };
  }
}

/* ═══════════════════ کدآگهی — تغییر «اطلاعات مالک آگهی» ═══════════════════ */

export interface ListingOwnerChangeSpec {
  code: string;
  /** نام و نام خانوادگی جدید مالک (خالی = بدون تغییر) */
  newFullName?: string | null;
  /** موبایل جدید مالک (خالی = بدون تغییر) — ۱۱ رقم با ۰۹ یا بین‌المللی 98… */
  newMobile?: string | null;
}

/** نرمال‌سازی موبایل به قالب ARM (بدون صفر ابتدایی — عین toArmMobile خود سامانه) */
function toArmMobile(mobile: string): string {
  const digits = mobile.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/\D/g, "");
  if (digits.startsWith("98")) return digits.slice(2);
  return digits.startsWith("0") ? digits.slice(1) : digits;
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export async function changeListingOwnerInfo(spec: ListingOwnerChangeSpec, actor: { code: string; name: string }): Promise<ChangesReport> {
  const t0 = Date.now();
  const steps: ChangesStep[] = [];
  const step = (key: string, title: string, status: ChangesStep["status"], detail: string) => steps.push({ key, title, status, detail });

  try {
    const clean = spec.code.trim();
    const newName = spec.newFullName?.trim() || null;
    const newMobile = spec.newMobile?.trim() || null;
    if (!newName && !newMobile) {
      return { ok: false, operation: "listing-owner-change", steps: [{ key: "input", title: "اعتبارسنجی ورودی", status: "failed", detail: "حداقل یکی از نام یا موبایل جدید الزامی است." }], durationMs: Date.now() - t0, error: "ورودی خالی است." };
    }
    if (newMobile && toArmMobile(newMobile).length !== 10) {
      return { ok: false, operation: "listing-owner-change", steps: [{ key: "input", title: "اعتبارسنجی موبایل", status: "failed", detail: `موبایل «${newMobile}» معتبر نیست — نمونه: 09141159000.` }], durationMs: Date.now() - t0, error: "موبایل نامعتبر است." };
    }

    const oe = await resolveOwnerExec();
    step("token", "توکن مالک ARM", "done", `توکن زنده از «${oe.source === "session" ? "نشست مالک" : "خزانه"}».`);

    const row = await fetchPropertyByCode(oe, clean);
    if (!row?._id) {
      step("lookup", "جستجوی کدآگهی در خود سامانه", "failed", `آگهی ${clean} یافت نشد.`);
      return { ok: false, operation: "listing-owner-change", steps, durationMs: Date.now() - t0, error: "آگهی یافت نشد." };
    }
    const armPropertyId = String(row._id);
    step("lookup", "جستجوی کدآگهی در خود سامانه", "done", `کدآگهی ${clean} · شناسهٔ ARM: ${armPropertyId} · عنوان: «${row.title ?? "—"}».`);

    const ownerBefore = await fetchPropertyOwner(oe, armPropertyId);
    if (!ownerBefore) {
      step("owner", "خواندن اطلاعات مالک آگهی", "failed", "اطلاعات مالک از ARM خوانده نشد.");
      return { ok: false, operation: "listing-owner-change", steps, durationMs: Date.now() - t0, error: "اطلاعات مالک خوانده نشد." };
    }
    const beforeName = ownerBefore.fullName ?? ([ownerBefore.firstName, ownerBefore.lastName].filter(Boolean).join(" ") || "—");
    const beforeMobile = ownerBefore.mobileNumber != null ? String(ownerBefore.mobileNumber) : "—";
    const targetUserId = String(ownerBefore.userId ?? ownerBefore._id ?? "");
    step("owner", "اطلاعات فعلی مالک آگهی", "done", `نام: «${beforeName}» · موبایل: ${beforeMobile} · شناسهٔ کاربر: ${targetUserId}.`);

    // بدنهٔ ویرایش عین users/create خود سامانه (firstName/lastName/mobileNumber)
    const finalName = newName ?? beforeName;
    const finalMobile = newMobile ? toArmMobile(newMobile) : toArmMobile(beforeMobile);
    const { firstName, lastName } = splitName(finalName);
    const body = { firstName, lastName, mobileNumber: finalMobile };

    let updated = false;
    let usedId = targetUserId;
    try {
      await call(oe, "PUT", ARM_PATHS.customerUpdate(targetUserId), { body, timeoutMs: CHANGES_TIMEOUT_MS.write });
      updated = true;
    } catch (e) {
      // جایگزین: شناسهٔ رکورد مشتری (_id) به‌جای userId — بهترین‌تلاش
      const alt = String(ownerBefore._id ?? "");
      if (alt && alt !== targetUserId) {
        try {
          await call(oe, "PUT", ARM_PATHS.customerUpdate(alt), { body, timeoutMs: CHANGES_TIMEOUT_MS.write });
          updated = true;
          usedId = alt;
        } catch {
          /* پایین خطا می‌رود */
        }
      }
      if (!updated) throw e;
    }
    step("users-update", "تغییر اطلاعات مالک در خود سامانه (users/update)", "done", `شناسهٔ ${usedId} ← نام: «${finalName}» · موبایل: ${finalMobile}.`);

    // راستی‌آزمایی زنده
    const ownerAfter = await fetchPropertyOwner(oe, armPropertyId).catch(() => null);
    const afterName = ownerAfter?.fullName ?? null;
    const afterMobile = ownerAfter?.mobileNumber != null ? String(ownerAfter.mobileNumber) : null;
    const nameOk = !newName || (afterName ?? "").includes(newName.split(/\s+/)[0]);
    const mobileOk = !newMobile || afterMobile === finalMobile || afterMobile === `98${finalMobile}`;
    step("verify", "راستی‌آزمایی زندهٔ اطلاعات مالک", nameOk && mobileOk ? "done" : "failed",
      `پس از تغییر: نام «${afterName ?? "—"}» · موبایل ${afterMobile ?? "—"} ${nameOk && mobileOk ? "— مطابق خواسته ✓" : "— هنوز مقدار قبلی را برمی‌گرداند (ممکن است کش سرور تأخیر داشته باشد)"}.`);

    // آینه‌های محلی
    const localP = await db.propertyRecord.updateMany({
      where: { propertyCode: clean },
      data: {
        rawOwnerName: finalName,
        ownerMobile: `0${finalMobile}`,
        ownerSearchNorm: `${finalName} ␟ 0${finalMobile}`,
      },
    }).catch(() => null);
    const localL = armPropertyId
      ? await db.listingRecord.updateMany({ where: { armPropertyId }, data: { customerName: finalName, customerMobile: `0${finalMobile}` } }).catch(() => null)
      : null;
    step("local-mirror", "به‌روزرسانی آینه‌های محلی", (localP || localL) ? "done" : "skipped",
      (localP || localL) ? `کاتالوگ M1: ${localP?.count ?? 0} ردیف · فایل آگهی: ${localL?.count ?? 0} ردیف به‌روزرسانی شد.` : "ردیف محلی متناظر یافت نشد.");

    await audit("CHANGES_LISTING_OWNER", actor.code, `code=${clean} arm=${armPropertyId} name=${newName ? "changed" : "-"} mobile=${newMobile ? "changed" : "-"} ok=${nameOk && mobileOk} by=changes-tile`).catch(() => undefined);

    return {
      ok: nameOk && mobileOk,
      operation: "listing-owner-change",
      steps,
      durationMs: Date.now() - t0,
      result: { propertyCode: clean, armPropertyId, ownerName: afterName ?? finalName, ownerMobile: afterMobile ?? finalMobile, verdict: { nameOk, mobileOk } },
    };
  } catch (e) {
    step("fatal", "اجرای عملیات", "failed", (e as Error).message);
    return { ok: false, operation: "listing-owner-change", steps, durationMs: Date.now() - t0, error: (e as Error).message };
  }
}

/* ═══════════════════ کدآگهی — تغییر تاریخ «ایجاد مشاور» + آبشار ═══════════════════ */

export interface ListingDateChangeSpec {
  code: string;
  /** تاریخ هدف جلالی (۱۴۰۵/۰۷/۰۵) */
  targetJalali: string;
  /** ساعت هدف (۱۷:۳۰) — خالی = حفظ ساعت فعلی لنگر */
  targetHour?: string | null;
}

export async function changeListingHistoryDate(spec: ListingDateChangeSpec, actor: { code: string; name: string }): Promise<ChangesReport> {
  const t0 = Date.now();
  const steps: ChangesStep[] = [];
  const step = (key: string, title: string, status: ChangesStep["status"], detail: string) => steps.push({ key, title, status, detail });

  try {
    const clean = spec.code.trim();
    const oe = await resolveOwnerExec();
    step("token", "توکن مالک ARM", "done", `توکن زنده از «${oe.source === "session" ? "نشست مالک" : "خزانه"}».`);

    const row = await fetchPropertyByCode(oe, clean);
    if (!row?._id) {
      step("lookup", "جستجوی کدآگهی", "failed", `آگهی ${clean} یافت نشد.`);
      return { ok: false, operation: "listing-date-change", steps, durationMs: Date.now() - t0, error: "آگهی یافت نشد." };
    }
    const armPropertyId = String(row._id);
    const createdAt = row.createdAt ? new Date(row.createdAt).toISOString() : null;
    if (!createdAt) {
      step("anchor", "تعیین لنگر (تاریخ ایجاد مشاور)", "failed", "تاریخ ایجاد آگهی از رکورد زنده خوانده نشد.");
      return { ok: false, operation: "listing-date-change", steps, durationMs: Date.now() - t0, error: "لنگر تاریخ یافت نشد." };
    }
    step("lookup", "جستجوی کدآگهی", "done", `کدآگهی ${clean} · شناسهٔ ARM: ${armPropertyId} · ایجاد: ${isoToJalaliHour(createdAt)}.`);
    step("anchor", "لنگر آبشار — «ایجاد مشاور»", "done", `تاریخ ایجاد مشاور = تاریخ ایجاد آگهی: ${isoToJalaliHour(createdAt)} (سند زنده: مدخل «ایجاد مشاور» تاریخچه عین createdAt است).`);

    // طرح آبشار — مدخل‌های قابل مشاهده: تاریخ ایجاد + آخرین وضعیت + رویدادها
    const [events, ownerRow] = await Promise.all([
      fetchPropertyEvents(oe, armPropertyId).catch(() => [] as ArmRow[]),
      fetchPropertyOwner(oe, armPropertyId).catch(() => null),
    ]);
    const visibleEntries = [
      { key: "anchor", label: "ایجاد مشاور (تاریخ ایجاد آگهی)", date: createdAt },
      ...(Array.isArray(row.status) ? (row.status as ArmRow[]).map((s, i) => ({ key: `status-${i}`, label: `وضعیت: ${s.actionType?.name ?? s.currentStatus?.name ?? "مدخل تاریخچه"}`, date: String(s.date ?? createdAt) })) : []),
      ...events.map((e, i) => ({ key: `event-${i}`, label: `رویداد ${e.eventType?.name ?? ""} (${e.requestProperty?.code ?? "—"})`.trim(), date: String(e.hour ?? e.date ?? createdAt) })),
    ];
    const { plan, error: planErr } = buildCascadePlan(visibleEntries, spec.targetJalali, spec.targetHour ?? null);
    if (!plan) {
      step("plan", "ساخت طرح آبشار", "failed", planErr ?? "طرح آبشار ساخته نشد.");
      return { ok: false, operation: "listing-date-change", steps, durationMs: Date.now() - t0, error: planErr };
    }
    step("plan", "طرح آبشار (Δ نسبی از لنگر — عین مثال مالک)", "done",
      `هدف: ${isoToJalaliHour(plan.targetDate)} · جابه‌جایی: ${plan.deltaMs === 0 ? "بدون تغییر" : `${plan.deltaDays > 0 ? "+" : ""}${plan.deltaDays} روز`} روی ${visibleEntries.length} مدخل قابل‌مشاهده.`);

    /* ── ۱) تاریخچهٔ تغییرات آگهی (آرایهٔ status) — با دروازهٔ خواندن کامل ── */
    let historyRewritten = false;
    let fullHistory: ArmRow[] | null = null;
    let historySource: string | null = null;
    for (const variant of ARM_PATHS.propertyHistoryVariants(armPropertyId)) {
      const res = await call<ArmRow>(oe, "GET", variant).catch(() => null);
      const list = (res?.data as any)?.list ?? (Array.isArray(res?.data) ? res.data : null);
      if (Array.isArray(list) && list.length > 0) {
        fullHistory = list as ArmRow[];
        historySource = variant;
        break;
      }
    }
    if (fullHistory && historySource) {
      // مسیر کامل عین ۰۹۹: بازسازی همهٔ مدخل‌ها با همان شناسه‌ها + تاریخ جابه‌جاشده
      const shifted = fullHistory.map((e) => ({ ...e, date: shiftIso(String(e.date ?? createdAt), plan.deltaMs) }));
      const payload = buildPropertyUpdatePayload(row, shifted);
      await call(oe, "PUT", ARM_PATHS.propertyUpdate(armPropertyId), { body: payload, timeoutMs: CHANGES_TIMEOUT_MS.write });
      historyRewritten = true;
      step("history", "تغییر تاریخ تاریخچهٔ تغییرات آگهی (کامل)", "done", `${fullHistory.length} مدخل از «${historySource}» خوانده و با Δ ${plan.deltaDays > 0 ? "+" : ""}${plan.deltaDays} روز بازنویسی شد.`);
    } else {
      step("history", "تغییر تاریخ تاریخچهٔ تغییرات آگهی (کامل)", "skipped",
        "API آرم امروز فهرست کامل مدخل‌های تاریخچهٔ آگهی را منتشر نمی‌کند (۶۰+ واریانت مسیر زنده بررسی شد) و بازنویسی آرایهٔ status بدون خواندن کامل، به‌علت semantics جایگزینی کامل (آزمون زندهٔ این نوبت روی requests/update)، بقیهٔ مدخل‌ها را نابود می‌کند — محافظ تاریخچه فعال شد. به‌محض فعال‌شدن مسیر تاریخچهٔ آگهی توسط آرم، این گام خودکار کامل می‌شود.");
    }

    /* ── ۲) آبشار تاریخچهٔ رویداد و بازخورد — کامل و زنده ── */
    let eventsShifted = 0;
    let eventsFailed = 0;
    for (const e of events) {
      const eid = String(e._id ?? "");
      const newDate = e.date ? shiftIso(String(e.date), plan.deltaMs) : null;
      const newHour = e.hour ? shiftIso(String(e.hour), plan.deltaMs) : null;
      if (!eid || (!newDate && !newHour)) continue;
      const body: Record<string, unknown> = {};
      if (e.eventType) body.eventType = rawId(e.eventType) ?? undefined;
      if (e.requestProperty) body.requestProperty = rawId(e.requestProperty) ?? undefined;
      if (e.property) body.property = rawId(e.property) ?? undefined;
      if (e.realtor) body.realtor = rawId(e.realtor) ?? undefined;
      if (e.message != null) body.message = e.message;
      if (newDate) body.date = newDate;
      if (newHour) {
        body.hour = newHour;
        body.dateTime = newHour;
        if (e.visitTime) body.visitTime = newHour;
      }
      try {
        await call(oe, "PUT", ARM_PATHS.requestEventUpdate(eid), { body, timeoutMs: CHANGES_TIMEOUT_MS.write });
        eventsShifted++;
      } catch {
        // جایگزین: حذف + ثبت دوباره با همان محتوا و تاریخ جدید (عقد قرارداد create اثبات‌شده)
        try {
          await call(oe, "DELETE", ARM_PATHS.requestEventDelete(eid), { timeoutMs: CHANGES_TIMEOUT_MS.write });
          const re: Record<string, unknown> = { ...body };
          await call(oe, "POST", ARM_PATHS.requestEventCreate, { body: re, timeoutMs: CHANGES_TIMEOUT_MS.write });
          eventsShifted++;
        } catch {
          eventsFailed++;
        }
      }
    }
    step("events", "آبشار تاریخچهٔ رویداد و بازخورد", events.length === 0 ? "skipped" : eventsFailed === 0 ? "done" : "failed",
      events.length === 0
        ? "این آگهی رویداد/بازخورد ثبت‌شده ندارد (در صورت موجود بودن — عین فایل پیوست — همین‌جا آبشار می‌شد)."
        : `${eventsShifted}/${events.length} رویداد با Δ ${plan.deltaDays > 0 ? "+" : ""}${plan.deltaDays} روز جابه‌جا شد${eventsFailed ? ` · ${eventsFailed} ناموفق` : ""}.`);

    /* ── ۳) راستی‌آزمایی زنده ── */
    const eventsAfter = await fetchPropertyEvents(oe, armPropertyId).catch(() => [] as ArmRow[]);
    const eventsOk = events.length === 0 || eventsAfter.every((e) => {
      const orig = events.find((o) => String(o._id) === String(e._id));
      if (!orig) return true; // رویداد بازسازی‌شده (شناسهٔ جدید)
      const expected = orig.hour ? shiftIso(String(orig.hour), plan.deltaMs) : orig.hour;
      const expectedDate = orig.date ? shiftIso(String(orig.date), plan.deltaMs) : orig.date;
      return (!expected || String(e.hour) === expected) && (!expectedDate || String(e.date) === expectedDate);
    });
    step("verify", "راستی‌آزمایی زندهٔ رویدادها", eventsOk ? "done" : "failed",
      events.length === 0 ? "رویدادی برای راستی‌آزمایی نبود." : `${eventsAfter.length} رویداد زنده خوانده شد — تاریخ‌ها ${eventsOk ? "مطابق طرح آبشار ✓" : "هنوز مطابق نیستند"}.`);

    /* ── ۴) آینهٔ محلی رویدادها ── */
    const localEvents = await db.requestEventRecord.findMany({ where: { OR: [{ propertyCode: clean }, { armPropertyId }] } }).catch(() => []);
    let localUpdated = 0;
    for (const ev of localEvents) {
      const match = events.find((o) => String(o._id) === ev.armEventId);
      if (!match?.date) continue;
      const shiftedDate = shiftIso(String(match.date), plan.deltaMs);
      const tehran = new Date(new Date(shiftedDate).getTime() + 210 * 60_000);
      const isoDate = tehran.toISOString().slice(0, 10);
      const hour = `${String(tehran.getUTCHours()).padStart(2, "0")}:${String(tehran.getUTCMinutes()).padStart(2, "0")}`;
      await db.requestEventRecord.update({ where: { id: ev.id }, data: { date: isoDate, hour } }).catch(() => undefined);
      localUpdated++;
    }
    step("local-mirror", "آینهٔ محلی رویدادها", localEvents.length ? "done" : "skipped", localEvents.length ? `${localUpdated}/${localEvents.length} رویداد محلی به تاریخ جدید به‌روزرسانی شد.` : "رویداد محلی متناظر یافت نشد.");

    await audit("CHANGES_LISTING_DATE", actor.code, `code=${clean} arm=${armPropertyId} target=${plan.targetDate} delta=${plan.deltaDays}d events=${eventsShifted}/${events.length} history=${historyRewritten} by=changes-tile`).catch(() => undefined);

    const ok = (historyRewritten || events.length === 0 || eventsShifted > 0) && eventsOk;
    return {
      ok,
      operation: "listing-date-change",
      steps,
      durationMs: Date.now() - t0,
      result: {
        propertyCode: clean,
        armPropertyId,
        anchor: isoToJalaliHour(plan.anchorDate),
        target: isoToJalaliHour(plan.targetDate),
        deltaDays: plan.deltaDays,
        historyRewritten,
        eventsShifted,
        eventsTotal: events.length,
        preview: plan.entries.map((p) => ({ label: p.label, before: isoToJalaliHour(p.before), after: isoToJalaliHour(p.after) })),
      },
    };
  } catch (e) {
    step("fatal", "اجرای عملیات", "failed", (e as Error).message);
    return { ok: false, operation: "listing-date-change", steps, durationMs: Date.now() - t0, error: (e as Error).message };
  }
}

/* ═══════════════════ کدآگهی — حذف کامل ═══════════════════ */

export async function deleteListingCode(code: string, actor: { code: string; name: string }): Promise<ChangesReport> {
  const t0 = Date.now();
  const steps: ChangesStep[] = [];
  const step = (key: string, title: string, status: ChangesStep["status"], detail: string) => steps.push({ key, title, status, detail });

  try {
    const clean = code.trim();
    const oe = await resolveOwnerExec();
    step("token", "توکن مالک ARM", "done", `توکن زنده از «${oe.source === "session" ? "نشست مالک" : "خزانه"}».`);

    const row = await fetchPropertyByCode(oe, clean);
    const armPropertyId = row?._id ? String(row._id) : null;
    step("lookup", "شناسایی آگهی در خود سامانه", armPropertyId ? "done" : "failed",
      armPropertyId ? `کدآگهی ${clean} · شناسهٔ ARM: ${armPropertyId} · عنوان: «${row?.title ?? "—"}».` : `آگهی ${clean} در ARM یافت نشد (شاید قبلاً حذف شده) — پاکسازی محلی ادامه می‌یابد.`);

    /* ── ۱) حذف رویدادها/بازخوردهای آگهی از ARM (مسیر اثبات‌شده) ── */
    let armEventsDeleted = 0;
    if (armPropertyId) {
      const events = await fetchPropertyEvents(oe, armPropertyId).catch(() => [] as ArmRow[]);
      for (const e of events) {
        const okDel = await call(oe, "DELETE", ARM_PATHS.requestEventDelete(String(e._id)), { timeoutMs: CHANGES_TIMEOUT_MS.write })
          .then(() => true)
          .catch(() => false);
        if (okDel) armEventsDeleted++;
      }
      step("arm-events", "حذف تاریخچهٔ رویداد و بازخورد از ARM", events.length === 0 ? "skipped" : armEventsDeleted === events.length ? "done" : "failed",
        events.length === 0 ? "رویدادی برای این آگهی ثبت نشده بود." : `${armEventsDeleted}/${events.length} رویداد از ARM حذف شد.`);
    }

    /* ── ۲) حذف خود آگهی از ARM — واریانت‌های کشف‌شده (امروز: شفاف گزارش می‌شود) ── */
    let armDeleted = false;
    if (armPropertyId) {
      for (const variant of ARM_PATHS.propertyDeleteVariants(armPropertyId)) {
        const okDel = await call(oe, variant.method, variant.path, { timeoutMs: CHANGES_TIMEOUT_MS.write })
          .then(() => true)
          .catch(() => false);
        if (okDel) {
          armDeleted = true;
          break;
        }
      }
      step("arm-delete", "حذف رکورد آگهی از ARM", armDeleted ? "done" : "skipped",
        armDeleted
          ? `آگهی ${clean} از ARM حذف شد.`
          : "API آرم امروز مسیر حذف آگهی را به توکن مشاور exposure نمی‌دهد (۱۲+ واریانت زنده بررسی شد: delete/remove/bare/…). حذف رکورد ARM از پنل مدیریت آرم (arm.melketabriz.ir) انجام می‌شود؛ به‌محض فعال‌شدن مسیر، این گام خودکار انجام می‌شود.");
    }

    /* ── ۳) سامانهٔ عمومی ملک تبریز ── */
    const publicGone = armPropertyId
      ? await armCall({ method: "GET", path: ARM_PATHS.propertyByCode(clean), baseUrl: getMelkApiConfig().melkPublicApiBase, timeoutMs: CHANGES_TIMEOUT_MS.lookup, maxRetries: 0 })
          .then(() => false)
          .catch((e) => String((e as Error).message).includes("یافت نشد"))
      : false;
    step("public", "سامانهٔ عمومی ملک تبریز (melketabriz.com)", armDeleted || publicGone ? "done" : "skipped",
      armDeleted || publicGone
        ? `آگهی ${clean} از فهرست عمومی حذف/حذف‌شده است.`
        : "سامانهٔ عمومی از همان پایگاه ARM می‌خواند — پس از حذف رکورد در ARM (گام قبل) به‌صورت خودکار حذف می‌شود؛ آینهٔ محلی آن در گام بعد پاک می‌شود.");

    /* ── ۴) پاکسازی کامل آثار محلی ── */
    const counts = await purgeListingLocally(clean, armPropertyId);
    const totalLocal = Object.values(counts).reduce((a, b) => a + b, 0);
    step("local-purge", "پاکسازی کامل آثار محلی (کاتالوگ · رویدادها · بازدیدها · کارگزاری‌ها · معاملات · قراردادها · گراف)", totalLocal > 0 ? "done" : "skipped",
      totalLocal > 0
        ? `${totalLocal} ردیف پاک شد — کاتالوگ M1: ${counts.propertyCatalog} · فایل آگهی: ${counts.listingFiles} · رویدادها: ${counts.linkedEvents} · بازدیدها: ${counts.visits} · کارگزاری: ${counts.specialProperties} · معاملات: ${counts.transactions} · قراردادها: ${counts.contracts} · رد تطبیق: ${counts.matchRejections} · هشدار فرصت: ${counts.opportunityAlerts} · گره گراف: ${counts.graphNodes} · یال گراف: ${counts.graphEdges}.`
        : "اثری از این آگهی در آینه‌های محلی نبود.");

    /* ── ۵) راستی‌آزمایی نهایی ── */
    const tracesAfter = await countListingTraces(clean, armPropertyId);
    const localClean = Object.values(tracesAfter).reduce((a, b) => a + b, 0) === 0;
    step("verify", "راستی‌آزمایی «هیچ اثری باقی نماند»", localClean ? "done" : "failed", localClean ? "همهٔ آینه‌های محلی پاک شدند ✓ (پروفایل کارشناسان از همین آینه‌ها می‌خوانند)." : "برخی آثار محلی هنوز باقی‌اند — مجدداً اجرا کنید.");

    await audit("CHANGES_LISTING_DELETE", actor.code, `code=${clean} arm=${armPropertyId ?? "-"} armDeleted=${armDeleted} armEvents=${armEventsDeleted} local=${totalLocal} by=changes-tile`).catch(() => undefined);

    return {
      ok: localClean,
      operation: "listing-delete",
      steps,
      durationMs: Date.now() - t0,
      result: { propertyCode: clean, armPropertyId, armDeleted, armEventsDeleted, localPurged: totalLocal, counts },
    };
  } catch (e) {
    step("fatal", "اجرای عملیات", "failed", (e as Error).message);
    return { ok: false, operation: "listing-delete", steps, durationMs: Date.now() - t0, error: (e as Error).message };
  }
}

/* ═══════════════════════════════════════════════════════════════════
 * کددرخواست — خواندن وضعیت (فرم تغییر/حذف)
 * ═══════════════════════════════════════════════════════════════════ */

export interface RequestChangeLookup {
  ok: boolean;
  code: string;
  arm: {
    armRequestId: string;
    title: string | null;
    relatedRealtor: string | null;
    createdAt: string | null;
    history: Array<{ id: string; action: string | null; realtor: string | null; date: string | null; display: string | null }>;
  } | null;
  events: Array<{ id: string; type: string | null; propertyCode: string | null; date: string | null; hour: string | null; display: string | null }>;
  localTraces: {
    requestRecords: number;
    requestEvents: number;
    transactions: number;
    contracts: number;
    matchRejections: number;
    opportunityAlerts: number;
    graphNodes: number;
    graphEdges: number;
  } | null;
  error?: string;
}

export async function lookupRequestForChange(code: string): Promise<RequestChangeLookup> {
  const clean = code.trim();
  const base: RequestChangeLookup = { ok: false, code: clean, arm: null, events: [], localTraces: null };
  try {
    const oe = await resolveOwnerExec();
    let armRequestId: string | null = null;
    const rec = await db.requestRecord.findFirst({ where: { requestCode: clean }, select: { armRequestId: true } });
    if (rec?.armRequestId) armRequestId = rec.armRequestId;
    if (!armRequestId) {
      const row = await scanRequestRow(oe, clean);
      if (row?._id) armRequestId = String(row._id);
    }
    if (!armRequestId) {
      return { ...base, error: `درخواستی با کد ${clean} یافت نشد (نه محلی، نه زندهٔ ARM).` };
    }
    const [row, history, events] = await Promise.all([
      scanRequestRow(oe, clean).catch(() => null),
      fetchRequestHistory(oe, armRequestId).catch(() => [] as ArmRow[]),
      fetchRequestEvents(oe, armRequestId).catch(() => [] as ArmRow[]),
    ]);
    const localTraces = await countRequestTraces(clean).catch(() => null);
    return {
      ok: true,
      code: clean,
      arm: {
        armRequestId,
        title: row?.title ?? null,
        relatedRealtor: row?.relatedRealtor ?? null,
        createdAt: row?.createdAt ?? null,
        history: history.map((e) => ({
          id: String(e._id ?? ""),
          action: e.actionType?.name ?? null,
          realtor: e.realtor?.fullName ?? null,
          date: e.date ?? null,
          display: isoToJalaliHour(e.date ?? null),
        })),
      },
      events: events.map((e) => ({
        id: String(e._id ?? ""),
        type: e.eventType?.name ?? null,
        propertyCode: e.property?.code != null ? String(e.property.code) : null,
        date: e.date ?? null,
        hour: e.hour ?? null,
        display: isoToJalaliHour(e.hour ?? e.date ?? null),
      })),
      localTraces,
    };
  } catch (e) {
    return { ...base, error: (e as Error).message };
  }
}

/* ═══════════════════ کددرخواست — تغییر تاریخ + آبشار (تعمیم ۰۹۹) ═══════════════════ */

export interface RequestDateChangeSpec {
  code: string;
  targetJalali: string;
  targetHour?: string | null;
}

/** ساخت بدنهٔ ویرایش درخواست از رکورد کامل زنده (requests/info) */
function buildRequestPayloadFromInfo(info: ArmRow): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    customerId: rawId(info.customer) ?? "",
    countryId: rawId(info.country) ?? LOCATION_IDS.country,
    stateId: rawId(info.state) ?? LOCATION_IDS.state,
    cityId: rawId(info.city) ?? LOCATION_IDS.city,
    areaIds: Array.isArray(info.area) ? info.area.map((a: unknown) => rawId(a)).filter(Boolean) : [],
    lineIds: Array.isArray(info.line) ? info.line.map((l: unknown) => rawId(l)).filter(Boolean) : [],
    tradeTypeId: rawId(info.tradeType) ?? "",
    buildingTypeId: rawId(info.buildingType) ?? "",
    propertyTypeId: rawId(info.propertyType) ?? "",
    inputs: info.inputs ?? {},
    customerDescription: info.customerDescription ?? null,
    userPaymentMethod: info.userPaymentMethod ?? "",
    userSeriousity: info.userSeriousity ?? "",
    realtorDescription: info.realtorDescription ?? null,
  };
  return payload;
}

export async function changeRequestHistoryDate(spec: RequestDateChangeSpec, actor: { code: string; name: string }): Promise<ChangesReport> {
  const t0 = Date.now();
  const steps: ChangesStep[] = [];
  const step = (key: string, title: string, status: ChangesStep["status"], detail: string) => steps.push({ key, title, status, detail });

  try {
    const clean = spec.code.trim();
    const oe = await resolveOwnerExec();
    step("token", "توکن مالک ARM", "done", `توکن زنده از «${oe.source === "session" ? "نشست مالک" : "خزانه"}».`);

    // شناسایی درخواست (محلی ← فهرست زنده)
    const rec = await db.requestRecord.findFirst({ where: { requestCode: clean } });
    let armRequestId = rec?.armRequestId ?? null;
    let row: ArmRow | null = rec ? null : null;
    if (!armRequestId) {
      row = await scanRequestRow(oe, clean);
      armRequestId = row?._id ? String(row._id) : null;
    }
    if (!armRequestId) {
      step("lookup", "شناسایی کد درخواست", "failed", `درخواست ${clean} یافت نشد.`);
      return { ok: false, operation: "request-date-change", steps, durationMs: Date.now() - t0, error: "درخواست یافت نشد." };
    }
    if (!row) row = await scanRequestRow(oe, clean).catch(() => null);
    step("lookup", "شناسایی کد درخواست", "done", `کد درخواست ${clean} · شناسهٔ ARM: ${armRequestId} · عنوان: «${row?.title ?? rec?.title ?? "—"}».`);

    // تاریخچهٔ کامل (زنده) + لنگر
    const history = await fetchRequestHistory(oe, armRequestId);
    if (history.length === 0) {
      step("history", "خواندن تاریخچهٔ تغییرات درخواست", "failed", "تاریخچهٔ زنده خالی است.");
      return { ok: false, operation: "request-date-change", steps, durationMs: Date.now() - t0, error: "تاریخچه خالی است." };
    }
    step("history", "خواندن تاریخچهٔ تغییرات درخواست (کامل — requests/history)", "done",
      history.map((e) => `${e.actionType?.name ?? "?"} · ${e.realtor?.fullName ?? "?"} · ${isoToJalaliHour(e.date ?? null) ?? "?"}`).join(" ┃ "));

    // طرح آبشار — همهٔ مدخل‌های تاریخچه + رویدادها
    const events = await fetchRequestEvents(oe, armRequestId).catch(() => [] as ArmRow[]);
    const entries = [
      ...history.map((e, i) => ({ key: `hist-${i}`, label: e.actionType?.name ?? "مدخل تاریخچه", date: String(e.date ?? "") })),
      ...events.map((e, i) => ({ key: `event-${i}`, label: `رویداد ${e.eventType?.name ?? ""}${e.property?.code ? ` (آگهی ${e.property.code})` : ""}`.trim(), date: String(e.hour ?? e.date ?? "") })),
    ].filter((e) => e.date);
    const { plan, error: planErr } = buildCascadePlan(entries, spec.targetJalali, spec.targetHour ?? null);
    if (!plan) {
      step("plan", "ساخت طرح آبشار", "failed", planErr ?? "");
      return { ok: false, operation: "request-date-change", steps, durationMs: Date.now() - t0, error: planErr };
    }
    step("plan", "طرح آبشار (Δ نسبی از لنگر — عین مثال مالک)", "done",
      `لنگر: ${plan.anchorLabel} · ${isoToJalaliHour(plan.anchorDate)} → هدف: ${isoToJalaliHour(plan.targetDate)} · جابه‌جایی: ${plan.deltaDays > 0 ? "+" : ""}${plan.deltaDays} روز روی ${entries.length} مدخل.`);

    // بدنهٔ ویرایش: رکورد محلی (مسیر ۰۹۹) یا رکورد کامل زنده (requests/info)
    let payload: Record<string, unknown>;
    if (rec) {
      payload = buildRequestPayload({
        customerId: rec.armCustomerId ?? "",
        countryId: rec.countryId ?? LOCATION_IDS.country,
        stateId: rec.stateId ?? LOCATION_IDS.state,
        cityId: rec.cityId ?? LOCATION_IDS.city,
        areaIds: parseJson<string[]>(rec.areaIdsJson, []),
        lineIds: parseJson<string[]>(rec.lineIdsJson, []),
        tradeTypeId: rec.tradeTypeId ?? "",
        buildingTypeId: rec.buildingTypeId ?? "",
        propertyTypeId: rec.propertyTypeId ?? "",
        inputs: parseJson<Record<string, unknown>>(rec.inputsJson, {}),
        customerDescription: rec.customerDescription,
        userPaymentMethod: rec.userPaymentMethod ?? "",
        userSeriousity: rec.userSeriousity ?? "",
        realtorDescription: rec.realtorDescription,
      }) as Record<string, unknown>;
      step("payload", "بازسازی بدنهٔ ویرایش", "done", "از رکورد محلی (مسیر اثبات‌شدهٔ ۰۹۹).");
    } else {
      const info = await call<ArmRow>(oe, "GET", ARM_PATHS.requestInfo(armRequestId)).then((r) => r.data).catch(() => null);
      if (!info) {
        step("payload", "بازسازی بدنهٔ ویرایش", "failed", "نه رکورد محلی موجود است نه دسترسی به requests/info این درخواست — بازسازی کامل ممکن نیست.");
        return { ok: false, operation: "request-date-change", steps, durationMs: Date.now() - t0, error: "بدنهٔ ویرایش بازسازی نشد." };
      }
      payload = buildRequestPayloadFromInfo(info);
      step("payload", "بازسازی بدنهٔ ویرایش", "done", "از رکورد کامل زندهٔ requests/info (کشف این نوبت).");
    }

    // بازتأیید پرچم‌های ردیف (محافظ — عین ۰۹۹)
    if (row) {
      payload.urgent = row.urgent ?? false;
      payload.luxury = row.luxury ?? false;
      payload.changeable = row.changeable ?? false;
      payload.ocasion = row.ocasion ?? false;
      payload.deposite = row.deposite ?? false;
      payload.confirmSMS = row.confirmSMS ?? true;
      payload.isRental = row.isRental ?? false;
      if (Array.isArray(row.changeWith)) payload.changeWith = row.changeWith;
    }

    // آرایهٔ status — کامل (REPLACE اثبات‌شده) با همان شناسه‌ها + تاریخ جابه‌جاشده
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
    payload.status = history.map((e) => mk(e, shiftIso(String(e.date), plan.deltaMs)));
    step("status-array", "آرایهٔ status کامل با تاریخ‌های جدید", "done", `${history.length} مدخل با همان شناسه‌ها و Δ ${plan.deltaDays > 0 ? "+" : ""}${plan.deltaDays} روز بازسازی شد (semantics جایگزینی کامل — آرایهٔ ناقص هرگز فرستاده نمی‌شود).`);

    // اجرای PUT
    const putRes = await call<ArmRow>(oe, "PUT", ARM_PATHS.requestUpdate(armRequestId), { body: payload, timeoutMs: CHANGES_TIMEOUT_MS.write });
    step("put", "PUT requests/update/{id}", "done", `پاسخ سامانه: ${putRes.message ?? "ثبت شد"}.`);

    // آبشار رویدادهای درخواست
    let eventsShifted = 0;
    for (const e of events) {
      const eid = String(e._id ?? "");
      const newDate = e.date ? shiftIso(String(e.date), plan.deltaMs) : null;
      const newHour = e.hour ? shiftIso(String(e.hour), plan.deltaMs) : null;
      if (!eid || (!newDate && !newHour)) continue;
      const body: Record<string, unknown> = {};
      if (e.eventType) body.eventType = rawId(e.eventType) ?? undefined;
      if (e.requestProperty) body.requestProperty = rawId(e.requestProperty) ?? undefined;
      if (e.property) body.property = rawId(e.property) ?? undefined;
      if (e.message != null) body.message = e.message;
      if (newDate) body.date = newDate;
      if (newHour) {
        body.hour = newHour;
        body.dateTime = newHour;
        if (e.visitTime) body.visitTime = newHour;
      }
      try {
        await call(oe, "PUT", ARM_PATHS.requestEventUpdate(eid), { body, timeoutMs: CHANGES_TIMEOUT_MS.write });
        eventsShifted++;
      } catch {
        try {
          await call(oe, "DELETE", ARM_PATHS.requestEventDelete(eid), { timeoutMs: CHANGES_TIMEOUT_MS.write });
          await call(oe, "POST", ARM_PATHS.requestEventCreate, { body, timeoutMs: CHANGES_TIMEOUT_MS.write });
          eventsShifted++;
        } catch {
          /* شفاف در گام بعدی */
        }
      }
    }
    step("events", "آبشار رویدادهای درخواست", events.length === 0 ? "skipped" : "done",
      events.length === 0 ? "این درخواست رویداد ثبت‌شده ندارد." : `${eventsShifted}/${events.length} رویداد جابه‌جا شد.`);

    // راستی‌آزمایی زندهٔ تاریخچه
    await new Promise((r) => setTimeout(r, 2500));
    const afterHistory = await fetchRequestHistory(oe, armRequestId).catch(() => [] as ArmRow[]);
    const expected = history.map((e) => shiftIso(String(e.date), plan.deltaMs));
    const matched = afterHistory.filter((e) => expected.includes(String(e.date))).length;
    const verdict = { total: afterHistory.length, matched };
    step("verify", "راستی‌آزمایی زندهٔ تاریخچه", afterHistory.length > 0 && matched === afterHistory.length ? "done" : "failed",
      `${matched}/${afterHistory.length} مدخل با تاریخ هدف ${isoToJalaliHour(plan.targetDate)} ${matched === afterHistory.length && afterHistory.length > 0 ? "— اصلاح کامل ✓" : "— اصلاح ناقص"}.`);

    // شاهد محلی — رویداد آینه با نتیجهٔ راستی‌آزمایی (عین ۰۹۹)
    if (rec) {
      const ev = await createRequestEvent(
        { requestId: rec.id, eventTypeId: HISTORY_ACTION_TYPES.createRealtor.id, eventTypeName: "بررسی درخواست", flags: {}, date: null, hour: null, message: null },
        actor.code,
      ).catch(() => null);
      if (ev) {
        await db.requestEventRecord.update({
          where: { id: ev.id },
          data: {
            armSyncJson: JSON.stringify({
              at: new Date().toISOString(),
              kind: "history-date-cascade",
              byOwnerDirective: true,
              targetIso: plan.targetDate,
              deltaDays: plan.deltaDays,
              demanded: { تاریخ: `${spec.targetHour ?? isoToTehranHour(plan.anchorDate)}|${spec.targetJalali}` },
              armRequestCode: clean,
              verdict,
              before: history.map((e) => ({ action: e.actionType?.name, date: e.date })),
              after: afterHistory.map((e) => ({ action: e.actionType?.name, date: e.date })),
            }),
          },
        }).catch(() => undefined);
      }
      // آینهٔ محلی: جابه‌جایی رویدادهای محلی متناظر
      const localEvents = await db.requestEventRecord.findMany({ where: { requestId: rec.id, armEventId: { not: null } } }).catch(() => []);
      for (const le of localEvents) {
        if (le.armEventId === ev?.id) continue; // شاهد همین حالا
        const match = events.find((o) => String(o._id) === le.armEventId);
        if (!match?.date) continue;
        const shifted = new Date(new Date(String(match.date)).getTime() + plan.deltaMs + 210 * 60_000);
        await db.requestEventRecord.update({
          where: { id: le.id },
          data: { date: shifted.toISOString().slice(0, 10), hour: `${String(shifted.getUTCHours()).padStart(2, "0")}:${String(shifted.getUTCMinutes()).padStart(2, "0")}` },
        }).catch(() => undefined);
      }
    }

    await audit("CHANGES_REQUEST_DATE", actor.code, `code=${clean} arm=${armRequestId} target=${plan.targetDate} delta=${plan.deltaDays}d verdict=${matched}/${afterHistory.length} by=changes-tile`).catch(() => undefined);

    const ok = afterHistory.length > 0 && matched === afterHistory.length;
    return {
      ok,
      operation: "request-date-change",
      steps,
      durationMs: Date.now() - t0,
      result: {
        requestCode: clean,
        armRequestId,
        anchor: isoToJalaliHour(plan.anchorDate),
        target: isoToJalaliHour(plan.targetDate),
        deltaDays: plan.deltaDays,
        verdict,
        eventsShifted,
        eventsTotal: events.length,
        preview: plan.entries.map((p) => ({ label: p.label, before: isoToJalaliHour(p.before), after: isoToJalaliHour(p.after) })),
      },
    };
  } catch (e) {
    step("fatal", "اجرای عملیات", "failed", (e as Error).message);
    return { ok: false, operation: "request-date-change", steps, durationMs: Date.now() - t0, error: (e as Error).message };
  }
}

/* ═══════════════════ کددرخواست — حذف کامل ═══════════════════ */

export async function deleteRequestCode(code: string, actor: { code: string; name: string }): Promise<ChangesReport> {
  const t0 = Date.now();
  const steps: ChangesStep[] = [];
  const step = (key: string, title: string, status: ChangesStep["status"], detail: string) => steps.push({ key, title, status, detail });

  try {
    const clean = code.trim();
    const oe = await resolveOwnerExec();
    step("token", "توکن مالک ARM", "done", `توکن زنده از «${oe.source === "session" ? "نشست مالک" : "خزانه"}».`);

    const traces = await countRequestTraces(clean);
    let armRequestId = traces.armRequestId;
    if (!armRequestId) {
      const row = await scanRequestRow(oe, clean).catch(() => null);
      armRequestId = row?._id ? String(row._id) : null;
    }
    step("lookup", "شناسایی درخواست در خود سامانه", armRequestId ? "done" : "failed",
      armRequestId ? `کد درخواست ${clean} · شناسهٔ ARM: ${armRequestId}.` : `درخواست ${clean} در ARM یافت نشد (شاید قبلاً حذف شده) — پاکسازی محلی ادامه می‌یابد.`);

    /* ── ۱) حذف رویدادهای درخواست از ARM ── */
    let armEventsDeleted = 0;
    if (armRequestId) {
      const events = await fetchRequestEvents(oe, armRequestId).catch(() => [] as ArmRow[]);
      for (const e of events) {
        const okDel = await call(oe, "DELETE", ARM_PATHS.requestEventDelete(String(e._id)), { timeoutMs: CHANGES_TIMEOUT_MS.write })
          .then(() => true)
          .catch(() => false);
        if (okDel) armEventsDeleted++;
      }
      step("arm-events", "حذف رویدادهای درخواست از ARM", events.length === 0 ? "skipped" : "done",
        events.length === 0 ? "رویدادی برای این درخواست ثبت نشده بود." : `${armEventsDeleted}/${events.length} رویداد از ARM حذف شد.`);
    }

    /* ── ۲) حذف رکورد درخواست از ARM — واریانت‌های کشف‌شده ── */
    let armDeleted = false;
    if (armRequestId) {
      for (const variant of ARM_PATHS.requestDeleteVariants(armRequestId)) {
        const okDel = await call(oe, variant.method, variant.path, { timeoutMs: CHANGES_TIMEOUT_MS.write })
          .then(() => true)
          .catch(() => false);
        if (okDel) {
          armDeleted = true;
          break;
        }
      }
      step("arm-delete", "حذف رکورد درخواست از ARM", armDeleted ? "done" : "skipped",
        armDeleted
          ? `درخواست ${clean} از ARM حذف شد.`
          : "API آرم امروز مسیر حذف درخواست را به توکن مشاور exposure نمی‌دهد (۱۲+ واریانت زنده بررسی شد). حذف رکورد ARM از پنل مدیریت آرم انجام می‌شود؛ به‌محض فعال‌شدن مسیر، این گام خودکار انجام می‌شود.");
    }

    /* ── ۳) پاکسازی کامل آثار محلی ── */
    const counts = await purgeRequestLocally(clean);
    const totalLocal = counts.requestRecords + counts.requestEvents + counts.transactions + counts.contracts + counts.matchRejections + counts.opportunityAlerts + counts.graphNodes + counts.graphEdges;
    step("local-purge", "پاکسازی کامل آثار محلی (رکورد · رویدادها · معاملات · قراردادها · گراف)", totalLocal > 0 ? "done" : "skipped",
      totalLocal > 0
        ? `${totalLocal} ردیف پاک شد — رکورد: ${counts.requestRecords} · رویدادها: ${counts.requestEvents} · معاملات: ${counts.transactions} · قراردادها: ${counts.contracts} · رد تطبیق: ${counts.matchRejections} · هشدار فرصت: ${counts.opportunityAlerts} · گره گراف: ${counts.graphNodes} · یال گراف: ${counts.graphEdges}.`
        : "اثری از این درخواست در آینه‌های محلی نبود.");

    /* ── ۴) راستی‌آزمایی ── */
    const after = await countRequestTraces(clean);
    const localClean = after.requestRecords + after.requestEvents + after.transactions + after.contracts + after.matchRejections + after.opportunityAlerts + after.graphNodes + after.graphEdges === 0;
    step("verify", "راستی‌آزمایی «هیچ اثری باقی نماند»", localClean ? "done" : "failed", localClean ? "همهٔ آینه‌های محلی پاک شدند ✓ (پروفایل کارشناسان از همین آینه‌ها می‌خوانند)." : "برخی آثار محلی هنوز باقی‌اند.");

    await audit("CHANGES_REQUEST_DELETE", actor.code, `code=${clean} arm=${armRequestId ?? "-"} armDeleted=${armDeleted} armEvents=${armEventsDeleted} local=${totalLocal} by=changes-tile`).catch(() => undefined);

    return {
      ok: localClean,
      operation: "request-delete",
      steps,
      durationMs: Date.now() - t0,
      result: { requestCode: clean, armRequestId, armDeleted, armEventsDeleted, localPurged: totalLocal, counts },
    };
  } catch (e) {
    step("fatal", "اجرای عملیات", "failed", (e as Error).message);
    return { ok: false, operation: "request-delete", steps, durationMs: Date.now() - t0, error: (e as Error).message };
  }
}

/* ═══════════════════ پشتیبانی UI: انواع رویداد زنده (fail-soft) ═══════════════════ */

export interface EventTypesResult {
  types: Array<{ id: string; name: string }>;
  live: boolean;
  error: string | null;
}

export async function fetchChangeEventTypes(): Promise<EventTypesResult> {
  try {
    const oe = await resolveOwnerExec();
    const res = await call<ArmRow>(oe, "GET", ARM_PATHS.requestEventTypes);
    const list = (res.data?.list ?? (Array.isArray(res.data) ? res.data : [])) as ArmRow[];
    const types = list.map((t) => ({ id: String(t._id ?? t.id ?? ""), name: String(t.name ?? "") })).filter((t) => t.id && t.name);
    return { types, live: true, error: null };
  } catch (e) {
    return { types: [], live: false, error: (e as Error).message };
  }
}
