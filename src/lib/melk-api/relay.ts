/**
 * رلهٔ موبایل ایرانی — PN-031 (شورای عالی ملکا · جلسهٔ فوق‌العاده ۰۳۷ · ۱۴۰۵/۰۷/۲۲)
 * ---------------------------------------------------------------------------
 * زمینه (کشف نهایی PN-030 · origin-geo-fence-diagnosis.json): فایروال ملک
 * تبریز کل ترافیک خارج از ایران را drop می‌کند — نه فقط ASN کانتینر ما؛
 * خروجی Cloudflare Workers (AS13335) هم بلاک شد (خطای 522). تنها مسیر باز:
 * IPهای داخل ایران.
 *
 * راهکار مصوب شورا-ن۰۳۷ (Pull-based Relay — الگوی دیوار/تلگرام):
 *   گوشی مالک (Poco F3 · IP ایرانی · Termux)
 *     ↕ اتصال خروجی (بدون پورت‌فورواردینگ) — long-poll امضاشده
 *   سرور ملکا (صف RelayQueue)
 *     ↑ armCall → proxyFetch (نقطهٔ یگانهٔ PN-030 · حالت رله)
 *
 * قرارداد احراز (عین PN-030 — همان پیام امضا):
 *   هدرها: X-Melka-Relay-Device · X-Melka-Timestamp · X-Melka-Signature
 *   پیام: "METHOD\npath\nsha256(body)\nts" — path مسیر روت رله است
 *   پنجرهٔ زمانی: ±۵ دقیقه (ضد replay)
 *
 * احراز دوجهته: پاسخ poll هم امضای «RELAY\nid\nmethod\nurl\nsha256(body)\nts»
 * دارد (فیلد sig در JSON) — گوشی پیش از اجرای هر درخواست، اصالتش را وارسی
 * می‌کند؛ حتی لو رفتن TLS هم به تزریق مقصد دلخواه منجر نمی‌شود (دفاع دولایه).
 *
 * قوانین پابرجا:
 *   · صفر لاگ محتوا — هیچ بدنه/هدر/توکنی در لاگ نمی‌نشیند (فقط شمارنده)
 *   · صفر auto_execute — گوشی فقط منتقل می‌کند؛ تصمیم‌گیر نیست
 *   · قفل ترتیب MELK_ARM_OFFLINE پابرجاست — برداشتن فقط پس از تست زندهٔ
 *     دروازهٔ مالک (رویهٔ چهارگامهٔ online-mode.json)
 *   · whitelist میزبان در هر دو سمت (سرور هنگام enqueue · گوشی هنگام اجرا)
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { isMelkTabrizHost } from "./proxy";

/** پنجرهٔ زمانی امضا (ضد replay) — عین TIMESTAMP_WINDOW_MS سمت Worker */
export const RELAY_TIMESTAMP_WINDOW_MS = 5 * 60 * 1000;
/** مهلت اجرای یک درخواست روی گوشی قبل از انقضا (ثانیه) */
export const RELAY_ITEM_TTL_S = 45;
/** مهلت پیش‌فرض انتظار caller برای نتیجهٔ رله (میلی‌ثانیه) */
export const RELAY_WAIT_DEFAULT_MS = 30_000;
/** آستانهٔ «دستگاه برخط» — آخرین poll تا این عدد ثانیه پیش (میلی‌ثانیه) */
export const RELAY_ONLINE_WINDOW_MS = 90_000;
/** سقف اندازهٔ بدنهٔ پاسخ گوشی (بایت — پایه) */
export const RELAY_MAX_RESULT_BYTES = 5 * 1024 * 1024;
/** هدرهای عبوری مجاز — عین FORWARD_REQUEST_HEADERS سمت Worker */
export const RELAY_FORWARD_HEADERS: readonly string[] = ["authorization", "content-type", "accept"];

// ───────────────────────── پیکربندی و وضعیت ─────────────────────────

/** حالت رله فعال است؟ (MELK_ARM_RELAY_MODE=mobile) */
export function relayModeActive(): boolean {
  return (process.env.MELK_ARM_RELAY_MODE ?? "").trim() === "mobile";
}

