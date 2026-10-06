/**
 * قرارداد ConsultantScope — P6.5-02 (§۵.۲ طراحی PHASE-6.5)
 * ------------------------------------------------------
 * فیلتر دامنه (ScopeFilter) + قرارداد مخزن‌های Scope-دار (افزودنی بر v1).
 *
 * اصول (عین طراحی):
 *  ۱) متدهای v1 (findAll/listRecent/...) دست‌نخورده — هیچ امضایی تغییر نمی‌کند؛
 *     قراردادهای Scoped* فقط «متد افزودنی» تعریف می‌کنند.
 *  ۲) ماتریس دامنه (§۵.۳):
 *     · ListingRecord / RequestRecord(=دامنه مشتری) / CustomerRecord — شخصی (actorCode/ownerCode)
 *     · VisitRecord — شخصی (ownerCode افزودنی؛ fail-closed: ردیف بدون انتساب فقط برای OWNER)
 *     · TransactionRecord — تجمیعی دپارتمان (همه دامنه‌ها همه ردیف‌ها را می‌بینند)
 *  ۳) tenantId در ScopeFilter حمل می‌شود اما تا PHASE 8+ فیلتر فعال نیست
 *     (مصوبه شورا §۱۴: صفر منطق فعال multi-tenant در PHASE 6.5).
 *  ۴) هر فراخوانی findWithScope باید AuditLog بنویسد (§۶.۲ — پیاده‌سازی در لایه Prisma).
 *
 * ✅ این فایل باید ۱۰۰٪ خالص بماند: هیچ import ارزشی از @prisma/client یا @/lib/db.
 *    (گارد: scripts/audit-repository-boundary.sh + تست خلوص phase2-repositories)
 */
import type { TenantResolver, TenantSession } from "../tenant";
import { defaultTenantResolver } from "../tenant";
import type { ListingDTO, RequestRecordDTO, TransactionDTO, VisitDTO } from "./dto";
import type { CustomerRepository } from "./customer.repository";
import type { ListingRepository } from "./listing.repository";
import type { TransactionRepository, TransactionListOptions } from "./transaction.repository";
import type { VisitListFilter, VisitRepository } from "./visit.repository";

// ===================== دامنه دسترسی =====================

/** دامنه دسترسی داده نشست (§۵.۱) — مستقل از نقش احراز هویت v1 */
export type AccessScope = "OWNER" | "BRANCH" | "CONSULTANT";

/**
 * فیلتر دامنه — همراه هر Query جدید لایه سرویس.
 * tenantId: همیشه 'melk-tabriz' در این فاز (TenantResolver placeholder §۵.۵).
 */
export interface ScopeFilter {
  tenantId: string;
  accessScope: AccessScope;
  /** کد کارشناس نشست (≡ consultantCode — انحراف مصوب §۱۲-۱) */
  personnelCode: string;
  /** برای BRANCH */
  branchId?: string | null;
}

// ===================== Queryهای Scope-دار =====================

/** Query فهرست Scope-دار فایل‌های آگهی */
export interface ListingScopeQuery {
  take?: number;
}

/** Query فهرست Scope-دار دامنه مشتری (RequestRecord فعلی + CustomerRecord آینده) */
export interface CustomerScopeQuery {
  take?: number;
}

/** Query فهرست Scope-دار بازدیدها — فیلتر v1 + سقف اختیاری */
export interface VisitScopeQuery {
  filter?: VisitListFilter;
  take?: number;
}

// ===================== مشتق‌سازی دامنه =====================

/**
 * دامنه پیش‌فرض بر اساس نقش احراز هویت هنگام ساخت نشست (§۵.۱):
 * ورود مدیر = OWNER (رفتار فعلی صفر-تغییر) · ورود OTP مشاور = CONSULTANT.
 */
export function defaultAccessScopeForRole(role: string): AccessScope {
  return role === "OWNER" ? "OWNER" : "CONSULTANT";
}

/**
 * ساخت ScopeFilter از نشست.
 * نشست قدیمی بدون accessScope (یا مقدار ناشناخته) = OWNER — صفر شکست (§۵.۶-۴).
 */
export function scopeFromSession(
  session: TenantSession,
  resolver: TenantResolver = defaultTenantResolver
): ScopeFilter {
  const raw = session.accessScope;
  const accessScope: AccessScope =
    raw === "BRANCH" || raw === "CONSULTANT" ? raw : "OWNER";
  return {
    tenantId: resolver.resolve(session),
    accessScope,
    personnelCode: session.personnelCode ?? "",
    branchId: session.branchId ?? null,
  };
}

// ===================== شرط دامنه شخصی (خالص) =====================

/**
 * استخراج شرط دامنه شخصی از ScopeFilter (ماتریس §۵.۳) — خالص و بازرسی‌پذیر:
 *  - ALL: OWNER — بدون شرط اضافه
 *  - PERSONAL: CONSULTANT — فقط ردیف‌های منتسب به خودش
 *  - BRANCH: فقط ردیف‌های شعبه
 *  - DENY_ALL: fail-closed — کد پرسنلی/شعبه تهی ⇒ هیچ ردیفی
 * نگاشت PERSONAL به ستون واقعی (actorCode یا ownerCode) بر عهده مخزن است.
 */
export type ScopeClause =
  | { kind: "ALL" }
  | { kind: "PERSONAL"; code: string }
  | { kind: "BRANCH"; branchId: string }
  | { kind: "DENY_ALL" };

export function personalScopeClause(scope: ScopeFilter): ScopeClause {
  if (scope.accessScope === "CONSULTANT") {
    return scope.personnelCode
      ? { kind: "PERSONAL", code: scope.personnelCode }
      : { kind: "DENY_ALL" };
  }
  if (scope.accessScope === "BRANCH") {
    return scope.branchId ? { kind: "BRANCH", branchId: scope.branchId } : { kind: "DENY_ALL" };
  }
  return { kind: "ALL" };
}

// ===================== قرارداد مخزن‌های Scope-دار (افزودنی) =====================

/** معاملات + Scope — تجمیعی: همه دامنه‌ها همه ردیف‌ها؛ AuditLog همیشه ثبت می‌شود */
export interface ScopedTransactionRepository extends TransactionRepository {
  findWithScope(options: TransactionListOptions, scope: ScopeFilter): Promise<TransactionDTO[]>;
}

/** فایل‌های آگهی + Scope — شخصی (actorCode): CONSULTANT خودش · BRANCH شعبه · OWNER همه */
export interface ScopedListingRepository extends ListingRepository {
  findWithScope(query: ListingScopeQuery, scope: ScopeFilter): Promise<ListingDTO[]>;
}

/** دامنه مشتری (درخواست‌ها) + Scope — شخصی (actorCode) */
export interface ScopedCustomerRepository extends CustomerRepository {
  findWithScope(query: CustomerScopeQuery, scope: ScopeFilter): Promise<RequestRecordDTO[]>;
}

/** بازدیدها + Scope — شخصی (ownerCode افزودنی؛ fail-closed روی تهی) */
export interface ScopedVisitRepository extends VisitRepository {
  findWithScope(query: VisitScopeQuery, scope: ScopeFilter): Promise<VisitDTO[]>;
}
