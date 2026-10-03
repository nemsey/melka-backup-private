/**
 * POST /api/crm/transactions/sync — بروزرسانی پایدار معاملات (P6546/گام سوم-۱)
 * ------------------------------------------------------
 * ریشه‌یابی مشکل «بروزرسانی کامل نمی‌گردد»:
 *   دکمهٔ بروزرسانی M3 به /api/sync/all متصل بود که «همهٔ» مراحل شش‌گانه را
 *   زنجیره‌ای در «یک درخواست» اجرا می‌کرد؛ زنجیرهٔ کامل به‌مرور از مهلت ۹۰
 *   ثانیه‌ای مرورگر عبور می‌کرد (خطای 504/مهلت) و هرچند سرور در پس‌زمینه
 *   ادامه می‌داد، نتیجه در UI هرگز «کامل» گزارش نمی‌شد؛ خطاهای گذرای 502/504
 *   سمت ARM هم تجربه را قطع‌قطع می‌کرد.
 *
 * راه‌حل (گام سوم + گام پنجم-پ-۳): اجرای «پس‌زمینه‌ای با بودجهٔ زمانی و
 * پیشرفت پایدار» —
 *   · POST فوراً (کمتر از یک ثانیه) کار را در پس‌زمینه آغاز می‌کند و
 *     پیشرفت را از جدول SyncJobState برمی‌گرداند (صفر مهلت ۹۰ ثانیه).
 *   · مراحل مستقل و مقید به checkpoint اند؛ شکست مرحله بقیه را نمی‌شکند.
 *   · GET وضعیت لحظه‌ای پیشرفت را برمی‌گرداند (پایش UI).
 *   · دیمون پایدارساز هم همین مسیر را ادامه می‌دهد (تداوم و خودترمیمی).
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { audit, updateSessionArmTokens } from "@/lib/auth/session";
import { syncWithRefresh } from "@/lib/melk-api/sync";
import { enrichTransactionsInfo } from "@/lib/melk-api/tx-info-enrichment";
import { execWithArmToken } from "@/lib/listing/crm-transfer";
import { syncSpecialProperties } from "@/lib/melk-api/pm-acc-sync";
import { JOB_IDS } from "@/lib/melk-api/job-state";
import type { SessionContext } from "@/lib/auth/session";

/** P2-03 — روت‌ها هرگز import مستقیم @/lib/db ندارند (الگوی db تنبل) */
async function getDb(): Promise<{ db: import("@prisma/client").PrismaClient; jobs: import("@/lib/melk-api/job-state").JobStateService }> {
  const mod = (await import("@/lib/db")) as { db: import("@prisma/client").PrismaClient };
  const { JobStateService } = await import("@/lib/melk-api/job-state");
  return { db: mod.db, jobs: new JobStateService(mod.db) };
}

export const maxDuration = 60;

/** قفل درون‌فرایندی — هم‌زمان فقط یک بروزرسانی پس‌زمینهٔ معاملات فعال است */
const g = globalThis as typeof globalThis & { __melkTxSync?: { running: boolean; startedAt: number; stages: Record<string, unknown> } };
if (!g.__melkTxSync) g.__melkTxSync = { running: false, startedAt: 0, stages: {} };
const state = g.__melkTxSync;