/** وضعیت پیکربندی رله — برای نمای اتصال و شاهدها (بدون راز) */
export function relayConfigStatus(): { mode: string; active: boolean } {
  const mode = (process.env.MELK_ARM_RELAY_MODE ?? "").trim();
  return { mode: mode || "off", active: mode === "mobile" };
}

// ───────────────────────── ابزار رمزنگاری (Node crypto — sync و ساده) ─────────────────────────

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** HMAC-SHA256(secret, message) → هگز — سازگار با قرارداد PN-030 */
export function relayHmacHex(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message, "utf8").digest("hex");
}

/** مقایسهٔ زمان-ثابت دو رشتهٔ هگز (بدون نشت بایت) */
export function relayTimingSafeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** پیام امضای درخواست گوشی → سرور — عین قرارداد PN-030 */
export function relayAuthMessage(method: string, path: string, bodyText: string, ts: string): string {
  return `${method}\n${path}\n${sha256(bodyText)}\n${ts}`;
}

/** پیام امضای سرور → گوشی (احراز دوجهتهٔ آیتم صف) */
export function relayItemSignature(item: { id: string; method: string; url: string; body: string | null }, enqueuedAtMs: number, secret: string): string {
  return relayHmacHex(secret, `RELAY\n${item.id}\n${item.method}\n${item.url}\n${sha256(item.body ?? "")}\n${String(enqueuedAtMs)}`);
}

// ───────────────────────── احراز دستگاه (poll/result) ─────────────────────────

export interface RelayAuthResult {
  ok: boolean;
  status: number;
  error?: string;
  device?: { id: string; deviceId: string; secret: string };
}

/**
 * وارسی هدرهای احراز دستگاه روی یک درخواست poll/result.
 * فقط deviceId + HMAC معتبر + پنجرهٔ زمانی + عدم ابطال.
 */
export async function verifyRelayRequestAuth(
  method: string,
  path: string,
  rawBody: string,
  headers: Headers
): Promise<RelayAuthResult> {
  const deviceId = headers.get("X-Melka-Relay-Device")?.trim() ?? "";
  const ts = headers.get("X-Melka-Timestamp")?.trim() ?? "";
  const sig = headers.get("X-Melka-Signature")?.trim() ?? "";
  if (!deviceId || !ts || !sig) return { ok: false, status: 403, error: "missing auth headers" };
  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum) || Math.abs(Date.now() - tsNum) > RELAY_TIMESTAMP_WINDOW_MS) {
    return { ok: false, status: 403, error: "stale request" };
  }
  const device = await db.relayDevice.findUnique({ where: { deviceId } });
  if (!device) return { ok: false, status: 403, error: "unknown device" };
  if (device.revokedAt) return { ok: false, status: 403, error: "device revoked" };
  const expected = relayHmacHex(device.secret, relayAuthMessage(method, path, rawBody, ts));
  if (!relayTimingSafeEq(expected, sig.toLowerCase())) return { ok: false, status: 403, error: "forbidden" };
  return { ok: true, status: 200, device: { id: device.id, deviceId: device.deviceId, secret: device.secret } };
}

// ───────────────────────── مدیریت دستگاه ─────────────────────────

/** تولید راز دستگاه ۶۴-هگز و کد راه‌اندازی یک‌بارمصرف */
function freshDeviceSecret(): string {
  return randomBytes(32).toString("hex");
}
function freshEnrollCode(): string {
  return randomBytes(18).toString("hex");
}
function freshDeviceId(label: string): string {
  const slug = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 18) || "relay";
  return `${slug}-${randomBytes(3).toString("hex")}`;
}

