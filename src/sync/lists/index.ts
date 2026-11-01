/**
 * index.ts — PN-051 — ارکستراتور خط‌لوله‌های فهرست (LCPP Orchestrator)
 * ---------------------------------------------------------------------------
 * فرمان ۴: «فاز A همهٔ فهرست‌ها (ستون‌های حیاتی ≤۱ دقیقه) → سپس فاز B (جزئیات)»
 * فرمان ۳: List-Centric — خطای هر فهرست هرگز چرخه را نمی‌ایستاند (جزیره‌بندی).
 * اولویت (فرمان ۸ بند ۳): criticalها اول — M1 (آگهی) · M2 (درخواست) · M9 (معاملات)
 * سپس M7/M8 (ملکتون — وابسته به اتصال CRM).
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
export { LIST_ID as M7_LIST_ID, fastPass as m7FastPass } from "./melketun-listings";
export { LIST_ID as M8_LIST_ID, fastPass as m8FastPass } from "./melketun-requests";
export { LIST_ID as M9_LIST_ID, fastPass as m9FastPass, deepPass as m9DeepPass, probeMelketunDeals } from "./transactions";

import { fastPass as m1FastPass, deepPass as m1DeepPass } from "./arm-listings";
import { fastPass as m2FastPass, deepPass as m2DeepPass } from "./arm-requests";
import { fastPass as m7FastPass } from "./melketun-listings";
import { fastPass as m8FastPass } from "./melketun-requests";
import { fastPass as m9FastPass, deepPass as m9DeepPass, probeMelketunDeals } from "./transactions";
import { updateListStatus } from "./kernel";

export interface LcppCycleResult {
  cycleId: string;
  startedAt: string;
  finishedAt: string;
  phaseA: {
    m1: { fetched: number; written: number; skippedPages: number } | { error: string };
    m2: { fetched: number; written: number; skippedPages: number } | { error: string };
    m9: { fetched: number; written: number; skippedPages: number } | { error: string };
    m7: { fetched: number; upserted: number; skippedUnchanged: boolean } | { error: string };
    m8: { fetched: number; upserted: number; skippedUnchanged: boolean } | { error: string };
  };
  phaseB: {
    m1: { candidates: number; enriched: number } | { error: string };
    m2: { candidates: number; enriched: number } | { error: string };
    m9: { candidates: number; enriched: number } | { error: string };
  };
  melketunDealsProbe?: { totalRows: number; routes: number };
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

/**
 * چرخهٔ کامل: فاز A (همهٔ فهرست‌ها · حیاتی‌ها اول) → فاز B (غنی‌سازی M1/M2/M9).
 * ایزوله: هر فهرست در try خودش — خطا فقط در گزارش می‌نشیند.
 */
