/**
 * فیوز قطع‌کنندهٔ اتصال خارجی — PN-029 (مرحلهٔ ۶ سند شورا-ن۰۳۳)
 * ---------------------------------------------------------------------------
 * قانون Retry هوشمند مصوب:
 *   · حداکثر یک تلاش در هر ۶ ساعت برای هر میزبان خارجی
 *   · Backoff پله‌ای: ۶ ساعت → ۱۲ ساعت → ۲۴ ساعت
 *   · Circuit Breaker: ۳ شکست پیاپی ⇒ قفل سخت ۲۴ ساعته (صفر تلاش)
 *
 * ⚠️ PN-049 (دستور شورا ۱۴۰۵/۰۸/۰۱ — «لغو هرگونه محدودیت ورود به حساب pm و
 *    arm»): قانون Retry هوشمند PN-029 برای «مسیرهای ورود» (authentication/*
 *    — ارسال/تأیید پیامک PM و ARM) برای همیشه لغو شد. مسیرهای ورود هرگز
 *    توسط فیوز مسدود نمی‌شوند و شکست‌های ورود هرگز شمارندهٔ فیوز را نمی‌بارند
 *    (سهمیهٔ سمت خود ملک تبریز همچنان بیرون از حاکمیت ماست). فیوز فقط برای
 *    مسیرهای «داده/هماهنگ‌سازی» به‌عنوان سپر پایداری باقی می‌ماند.
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

// ─────────────── PN-041-R (شورا-ن۰۶۸ · فاز ۲·بند ۲.۳) ───────────────
// مستثنی‌سازی مسیرهای رله از فیوز: روتهای داخلی رله (/api/mobile-relay/*
// /api/relay/* /api/admin/relay/*) هرگز خودشان «میزبان خارجی» نیستند؛ اما
// شکستهای رله‌محور (رلهٔ قطع → armCall ناکام) نباید فیوز میزبان ARM را
// ببارند و بعداً مسیر تازه‌واردهٔ رله را قفل کنند. سه لایه:
//   ۱) shouldBypassCircuit(path) — داوری خالص مسیر (تست‌پذیر)
//   ۲) رلهٔ آفلاین ⇒ شکستهای بعدی ثبت نمی‌شوند (انتظار صریح، نه خطای سرور)
//   ۳) رلهٔ برگشته ⇒ قفل بستهٔ قبلی نادیده گرفته می‌شود (auto-reset در armCall)

/** پیشوندهای مسیرهای داخلی رله — هرگز شامل شمارش/قفل فیوز نمی‌شوند */
export const RELAY_ROUTE_PREFIXES: readonly string[] = [
  "/api/mobile-relay/",
  "/api/relay/",
  "/api/admin/relay/",
];

/** PN-049 (دستور شورا ۱۴۰۵/۰۸/۰۱) — پیشوندهای مسیرهای «ورود» به حساب PM/ARM:
 *  قانون Retry هوشمند PN-029 برای ورود لغو شد؛ این مسیرها هرگز مسدود
 *  نمی‌شوند و شکست‌شان فیوز را نمی‌بارد (ارسال/تأیید پیامک · تمدید توکن).
 *  هر دو سامانهٔ ARM و PM همین پیشوند را دارند (endpoints.ts). */
export const AUTH_PATH_PREFIXES: readonly string[] = ["authentication/"];

/** داوری خالص: آیا این مسیر مسیر داخلی رله است؟ (فیوز اعمال نمی‌شود) */
export function shouldBypassCircuit(path: string): boolean {
  return RELAY_ROUTE_PREFIXES.some((r) => path.startsWith(r));
}

/** PN-049 — داوری خالص: آیا این مسیر مسیر «ورود» است؟ (فیوز لغو‌شده — قانون شورا) */
export function isAuthPath(path: string | undefined | null): boolean {
  if (!path) return false;
  return AUTH_PATH_PREFIXES.some((r) => path.startsWith(r));
}

