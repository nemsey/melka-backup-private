/**
 * P6.5-04-i — نخستین sync کامل داده‌دار در پنجرهٔ شبانه (فاز ۳ دستور مالک)
 * ---------------------------------------------------------------------------
 * اجرای واقعی مسیر تولید syncFromArm (incremental) با توکن ARM نشست مالک
 * از پایگاه — الگوی اثبات‌شدهٔ شب ۱/۲ (صفر پیامک، صفر POST به مبدأ).
 *
 * گاردهای حاکم (§۱.۱۲-ب ده قاعده + دستور چهارفازی):
 *  - پنجرهٔ شبانه ۲۲:۰۰–۰۶:۰۰ تهران (قاعده ۲) — خارج از پنجره: ABORT
 *  - صفر تلاش مجدد: probe تک‌GET؛ شکست ⇒ توقف (قاعده ۸)
 *  - فقط GET به مبدأ (sync از خودش فقط GET می‌فرستد) (قاعده ۹)
 *  - توکن از جدیدترین نشست دارای armTokenEnc (نشست سطح-اپ منقضی مجاز —
 *    اعتبار را خود ARM تعیین می‌کند؛ الگوی recon-night2)
 *  - شاهد بایت توکن در AuditLog (الزام فاز ۲ دستور: «بایت‌های توکن در AuditLog»)
 *  - ردیف DATA_SYNC عین قالب روت /api/sync در AuditLog (شاهد فاز ۳)
 *
 * خروجی شاهد: tool-results/p6504i-first-sync.jsonl (بدون توکن/PII)
 */
import { appendFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { decryptSecret } from "../src/lib/auth/crypto";
import { armCall } from "../src/lib/melk-api/client";
import { MELK_ENDPOINTS } from "../src/lib/melk-api/endpoints";
import { getMelkApiConfig } from "../src/lib/melk-api/config";
import { syncFromArm } from "../src/lib/melk-api/sync";

const LOG = "tool-results/p6504i-first-sync.jsonl";

function log(rec: Record<string, unknown>): void {
  appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), ...rec }) + "\n");
}