/** ثبت دستگاه تازه — فقط مالک (روت admin) صدا می‌زند */
export async function createRelayDevice(label: string, enrolledBy: string): Promise<{
  deviceId: string;
  secret: string;
  enrollCode: string;
  enrollExpires: Date;
}> {
  const secret = freshDeviceSecret();
  const enrollCode = freshEnrollCode();
  const enrollExpires = new Date(Date.now() + 30 * 60 * 1000); // ۳۰ دقیقه اعتبار
  await db.relayDevice.create({
    data: {
      deviceId: freshDeviceId(label),
      secret,
      label: label.trim().slice(0, 60),
      enrollCode,
      enrollExpires,
      enrolledBy,
    },
  });
  // deviceId پس از create معلوم است — مجدداً می‌خوانیم (slug ممکن است کوتاه شده باشد)
  const device = await db.relayDevice.findFirst({ where: { enrollCode }, orderBy: { id: "desc" } });
  return { deviceId: device?.deviceId ?? "", secret, enrollCode, enrollExpires };
}

// ───────────────────────── کد راه‌اندازی بخشنده (PN-031-C · شورا-ن۰۴۰) ─────────────────────────

/**
 * دلایل رد کد راه‌اندازی — هر دلیل پیام دقیق و متمایز دارد (کار ۵ سند ۰۴۰):
 *   invalid — چنین کدی صادر نشده (غلط تایپی/کامل نبودن)
 *   revoked — دستگاه صاحب کد باطل شده
 *   used    — نصب کامل شده (اولین Poll آمده) → «کد سوخته» واقعی
 *   limit   — ۳ تلاش دانلود مصرف شده (تلاش چهارم) → «کد سوخته»
 *   expired — پنجرهٔ ۳۰ دقیقه گذشته → «کد منقضی»
 */
export type EnrollRejectReason = "invalid" | "revoked" | "used" | "limit" | "expired";

export interface EnrollCodeView {
  state: "waiting" | "installing" | "enrolled" | "burned-limit" | "burned-used" | "expired" | "revoked" | "absent";
  attemptCount: number;
  maxAttempts: number;
  lastAttemptAt: string | null;
  enrollExpires: string | null;
  enrolledAt: string | null;
}

/** شمارش تلاش + وضعیت کد یک دستگاه (بدون راز) — برای code-status و UI */
export function relayEnrollState(d: {
  enrollCode: string | null;
  enrollExpires: Date | null;
  attemptCount: number;
  maxAttempts: number;
  lastAttemptAt: Date | null;
  enrolledAt: Date | null;
  revokedAt: Date | null;
  lastSeenAt: Date | null;
}): EnrollCodeView {
  const base = {
    attemptCount: d.attemptCount,
    maxAttempts: d.maxAttempts,
    lastAttemptAt: d.lastAttemptAt?.toISOString() ?? null,
    enrollExpires: d.enrollExpires?.toISOString() ?? null,
    enrolledAt: d.enrolledAt?.toISOString() ?? null,
  };
  if (d.revokedAt) return { ...base, state: "revoked" };
  if (d.enrolledAt) return { ...base, state: "enrolled" };
  if (!d.enrollCode) return { ...base, state: "absent" };
  if (d.attemptCount >= d.maxAttempts) return { ...base, state: "burned-limit" };
  if (!d.enrollExpires || d.enrollExpires.getTime() < Date.now()) return { ...base, state: "expired" };
  // کد زنده: اگر تلاشی شده «در حال نصب» است، وگرنه منتظر نخستین تلاش
  return { ...base, state: d.attemptCount > 0 || d.lastSeenAt ? "installing" : "waiting" };
}

/**
 * مصرفِ بخشندهٔ کد راه‌اندازی — فقط روت bootstrap عمومی (PN-031-C).
 *
 * تفاوت با PN-031 (درس چرخهٔ خطای ۴۰۳ جلسهٔ ۰۴۰): کد در «تلاش ناموفق» نمی‌سوزد.
 * هر دانلود موفق bootstrap فقط attemptCount را زیاد می‌کند (تا سقف maxAttempts=۳)
 * و enrollCode را نگه می‌دارد؛ سوختن نهایی فقط با اولین Poll موفق گوشی است
 * (markRelayEnrollCompleted) — یعنی مالک با همان کد تا ۳ بار می‌تواند اسکریپت
 * را بگیرد و اگر وسط کار گوشی/شبکه خطا داد، همان کد دوباره کار می‌کند.
 */