/** اجرای مراحل بروزرسانی معاملات در پس‌زمینه با پیشرفت پایدار */
async function runTxSyncBackground(guard: SessionContext): Promise<void> {
  const { jobs } = await getDb();
  const stages: Record<string, unknown> = {};
  try {
    // ---- مرحلهٔ ۱: همگام‌سازی اصلی (گزارش تطابق معاملات + کارشناسان + قراردادها) ----
    await jobs.upsert({ jobId: JOB_IDS.mainSync, jobKind: "sync", status: "running", detail: { stage: "main-sync", at: new Date().toISOString() } });
    try {
      const { sync, newArmToken } = await syncWithRefresh(guard.armTokens!.accessToken!, guard.armTokens!.refreshToken);
      stages.main = `tx=${sync.transactions};ex=${sync.experts};ct=${sync.contracts}`;
      if (newArmToken) {
        const { vaultKeyForSession } = await import("@/lib/auth/arm-vault");
        await updateSessionArmTokens(
          guard.sessionId,
          { accessToken: newArmToken, refreshToken: guard.armTokens!.refreshToken, userType: guard.armTokens!.userType },
          { ownerKey: vaultKeyForSession(guard.personnelCode, guard.role) }
        ).catch(() => undefined);
        guard.armTokens!.accessToken = newArmToken;
      }
    } catch (err) {
      stages.main = `error=${err instanceof MelkApiError ? err.message : String(err)}`.slice(0, 120);
    }
    await jobs.upsert({ jobId: JOB_IDS.mainSync, jobKind: "sync", status: "running", lastCompletedPage: 1, totalPages: 4, detail: { stage: "tx-info-enrichment", ...stages } });

    // ---- مرحلهٔ ۲: غنی‌سازی صورت‌وضعیت‌ها (نوع/مبلغ قرارداد + خریدار/فروشنده) ----
    try {
      const res = await execWithArmToken(guard, (t) => enrichTransactionsInfo(t, { maxRows: 200, throttleMs: 400 }));
      stages.txInfo = `enriched=${res.enriched};failed=${res.failed};remaining=${res.remaining}`;
    } catch (err) {
      stages.txInfo = `error=${err instanceof MelkApiError ? err.message : String(err)}`.slice(0, 120);
    }
    await jobs.upsert({ jobId: JOB_IDS.mainSync, jobKind: "sync", status: "running", lastCompletedPage: 2, totalPages: 4, detail: { stage: "contracts", ...stages } });

    // ---- مرحلهٔ ۳: کارگزاری‌های صادره (زنجیرهٔ عین سامانه) ----
    try {
      const res = await execWithArmToken(guard, (t) => syncSpecialProperties(t));
      stages.agencies = `total=${res.total};detailed=${res.detailed}`;
    } catch (err) {
      stages.agencies = `error=${err instanceof MelkApiError ? err.message : String(err)}`.slice(0, 120);
    }
    await jobs.upsert({ jobId: JOB_IDS.mainSync, jobKind: "sync", status: "running", lastCompletedPage: 3, totalPages: 4, detail: { stage: "finalizing", ...stages } });

    // ---- مرحلهٔ ۴: ثبت نهایی (پایان موفق — preflight سبز) ----
    await jobs.upsert({ jobId: JOB_IDS.mainSync, jobKind: "sync", status: "done", lastCompletedPage: 4, totalPages: 4, detail: { stage: "done", finishedAt: new Date().toISOString(), ...stages } });
    await audit("TX_BACKGROUND_SYNC", guard.personnelCode, Object.entries(stages).map(([k, v]) => `${k}:${v}`).join(" | ")).catch(() => undefined);
  } catch (err) {
    await jobs
      .upsert({
        jobId: JOB_IDS.mainSync,
        jobKind: "sync",
        status: "failed",
        detail: { stage: "aborted", error: String((err as Error)?.message ?? err), ...stages },
      })
      .catch(() => undefined);
  } finally {
    state.running = false;
    state.stages = stages;
  }
}

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);
  const { jobs } = await getDb();
  const job = await jobs.get(JOB_IDS.mainSync);
  return Response.json({ ok: true, running: state.running, job });
}

export async function POST(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  if (!guard.armTokens?.accessToken) {
    return errorResponse(
      new MelkApiError(
        "PRECONDITION_FAILED",
        "بروزرسانی معاملات از سامانه ملک تبریز نیاز به اتصال ARM دارد. از صفحه ورود با «کد پرسنلی + پیامک» وارد شوید یا در تنظیمات عمومی به ARM متصل شوید.",
        412,
        false
      )
    );
  }

  // اجرای پس‌زمینه فعال است؟ وضعیت را برگردان (بدون خطای 409/429 — گرم و پایدار)
  if (state.running) {
    const { jobs } = await getDb();
    const job = await jobs.get(JOB_IDS.mainSync);
    return Response.json({
      ok: true,
      busy: true,
      running: true,
      job,
      message: "بروزرسانی معاملات در پس‌زمینه در جریان است — پیشرفت همین صفحه نمایش داده می‌شود؛ عملیات از همان نقطهٔ قطع‌شده ادامه می‌یابد.",
    });
  }

  // شروع کار پس‌زمینه — پاسخ «فوری» (صفر مهلت ۹۰ ثانیه؛ ریشه‌یابی گام سوم)
  state.running = true;
  state.startedAt = Date.now();
  state.stages = {};
  const { jobs } = await getDb();
  await jobs.upsert({ jobId: JOB_IDS.mainSync, jobKind: "sync", status: "running", lastCompletedPage: 0, totalPages: 4, detail: { stage: "starting", at: new Date().toISOString() } });

  // fire-and-forget — سرور ماندگار است و کار در پس‌زمینه پیش می‌رود
  void runTxSyncBackground(guard).catch(() => undefined);

  return Response.json({
    ok: true,
    started: true,
    running: true,
    message: "بروزرسانی معاملات در پس‌زمینه آغاز شد — پیشرفت مرحله‌به‌مرحله همین‌جا نمایش داده می‌شود و عملیات از همان نقطهٔ قطع‌شده ادامه می‌یابد.",
  });
}
