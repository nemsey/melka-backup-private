/**
 * index.ts — PN-051 — ارکستراتور خط‌لوله‌های فهرست (LCPP Orchestrator)
 * ---------------------------------------------------------------------------
 * فرمان ۴: «فاز A همهٔ فهرست‌ها (ستون‌های حیاتی ≤۱ دقیقه) → سپس فاز B (جزئیات)»
 * فرمان ۳: List-Centric — خطای هر فهرست هرگز چرخه را نمی‌ایستاند (جزیره‌بندی).
 * اولویت (فرمان ۸ بند ۳): criticalها اول — M1 (آگهی) · M2 (درخواست) · M9 (معاملات)
 *
 * PN-059 (دستور مالک ۱۴۰۵/۰۸/۱۱): فهرست‌های ملکتون (M7/M8) حذف شدند
 * (حذف کامل کاشی ملکتون + داده‌هایش) — چرخه فقط ARM ملک‌تبریز است.
 *
 * گاردها:
 *   · MELK_LCPP=disabled → چرخه خاموش
 *   · درون‌فرایندی: قفل overlap (عین catalog-daemon)
 *   · توکن ARM: نشست زنده → خزانه (ArmConnection) → صرف‌نظر صادقانه
 *   · پرچم مالک (Force Refresh · فرمان ۷) → اجرای فوری چرخهٔ بعدی
 */

import type { PrismaClient } from "@prisma/client";
import { markCycleStart, markCycleEnd, peekForceRefresh, clearForceRefresh } from "./kernel";

export * from "./kernel";
export { LIST_ID as M1_LIST_ID, fastPass as m1FastPass, deepPass as m1DeepPass } from "./arm-listings";
export { LIST_ID as M2_LIST_ID, fastPass as m2FastPass, deepPass as m2DeepPass } from "./arm-requests";
export { LIST_ID as M9_LIST_ID, fastPass as m9FastPass, deepPass as m9DeepPass } from "./transactions";

import { fastPass as m1FastPass, deepPass as m1DeepPass } from "./arm-listings";
import { fastPass as m2FastPass, deepPass as m2DeepPass } from "./arm-requests";
import { fastPass as m9FastPass, deepPass as m9DeepPass } from "./transactions";
import { updateListStatus } from "./kernel";
import { withListLock, upsertFourListState, type FourListId, type UpdateSource } from "@/lib/melk-api/four-lists";

export interface LcppCycleResult {
  cycleId: string;
  startedAt: string;
  finishedAt: string;
  phaseA: {
    m1: { fetched: number; written: number; skippedPages: number } | { error: string };
    m2: { fetched: number; written: number; skippedPages: number } | { error: string };
    m9: { fetched: number; written: number; skippedPages: number } | { error: string };
  };
  phaseB: {
    m1: { candidates: number; enriched: number } | { error: string };
    m2: { candidates: number; enriched: number } | { error: string };
    m9: { candidates: number; enriched: number } | { error: string };
  };
  forcedByOwner: boolean;
  ok: boolean;
  errors: string[];
}

/** توکن ARM — نشست زنده → خزانهٔ ماندگار (عین catalog-daemon) */
async function resolveArmToken(db: PrismaClient): Promise<string | null> {
  try {
    const live = await db.session.findFirst({
      where: { revoked: false, expiresAt: { gt: new Date() }, armTokenEnc: { not: null } },
      orderBy: { lastSeenAt: "desc" },
    });
    if (live) {
      const { sessionToArmTokens } = await import("@/lib/auth/session");
      const tokens = sessionToArmTokens(live);
      if (tokens?.accessToken) return tokens.accessToken;
    }
    const vault = await db.armConnection.findFirst({ orderBy: { lastRefreshedAt: "desc" } });
    if (vault?.tokenEnc) {
      const { decryptSecret } = await import("@/lib/auth/crypto");
      const token = decryptSecret(vault.tokenEnc);
      if (token) return token;
    }
  } catch {
    /* صرف‌نظر صادقانه */
  }
  return null;
}