async function relayDeviceOnline(): Promise<boolean | null> {
  try {
    const mod = (await import("./relay")) as {
      relayModeActive?: () => boolean;
      anyRelayDeviceOnline?: () => Promise<boolean>;
    };
    if (typeof mod.relayModeActive === "function" && !mod.relayModeActive()) return null; // \u062d\u0627\u0644\u062a \u063a\u06cc\u0631\u0631\u0644\u0647
    if (typeof mod.anyRelayDeviceOnline === "function") return !!(await mod.anyRelayDeviceOnline());
  } catch {
    /* \u0628\u0647\u062a\u0631\u06cc\u0646-\u062a\u0644\u0627\u0634 */
  }
  return null;
}

/** \u0634\u06a9\u0633\u062a\u0650 \u0639\u0635\u0631\u0650 \u0631\u0644\u0647\u0654 \u0642\u0637\u0639 \u0642\u0627\u0628\u0644 \u0627\u0646\u062a\u0638\u0627\u0631 \u0627\u0633\u062a \u2014 \u0646\u062b\u0628\u062a (\u0641\u0642\u0637 \u062f\u0631 \u062d\u0627\u0644\u062a \u0631\u0644\u0647) */
async function isRelayOfflineForBreaker(): Promise<boolean> {
  return (await relayDeviceOnline()) === false;
}

/** \u0631\u0644\u0647 \u0647\u0645\u06cc\u0646 \u062d\u0627\u0644\u0627 \u0648\u0635\u0644 \u0627\u0633\u062a\u061f (\u0641\u0642\u0637 \u062f\u0631 \u062d\u0627\u0644\u062a \u0631\u0644\u0647 \u2014 true \u0642\u0637\u0639\u06cc) */
async function isRelayOnlineNow(): Promise<boolean> {
  return (await relayDeviceOnline()) === true;
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

/** بررسی درگاه پیش از فراخوانی — هرگز به‌خاطر DB نمی‌بندد
 *  PN-041-R (بند ۲.۳): اگر رله همین حالا برخط است، قفل/خنک‌سازِ برخاسته از
 *  عصرِ رلهٔ قطع نادیده گرفته می‌شود (مسیر تازه دوباره زنده — پیروزی مالک). */
export async function checkCircuit(target: string, opts?: { path?: string }): Promise<BreakerGateResult> {
  if (!isCircuitBreakerEnabled()) return { allowed: true, retryInMs: -1, snapshot: null };
  // PN-049 (دستور شورا): مسیرهای ورود (authentication/*) هرگز مسدود نمی‌شوند —
  // لغو کامل قانون Retry هوشمند PN-029 برای ورود به حساب PM و ARM.
  if (opts?.path && isAuthPath(opts.path)) return { allowed: true, retryInMs: -1, snapshot: null };
  if (opts?.path && shouldBypassCircuit(opts.path)) return { allowed: true, retryInMs: -1, snapshot: null };
  const snapshot = await getBreakerSnapshot(target);
  const gate = breakerGate(snapshot);
  if (!gate.allowed && (await isRelayOnlineNow())) {
    // رله برخط است اما فیوز بسته — قفل از دوران رلهٔ قطع مانده؛ عبور + ریست
    return { allowed: true, retryInMs: -1, snapshot };
  }
  return gate;
}

/** ثبت یک شکست (پس از اتمام تلاشهای درونی armCall) — بهترین‌تلاش
 *  PN-041-R: شکستِ «عصرِ رلهٔ آفلاین» ثبت نمی‌شود — رلهٔ قطع یعنی صف خاموش
 *  است، نه اینکه سرور ARM سوخته باشد. قفل ۲۴ساعتهٔ برخاسته از قطع رله،
 *  به‌محض وصل رله مسیر را می‌بست — ریشهٔ شکایت مالک (شورا-ن۰۶۸ بند ۲.۳). */
export async function recordBreakerFailure(target: string): Promise<void> {
  if (!isCircuitBreakerEnabled()) return;
  if (await isRelayOfflineForBreaker()) return; // رلهٔ قطع = شکست قابل انتظار — نثبت
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
