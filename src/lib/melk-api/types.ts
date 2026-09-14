/**
 * انواع داده دامنه (Domain Types) — قرارداد مشترک کل سامانه
 * ------------------------------------------------------
 * این انواع «قرارداد داده» بین UI، هسته کاشی‌ها، ایجنت‌ها و
 * لایه اتصال به سامانه‌های واقعی ملک تبریز هستند.
 *
 * ✅ ساختار ردیف‌ها «عیناً از صفحات رسمی سامانه ARM» استخراج شده
 * (تحلیل باندل TradedStatisticsPage / users-list-page / realtor-interactions-page):
 *   گزارش تطابق معاملات: propertyCode، propertyCustomer، requestCode،
 *   requestCustomer، contractDate، contractHolo، suggestedPropertyCount، eventsCount
 *   خلاصه گزارش: totalCount، hasRequestEvent، hasSuggestedProperty، hasBoth
 *   کارشناسان (realtors/list): fullName، mobile، role، business، creator، createdAt، active
 *   تعاملات مشاوران: requestRealtorName، propertyRealtorName، count
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

// ===================== معاملات (گزارش تطابق معاملات سامانه ARM) =====================

/**
 * یک ردیف «گزارش تطابق معاملات» — عین ساختار خود سامانه ملک تبریز:
 * هر معامله = تطبیق یک آگهی ملک (property) با یک درخواست خرید (request)
 * + اطلاعات قرارداد (تاریخ قرارداد، شماره هولوگرام) + شمارش رویداد و آگهی پیشنهادی.
 */
export interface CrmTransaction {
  /** شناسه رکورد (MongoDB _id یا کلید ترکیبی) */
  id: string;
  /** تاریخ معامله/قرارداد (ISO) — از contractDate سامانه ARM */
  contractDate: string;
  /** کد ملک (آگهی فروشنده) */
  propertyCode: string;
  /** نام مالک/مشتریِ طرف ملک */
  propertyCustomer: string | null;
  /** کد درخواست خرید (اگر معامله از مسیر درخواست رسیده باشد) */
  requestCode: string | null;
  /** نام درخواست‌دهنده طرف درخواست */
  requestCustomer: string | null;
  /** شماره هولوگرام قرارداد (شناسه رسمی سند در سامانه) */
  contractHolo: string | null;
  /** تعداد آگهی‌های پیشنهادی سیستم برای این تطبیق */
  suggestedPropertyCount: number;
  /** تعداد رویدادهای ثبت‌شده (تعامل کارشناس با درخواست) */
  eventsCount: number;
}

/**
 * خلاصه گزارش تطابق — همان چهار عددی که خود سامانه ARM
 * بالای گزارشش نمایش می‌دهد.
 */
export interface TradedSummary {
  totalCount: number;
  hasRequestEvent: number;
  hasSuggestedProperty: number;
  hasBoth: number;
}

export interface TransactionFilter {
  dateFrom?: string;
  dateTo?: string;
  propertyCode?: string;
  requestCode?: string;
  contractHolo?: string;
  /** فیلتر ترکیب: همه | رویداد | آگهی پیشنهادی | هر دو */
  matchKind?: "all" | "event" | "suggested" | "both";
  limit: number;
  offset: number;
  sortBy?: "contractDate" | "eventsCount" | "suggestedPropertyCount";
  sortDir?: "asc" | "desc";
}

export interface Paged<T> {
  rows: T[];
  total: number;
}

// ===================== کارشناسان (realtors/list سامانه ARM) =====================

/**
 * یک ردیف «فهرست کاربران/مشاوران» — عین ساختار users-list سامانه ARM:
 * نقش مشتری (realtor و…)، کسب‌وکار (شعبه)، ثبت‌کننده و زمان ثبت.
 */
export interface CrmExpert {
  id: string;
  /** کد پرسنلی/شناسه کاربر در سامانه */
  personnelCode: string;
  fullName: string;
  mobile: string;
  /** نقش کاربر (مثلاً «کارشناس و مشاور فروش») */
  role: string;
  /** عنوان کسب‌وکار/شعبه */
  businessTitle: string;
  /** نام ثبت‌کننده (مدیری که کاربر را ایجاد کرده) */
  creator: string | null;
  active: boolean;
  /** تاریخ ثبت/عضویت (ISO) */
  createdAt: string;
}