// قفل درون‌فرایندی overlap (عین الگوی catalog-daemon)
let cycleLock = false;

export function lcppCycleRunning(): boolean {
  return cycleLock;
}

export async function runLcppCycle(db: PrismaClient): Promise<LcppCycleResult | null> {
  if (process.env.MELK_LCPP === "disabled") return null;
  if (cycleLock) return null; // چرخهٔ قبلی زنده — رد بی‌صدا
  cycleLock = true;
  // PN-053 (استگر CPU): نخستین چرخهٔ این فرایند با همزمانی ۱ — سرور با آرامش
  // بالا بیاید؛ چرخه‌های بعدی به مقدار عادی (۳) برمی‌گردند. فرمان DIR-PN053 گام ۲-۳.
  const isFirstCycleOfProcess = !firstCycleDone;
  firstCycleDone = true;
  if (isFirstCycleOfProcess) {
    const { setLcppConcurrency } = await import("./kernel");
    setLcppConcurrency(1);
  }
  try {
    return await runLcppCycleInner(db);
  } finally {
    // PN-053: رهاسازی قفل در finally — حتی روی exception قفل هرگز گیر نمی‌کند
    cycleLock = false;
    if (isFirstCycleOfProcess) {
      const { setLcppConcurrency, CONCURRENCY } = await import("./kernel");
      setLcppConcurrency(CONCURRENCY);
    }
  }
}

/** چرخهٔ کامل: فاز A (همهٔ فهرست‌ها · حیاتی‌ها اول) → فاز B (غنی‌سازی M1/M2/M9).
 * ایزوله: هر فهرست در try خودش — خطا فقط در گزارش می‌نشیند.
 *
 * PN-083 (هماهنگ‌ساز چهار فهرست): هر فهرست زیر قفل بین‌فرایندی update:mX اجرا
 * می‌شود (دستی و خودکار هرگز موازی روی یک منبع نمی‌افتند) و وضعیتش در
 * SyncJobState (list-m1..m4) ثبت می‌گردد — همان حقیقتی که تنظیمات و نوار
 * داشبورد نشان می‌دهند. قفلِ دستِ دیگر = پرش صادقانهٔ همان فهرست در این چرخه. */
let firstCycleDone = false;

interface OneListOutcome {
  fast: { fetched: number; written: number; skippedPages: number } | { error: string };
  deep: { candidates: number; enriched: number } | { error: string };
  /** PN-083 — پرش به‌دلیل قفل زندهٔ مسیر دیگر (manual/enrich) */
  lockSkipped?: boolean;
}

async function runOneList(
  db: PrismaClient,
  listId: FourListId,
  lcppListId: string,
  token: string,
  source: UpdateSource,
  fast: (t: string) => Promise<{ fetched: number; written: number; skippedUnchangedPages: number }>,
  deep: (t: string) => Promise<{ candidates: number; enriched: number }>,
): Promise<OneListOutcome> {
  const lock = await withListLock(
    db,
    listId,
    async () => {
      const out: OneListOutcome = { fast: { error: "not-run" }, deep: { error: "not-run" } };
      // ── فاز A — Fast-Pass زیر پوشش وضعیت یکپارچه ──
      await upsertFourListState(db, listId, {
        status: "running", lastCompletedPage: 0, totalPages: 2,
        detail: { source, stage: "fast-pass", at: new Date().toISOString() },
      }).catch(() => undefined);
      try {
        const r = await fast(token);
        out.fast = { fetched: r.fetched, written: r.written, skippedPages: r.skippedUnchangedPages };
      } catch (e) {
        out.fast = { error: String((e as Error)?.message ?? e).slice(0, 150) };
        updateListStatus(lcppListId, { phase: "error", error: out.fast.error });
      }
      await upsertFourListState(db, listId, {
        status: "running", lastCompletedPage: 1, totalPages: 2,
        detail: {
          source, stage: "deep-pass", at: new Date().toISOString(),
          lastWritten: "written" in out.fast ? out.fast.written : 0,
          fast: out.fast,
        },
      }).catch(() => undefined);

      // ── فاز B — Deep-Pass ──
      try {
        const r = await deep(token);
        out.deep = { candidates: r.candidates, enriched: r.enriched };
      } catch (e) {
        out.deep = { error: String((e as Error)?.message ?? e).slice(0, 150) };
      }
      const fastOk = !("error" in out.fast);
      const deepOk = !("error" in out.deep);
      await upsertFourListState(db, listId, {
        status: fastOk ? "done" : "failed",
        lastCompletedPage: 2,
        totalPages: 2,
        detail: {
          source, stage: "done", finishedAt: new Date().toISOString(),
          lastWritten: fastOk ? out.fast.written + (deepOk ? 0 : 0) : 0,
          fast: out.fast, deep: out.deep,
        },
      }).catch(() => undefined);
      return out;
    },
    { metadata: { source, pipeline: "lcpp" } },
  );

  if (!lock.ran) {
    // قفل زندهٔ دیگری (معمولاً بروزرسانی دستی همان فهرست) — پرش صادقانه
    return { fast: { error: `lock-held (${lock.reason ?? "held"})` }, deep: { error: "lock-held" }, lockSkipped: true };
  }
  return lock.result;
}

