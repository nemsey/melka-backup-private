/**
 * experts/profile-store.ts — PN-008 (ثانیاً): فهرست تازهٔ کارشناسان
 * =====================================================================
 * بازنویسی کامل بر اساس کشف سرد بی‌پیش‌فرض سامانهٔ PM (۱۴۰۵/۰۷/۱۶).
 * شواهد: download/pn008/pm-exploration.json + arm-reports-exploration.json
 *
 * منابع:
 *   · رجیستری PM realtors/list (۱۴۳ پرسنل؛ code/نام/موبایل/داخلی — ۱۰۰٪ پر)
 *   · عمق PM realtors/info/personnelInfo/{id} (استخدام + شعبه + مدیر + سمت)
 *   · عمق PM realtors/info/contactInfo/{id} (آدرس + تلفن + کدپستی + شهر)
 *   · شمارش مبایعه/اجاره: دادهٔ ARM محلی (قراردادهای تایپ‌دار + گزارش تطابق
 *     با تفکیک اجاره‌ای از isRental آگهی) — با به‌روزرسانی خودکار دیمن
 *
 * اصول: فقط GET به مبدأ · upsert-only (دادهٔ مقدس) · لایهٔ خام عین منبع ·
 * شکست هر مرحله مستقل و صادقانه گزارش می‌شود · رکورد بی‌داده = null (UI «-» می‌کشد)
 */

import { db } from "@/lib/db";
import { armCall } from "@/lib/melk-api/client";
import { getMelkApiConfig } from "@/lib/melk-api/config";
import { MELK_ENDPOINTS } from "@/lib/melk-api/endpoints";

// ─────────────────────────── انواع (قرارداد) ───────────────────────────

/** نوع همکاری پرسنلی سامانهٔ PM (کشف زندهٔ P6547 — employeementInfo.type) */
export const EMPLOYMENT_TYPE_FA: Record<number, string> = {
  1: "حق السهم (درصد)",
  3: "حقوق ماهیانه",
};

/** ردیف فهرست کارشناسان — همهٔ ستون‌ها (null = بدون داده → UI «-») */
export interface ExpertProfileRow {
  id: string;
  personnelCode: string | null;
  fullName: string | null;
  mobile: string | null;
  roleTitle: string | null;
  branchTitle: string | null;
  hireDate: string | null;
  employmentType: number | null;
  employmentTypeFa: string | null;
  headManager: string | null;
  address: string | null;
  telephone: string | null;
  postalCode: string | null;
  voipExtension: string | null;
  city: string | null;
  state: string | null;
  businessTitle: string | null;
  active: boolean;
  saleCount: number;
  rentCount: number;
  syncedAt: string;
}

/** فیلتر تمام ستون‌ها — هر ستون فهرست، فیلدر مستقل دارد */
export interface ExpertProfileFilter {
  q?: string;
  fullName?: string;
  mobile?: string;
  personnelCode?: string;
  branchTitle?: string;
  roleTitle?: string;
  employmentType?: number;
  headManager?: string;
  address?: string;
  telephone?: string;
  postalCode?: string;
  voipExtension?: string;
  city?: string;
  active?: boolean;
  // PN-011 ثالثاً — فیلترهای چندانتخابی چیپی (تکرار پارامتر در API ← آرایه اینجا؛ OR درون گروه)
  branchTitles?: string[];
  roleTitles?: string[];
  employmentTypes?: number[];
  headManagers?: string[];
  cities?: string[];
  actives?: boolean[];
  hireFrom?: string;
  hireTo?: string;
  saleFrom?: number;
  saleTo?: number;
  rentFrom?: number;
  rentTo?: number;
  sort?: "name" | "sale" | "rent" | "hire" | "branch";
  sortDir?: "asc" | "desc";
  limit?: number;
  offset?: number;
}

export interface ExpertProfileSyncStage {
  registryRows: number;
  registryError: string | null;
  deepAttempted: number;
  deepEnriched: number;
  deepFailed: number;
  deepRemaining: number;
  counts: { sale: number; rent: number; attributedTx: number; contracts: number } | null;
  countsError: string | null;
  durationMs: number;
}

// ─────────────────────────── ۱) رجیستری PM ───────────────────────────

