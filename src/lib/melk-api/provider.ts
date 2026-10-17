/**
 * رابط Provider — قرارداد یکسان اتصال به سامانه‌های واقعی ملک تبریز
 * ------------------------------------------------------
 * ✅ اتصال واقعی (بدون هیچ داده دمو/شبیه‌ساز):
 *   ARM:  arus-api.melketabriz.ir/api/apm/     (احراز هویت OTP + داده‌ها)
 *   PM:   pm-api.melketabriz.ir/api/            (پایش وضعیت سامانه پرسنلی)
 *
 * جریان احراز هویت واقعی (کشف‌شده از باندل‌های رسمی دو سامانه):
 *   ۱) GET  authentication/otp/{code}   ← ارسال پیامک از سمت arm.melketabriz.ir
 *   ۲) POST authentication/otp/login    ← {code, otpCode} → {token, refreshToken, user}
 */

import { getMelkApiConfig, type MelkApiConfig } from "./config";
import { MELK_ENDPOINTS } from "./endpoints";
import { armCall, probeGet } from "./client";
import {
  extractAddress,
  extractDetailItems,
  extractPagedList,
  extractPersonInfo,
  isoToJalaliString,
  mapArmRealtorRow,
  mapArmSupplyDemandRow,
  mapArmTradedRow,
  mapArmVisitRow,
} from "./adapters";
import { isOwnerPersonnelCode } from "@/lib/access/owner-codes";
import {
  MelkApiError,
  type ArmServiceStatus,
  type ArmTokens,
  type ConnectionStatus,
  type CrmExpert,
  type CrmSupplyDemand,
  type CrmTransaction,
  type CrmVisit,
  type ExpertFilter,
  type NestEnvelope,
  type OtpIssueResult,
  type OtpVerifyResult,
  type Paged,
  type PersonInfo,
  type PropertyLookupResult,
  type RequestLookupResult,
  type TransactionFilter,
  type AuthUserInfo,
  type UserRole,
} from "./types";

export interface MelkProvider {
  mode: "real";
  config: MelkApiConfig;

  /** مرحله ۱: درخواست ارسال کد پیامکی از سامانه واقعی ARM */
  requestOtp(personnelCode: string, ip?: string): Promise<OtpIssueResult>;
  /** مرحله ۲: تأیید کد پیامکی در سامانه واقعی ARM */
  verifyOtp(personnelCode: string, otp: string): Promise<OtpVerifyResult>;
  /** تمدید توکن ARM با refreshToken */
  refreshArmToken(refreshToken: string): Promise<ArmTokens>;
  /** فهرست معاملات (گزارش معاملات سامانه ARM) */
  listTransactions(token: string, filter: TransactionFilter): Promise<Paged<CrmTransaction>>;
  /** فهرست کارشناسان (realtors سامانه ARM) */
  listExperts(token: string, filter: ExpertFilter): Promise<Paged<CrmExpert>>;
  /** استخراج زنده اطلاعات کدآگهی: مالک (نام/تماس) + آدرس ملک + جزئیات */
  lookupPropertyByCode(token: string, code: string): Promise<PropertyLookupResult>;
  /** استخراج زنده اطلاعات کددرخواست: درخواست‌دهنده (نام/تماس) + جزئیات */
  lookupRequestByCode(token: string, code: string): Promise<RequestLookupResult>;
  /** فهرست بازدیدها (visits/list سامانه ARM) */
  listVisits(token: string, page: number, limit: number): Promise<Paged<CrmVisit>>;
  /** گزارش عرضه و تقاضا (realtor-reports/supply-demand سامانه ARM) */
  listSupplyDemand(token: string, page: number, limit: number): Promise<Paged<CrmSupplyDemand>>;
  /** تست زنده اتصال هر سه سرویس */
  testConnection(): Promise<ConnectionStatus>;
  /** وضعیت زنده پورتال PM */
  pmPortalInfo(): Promise<{ ok: boolean; detail: string }>;
}

