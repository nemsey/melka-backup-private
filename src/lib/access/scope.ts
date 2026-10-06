/**
 * Helper مرکزی دامنهٔ دسترسی — P6.5-04-i (دستور چهارفازی مالک، فاز ۱)
 * ---------------------------------------------------------------------------
 * تک‌نقطهٔ تصمیم «چه کسی چه داده‌ای می‌بیند» — هر ۷ موجودیت داده از همین‌جا
 * دامنهٔ خود را می‌گیرند. هیچ مسیر خواندنی حق نوشتن فیلتر دامنه به‌صورت
 * دست‌نویس را ندارد (گارد ساختاری: scripts/audit-scope-usage.ts).
 *
 * قانون مالک (اعلامیهٔ ۵ §۱.۱۲ — «دادهٔ خودِ مالک»):
 *   نشست مالک (role=OWNER یا accessScope=OWNER) ⇒ صفر فیلتر دامنه روی
 *   «همهٔ» موجودیت‌ها — ۱۰۰٪ داده، صفر محدودیت کاشی (zero expert scope
 *   filtering, zero tile limits) — فقط شاهد owner.read در AuditLog.
 *
 * قانون مشاور (ماتریس §۵.۳ سند طراحی P6.5-02 — مصوب شورا، دست‌نخورده):
 *   · موجودیت‌های شخصی (listing / request / customer / visit):
 *     فقط ردیف‌های منتسب به خودش (actorCode/ownerCode)؛ شعبه برای BRANCH؛
 *     fail-closed روی کد تهی.
 *   · موجودیت‌های تجمیعی/سراسری (transaction / expert / contract /
 *     interaction / supply-demand / property): همهٔ دامنه‌ها همهٔ ردیف‌ها
 *     را می‌بینند (عین خود سامانه — گزارش‌های دپارتمانی).
 *
 * ✅ این فایل خالص است: صفر Prisma/db — خروجی فقط «بند دامنه» است؛
 *    نگاشت بند به ستون واقعی بر عهدهٔ لایهٔ مصرف‌کننده (store/repo) با
 *    قرارداد ثابت این فایل (ownerCode برای visit، actorCode برای بقیه).
 */

import {
  personalScopeClause,
  scopeFromSession,
  type AccessScope,
  type ScopeClause,
  type ScopeFilter,
} from "@/core/repositories";

// ===================== موجودیت‌های تحت دامنه =====================

/** موجودیت‌های دادهٔ تحت حاکمیت helper (۷ موجودیت دستور + مشتری/عرضه‌تقاضا از §۵.۳ + کاتالوگ‌های ARM از P6.5-10) */
export type ScopeEntity =
  | "transaction"
  | "expert"
  | "contract"
  | "interaction"
  | "visit"
  | "listing"
  | "request"
  | "customer"
  | "supply-demand"
  | "property"
  | "arm-request";

/**
 * ماتریس §۵.۳ (P6.5-02 — مصوب): شخصی در برابر تجمیعی.
 * شخصی: مشاور فقط خودش؛ مالک همه.
 * تجمیعی/سراسری: همهٔ دامنه‌ها همهٔ ردیف‌ها (گزارش دپارتمانی).
 */
const PERSONAL_ENTITIES: ReadonlySet<ScopeEntity> = new Set(["listing", "request", "customer", "visit"]);
const AGGREGATE_ENTITIES: ReadonlySet<ScopeEntity> = new Set([
  "transaction",
  "expert",
  "contract",
  "interaction",
  "supply-demand",
  "property",
  // P6.5-10 — کاتالوگ درخواست‌های ARM (کاشی «درخواست‌های ملک تبریز»):
  // عین property تجمیعی است — گزارش دپارتمانی عین خود سامانه؛ مالک همه را
  // بدون فیلتر می‌بیند (قانون مالک) و مشاوران گزارش سراسری می‌بینند (§۵.۳)
  "arm-request",
]);

/** ستون انتساب هر موجودیت شخصی (قرارداد §۵.۳) */
export const PERSONAL_SCOPE_COLUMN: Record<string, "actorCode" | "ownerCode"> = {
  listing: "actorCode",
  request: "actorCode",
  customer: "actorCode",
  visit: "ownerCode",
};

// ===================== شکل نشست =====================

