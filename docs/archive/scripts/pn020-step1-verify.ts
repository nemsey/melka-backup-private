/**
 * PN-020/گام اول — شاهد زندهٔ دادهٔ واقعی: تجزیهٔ شرایط مالی قرارداد روی هر ۷۶۷ معاملهٔ DB تولید
 * خواندن فقط (rawInfoJson عین منبع) + شمارش پوشش ستون‌های تازهٔ M3.
 */
import { PrismaClient } from "@prisma/client";
import { parseTxFinancialTerms, txStatusLabel } from "../src/lib/melk-api/tx-enrichment";
import { writeFileSync } from "node:fs";

const db = new PrismaClient();
const rows = await db.transactionEnrichment.findMany({
  select: { txId: true, rawInfoJson: true, comisionOfContract: true, taxOfContract: true, propertyTitle: true, propertyAddress: true, status: true },
});
const total = rows.length;
let hasSanad = 0, hasStatus = 0, hasTitle = 0, hasComision = 0, hasTax = 0;
let hasPayment = 0, hasBuyerCash = 0, hasSellerCash = 0, hasCheque = 0, hasJanebi = 0, hasServiceDong = 0;
const statusDist: Record<string, number> = {};
let buyerCashTotalAll = 0;
for (const r of rows) {
  const f = parseTxFinancialTerms(r.rawInfoJson);
  if (f.sanadDate) hasSanad++;
  if (f.txStatus) { hasStatus++; statusDist[f.txStatus] = (statusDist[f.txStatus] ?? 0) + 1; }
  if (r.propertyTitle) hasTitle++;
  const com = f.comisionOfContract ?? r.comisionOfContract; if (com && com > 0) hasComision++;
  const tax = f.taxOfContract ?? r.taxOfContract; if (tax && tax > 0) hasTax++;
  if (f.paymentTerms) {
    hasPayment++;
    if (f.paymentTerms.buyerCashCount > 0) hasBuyerCash++;
    if (f.paymentTerms.sellerCashCount > 0) hasSellerCash++;
    if (f.paymentTerms.buyerChequeCount + f.paymentTerms.sellerChequeCount > 0) hasCheque++;
    buyerCashTotalAll += f.paymentTerms.buyerCashTotal + f.paymentTerms.sellerCashTotal;
  }
  if (f.paymentSchedule) { if ((f.paymentSchedule.janebiPrice ?? 0) > 0) hasJanebi++; if ((f.paymentSchedule.serviceDong ?? 0) > 0) hasServiceDong++; }
}
const pct = (n: number) => Math.round((n / total) * 1000) / 10;
const witness = {
  generatedAt: new Date().toISOString(),
  workOrder: "PN-020/گام اول-ج — شاهکار شرایط مالی قرارداد (rawInfoJson → ستون‌های تازهٔ M3)",
  sourceTable: "TransactionEnrichment.rawInfoJson (عین پاسخ خام ARM — قانون دادهٔ مقدس)",
  totalTransactions: total,
  coverage: {
    sanadDate: { count: hasSanad, pct: pct(hasSanad) },
    txStatus: { count: hasStatus, pct: pct(hasStatus), distribution: statusDist },
    propertyTitle: { count: hasTitle, pct: pct(hasTitle) },
    comisionOfContract: { count: hasComision, pct: pct(hasComision) },
    taxOfContract: { count: hasTax, pct: pct(hasTax) },
    paymentTerms: { count: hasPayment, pct: pct(hasPayment) },
    buyerCashPayments: { count: hasBuyerCash, pct: pct(hasBuyerCash) },
    sellerCashPayments: { count: hasSellerCash, pct: pct(hasSellerCash) },
    cheques: { count: hasCheque, pct: pct(hasCheque) },
    janebiPrice: { count: hasJanebi, pct: pct(hasJanebi) },
    serviceDong: { count: hasServiceDong, pct: pct(hasServiceDong) },
  },
  sumAllRecordedCashPaymentsToman: buyerCashTotalAll,
  sample: (() => {
    const r = rows.find((x) => x.rawInfoJson && x.rawInfoJson.includes("buyerCashList") && x.rawInfoJson.includes("serviceDong"));
    if (!r) return null;
    const f = parseTxFinancialTerms(r.rawInfoJson);
    return {
      txId: r.txId,
      propertyTitle: r.propertyTitle,
      status: txStatusLabel(f.txStatus),
      sanadDate: f.sanadDate,
      comisionOfContract: f.comisionOfContract,
      taxOfContract: f.taxOfContract,
      paymentTerms: f.paymentTerms,
      paymentSchedule: f.paymentSchedule,
    };
  })(),
};
writeFileSync("/home/z/my-project/download/pn020/step1-lists/m3-financial-terms-witness.json", JSON.stringify(witness, null, 2));
console.log(JSON.stringify({ total, sanad: pct(hasSanad), status: pct(hasStatus), title: pct(hasTitle), payment: pct(hasPayment), buyerCash: pct(hasBuyerCash), cheque: pct(hasCheque), serviceDong: pct(hasServiceDong), statusDist }, null, 1));
await db.$disconnect();