export async function consumeEnrollCode(
  code: string,
  ip: string
): Promise<{ ok: true; device: { deviceId: string; secret: string; label: string; attemptCount: number; maxAttempts: number } } | { ok: false; reason: EnrollRejectReason; retryAfterMinutes?: number }> {
  const device = await db.relayDevice.findFirst({ where: { enrollCode: code } });
  if (!device) return { ok: false, reason: "invalid" };
  if (device.revokedAt) return { ok: false, reason: "revoked" };
  if (device.enrolledAt) return { ok: false, reason: "used" };
  if (!device.enrollExpires || device.enrollExpires.getTime() < Date.now()) {
    return { ok: false, reason: "expired" };
  }
  if (device.attemptCount >= device.maxAttempts) return { ok: false, reason: "limit" };
  // ثبت تلاش — کد هنوز زنده است؛ سوختن با اولین Poll موفق رخ می‌دهد
  await db.relayDevice.update({
    where: { id: device.id },
    data: { attemptCount: { increment: 1 }, lastAttemptAt: new Date(), lastIp: ip },
  });
  return {
    ok: true,
    device: {
      deviceId: device.deviceId,
      secret: device.secret,
      label: device.label,
      attemptCount: device.attemptCount + 1,
      maxAttempts: device.maxAttempts,
    },
  };
}

/**
 * تکمیل نصب — اولین Poll موفق گوشی (کار ۳ سند ۰۴۰).
 * اینجا کد واقعاً می‌سوزد: enrolledAt ثبت می‌شود (enrollCode حفظ می‌شود تا
 * «سوختهٔ کامل» در برابر «نامعتبر» تشخیص داده شود — enrolledAt علامت سوختن است
 * و روت bootstrap پیش از هر چیز آن را چک می‌کند). خروجی: تعداد رکوردهای تازه‌تکمیل (۰/۱).
 */
export async function markRelayEnrollCompleted(deviceId: string): Promise<number> {
  const r = await db.relayDevice.updateMany({
    where: { deviceId, enrolledAt: null, enrollCode: { not: null } },
    data: { enrolledAt: new Date(), enrollExpires: null },
  });
  return r.count;
}

/**
 * وضعیت کد راه‌اندازی برای مالک — کار ۴ سند ۰۴۰ (لایهٔ سرویس، روت سبک).
 * بدون deviceId: تازه‌ترین دستگاهِ صاحب کد. خروجی بدون هیچ رازی.
 */
export async function getRelayCodeStatus(deviceId?: string): Promise<{
  found: boolean;
  deviceId?: string;
  label?: string;
  code?: EnrollCodeView;
}> {
  const device = deviceId
    ? await db.relayDevice.findUnique({ where: { deviceId } })
    : await db.relayDevice.findFirst({ where: { enrollCode: { not: null } }, orderBy: { id: "desc" } });
  if (!device) return { found: false };
  return {
    found: true,
    deviceId: device.deviceId,
    label: device.label,
    code: relayEnrollState(device),
  };
}

/** ابطال دستگاه — فقط مالک */
export async function revokeRelayDevice(deviceId: string): Promise<boolean> {
  const r = await db.relayDevice.updateMany({ where: { deviceId, revokedAt: null }, data: { revokedAt: new Date() } });
  return r.count > 0;
}

/** حضور دستگاه مجازی مرورگر (رویکرد B) — روت browser-poll صدا می‌زند */
export async function touchRelayDevice(deviceId: string, label: string): Promise<void> {
  const existing = await db.relayDevice.findUnique({ where: { deviceId } });
  if (!existing) {
    await db.relayDevice.create({
      data: {
        deviceId,
        secret: randomBytes(32).toString("hex"),
        label,
        enrolledAt: new Date(),
        lastSeenAt: new Date(),
      },
    });
    return;
  }
  await db.relayDevice.update({ where: { id: existing.id }, data: { lastSeenAt: new Date(), ...(existing.revokedAt ? {} : {}) } });
}