async function runLcppCycleInner(db: PrismaClient): Promise<LcppCycleResult | null> {
  // (قفل و خاموشی در پوشش runLcppCycle برداشته شد — این تابع فقط زیر پوشش اجرا می‌شود)
  const forced = peekForceRefresh();
  if (forced) clearForceRefresh();
  const cycleId = `lcpp-${Date.now().toString(36)}`;
  markCycleStart(cycleId);

  const startedAt = new Date().toISOString();
  const errors: string[] = [];
  const source: UpdateSource = forced ? "forced" : "auto";
  const token = await resolveArmToken(db);
  if (!token) errors.push("ARM token unavailable — M1/M2/M9 fast/deep skipped this cycle");

  // ═══ فاز A + B — هر فهرست زیر قفل هماهنگ‌ساز PN-083 (حیاتی‌ها اول · فرمان ۸ بند ۳) ═══
  const noTokenOutcome = (what: string): OneListOutcome => ({ fast: { error: `${what} token unavailable` }, deep: { error: `${what} token unavailable` } });
  const r1 = token ? await runOneList(db, "m1", "m1-arm-listings", token, source, m1FastPass, m1DeepPass) : noTokenOutcome("M1");
  if (!r1.lockSkipped && "error" in r1.fast) errors.push(`M1: ${r1.fast.error}`);

  const r2 = token ? await runOneList(db, "m2", "m2-arm-requests", token, source, m2FastPass, m2DeepPass) : noTokenOutcome("M2");
  if (!r2.lockSkipped && "error" in r2.fast) errors.push(`M2: ${r2.fast.error}`);

  const r9 = token ? await runOneList(db, "m3", "m9-transactions", token, source, m9FastPass, m9DeepPass) : noTokenOutcome("M9");
  if (!r9.lockSkipped && "error" in r9.fast) errors.push(`M9: ${r9.fast.error}`);

  if (!token) {
    // ثبت صادقانهٔ بی‌توکنی در وضعیت یکپارچهٔ هر سه فهرست (تنظیمات/داشبورد بگویند چرا)
    for (const id of ["m1", "m2", "m3"] as const) {
      await upsertFourListState(db, id, {
        status: "idle",
        detail: { source, stage: "no-token", error: "توکن ARM در دسترس نیست — چرخه رد شد.", at: new Date().toISOString() },
      }).catch(() => undefined);
    }
  }

  // cycleLock در finally پوشش runLcppCycle رها می‌شود (PN-053)
  const ok = errors.length === 0;
  markCycleEnd(ok ? "done" : "error");

  return {
    cycleId,
    startedAt,
    finishedAt: new Date().toISOString(),
    phaseA: { m1: r1.fast, m2: r2.fast, m9: r9.fast },
    phaseB: { m1: r1.deep, m2: r2.deep, m9: r9.deep },
    forcedByOwner: forced,
    ok,
    errors,
  };
}
