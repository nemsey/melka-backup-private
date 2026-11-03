/**
 * melka-proxy — Worker عبوری ملک تبریز (PN-030 · شورای عالی ملکا جلسهٔ فوق‌العاده ۰۳۵ · لایهٔ ۱)
 * ---------------------------------------------------------------------------
 * چرا این Worker؟
 *   ریشهٔ قطعی اتصال (تشخیص نهایی PN-029): فایروال ملک تبریز کل رنج ASN کانتینر
 *   (Alibaba Cloud — AS45102) را drop می‌کند. خروج از این ASN با پروکسی رایگان
 *   ابری Cloudflare Workers (AS13335 — شبکهٔ ۲۰۰+ PoP جهانی با پایداری ۹۹٫۹۹٪).
 *
 * چهار قید مصوب شورا (بخش ۳.۱ سند):
 *   ۱) فقط میزبانهای whitelist‌شدهٔ ملک تبریز — هیچ مقصد دیگری عبور نمی‌کند
 *   ۲) احراز HMAC-SHA256 روی «METHOD\npath?query\nsha256(body)\ntimestamp»
 *   ۳) پنجرهٔ زمانی ±۵ دقیقه — حملات replay بعد از پنج دقیقه بی‌اعتبارند
 *   ۴) صفر لاگ محتوا — فقط شمارندهٔ درون‌حافظه؛ هیچ بدنه/هدر/توکنی ثبت نمی‌شود
 *
 * هزینه: صفر (پلن رایگان ۱۰۰٬۰۰۰ درخواست/روز — مصرف ملکا بسیار کمتر از این سقف است)
 *
 * نصب راز (یک‌بار):
 *   npx wrangler secret put MELKA_PROXY_SECRET
 *   ← همان مقدار MELK_PROXY_SECRET در env.platform.json کانتینر ملکا
 */

/** میزبانهای مجاز — عین MELK_PROXY_ALLOWED_HOSTS در src/lib/melk-api/proxy.ts (دفاع دولایه) */
const ALLOWED_HOSTS: ReadonlySet<string> = new Set([
  "arus-api.melketabriz.ir", // ARM (آگهی/درخواست) + رابط عمومی (apu)
  "pm-api.melketabriz.ir", // PM (پرسنلی)
  "gap-api.melketabriz.ir", // GAP
]);

/** هدرهای عبوری مجاز — فقط آنچه API ملک تبریز لازم دارد؛ X-Melka-* هرگز به مقصد نمی‌رود */
const FORWARD_REQUEST_HEADERS: readonly string[] = ["authorization", "content-type", "accept", "accept-language"];

/** پنجرهٔ زمانی امضا (ضد replay) */
const TIMESTAMP_WINDOW_MS = 5 * 60 * 1000;

/** شمارندهٔ بدون محتوا — قانون «صفر لاگ محتوا» شورا (بخش ۳.۱) */
const stats = { total: 0, rejectedAuth: 0, rejectedHost: 0, upstream: 0 };

function hexToBytes(hex: string): Uint8Array | null {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) return null;
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  const bytes = new Uint8Array(digest);
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

