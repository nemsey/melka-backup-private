/**
 * فیوز قطع‌کنندهٔ اتصال خارجی — PN-029 (مرحلهٔ ۶ سند شورا-ن۰۳۳)
 * ---------------------------------------------------------------------------
 * قانون Retry هوشمند مصوب:
 *   · حداکثر یک تلاش در هر ۶ ساعت برای هر میزبان خارجی
 *   · Backoff پله‌ای: ۶ ساعت → ۱۲ ساعت → ۲۴ ساعت
 *   · Circuit Breaker: ۳ شکست پیاپی ⇒ قفل سخت ۲۴ ساعته (صفر تلاش)
 *
 * دامنهٔ شمارش: فقط خطاهای «سمت سرور/شبکه» (۵xx · DB_DOWN · TIMEOUT ·
 * NETWORK_ERROR · RATE_LIMITED). پاسخ‌های دقیق ۴xx (401/412/OTP_INVALID)
 * شکستِ فیوز محسوب نمی‌شوند — سامانه پاسخ می‌دهد؛ مشکل دست ما نیست.
 *
 * همهٔ عملیات DB «fail-open»اند: خطای پایگاه داده هرگز مسیر اصلی را
 * نمی‌بندد (فیوز خودش عامل قطع خدمت نشود).
 */

import type { PrismaClient } from "@prisma/client";
import { MelkApiError } from "./types";

/** Backoff پله‌ای مصوب (ساعت) — اندیس = شکستهای پیاپی منهای ۱ */
export const BREAKER_BACKOFF_HOURS = [6, 12, 24] as const;
/** قفل سخت پس از ۳ شکست پیاپی (ساعت) */
export const BREAKER_LOCK_HOURS = 24;
/** آستانهٔ فعال‌سازی قفل سخت (شکست پیاپی) */
export const BREAKER_TRIP_THRESHOLD = 3;

export interface BreakerSnapshot {
  target: string;
  consecutiveFailures: number;
  lastFailureAt: Date | null;
  lastSuccessAt: Date | null;
  nextAttemptAt: Date | null;
  lockUntil: Date | null;
}

export interface BreakerGateResult {
  allowed: boolean;
  reason?: "cooldown" | "locked";
  /** میلی‌ثانیه تا بازشدن درگاه (منفی = باز است) */
  retryInMs: number;
  snapshot: BreakerSnapshot | null;
}

// ────────────────────────── توابع خالص (تست‌پذیر) ──────────────────────────

