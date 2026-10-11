/**
 * پروکسی عبوری ملک تبریز — PN-030 (شورای عالی ملکا · جلسهٔ فوق‌العاده ۰۳۵ · لایهٔ ۱)
 * ---------------------------------------------------------------------------
 * ریشهٔ قطعی اتصال (تشخیص نهایی PN-029): فایروال ملک تبریز کل رنج ASN کانتینر
 * (Alibaba Cloud — AS45102) را drop می‌کند؛ مسیر خروج به ایران سالم است (کنترل
 * دیوار پاسخ داد). راهکار مصوب شورا: خروج از ASN بلاک‌شده از طریق پروکسی
 * رایگان ابری Cloudflare Workers (AS13335 — احتمال بلاک‌بودن بسیار کم).
 *
 * معماری (نقطهٔ یگانه — قانون ساختاری):
 *   client.ts (armCall + probeGet)
 *     └─ proxyFetch(url, init)  ← همین ماژول؛ تنها نقطهٔ خروج همهٔ فراخوانی‌ها
 *          ├─ MELK_ARM_PROXY_URL خالی؟ → fetch مستقیم (عین رفتار قبل — صفر تغییر)
 *          ├─ میزبان جزو ملک تبریز نیست؟ → fetch مستقیم (کنترل‌ها/سرویسهای دیگر)
 *          └─ در غیر این صورت: POST به Worker با احراز HMAC-SHA256
 *               X-Melka-Target     → نشانی کامل مقصد
 *               X-Melka-Timestamp  → پنجرهٔ ±۵ دقیقه (ضد replay)
 *               X-Melka-Signature  → HMAC("METHOD\npath?query\nsha256(body)\nts")
 *
 * امنیت:
 *   · فقط سه میزبان API ملک تبریز whitelist شده‌اند (عین Worker — دفاع در عمق)
 *   · بدنهٔ GET/HEAD خالی امضا می‌شود؛ فقط بدنهٔ رشته‌ای عبور می‌کند
 *   · بدون MELK_PROXY_SECRET، مسیر مستقیم انتخاب می‌شود (هرگز امضای خالی ارسال نمی‌شود)
 *   · Worker هم میزبان را خودش بازبینی می‌کند — حتی لو راز شدن، دامنهٔ سوءاستفاده
 *     را به «فقط API های ملک تبریز» محدود می‌کند.
 */

/** میزبانهای مجاز عبور — عین ALLOWED_HOSTS سمت Worker (دفاع دولایه) */
export const MELK_PROXY_ALLOWED_HOSTS: readonly string[] = [
  "arus-api.melketabriz.ir", // ARM (آگهی/درخواست) + رابط عمومی (apu)
  "pm-api.melketabriz.ir", // PM (پرسنلی)
  "gap-api.melketabriz.ir", // GAP
] as const;

/** آیا نشانی داده‌شده متعلق به سامانه‌های ملک تبریز است؟ (خالص و تست‌پذیر) */
export function isMelkTabrizHost(url: string): boolean {
  try {
    return MELK_PROXY_ALLOWED_HOSTS.includes(new URL(url).host);
  } catch {
    return false;
  }
}

/** وضعیت پیکربندی پروکسی — برای نمایش در تنظیمات و شاهدها */
export function proxyStatus(): { configured: boolean; host: string | null; secretConfigured: boolean } {
  const url = process.env.MELK_ARM_PROXY_URL?.trim() ?? "";
  let host: string | null = null;
  try {
    host = url ? new URL(url).host : null;
  } catch {
    host = null;
  }
  return {
    configured: Boolean(url) && host !== null,
    host,
    secretConfigured: Boolean(process.env.MELK_PROXY_SECRET?.trim()),
  };
}

/** هگزِ آرایهٔ بایت (کوچک) */
async function toHex(buf: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

/** SHA-256 متن → هگز (Web Crypto — سازگار با Node/Bun/Worker) */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return toHex(digest);
}

/** HMAC-SHA256(secret, message) → هگز ۶۴ کاراکتری */
export async function hmacSignHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return toHex(sig);
}

/** پیام امضا — قرارداد یکسان سمت Worker: «METHOD\npath?query\nsha256(body)\nts» */
export async function buildSignatureMessage(
  method: string,
  targetUrl: string,
  bodyText: string,
  timestamp: string
): Promise<{ message: string; bodyDigest: string }> {
  const u = new URL(targetUrl);
  const bodyDigest = await sha256Hex(bodyText);
  return { message: `${method}\n${u.pathname}${u.search}\n${bodyDigest}\n${timestamp}`, bodyDigest };
}

/**
 * نقطهٔ یگانهٔ خروج به سامانه‌های ملک تبریز — proxyFetch (PN-030 مرحلهٔ ۳).
 *
 * قرارداد:
 *   · MELK_ARM_PROXY_URL تنظیم نشده → عین fetch مستقیم (سازگاری کامل با PN-029)
 *   · میزبان خارج از whitelist ملک تبریز → مستقیم (کنترل‌های دیوار/سرویسهای ایرانی)
 *   · بدنهٔ غیررشته‌ای (جریان/بافر) → مستقیم (امضا ممکن نیست؛ خطای قرارداد لاگ می‌شود)
 *   · در بقیهٔ حالات → عبور از Worker با هدرهای X-Melka-*
 */
export async function proxyFetch(url: string, init: RequestInit): Promise<Response> {
  const proxyUrl = process.env.MELK_ARM_PROXY_URL?.trim();
  if (!proxyUrl) return fetch(url, init);
  if (!isMelkTabrizHost(url)) return fetch(url, init);
  const secret = process.env.MELK_PROXY_SECRET?.trim();
  if (!secret) {
    // امضای خالی یعنی شکست حتمی احراز — مستقیم می‌رویم تا خطای شبکهٔ واقعی دیده شود
    return fetch(url, init);
  }
  const bodyText = init.body === undefined ? "" : typeof init.body === "string" ? init.body : null;
  if (bodyText === null) {
    // بدنهٔ غیررشته‌ای در قرارداد فعلی نیست (armCall/probeGet همیشه رشته‌اند) — مستقیم
    return fetch(url, init);
  }

  const method = init.method ?? "GET";
  const timestamp = Date.now().toString();
  const { message } = await buildSignatureMessage(method, url, bodyText, timestamp);
  const signature = await hmacSignHex(secret, message);

  const headers = new Headers(init.headers);
  headers.set("X-Melka-Target", url);
  headers.set("X-Melka-Timestamp", timestamp);
  headers.set("X-Melka-Signature", signature);

  return fetch(proxyUrl, { ...init, method, headers });
}
