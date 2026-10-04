/**
 * P6545 / گام ۳ — BLOCK 3.5: Cross-Tile Outcomes (پیامدهای بین‌کاشی)
 * ---------------------------------------------------------------------------
 * یک معاملهٔ واقعی = پیامد برای ۵ مدل (ن۰۰۱ BLOCK 3.5 — پیامد پنجم M5):
 *   M1 ملک: فروش/اجاره رفت (listing_deal)
 *   M2 درخواست: برآورده شد (request_match)
 *   M3 معامله: موفق (transaction_success)
 *   M4 کارشناس: موفق بود (expert_performance)
 *   M5 تطبیق: درست بود (match_accept — وقتی معامله از پیوند آگهی↔درخواست آمده)
 *
 * هر پیامد OutcomeRecord با EvidenceLink (کد معامله/ملک/درخواست/کارشناس)
 * + رویداد outcome.recorded روی تختهٔ سیاه.
 * مصنوع ماندگار: intelligence-data/cross-tile-outcomes.jsonl
 */

import type { PrismaClient } from "@prisma/client";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { evidenceLink, type OutcomeRecord } from "@/core/intelligence/contracts-p7-p11";
import { emitEvent } from "@/lib/intelligence/blackboard";

const OUT_PATH = path.join(process.cwd(), "intelligence-data", "cross-tile-outcomes.jsonl");

export interface CrossTileOutcomeResult {
  txId: string;
  outcomes: OutcomeRecord[];
  events: number;
}

/** ساخت چهار پیامد از یک معاملهٔ واقعی — صفر منطق هوش؛ فقط ثبت واقعیت */
export async function emitCrossTileOutcomes(db: PrismaClient, txId: string): Promise<CrossTileOutcomeResult> {
  const tx = await db.transactionRecord.findFirst({ where: { id: txId } });
  if (!tx) return { txId, outcomes: [], events: 0 };
  const enrich = await db.transactionEnrichment.findFirst({ where: { txId } });
  const nowIso = new Date().toISOString();
  const occurredAt = new Date(tx.contractDate).toISOString();
  const base = {
    observedAt: occurredAt,
    timeWindowDays: 90,
    rawPayloadJson: JSON.stringify({ txId, contractType: enrich?.contractType ?? null, contractPrice: enrich?.contractPrice ?? null }),
    tierAtObservation: 3 as const,
    extractionBatchId: "p6545-cross-tile",
    extractedAt: nowIso,
    tenantId: "melk-tabriz",
  };

  const outcomes: OutcomeRecord[] = [];

  /* ۱) M1 — ملک: معامله شد */
  if (tx.propertyCode) {
    outcomes.push({
      id: `ct-m1-${tx.id}`,
      predictionId: `prop-${tx.propertyCode}`,
      predictionType: "listing_deal",
      predictedAt: occurredAt,
      predictedValue: 0.5,
      observedValue: 1,
      resolution: "success",
      evidenceChain: [
        evidenceLink("query", `TransactionRecord.id=${tx.id}`, `کد ملک ${tx.propertyCode} در معامله`),
        evidenceLink("query", `TransactionEnrichment.txId=${tx.id}`, `نوع قرارداد: ${enrich?.contractType ?? "نامشخص"}`),
      ],
      ...base,
    });
  }

  /* ۲) M2 — درخواست: برآورده شد (اگر معامله از درخواست آمده) */
  if (tx.requestCode) {
    const req = await db.requestRecord.findFirst({ where: { requestCode: tx.requestCode } });
    if (req) {
      outcomes.push({
        id: `ct-m2-${tx.id}`,
        predictionId: `req-${req.id}`,
        predictionType: "request_match",
        predictedAt: occurredAt,
        predictedValue: 0.5,
        observedValue: 1,
        resolution: "success",
        evidenceChain: [evidenceLink("query", `TransactionRecord.requestCode=${tx.requestCode}`, `درخواست ${tx.requestCode} به معامله رسید`)],
        ...base,
      });
    }
  }

  /* ۳) M3 — معامله: موفق (ثبت‌شده در صورت‌وضعیت ARM = واقعیت) */
  outcomes.push({
    id: `ct-m3-${tx.id}`,
    predictionId: `tx-${tx.id}`,
    predictionType: "transaction_success",
    predictedAt: occurredAt,
    predictedValue: 1,
    observedValue: 1,
    resolution: "success",
    evidenceChain: [evidenceLink("query", `TransactionRecord.id=${tx.id}`, "معامله در صورت‌وضعیت ARM ثبت شده")],
    ...base,
  });

  /* ۴) M4 — کارشناس: موفق بود (کارشناسِ ثبت‌کننده — ownerCode یا از مسیر درخواست → actorName) */
  let expertCode = tx.ownerCode;
  let expertEvidence = "کارشناسِ معامله";
  if (!expertCode && tx.requestCode) {
    const req = await db.requestRecord.findFirst({ where: { requestCode: tx.requestCode }, select: { actorName: true } });
    if (req?.actorName) {
      const expert = await db.expertRecord.findFirst({ where: { fullName: req.actorName }, select: { personnelCode: true } });
      if (expert) {
        expertCode = expert.personnelCode;
        expertEvidence = `کارشناس ثبت‌کنندهٔ درخواست (${req.actorName})`;
      }
    }
  }
  if (expertCode) {
    outcomes.push({
      id: `ct-m4-${tx.id}`,
      predictionId: `exp-${expertCode}`,
      predictionType: "expert_performance",
      predictedAt: occurredAt,
      predictedValue: 0.5,
      observedValue: 1,
      resolution: "success",
      evidenceChain: [evidenceLink("query", `TransactionRecord.id=${tx.id}`, expertEvidence)],
      ...base,
    });
  }

  /* ۵) M5 — تطبیق: درست بود (ن۰۰۱ BLOCK 3.5 — وقتی معامله از پیوند آگهی↔درخواست آمده) */
  if (tx.propertyCode && tx.requestCode) {
    const matchedReq = await db.requestRecord.findFirst({ where: { requestCode: tx.requestCode } });
    if (matchedReq) {
      outcomes.push({
        id: `ct-m5-${tx.id}`,
        predictionId: `match-${tx.propertyCode}-${matchedReq.id}`,
        predictionType: "match_accept",
        predictedAt: occurredAt,
        predictedValue: 1,
        observedValue: 1,
        resolution: "success",
        evidenceChain: [evidenceLink("query", `TransactionRecord.id=${tx.id}`, `تطبیق ملک ${tx.propertyCode} ↔ درخواست ${tx.requestCode} به معامله رسید — مدل melka-matching-v1`)],
        ...base,
      });
    }
  }

  // ماندگاری + رویدادها
  if (outcomes.length > 0) {
    try {
      if (!existsSync(path.dirname(OUT_PATH))) mkdirSync(path.dirname(OUT_PATH), { recursive: true });
      for (const o of outcomes) appendFileSync(OUT_PATH, JSON.stringify(o) + "\n");
    } catch {
      // ماندگاری هرگز ثبت را نمی‌شکند
    }
    let events = 0;
    for (const o of outcomes) {
      try {
        await emitEvent("outcome.recorded", { outcomeId: o.id, predictionType: o.predictionType, txId, observedValue: o.observedValue });
        events += 1;
      } catch { /* تخته هرگز */ }
    }
    return { txId, outcomes, events };
  }
  return { txId, outcomes, events: 0 };
}