// ==========================================================================
// حالت Real — اتصال به سامانه‌های واقعی ملک تبریز
// ==========================================================================

/** ساختار پاسخ ورود ARM: { token, refreshToken, user, ... } */
interface ArmLoginData {
  token?: string;
  refreshToken?: string;
  user?: {
    _id?: string;
    type?: string;
    fullName?: string;
    name?: string;
    firstName?: string;
    lastName?: string;
    username?: string;
    code?: string;
    mobile?: string;
    role?: unknown;
    roles?: unknown;
    realtor?: { fullName?: string; name?: string; code?: string } | string;
  };
  [key: string]: unknown;
}

/** استخراج نام نمایشی کاربر از ساختارهای مختلف user سامانه ARM */
function resolveDisplayName(user: ArmLoginData["user"]): string {
  if (!user) return "";
  const direct = user.fullName ?? user.name;
  if (direct && String(direct).trim()) return String(direct).trim();
  const first = String(user.firstName ?? "").trim();
  const last = String(user.lastName ?? "").trim();
  if (first || last) return `${first} ${last}`.trim();
  const realtor = user.realtor;
  if (realtor) {
    if (typeof realtor === "string") return realtor;
    const rn = realtor.fullName ?? realtor.name;
    if (rn) return String(rn);
  }
  if (user.username) return String(user.username);
  return "";
}

/**
 * تشخیص نقش داشبورد از نوع کاربر ARM
 * P6.5-04-i — owner-from-expert-ui: اگر کد پرسنلی ورودی، کدِ خودِ مالک
 * (MANAGER_CODE) باشد ⇒ OWNER (دسترسی ۱۰۰٪ داده از helper مرکزی scope)؛
 * در غیر این صورت realtor = کارشناس املاک ⇒ CONSULTANT (ماتریس §۵.۳).
 * تابع خالص — مستقیماً تست‌پذیر (گزارش p6504i تست ۷).
 */
export function resolveDashboardRole(
  personnelCode: string,
  user: ArmLoginData["user"],
  managerPersonnelCode: string
): UserRole {
  if (managerPersonnelCode && personnelCode === managerPersonnelCode) return "OWNER";
  // PN-008 BLOCK 6 — قانون هویت دوگانهٔ مالک: کدپرسنلی مالک (OWNER_PERSONNEL_CODES)
  // از هر مسیر ورود (verify-otp یا personnel-login) ⇒ نقش OWNER با دسترسی کامل.
  if (isOwnerPersonnelCode(personnelCode)) return "OWNER";
  const type = String(user?.type ?? "").toLowerCase();
  // realtor = کارشناس املاک؛ انواع مدیریتی → در داشبورد همان مشاور با دسترسی داده کامل است
  return "CONSULTANT";
}

class RealProvider implements MelkProvider {
  readonly mode = "real" as const;
  readonly config: MelkApiConfig;

  constructor(config: MelkApiConfig) {
    this.config = config;
  }

  /** فراخوانی API اصلی ARM */
  private arm<T>(path: string, init: { method?: "GET" | "POST"; body?: unknown; token?: string; query?: Record<string, string | number | undefined | null> } = {}) {
    return armCall<T>({
      path,
      baseUrl: this.config.armApiBase,
      method: init.method,
      body: init.body,
      token: init.token,
      query: init.query,
      timeoutMs: this.config.timeoutMs,
      maxRetries: this.config.maxRetries,
    });
  }

  async requestOtp(personnelCode: string, _ip?: string): Promise<OtpIssueResult> {
    // قرارداد واقعی: GET authentication/otp/{code} — پیامک از سمت سامانه ARM ارسال می‌شود
    const res = await this.arm<unknown>(MELK_ENDPOINTS.arm.requestOtp(personnelCode));
    const env = res.data as (NestEnvelope & { verificationMinutesLimit?: number }) | null;
    // سامانه ARM عمر کد را با verificationMinutesLimit (دقیقه) یا پیش‌فرض ۱۸۰ ثانیه اعلام می‌کند
    let expiresInSeconds = 180;
    const minutes = (env as { verificationMinutesLimit?: number } | null)?.verificationMinutesLimit;
    if (minutes && minutes > 0 && minutes <= 60) expiresInSeconds = minutes * 60;
    return { ok: true, expiresInSeconds };
  }