export interface ExpertFilter {
  fullName?: string;
  mobile?: string;
  personnelCode?: string;
  role?: string;
  businessTitle?: string;
  active?: boolean;
  limit: number;
  offset: number;
}

// ===================== تعاملات مشاوران (realtor-interactions سامانه ARM) =====================

/**
 * یک ردیف «تعاملات مشاوران با یکدیگر» — عین ساختار خود سامانه:
 * مشاور درخواست × مشاور آگهی × تعداد همکاری‌های منجر به تطبیق.
 */
export interface CrmInteraction {
  /** کلید طبیعی: requestRealtor|propertyRealtor */
  id: string;
  /** نام مشاورِ طرف درخواست خرید */
  requestRealtorName: string;
  /** نام مشاورِ طرف آگهی ملک */
  propertyRealtorName: string;
  /** تعداد تعامل/همکاری */
  count: number;
}

// ===================== بازدیدها و پیگیری‌ها (visits/list سامانه ARM) =====================

/**
 * یک ردیف «بازدید» — عین ساختار visits خود سامانه:
 * بررسی‌کننده × درخواست‌دهنده × کد آگهی × زمان ثبت/بررسی × وضعیت.
 */
export interface CrmVisit {
  id: string;
  /** کد آگهی مرتبط */
  propertyCode: string;
  /** نام درخواست‌دهنده (مشتری) */
  requesterName: string;
  /** نام بررسی‌کننده (کارشناس/مدیر) */
  checkerName: string;
  /** نام مشاور آگهی */
  propertyRealtorName: string;
  /** زمان بررسی (ISO یا رشته جلالی سامانه — نرمال‌شده به ISO) */
  checkTime: string | null;
  /** زمان ثبت بازدید (ISO) */
  createdAt: string;
  /** وضعیت بازدید (رشته فارسی سامانه) */
  status: string;
}

// ===================== عرضه و تقاضا (realtor-reports/supply-demand سامانه ARM) =====================

/**
 * یک ردیف «عرضه و تقاضا» — عین ستون‌های گزارش خود سامانه:
 * بازه × تعداد آگهی × درصد درخواست × وضعیت.
 */
export interface CrmSupplyDemand {
  id: string;
  /** عنوان بازه (مثلاً «۰ تا ۵۰ میلیون تومان») */
  rangeTitle: string;
  /** تعداد آگهی در بازه */
  propertyCount: number;
  /** درصد درخواست نسبت به عرضه */
  requestPercent: number;
  /** وضعیت بازه (رشته فارسی سامانه) */
  status: string;
}

// ===================== استخراج اطلاعات (کاشی استعلام زنده) =====================

/** اطلاعات تماس یک نفر (مالک آگهی یا درخواست‌دهنده) — از ساختار user سامانه ARM */
export interface PersonInfo {
  /** نام و نام خانوادگی */
  fullName: string;
  /** شماره موبایل */
  mobile: string;
  /** شماره تلفن ثابت (در صورت وجود) */
  phone: string;
  /** آیا کاربر در سامانه ثبت شده است؟ */
  isRegisteredUser: boolean;
}

/** نتیجه استخراج اطلاعات کدآگهی — از properties/info/by-code + details + owner */
export interface PropertyLookupResult {
  /** کدآگهی استعلام‌شده */
  code: string;
  /** شناسه آگهی در سامانه ARM */
  armId: string;
  /** عنوان آگهی (عنوان و محل آگهی) */
  title: string;
  /** مالک آگهی (آگهی‌دهنده) — نام/نام‌خانوادگی و شماره تماس */
  owner: PersonInfo | null;
  /** آدرس ملک (ترکیب آدرس و جزئیات مکانی آگهی) */
  address: string;
  /** مشاور مسؤول آگهی */
  relatedRealtor: string;
  /** جزئیات ساختاری آگهی (عین «جزئیات» خود سامانه: برچسب + مقدار + واحد) */
  details: { label: string; value: string; unit: string }[];
}

/** نتیجه استخراج اطلاعات کددرخواست — از requests/list + details + applicant */
export interface RequestLookupResult {
  /** کددرخواست استعلام‌شده */
  code: string;
  /** شناسه درخواست در سامانه ARM */
  armId: string;
  /** عنوان درخواست */
  title: string;
  /** درخواست‌دهنده (مشتری ملک) — نام/نام‌خانوادگی و شماره تماس */
  applicant: PersonInfo | null;
  /** کسب‌وکار/شعبه ثبت‌کننده درخواست */
  businessTitle: string;
  /** جزئیات ساختاری درخواست */
  details: { label: string; value: string; unit: string }[];
}