/** قاعده ۲ (§۱.۱۲-ب): فقط پنجرهٔ ۲۲:۰۰–۰۶:۰۰ تهران */
function inNightWindow(now = new Date()): boolean {
  const hour = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tehran", hour: "numeric", hour12: false }).format(now));
  return hour >= 22 || hour < 6;
}

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
    log({ event: "start", purpose: "P6.5-04-i phase-3 first data-bearing sync", mode: process.env.MELK_SYNC_MODE ?? "(unset)" });

    // ---- ۰) گارد پنجرهٔ شبانه ----------------------------------------------
    if (!inNightWindow()) {
      log({ event: "abort", reason: "OUTSIDE_NIGHT_WINDOW" });
      console.error("ABORT: خارج از پنجرهٔ شبانه ۲۲:۰۰–۰۶:۰۰ تهران (قاعده ۲ §۱.۱۲-ب).");
      process.exit(2);
    }
    log({ event: "window-guard", ok: true, tehranHourNow: new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tehran", hour: "numeric", hour12: false }).format(new Date()) });

    // ---- ۱) وضعیت قبل ------------------------------------------------------
    const stateBefore = await prisma.syncState.findUnique({ where: { id: "singleton" } });
    const before = await tableCounts();
    log({ event: "before", tableCounts: before, lastSuccessAt: stateBefore?.lastSuccessAt?.toISOString() ?? null });

    // ---- ۲) توکن ARM نشست مالک (شامل نشست منقضیِ سطح-اپ) -------------------
    const sessions = await prisma.session.findMany({
      where: { revoked: false, armTokenEnc: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, personnelCode: true, role: true, armTokenEnc: true, armRefreshTokenEnc: true, createdAt: true, expiresAt: true, armUserType: true },
    });
    let token: string | null = null;
    let tokenSession: (typeof sessions)[number] | null = null;
    for (const s of sessions) {
      if (!s.armTokenEnc || s.armTokenEnc.length < 50) continue;
      const plain = decryptSecret(s.armTokenEnc);
      if (plain && plain !== "null" && plain.length > 20) {
        token = plain;
        tokenSession = s;
        break;
      }
    }
    if (!token || !tokenSession) {
      log({ event: "abort", reason: "NO_ARM_SESSION" });
      console.error("ABORT: نشست دارای توکن ARM در پایگاه نیست.");
      process.exit(2);
    }
    const accessBytes = Buffer.byteLength(token, "utf8");
    const refreshBytes = tokenSession.armRefreshTokenEnc
      ? Buffer.byteLength(decryptSecret(tokenSession.armRefreshTokenEnc) ?? "", "utf8")
      : 0;
    log({
      event: "session-auth",
      source: "db-session",
      sessionRole: tokenSession.role,
      personnelCode: tokenSession.personnelCode,
      appSessionValid: tokenSession.expiresAt.getTime() > Date.now(),
      armUserType: tokenSession.armUserType,
      armAccessTokenBytes: accessBytes,
      armRefreshTokenBytes: refreshBytes,
    });

    // شاهد فاز ۲: بایت‌های توکن در AuditLog (مقدار مشاهده‌شده — بدون خود توکن)
    await prisma.auditLog.create({
      data: {
        action: "ARM_TOKEN_WITNESS",
        actor: tokenSession.personnelCode,
        detail: `armAccessTokenBytes=${accessBytes}; armRefreshTokenBytes=${refreshBytes}; userType=${tokenSession.armUserType ?? "-"}; sessionRole=${tokenSession.role}`,
        operation: "READ",
        entityType: "session",
        recordCount: 1,
        accessScope: "OWNER",
      },
    });

    // ---- ۳) probe سبک (۱ GET): توکن زنده است؟ -----------------------------
    const cfg = getMelkApiConfig();
    let probeOk = false;
    try {
      await armCall<unknown>({
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
      log({ event: "probe", alive: false, error: (err as Error).message?.slice(0, 120) ?? "unknown" });
    }
    if (!probeOk) {
      // قاعده ۸: صفر تلاش مجدد — توقف فوری
      log({ event: "abort", reason: "ARM_TOKEN_EXPIRED", note: "zero-retry rule" });
      console.error("ABORT: توکن ARM منقضی/سامانه پاسخگو نیست — طبق قاعده ۸ توقف؛ صفر تلاش مجدد.");
      process.exit(3);
    }

    // ---- ۴) اجرای sync واقعی (فقط GET، مسیر تولید) ------------------------
    const t0 = Date.now();
    const result = await syncFromArm(token);
    const durationMs = Date.now() - t0;

    // ---- ۵) ردیف DATA_SYNC عین قالب روت /api/sync --------------------------
    await prisma.auditLog.create({
      data: {
        action: "DATA_SYNC",
        actor: tokenSession.personnelCode,
        detail: `tx=${result.transactions}; ex=${result.experts}; in=${result.interactions}; vi=${result.visits}; sd=${result.supplyDemand}; ct=${result.contracts}; run=first-data-sync-p6504i`,
        operation: "WRITE",
        entityType: "transaction",
        recordCount: result.transactions + result.experts + result.interactions + result.visits + result.supplyDemand + result.contracts,
        accessScope: "OWNER",
      },
    });

    const stateAfter = await prisma.syncState.findUnique({ where: { id: "singleton" } });
    const after = await tableCounts();
    const totalRecords = result.transactions + result.experts + result.visits + result.interactions + result.supplyDemand + result.contracts;

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
      tableCountsAfter: after,
      syncState: {
        lastError: stateAfter?.lastError ?? null,
        attempts: stateAfter?.attempts ?? null,
        lastSuccessAt: stateAfter?.lastSuccessAt?.toISOString() ?? null,
        syncRunId: stateAfter?.syncRunId ?? null,
      },
    });

    console.log("=== P6.5-04-i FIRST DATA-BEARING SYNC ===");
    console.log(`ok=${result.ok} duration=${durationMs}ms`);
    console.log(`fetched: tx=${result.transactions} ex=${result.experts} vi=${result.visits} in=${result.interactions} sd=${result.supplyDemand} ct=${result.contracts}`);
    console.log(`totalRecordsFetched=${totalRecords}`);
    console.log(`tables after: ${JSON.stringify(after)}`);
    console.log(`syncRunId=${stateAfter?.syncRunId ?? "-"} lastSuccessAt=${stateAfter?.lastSuccessAt?.toISOString() ?? "never"}`);
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
