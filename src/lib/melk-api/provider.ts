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
import { extractPagedList, isoToJalaliString, mapArmRealtorRow, mapArmTradedRow } from "./adapters";
import {
  MelkApiError,
  type ArmServiceStatus,
  type ArmTokens,
  type ConnectionStatus,
  type CrmExpert,
  type CrmTransaction,
  type ExpertFilter,
  type NestEnvelope,
  type OtpIssueResult,
  type OtpVerifyResult,
  type Paged,
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

/** تشخیص نقش داشبورد از نوع کاربر ARM */
function resolveRole(user: ArmLoginData["user"]): UserRole {
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
      role: resolveRole(loginData.user),
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

  async pmPortalInfo(): Promise<{ ok: boolean; detail: string }> {
    try {
      const res = await armCall<unknown>({
        path: MELK_ENDPOINTS.pm.portalInfo,
        baseUrl: this.config.pmApiBase,
        timeoutMs: this.config.timeoutMs,
        maxRetries: 0,
      });
      return { ok: true, detail: "سامانه پرسنلی (PM) پاسخ داد." };
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
        label: "سامانه مدیریت آگهی و درخواست (عمومی)",
        reachable: true,
        databaseUp: dbUp,
        httpStatus: probe.httpStatus,
        latencyMs: probe.latencyMs,
        detail: dbUp ? "پاسخ موفق" : "پایگاه داده سامانه ARM در دسترس نیست (Mongoose/502)",
      });
    } catch {
      services.push({
        service: "ARM_PUBLIC",
        label: "سامانه مدیریت آگهی و درخواست (عمومی)",
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
        label: "سامانه مدیریت آگهی و درخواست (API احراز هویت)",
        reachable: true,
        databaseUp: dbUp,
        httpStatus: probe.httpStatus,
        latencyMs: probe.latencyMs,
        detail: dbUp ? "مسیر احراز هویت فعال است" : "پایگاه داده سامانه ARM قطع است — ارسال پیامک ممکن نیست",
      });
    } catch {
      services.push({
        service: "ARM_API",
        label: "سامانه مدیریت آگهی و درخواست (API احراز هویت)",
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
        label: "سامانه مدیریت پرسنلی (PM)",
        reachable: true,
        databaseUp: dbUp,
        httpStatus: probe.httpStatus,
        latencyMs: probe.latencyMs,
        detail: dbUp ? "پاسخ موفق" : "پایگاه داده سامانه پرسنلی در دسترس نیست",
      });
    } catch {
      services.push({
        service: "PM_API",
        label: "سامانه مدیریت پرسنلی (PM)",
        reachable: false,
        databaseUp: false,
        latencyMs: -1,
        detail: "دسترسی شبکه به pm-api.melketabriz.ir برقرار نشد.",
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