export async function runLcppCycle(db: PrismaClient): Promise<LcppCycleResult | null> {
  if (process.env.MELK_LCPP === "disabled") return null;
  if (cycleLock) return null; // چرخهٔ قبلی زنده — رد بی‌صدا
  cycleLock = true;
  const forced = peekForceRefresh();
  if (forced) clearForceRefresh();
  const cycleId = `lcpp-${Date.now().toString(36)}`;
  markCycleStart(cycleId);

  const startedAt = new Date().toISOString();
  const errors: string[] = [];
  const token = await resolveArmToken(db);
  if (!token) errors.push("ARM token unavailable — M1/M2/M9 fast/deep skipped this cycle");

  // ═══ فاز A — Fast-Pass (فرمان ۴): همهٔ حیاتی‌ها اول ═══
  let m1: LcppCycleResult["phaseA"]["m1"] = { error: "token unavailable" };
  let m2: LcppCycleResult["phaseA"]["m2"] = { error: "token unavailable" };
  let m9: LcppCycleResult["phaseA"]["m9"] = { error: "token unavailable" };

  if (token) {
    try {
      const r = await m1FastPass(token);
      m1 = { fetched: r.fetched, written: r.written, skippedPages: r.skippedUnchangedPages };
    } catch (e) {
      m1 = { error: String((e as Error)?.message ?? e).slice(0, 150) };
      errors.push(`M1: ${m1.error}`);
      updateListStatus("m1-arm-listings", { phase: "error", error: m1.error });
    }
    try {
      const r = await m2FastPass(token);
      m2 = { fetched: r.fetched, written: r.written, skippedPages: r.skippedUnchangedPages };
    } catch (e) {
      m2 = { error: String((e as Error)?.message ?? e).slice(0, 150) };
      errors.push(`M2: ${m2.error}`);
      updateListStatus("m2-arm-requests", { phase: "error", error: m2.error });
    }
    try {
      const r = await m9FastPass(token);
      m9 = { fetched: r.fetched, written: r.written, skippedPages: r.skippedUnchangedPages };
    } catch (e) {
      m9 = { error: String((e as Error)?.message ?? e).slice(0, 150) };
      errors.push(`M9: ${m9.error}`);
      updateListStatus("m9-transactions", { phase: "error", error: m9.error });
    }
  }

  // ملکتون — مستقل از توکن ARM (نشست CRM خودش)
  let m7: LcppCycleResult["phaseA"]["m7"];
  try {
    const r = await m7FastPass();
    m7 = { fetched: r.fetched, upserted: r.upserted, skippedUnchanged: r.skippedUnchanged };
  } catch (e) {
    m7 = { error: String((e as Error)?.message ?? e).slice(0, 150) };
    errors.push(`M7: ${m7.error}`);
    updateListStatus("m7-melketun-listings", { phase: "error", error: m7.error });
  }
  let m8: LcppCycleResult["phaseA"]["m8"];
  try {
    const r = await m8FastPass();
    m8 = { fetched: r.fetched, upserted: r.upserted, skippedUnchanged: r.skippedUnchanged };
  } catch (e) {
    m8 = { error: String((e as Error)?.message ?? e).slice(0, 150) };
    errors.push(`M8: ${m8.error}`);
    updateListStatus("m8-melketun-requests", { phase: "error", error: m8.error });
  }

  // ═══ فاز B — Deep-Pass (فرمان ۴): تکمیل جزئیات ═══
  let b1: LcppCycleResult["phaseB"]["m1"] = { error: "token unavailable" };
  let b2: LcppCycleResult["phaseB"]["m2"] = { error: "token unavailable" };
  let b9: LcppCycleResult["phaseB"]["m9"] = { error: "token unavailable" };
  if (token) {
    try {
      const r = await m1DeepPass(token);
      b1 = { candidates: r.candidates, enriched: r.enriched };
    } catch (e) {
      b1 = { error: String((e as Error)?.message ?? e).slice(0, 150) };
      errors.push(`M1-deep: ${b1.error}`);
    }
    try {
      const r = await m2DeepPass(token);
      b2 = { candidates: r.candidates, enriched: r.enriched };
    } catch (e) {
      b2 = { error: String((e as Error)?.message ?? e).slice(0, 150) };
      errors.push(`M2-deep: ${b2.error}`);
    }
    try {
      const r = await m9DeepPass(token);
      b9 = { candidates: r.candidates, enriched: r.enriched };
    } catch (e) {
      b9 = { error: String((e as Error)?.message ?? e).slice(0, 150) };
      errors.push(`M9-deep: ${b9.error}`);
    }
  }

  // کاوش معاملات ملکتون (فرمان ۶) — بهترین-تلاش، هرگز چرخه را نمی‌شکند
  let melketunDealsProbe: LcppCycleResult["melketunDealsProbe"];
  try {
    const probe = await probeMelketunDeals();
    melketunDealsProbe = { totalRows: probe.totalRows, routes: probe.routes.length };
  } catch (e) {
    errors.push(`M9-probe: ${String(e).slice(0, 120)}`);
  }

  cycleLock = false;
  const ok = errors.length === 0;
  markCycleEnd(ok ? "done" : "error");

  return {
    cycleId,
    startedAt,
    finishedAt: new Date().toISOString(),
    phaseA: { m1, m2, m9, m7, m8 },
    phaseB: { m1: b1, m2: b2, m9: b9 },
    melketunDealsProbe,
    forcedByOwner: forced,
    ok,
    errors,
  };
}
