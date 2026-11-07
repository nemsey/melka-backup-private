/**
 * کلاینت HTTP اتصال واقعی به سامانه‌های ملک تبریز
 * ------------------------------------------------------
 * قرارداد واقعی (کشف‌شده با تحلیل باندل + تست زنده):
 *   ARM API:  https://arus-api.melketabriz.ir/api/apm/     (NestJS)
 *   ARM Pub:  https://arus-api.melketabriz.ir/api/public/
 *   PM API:   https://pm-api.melketabriz.ir/api/            (NestJS)
 *
 * ویژگی‌ها:
 *  - Timeout با AbortController + تلاش مجدد نمایی برای خطاهای شبکه/5xx
 *  - تشخیص «قطعی پایگاه داده سامانه» (خطای Mongoose buffering / 502 HTML)
 *    و ترجمه به پیام فارسی دقیق
 *  - نرمال‌سازی پوشه پاسخ NestJS: { statusCode, status, data, message }
 *  - هدر Authorization: Bearer + businessId اختیاری
 */

import { MelkApiError, type NestEnvelope } from "./types";
// PN-030 (شورا-ن۰۳۵): نقطهٔ یگانهٔ خروج — همهٔ فراخوانی‌های ملک تبریز از proxyFetch می‌گذرند.
// بدون MELK_ARM_PROXY_URL رفتار عین fetch مستقیم است (سازگاری کامل با PN-029).
import { proxyFetch, isMelkTabrizHost } from "./proxy";
// PN-059 (دستور مالک ۲۰۲۶-۱۱-۰۲: «اتصال api ملک‌تبریز برقرار نمی‌شود» — رفع کامل):
// فراخوانی رله‌ای زمان‌بندی صف دارد؛ مهلت ۲۵ث مستقیم، انتظار صف را می‌کشت.
import { relayModeActive, RELAY_WAIT_DEFAULT_MS } from "./relay";
import {
  breakerKeyFromBaseUrl,
  checkCircuit,
  circuitLockedError,
  isAuthPath,
  isBreakerFailure,
  recordBreakerFailure,
  recordBreakerSuccess,
} from "./circuit-breaker";

export interface HttpRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  baseUrl: string;
  body?: unknown;
  token?: string;
  timeoutMs: number;
  maxRetries: number;
  headers?: Record<string, string>;
  query?: Record<string, string | number | undefined | null>;
  /** PN-029 — فقط برای فراخوانی صریح مالک (تک‌تلاش OTP)؛ هیچ مسیر خودکاری عبور نمی‌کند */
  bypassOffline?: boolean;
}

/** پوشه درخواست/پاسخ استانداردشده */
export interface ArmCallResult<T> {
  /** داده اصلی پاسخ (envelope.data) */
  data: T;
  /** پیام سامانه (envelope.message) */
  message?: string;
}