// ===================== قراردادها و اسناد (صورت وضعیت سامانه ARM) =====================

/**
 * وضعیت‌های واقعی چرخه عمر قرارداد — عین نقطه‌های وضعیت (status) خود سامانه ARM
 * (کشف از باندل رسمی trade-over-view-page + نگاشت فارسی خود سامانه).
 */
export const CONTRACT_STATUSES = [
  "preDefined",
  "waitingForAddRealtors",
  "waitingForRealtors",
  "waitingForFinance",
  "confirmedByFinance",
  "rejectedByFinance",
  "waitingForDocument",
  "rejected",
  "finished",
  "payed",
  "rescission",
  "deletedByFinance",
] as const;

export type ContractStatus = (typeof CONTRACT_STATUSES)[number];

/** نگاشت فارسی وضعیت‌ها — عین خود سامانه ARM */
export const CONTRACT_STATUS_FA: Record<ContractStatus, string> = {
  preDefined: "پیش‌نویس",
  waitingForAddRealtors: "در انتظار افزودن مشاور",
  waitingForRealtors: "در انتظار تایید مشاوران",
  waitingForFinance: "در انتظار تایید مالی",
  confirmedByFinance: "تایید شده مالی",
  rejectedByFinance: "رد شده مالی",
  waitingForDocument: "در انتظار تنظیم سند",
  rejected: "رد شده",
  finished: "تمام شده",
  payed: "پرداخت شده",
  rescission: "فسخ شده",
  deletedByFinance: "حذف شده مالی",
};

/** ترتیب منطقی مراحل قیف چرخه عمر (مراحل مثبت تا تنظیم سند) */
export const CONTRACT_FUNNEL_ORDER: ContractStatus[] = [
  "preDefined",
  "waitingForAddRealtors",
  "waitingForRealtors",
  "waitingForFinance",
  "confirmedByFinance",
  "waitingForDocument",
  "finished",
];

/** وضعیت‌های پایانی منفی (رد/فسخ/حذف) */
export const CONTRACT_REJECT_STATUSES: ContractStatus[] = [
  "rejected",
  "rejectedByFinance",
  "rescission",
  "deletedByFinance",
];

/** مشاور و حق‌السهم یک قرارداد — عین ساختار primaryRealtorList/secondaryRealtorList سامانه */
export interface ContractRealtorShare {
  /** نام مشاور */
  name: string;
  /** درصد حق‌السهم */
  unitPercent: number;
  /** وضعیت تأیید مشاور: wait | confirm | reject */
  confirmation: string;
  /** توضیحات (به‌ویژه هنگام رد) */
  description?: string;
  /** نقش: primary (اصلی/مبعع) | secondary (فرعی) */
  role: "primary" | "secondary";
}

/** یک قرارداد (صورت وضعیت) — عین ساختار trade-overviews/info سامانه ARM */
export interface CrmContract {
  id: string;
  status: ContractStatus | string;
  contractHolo: string | null;
  propertyCode: string | null;
  requestCode: string | null;
  contractType: string | null;
  creatorName: string | null;
  createdAt: string | null;
  contractDate: string | null;
  documentDate: string | null;
  deliveryDate: string | null;
  propertyTitle: string | null;
  propertyAddress: string | null;
  buyers: { fullName: string; mobileNumber: string }[];
  sellers: { fullName: string; mobileNumber: string }[];
  realtorShares: ContractRealtorShare[];
  canAddRealtor: boolean;
}

/** یک مرحله از قیف چرخه عمر قرارداد */
export interface ContractFunnelStage {
  status: ContractStatus;
  label: string;
  count: number;
  /** سهم از کل قراردادها */
  sharePercent: number;
}

// ===================== باشگاه مشتریان =====================

/** یک عضو جامعه مشتریان — تلفیق معاملات، قراردادها و مشاوران */
export interface CustomerClubMember {
  /** نام (کلید یکتا جامعه — نرمال‌شده) */
  name: string;
  /** نقش‌های دیده‌شده: BUYER | SELLER | EXPERT */
  roles: ("BUYER" | "SELLER" | "EXPERT")[];
  /** آیا هم خریدار و هم فروشنده بوده (مشتری تکراری/دوطرفه) */
  repeat: boolean;
  /** تعداد معاملات به‌عنوان خریدار */
  buyerCount: number;
  /** تعداد معاملات به‌عنوان فروشنده */
  sellerCount: number;
  /** اولین و آخرین حضور (ISO) */
  firstSeen: string | null;
  lastSeen: string | null;
  /** شماره تماس (در صورت وجود در قرارداد) */
  mobile: string | null;
}

