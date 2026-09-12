/**
 * رابط Provider — قرارداد یکسان برای دو حالت Mock و Real
 * ------------------------------------------------------
 * کل اپلیکیشن فقط با این رابط کار می‌کند؛ جابه‌جایی
 * Mock ↔ Real صرفاً با متغیر محیطی MELK_API_MODE انجام می‌شود.
 */

import { getMelkApiConfig, type MelkApiConfig } from "./config";
import { generateExperts, generateTransactions, mulberry32 } from "./mock-data";
import { MELK_ENDPOINTS } from "./endpoints";
import { melkFetch, probeHost } from "./client";
import {
  MelkApiError,
  type ConnectionStatus,
  type CrmExpert,
  type CrmTransaction,
  type ExpertFilter,
  type OtpIssueResult,
  type OtpVerifyResult,
  type Paged,
  type TransactionFilter,
  type AuthUserInfo,
} from "./types";

export interface MelkProvider {
  mode: "mock" | "real";
  config: MelkApiConfig;

  requestOtp(personnelCode: string, ip?: string): Promise<OtpIssueResult>;
  verifyOtp(personnelCode: string, otp: string): Promise<OtpVerifyResult>;
  listTransactions(token: string, filter: TransactionFilter): Promise<Paged<CrmTransaction>>;
  listExperts(token: string, filter: ExpertFilter): Promise<Paged<CrmExpert>>;
  testConnection(): Promise<ConnectionStatus>;
  validatePersonnelCode(personnelCode: string): Promise<AuthUserInfo | null>;
}

// ==========================================================================
// حالت Mock — شبیه‌ساز کامل رفتار سامانه
// ==========================================================================

/** وضعت OTP موقت شبیه‌ساز */
const otpStore = new Map<string, { code: string; expiresAt: number }>();

function isLockdownSeed(seed: number): number {
  const rand = mulberry32(seed);
  return Math.floor(rand() * 900000) + 100000;
}

class MockProvider implements MelkProvider {
  readonly mode = "mock" as const;
  readonly config: MelkApiConfig;
  private experts: CrmExpert[];
  private transactions: CrmTransaction[];

  constructor(config: MelkApiConfig) {
    this.config = config;
    this.experts = generateExperts(42, 24);
    this.transactions = generateTransactions(this.experts, 1337, 640, 18);
  }

  async validatePersonnelCode(personnelCode: string): Promise<AuthUserInfo | null> {
    const expert = this.experts.find((e) => e.personnelCode === personnelCode);
    if (!expert) return null;
    return {
      personnelCode: expert.personnelCode,
      displayName: expert.fullName,
      role: "CONSULTANT",
    };
  }

  async requestOtp(personnelCode: string, _ip?: string): Promise<OtpIssueResult> {
    const user = await this.validatePersonnelCode(personnelCode);
    if (!user) {
      throw new MelkApiError("INVALID_PERSONNEL_CODE", "کد پرسنلی در سامانه ملک تبریز یافت نشد.", 404, false);
    }
    const code = String(isLockdownSeed(personnelCode.split("").reduce((a, c) => a + c.charCodeAt(0), 7)));
    otpStore.set(personnelCode, {
      code,
      expiresAt: Date.now() + 3 * 60 * 1000, // عمر ۳ دقیقه
    });
    return { ok: true, expiresInSeconds: 180, demoOtp: code };
  }

