/**
 * دفترچهٔ جامعه مشتریان ملک تبریز — P6.5-11 (بند ح-۲)
 * ------------------------------------------------------
 * «بخش فهرست مشتریان (تک‌صفحه‌ای) — اطلاعات تمامی مشتریان ملک تبریز:
 *  نام و نام خانوادگی، شماره تماس و سایر ستون‌های مورد نیاز»
 *
 * 🔒 لایهٔ تحلیل (قانون دادهٔ مقدس — بند الف): فقط می‌خواند و ترکیب می‌کند؛
 * هیچ ستونی از دادهٔ خام را نمی‌نویسد. تلفیق چهار منبع حقیقت:
 *   ۱) خریداران/فروشندگان قراردادها (fullName + mobileNumber)
 *   ۲) طرف‌های ملک/درخواست معاملات (propertyCustomer / requestCustomer)
 *   ۳) مالکان آگهی‌های ARM (rawOwnerName + ownerMobile — لایهٔ ۲ غنی‌شده)
 *   ۴) درخواست‌دهندگان ARM (customerName + customerMobile)
 *
 * کلید ادغام: موبایل نرمال‌شده (اولویت اول) → نام نرمال‌شده (بدون موبایل).
 */

// ==========================================================================
// انواع
// ==========================================================================

export type CustomerRole = "BUYER" | "SELLER" | "OWNER" | "REQUESTER";
export type CustomerSource = "contract" | "transaction" | "arm-listing" | "arm-request";

export interface DirectoryCustomer {
  /** کلید یکتا: موبایل نرمال‌شده یا نام نرمال‌شده */
  key: string;
  fullName: string;
  mobile: string | null;
  roles: CustomerRole[];
  /** مجموع حضورها در همهٔ منابع */
  appearances: number;
  sources: CustomerSource[];
  firstSeenAt: string | null;
  lastSeenAt: string | null;
}

export interface DirectoryPartyInput {
  fullName: string | null | undefined;
  mobile?: string | null | undefined;
  role: CustomerRole;
  source: CustomerSource;
  date?: string | null | undefined;
}

export interface CustomerDirectoryStats {
  total: number;
  withMobile: number;
  buyers: number;
  sellers: number;
  owners: number;
  requesters: number;
}

// ==========================================================================
// نرمال‌سازی (خالص — عین الگوی normalize)
// ==========================================================================

/** موبایل نرمال‌شده 09xxxxxxxxx — ارقام فارسی/عربی هم پذیرفته می‌شوند */
export function normalizeMobileDir(v: string | null | undefined): string | null {
  if (!v) return null;
  const digits = v
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/\D/g, "");
  if (digits.length === 0) return null;
  // 98xxxxxxxxxx → 0xxxxxxxxxx · xxxxxxxxxx(۱۰رقم با ۹ شروع) → 09…
  let local = digits;
  if (local.length === 12 && local.startsWith("98")) local = "0" + local.slice(2);
  if (local.length === 10 && local.startsWith("9")) local = "0" + local;
  return /^09\d{9}$/.test(local) ? local : digits.length >= 10 ? local : null;
}

/** نرمال‌سازی نام برای کلید ادغام (بدون تغییر دادهٔ خام — فقط مقایسه) */
export function normalizeNameKey(v: string | null | undefined): string | null {
  if (!v) return null;
  const n = v
    .replace(/[يى]/g, "ی")
    .replace(/ك]/g, "ک")
    .replace(/[\u200c\u200f\u200e]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return n.length > 0 ? n : null;
}

// ==========================================================================
// سازندهٔ دفترچه (خالص و قابل تست)
// ==========================================================================

export function buildCustomerDirectory(parties: DirectoryPartyInput[]): DirectoryCustomer[] {
  const byMobile = new Map<string, DirectoryCustomer>();
  const byName = new Map<string, DirectoryCustomer>();

  for (const p of parties) {
    const name = (p.fullName ?? "").trim();
    if (!name && !p.mobile) continue;
    const mobile = normalizeMobileDir(p.mobile);
    const nameKey = normalizeNameKey(name);

    // یافتن موجودیت موجود: اول موبایل (کلید قوی‌تر)، سپس نام
    let target: DirectoryCustomer | undefined = mobile ? byMobile.get(mobile) : undefined;
    if (!target && nameKey) target = byName.get(nameKey);

    if (target) {
      // ادغام در موجودیت موجود + تکمیل فیلدهای تهی
      if (!target.roles.includes(p.role)) target.roles.push(p.role);
      if (!target.sources.includes(p.source)) target.sources.push(p.source);
      target.appearances += 1;
      if (!target.mobile && mobile) target.mobile = mobile;
      if (p.date) {
        if (!target.firstSeenAt || p.date < target.firstSeenAt) target.firstSeenAt = p.date;
        if (!target.lastSeenAt || p.date > target.lastSeenAt) target.lastSeenAt = p.date;
      }
      // ثبت در هر دو ایندکس (موجودیت واحد از هر دو مسیر قابل‌یافت می‌ماند)
      if (mobile && !byMobile.has(mobile)) byMobile.set(mobile, target);
      if (nameKey && !byName.has(nameKey)) byName.set(nameKey, target);
      continue;
    }

    // موجودیت تازه — در هر دو ایندکسِ موجود ثبت می‌شود
    const created: DirectoryCustomer = {
      key: mobile ?? nameKey ?? "unknown",
      fullName: name || "بدون نام",
      mobile,
      roles: [p.role],
      appearances: 1,
      sources: [p.source],
      firstSeenAt: p.date ?? null,
      lastSeenAt: p.date ?? null,
    };
    if (mobile) byMobile.set(mobile, created);
    if (nameKey) byName.set(nameKey, created);
  }

  // یکسان‌سازی: هر موجودیت از هر دو ایندکس یکتا جمع می‌شود
  const unique = new Set([...byMobile.values(), ...byName.values()]);
  return [...unique].sort((a, b) => b.appearances - a.appearances || a.fullName.localeCompare(b.fullName, "fa"));
}

export function directoryStats(rows: DirectoryCustomer[]): CustomerDirectoryStats {
  return {
    total: rows.length,
    withMobile: rows.filter((r) => r.mobile).length,
    buyers: rows.filter((r) => r.roles.includes("BUYER")).length,
    sellers: rows.filter((r) => r.roles.includes("SELLER")).length,
    owners: rows.filter((r) => r.roles.includes("OWNER")).length,
    requesters: rows.filter((r) => r.roles.includes("REQUESTER")).length,
  };
}

/** فیلتر جست‌وجوی دفترچه — نام (contains) یا موبایل (contains ارقام) */
export function filterDirectory(rows: DirectoryCustomer[], q: string): DirectoryCustomer[] {
  const query = q.trim();
  if (!query) return rows;
  const digits = query.replace(/\D/g, "");
  const nameKey = normalizeNameKey(query) ?? query.toLowerCase();
  return rows.filter(
    (r) =>
      (r.fullName && r.fullName.toLowerCase().includes(nameKey)) ||
      (digits.length > 0 && r.mobile && r.mobile.includes(digits))
  );
}