/** توزیع یک ویژگی مرجع (شخصیت/شغل/نقش/جدیت) از فهرست‌های واقعی سامانه */
export interface RefListItem {
  id: string;
  name: string;
}

/** خلاصه تحلیل جامعه مشتریان */
export interface CustomerClubSummary {
  totalMembers: number;
  buyers: number;
  sellers: number;
  experts: number;
  repeatCustomers: number;
  growthSeries: { key: string; count: number }[];
  topCustomers: CustomerClubMember[];
  catalogs: {
    characters: RefListItem[];
    jobs: RefListItem[];
    roles: RefListItem[];
    seriousness: RefListItem[];
  };
}

// ===================== مالی و کمیسیون =====================

/** نوع قرارداد کمیسیون — عین contractType سامانه مالی (fm) */
export type CommissionContractType = "mobayeName" | "ejareName" | "rentalRenewal";

/** پیکربندی تعرفه یک شهر — عین پاسخ apm/commission/configList سامانه مالی */
export interface CommissionCityConfig {
  cityId: string;
  cityName: string;
  /** درصد مالیات ارزش افزوده (پیش‌فرض ۱۰) */
  valueAddedPercentage: number;
  /** نرخ‌نامه اتحادیه (HTML) */
  realEstateTariff: string;
  /** تصویر نرخ‌نامه (مسیر نسبی) */
  image: string | null;
  /** انواع معامله پشتیبانی‌شده */
  detail: {
    contractType: CommissionContractType | string;
    contractTypeFa: string;
    buyerLabel: string;
    sellerLabel: string;
    inputs: { key: string; label: string }[];
  }[];
}

/** نتیجه محاسبه کمیسیون — عین commissionData سامانه مالی */
export interface CommissionResult {
  contractType: string;
  /** کمیسیون پایه هر طرف (تومان) */
  buyerCommission: number;
  sellerCommission: number;
  /** مالیات ارزش افزوده هر طرف */
  buyerTax: number;
  sellerTax: number;
  /** مبلغ قابل پرداخت هر طرف (کمیسیون + مالیات) */
  buyerPayable: number;
  sellerPayable: number;
  /** معادل ریالی ثمن/ودیعه برای تجمیع */
  dealValue: number;
  vatPercent: number;
}

// ===================== شاخص قیمت روز مناطق =====================

/** یک شاخص قیمت روز — عین رکورد configs/current-prices سامانه ARM */
export interface PriceIndexConfig {
  id: string;
  /** نوع معامله (فروش و ...) */
  tradeType: string;
  /** نوع کاربری (مسکونی و ...) */
  buildingType: string;
  /** نوع ملک (آپارتمان و ...) */
  propertyType: string;
  city: string;
  /** سال‌های اعتبار شاخص */
  yearFrom: number | null;
  yearTo: number | null;
  /** اجاره است؟ */
  isRental: boolean;
  /** فعال است؟ */
  isActive: boolean;
  areas: string[];
  /** مشخصات فنی شاخص (label/value) */
  details: { label: string; value: string }[];
}

/** آمار قیمت یک منطقه از داده واقعی بازار */
export interface AreaPriceStat {
  areaName: string;
  category: string;
  medianPerMeter: number;
  p25PerMeter: number;
  p75PerMeter: number;
  minPerMeter: number;
  maxPerMeter: number;
  sampleCount: number;
  /** تغییر نسبت به دوره قبل (٪) — null اگر تاریخچه نیست */
  changePercent: number | null;
}

/** آگهی منحرف از شاخص منطقه (پایش سلامت قیمت‌گذاری) */
export interface DeviatingAd {
  token: string;
  title: string;
  areaName: string;
  pricePerMeter: number;
  medianPerMeter: number;
  /** انحراف نسبی از میانه (٪) — مثبت = گران‌تر از شاخص */
  deviationPercent: number;
  totalScore: number;
  publisherType: string | null;
}

/** روند شاخص کل/هر منطقه در زمان */
export interface PriceTrendPoint {
  areaName: string;
  recordedAt: string;
  medianPerMeter: number;
  sampleCount: number;
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