  async verifyOtp(personnelCode: string, otp: string): Promise<OtpVerifyResult> {
    // قرارداد واقعی: POST authentication/otp/login با {code, otpCode}
    const res = await this.arm<ArmLoginData | NestEnvelope<ArmLoginData>>(MELK_ENDPOINTS.arm.verifyOtp, {
      method: "POST",
      body: { code: personnelCode, otpCode: otp },
    });

    const loginData = (res.data ?? (res.data as unknown)) as ArmLoginData;
    if (!loginData?.token) {
      throw new MelkApiError("OTP_INVALID", "پاسخ ورود سامانه ملک تبریز فاقد توکن است.", 401, false);
    }

    const armTokens: ArmTokens = {
      accessToken: String(loginData.token),
      refreshToken: String(loginData.refreshToken ?? ""),
      userType: loginData.user?.type,
      armUserId: loginData.user?._id ? String(loginData.user._id) : undefined,
      displayName: resolveDisplayName(loginData.user),
    };

    const displayName = armTokens.displayName || `کارشناس ${personnelCode}`;
    const user: AuthUserInfo = {
      personnelCode,
      displayName,
      // P6.5-04-i — owner-from-expert-ui: کد پرسنلی خود مالک ⇒ OWNER
      role: resolveDashboardRole(personnelCode, loginData.user, this.config.managerPersonnelCode),
    };

    return {
      ok: true,
      token: armTokens.accessToken,
      expiresInHours: this.config.sessionTtlHours,
      user,
      armTokens,
    };
  }

  async refreshArmToken(refreshToken: string): Promise<ArmTokens> {
    const res = await this.arm<ArmLoginData | NestEnvelope<ArmLoginData>>(MELK_ENDPOINTS.arm.refreshToken, {
      method: "POST",
      body: { refreshToken },
    });
    const data = (res.data ?? {}) as ArmLoginData;
    if (!data.token) {
      throw new MelkApiError("UNAUTHORIZED", "تمدید توکن سامانه ملک تبریز ناموفق بود.", 401, false);
    }
    return {
      accessToken: String(data.token),
      refreshToken: String(data.refreshToken ?? refreshToken),
      userType: data.user?.type,
      armUserId: data.user?._id ? String(data.user._id) : undefined,
      displayName: resolveDisplayName(data.user),
    };
  }

  async listTransactions(token: string, filter: TransactionFilter): Promise<Paged<CrmTransaction>> {
    // قرارداد واقعی: GET realtor-reports/traded-count-total?page&limit&startDate&endDate
    // تاریخ‌ها در قالب جلالی «YYYY/MM/DD» ارسال می‌شوند (رفتار خود سامانه ARM)
    const query: Record<string, string | number | undefined | null> = {
      page: Math.floor(filter.offset / Math.max(filter.limit, 1)) + 1,
      limit: filter.limit,
    };
    if (filter.dateFrom) query.startDate = isoToJalaliString(filter.dateFrom);
    if (filter.dateTo) query.endDate = isoToJalaliString(filter.dateTo);

    const res = await this.arm<unknown>(MELK_ENDPOINTS.arm.tradedTotal, { token, query });
    const { rows, total } = extractPagedList(res.data, (row, i) =>
      mapArmTradedRow(row, i, Number(query.page), filter.limit)
    );
    return { rows, total };
  }

