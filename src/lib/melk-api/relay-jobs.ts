/**
 * کارهای async رله — PN-035 (شورا-ن۰۵۷ · فاز ۳ · الگوی Async)
 * ---------------------------------------------------------------------------
 * ریشهٔ مشکل ۳ (دروازهٔ Z.ai بیش از ~۳۰-۶۰ ثانیه صبر نمی‌کند):
 *   اپ → POST /api/arm/connection (start-otp) → سرور تا ۹۰ ثانیه روی
 *   relayFetch معطل می‌ماند → دروازهٔ 502 → مالک خطا می‌بیند در حالی که
 *   پیامک واقعاً ارسال شده بود.
 *
 * الگوی تازه (سنک → async):
 *   اپ → POST (فوری < ۱ ثانیه) → { jobId } «شمارهٔ پیگیری»
 *   سرور → کار طولانی رله در پس‌زمینهٔ فرایند (بدون گره HTTP باز)
 *   اپ → GET /api/relay/job/{id} هر ۱ ثانیه → pending → done/failed
 *
 * چرخهٔ عمر: queued → running → done | failed (→ consumed برای نتایج حساس)
 *
 * امنیت:
 *   · jobId = cuid (۲۵ کاراکتر تصادفی) — قابلیتِ نانقض‌قابل‌حدس؛ برای کارهای
 *     بدون نشست (ورود) همین شناسه کلید دسترسی است.
 *   · کارهای نشست‌دار (arm/pm connection): jobId فقط با نشستِ صاحبش خوانده می‌شود.
 *   · نتیجهٔ حساس (توکن نشست ورود) فقط رمز‌شده (AES-256-GCM · MELK_TOKEN_KEY)
 *     در resultEnc می‌نشیند و «یک‌بار» در نخستین polling موفق باز و تحویل
 *     می‌شود؛ سپس consumedAt آن را برای همیشه می‌بندد (توکن خام هرگز در DB نمی‌ماند).
 *   · پاک‌سازی خودکار کارهای منقضی (expiresAt ~ ۱۰ دقیقه) در هر ایجاد کار.
 */

import { db } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/auth/crypto";
import { MelkApiError } from "./types";

/** عمر مفید کار (میلی‌ثانیه) — اپ بیش از این poll نمی‌کند */
export const RELAY_JOB_TTL_MS = 10 * 60 * 1000;

export type RelayJobStatus = "queued" | "running" | "done" | "failed" | "consumed";

export interface StartRelayJobOptions {
  /** نوع کار — مثلاً auth-start-otp | arm-verify | pm-start-otp */
  type: string;
  /** نشست صاحب کار (کارهای نشست‌دار) — خالی برای جریان ورود */
  sessionId?: string | null;
  personnelCode?: string | null;
  /** ورودی کار (JSON بدون راز — فقط برای عیب‌یابی) */
  payload?: Record<string, unknown>;
  /**
   * اجرای واقعی کار — در پس‌زمینه صدا می‌شود؛ خروجی:
   *   · result (JSON غیرحساس) → status=done + resultJson
   *   · resultSecret (شیء حساس) → status=done + resultEnc (رمز‌شده)
   *   · پرتاب MelkApiError → status=failed + errorCode/message/httpStatus
   */
  run: () => Promise<{ result?: Record<string, unknown>; resultSecret?: Record<string, unknown> }>;
}

export interface RelayJobView {
  id: string;
  type: string;
  status: RelayJobStatus;
  personnelCode?: string | null;
  createdAt: string;
  expiresAt: string;
  result?: Record<string, unknown> | null;
  error?: { code: string; message: string; httpStatus: number } | null;
}

/** ایجاد کار + شروع اجرای پس‌زمینه — فوری برمی‌گردد (بدون انتظار) */
export async function startRelayJob(opts: StartRelayJobOptions): Promise<{ id: string }> {
  // پاک‌سازی سبک: کارهای منقضی قدیمی (سقف حذف در هر بار — خانه‌تکانی تدریجی)
  await db.relayJob
    .deleteMany({ where: { expiresAt: { lt: new Date() } } })
    .catch(() => undefined);

  const job = await db.relayJob.create({
    data: {
      type: opts.type,
      sessionId: opts.sessionId ?? null,
      personnelCode: opts.personnelCode ?? null,
      payloadJson: opts.payload ? JSON.stringify(opts.payload) : null,
      status: "running",
      expiresAt: new Date(Date.now() + RELAY_JOB_TTL_MS),
    },
  });

  // اجرای پس‌زمینه — گره HTTP بسته می‌شود؛ کار در فرایند سرور ادامه دارد
  void (async () => {
    try {
      const out = await opts.run();
      await db.relayJob.update({
        where: { id: job.id },
        data: {
          status: "done",
          resultJson: out.result ? JSON.stringify(out.result) : null,
          resultEnc: out.resultSecret ? encryptSecret(JSON.stringify(out.resultSecret)) : null,
        },
      });
    } catch (err) {
      const e = err instanceof MelkApiError ? err : null;
      await db.relayJob
        .update({
          where: { id: job.id },
          data: {
            status: "failed",
            error: (err as Error)?.message?.slice(0, 400) ?? "خطای نامشخص",
            errorCode: e?.code ?? "UNKNOWN",
            httpStatus: e?.httpStatus ?? 502,
          },
        })
        .catch(() => undefined);
    }
  })();

  return { id: job.id };
}

/** نمای امن کار برای اپ (بدون راز) — حساس: resultEnc فقط یک‌بار باز می‌شود */
export async function getRelayJobForClient(
  jobId: string,
  session?: { sessionId: string } | null
): Promise<{ ok: boolean; status: number; job?: RelayJobView; secret?: Record<string, unknown> | null; error?: string }> {
  const job = await db.relayJob.findUnique({ where: { id: jobId } });
  if (!job) return { ok: false, status: 404, error: "no such job" };
  // کار نشست‌دار فقط با نشستِ خودش (قابلیت + مالکیت)
  if (job.sessionId && session && job.sessionId !== session.sessionId) {
    return { ok: false, status: 403, error: "job belongs to another session" };
  }

  const view: RelayJobView = {
    id: job.id,
    type: job.type,
    status: job.status as RelayJobStatus,
    personnelCode: job.personnelCode,
    createdAt: job.createdAt.toISOString(),
    expiresAt: job.expiresAt.toISOString(),
    result: job.resultJson ? (JSON.parse(job.resultJson) as Record<string, unknown>) : null,
    error:
      job.status === "failed"
        ? { code: job.errorCode ?? "UNKNOWN", message: job.error ?? "خطای نامشخص", httpStatus: job.httpStatus ?? 502 }
        : null,
  };

  // نتیجهٔ حساس — یک‌بارمصرف: نخستین خواندنِ موفق باز و علامت می‌خورد
  let secret: Record<string, unknown> | null = null;
  if (job.status === "done" && job.resultEnc && !job.consumedAt) {
    const opened = decryptSecret(job.resultEnc);
    if (opened) {
      try {
        secret = JSON.parse(opened) as Record<string, unknown>;
        await db.relayJob.update({ where: { id: job.id }, data: { consumedAt: new Date(), status: "consumed" } });
        view.status = "consumed";
      } catch {
        secret = null; // JSON خراب — مثل نبودِ راز رفتار می‌کنیم
      }
    }
  }

  return { ok: true, status: 200, job: view, secret };
}
