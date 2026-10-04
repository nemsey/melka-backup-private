/**
 * انواع و ثابت‌های «چرخه عمر مشتری» — ماژول خالص مشترک UI/سرور (PHASE 1 / P1-03)
 * ------------------------------------------------------
 * صفر وابستگی سرور (بدون @/lib/db و بدون @prisma/client) —
 * ایمن برای import در کامپوننت‌های کلاینت (Prisma هرگز وارد باندل نمی‌شود).
 *
 * منبع یگانه حقیقت؛ موتور محاسباتی (buildCustomerManagement) در
 * «src/lib/request/customer-mgmt.ts» همین انواع را re-export می‌کند.
 */

// ===================== چرخه عمر =====================

export type LifecycleStage = "NEW" | "ENGAGED" | "SERIOUS" | "READY_TO_DEAL" | "CONVERTED" | "DORMANT";

export const LIFECYCLE_FA: Record<LifecycleStage, string> = {
  NEW: "مشتری جدید",
  ENGAGED: "در تعامل",
  SERIOUS: "جدی",
  READY_TO_DEAL: "آماده معامله",
  CONVERTED: "معامله‌شده",
  DORMANT: "راکد",
};

export const LIFECYCLE_COLOR: Record<LifecycleStage, string> = {
  NEW: "text-sky-700 bg-sky-50 border-sky-200 dark:text-sky-300 dark:bg-sky-950 dark:border-sky-900",
  ENGAGED: "text-teal-700 bg-teal-50 border-teal-200 dark:text-teal-300 dark:bg-teal-950 dark:border-teal-900",
  SERIOUS: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950 dark:border-amber-900",
  READY_TO_DEAL: "text-teal-700 bg-teal-50 border-teal-200 dark:text-teal-300 dark:bg-teal-950 dark:border-teal-900",
  CONVERTED: "text-teal-800 bg-teal-100 border-teal-300 dark:text-teal-200 dark:bg-teal-900 dark:border-teal-700",
  DORMANT: "text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-300 dark:bg-rose-950 dark:border-rose-900",
};

// ===================== بخش‌بندی و اقدام بعدی =====================

export type Segment = "A" | "B" | "C";

export interface NextAction {
  kind: "CONTACT_OVERDUE" | "INTRODUCE_MATCHES" | "ARRANGE_VISIT" | "COMPLETE_REQUEST" | "REGISTER_TO_ARM" | "REACTIVATE" | "NURTURE" | "NONE";
  title: string;
  detail: string;
  priority: 1 | 2 | 3; // ۱ = فوری
}

export const ACTION_FA: Record<NextAction["kind"], string> = {
  CONTACT_OVERDUE: "تماس فوری",
  INTRODUCE_MATCHES: "معرفی آگهی منطبق",
  ARRANGE_VISIT: "هماهنگی بازدید",
  COMPLETE_REQUEST: "تکمیل درخواست",
  REGISTER_TO_ARM: "ثبت در سامانه آرم",
  REACTIVATE: "بازگرداندن مشتری",
  NURTURE: "پیگیری نرم",
  NONE: "—",
};

// ===================== ساختارهای خروجی موتور مدیریت مشتریان =====================

export interface RequestMatch {
  requestId: string;
  requestTitle: string;
  listingId: string;
  listingTitle: string;
  listingPrice: string | null;
  score: number; // ۰-۱۰۰
  band: "عالی" | "خوب" | "ضعیف";
  breakdown: { label: string; got: number; max: number }[];
}

export interface CustomerProfile {
  /** کلید یکتا — موبایل نرمال‌شده */
  mobile: string;
  name: string;
  requestCount: number;
  requests: {
    id: string;
    title: string;
    status: string;
    completeness: { completeCount: number; total: 4 };
    armRegistered: boolean;
    seriousnessName: string;
    paymentMethodName: string;
    eventCount: number;
    topMatchScore: number | null;
    updatedAt: string;
  }[];
  /** ۳۶۰ درجه: این مشتری مالکِ چند آگهی نیز هست (سمت فروش) */
  ownedListings: { id: string; title: string; price: string | null }[];
  /** این مشتری در معاملات/قراردادهای ثبت‌شده خریدار بوده */
  convertedDeals: number;
  eventCount: number;
  lastInteractionAt: string | null;
  daysSinceInteraction: number | null;
  healthScore: number;
  healthBreakdown: { label: string; got: number; max: number }[];
  stage: LifecycleStage;
  segment: Segment;
  nextActions: NextAction[];
  bestMatches: RequestMatch[];
}

export interface CustomerManagementSummary {
  customers: CustomerProfile[];
  stats: {
    totalCustomers: number;
    activeCustomers: number;
    dormantCustomers: number;
    convertedCustomers: number;
    avgHealth: number;
    segmentA: number;
    segmentB: number;
    segmentC: number;
    stageCounts: Record<LifecycleStage, number>;
    totalMatches: number;
    strongMatches: number;
    overdueContacts: number;
  };
}
