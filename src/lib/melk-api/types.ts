/**
 * انواع داده دامنه (Domain Types) — قرارداد مشترک کل سامانه
 * ------------------------------------------------------
 * این انواع «قرارداد داده» بین UI، هسته کاشی‌ها، ایجنت‌ها و
 * لایه اتصال به سامانه‌های واقعی ملک تبریز هستند.
 * هر تغییر در ساختار پاسخ واقعی CRM فقط باید در Adapter لایه
 * melk-api اعمال شود، نه در بقیه سامانه.
 */

// ===================== احراز هویت =====================

export type UserRole = "OWNER" | "CONSULTANT";

export interface AuthUserInfo {
  personnelCode: string;
  displayName: string;
  role: UserRole;
}

export interface OtpIssueResult {
  ok: true;
  /** عمر کد پیامکی به ثانیه (سامانه ARM: ۱۸۰ ثانیه) */
  expiresInSeconds: number;
}

/** توکن‌های صادرشده از سامانه واقعی ARM (برای فراخوانی داده‌ها) */
export interface ArmTokens {
  accessToken: string;
  refreshToken: string;
  /** نوع کاربر در سامانه ARM — مثلاً realtor (کارشناس املاک) */
  userType?: string;
  armUserId?: string;
  displayName?: string;
}

export interface OtpVerifyResult {
  ok: true;
  /** توکن نشست سامانه ARM */
  token: string;
  expiresInHours: number;
  user: AuthUserInfo;
  /** توکن‌های ARM برای فراخوانی داده‌های واقعی */
  armTokens: ArmTokens;
}

// ===================== معاملات =====================

export const PROPERTY_TYPES = [
  "آپارتمان",
  "کلنگی",
  "مغازه",
  "خانه ویلایی",
  "دفتر اداری",
  "باغ",
] as const;

export type PropertyType = (typeof PROPERTY_TYPES)[number];

export interface CrmTransaction {
  id: string;
  /** تاریخ معامله (ISO 8601) */
  dealDate: string;
  /** کد آگهی مورد معامله */
  listingCode: string;
  /** کد درخواست خرید که به معامله منجر شده */
  requestCode: string | null;
  /** کد پرسنلی کارشناس معامله‌کننده */
  expertCode: string;
  /** نام و نام خانوادگی کارشناس */
  expertName: string;
  /** مبلغ معامله (تومان) */
  price: number;
  /** محله */
  district: string;
  /** نوع ملک */
  propertyType: PropertyType;
  /** متراژ (متر مربع) */
  area: number;
  /** کمیسیون دریافتی (تومان) */
  commission: number;
}

export interface TransactionFilter {
  dateFrom?: string;
  dateTo?: string;
  expertName?: string;
  expertCode?: string;
  listingCode?: string;
  requestCode?: string;
  priceMin?: number;
  priceMax?: number;
  district?: string;
  propertyType?: string;
  limit: number;
  offset: number;
  sortBy?: "dealDate" | "price" | "expertName";
  sortDir?: "asc" | "desc";
}

export interface Paged<T> {
  rows: T[];
  total: number;
}

// ===================== کارشناسان =====================

export interface CrmExpert {
  id: string;
  personnelCode: string;
  fullName: string;
  mobile: string;
  address: string;
  /** شعبه/دورهدیفی */
  branch: string;
  active: boolean;
  /** تاریخ عضویت (ISO) */
  joinedAt: string;
}

export interface ExpertFilter {
  fullName?: string;
  mobile?: string;
  personnelCode?: string;
  address?: string;
  branch?: string;
  active?: boolean;
  limit: number;
  offset: number;
}

// ===================== وضعیت اتصال =====================

export interface ConnectionStatus {
  ok: boolean;
  /** حالت اتصال — همیشه «real» (اتصال واقعی) */
  mode: "real";
  latencyMs: number;
  checkedAt: string;
  detail: string;
  /** جزئیات هر سامانه (در حالت واقعی) */
  services?: ArmServiceStatus[];
}

export interface ArmServiceStatus {
  service: "ARM_API" | "ARM_PUBLIC" | "PM_API";
  label: string;
  reachable: boolean;
  /** پایگاه داده سامانه پشتیبان در دسترس است؟ */
  databaseUp: boolean;
  httpStatus?: number;
  latencyMs: number;
  detail?: string;
}

// ===================== خطاهای نرمال‌شده =====================

export type MelkErrorCode =
  | "INVALID_PERSONNEL_CODE"
  | "OTP_EXPIRED"
  | "OTP_INVALID"
  | "OTP_LOCKED"
  | "PRECONDITION_FAILED"
  | "RATE_LIMITED"
  | "NETWORK_ERROR"
  | "TIMEOUT"
  | "UNAUTHORIZED"
  | "SERVER_ERROR"
  | "DB_DOWN"
  | "NOT_FOUND"
  | "CONNECTION_RESET"
  | "UNKNOWN";

export class MelkApiError extends Error {
  code: MelkErrorCode;
  httpStatus: number;
  retryable: boolean;

  constructor(code: MelkErrorCode, message: string, httpStatus = 500, retryable = false) {
    super(message);
    this.name = "MelkApiError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryable = retryable;
  }
}

// ===================== پوشه پاسخ NestJS سامانه‌های ملک تبریز =====================

/**
 * فرمت واقعی پاسخ هر دو سامانه (کشف‌شده با تست زنده):
 *  موفق:  { statusCode, status: true,  data, message? }
 *  خطا:   { statusCode, status: false, data: { error, stack }, message }
 */
export interface NestEnvelope<T = unknown> {
  statusCode?: number;
  status?: boolean;
  data?: T;
  message?: string;
  error?: unknown;
}
