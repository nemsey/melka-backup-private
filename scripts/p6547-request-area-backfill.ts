#!/usr/bin/env bun
/**
 * p6547-request-area-backfill.ts — بک‌فیل زندهٔ مناطق/محله‌ها/قیمت/دسته‌بندی درخواست‌ها
 * --------------------------------------------------------------------------------
 * P6547/گام دوم-۲: «جدول قطب‌های عرضه درخواست در مناطق تبریز فاقد اطلاعات است»
 * ریشه‌یابی: requests/details روی سرور ARM خطای 500 می‌دهد و areaNamesJson هرگز
 * پر نشده بود (۰ از ۱۰٬۳۳۹). کشف شاهکار: خود ردیف فهرست requests/list آرایه‌های
 * area[]/line[] و totalPrice_from/to و tradeType/… را «همانا با ساختار ثبت کارشناسان»
 * دارد — نگاشت تازه (mapArmRequestListRow) همه را استخراج می‌کند.
 * این اسکریپت چرخهٔ کامل فهرست درخواست‌ها (۲۱۳ صفحه × ۵۰) را با نگاشت تازه
 * دوباره می‌خواند و درج می‌کند (upsert-only — merge non-null؛ هیچ داده‌ای حذف نمی‌شود).
 */
import { PrismaClient } from "@prisma/client";
import { decryptSecret } from "../src/lib/auth/crypto";
import { syncArmRequestsCatalog } from "../src/lib/melk-api/arm-catalog";
import { writeFileSync } from "node:fs";

const db = new PrismaClient();

async function main() {
  const arm = await db.armConnection.findFirst({ where: { ownerKey: "master" } });
  const ARM_TOKEN = decryptSecret(arm?.tokenEnc ?? "") ?? "";
  console.log(`ARM token: ${ARM_TOKEN.length} chars`);
  if (!ARM_TOKEN) { console.log("NO ARM TOKEN — abort"); process.exit(1); }

  const before = {
    total: await db.requestRecord.count(),
    withArea: 0,
    withPrice: await db.requestRecord.count({ where: { priceFrom: { not: null } } }),
    withTrade: await db.requestRecord.count({ where: { tradeTypeName: { not: null } } }),
  };
  const sample = await db.requestRecord.findMany({ select: { areaNamesJson: true }, take: 12000 });
  before.withArea = sample.filter((r) => { try { const a = JSON.parse(r.areaNamesJson || "null"); return Array.isArray(a) && a.length > 0; } catch { return false; } }).length;
  console.log("BEFORE:", JSON.stringify(before));

  // چرخهٔ کامل: برش‌های ۱۰صفحه‌ای تا پایان (ازسرگیری از checkpoint خودکار)
  // تاب‌آوری: خطای گذرا (TIMEOUT/502/504) هرگز حلقه را نمی‌کشد — تا ۳ تلاش پیاپی
  const SLICE_PAGES = 10;
  let slice = 0;
  let consecutiveFails = 0;
  let last: Awaited<ReturnType<typeof syncArmRequestsCatalog>> | null = null;
  const t0 = Date.now();
  while (slice < 40 && Date.now() - t0 < 540_000) {
    slice += 1;
    last = await syncArmRequestsCatalog(ARM_TOKEN, { pageSize: 50, maxPages: SLICE_PAGES });
    console.log(`slice ${slice}: pages=${last.pages} fetched=${last.fetched} created=${last.created} updated=${last.updated} errors=${last.errors} ok=${last.ok} [${((Date.now()-t0)/1000).toFixed(0)}s]`);
    // پایان چرخه: صفحهٔ آخر خوانده شد (برش کامل کوچک‌تر از سقف = انتهای فهرست)
    if (last.ok && (last.fetched === 0 || last.pages < SLICE_PAGES)) break;
    if (!last.ok) {
      consecutiveFails += 1;
      console.log("transient error:", last.errorCode, `— retry ${consecutiveFails}/3 after 20s`);
      if (consecutiveFails >= 3) break;
      await new Promise((r) => setTimeout(r, 20_000));
      slice -= 1; // این برش دوباره شمرده نمی‌شود
    } else {
      consecutiveFails = 0;
    }
  }

  const after = {
    total: await db.requestRecord.count(),
    withArea: 0,
    withPrice: await db.requestRecord.count({ where: { priceFrom: { not: null } } }),
    withTrade: await db.requestRecord.count({ where: { tradeTypeName: { not: null } } }),
    withLine: 0,
    withUrgent: await db.requestRecord.count({ where: { urgent: { not: null } } }),
  };
  const sample2 = await db.requestRecord.findMany({ select: { areaNamesJson: true, lineNamesJson: true }, take: 12000 });
  after.withArea = sample2.filter((r) => { try { const a = JSON.parse(r.areaNamesJson || "null"); return Array.isArray(a) && a.length > 0; } catch { return false; } }).length;
  after.withLine = sample2.filter((r) => { try { const a = JSON.parse(r.lineNamesJson || "null"); return Array.isArray(a) && a.length > 0; } catch { return false; } }).length;

  // توزیع مناطق — دادهٔ جدول «قطب‌های عرضه درخواست»
  const areaDist: Record<string, number> = {};
  sample2.forEach((r) => { try { const a = JSON.parse(r.areaNamesJson || "null"); if (Array.isArray(a)) a.forEach((x) => (areaDist[x] = (areaDist[x] || 0) + 1)); } catch {} });
  const topAreas = Object.entries(areaDist).sort((a, b) => b[1] - a[1]).slice(0, 10);

  const proof = {
    ranAt: new Date().toISOString(),
    durationMs: Date.now() - t0,
    slices: slice,
    lastResult: last ? { pages: last.pages, fetched: last.fetched, created: last.created, updated: last.updated, ok: last.ok } : null,
    before, after,
    topAreas,
  };
  writeFileSync("download/p6547/request-area-backfill-proof.json", JSON.stringify(proof, null, 2));
  console.log("AFTER:", JSON.stringify(after));
  console.log("TOP AREAS:", JSON.stringify(topAreas));
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