/** اجرای دسته‌ای روی N معاملهٔ واقعی (شاهد BLOCK 3.5: ۱۰ معامله ← ۴۰ پیامد) */
export async function emitCrossTileOutcomesBatch(db: PrismaClient, limit = 10): Promise<{ transactions: number; outcomes: number; events: number; details: CrossTileOutcomeResult[] }> {
  // گزینش: معاملاتی که درخواستشان موجود است (زنجیرهٔ کامل M1-M4)؛ اگر کم بود، باقی از همه
  // (عضویت در حافظه — سقف پارامتر SQLite)
  const reqCodeSet = new Set((await db.requestRecord.findMany({ where: { requestCode: { not: null } }, select: { requestCode: true } })).map((r) => r.requestCode as string));
  const allTxs = await db.transactionRecord.findMany({
    where: { propertyCode: { not: "" } },
    orderBy: { contractDate: "desc" },
    take: 400,
  });
  const linked = allTxs.filter((t) => t.requestCode && reqCodeSet.has(t.requestCode)).slice(0, limit);
  const rest = linked.length >= limit ? [] : allTxs.filter((t) => !linked.some((l) => l.id === t.id)).slice(0, limit - linked.length);
  const txs = [...linked, ...rest];
  const details: CrossTileOutcomeResult[] = [];
  let outcomes = 0;
  let events = 0;
  for (const tx of txs) {
    const r = await emitCrossTileOutcomes(db, tx.id);
    details.push(r);
    outcomes += r.outcomes.length;
    events += r.events;
  }
  return { transactions: txs.length, outcomes, events, details };
}

/** خواندن مصنوع ماندگار — برای شاهد و تست */
export function readCrossTileOutcomes(): OutcomeRecord[] {
  if (!existsSync(OUT_PATH)) return [];
  return readFileSync(OUT_PATH, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as OutcomeRecord);
}