/** ساخت رشته کوئری بدون مقادیر خالی */
export function buildQuery(query: Record<string, string | number | undefined | null> | undefined): string {
  if (!query) return "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

/**
 * آیا بدنه HTML خطای nginx است؟ (502/504 وقتی سرویس پشتیبان بالای nginx خاموش است)
 */
function looksLikeHtml(text: string): boolean {
  const t = text.trimStart().slice(0, 200).toLowerCase();
  return t.startsWith("<!doctype html") || t.startsWith("<html") || t.includes("<head>") || t.includes("502 bad gateway");
}

/**
 * ترجمه خطاهای شناخته‌شده سامانه به MelkApiError فارسی
 */
function classifyServerFailure(status: number, bodyText: string): MelkApiError {
  // خطای شناخته‌شده Mongoose: پایگاه داده سامانه در دسترس نیست
  if (bodyText.includes("MongooseError") || bodyText.includes("buffering timed out")) {
    return new MelkApiError(
      "DB_DOWN",
      "پایگاه داده سامانه ملک تبریز در حال حاضر در دسترس نیست (خطای سرور طرف ملک تبریز). لطفاً بعداً تلاش کنید.",
      status,
      true
    );
  }
  if (looksLikeHtml(bodyText) || status === 502 || status === 504 || status === 503) {
    return new MelkApiError(
      "DB_DOWN",
      "سرویس پشتیبان سامانه ملک تبریز موقتاً از دسترس خارج شده است. لطفاً چند دقیقه دیگر تلاش کنید.",
      status,
      true
    );
  }
  return new MelkApiError("SERVER_ERROR", `خطای سرور سامانه ملک تبریز (${status}).`, status, true);
}

/**
 * فراخوانی یک نقطه اتصال سامانه ملک تبریز با نرمال‌سازی کامل.
 * خطاهای ۴xx غیرقابل تلاش مجددند؛ ۵xx/شبکه با backoff تلاش می‌شوند.
 */
export async function armCall<T = unknown>(opts: HttpRequestOptions): Promise<ArmCallResult<T>> {
  // ---- گارد ۲: فیوز قطع‌کننده (قانون Retry هوشمند — PN-029 مرحلهٔ ۶) ----
  // PN-041-R (شورا-ن۰۶۸·بند ۲.۳): مسیر هم پاس می‌شود — روتهای رله مستثنی‌اند
  // PN-049 (دستور شورا ۱۴۰۵/۰۸/۰۱): مسیرهای «ورود» (authentication/*) نیز مستثنی‌اند
  // — لغو کامل قانون Retry هوشمند PN-029 برای ورود به حساب PM و ARM.
  const target = breakerKeyFromBaseUrl(opts.baseUrl);
  const isAuth = isAuthPath(opts.path); // ورود: نه قفل می‌خورد، نه شمارنده می‌بارد
  const gate = await checkCircuit(target, { path: opts.path });
  if (!gate.allowed) throw circuitLockedError(gate);

  const base = opts.baseUrl.replace(/\/$/, "");
  const qs = buildQuery(opts.query);
  const url = `${base}/${opts.path.replace(/^\//, "")}${qs}`;
  // PN-059 (رفع کامل عدم اتصال — ۲۰۲۶-۱۱-۰۲): مسیر رله‌ای = زمان‌بندی دو-مرحله‌ای
  // (نوبت صف + اجرای گوشی)؛ لایهٔ رله تا ۱۱۰ث منتظر می‌ماند (RELAY_WAIT_DEFAULT_MS ·
  // PN-036) ولی AbortController با مهلت مستقیم ۲۵ث صبر را می‌بُرید →
  // RelayOfflineError → NETWORK_ERROR «ارتباط برقرار نشد» در سینک شش‌خانواده،
  // در حالی که رله زنده بود (شاهد: ۴٬۳۹۵ done در همان روز). درمان: مهلتِ مؤثر
  // فراخوانی رله‌ای = max(مهلت فراخوان، ۱۱۰ث) — عین وعدهٔ لایهٔ رله؛ TTL صف ۱۲۰ث است.
  const relayRouted = relayModeActive() && isMelkTabrizHost(url);
  const effectiveTimeoutMs = relayRouted ? Math.max(opts.timeoutMs, RELAY_WAIT_DEFAULT_MS) : opts.timeoutMs;
  let lastError: MelkApiError | null = null;
  let lastBodyText = "";

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), effectiveTimeoutMs);
    try {
      // PN-030 — نقطهٔ یگانه: در صورت پیکربندی، عبور از پروکسی ابری (HMAC + whitelist)
      const res = await proxyFetch(url, {
        method: opts.method ?? "GET",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...(opts.method === "POST" || opts.body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
          ...(opts.headers ?? {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        cache: "no-store",
      });

      const text = await res.text().catch(() => "");
      lastBodyText = text;

      if (res.status === 401) {
        throw new MelkApiError("UNAUTHORIZED", "اعتبار نشست سامانه ملک تبریز منقضی شده است.", 401, false);
      }
      if (res.status >= 500) {
        throw classifyServerFailure(res.status, text);
      }

      // بدنه JSON نیست ولی وضعیت موفق است؟ (مثل HEAD)
      if (looksLikeHtml(text)) {
        if (res.ok) return { data: null as T };
        throw classifyServerFailure(res.status, text);
      }

      let envelope: NestEnvelope<T> | null = null;
      try {
        envelope = text ? (JSON.parse(text) as NestEnvelope<T>) : null;
      } catch {
        envelope = null;
      }

      if (!res.ok) {
        // خطاهای ۴xx سامانه — NestJS envelope
        const msg = envelope?.message;
        if (res.status === 412) {
          throw new MelkApiError(
            "PRECONDITION_FAILED",
            msg ?? "پیش‌نیاز ورود در سامانه ملک تبریز برقرار نیست.",
            412,
            false
          );
        }
        if (res.status === 429) {
          throw new MelkApiError("RATE_LIMITED", msg ?? "درخواست بیش از حد مجاز به سامانه ملک تبریز.", 429, false);
        }
        if (envelope?.status === false || (envelope?.statusCode && envelope.statusCode >= 400)) {
          // تشخیص خطای کد پرسنلی نامعتبر / کد پیامکی غلط از پیام سامانه
          throw new MelkApiError("OTP_INVALID", msg ?? `خطای سامانه ملک تبریز (${res.status}).`, res.status, false);
        }
        throw new MelkApiError("UNKNOWN", msg ?? `پاسخ نامعتبر از سامانه (${res.status}).`, res.status, false);
      }

      // موفق — NestJS گاهی status:false با 200/201 برمی‌گرداند
      if (envelope?.status === false) {
        throw new MelkApiError(
          "OTP_INVALID",
          envelope.message ?? "سامانه ملک تبریز درخواست را نپذیرفت.",
          envelope.statusCode ?? 400,
          false
        );
      }
      // PN-029 — موفقیت واقعی: بازنشانی فیوز میزبان (شمارش پیاپی صفر می‌شود)
      // PN-049: مسیرهای ورود شمارنده را تغییر نمی‌دهند (ورود لغو-محدود است)
      if (!isAuth) await recordBreakerSuccess(target);
      return { data: (envelope?.data ?? (envelope as unknown as T)) as T, message: envelope?.message };
    } catch (err) {
      if (err instanceof MelkApiError) {
        lastError = err;
        if (!err.retryable) throw err;
      } else if (err instanceof Error && (err.name === "AbortError" || err.message?.includes("abort"))) {
        lastError = new MelkApiError("TIMEOUT", "پاسخ سامانه ملک تبریز در مهلت مقرر دریافت نشد.", 504, true);
      } else {
        lastError = new MelkApiError("NETWORK_ERROR", "ارتباط با سامانه ملک تبریز برقرار نشد.", 0, true);
      }
      if (attempt === opts.maxRetries) break;
      // backoff نمایی: 800ms, 1600ms, ...
      await new Promise((r) => setTimeout(r, 800 * Math.pow(2, attempt)));
    } finally {
      clearTimeout(timer);
    }
  }

  // اگر خطای ۵xx بود و متن Mongoose داشت، دقیق‌تر گزارش شود
  if (lastError?.code === "SERVER_ERROR" && lastBodyText) {
    const refined = classifyServerFailure(lastError.httpStatus, lastBodyText);
    if (refined.code === "DB_DOWN") lastError = refined;
  }
  // PN-029 — شکست سمت سرور/شبکه: ثبت در فیوز (backoff ۶/۱۲/۲۴س · ۳ پیاپی = قفل ۲۴س)
  // PN-049 (دستور شورا): شکستِ «مسیر ورود» هرگز فیوز را نمی‌بارد — ورود بدون محدودیت
  if (!isAuth && lastError && isBreakerFailure(lastError)) await recordBreakerFailure(target);
  throw lastError ?? new MelkApiError("UNKNOWN", "خطای نامشخص در ارتباط با سامانه ملک تبریز.", 500, false);
}

/** سازگاری با کدهای قبلی — فراخوانی خام */
export async function melkFetch<T>(opts: HttpRequestOptions): Promise<T> {
  const r = await armCall<T>(opts);
  return r.data;
}

/** سنجش تک‌فراخوانی (GET) برای پایش زنده — بدون تلاش مجدد */
export interface ProbeResult {
  ok: boolean;
  httpStatus: number;
  latencyMs: number;
  bodyText: string;
  /** PN-029 — پروب به‌خاطر حالت آفلاین انجام نشد */
  offlineMode?: boolean;
  /** PN-029 — پروب به‌خاطر فیوز بسته انجام نشد (پیام دقیق در circuitDetail) */
  circuitLocked?: boolean;
  circuitDetail?: string;
}

export async function probeGet(
  baseUrl: string,
  path: string,
  timeoutMs = 8000,
  _opts?: { bypassOffline?: boolean } // PN-038/۶.۱: پارامتر حفظ شد (سازگاری فراخوان‌ها) — گارد حذف شد
): Promise<ProbeResult> {
  const target = breakerKeyFromBaseUrl(baseUrl);
  const gate = await checkCircuit(target);
  if (!gate.allowed) {
    return {
      ok: false,
      httpStatus: 0,
      latencyMs: -1,
      bodyText: "",
      circuitLocked: true,
      circuitDetail: circuitLockedError(gate).message,
    };
  }
  const url = `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
  // ═══ PN-068 — مهلت رله‌آگاه پروب ═══
  // در مسیر رلهٔ موبایل هر پروب یک آیتم صف است: صف‌گذاری + poll گوشی (تا ۱۰۰ث
  // long-poll) + اجرا (~۵-۳۰ث) + ارسال نتیجه ≈ ۱۵-۴۰ث رفت‌وبرگشت. مهلت ۱۲ث
  // پیشین هر پروب را پیش از بازگشت گوشی می‌کشت → وضعیت اتصال در حالت رله
  // همیشه «قطع» نشان داده می‌شد (شاید زندهٔ امروز). در حالت رله برای میزبان‌های
  // ملک‌تبریز، مهلت به حداکثرِ ۴۵ث بالا می‌رود (پاسخ صادقانه، نه سریع-و-دروغ).
  let effectiveTimeoutMs = timeoutMs;
  try {
    if (relayModeActive() && isMelkTabrizHost(url)) {
      effectiveTimeoutMs = Math.max(timeoutMs, 45_000);
    }
  } catch { /* تشخیص ناموفق — همان مهلت اصلی */ }
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), effectiveTimeoutMs);
  try {
    // PN-030 — نقطهٔ یگانه: پروب هم در صورت پیکربندی از پروکسی می‌گذرد
    const res = await proxyFetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    const bodyText = await res.text().catch(() => "");
    // PN-029 — ۵xx = شکست فیوز (سرویس پشتیبان پایین است؛ کوبیدن درِ او فایده ندارد)
    if (res.status >= 500) await recordBreakerFailure(target);
    else await recordBreakerSuccess(target);
    return { ok: res.ok || res.status < 500 || bodyText.length > 0, httpStatus: res.status, latencyMs: Date.now() - started, bodyText };
  } catch (err) {
    // خطای شبکه/TLS — شکست فیوز ثبت و سپس خطا به صداکننده می‌رسد (قرارداد قبلی)
    await recordBreakerFailure(target);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
