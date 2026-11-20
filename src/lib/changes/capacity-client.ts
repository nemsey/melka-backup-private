"use client";

/**
 * capacity-client.ts — DIR-FF-CAP-502 (دستور مالک ۱۴۰۵/۰۸/۳۰ · بند ثالثاً)
 * ---------------------------------------------------------------------------
 * ریشه‌یابی واقعی خطای ۵۰۲ کلید «تمام ظرفیت» (شواهد زنده ۱۴۰۵/۰۸/۳۰ ~۰۸:۵۰):
 *   · خود مسیر ‎/api/changes/session‎ کاملاً سالم است — POST begin از درون
 *     سندباکس: 200 در ~۵۰ms؛ از لینک عمومی preview: 200 در ~۱۱۰ms.
 *   · ۵۰۲ از «لبهٔ preview» می‌آید: در پنجره‌های بوت/بازیافت سندباکس (شاهد
 *     boot-recovery.log: آمادگی پس از ~۱۴۰–۱۴۵ ثانیه در هر بوت) هیچ مبدایی
 *     پشت دروازه نیست → پروکسی ۵۰۲ برمی‌گرداند؛ کلاینت هم امروز صفر تلاش
 *     مجدد دارد و خطا مستقیم به مالک می‌رسد.
 *
 * درمان واقعی در ضلع کلاینت (همان‌جا که مالک خطا را می‌بیند — preview):
 *   · عملیات idempotent است (begin روی نشست فعال → alreadyActive؛ end روی
 *     نشست بسته → wasActive:false) ⇒ تلاش مجدد ۱۰۰٪ بی‌خطر است.
 *   · این هلپر تا ۶ تلاش با وقفهٔ پلکانی (۳/۸/۱۵/۳۰/۴۵ ثانیه — مجموع
 *     ~۱۰۱ث + مهلت هر تلاش) خطاهای «گذرا» را خوددرمان می‌کند؛ پنجرهٔ بوت
 *     ~۱۴۵ثانیه‌ای را پوشش می‌دهد و مالک به‌جای خطای ۵۰۲، «در حال اتصال
 *     مجدد (تلاش n)» و سپس موفقیت می‌بیند.
 *   · خطاهای قطعی (۴xx: 400/401/403/404/409/429) هرگز تلاش مجدد نمی‌شوند.
 *
 * قانون دادهٔ مقدس: این ماژول هیچ داده‌ای نمی‌نویسد/حذف نمی‌کند — فقط
 * همان POST موجود را مقاوم می‌کند. قانون لینک: یک منبع حقیقت برای هر دو
 * کاشی (فایل‌یابی و تغییرات) — بدون نسخه‌برداری منطق.
 */

import { api, ApiClientError } from "@/lib/client/api";

export type CapacityAction = "begin" | "end";

export interface CapacityToggleOk {
  ok: boolean;
  alreadyActive?: boolean;
  wasActive?: boolean;
  session?: unknown;
  after?: unknown;
  message: string;
}

export interface CapacityToggleProgress {
  /** شمارهٔ تلاشی که تازه شکست خورد */
  attempt: number;
  /** کل تلاش‌ها */
  total: number;
  /** آخرین خطای گذرا */
  error: ApiClientError;
  /** ثانیهٔ تأخیر تا تلاش بعدی */
  nextDelayMs: number;
}

export interface CapacityToggleOptions {
  /** گزارش پیشرفت برای UI («تلاش مجدد n از N…») */
  onProgress?: (p: CapacityToggleProgress) => void;
  /** وقفه‌های تلاش مجدد — تست‌پذیری (پیش‌فرض پلکانی رسمی) */
  retryDelaysMs?: readonly number[];
  /** مهلت هر تلاش */
  timeoutMs?: number;
}

/**
 * وقفهٔ پلکانی رسمی — مهربان به سرور مبدأ در ساعت اوج:
 * ۳ث · ۸ث · ۱۵ث · ۳۰ث · ۴۵ث (۵ بازگشت بین ۶ تلاش؛ الگوی نماییِ apiSync
 * ادامه‌یافته تا پوشش کامل پنجرهٔ بوت ~۱۴۵ث سندباکس).
 */
export const CAPACITY_RETRY_DELAYS_MS: readonly number[] = [3_000, 8_000, 15_000, 30_000, 45_000];

/** داوری خطا → گذرا (۵۰۲/۵۰۴/تایم‌اوت/شبکه) یا قطعی (۴xx و غیره) */
export function isTransientCapacityError(err: unknown): boolean {
  if (!(err instanceof ApiClientError)) return false;
  if (err.code === "TIMEOUT" || err.code === "NETWORK_ERROR" || err.code === "UPSTREAM_UNAVAILABLE") return true;
  return err.status === 0 || err.status === 502 || err.status === 504 || err.status >= 500;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * کلید «تمام ظرفیت» / «حالت عادی» — POST مقاوم با تلاش مجدد پلکانی.
 * @throws ApiClientError آخرین خطا پس از پایان همهٔ تلاش‌ها (یا خطای قطعی فوری)
 */
export async function toggleCapacitySessionResilient(
  action: CapacityAction,
  opts: CapacityToggleOptions = {}
): Promise<CapacityToggleOk & { attempts: number }> {
  const delays = opts.retryDelaysMs ?? CAPACITY_RETRY_DELAYS_MS;
  const total = delays.length + 1;
  const timeoutMs = opts.timeoutMs ?? 30_000;

  let lastError: ApiClientError | null = null;
  for (let attempt = 1; attempt <= total; attempt += 1) {
    try {
      const res = await api<CapacityToggleOk>("/api/changes/session", {
        method: "POST",
        body: { action },
        timeoutMs,
      });
      return { ...res, attempts: attempt };
    } catch (err) {
      const e = err instanceof ApiClientError ? err : new ApiClientError("UNKNOWN", "خطای نامشخص در تغییر حالت.", 0);
      lastError = e;
      // قطعی (مثل 403 غیرمالک یا 400 بدنه) — تلاش مجدد بی‌معنا و مضر
      if (!isTransientCapacityError(e)) throw e;
      if (attempt >= total) break;
      const nextDelayMs = delays[attempt - 1];
      opts.onProgress?.({ attempt, total, error: e, nextDelayMs });
      await sleep(nextDelayMs);
    }
  }
  throw lastError ?? new ApiClientError("UNKNOWN", "تغییر حالت تمام‌ظرفیت ناموفق بود.", 0);
}