  async listExperts(token: string, filter: ExpertFilter): Promise<Paged<CrmExpert>> {
    // قرارداد واقعی: GET realtors/list?page&limit
    const query: Record<string, string | number | undefined | null> = {
      page: Math.floor(filter.offset / Math.max(filter.limit, 1)) + 1,
      limit: filter.limit,
    };
    const res = await this.arm<unknown>(MELK_ENDPOINTS.arm.realtorsList, { token, query });
    const { rows, total } = extractPagedList(res.data, (row, i) => mapArmRealtorRow(row, i));
    return { rows, total };
  }

  // ==========================================================================
  // استخراج زنده اطلاعات (کاشی استخراج اطلاعات)
  // ==========================================================================

  /**
   * استخراج اطلاعات کدآگهی — زنجیره عین خود سامانه ARM:
   *   ۱) properties/info/by-code/{code} → شناسایی آگهی (_id، عنوان، مشاور)
   *   ۲) properties/details/{_id} → جزئیات + آدرس ملک
   *   ۳) properties/owner/{_id} → اطلاعات مالک (نام/نام‌خانوادگی + تماس)
   * مراحل ۲ و ۳ غیربحرانی‌اند: نبودشان نتیجه را با اخطار شفاف برمی‌گرداند.
   */
  async lookupPropertyByCode(token: string, code: string): Promise<PropertyLookupResult> {
    const cleanedCode = code.trim();
    if (!cleanedCode) {
      throw new MelkApiError("INVALID_PERSONNEL_CODE", "کدآگهی را وارد کنید.", 400, false);
    }

    // ---- مرحله ۱: شناسایی آگهی با کد ----
    const byCode = await this.arm<Record<string, unknown>>(MELK_ENDPOINTS.arm.propertiesByCode(cleanedCode), { token });
    const prop = (byCode.data ?? {}) as Record<string, unknown>;
    const armId = String(prop._id ?? prop.id ?? "");
    if (!armId) {
      throw new MelkApiError(
        "NOT_FOUND",
        `آگهی با کد «${cleanedCode}» در سامانه ملک تبریز پیدا نشد. کد را بررسی کنید یا آگهی ممکن است حذف شده باشد.`,
        404,
        false
      );
    }

    const title = String(prop.title ?? "");
    const relatedRealtorRaw = prop.relatedRealtor;
    const relatedRealtor =
      typeof relatedRealtorRaw === "string"
        ? relatedRealtorRaw
        : relatedRealtorRaw && typeof relatedRealtorRaw === "object"
          ? String((relatedRealtorRaw as Record<string, unknown>).fullName ?? "")
          : "";

    // ---- مرحله ۲: جزئیات و آدرس (غیربحرانی) ----
    let details: { label: string; value: string; unit: string }[] = [];
    let address = "";
    try {
      const det = await this.arm<Record<string, unknown>>(MELK_ENDPOINTS.arm.propertyDetails(armId), { token });
      details = extractDetailItems(det.data);
      address = extractAddress(det.data, prop);
    } catch {
      // جزئیات در دسترس نیست — نتیجه بدون آن برگردانده می‌شود
    }

    // ---- مرحله ۳: اطلاعات مالک (غیربحرانی — ممکن است نیازمند مجوز باشد) ----
    let owner: PersonInfo | null = null;
    try {
      const own = await this.arm<unknown>(MELK_ENDPOINTS.arm.propertyOwner(armId), { token });
      owner = extractPersonInfo(own.data);
    } catch {
      // دسترسی به اطلاعات مالک ممکن است نیازمند مجوز ویژه باشد
    }

    return {
      code: cleanedCode,
      armId,
      title: title || "بدون عنوان",
      owner,
      address: address || "—",
      relatedRealtor: relatedRealtor || "—",
      details,
    };
  }