/** احراز HMAC با مقایسهٔ زمان-ثابت (بدون نشت بایت‌ها) */
async function verifyHmac(secret: string, message: string, signatureHex: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
  const provided = hexToBytes(signatureHex);
  if (!provided || provided.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ provided[i];
  return diff === 0;
}

function deny(reason: string, status: number): Response {
  // فقط علت رد — بدون هیچ جزئیات محتوا (صفر لاگ محتوا)
  return new Response(reason, { status, headers: { "Cache-Control": "no-store" } });
}

// ═══════════ PN-031-I · لایهٔ ۳ — مسیر جایگزین رلهٔ گوشی (/relay/*) ═══════════
// سند شورا-ن۰۵۰: اگر مسیر مستقیم گوشی→دروازهٔ space-z.ai قطع شد (curl 9 /
// WAF / بلاک موقت)، اسکریپت رله پس از ۳ خطای پیاپی به همین مسیر سوئیچ می‌کند:
//   POST /relay/api/mobile-relay/poll  →  MELKA_RELAY_ORIGIN/api/mobile-relay/poll
// دفاع (بدون راز تازه روی گوشی — احراز همان HMAC دستگاه در مبدأ):
//   · مبدأ ثابت (env MELK_RELAY_ORIGIN — فقط https · فقط دامنهٔ space-z.ai)
//   · فقط پیشوندهای مجاز: /api/mobile-relay/* · /api/health · /api/version
//   · سقف نرخ هر IP: ۳۰ درخواست در پنجرهٔ ۶۰ثانیه‌ای (درخواست بی‌احراز به مبدأ
//     می‌رسد اما همان 401/403 مبدأ را می‌گیرد — احراز واقعی در مبدأ است)
//   · هدرهای عبوری: فقط X-Melka-Relay-Device/Timestamp/Signature + Content-Type
//   · صفر لاگ محتوا — همان قانون شورا (بخش ۳.۱)

/** پیشوندهای مجاز روی مبدأ — فقط رله و سلامت/نسخه */
const RELAY_ALLOWED_PREFIXES: readonly string[] = [
  "/api/mobile-relay/", // poll · result · bootstrap
  "/api/health",
  "/api/version",
];

/** هدرهای عبوری رله — احراز دستگاه در مبدأ انجام می‌شود */
const RELAY_FORWARD_HEADERS: readonly string[] = [
  "x-melka-relay-device",
  "x-melka-timestamp",
  "x-melka-signature",
  "content-type",
];

/** سقف نرخ هر IP — ۳۰ درخواست در ۶۰ ثانیه (شمارندهٔ درون‌حافظه، بهترین-تلاش) */
const RELAY_RATE_LIMIT = 30;
const relayRate = new Map<string, { windowStart: number; count: number }>();
const relayStats = { total: 0, rejectedRate: 0, rejectedPath: 0, upstream: 0 };

function relayRateAllow(ip: string): boolean {
  const now = Date.now();
  const entry = relayRate.get(ip);
  if (!entry || now - entry.windowStart >= 60_000) {
    relayRate.set(ip, { windowStart: now, count: 1 });
    // پاکسازی گاه‌به‌گاه — ضد رشد بی‌کران حافظه
    if (relayRate.size > 1000) {
      for (const [k, v] of relayRate) if (now - v.windowStart >= 60_000) relayRate.delete(k);
    }
    return true;
  }
  entry.count += 1;
  return entry.count <= RELAY_RATE_LIMIT;
}

async function handleRelayRoute(request: Request, env: { MELKA_RELAY_ORIGIN?: string }): Promise<Response> {
  relayStats.total++;

  // ۱) مبدأ — متغیر wrangler (بدون راز)؛ فقط https و فقط دامنهٔ space-z.ai
  const origin = (env.MELKA_RELAY_ORIGIN ?? "").replace(/\/+$/, "");
  if (!origin) return deny("relay origin not configured", 503);
  let originUrl: URL;
  try { originUrl = new URL(origin); } catch { return deny("relay origin invalid", 503); }
  if (originUrl.protocol !== "https:" || !originUrl.hostname.endsWith(".space-z.ai")) {
    return deny("relay origin not allowed", 503);
  }

  // ۲) مسیر — فقط پیشوندهای رله (پیشوند /relay حذف می‌شود)
  const incoming = new URL(request.url);
  const path = incoming.pathname.replace(/^\/relay/, "") || "/";
  if (!RELAY_ALLOWED_PREFIXES.some((p) => path === p || path.startsWith(p))) {
    relayStats.rejectedPath++;
    return deny("path not allowed", 403);
  }

  // ۳) سقف نرخ هر IP
  const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
  if (!relayRateAllow(ip)) {
    relayStats.rejectedRate++;
    return deny("rate limited", 429);
  }

  // ۴) عبور — هدرهای احراز دستگاه + Content-Type (بدنهٔ خام دست‌نخورده)
  const fwd = new Headers();
  for (const h of RELAY_FORWARD_HEADERS) {
    const v = request.headers.get(h);
    if (v) fwd.set(h, v);
  }
  fwd.set("user-agent", request.headers.get("user-agent") ?? "melka-relay");
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const body = hasBody ? await request.arrayBuffer() : undefined;

  relayStats.upstream++;
  const upstream = await fetch(`${origin}${path}${incoming.search}`, {
    method: request.method,
    headers: fwd,
    body: body && body.byteLength > 0 ? body : undefined,
    redirect: "manual",
  });

  // ۵) پاسخ — نوع محتوا + وضعیت؛ صفر کش؛ صفر لاگ محتوا
  const respHeaders = new Headers();
  const ct = upstream.headers.get("content-type");
  if (ct) respHeaders.set("content-type", ct);
  respHeaders.set("cache-control", "no-store");
  respHeaders.set("x-melka-proxy", "relay");
  return new Response(upstream.body, { status: upstream.status, headers: respHeaders});
}

export default {
  async fetch(request: Request, env: { MELKA_PROXY_SECRET?: string; MELKA_RELAY_ORIGIN?: string }): Promise<Response> {
    // PN-031-I · لایهٔ ۳: شاخهٔ مسیر جایگزین رلهٔ گوشی — مستقل از احراز ARM
    const pathname = new URL(request.url).pathname;
    if (pathname === "/relay" || pathname.startsWith("/relay/")) {
      return handleRelayRoute(request, env);
    }

    stats.total++;

    // ۰) پیکربندی — راز نصب نشده؟ سرویس عمداً خاموش است
    if (!env.MELKA_PROXY_SECRET) return deny("proxy not configured", 503);

    // ۱) هدرهای احراز
    const target = request.headers.get("X-Melka-Target");
    const signature = request.headers.get("X-Melka-Signature");
    const timestamp = request.headers.get("X-Melka-Timestamp");
    if (!target || !signature || !timestamp) {
      stats.rejectedAuth++;
      return deny("missing auth headers", 403);
    }

    // ۲) whitelist میزبان — فقط سه دامنهٔ API ملک تبریز، فقط HTTPS
    let targetUrl: URL;
    try {
      targetUrl = new URL(target);
    } catch {
      stats.rejectedHost++;
      return deny("invalid target", 403);
    }
    if (targetUrl.protocol !== "https:" || !ALLOWED_HOSTS.has(targetUrl.host)) {
      stats.rejectedHost++;
      return deny("host not allowed", 403);
    }

    // ۳) پنجرهٔ زمانی (ضد replay)
    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > TIMESTAMP_WINDOW_MS) {
      stats.rejectedAuth++;
      return deny("stale request", 403);
    }

    // ۴) بدنه (کاملاً خوانده می‌شود — هم برای امضا هم برای عبور؛ جریان‌کاری نیست)
    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    const bodyText = hasBody ? await request.text() : "";

    // ۵) احراز HMAC — قرارداد یکسان سمت ملکا: «METHOD\npath?query\nsha256(body)\nts»
    const message = `${request.method}\n${targetUrl.pathname}${targetUrl.search}\n${await sha256Hex(bodyText)}\n${timestamp}`;
    if (!(await verifyHmac(env.MELKA_PROXY_SECRET, message, signature))) {
      stats.rejectedAuth++;
      return deny("forbidden", 403);
    }

    // ۶) عبور — هدرهای حداقلی؛ هدرهای X-Melka-* هرگز به مقصد نمی‌روند
    const fwd = new Headers();
    for (const h of FORWARD_REQUEST_HEADERS) {
      const v = request.headers.get(h);
      if (v) fwd.set(h, v);
    }
    stats.upstream++;
    const upstream = await fetch(targetUrl.toString(), {
      method: request.method,
      headers: fwd,
      body: hasBody && bodyText.length > 0 ? bodyText : undefined,
      redirect: "manual", // پاسخ ریدایرکت خام به ملکا برگردد — تصمیم با کلاینت
    });

    // ۷) پاسخ عبوری — فقط نوع محتوا؛ صفر لاگ، صفر کش
    const respHeaders = new Headers();
    const ct = upstream.headers.get("content-type");
    if (ct) respHeaders.set("content-type", ct);
    respHeaders.set("cache-control", "no-store");
    respHeaders.set("x-melka-proxy", "pass");
    return new Response(upstream.body, { status: upstream.status, headers: respHeaders });
  },
};
