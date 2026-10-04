#!/usr/bin/env bun
/**
 * p6512-verify-live.ts — راستی‌آزمایی زندهٔ دستور «درستی درج اطلاعات هر ستون» (نکتهٔ بسیار مهم)
 * ------------------------------------------------------------------------------------
 * ورود با کد مدیر → ۱۰ مسیر/ستون راستی‌آزمایی می‌شود:
 *   کاشی معاملات: درخواست (تغییر نام) · کد ملک تو در تو · نوع قرارداد · هولوگرام ·
 *                 مبلغ (جداکنندهٔ «،») · فایل قرارداد (سند تولیدی) · حق‌السهم با درصد
 *   کاشی کارشناسان: کد پرسنلی (PM) · موبایل (ARM) · مبایعه/اجاره · بینش ۲۰ نفر برتر
 */
import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
const BASE = process.env.VERIFY_BASE ?? "http://localhost:3000";
const MASTER_CODE = process.env.MASTER_ACCESS_CODE ?? "00000000";

interface Res<T> {
  status: number;
  body: T | null;
}

async function call<T>(path: string, init?: RequestInit): Promise<Res<T>> {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  let body: T | null = null;
  try { body = (await res.json()) as T; } catch { /* خالی */ }
  return { status: res.status, body };
}

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ""}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`); }
}

async function main() {
  // ---- ورود مدیر ----
  console.log("=== ورود مدیر ===");
  const login = await call<{ token?: string; error?: string }>("/api/auth/master-login", { method: "POST", body: JSON.stringify({ masterCode: MASTER_CODE }) });
  if (login.status !== 200 || !login.body?.token) {
    console.log("LOGIN FAILED", login.status, JSON.stringify(login.body).slice(0, 200));
    process.exit(1);
  }
  const token = login.body.token;
  const H = { Authorization: `Bearer ${token}` };
  console.log("  ورود موفق ✓");

  // ---- ۱) کاشی معاملات ----
  console.log("\n=== ۱) کاشی معاملات — ستون‌ها ===");
  const tx = await call<{ rows: Array<Record<string, unknown>>; total: number; summary: Record<string, number> }>(`/api/crm/transactions?limit=5000&sortBy=contractDate&sortDir=desc`, { headers: H });
  check("GET /api/crm/transactions → 200", tx.status === 200);
  const rows = tx.body?.rows ?? [];
  check("فهرست معاملات پر است", rows.length > 500, `${rows.length} ردیف`);
  if (rows.length > 0) {
    // بند الف — ستون درخواست (تغییر نام در UI؛ داده = requestCode + requester تو در تو)
    const withReq = rows.filter((r) => r.requestCode).length;
    check("ستون «درخواست»: کد درخواست پر است", withReq > rows.length * 0.9, `${withReq}/${rows.length}`);
    const reqNested = rows.filter((r) => r.requestCode && (r.requesterName || r.requesterMobile)).length;
    check("ستون «درخواست»: نام/موبایل درخواست‌دهنده تو در تو", reqNested > 0, `${reqNested} ردیف`);
    // کد ملک تو در تو
    const propNested = rows.filter((r) => r.ownerName || r.ownerMobile).length;
    check("کد ملک: نام/موبایل مالک تو در تو", propNested > 0, `${propNested} ردیف`);
    // نوع قرارداد + مبلغ (از قرارداد تطبیقی)
    const withType = rows.filter((r) => r.contractType).length;
    const withAmount = rows.filter((r) => typeof r.contractAmount === "number" && r.contractAmount > 0).length;
    check("نوع قرارداد از صورت‌وضعیت", withType > 0, `${withType} ردیف (دامنهٔ دسترسی فعلی)`);
    check("مبلغ قرارداد از صورت‌وضعیت", withAmount > 0, `${withAmount} ردیف (دامنهٔ دسترسی فعلی)`);
    // هولوگرام
    const withHolo = rows.filter((r) => r.contractHolo).length;
    check("شماره هولوگرام", withHolo === rows.length, `${withHolo}/${rows.length}`);
    // حق‌السهم با درصد هر مشاور
    const withShares = rows.filter((r) => r.consultantsShareSummary && Array.isArray((r.consultantsShareSummary as Record<string, unknown>).shares) && ((r.consultantsShareSummary as Record<string, unknown[]>).shares as unknown[]).length > 0);
    check("تجمیع حق‌السهم با درصد هر مشاور", withShares.length > 0, `${withShares.length} ردیف — نمونه: ${(() => { const s = (withShares[0]?.consultantsShareSummary as { shares?: { name: string; unitPercent: number }[] })?.shares?.[0]; return s ? `${s.name} (${s.unitPercent}٪)` : "—"; })()}`);
    // فایل قرارداد — هر ردیف قابل تولید سند است (داده‌های لازم موجود)
    check("فایل قرارداد: داده سند برای همهٔ ردیف‌ها", rows.every((r) => Boolean(r.propertyCode)), `${rows.length}/${rows.length} دارای کد ملک`);
    // کارگزاری مرتبط
    const withAgency = rows.filter((r) => r.agency).length;
    console.log(`  ℹ️ کارگزاری مرتبط: ${withAgency} ردیف (از ۷۷ کارگزاری ثبت‌شده)`);
  }

  // فیلتر نوع قرارداد
  const txF = await call<{ rows: Array<Record<string, unknown>>; total: number }>(`/api/crm/transactions?contractType=${encodeURIComponent("مبایعه نامه")}&limit=5000`, { headers: H });
  check("فیلتر نوع قرارداد (مبایعه نامه)", txF.status === 200 && (txF.body?.rows ?? []).every((r) => r.contractType === "مبایعه نامه"), `${txF.body?.rows?.length ?? 0} ردیف`);
  // فیلتر نام کارشناس
  const txE = await call<{ rows: Array<Record<string, unknown>> }>(`/api/crm/transactions?expertName=${encodeURIComponent("سیدی")}&limit=5000`, { headers: H });
  check("فیلتر نام کارشناس", txE.status === 200, `${txE.body?.rows?.length ?? 0} ردیف`);
  // فیلتر کد پرسنلی
  const txP = await call<{ rows: Array<Record<string, unknown>> }>(`/api/crm/transactions?personnelCode=410031320&limit=5000`, { headers: H });
  check("فیلتر کد پرسنلی", txP.status === 200, `${txP.body?.rows?.length ?? 0} ردیف`);

  // ---- ۲) کاشی کارشناسان ----
  console.log("\n=== ۲) کاشی کارشناسان — ستون‌ها ===");
  const ex = await call<{
    rows: Array<{ id: string; personnelCode: string; fullName: string; mobile: string; pmCode: string | null; saleCount: number; rentCount: number; accContractCount: number | null }>;
    total: number;
    topExperts: { topSale: unknown[]; topRent: unknown[]; accTop: unknown[]; coverage: { salesTotal: number; salesAttributed: number } } | null;
  }>(`/api/crm/experts?limit=5000`, { headers: H });
  check("GET /api/crm/experts → 200", ex.status === 200);
  const exRows = ex.body?.rows ?? [];
  check("فهرست کارشناسان پر است", exRows.length > 200, `${exRows.length} ردیف`);
  // بند الف — کدپرسنلی از PM
  const withPmCode = exRows.filter((r) => r.pmCode).length;
  check("کد پرسنلی (سامانهٔ PM)", withPmCode > 100, `${withPmCode}/${exRows.length} — نمونه: ${exRows.find((r) => r.pmCode)?.fullName} = ${exRows.find((r) => r.pmCode)?.pmCode}`);
  // بند ب — موبایل
  const withMobile = exRows.filter((r) => r.mobile && r.mobile !== "—").length;
  check("موبایل (رفع باگ mobileNumber)", withMobile === exRows.length, `${withMobile}/${exRows.length}`);
  // بند ت — شمارش معاملات
  const withSales = exRows.filter((r) => r.saleCount > 0).length;
  check("تعداد معامله مبایعه‌نامه", withSales > 0, `${withSales} کارشناس دارای معامله — برترین: ${[...exRows].sort((a, b) => b.saleCount - a.saleCount)[0]?.fullName} (${[...exRows].sort((a, b) => b.saleCount - a.saleCount)[0]?.saleCount})`);
  // بند پ — بینش ۲۰ نفر برتر
  const top = ex.body?.topExperts;
  check("بینش فعال‌ترین کارشناسان (topExperts)", Boolean(top), top ? `مبایعه: ${top.topSale.length} نفر · اجاره: ${top.topRent.length} نفر · شاهد مالی: ${top.accTop.length} نفر` : "—");
  check("پوشش انتساب گزارش شفاف است", Boolean(top?.coverage), top ? `${top.coverage.salesAttributed}/${top.coverage.salesTotal}` : "—");

  // ---- ۳) صحت دادهٔ PM در برابر منبع ----
  console.log("\n=== ۳) صحت‌سنجی متقاطع PM↔ARM ===");
  const pmCount = await db.pmPersonnelRecord.count();
  const pmWithCode = await db.pmPersonnelRecord.count({ where: { code: { not: null } } });
  check("رجیستری پرسنل PM", pmCount === 142 && pmWithCode === 142, `${pmCount} پرسنل (${pmWithCode} با کد)`);
  const spCount = await db.specialPropertyRecord.count();
  const spDetailed = await db.specialPropertyRecord.count({ where: { propertyCode: { not: null } } });
  check("رجیستری کارگزاری‌ها", spCount === 77 && spDetailed === 77, `${spCount} رکورد`);
  const ct = await db.contractRecord.findFirst({ where: { contractPrice: { not: null } } });
  check("مبلغ قرارداد در انبار", Boolean(ct?.contractPrice), ct ? `${ct.contractPrice} ریال (${ct.contractType})` : "—");

  console.log(`\n===== نتیجه: ${pass} پاس · ${fail} خطا =====`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error("FATAL:", e); process.exit(1); }).finally(() => db.$disconnect());