// ───────────────────────── صف درخواست‌ها ─────────────────────────

/** انقضای آیتم‌های ماندده (pending/dispatched قدیمی) — خانه‌تکانی سبک */
export async function expireStaleRelayItems(): Promise<number> {
  const cutoff = new Date(Date.now() - RELAY_ITEM_TTL_S * 1000);
  const r = await db.relayQueue.updateMany({
    where: { status: { in: ["pending", "dispatched"] }, enqueuedAt: { lt: cutoff } },
    data: { status: "expired", completedAt: new Date(), error: "TTL" },
  });
  return r.count;
}

/** اثر انگشت یکتا برای دی‌داپ درخواست‌های همسان همزمان */
function requestFingerprint(method: string, url: string, headersJson: string | null, body: string | null): string {
  return sha256(`${method}\n${url}\n${headersJson ?? ""}\n${body ?? ""}`);
}

/** صف‌گذاری یک درخواست عبوری — نقطهٔ ورود armCall (تولید واقعی) و تست دروازه */
export async function enqueueRelayRequest(params: {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string | null;
  source?: string;
}): Promise<{ id: string; fingerprint: string; attached: boolean }> {
  // دفاع در عمق — این تابع فقط میزبان whitelist شده را قبول می‌کند
  if (!isMelkTabrizHost(params.url)) throw new Error("relay: host not allowed");
  // هدرهای عبوری — فقط مجازها نگه داشته می‌شوند (عین Worker)
  const fwd: Record<string, string> = {};
  for (const h of RELAY_FORWARD_HEADERS) {
    const v = params.headers?.[h];
    if (v) fwd[h] = v;
  }
  const headersJson = Object.keys(fwd).length ? JSON.stringify(fwd) : null;
  const fingerprint = requestFingerprint(params.method, params.url, headersJson, params.body ?? null);

  // دی‌داپ: درخواست همسان در ۱۵ ثانیهٔ اخیر که هنوز تمام نشده → همان
  const dup = await db.relayQueue.findFirst({
    where: {
      fingerprint,
      status: { in: ["pending", "dispatched"] },
      enqueuedAt: { gt: new Date(Date.now() - 15_000) },
    },
    orderBy: { enqueuedAt: "desc" },
  });
  if (dup) return { id: dup.id, fingerprint, attached: true };

  const item = await db.relayQueue.create({
    data: {
      method: params.method.toUpperCase(),
      url: params.url,
      headersJson,
      body: params.body ?? null,
      fingerprint,
      source: params.source ?? "armCall",
    },
  });
  return { id: item.id, fingerprint, attached: false };
}

/** برداشتن اتمیک قدیمی‌ترین درخواست pending — با به‌روزرسانی مقید به وضعیت */
export async function claimNextRelayRequest(deviceId: string): Promise<{
  id: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string | null;
  sig: string;
  ts: number;
} | null> {
  await expireStaleRelayItems();
  for (let attempt = 0; attempt < 3; attempt++) {
    const next = await db.relayQueue.findFirst({
      where: { status: "pending" },
      orderBy: { enqueuedAt: "asc" },
    });
    if (!next) return null;
    const claimed = await db.relayQueue.updateMany({
      where: { id: next.id, status: "pending" },
      data: { status: "dispatched", dispatchedAt: new Date(), claimedBy: deviceId },
    });
    if (claimed.count === 1) {
      const device = await db.relayDevice.findUnique({ where: { deviceId } });
      if (device) {
        await db.relayDevice.update({
          where: { id: device.id },
          data: { lastSeenAt: new Date() },
        });
      }
      return {
        id: next.id,
        method: next.method,
        url: next.url,
        headers: next.headersJson ? (JSON.parse(next.headersJson) as Record<string, string>) : {},
        body: next.body,
        sig: relayItemSignature({ id: next.id, method: next.method, url: next.url, body: next.body }, next.enqueuedAt.getTime(), device?.secret ?? ""),
        ts: next.enqueuedAt.getTime(),
      };
    }
    // رقابت با دستگاه دیگر — یک بار دیگر
  }
  return null;
}