/** شکل ساختاری نشست برای حل دامنه — SessionContext اپ و ردیف Prisma Session هر دو ارضا می‌کنند */
export interface AccessSession {
  personnelCode: string;
  /** نقش احراز هویت v1: OWNER (ورود مدیر/کد مدیر) | CONSULTANT (OTP) */
  role?: string | null;
  /** دامنهٔ داده (§۵.۱): OWNER | BRANCH | CONSULTANT */
  accessScope?: string | null;
  branchId?: string | null;
}

// ===================== نتیجهٔ دامنه =====================

/** خروجی helper برای یک موجودیت */
export interface EntityAccess<E extends ScopeEntity = ScopeEntity> {
  /** بند دامنه — ALL یعنی صفر فیلتر */
  clause: ScopeClause;
  /** فیلتر کامل برای AuditLog */
  filter: ScopeFilter;
  /** true = خواننده مالک است ⇒ شاهد owner.read (الزام دستور فاز ۱) */
  isOwnerRead: boolean;
  /** نام موجودیت (برای AuditLog) */
  entity: E;
}

/** آیا نشست مالک است؟ (role=OWNER یا accessScope=OWNER — دفاع دو-لایه) */
export function isOwnerSession(session: AccessSession): boolean {
  if (session.role === "OWNER") return true;
  return session.accessScope === "OWNER";
}

/**
 * حل دامنهٔ یک موجودیت برای یک نشست — تنها نقطهٔ ورود مسیرهای خواندن.
 * مالک ⇒ همیشه ALL (صفر فیلتر) روی همهٔ موجودیت‌ها.
 * مشاور ⇒ شخصی‌ها بند §۵.۳، تجمیعی‌ها ALL.
 */
export function resolveEntityAccess<E extends ScopeEntity>(session: AccessSession, entity: E): EntityAccess<E> {
  const filter = scopeFromSession(session);
  if (isOwnerSession(session)) {
    return { clause: { kind: "ALL" }, filter, isOwnerRead: true, entity };
  }
  if (AGGREGATE_ENTITIES.has(entity)) {
    return { clause: { kind: "ALL" }, filter, isOwnerRead: false, entity };
  }
  return { clause: personalScopeClause(filter), filter, isOwnerRead: false, entity };
}

/**
 * شرط دامنهٔ نوع-دار برای موجودیت‌های شخصی — ستون از قرارداد PERSONAL_SCOPE_COLUMN:
 * visit ⇒ ownerCode · بقیهٔ شخصی‌ها ⇒ actorCode · BRANCH ⇒ branchId.
 * undefined = بدون فیلتر (ALL) · null = DENY_ALL (fail-closed — هیچ ردیفی).
 */
export type PersonalWhere<E extends ScopeEntity> =
  E extends "visit"
    ? { ownerCode?: string; branchId?: string } | null | undefined
    : { actorCode?: string; branchId?: string } | null | undefined;

export function personalScopeWhere<E extends ScopeEntity>(access: EntityAccess<E>): PersonalWhere<E> {
  if (access.clause.kind === "ALL") return undefined as PersonalWhere<E>;
  if (access.clause.kind === "DENY_ALL") return null as PersonalWhere<E>;
  if (access.clause.kind === "BRANCH") return { branchId: access.clause.branchId } as PersonalWhere<E>;
  const column = PERSONAL_SCOPE_COLUMN[access.entity] ?? "actorCode";
  return { [column]: access.clause.code } as PersonalWhere<E>;
}

/** دامنهٔ متن رفع ابهام برای AuditLog (بدون داده حساس) */
export function describeAccess(access: EntityAccess): string {
  const base = `entity=${access.entity}; scope=${access.filter.accessScope}; clause=${access.clause.kind}`;
  if (access.isOwnerRead) return `${base}; ownerRead=true`;
  return base;
}

/**
 * مسیر ورود مالک برای شاهد owner.read (الزام فاز ۱):
 * personnelCode="OWNER" ⇒ ورود با کد مدیر (manager-code)؛
 * کد پرسنلی واقعی خود مالک (MANAGER_CODE) ⇒ ورود OTP از مسیر کارشناسان (expert-login).
 */
export function ownerLoginPath(session: AccessSession): "manager-code" | "expert-login" {
  return session.personnelCode === "OWNER" ? "manager-code" : "expert-login";
}

// re-export برای راحتی مصرف‌کننده‌ها (تک نقطهٔ import دامنه)
export type { AccessScope, ScopeClause, ScopeFilter };
