#!/usr/bin/env bun
/**
 * p6515-trend-validation.ts — BLOCK A.2 (ملکا-شورا-۱۴۰۵-۰۱۸)
 * اعتبارسنجی سه‌سری روند با دادهٔ واقعی:
 *   ۱) از دیتابیس، ۴ نوع جداگانه شمارش می‌شود (در بازهٔ فروردین ۱۴۰۴ → ماه جاری)
 *   ۲) از API (عین مسیر UI)، سه سری گرفته می‌شود
 *   ۳) اثبات: series1 = مبایعه + پیش‌فروش (دقیقاً)
 *   ۴) اثبات: series2 = اجاره + تمدید (دقیقاً)
 *   ۵) اثبات: series3 = series1 + series2 + none (در هر ماه)
 * خروجی: trend-validation.json
 */
import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "node:fs";

const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL ?? "file:/home/z/my-project/db/custom.db" } } });

const BASE = "http://localhost:3000";

async function main() {
  // --- ۱) شمارش مستقیم DB (۴ نوع + null) در بازه ---
  const txs = await db.transactionRecord.findMany({ select: { id: true, contractDate: true } });
  const enrich = await db.transactionEnrichment.findMany({ select: { txId: true, contractType: true } });
  const typeByTx = new Map(enrich.map((e) => [e.txId, e.contractType]));

  const { classifyContract } = await import("../src/lib/contract-classify");
  const { dateToJalali } = await import("../src/lib/jalali");
  const { txTypeMonthlySeries } = await import("../src/core/agent/analyzers");

  const now = new Date();
  const jNow = dateToJalali(now);
  const currentKey = `${jNow.jy}-${String(jNow.jm).padStart(2, "0")}`;
  const range = { fromKey: "1404-01", toKey: currentKey };

  const inRange = (d: Date | string) => {
    const j = dateToJalali(new Date(d));
    const key = `${j.jy}-${String(j.jm).padStart(2, "0")}`;
    return key >= range.fromKey && key <= range.toKey;
  };

  // شمارش نوع‌ها از DB (فقط داخل بازه) — عین منطق سری
  const dbCounts = { "مبایعه‌نامه": 0, "پیش‌فروش": 0, "اجاره": 0, "تمدید اجاره": 0, "ثبت‌نشده": 0 };
  let outOfRange = 0;
  const dbMonthly = new Map<string, { sale1: number; rent2: number; none: number }>();
  for (const t of txs) {
    if (!inRange(t.contractDate)) { outOfRange += 1; continue; }
    const { kind, family } = classifyContract(typeByTx.get(t.id) ?? null);
    dbCounts[kind] += 1;
    const j = dateToJalali(new Date(t.contractDate));
    const key = `${j.jy}-${String(j.jm).padStart(2, "0")}`;
    const m = dbMonthly.get(key) ?? { sale1: 0, rent2: 0, none: 0 };
    if (family === "sale") m.sale1 += 1;
    else if (family === "rent") m.rent2 += 1;
    else m.none += 1;
    dbMonthly.set(key, m);
  }

  // --- ۲) سه سری از API (عین UI: rows → txTypeMonthlySeries) ---
  const loginRes = await fetch(`${BASE}/api/auth/master-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ masterCode: process.env.MASTER_ACCESS_CODE ?? "00000000" }),
  }).then((r) => r.json() as Promise<{ token: string }>);
  const apiRes = await fetch(`${BASE}/api/crm/transactions?limit=5000&offset=0&sortBy=contractDate&sortDir=desc`, {
    headers: { Authorization: `Bearer ${loginRes.token}` },
  }).then((r) => r.json() as Promise<{ rows: { id: string; contractDate: string; contractType: string | null }[]; total: number }>);

  const series = txTypeMonthlySeries(
    apiRes.rows.map((r) => ({ contractDate: r.contractDate, contractType: r.contractType, propertyTitle: null })),
    range
  );
  const s1 = series.reduce((s, p) => s + p.sale, 0);
  const s2 = series.reduce((s, p) => s + p.rent, 0);
  const s3 = series.reduce((s, p) => s + p.total, 0);
  const sNone = series.reduce((s, p) => s + p.none, 0);

  // --- ۳/۴/۵) اثبات‌ها ---
  const checks = {
    series1_equals_saleFamily: { expected: dbCounts["مبایعه‌نامه"] + dbCounts["پیش‌فروش"], actual: s1, pass: false },
    series2_equals_rentFamily: { expected: dbCounts["اجاره"] + dbCounts["تمدید اجاره"], actual: s2, pass: false },
    series3_equals_s1_s2_none: { expected: s1 + s2 + sNone, actual: s3, pass: false },
    series3_equals_totalInRange: { expected: txs.length - outOfRange, actual: s3, pass: false },
    perMonthMath: { monthsChecked: series.length, allTotalEqSaleRentNone: true, allS3_ge_S1S2: true },
    apiRowsMatchDb: { expected: txs.length, actual: apiRes.total, pass: false },
  };
  checks.series1_equals_saleFamily.pass = checks.series1_equals_saleFamily.expected === s1;
  checks.series2_equals_rentFamily.pass = checks.series2_equals_rentFamily.expected === s2;
  checks.series3_equals_s1_s2_none.pass = checks.series3_equals_s1_s2_none.expected === s3;
  checks.series3_equals_totalInRange.pass = checks.series3_equals_totalInRange.expected === s3;
  checks.apiRowsMatchDb.pass = checks.apiRowsMatchDb.expected === apiRes.total;
  for (const p of series) {
    if (p.total !== p.sale + p.rent + p.none) checks.perMonthMath.allTotalEqSaleRentNone = false;
    if (!(p.total >= p.sale + p.rent)) checks.perMonthMath.allS3_ge_S1S2 = false;
  }

  // مطابقت ماه‌به‌ماه DB با سری
  let monthlyMatch = true;
  for (const p of series) {
    const m = dbMonthly.get(p.key);
    if (!m) { if (p.total !== 0) monthlyMatch = false; continue; }
    if (m.sale1 !== p.sale || m.rent2 !== p.rent || m.none !== p.none) monthlyMatch = false;
  }

  const out = {
    kind: "trend-validation — ملکا-شورا-۱۴۰۵-۰۱۸ BLOCK A.2",
    generatedAt: new Date().toISOString(),
    range: { from: "1404-01 (فروردین ۱۴۰۴)", to: currentKey },
    dbTypeCounts_inRange: dbCounts,
    outOfRangeRecords: outOfRange,
    seriesTotals: { series1_sale: s1, series2_rent: s2, none: sNone, series3_total: s3 },
    checks,
    monthlyMatchDbVsSeries: monthlyMatch,
    allPassed:
      checks.series1_equals_saleFamily.pass &&
      checks.series2_equals_rentFamily.pass &&
      checks.series3_equals_s1_s2_none.pass &&
      checks.series3_equals_totalInRange.pass &&
      checks.apiRowsMatchDb.pass &&
      checks.perMonthMath.allTotalEqSaleRentNone &&
      checks.perMonthMath.allS3_ge_S1S2 &&
      monthlyMatch,
  };
  writeFileSync("/home/z/my-project/trend-validation.json", JSON.stringify(out, null, 2), "utf8");
  console.log(JSON.stringify(out, null, 2));
  if (!out.allPassed) process.exit(1);
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); }).finally(() => db.$disconnect());