/** ثبت نتیجهٔ اجرا از سمت گوشی — روت result */
export async function completeRelayRequest(params: {
  id: string;
  deviceId: string;
  httpStatus?: number;
  contentType?: string | null;
  body?: string | null;
  error?: string | null;
}): Promise<{ ok: boolean; status: number; error?: string }> {
  const item = await db.relayQueue.findUnique({ where: { id: params.id } });
  if (!item) return { ok: false, status: 404, error: "no such request" };
  if (item.status !== "dispatched") return { ok: false, status: 409, error: `state=${item.status}` };
  if (item.claimedBy !== params.deviceId) return { ok: false, status: 403, error: "claimed by another device" };
  const done = params.error
    ? { status: "failed", error: params.error.slice(0, 300) }
    : { status: "done", error: null };
  await db.relayQueue.update({
    where: { id: item.id },
    data: {
      status: done.status,
      completedAt: new Date(),
      responseStatus: params.httpStatus ?? null,
      responseContentType: params.contentType ?? null,
      responseBody: params.body ?? null,
      error: done.error,
    },
  });
  await db.relayDevice.updateMany({
    where: { deviceId: params.deviceId },
    data: {
      lastSeenAt: new Date(),
      servedCount: { increment: 1 },
      ...(params.error ? { errorCount: { increment: 1 } } : {}),
      ...(item.dispatchedAt ? { lastRoundtripMs: Date.now() - item.dispatchedAt.getTime() } : {}),
    },
  });
  return { ok: true, status: 200 };
}

// ───────────────────────── سمت armCall — enqueue + انتظار ─────────────────────────

export class RelayOfflineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RelayOfflineError";
  }
}

/** آیا دستگاه برخطی در پنجرهٔ اخیر poll کرده؟ (پیش‌شرط صف‌گذاری) */
export async function anyRelayDeviceOnline(): Promise<boolean> {
  const since = new Date(Date.now() - RELAY_ONLINE_WINDOW_MS);
  const n = await db.relayDevice.count({
    where: { revokedAt: null, lastSeenAt: { gte: since } },
  });
  return n > 0;
}

/**
 * انتظار برای نتیجهٔ یک آیتم صف — poll داخلی DB (400ms) تا مهلت.
 * خروجی: Response کامل (proxyFetch سازگار) یا پرتاب خطا.
 */
export async function waitRelayResponse(itemId: string, timeoutMs: number, signal?: AbortSignal): Promise<Response> {
  const deadline = Date.now() + Math.min(Math.max(timeoutMs, 1_000), 60_000);
  while (true) {
    const item = await db.relayQueue.findUnique({ where: { id: itemId } });
    if (!item) throw new RelayOfflineError("رله: درخواست ناپدید شد.");
    if (item.status === "done") {
      const headers = new Headers();
      if (item.responseContentType) headers.set("content-type", item.responseContentType);
      headers.set("cache-control", "no-store");
      headers.set("x-melka-relay", "pass");
      return new Response(item.responseBody ?? "", { status: item.responseStatus ?? 200, headers });
    }
    if (item.status === "failed") {
      return new Response(item.error ?? "relay upstream error", {
        status: 502,
        headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-melka-relay": "fail" },
      });
    }
    if (item.status === "expired") {
      throw new RelayOfflineError("رلهٔ موبایل در مهلت مقرر پاسخ برنگرداند (انقضای صف).");
    }
    if (Date.now() >= deadline) throw new RelayOfflineError("رلهٔ موبایل در مهلت مقرر پاسخ برنگرداند (تایم‌اوت).");
    if (signal?.aborted) throw new RelayOfflineError("رله: درخواست لغو شد.");
    await new Promise((r) => setTimeout(r, 400));
  }
}

/**
 * نقطهٔ اتصال proxyFetch — حالت رلهٔ موبایل.
 * فقط وقتی MELK_ARM_RELAY_MODE=mobile و میزبان ملک تبریزی است صدا می‌شود.
 */
