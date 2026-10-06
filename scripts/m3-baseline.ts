#!/usr/bin/env bun
/**
 * m3-baseline.ts — BLOCK 0 / BLOCK C (ملکا-شورا-۱۴۰۵-۰۱۷ — پروندهٔ کاشی M3)
 * -----------------------------------------------------------------------
 * شمارش پوشش ۱۵ ستون فهرست معاملات «قبل از تغییر» (baseline) و «بعد از تغییر».
 * خروجی: JSON با شمارش دقیق + md5 بکاپ (برای baseline) — شاهد BLOCK 0 و E.
 *
 * اجرا: bun scripts/m3-baseline.ts [--out baseline-m3.json|coverage-m3.json]
 */
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL ?? "file:/home/z/my-project/db/custom.db" } } });

const args = process.argv.slice(2);
const outIdx = args.indexOf("--out");
const OUT = outIdx >= 0 ? args[outIdx + 1] : "baseline-m3.json";

function pct1(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : 0;
}

async function main() {
  // عین منطق روت /api/crm/transactions — بدون فیلتر (کل دامنه)
  const { getContractRepository, getPropertyRecordRepository, getRequestRepository, getTransactionRepository } = await import("../src/core/repositories");
  const txEnrichmentModule = await import("../src/lib/melk-api/tx-enrichment");
  const enrichTransactionRows = txEnrichmentModule.enrichTransactionRows;
  type ContractLookup = import("../src/lib/melk-api/tx-enrichment").ContractLookup;
  type AgencyLookup = import("../src/lib/melk-api/tx-enrichment").AgencyLookup;

  const rows = await getTransactionRepository().findAll();
  // P6.5-14 (BLOCK C) — غنی‌سازی معامله‌محور (trade-overviews/info)
  const txInfo = await getTransactionRepository().findInfoEnrichmentsByTxIds(rows.map((r) => r.id));
  const propertyCodes = [...new Set(rows.map((r) => r.propertyCode).filter(Boolean))];
  const requestCodes = [...new Set(rows.map((r) => r.requestCode).filter((c): c is string => Boolean(c)))];
  const [owners, requesters, contractRows, agencyRows] = await Promise.all([
    getPropertyRecordRepository().findOwnerContactsByCodes(propertyCodes),
    getRequestRepository().findArmRequesterContactsByCodes(requestCodes),
    getContractRepository().findAll(),
    getContractRepository().listAgencyLookups(),
  ]);
  const contracts: ContractLookup[] = contractRows.map((c) => ({
    contractHolo: c.contractHolo, propertyCode: c.propertyCode, requestCode: c.requestCode,
    contractType: c.contractType, contractDate: c.contractDate, documentDate: c.documentDate,
    deliveryDate: c.deliveryDate, propertyTitle: c.propertyTitle, propertyAddress: c.propertyAddress,
    buyerListJson: c.buyerListJson, sellerListJson: c.sellerListJson, realtorListJson: c.realtorListJson,
    status: c.status, contractPrice: c.contractPrice, rawContractPrice: c.rawContractPrice,
    comisionOfContract: c.comisionOfContract, taxOfContract: c.taxOfContract,
  }));
  const agencies: AgencyLookup[] = agencyRows.map((a) => ({
    id: a.id, propertyCode: a.propertyCode, propertyId: a.propertyId, realtorName: a.realtorName,
    creatorName: a.creatorName, payPercent: a.payPercent, sellPrice: a.sellPrice, detailsJson: a.detailsJson, createdAt: a.createdAt,
  }));
  const enriched = enrichTransactionRows(rows, { owners, requesters, contracts, agencies, txInfo });

  const total = rows.length;
  const has = (fn: (r: (typeof enriched)[number]) => boolean) => enriched.filter(fn).length;
  const withRequest = enriched.filter((r) => r.requestCode).length;

  const coverage = {
    totalTransactions: total,
    withRequestCode: withRequest,
    fields: {
      propertyCode: { filled: has((r) => Boolean(r.propertyCode && r.propertyCode !== "—")), target: 100 },
      ownerName: { filled: has((r) => Boolean(r.ownerName)), target: 98 },
      ownerMobile: { filled: has((r) => Boolean(r.ownerMobile)), target: 95 },
      sellerName: { filled: has((r) => Boolean(r.sellerName ?? r.ownerName)), target: 98 }, // قبل از تفکیک P6.5-۱۴: مالک=فروشنده ادغامی
      sellerMobile: { filled: has((r) => Boolean(r.sellerMobile ?? r.ownerMobile)), target: 95 },
      requestCode: { filled: withRequest, target: 95 },
      requesterName: { filled: has((r) => Boolean(r.requesterName)), target: 95 },
      requesterMobile: { filled: has((r) => Boolean(r.requesterMobile)), target: 95 },
      buyerName: { filled: has((r) => Boolean(r.buyerName ?? r.requesterName)), target: 98 }, // قبل از تفکیک P6.5-۱۴: درخواست‌دهنده=خریدار ادغامی
      buyerMobile: { filled: has((r) => Boolean(r.buyerMobile ?? r.requesterMobile)), target: 95 },
      shareAggregate: { filled: has((r) => (r.consultantsShareSummary?.totalPercent ?? 0) > 0), target: 95 },
      contractHolo: { filled: has((r) => Boolean(r.contractHolo)), target: 100 },
      contractType: { filled: has((r) => Boolean(r.contractType)), target: 100 },
      contractAmount: { filled: has((r) => (r.contractAmount ?? 0) > 0), target: 95 },
      contractFile: { filled: has((r) => Boolean(r.contractText) || Boolean(r.agency) || Boolean(r.contractType) || Boolean(r.contractHolo)), target: 100 },
    },
  } as const;

  const out = {
    kind: OUT.includes("baseline") ? "BEFORE (baseline)" : "AFTER",
    generatedAt: new Date().toISOString(),
    backupMd5: OUT.includes("baseline") ? createHash("md5").update(readFileSync("/home/z/my-project/backups/pre-m3-14050702.db")).digest("hex") : undefined,
    coverage,
    percents: Object.fromEntries(
      Object.entries(coverage.fields).map(([k, v]) => [k, { pct: pct1(v.filled, total), target: v.target, meetsTarget: pct1(v.filled, total) >= v.target }])
    ),
  };
  console.log(JSON.stringify(out, null, 2));
  const { writeFileSync } = await import("node:fs");
  writeFileSync(`/home/z/my-project/${OUT}`, JSON.stringify(out, null, 2), "utf8");
  console.log(`\n→ written ${OUT}`);
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); }).finally(() => db.$disconnect());
