/**
 * شاهد زندهٔ رفع باگ sync — دستور ملکا-شورا-۰۰۷، بخش B.1
 * ------------------------------------------------------
 * هدف: اثبات روی دادهٔ واقعی — لاگ sync با status:"ok" و recordsFetched>0.
 *
 * سه اصل حداقلی (ملکا-شورا-۰۰۷ A.2):
 *  - فقط GET به سامانهٔ مبدأ: sync از خودش فقط GET می‌فرستد؛ probe هم GET است.
 *    صفر POST/PUT/DELETE (بدون refresh-token، بدون لاگین جدید).
 *  - داده خام دست‌نخورده؛ نوشتن فقط در پایگاه محلی خودمان.
 *  - صفر LLM call.
 *
 * خروجی: tool-results/sync-live-witness.jsonl (بدون توکن/PII/payload)
 */

import { appendFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { decryptSecret } from "../src/lib/auth/crypto";
import { armCall } from "../src/lib/melk-api/client";
import { MELK_ENDPOINTS } from "../src/lib/melk-api/endpoints";
import { getMelkApiConfig } from "../src/lib/melk-api/config";
import { syncFromArm } from "../src/lib/melk-api/sync";

const LOG = "tool-results/sync-live-witness.jsonl";

function log(rec: Record<string, unknown>): void {
  appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), ...rec }) + "\n");
}

class WitnessAbort extends Error {}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const tableCounts = async () => {
    const [tx, ex, vi, inr, sd, ct] = await Promise.all([
      prisma.transactionRecord.count(),
      prisma.expertRecord.count(),
      prisma.visitRecord.count(),
      prisma.interactionRecord.count(),
      prisma.supplyDemandRecord.count(),
      prisma.contractRecord.count(),
    ]);
    return { transactions: tx, experts: ex, visits: vi, interactions: inr, supplyDemand: sd, contracts: ct };
  };

  try {
    log({ event: "start", purpose: "B.1-live-witness", origin: "melka-shora-007" });

    // ---- ۰) وضعیت قبل -----------------------------------------------------
    const stateBefore = await prisma.syncState.findUnique({ where: { id: "singleton" } });
    const before = await tableCounts();
    log({
      event: "before",
      lastError: stateBefore?.lastError ?? null,
      lastErrorCode: stateBefore?.lastErrorCode ?? null,
      attempts: stateBefore?.attempts ?? null,
      lastSuccessAt: stateBefore?.lastSuccessAt?.toISOString() ?? null,
      tableCounts: before,
    });

    // ---- ۱) توکن نشست فعال مالک (الگوی اثبات‌شدهٔ شب ۱) --------------------
    const sessions = await prisma.session.findMany({
      where: { revoked: false, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { armTokenEnc: true, createdAt: true, armUserType: true },
    });
    let token: string | null = null;
    let sessionAgeMin = -1;
    for (const s of sessions) {
      if (!s.armTokenEnc || s.armTokenEnc.length < 50) continue; // نشست‌های master بدون توکن ARM
      const plain = decryptSecret(s.armTokenEnc);
      if (plain && plain !== "null" && plain.length > 20) {
        token = plain;
        sessionAgeMin = Math.round((Date.now() - s.createdAt.getTime()) / 60000);
        break;
      }
    }
    if (!token) {
      log({ event: "abort", reason: "NO_ACTIVE_ARM_SESSION" });
      console.error("ABORT: نشست ARM فعالی در پایگاه نیست — شاهد زنده نیازمند لاگین بعدی مالک است.");
      process.exit(2);
    }
    log({ event: "session-auth", source: "db-session", tokenAcquired: true, sessionAgeMin, armUserType: "realtor" });

    // ---- ۲) probe سبک (۱ GET): توکن زنده است؟ -----------------------------
    const cfg = getMelkApiConfig();
    let probeOk = false;
    try {
      const probe = await armCall<unknown>({
        path: MELK_ENDPOINTS.arm.realtorsList,
        baseUrl: cfg.armApiBase,
        token,
        query: { page: 1, limit: 1 },
        timeoutMs: cfg.timeoutMs,
        maxRetries: 0,
      });
      probeOk = true;
      log({ event: "probe", endpoint: MELK_ENDPOINTS.arm.realtorsList, status: 200, alive: true });
    } catch (err) {
      log({
        event: "probe",
        endpoint: MELK_ENDPOINTS.arm.realtorsList,
        alive: false,
        error: (err as Error).message?.slice(0, 120) ?? "unknown",
      });
    }
    if (!probeOk) {
      // اصل «صفر POST» ⇒ تمدید/لاگین انجام نمی‌شود؛ دیمون پس از لاگین بعدی مالک خودش sync می‌کند
      log({ event: "abort", reason: "ARM_TOKEN_EXPIRED", note: "refresh skipped: zero-POST principle" });
      console.error("ABORT: توکن ARM منقضی شده — طبق اصل صفر-POST تمدید نمی‌کنیم؛ پس از لاگین بعدی مالک، دیمون خودش sync می‌کند.");
      process.exit(3);
    }

    // ---- ۳) اجرای sync واقعی (فقط GET) ------------------------------------
    const t0 = Date.now();
    const result = await syncFromArm(token);
    const durationMs = Date.now() - t0;

    const stateAfter = await prisma.syncState.findUnique({ where: { id: "singleton" } });
    const after = await tableCounts();
    const totalRecords =
      result.transactions + result.experts + result.visits + result.interactions + result.supplyDemand + result.contracts;

    log({
      event: "sync-result",
      ok: result.ok,
      error: result.error ?? null,
      errorCode: result.errorCode ?? null,
      durationMs,
      fetched: {
        transactions: result.transactions,
        experts: result.experts,
        visits: result.visits,
        interactions: result.interactions,
        supplyDemand: result.supplyDemand,
        contracts: result.contracts,
      },
      totalRecordsFetched: totalRecords,
      recordsFetchedAboveZero: totalRecords > 0,
      stateAfter: {
        lastError: stateAfter?.lastError ?? null,
        lastErrorCode: stateAfter?.lastErrorCode ?? null,
        attempts: stateAfter?.attempts ?? null,
        lastSuccessAt: stateAfter?.lastSuccessAt?.toISOString() ?? null,
      },
      tableCountsAfter: after,
    });

    // ---- ۴) جمع‌بندی شاهد --------------------------------------------------
    console.log("=== B.1 LIVE WITNESS ===");
    console.log(`ok=${result.ok} duration=${durationMs}ms`);
    console.log(`fetched: tx=${result.transactions} ex=${result.experts} vi=${result.visits} in=${result.interactions} sd=${result.supplyDemand} ct=${result.contracts}`);
    console.log(`recordsFetched>0: ${totalRecords > 0}`);
    console.log(`lastError cleared: ${stateAfter?.lastError == null}, attempts=${stateAfter?.attempts ?? "?"}, lastSuccessAt=${stateAfter?.lastSuccessAt?.toISOString() ?? "never"}`);
    console.log(`tables after: ${JSON.stringify(after)}`);
    process.exit(result.ok && totalRecords > 0 ? 0 : 1);
  } catch (err) {
    log({ event: "fatal", error: (err as Error).message?.slice(0, 200) ?? "unknown" });
    console.error("FATAL:", (err as Error).message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

void main();