  async verifyOtp(personnelCode: string, otp: string): Promise<OtpVerifyResult> {
    const rec = otpStore.get(personnelCode);
    if (!rec) {
      throw new MelkApiError("OTP_EXPIRED", "کد پیامکی صادر نشده یا منقضی شده است. دوباره درخواست کنید.", 410, false);
    }
    if (Date.now() > rec.expiresAt) {
      otpStore.delete(personnelCode);
      throw new MelkApiError("OTP_EXPIRED", "کد پیامکی منقضی شده است. دوباره درخواست کنید.", 410, false);
    }
    if (rec.code !== otp.trim()) {
      throw new MelkApiError("OTP_INVALID", "کد پیامکی نادرست است.", 401, false);
    }
    otpStore.delete(personnelCode);
    const user = (await this.validatePersonnelCode(personnelCode))!;
    // شبیه‌سازی توکن صادرشده از سامانه
    const token = `mock-${personnelCode}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    return { ok: true, token, expiresInHours: this.config.sessionTtlHours, user };
  }

  async listTransactions(_token: string, filter: TransactionFilter): Promise<Paged<CrmTransaction>> {
    let rows = [...this.transactions];

    if (filter.dateFrom) rows = rows.filter((t) => t.dealDate >= filter.dateFrom!);
    if (filter.dateTo) {
      const to = new Date(filter.dateTo);
      to.setHours(23, 59, 59, 999);
      rows = rows.filter((t) => t.dealDate <= to.toISOString());
    }
    if (filter.expertName?.trim()) {
      const q = filter.expertName.trim();
      rows = rows.filter((t) => t.expertName.includes(q));
    }
    if (filter.expertCode?.trim()) {
      const q = filter.expertCode.trim();
      rows = rows.filter((t) => t.expertCode === q);
    }
    if (filter.listingCode?.trim()) {
      const q = filter.listingCode.trim().toLowerCase();
      rows = rows.filter((t) => t.listingCode.toLowerCase().includes(q));
    }
    if (filter.requestCode?.trim()) {
      const q = filter.requestCode.trim().toLowerCase();
      rows = rows.filter((t) => (t.requestCode ?? "").toLowerCase().includes(q));
    }
    if (filter.priceMin !== undefined) rows = rows.filter((t) => t.price >= filter.priceMin!);
    if (filter.priceMax !== undefined) rows = rows.filter((t) => t.price <= filter.priceMax!);
    if (filter.district?.trim()) rows = rows.filter((t) => t.district === filter.district);
    if (filter.propertyType?.trim()) rows = rows.filter((t) => t.propertyType === filter.propertyType);

    const sortBy = filter.sortBy ?? "dealDate";
    const dir = filter.sortDir === "asc" ? 1 : -1;
    rows.sort((a, b) => {
      if (sortBy === "price") return (a.price - b.price) * dir;
      if (sortBy === "expertName") return a.expertName.localeCompare(b.expertName, "fa") * dir;
      return (Date.parse(a.dealDate) - Date.parse(b.dealDate)) * dir;
    });

    const total = rows.length;
    const page = rows.slice(filter.offset, filter.offset + filter.limit);
    return { rows: page, total };
  }

  async listExperts(_token: string, filter: ExpertFilter): Promise<Paged<CrmExpert>> {
    let rows = [...this.experts];
    if (filter.fullName?.trim()) {
      const q = filter.fullName.trim();
      rows = rows.filter((e) => e.fullName.includes(q));
    }
    if (filter.mobile?.trim()) {
      const q = filter.mobile.trim().replace(/\s/g, "");
      rows = rows.filter((e) => e.mobile.replace(/\s/g, "").includes(q));
    }
    if (filter.personnelCode?.trim()) {
      const q = filter.personnelCode.trim();
      rows = rows.filter((e) => e.personnelCode.includes(q));
    }
    if (filter.address?.trim()) {
      const q = filter.address.trim();
      rows = rows.filter((e) => e.address.includes(q));
    }
    if (filter.branch?.trim()) rows = rows.filter((e) => e.branch === filter.branch);
    if (filter.active !== undefined) rows = rows.filter((e) => e.active === filter.active);

    rows.sort((a, b) => a.fullName.localeCompare(b.fullName, "fa"));
    const total = rows.length;
    return { rows: rows.slice(filter.offset, filter.offset + filter.limit), total };
  }

  async testConnection(): Promise<ConnectionStatus> {
    const started = Date.now();
    // شبیه‌سازی تأخیر شبکه
    await new Promise((r) => setTimeout(r, 30 + Math.floor(Math.random() * 40)));
    return {
      ok: true,
      mode: this.mode,
      latencyMs: Date.now() - started,
      checkedAt: new Date().toISOString(),
      detail: "شبیه‌ساز محلی سامانه ملک تبریز فعال است.",
    };
  }
}

// ==========================================================================
// حالت Real — اتصال به سامانه واقعی
// ==========================================================================

class RealProvider implements MelkProvider {
  readonly mode = "real" as const;
  readonly config: MelkApiConfig;

  constructor(config: MelkApiConfig) {
    this.config = config;
  }

  private async c<T>(path: string, init: { method?: "GET" | "POST"; body?: unknown; token?: string } = {}): Promise<T> {
    return melkFetch<T>({
      path,
      baseUrl: this.config.armBaseUrl,
      method: init.method ?? "GET",
      body: init.body,
      token: init.token,
      timeoutMs: this.config.timeoutMs,
      maxRetries: this.config.maxRetries,
    });
  }

  async validatePersonnelCode(personnelCode: string): Promise<AuthUserInfo | null> {
    // در حالت واقعی، اعتبارسنجی کد پرسنلی با صدور OTP انجام می‌شود
    // (سامانه اگر کد نامعتبر باشد در پاسخ requestOtp خطا می‌دهد).
    try {
      await this.requestOtp(personnelCode);
      return { personnelCode, displayName: `کارشناس ${personnelCode}`, role: "CONSULTANT" };
    } catch {
      return null;
    }
  }

  async requestOtp(personnelCode: string, ip?: string): Promise<OtpIssueResult> {
    const res = await this.c<{ expiresInSeconds: number }>(MELK_ENDPOINTS.auth.requestOtp, {
      method: "POST",
      body: { personnelCode, clientIp: ip },
    });
    return { ok: true, expiresInSeconds: res.expiresInSeconds ?? 180 };
  }

  async verifyOtp(personnelCode: string, otp: string): Promise<OtpVerifyResult> {
    const res = await this.c<{ token: string; expiresInHours: number; user: AuthUserInfo }>(
      MELK_ENDPOINTS.auth.verifyOtp,
      { method: "POST", body: { personnelCode, otp } }
    );
    return {
      ok: true,
      token: res.token,
      expiresInHours: res.expiresInHours ?? this.config.sessionTtlHours,
      user: res.user,
    };
  }

  async listTransactions(token: string, filter: TransactionFilter): Promise<Paged<CrmTransaction>> {
    const params = new URLSearchParams();
    if (filter.dateFrom) params.set("from", filter.dateFrom);
    if (filter.dateTo) params.set("to", filter.dateTo);
    if (filter.expertName) params.set("expertName", filter.expertName);
    if (filter.expertCode) params.set("expertCode", filter.expertCode);
    if (filter.listingCode) params.set("listingCode", filter.listingCode);
    if (filter.requestCode) params.set("requestCode", filter.requestCode);
    if (filter.priceMin !== undefined) params.set("priceMin", String(filter.priceMin));
    if (filter.priceMax !== undefined) params.set("priceMax", String(filter.priceMax));
    if (filter.district) params.set("district", filter.district);
    if (filter.propertyType) params.set("propertyType", filter.propertyType);
    params.set("limit", String(filter.limit));
    params.set("offset", String(filter.offset));
    if (filter.sortBy) params.set("sort", filter.sortBy);
    if (filter.sortDir) params.set("dir", filter.sortDir);
    return this.c<Paged<CrmTransaction>>(`${MELK_ENDPOINTS.crm.transactions}?${params.toString()}`, { token });
  }

  async listExperts(token: string, filter: ExpertFilter): Promise<Paged<CrmExpert>> {
    const params = new URLSearchParams();
    if (filter.fullName) params.set("fullName", filter.fullName);
    if (filter.mobile) params.set("mobile", filter.mobile);
    if (filter.personnelCode) params.set("personnelCode", filter.personnelCode);
    if (filter.address) params.set("address", filter.address);
    if (filter.branch) params.set("branch", filter.branch);
    if (filter.active !== undefined) params.set("active", String(filter.active));
    params.set("limit", String(filter.limit));
    params.set("offset", String(filter.offset));
    return this.c<Paged<CrmExpert>>(`${MELK_ENDPOINTS.crm.experts}?${params.toString()}`, { token });
  }

  async testConnection(): Promise<ConnectionStatus> {
    const checkedAt = new Date().toISOString();
    try {
      const latencyMs = await probeHost(this.config.armBaseUrl, this.config);
      return {
        ok: true,
        mode: this.mode,
        latencyMs,
        checkedAt,
        detail: `ارتباط با ${this.config.armBaseUrl} برقرار است.`,
      };
    } catch (err) {
      const e = err as MelkApiError;
      return {
        ok: false,
        mode: this.mode,
        latencyMs: -1,
        checkedAt,
        detail: `ارتباط برقرار نشد: ${e.message ?? "خطای شبکه"}`,
      };
    }
  }
}

// ==========================================================================
// کارخانه Provider
// ==========================================================================

let cachedProvider: MelkProvider | null = null;

/** نمونه یکتا (Singleton) — ساخته‌شده بر اساس پیکربندی جاری */
export function getMelkProvider(): MelkProvider {
  if (!cachedProvider) {
    const config = getMelkApiConfig();
    cachedProvider = config.mode === "real" ? new RealProvider(config) : new MockProvider(config);
  }
  return cachedProvider;
}

/** بازنشانی نمونه (برای تست و دکمه ریست اتصال) */
export function resetMelkProvider(): void {
  cachedProvider = null;
}
