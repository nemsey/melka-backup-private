/**
 * p6549-coverage-audit.ts — حسابرسی «هیچ ستونی بدون اطلاعات نباشد» (دستور P6549 — نکته ۲)
 * -------------------------------------------------------------------------------------------------
 * منبع حقیقت: همان APIهایی که فهرست‌های چهارگانه از آن‌ها می‌خوانند (با نشست مدیر).
 * برای هر ستونِ هر فهرست، درصد رکوردهایی که آن ستون را «پر» دارند از دادهٔ واقعی محاسبه می‌شود.
 * خروجی: download/p6549/columns-coverage.json + گزارش کنسولی + سنجش سرعت همزمان.
 * اجرا: bun scripts/p6549/p6549-coverage-audit.ts [BASE]
 */
export {};
const BASE = process.argv[2] ?? "http://localhost:3000";

type Row = Record<string, any>;
async function j(path: string, opts: RequestInit = {}): Promise<{ status: number; ms: number; body: any }> {
  const t0 = Date.now();
  try {
    const res = await fetch(BASE + path, opts);
    let body: any = null;
    try { body = await res.json(); } catch {}
    return { status: res.status, ms: Date.now() - t0, body };
  } catch (e: any) {
    return { status: 0, ms: Date.now() - t0, body: { error: String(e?.message ?? e) } };
  }
}
const rowsOf = (b: any): Row[] => {
  if (!b || typeof b !== "object") return [];
  if (Array.isArray(b)) return b;
  for (const k of ["rows", "items", "records", "data"]) {
    const v = b[k];
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object" && Array.isArray(v.rows)) return v.rows;
  }
  return [];
};
const filled = (v: any): boolean =>
  v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && v.length === 0);

/** نگاشت ستون (عین سرستون فهرست) → فیلدهای پاسخ API (پر بودن هرکدام کافی است) */
const LISTS: { tile: string; url: string; cols: { col: string; fields: string[] }[] }[] = [
  {
    tile: "M1 آگهی ملک تبریز — ۱۶ ستون",
    url: "/api/crm/arm-catalog/listings?limit=3000",
    cols: [
      { col: "ردیف", fields: ["id"] },
      { col: "کد آگهی", fields: ["propertyCode", "code"] },
      { col: "کارشناس", fields: ["realtorName"] },
      { col: "شعبه", fields: ["branch"] },
      { col: "مالک — نام", fields: ["ownerName"] },
      { col: "مالک — موبایل", fields: ["ownerMobile"] },
      { col: "قیمت", fields: ["price"] },
      { col: "آدرس — منطقه", fields: ["areaName"] },
      { col: "آدرس — نشانی", fields: ["address"] },
      { col: "دسته‌بندی", fields: ["tradeTypeName"] },
      { col: "وضعیت", fields: ["status"] },
      { col: "آخرین فعالیت", fields: ["syncedAt", "updatedAt", "extractedAt"] },
      { col: "متراژ", fields: ["meterage"] },
      { col: "اتاق", fields: ["rooms"] },
      { col: "سال ساخت", fields: ["buildYear"] },
      { col: "نوع ملک", fields: ["propertyTypeName"] },
    ],
  },
  {
    tile: "M2 درخواست ملک تبریز — ۱۳ ستون",
    url: "/api/crm/arm-catalog/requests?limit=3000",
    cols: [
      { col: "ردیف", fields: ["id"] },
      { col: "کد درخواست", fields: ["requestCode", "armRequestId"] },
      { col: "کارشناس", fields: ["actorName"] },
      { col: "شعبه", fields: ["branch"] },
      { col: "متقاضی — نام", fields: ["customerName"] },
      { col: "متقاضی — موبایل", fields: ["customerMobile"] },
      { col: "مناطق", fields: ["areaNames", "areaNamesJson"] },
      { col: "قیمت — از", fields: ["priceFrom"] },
      { col: "قیمت — تا", fields: ["priceTo"] },
      { col: "دسته‌بندی", fields: ["tradeTypeName"] },
      { col: "نوع ملک", fields: ["propertyTypeName"] },
      { col: "نوع ساختمان", fields: ["buildingTypeName"] },
      { col: "وضعیت", fields: ["status"] },
    ],
  },
  {
    tile: "M3 معاملات ملک تبریز — ۱۱ ستون",
    url: "/api/crm/transactions?limit=1000",
    cols: [
      { col: "ردیف", fields: ["id"] },
      { col: "تاریخ معامله", fields: ["contractDate", "jalaliDate"] },
      { col: "کد ملک", fields: ["propertyCode"] },
      { col: "فروشنده", fields: ["sellerName", "propertyCustomer"] },
      { col: "کد درخواست", fields: ["requestCode"] },
      { col: "خریدار", fields: ["buyerName", "requestCustomer"] },
      { col: "قیمت", fields: ["price"] },
      { col: "نوع قرارداد", fields: ["contractType", "contractTypeFa"] },
      { col: "هولوگرام", fields: ["contractHolo"] },
      { col: "کارشناس", fields: ["expertName", "consultantsShareSummary"] },
      { col: "فایل قرارداد", fields: ["hasContract", "contractFile"] },
    ],
  },
  {
    tile: "M4 کارشناسان ملک تبریز — ۱۲ ستون",
    url: "/api/crm/experts?limit=3000",
    cols: [
      { col: "ردیف", fields: ["id"] },
      { col: "کارشناس — نام", fields: ["fullName"] },
      { col: "کارشناس — موبایل", fields: ["mobile"] },
      { col: "تاریخ استخدام", fields: ["hireDate", "employmentDate"] },
      { col: "کد پرسنلی", fields: ["personnelCode"] },
      { col: "شعبه", fields: ["branch"] },
      { col: "نقش پرسنلی", fields: ["pmRole", "roleName"] },
      { col: "مبایعه‌نامه (خانواده)", fields: ["saleFamily", "saleCount"] },
      { col: "اجاره‌نامه (خانواده)", fields: ["rentFamily", "rentCount"] },
      { col: "آدرس", fields: ["address", "branchAddress"] },
      { col: "وضعیت فعال", fields: ["active"] },
      { col: "نقش/عنوان", fields: ["role", "businessTitle"] },
    ],
  },
];

