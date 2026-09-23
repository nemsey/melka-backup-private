#!/usr/bin/env bun
/**
 * p6515-filter-expected.ts — BLOCK 0.2 (ملکا-شورا-۱۴۰۵-۰۱۸)
 * استخراج مقادیر «انتظاری» از دیتابیس برای ماتریس آزمون فیلترها.
 * خروجی: filter-expected.json — مقادیر واقعی + شمارش انتظاری هر فیلتر
 */
import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "node:fs";

const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL ?? "file:/home/z/my-project/db/custom.db" } } });

async function main() {
  const txs = await db.transactionRecord.findMany({ select: { id: true, propertyCode: true, requestCode: true, contractHolo: true, contractDate: true } });
  const enrich = await db.transactionEnrichment.findMany({ select: { txId: true, contractType: true, realtorSharesJson: true } });

  // یک کد ملک واقعی پرتکرار
  const propCount = new Map<string, number>();
  for (const t of txs) propCount.set(t.propertyCode, (propCount.get(t.propertyCode) ?? 0) + 1);
  const topProp = [...propCount.entries()].sort((a, b) => b[1] - a[1])[0];

  // یک کد درخواست واقعی
  const reqCount = new Map<string, number>();
  for (const t of txs) if (t.requestCode) reqCount.set(t.requestCode, (reqCount.get(t.requestCode) ?? 0) + 1);
  const topReq = [...reqCount.entries()].sort((a, b) => b[1] - a[1])[0];
  const anyReqWithOne = [...reqCount.entries()].find(([, c]) => c === 1);

  // یک هولوگرام واقعی
  const holoCount = new Map<string, number>();
  for (const t of txs) if (t.contractHolo) holoCount.set(t.contractHolo, (holoCount.get(t.contractHolo) ?? 0) + 1);
  const topHolo = [...holoCount.entries()].sort((a, b) => b[1] - a[1])[0];

  // نام کارشناس از سهم‌ها (realtorSharesJson) — پرتکرارترین
  const shareNameCount = new Map<string, number>();
  for (const e of enrich) {
    if (!e.realtorSharesJson) continue;
    try {
      const shares = JSON.parse(e.realtorSharesJson) as { name?: string }[];
      if (!Array.isArray(shares)) continue;
      for (const n of new Set(shares.map((s) => s?.name?.trim()).filter(Boolean) as string[])) {
        shareNameCount.set(n, (shareNameCount.get(n) ?? 0) + 1);
      }
    } catch { /* skip */ }
  }
  const topExpert = [...shareNameCount.entries()].sort((a, b) => b[1] - a[1])[0];
  const singleExpert = [...shareNameCount.entries()].find(([, c]) => c === 1);

  // کد پرسنلی واقعی از PM (ستون code — عین findPmNameByCode) — فقط کسی که در سهم معاملات هم هست
  const pmAll = await db.pmPersonnelRecord.findMany({ where: { code: { not: null }, fullName: { not: null } }, select: { code: true, fullName: true } });
  const pmWithTx = pmAll.find((p) => shareNameCount.has(p.fullName!.replace(/\s+/g, " ").trim())) ?? pmAll[0] ?? null;

  // نوع قرارداد — شمارش از غنی‌سازی (عین منطق route)
  const typeCount = new Map<string, number>();
  for (const e of enrich) {
    const t = e.contractType?.trim() || null;
    typeCount.set(t ?? "«null»", (typeCount.get(t ?? "«null»") ?? 0) + 1);
  }

  // بازهٔ تاریخ: ماه پر داده (پرتکرارین ماه میلادی)
  const monthCount = new Map<string, number>();
  for (const t of txs) {
    const m = new Date(t.contractDate).toISOString().slice(0, 7);
    monthCount.set(m, (monthCount.get(m) ?? 0) + 1);
  }
  const topMonth = [...monthCount.entries()].sort((a, b) => b[1] - a[1])[0];

  const out = {
    generatedAt: new Date().toISOString(),
    total: txs.length,
    propertyCode: { value: topProp[0], expected: topProp[1] },
    requestCode: { value: topReq[0], expected: topReq[1], singleExample: anyReqWithOne },
    contractHolo: { value: topHolo[0], expected: topHolo[1] },
    expertName: { value: topExpert[0], expected: topExpert[1], singleExample: singleExpert },
    personnelCode: pmWithTx ? { value: pmWithTx.code!, name: pmWithTx.fullName!, expected: shareNameCount.get(pmWithTx.fullName!.replace(/\s+/g, " ").trim()) ?? 0, note: "فیلتر سمت سرور نام PM را از کد پیدا می‌کند" } : null,
    contractType: Object.fromEntries(typeCount.entries()),
    dateRange: { month: topMonth[0], expectedInMonth: topMonth[1] },
    // ارقام فارسی برای آزمون نرمال‌سازی
    persianDigitPropertyCode: topProp[0].replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]),
  };
  writeFileSync("/home/z/my-project/filter-expected.json", JSON.stringify(out, null, 2), "utf8");
  console.log(JSON.stringify(out, null, 2));
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); }).finally(() => db.$disconnect());