  /**
   * استخراج اطلاعات کددرخواست — زنجیره عین خود سامانه ARM:
   *   ۱) requests/list?code={code} → شناسایی درخواست (فیلتر کد — همان فیلتر خود سامانه)
   *   ۲) requests/details/{_id} → جزئیات درخواست
   *   ۳) requests/applicant/{_id} → اطلاعات درخواست‌دهنده (نام/نام‌خانوادگی + تماس)
   */
  async lookupRequestByCode(token: string, code: string): Promise<RequestLookupResult> {
    const cleanedCode = code.trim();
    if (!cleanedCode) {
      throw new MelkApiError("INVALID_PERSONNEL_CODE", "کددرخواست را وارد کنید.", 400, false);
    }

    // ---- مرحله ۱: فهرست درخواست‌ها با فیلتر کد (دو قالب پارامتر خود سامانه) ----
    let rows: Record<string, unknown>[] = [];
    const codeFilters: Record<string, string>[] = [{ code: cleanedCode }, { "code[]": cleanedCode }];
    for (const filter of codeFilters) {
      let res: { data: unknown } | null = null;
      try {
        res = await this.arm<unknown>(MELK_ENDPOINTS.arm.requestsList, {
          token,
          query: { page: 1, limit: 25, ...filter },
        });
      } catch {
        res = null;
      }
      if (!res) continue;
      const extracted = extractPagedList(res.data, (row) => row as Record<string, unknown>);
      const pageRows = extracted.rows as unknown as Record<string, unknown>[];
      // تطبیق دقیق کد درخواست (فیلتر سرور ممکن است غیرفعال باشد)
      const exact = pageRows.find((r) => String(r.code ?? r.requestCode ?? "").trim() === cleanedCode);
      if (exact) {
        rows = [exact];
        break;
      }
      rows = pageRows;
      // اگر قالب اول (code=) نتیجه‌ای نداشت، قالب دوم (code[]=) امتحان می‌شود
    }

    if (rows.length === 0) {
      throw new MelkApiError(
        "NOT_FOUND",
        `درخواستی با کد «${cleanedCode}» در سامانه ملک تبریز پیدا نشد. کد را بررسی کنید.`,
        404,
        false
      );
    }
    const matched =
      rows.find((r) => String(r.code ?? r.requestCode ?? "").trim() === cleanedCode) ?? rows[0];
    const armId = String(matched._id ?? matched.id ?? "");
    const title = String(matched.title ?? "");
    const businessTitle =
      String(
        (matched.businessId as Record<string, unknown> | undefined)?.title ??
        (matched.businessId as Record<string, unknown> | undefined)?.name ??
        ""
      ) || "—";

    // ---- مرحله ۲: جزئیات (غیربحرانی) ----
    let details: { label: string; value: string; unit: string }[] = [];
    if (armId) {
      try {
        const det = await this.arm<Record<string, unknown>>(MELK_ENDPOINTS.arm.requestDetails(armId), { token });
        details = extractDetailItems(det.data);
      } catch {
        // جزئیات در دسترس نیست
      }
    }

    // ---- مرحله ۳: اطلاعات درخواست‌دهنده (غیربحرانی) ----
    let applicant: PersonInfo | null = null;
    if (armId) {
      try {
        const app = await this.arm<unknown>(MELK_ENDPOINTS.arm.requestApplicant(armId), { token });
        applicant = extractPersonInfo(app.data);
      } catch {
        // دسترسی به اطلاعات درخواست‌دهنده ممکن است محدود باشد
      }
    }

    return {
      code: cleanedCode,
      armId: armId || cleanedCode,
      title: title || "بدون عنوان",
      applicant,
      businessTitle,
      details,
    };
  }

  async listVisits(token: string, page: number, limit: number): Promise<Paged<CrmVisit>> {
    // قرارداد واقعی: GET visits/list?page&limit(&status)
    const res = await this.arm<unknown>(MELK_ENDPOINTS.arm.visitsList, {
      token,
      query: { page, limit },
    });
    const { rows, total } = extractPagedList(res.data, (row, i) => mapArmVisitRow(row, i));
    return { rows, total };
  }

  async listSupplyDemand(token: string, page: number, limit: number): Promise<Paged<CrmSupplyDemand>> {
    // قرارداد واقعی: GET realtor-reports/supply-demand?page&limit
    const res = await this.arm<unknown>(MELK_ENDPOINTS.armReports.supplyDemand, {
      token,
      query: { page, limit },
    });
    const { rows, total } = extractPagedList(res.data, (row, i) => mapArmSupplyDemandRow(row, i));
    return { rows, total };
  }