export async function relayFetch(url: string, init: RequestInit, timeoutMs = RELAY_WAIT_DEFAULT_MS): Promise<Response> {
  const bodyText = init.body === undefined ? "" : typeof init.body === "string" ? init.body : null;
  if (bodyText === null) throw new RelayOfflineError("رله: بدنهٔ غیرمتنی در قرارداد نیست.");
  const online = await anyRelayDeviceOnline();
  if (!online) throw new RelayOfflineError("رلهٔ موبایل (Poco F3) متصل نیست — اسکریپت رله روی گوشی اجرا نیست.");
  const method = (init.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {};
  const h = init.headers instanceof Headers ? init.headers : new Headers(init.headers);
  for (const [k, v] of h.entries()) headers[k.toLowerCase()] = v;
  const { id } = await enqueueRelayRequest({ method, url, headers, body: bodyText || null });
  return waitRelayResponse(id, timeoutMs, init.signal ?? undefined);
}

// ───────────────────────── نمای وضعیت (UI + شاهدها) ─────────────────────────

export async function relayOverview(): Promise<{
  mode: string;
  active: boolean;
  devices: Array<{
    deviceId: string;
    label: string;
    online: boolean;
    enrolledAt: string | null;
    lastSeenAt: string | null;
    servedCount: number;
    errorCount: number;
    lastRoundtripMs: number | null;
    revoked: boolean;
    /** PN-031-C — وضعیت کد بخشنده برای نمایش در UI تنظیمات */
    enroll: EnrollCodeView;
  }>;
  queue: { pending: number; dispatched: number; done24h: number; failed24h: number; expired24h: number };
}> {
  const since = new Date(Date.now() - RELAY_ONLINE_WINDOW_MS);
  const devices = await db.relayDevice.findMany({ orderBy: { id: "desc" }, take: 20 });
  const dayAgo = new Date(Date.now() - 24 * 3600 * 1000);
  const [pending, dispatched, done24h, failed24h, expired24h] = await Promise.all([
    db.relayQueue.count({ where: { status: "pending" } }),
    db.relayQueue.count({ where: { status: "dispatched" } }),
    db.relayQueue.count({ where: { status: "done", completedAt: { gte: dayAgo } } }),
    db.relayQueue.count({ where: { status: "failed", completedAt: { gte: dayAgo } } }),
    db.relayQueue.count({ where: { status: "expired", completedAt: { gte: dayAgo } } }),
  ]);
  return {
    ...relayConfigStatus(),
    devices: devices.map((d) => ({
      deviceId: d.deviceId,
      label: d.label,
      online: !d.revokedAt && !!d.lastSeenAt && d.lastSeenAt >= since,
      enrolledAt: d.enrolledAt?.toISOString() ?? null,
      lastSeenAt: d.lastSeenAt?.toISOString() ?? null,
      servedCount: d.servedCount,
      errorCount: d.errorCount,
      lastRoundtripMs: d.lastRoundtripMs,
      revoked: !!d.revokedAt,
      enroll: relayEnrollState(d),
    })),
    queue: { pending, dispatched, done24h, failed24h, expired24h },
  };
}

/** تست دروازهٔ مالک — درخواست بی‌خطر ریشهٔ ARM (GET /) با انتظار نتیجه */
export async function runRelayGateTest(timeoutMs = 40_000): Promise<{
  ok: boolean;
  httpStatus?: number;
  roundtripMs: number;
  error?: string;
}> {
  const started = Date.now();
  const online = await anyRelayDeviceOnline();
  if (!online) return { ok: false, roundtripMs: 0, error: "دستگاه رله برخط نیست — اسکریپت روی گوشی اجرا نیست." };
  const { id } = await enqueueRelayRequest({
    method: "GET",
    url: "https://arus-api.melketabriz.ir/",
    source: "gate-test",
  });
  try {
    const res = await waitRelayResponse(id, timeoutMs);
    return { ok: true, httpStatus: res.status, roundtripMs: Date.now() - started };
  } catch (e) {
    return { ok: false, roundtripMs: Date.now() - started, error: (e as Error).message };
  }
}