async function main() {
  console.log(`# حسابرسی پوشش ستون‌ها — ${new Date().toISOString()} — BASE=${BASE}`);
  // ورود مدیر (کدمستر — الگوی اثبات‌شدهٔ P6548)
  const login = await j("/api/auth/master-login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ masterCode: "80211186" }),
  });
  if (login.status !== 200 || !login.body?.token) {
    console.error("FAIL: ورود مدیر ناموفق", login.status, JSON.stringify(login.body).slice(0, 200));
    process.exit(1);
  }
  const H: Record<string, string> = { authorization: `Bearer ${login.body.token}` };

  const report: any[] = [];
  const speeds: any[] = [];
  let totalCols = 0, filledCols = 0;
  const emptyCols: string[] = [];
  const keyDiscovery: Record<string, string[]> = {};

  for (const list of LISTS) {
    const res = await j(list.url, { headers: H });
    const rows: Row[] = rowsOf(res.body);
    speeds.push({ tile: list.tile.split(" —")[0], ms: res.ms, rows: rows.length, status: res.status });
    if (res.status !== 200 || rows.length === 0) {
      report.push({ tile: list.tile, error: `status=${res.status} rows=${rows.length}` });
      continue;
    }
    if (!keyDiscovery[list.tile]) keyDiscovery[list.tile] = Object.keys(rows[0]).slice(0, 40);
    const colsReport = list.cols.map(({ col, fields }) => {
      const n = rows.filter((r) => fields.some((f) => filled(r[f]))).length;
      const pct = Math.round((n / rows.length) * 1000) / 10;
      totalCols++;
      if (n > 0) filledCols++;
      else emptyCols.push(`${list.tile} → ${col}`);
      return { col, filled: n, total: rows.length, pct };
    });
    report.push({ tile: list.tile, sampled: rows.length, columns: colsReport });
  }

  const out = {
    meta: {
      title: "حسابرسی پوشش اطلاعات ستون‌های فهرست‌های چهارگانه — هیچ ستونی بدون اطلاعات نباشد (نکته ۲)",
      auditedAt: new Date().toISOString(),
      source: "APIهای زندهٔ همان فهرست‌ها (نشست مدیر)",
      totalColumns: totalCols,
      columnsWithData: filledCols,
      columnsWithoutData: emptyCols,
      apiSpeeds: speeds,
      verdict: emptyCols.length === 0 ? "PASS — همهٔ ستون‌ها دارای داده" : `ATTENTION — ${emptyCols.length} ستون بدون داده: ${emptyCols.join(" | ")}`,
    },
    lists: report,
    keyDiscovery,
  };
  const fs = await import("node:fs");
  fs.mkdirSync("download/p6549", { recursive: true });
  fs.writeFileSync("download/p6549/columns-coverage.json", JSON.stringify(out, null, 2));

  for (const list of report) {
    if (list.error) { console.log(`\n== ${list.tile}: ERROR ${list.error}`); continue; }
    console.log(`\n== ${list.tile} — نمونهٔ ${list.sampled} رکورد ==`);
    for (const c of list.columns) console.log(`  ${c.col.padEnd(24)} ${String(c.pct).padStart(5)}٪  (${c.filled}/${c.total})`);
  }
  console.log(`\nسرعت APIها:`);
  for (const s of speeds) console.log(`  ${s.tile}: ${s.ms}ms (${s.rows} ردیف · ${s.status})`);
  console.log(`\nحکم: ${out.meta.verdict}`);
  process.exit(0);
}
main().catch((e) => { console.error("ERR", e); process.exit(1); });