/** ردیف خام رجیستری — عین ساختار کشف‌شدهٔ زنده (شاهد pm-exploration.json) */
interface PmRegistryRow {
  _id: string;
  code?: number | string;
  fullName?: string;
  mobileNumber?: number | string;
  role?: { title?: string } | null;
  voipInfo?: Array<{ extentionNumber?: string | number }> | null;
  activationStatus?: Record<string, boolean> | null;
  businessId?: { title?: string } | null;
  isRegisteredCompleted?: boolean;
  [k: string]: unknown;
}

/** استخراج رجیستری (همهٔ صفحات) — پایهٔ هر به‌روزرسانی فهرست */
export async function syncExpertRegistry(pmToken: string): Promise<{ rows: number; error: string | null }> {
  const cfg = getMelkApiConfig();
  const all: PmRegistryRow[] = [];
  let page = 1;
  let totalPages = 1;
  try {
    while (page <= Math.min(totalPages, 25)) {
      const res = await armCall<unknown>({
        path: MELK_ENDPOINTS.pm.realtorsList,
        baseUrl: cfg.pmApiBase,
        token: pmToken,
        timeoutMs: 60_000,
        maxRetries: 1,
        query: { page, limit: 30 },
      });
      const d = res.data as Record<string, unknown>;
      const list = Array.isArray(d.list) ? (d.list as PmRegistryRow[]) : [];
      all.push(...list.filter((r) => r && typeof r === "object" && r._id));
      totalPages = Number(d.totalPages ?? 1) || 1;
      page += 1;
    }
  } catch (e) {
    return { rows: all.length, error: String((e as Error)?.message ?? e).slice(0, 160) };
  }

  for (const row of all) {
    const voip = Array.isArray(row.voipInfo) && row.voipInfo[0]?.extentionNumber != null ? String(row.voipInfo[0].extentionNumber) : null;
    const patch = {
      personnelCode: row.code !== undefined && row.code !== null ? String(row.code) : null,
      fullName: row.fullName ? String(row.fullName) : null,
      mobile: row.mobileNumber !== undefined && row.mobileNumber !== null ? String(row.mobileNumber) : null,
      roleTitle: row.role?.title ?? null,
      voipExtension: voip,
      activationJson: row.activationStatus ? JSON.stringify(row.activationStatus) : null,
      businessTitle: row.businessId?.title ?? null,
      active: row.isRegisteredCompleted !== false,
      rawRegistryJson: JSON.stringify(row),
      syncedAt: new Date(),
    };
    await db.expertProfile
      .upsert({
        where: { id: String(row._id) },
        create: { id: String(row._id), ...patch },
        update: patch,
      })
      .catch(() => undefined); // ردیف منفرد کل اجرا را نمی‌شکند
  }
  return { rows: all.length, error: null };
}

// ─────────────────────── ۲) عمق PM (personnelInfo + contactInfo) ───────────────────────

interface PmPersonnelInfo {
  employeementInfo?: { date?: string; type?: number } | null;
  branchId?: { _id?: string; title?: string } | null;
  headRealtor?: { fullName?: string } | null;
  role?: { title?: string } | null;
  [k: string]: unknown;
}

interface PmContactInfo {
  contactInfo?: {
    address?: string;
    telephoneNumber?: string;
    postalCode?: string;
  } | null;
  city?: { name?: string } | null;
  state?: { name?: string } | null;
  voipInfo?: Array<{ extentionNumber?: string | number }> | null;
  [k: string]: unknown;
}

/** صف عمق: پروفایل‌هایی که هنوز اطلاعات کامل استخدام/شعبه/آدرس ندارند */
const DEEP_PENDING = { OR: [{ hireDate: null }, { branchTitle: null }, { address: null }] };