  async pmPortalInfo(): Promise<{ ok: boolean; detail: string }> {
    try {
      const res = await armCall<unknown>({
        path: MELK_ENDPOINTS.pm.portalInfo,
        baseUrl: this.config.pmApiBase,
        timeoutMs: this.config.timeoutMs,
        maxRetries: 0,
      });
      return { ok: true, detail: "سامانه پرسنلی پاسخ داد." };
    } catch (err) {
      const e = err as MelkApiError;
      return { ok: false, detail: e.message };
    }
  }

  async testConnection(): Promise<ConnectionStatus> {
    const checkedAt = new Date().toISOString();
    const services: ArmServiceStatus[] = [];

    // ۱) API اصلی ARM — سنجش با نقطه عمومی enums (بدون توکن، همان زنجیره nginx)
    try {
      const probe = await probeGet(this.config.armPublicApiBase, MELK_ENDPOINTS.armPublic.enums, 12000);
      const dbUp = probe.httpStatus < 500 && !probe.bodyText.includes("MongooseError");
      services.push({
        service: "ARM_PUBLIC",
        label: "سامانه مدیریت آگهی و درخواست — بخش عمومی",
        reachable: true,
        databaseUp: dbUp,
        httpStatus: probe.httpStatus,
        latencyMs: probe.latencyMs,
        detail: dbUp ? "پاسخ موفق" : "پایگاه داده سامانه آگهی و درخواست در دسترس نیست (خطای پایگاه داده/پنج‌صد و دو)",
      });
    } catch {
      services.push({
        service: "ARM_PUBLIC",
        label: "سامانه مدیریت آگهی و درخواست — بخش عمومی",
        reachable: false,
        databaseUp: false,
        latencyMs: -1,
        detail: "دسترسی شبکه به arus-api.melketabriz.ir برقرار نشد.",
      });
    }

    // ۲) API احراز هویت ARM — سنجش نقطه OTP (بدون توکن؛ کد تستی صرفاً برای بررسی سلامت مسیر)
    try {
      const probe = await probeGet(this.config.armApiBase, `authentication/otp/0`, 12000);
      const dbUp = !probe.bodyText.includes("MongooseError") && probe.httpStatus !== 502;
      services.push({
        service: "ARM_API",
        label: "سامانه مدیریت آگهی و درخواست — احراز هویت",
        reachable: true,
        databaseUp: dbUp,
        httpStatus: probe.httpStatus,
        latencyMs: probe.latencyMs,
        detail: dbUp ? "مسیر احراز هویت فعال است" : "پایگاه داده سامانه آگهی و درخواست قطع است — ارسال پیامک ممکن نیست",
      });
    } catch {
      services.push({
        service: "ARM_API",
        label: "سامانه مدیریت آگهی و درخواست — احراز هویت",
        reachable: false,
        databaseUp: false,
        latencyMs: -1,
        detail: "دسترسی شبکه به arus-api.melketabriz.ir برقرار نشد.",
      });
    }

    // ۳) API سامانه پرسنلی PM
    try {
      const probe = await probeGet(this.config.pmApiBase, MELK_ENDPOINTS.pm.portalInfo, 12000);
      const dbUp = !probe.bodyText.includes("MongooseError") && probe.httpStatus !== 502;
      services.push({
        service: "PM_API",
        label: "سامانه مدیریت پرسنلی",
        reachable: true,
        databaseUp: dbUp,
        httpStatus: probe.httpStatus,
        latencyMs: probe.latencyMs,
        detail: dbUp ? "پاسخ موفق" : "پایگاه داده سامانه پرسنلی در دسترس نیست",
      });
    } catch {
      services.push({
        service: "PM_API",
        label: "سامانه مدیریت پرسنلی",
        reachable: false,
        databaseUp: false,
        latencyMs: -1,
        detail: "دسترسی شبکه به pm-api.melketabriz.ir برقرار نشد.",
      });
    }

    // ۴) API سامانه عمومی ملک تبریز (P6546/گام صفر) — بخش عمومی apu (بدون توکن)
    try {
      const probe = await probeGet(this.config.melkPublicApiBase, `${MELK_ENDPOINTS.melkPublic.propertiesList}?page=1&limit=1`, 12000);
      const dbUp = probe.httpStatus === 200 && !probe.bodyText.includes("MongooseError");
      services.push({
        service: "MELK_PUBLIC_API",
        label: "سامانه عمومی ملک تبریز (melketabriz.com)",
        reachable: true,
        databaseUp: dbUp,
        httpStatus: probe.httpStatus,
        latencyMs: probe.latencyMs,
        detail: dbUp ? "فهرست عمومی آگهی‌ها پاسخ می‌دهد" : "بخش عمومی سامانه ملک تبریز در دسترس نیست",
      });
    } catch {
      services.push({
        service: "MELK_PUBLIC_API",
        label: "سامانه عمومی ملک تبریز (melketabriz.com)",
        reachable: false,
        databaseUp: false,
        latencyMs: -1,
        detail: "دسترسی شبکه به بخش عمومی arus-api.melketabriz.ir برقرار نشد.",
      });
    }

    // ۵) API سامانه گفت‌وگو GAP (P6546/گام صفر) — سرور Express؛ هر پاسخ HTTP = در دسترس
    try {
      const probe = await probeGet(this.config.gapApiBase, "", 12000);
      services.push({
        service: "GAP_API",
        label: "سامانه گفت‌وگوی آنلاین (gap.melketabriz.ir)",
        reachable: probe.httpStatus > 0,
        databaseUp: probe.httpStatus > 0,
        httpStatus: probe.httpStatus,
        latencyMs: probe.latencyMs,
        detail: probe.httpStatus > 0 ? `سرور gap-api پاسخ می‌دهد (HTTP ${probe.httpStatus})` : "سرور gap-api.melketabriz.ir پاسخ نداد",
      });
    } catch {
      services.push({
        service: "GAP_API",
        label: "سامانه گفت‌وگوی آنلاین (gap.melketabriz.ir)",
        reachable: false,
        databaseUp: false,
        latencyMs: -1,
        detail: "دسترسی شبکه به gap-api.melketabriz.ir برقرار نشد.",
      });
    }

    const anyDbUp = services.some((s) => s.databaseUp);
    const anyReachable = services.some((s) => s.reachable);
    const armDbUp = services.find((s) => s.service === "ARM_API")?.databaseUp ?? false;

    return {
      ok: anyReachable,
      mode: this.mode,
      latencyMs: Math.max(...services.map((s) => s.latencyMs)),
      checkedAt,
      services,
      detail: !anyReachable
        ? "ارتباط شبکه با سامانه‌های ملک تبریز برقرار نشد."
        : armDbUp
          ? "اتصال واقعی به سامانه‌های ملک تبریز برقرار و پایگاه داده فعال است."
          : "سرورهای ملک تبریز پاسخ می‌دهند اما پایگاه داده آن‌ها در حال حاضر قطع است (قطعی سمت سرور ملک تبریز). لطفاً بعداً همگام‌سازی مجدد کنید.",
    };
  }
}

// ==========================================================================
// کارخانه Provider
// ==========================================================================

let cachedProvider: MelkProvider | null = null;

/** نمونه یکتا (Singleton) — همیشه اتصال واقعی */
export function getMelkProvider(): MelkProvider {
  if (!cachedProvider) {
    cachedProvider = new RealProvider(getMelkApiConfig());
  }
  return cachedProvider;
}

/** بازنشانی نمونه (برای تست و دکمه ریست اتصال) */
export function resetMelkProvider(): void {
  cachedProvider = null;
}