/** کلید فیوز از baseUrl — فقط نام میزبان (port هم حفظ می‌شود) */
export function breakerKeyFromBaseUrl(baseUrl: string): string {
  try {
    const u = new URL(baseUrl.includes("://") ? baseUrl : `https://${baseUrl}`);
    return u.host;
  } catch {
    return baseUrl.replace(/^https?:\/\//, "").split("/")[0] || "unknown";
  }
}

/** زمان تلاش مجوز بعدی بر اساس شمار شکستهای پیاپی (۶س/۱۲س/۲۴س) — خالص */
export function computeNextAttemptAt(consecutiveFailures: number, now: Date = new Date()): Date {
  const idx = Math.max(1, consecutiveFailures); // شکست اول ⇒ ۶ ساعت
  const hours = BREAKER_BACKOFF_HOURS[Math.min(idx, BREAKER_BACKOFF_HOURS.length) - 1];
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

/** داوری درگاه — خالص و بدون DB */
export function breakerGate(snapshot: BreakerSnapshot | null, now: Date = new Date()): BreakerGateResult {
  if (!snapshot) return { allowed: true, retryInMs: -1, snapshot: null };
  if (snapshot.lockUntil && snapshot.lockUntil > now) {
    return {
      allowed: false,
      reason: "locked",
      retryInMs: snapshot.lockUntil.getTime() - now.getTime(),
      snapshot,
    };
  }
  if (snapshot.nextAttemptAt && snapshot.nextAttemptAt > now) {
    return {
      allowed: false,
      reason: "cooldown",
      retryInMs: snapshot.nextAttemptAt.getTime() - now.getTime(),
      snapshot,
    };
  }
  return { allowed: true, retryInMs: -1, snapshot };
}

/** وضعیت تازه پس از یک شکست — خالص (قانون ۳ شکست ⇒ قفل ۲۴س) */
export function breakerAfterFailure(snapshot: BreakerSnapshot | null, now: Date = new Date()): Required<Pick<BreakerSnapshot, "consecutiveFailures" | "nextAttemptAt" | "lockUntil">> {
  const consecutive = (snapshot?.consecutiveFailures ?? 0) + 1;
  const shouldLock = consecutive >= BREAKER_TRIP_THRESHOLD;
  return {
    consecutiveFailures: consecutive,
    nextAttemptAt: shouldLock ? new Date(now.getTime() + BREAKER_LOCK_HOURS * 60 * 60 * 1000) : computeNextAttemptAt(consecutive, now),
    lockUntil: shouldLock ? new Date(now.getTime() + BREAKER_LOCK_HOURS * 60 * 60 * 1000) : null,
  };
}

/** آیا این خطا «شکست فیوز» است؟ (سمت سرور/شبکه — نه پاسخ دقیق ۴xx) */
export function isBreakerFailure(err: MelkApiError): boolean {
  if (err.code === "RATE_LIMITED") return true; // محدودیت نرخ = علامت کوبیدن درِ سامانه
  return err.retryable === true; // DB_DOWN · SERVER_ERROR · TIMEOUT · NETWORK_ERROR
}

/** قالب‌بندی فارسی زمان باقی‌مانده («۵ ساعت و ۲۳ دقیقه») */
export function formatRemainingMs(ms: number): string {
  if (ms <= 0) return "هم‌اکنون";
  const totalMin = Math.ceil(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const fa = (n: number): string => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
  if (h > 0 && m > 0) return `${fa(h)} ساعت و ${fa(m)} دقیقه`;
  if (h > 0) return `${fa(h)} ساعت`;
  return `${fa(m)} دقیقه`;
}

// ────────────────────────── عملیات DB (fail-open) ──────────────────────────

/**
 * فیوز در محیط تست چگونه رفتار کند؟
 * NODE_ENV=test ⇒ خاموشِ پیش‌فرض (بدون آلودگی بین فایلهای تست — ریشهٔ شکست
 * زنجیره‌ای B.1 در اجرای کامل: تستهای مسیر-شکستِ فایلهای زودتر، میزبانهای
 * واقعی را برای فایلهای بعدی قفل می‌کردند). روشن‌کردن صریح برای خودِ تستهای
 * فیوز: MELK_CIRCUIT_BREAKER=on (تست B-5 همین کار را می‌کند).
 * production/development همیشه فعال است.
 *
 * PN-033 (شورا-ن۰۵۴ · ۱۴۰۵/۰۷/۲۶): MELK_ARM_CIRCUIT_DISABLED=1 ⇒ خاموشی
 * دائمی. فیوز از دوران «بدون راه» مانده بود — سه شکست پیاپیِ دوران تلاشهای
 * مسدود، قفل ۲۴ ساعتهٔ سخت انداخته بود و مسیرِ زندهٔ Termux را می‌بست.
 * قواعد backoff در کد پابرجاست؛ فقط با برداشتن این پرچم از env، فیوز
 * «مهار» می‌شود نه «حذف» — یک‌لایه محافظت باقی می‌ماند برای آینده.
 */
export function isCircuitBreakerEnabled(): boolean {
  // روشن‌کردن صریحِ تست همیشه اولویت دارد (روت‌وبرگشت B-5) — حتی اگر خاموشی
  // دائمی ن۰۵۴ از env.platform.json به محیط تست نشت کرده باشد
  if (process.env.NODE_ENV === "test" && process.env.MELK_CIRCUIT_BREAKER === "on") return true;
  // PN-033 (شورا-ن۰۵۴): خاموشی دائمی فیوز — قفلِ دوران جنگ دیگر مانعِ مسیرِ باز نیست
  if (process.env.MELK_ARM_CIRCUIT_DISABLED === "1") return false;
  if (process.env.NODE_ENV === "test") return false;
  return true;
}

type DbLike = { circuitBreakerState: Pick<PrismaClient["circuitBreakerState"], "findUnique" | "upsert"> };

let cachedDb: DbLike | null = null;

async function getDb(): Promise<DbLike | null> {
  if (cachedDb) return cachedDb;
  try {
    const { db } = await import("@/lib/db");
    cachedDb = db as unknown as DbLike;
    return cachedDb;
  } catch {
    return null; // fail-open
  }
}

/** خواندن وضعیت فیوز یک میزبان — خطای DB = null (درگاه باز) */
export async function getBreakerSnapshot(target: string): Promise<BreakerSnapshot | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    const row = await db.circuitBreakerState.findUnique({ where: { target } });
    if (!row) return null;
    return {
      target: row.target,
      consecutiveFailures: row.consecutiveFailures,
      lastFailureAt: row.lastFailureAt,
      lastSuccessAt: row.lastSuccessAt,
      nextAttemptAt: row.nextAttemptAt,
      lockUntil: row.lockUntil,
    };
  } catch {
    return null; // fail-open
  }
}

/** بررسی درگاه پیش از فراخوانی — هرگز به‌خاطر DB نمی‌بندد */
export async function checkCircuit(target: string): Promise<BreakerGateResult> {
  if (!isCircuitBreakerEnabled()) return { allowed: true, retryInMs: -1, snapshot: null };
  const snapshot = await getBreakerSnapshot(target);
  return breakerGate(snapshot);
}

/** ثبت یک شکست (پس از اتمام تلاشهای درونی armCall) — بهترین‌تلاش */
export async function recordBreakerFailure(target: string): Promise<void> {
  if (!isCircuitBreakerEnabled()) return;
  try {
    const db = await getDb();
    if (!db) return;
    const current = await getBreakerSnapshot(target);
    const next = breakerAfterFailure(current);
    const now = new Date();
    await db.circuitBreakerState.upsert({
      where: { target },
      create: {
        target,
        consecutiveFailures: next.consecutiveFailures,
        totalFailures: 1,
        lastFailureAt: now,
        nextAttemptAt: next.nextAttemptAt,
        lockUntil: next.lockUntil,
      },
      update: {
        consecutiveFailures: next.consecutiveFailures,
        totalFailures: { increment: 1 } as unknown as number,
        lastFailureAt: now,
        nextAttemptAt: next.nextAttemptAt,
        lockUntil: next.lockUntil,
      },
    });
  } catch {
    // fail-open — ثبت نشدن شاهد هرگز مسیر اصلی را نمی‌شکند
  }
}

/** ثبت یک موفقیت — بازنشانی کامل شمارش پیاپی */
export async function recordBreakerSuccess(target: string): Promise<void> {
  if (!isCircuitBreakerEnabled()) return;
  try {
    const db = await getDb();
    if (!db) return;
    const now = new Date();
    await db.circuitBreakerState.upsert({
      where: { target },
      create: {
        target,
        consecutiveFailures: 0,
        totalSuccesses: 1,
        lastSuccessAt: now,
        nextAttemptAt: null,
        lockUntil: null,
      },
      update: {
        consecutiveFailures: 0,
        totalSuccesses: { increment: 1 } as unknown as number,
        lastSuccessAt: now,
        nextAttemptAt: null,
        lockUntil: null,
      },
    });
  } catch {
    // fail-open
  }
}

/** خطای استاندارد درگاه بسته — با زمان دقیق باقی‌مانده (L6: خطای دقیق برای مالک) */
export function circuitLockedError(gate: BreakerGateResult): MelkApiError {
  const wait = formatRemainingMs(gate.retryInMs);
  const kind = gate.reason === "locked" ? "قفل سخت ۲۴ ساعتهٔ فیوز" : "خنک‌ساز تلاش مجدد";
  return new MelkApiError(
    "CIRCUIT_COOLDOWN",
    `${kind} فعال است: تلاش بعدی تا ${wait} دیگر مجاز است (قانون Retry هوشمند PN-029 — یک تلاش در ۶ ساعت).`,
    503,
    false
  );
}
