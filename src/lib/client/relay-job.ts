"use client";

/**
 * poll کار async رله — PN-035 (شورا-ن۰۵۷ · فاز ۳+۴ · الگوی Async)
 * ---------------------------------------------------------------------------
 * ریشهٔ مشکل ۳ (دروازهٔ Z.ai بیش از ~۳۰-۶۰ ثانیه صبر نمی‌کند):
 *   اپ POST می‌زد و تا پایان کارِ رله (تا ۹۰ث) روی همان گره HTTP معطل می‌ماند
 *   → 502 دروازه → مالک خطا می‌دید در حالی که پیامک واقعاً ارسال شده بود.
 *
 * الگوی تازه: روت‌های اتصال/ورود فوری {jobId} برمی‌گردانند (< ۱ث)؛ اپ همین
 * فوری رابط کاربری را نشان می‌دهد (Eager UI) و نتیجه را با این poll می‌خواند —
 * هر گره HTTP سبک و کوتاه (< ۱ث)؛ دیگر هیچ گره‌ای طولانی باز نمی‌ماند.
 *
 * قرارداد سرور (GET /api/relay/job/{id}):
 *   { ok, job: { status: queued|running|done|failed|consumed, result?, error? }, secret? }
 *   · result — JSON غیرحساس (پیام موفقیت/alreadySent و…)
 *   · secret — نتیجهٔ حساس (توکن نشست ورود)؛ رمز‌شده در DB و «یک‌بارمصرف»:
 *     در نخستین polling موفق باز و تحویل می‌شود؛ سپس کار consumed می‌شود.
 *     اگر polling دوباره بخواند و secret نرسد یعنی نشستِ همین کد قبلاً تحویل
 *     شده است — کاربر باید کد تازه بگیرد.
 */

import { api, ApiClientError } from "@/lib/client/api";

export type RelayJobKind = "done" | "failed" | "expired";

export interface RelayJobPollResult<T = Record<string, unknown>> {
  ok: boolean;
  kind: RelayJobKind;
  /** نتیجهٔ غیرحساس کار (resultJson) — پیام موفقیت و… */
  result?: T | null;
  /** نتیجهٔ حساس (یک‌بارمصرف) — فقط جریان ورود (verify-otp) */
  secret?: Record<string, unknown> | null;
  error?: { code: string; message: string };
}

export interface PollRelayJobOptions {
  /** تعداد تلاش — پیش‌فرض ۴۵ (سنجهٔ فاز ۴: ۳۰×۱s پایه + حاشیهٔ اطمینان) */
  attempts?: number;
  /** فاصلهٔ بین تلاش‌ها — پیش‌فرض ۱ ثانیه */
  intervalMs?: number;
  /** نشست‌دار؟ (کارهای arm/pm اتصال = true · جریان ورود = false) */
  auth?: boolean;
}

/**
 * poll کار تا تعیین تکلیف (done/failed/انقضای تلاش‌ها).
 * هر گره ≤ ۵ ثانیه مهلت — خطای گذرای شبکه بی‌صدا دوباره تلاش می‌شود.
 */
export async function pollRelayJob<T = Record<string, unknown>>(
  jobId: string,
  opts: PollRelayJobOptions = {}
): Promise<RelayJobPollResult<T>> {
  const attempts = opts.attempts ?? 45;
  const intervalMs = opts.intervalMs ?? 1000;
  let lastError: { code: string; message: string } | null = null;

  for (let i = 0; i < attempts; i++) {
    try {
      const data = await api<{ ok: boolean; job?: { status?: string; result?: T | null; error?: { code?: string; message?: string } | null }; secret?: Record<string, unknown> | null }>(
        `/api/relay/job/${encodeURIComponent(jobId)}`,
        { auth: opts.auth ?? true, timeoutMs: 5000 }
      );
      const job = data?.job;
      const status = job?.status;
      if (status === "done" || status === "consumed") {
        // consumed = رازِ حساس قبلاً تحویل شده (poll نخست) — result غیرحساس همچنان خواناست
        return { ok: true, kind: "done", result: (job?.result ?? null) ?? null, secret: data?.secret ?? null };
      }
      if (status === "failed") {
        return {
          ok: false,
          kind: "failed",
          error: {
            code: job?.error?.code ?? "UNKNOWN",
            message: job?.error?.message ?? "عملیات ناموفق بود.",
          },
        };
      }
      // queued/running — ادامهٔ poll
    } catch (err) {
      const e = err as ApiClientError;
      if (e.status === 404) {
        return { ok: false, kind: "expired", error: { code: "JOB_GONE", message: "کار پیگیری منقضی شده است — دوباره تلاش کنید." } };
      }
      if (e.status === 403) {
        return { ok: false, kind: "expired", error: { code: "JOB_FOREIGN", message: "کار پیگیری متعلق به این نشست نیست." } };
      }
      // خطای گذرا (شبکه/دروازه) — تلاش بعدی
      lastError = { code: e.code, message: e.message };
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, intervalMs));
  }
  return {
    ok: false,
    kind: "expired",
    error: lastError ?? { code: "JOB_TIMEOUT", message: "پاسخ عملیات بیش از حد انتظار طول کشید — دوباره تلاش کنید." },
  };
}

/**
 * فرم پاسخ async روت‌های اتصال/ورود (فاز ۳):
 * { ok: true, jobId, status: "queued", pollMs } — پاسخ سنک قدیم {message} هم
 * برای سازگاری عقبه پذیرفته می‌شود (سرور نسل قبل).
 */
export interface AsyncJobResponse {
  ok: boolean;
  jobId?: string;
  status?: string;
  pollMs?: number;
  message?: string;
  alreadySent?: boolean;
}