/** برش عمق — هر ردیف دو فراخوانی (personnelInfo + contactInfo) */
export async function syncExpertDeepInfo(
  pmToken: string,
  opts: { maxRows?: number } = {}
): Promise<{ attempted: number; enriched: number; failed: number; remaining: number; error: string | null }> {
  const cfg = getMelkApiConfig();
  const maxRows = Math.min(Math.max(opts.maxRows ?? 20, 1), 100);
  const out = { attempted: 0, enriched: 0, failed: 0, remaining: 0, error: null as string | null };
  const pending = await db.expertProfile.findMany({
    where: DEEP_PENDING,
    select: { id: true },
    orderBy: { updatedAt: "asc" },
    take: maxRows,
  });
  out.remaining = await db.expertProfile.count({ where: DEEP_PENDING });

  for (const p of pending) {
    out.attempted += 1;
    try {
      const [pi, ci] = await Promise.all([
        armCall<unknown>({ path: MELK_ENDPOINTS.pm.realtorPersonnelInfo(p.id), baseUrl: cfg.pmApiBase, token: pmToken, timeoutMs: 45_000, maxRetries: 0 }),
        armCall<unknown>({ path: MELK_ENDPOINTS.pm.realtorContactInfo(p.id), baseUrl: cfg.pmApiBase, token: pmToken, timeoutMs: 45_000, maxRetries: 0 }),
      ]);
      const pd = (pi.data ?? {}) as PmPersonnelInfo;
      const cd = (ci.data ?? {}) as PmContactInfo;
      const patch: Record<string, string | number | null> = {};
      if (pd.employeementInfo?.date) patch.hireDate = String(pd.employeementInfo.date);
      if (typeof pd.employeementInfo?.type === "number") patch.employmentType = pd.employeementInfo.type;
      if (pd.branchId?.title) patch.branchTitle = pd.branchId.title;
      if (pd.branchId?._id) patch.branchCode = pd.branchId._id;
      if (pd.headRealtor?.fullName) patch.headManager = pd.headRealtor.fullName;
      if (pd.role?.title) patch.roleTitle = pd.role.title;
      const cc = cd.contactInfo ?? {};
      if (cc.address) patch.address = cc.address;
      if (cc.telephoneNumber) patch.telephone = cc.telephoneNumber;
      if (cc.postalCode) patch.postalCode = cc.postalCode;
      if (cd.city?.name) patch.city = cd.city.name;
      if (cd.state?.name) patch.state = cd.state.name;
      if (Array.isArray(cd.voipInfo) && cd.voipInfo[0]?.extentionNumber != null) patch.voipExtension = String(cd.voipInfo[0].extentionNumber);
      if (Object.keys(patch).length > 0) {
        patch.rawPersonnelJson = JSON.stringify(pd);
        patch.rawContactJson = JSON.stringify(cd);
        await db.expertProfile.update({ where: { id: p.id }, data: patch });
        out.enriched += 1;
      } else {
        // منبع مقدار نداشت — علامت صادقانه برای عدم پرسش مکرر
        await db.expertProfile
          .update({ where: { id: p.id }, data: { hireDate: "نامشخص در سامانه PM", branchTitle: "نامشخص در سامانه PM", address: "نامشخص در سامانه PM" } })
          .catch(() => undefined);
      }
    } catch {
      out.failed += 1; // خطای نرم — برش بعدی دوباره تلاش می‌کند
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  out.remaining = await db.expertProfile.count({ where: DEEP_PENDING });
  return out;
}

// ─────────────────────── ۳) شمارش مبایعه‌نامه + اجاره‌نامه ───────────────────────

/** نرمال‌سازی نام برای تطبیق (فرو ریختن فاصله‌ها) */
function normName(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

interface ContractShareJson {
  name?: string;
}

/**
 * محاسبهٔ شمارش هر کارشناس از دادهٔ ARM محلی:
 *   · قراردادها (ContractRecord): نوع «مبایعه‌نامه/پیش‌فروش» → مبایعه · «اجاره‌نامه/تمدید اجاره» → اجاره
 *     (انتساب از realtorList — سهم مشاوران هر قرارداد)
 *   · گزارش تطابق (TransactionRecord): تفکیک اجاره‌ای از isRental آگهی مرتبط؛
 *     انتساب از کارشناس درخواست (actorName)
 *   · ادغام: max دو منبع مستقل (نه جمع — خطر دوسان‌شمارش)
 */
export async function recomputeExpertCounts(): Promise<{
  sale: number;
  rent: number;
  attributedTx: number;
  contracts: number;
}> {
  // --- الف) قراردادها ---
  const contracts = await db.contractRecord.findMany({ select: { contractType: true, realtorListJson: true } });
  const contractSale = new Map<string, number>();
  const contractRent = new Map<string, number>();
  for (const c of contracts) {
    let shares: ContractShareJson[] = [];
    try {
      shares = JSON.parse(c.realtorListJson ?? "[]") as ContractShareJson[];
    } catch {
      shares = [];
    }
    const isRent = (c.contractType ?? "").includes("اجاره");
    for (const s of shares) {
      const name = normName(s.name);
      if (!name) continue;
      const target = isRent ? contractRent : contractSale;
      target.set(name, (target.get(name) ?? 0) + 1);
    }
  }

  // --- ب) گزارش تطابق معاملات (با تفکیک اجاره‌ای از آگهی) ---
  const txs = await db.transactionRecord.findMany({ select: { requestCode: true, propertyCode: true } });
  const reqCodes = [...new Set(txs.map((t) => t.requestCode).filter((c): c is string => Boolean(c)))];
  const propCodes = [...new Set(txs.map((t) => t.propertyCode).filter(Boolean))];
  const [reqActors, propOwners] = await Promise.all([
    db.requestRecord.findMany({ where: { requestCode: { in: reqCodes } }, select: { requestCode: true, actorName: true } }),
    db.propertyRecord.findMany({ where: { propertyCode: { in: propCodes } }, select: { propertyCode: true, ownerName: true, isRental: true } }),
  ]);
  const actorByReq = new Map(reqActors.map((r) => [r.requestCode as string, normName(r.actorName)]));
  const rentalByProp = new Map(propOwners.map((p) => [p.propertyCode as string, p.isRental === true]));

  const txSale = new Map<string, number>();
  const txRent = new Map<string, number>();
  let attributed = 0;
  for (const t of txs) {
    const actor = t.requestCode ? actorByReq.get(t.requestCode) : "";
    if (!actor) continue; // انتساب فقط از کارشناسِ درخواست — تک‌منبع و شفاف
    attributed += 1;
    const isRent = t.propertyCode ? rentalByProp.get(t.propertyCode) === true : false;
    const target = isRent ? txRent : txSale;
    target.set(actor, (target.get(actor) ?? 0) + 1);
  }

  // --- ج) ادغام در پروفایل‌ها (max دو منبع — نه جمع) ---
  const profiles = await db.expertProfile.findMany({ select: { id: true, fullName: true, saleCount: true, rentCount: true } });
  let saleTotal = 0;
  let rentTotal = 0;
  for (const p of profiles) {
    const name = normName(p.fullName);
    const sale = Math.max(txSale.get(name) ?? 0, contractSale.get(name) ?? 0);
    const rent = Math.max(txRent.get(name) ?? 0, contractRent.get(name) ?? 0);
    if (sale !== p.saleCount || rent !== p.rentCount) {
      await db.expertProfile.update({ where: { id: p.id }, data: { saleCount: sale, rentCount: rent } }).catch(() => undefined);
    }
    saleTotal += sale;
    rentTotal += rent;
  }
  return { sale: saleTotal, rent: rentTotal, attributedTx: attributed, contracts: contracts.length };
}

// ─────────────────────── ۴) به‌روزرسانی کامل فهرست ───────────────────────

/** بروزرسانی فهرست — زنجیرهٔ سه‌مرحله‌ای با گزارش صادقانهٔ هر مرحله */
export async function syncExpertProfiles(
  pmToken: string | null,
  opts: { deepRows?: number } = {}
): Promise<ExpertProfileSyncStage> {
  const t0 = Date.now();
  const out: ExpertProfileSyncStage = {
    registryRows: 0,
    registryError: null,
    deepAttempted: 0,
    deepEnriched: 0,
    deepFailed: 0,
    deepRemaining: 0,
    counts: null,
    countsError: null,
    durationMs: 0,
  };
  if (!pmToken) {
    out.registryError = "توکن PM در دسترس نیست — اتصال حساب شخصی سامانهٔ پرسنلی در تنظیمات عمومی برقرار نیست.";
    out.countsError = "شمارش‌ها اجرا نشد (قطع زنجیرهٔ به‌روزرسانی).";
    out.durationMs = Date.now() - t0;
    return out;
  }
  const reg = await syncExpertRegistry(pmToken);
  out.registryRows = reg.rows;
  out.registryError = reg.error;
  const deep = await syncExpertDeepInfo(pmToken, { maxRows: opts.deepRows ?? 20 });
  out.deepAttempted = deep.attempted;
  out.deepEnriched = deep.enriched;
  out.deepFailed = deep.failed;
  out.deepRemaining = deep.remaining;
  try {
    out.counts = await recomputeExpertCounts();
  } catch (e) {
    out.countsError = String((e as Error)?.message ?? e).slice(0, 160);
  }
  out.durationMs = Date.now() - t0;
  return out;
}

// ─────────────────────── ۵) پرس‌وجوی فهرست (تمام ستون‌ها) ───────────────────────

function isoDay(v: string | null): number | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? t : null;
}

function toRow(p: {
  id: string;
  personnelCode: string | null;
  fullName: string | null;
  mobile: string | null;
  roleTitle: string | null;
  branchTitle: string | null;
  hireDate: string | null;
  employmentType: number | null;
  headManager: string | null;
  address: string | null;
  telephone: string | null;
  postalCode: string | null;
  voipExtension: string | null;
  city: string | null;
  state: string | null;
  businessTitle: string | null;
  active: boolean;
  saleCount: number;
  rentCount: number;
  syncedAt: Date;
}): ExpertProfileRow {
  return {
    id: p.id,
    personnelCode: p.personnelCode,
    fullName: p.fullName,
    mobile: p.mobile,
    roleTitle: p.roleTitle,
    branchTitle: p.branchTitle,
    hireDate: p.hireDate,
    employmentType: p.employmentType,
    employmentTypeFa: p.employmentType !== null ? EMPLOYMENT_TYPE_FA[p.employmentType] ?? null : null,
    headManager: p.headManager,
    address: p.address,
    telephone: p.telephone,
    postalCode: p.postalCode,
    voipExtension: p.voipExtension,
    city: p.city,
    state: p.state,
    businessTitle: p.businessTitle,
    active: p.active,
    saleCount: p.saleCount,
    rentCount: p.rentCount,
    syncedAt: p.syncedAt.toISOString(),
  };
}

/** لیست با فیلتر تمام ستون‌ها + مرتب‌سازی — خروجی ردیف‌های UI-ready */
export async function listExpertProfiles(filter: ExpertProfileFilter): Promise<{ rows: ExpertProfileRow[]; total: number }> {
  const where: Record<string, unknown> = {};
  if (filter.fullName) where.fullName = { contains: filter.fullName };
  if (filter.mobile) where.mobile = { contains: filter.mobile };
  if (filter.personnelCode) where.personnelCode = { contains: filter.personnelCode };
  // PN-011 ثالثاً — چندانتخابی چیپی: OR درون هر گروه؛ حالت تک‌مقداری قبلی محفوظ
  if (filter.branchTitles && filter.branchTitles.length > 0) where.branchTitle = { in: filter.branchTitles };
  else if (filter.branchTitle) where.branchTitle = filter.branchTitle;
  if (filter.roleTitles && filter.roleTitles.length > 0) where.roleTitle = { in: filter.roleTitles };
  else if (filter.roleTitle) where.roleTitle = { contains: filter.roleTitle };
  if (filter.employmentTypes && filter.employmentTypes.length > 0) where.employmentType = { in: filter.employmentTypes };
  else if (filter.employmentType !== undefined) where.employmentType = filter.employmentType;
  if (filter.headManagers && filter.headManagers.length > 0) where.headManager = { in: filter.headManagers };
  else if (filter.headManager) where.headManager = { contains: filter.headManager };
  if (filter.cities && filter.cities.length > 0) where.city = { in: filter.cities };
  else if (filter.city) where.city = { contains: filter.city };
  // PN-027 · ۵-الف-۱ — رفع باگ D6-1: Prisma برای Boolean فیلتر «in» ندارد (۵۰۰).
  // چندانتخابی چیپی: تک‌مقدار → equals؛ هر دو مقدار = همه (بدون فیلتر).
  if (filter.actives && filter.actives.length > 0) {
    const hasTrue = filter.actives.includes(true);
    const hasFalse = filter.actives.includes(false);
    if (hasTrue && !hasFalse) where.active = { equals: true };
    else if (hasFalse && !hasTrue) where.active = { equals: false };
  } else if (filter.active !== undefined) where.active = filter.active;
  if (filter.address) where.address = { contains: filter.address };
  if (filter.telephone) where.telephone = { contains: filter.telephone };
  if (filter.postalCode) where.postalCode = { contains: filter.postalCode };
  if (filter.voipExtension) where.voipExtension = { contains: filter.voipExtension };
  if (filter.saleFrom !== undefined || filter.saleTo !== undefined) {
    where.saleCount = { ...(filter.saleFrom !== undefined ? { gte: filter.saleFrom } : {}), ...(filter.saleTo !== undefined ? { lte: filter.saleTo } : {}) };
  }
  if (filter.rentFrom !== undefined || filter.rentTo !== undefined) {
    where.rentCount = { ...(filter.rentFrom !== undefined ? { gte: filter.rentFrom } : {}), ...(filter.rentTo !== undefined ? { lte: filter.rentTo } : {}) };
  }
  if (filter.q) {
    const q = filter.q;
    where.OR = [
      { fullName: { contains: q } },
      { mobile: { contains: q } },
      { personnelCode: { contains: q } },
      { address: { contains: q } },
      { branchTitle: { contains: q } },
      { roleTitle: { contains: q } },
      { headManager: { contains: q } },
      { telephone: { contains: q } },
      { postalCode: { contains: q } },
      { voipExtension: { contains: q } },
    ];
  }

  const orderBy: Record<string, string> =
    filter.sort === "sale" ? { saleCount: filter.sortDir ?? "desc" }
    : filter.sort === "rent" ? { rentCount: filter.sortDir ?? "desc" }
    : filter.sort === "hire" ? { hireDate: filter.sortDir ?? "asc" }
    : filter.sort === "branch" ? { branchTitle: filter.sortDir ?? "asc" }
    : { fullName: filter.sortDir === "desc" ? "desc" : "asc" };

  const limit = Math.min(Math.max(filter.limit ?? 500, 1), 5000);
  const offset = Math.max(filter.offset ?? 0, 0);
  const [all, total] = await Promise.all([
    db.expertProfile.findMany({ where, orderBy, take: limit, skip: offset }),
    db.expertProfile.count({ where }),
  ]);

  // بازهٔ استخدام (ISO-پارس در حافظه — شفاف و دقیق)
  let rows = all.map(toRow);
  if (filter.hireFrom) {
    const from = isoDay(filter.hireFrom);
    if (from !== null) rows = rows.filter((r) => (isoDay(r.hireDate) ?? -Infinity) >= from);
  }
  if (filter.hireTo) {
    const to = isoDay(filter.hireTo);
    if (to !== null) rows = rows.filter((r) => (isoDay(r.hireDate) ?? Infinity) <= to);
  }
  return { rows, total };
}

/** گزینه‌های فیلتر از دادهٔ زندهٔ ستون‌ها (بروزرسانی فیلتر بر اساس تمام ستون‌ها) */
export async function expertFilterOptions(): Promise<{
  branches: string[];
  employmentTypes: Array<{ value: number; label: string }>;
  managers: string[];
  roles: string[];
  cities: string[];
}> {
  const [branches, managers, roles, cities, empTypes] = await Promise.all([
    db.expertProfile.findMany({ where: { branchTitle: { not: null } }, select: { branchTitle: true }, distinct: ["branchTitle"] }),
    db.expertProfile.findMany({ where: { headManager: { not: null } }, select: { headManager: true }, distinct: ["headManager"] }),
    db.expertProfile.findMany({ where: { roleTitle: { not: null } }, select: { roleTitle: true }, distinct: ["roleTitle"] }),
    db.expertProfile.findMany({ where: { city: { not: null } }, select: { city: true }, distinct: ["city"] }),
    db.expertProfile.findMany({ where: { employmentType: { not: null } }, select: { employmentType: true }, distinct: ["employmentType"] }),
  ]);
  return {
    branches: branches.map((b) => b.branchTitle as string).sort((a, b) => a.localeCompare(b, "fa")),
    employmentTypes: empTypes
      .map((e) => ({ value: e.employmentType as number, label: EMPLOYMENT_TYPE_FA[e.employmentType as number] ?? String(e.employmentType) }))
      .sort((a, b) => a.value - b.value),
    managers: managers.map((m) => m.headManager as string).sort((a, b) => a.localeCompare(b, "fa")),
    roles: roles.map((r) => r.roleTitle as string).sort((a, b) => a.localeCompare(b, "fa")),
    cities: cities.map((c) => c.city as string).sort((a, b) => a.localeCompare(b, "fa")),
  };
}

/** نام پرسنل PM با کد پرسنلی — برای فیلتر «کد پرسنلی» فهرست معاملات (جایگزین findPmNameByCode قدیمی) */
export async function findExpertNameByPersonnelCode(code: string): Promise<string | null> {
  const row = await db.expertProfile.findFirst({ where: { personnelCode: code }, select: { fullName: true } });
  return row?.fullName ?? null;
}
