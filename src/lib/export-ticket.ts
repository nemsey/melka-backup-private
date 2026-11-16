/**
 * بلیت دانلود اکسل — امضاشده و بی‌حالت (DIR-EXCEL-FIX-001)
 * ------------------------------------------------------
 * ریشهٔ حادثهٔ ۱۴۰۵/۰۸/۲۴ (۲۲:۵۰ تهران): دانلود اکسل «فهرست درخواست» و
 * «فهرست معاملات» در سمت کاربر بی‌صدا شکست می‌خورد — الگوی fetch→Blob→
 * createObjectURL→a.click() در WebViewهای موبایل و مرورگرهای درون‌برنامه‌ای
 * پشتیبانی نمی‌شود و فایل ۲۲MB در حافظهٔ گوشی هم امر نامطمئن است؛ شاهد
 * سرور: صفر درخواست export از مرورگر مالک، در حالی که نسخهٔ curl همان
 * مسیرها 200/۲۲MB در ۱۱ث بود.
 *
 * درمان: دانلودِ «بومیِ» مرورگر — ناوبری مستقیم به URL با
 * Content-Disposition: attachment. چون سرآیند Authorization در ناوبری
 * بومی قابل ارسال نیست، مسیر export بلیت یک‌بارمصرفِ امضاشده (HMAC-SHA256)
 * می‌پذیرد:
 *   ۱) کلاینت با Bearer یک بلیت می‌گیرد (POST /api/crm/export/ticket)
 *   ۲) مرورگر به /api/crm/export/{entity}?ticket=… ناوبری می‌کند —
 *      دانلود بومی با پیشرفت/ادامهٔ خودکار، بدون Blob در حافظه.
 *
 * امنیت: بلیت ۱۸۰ ثانیه عمر دارد، دامنه و نقش و نامِ کاربر را امضاشده
 * حمل می‌کند (عین همان دامنه‌ای که فهرست می‌بیند — قانون حساب کاربری
 * PN-049 عیناً برقرار)، و کلید امضا از MELK_TOKEN_KEY مشتق می‌شود
 * (SEC-2 — بدون راز جدید). توکن نشست هرگز وارد URL نمی‌شود.
 */

import { createHash, createHmac, timingSafeEqual } from "crypto";

export const EXPORT_ENTITIES = ["listings", "requests", "transactions", "experts"] as const;
export type ExportEntity = (typeof EXPORT_ENTITIES)[number];

/** عمر بلیت — ۳ دقیقه (فقط پنجرهٔ کلیک تا شروع دانلود) */
export const EXPORT_TICKET_TTL_MS = 180_000;

/** سقف رشتهٔ کوئری فیلترها داخل بلیت */
const MAX_Q_LEN = 400;

export interface ExportTicketPayload {
  /** موجودیت خروجی */
  e: ExportEntity;
  /** کوئری‌رشتهٔ فیلترهای فعال (همان پارامترهای فهرست) */
  q: string;
  /** نقش نشست سازنده (OWNER | CONSULTANT | …) */
  r: string;
  /** دامنهٔ دادهٔ نشست (OWNER | BRANCH | CONSULTANT | "") */
  s: string;
  /** نام نمایشی نشست (پایهٔ دامنهٔ OWN — قانون حساب کاربری) */
  n: string;
  /** زمان انقضا (epoch-ms) */
  x: number;
}

function ticketSecret(): string {
  const base = process.env.MELK_TOKEN_KEY?.trim();
  if (!base) {
    throw new Error("[export-ticket:fail-fast] MELK_TOKEN_KEY تنظیم نشده است — امضای بلیت ممکن نیست (SEC-2)");
  }
  return createHash("sha256").update(`export-ticket:${base}`, "utf8").digest("base64");
}

/** ساخت بلیت امضاشده — «payloadBase64url.sigBase64url» */
export function signExportTicket(p: ExportTicketPayload): string {
  const body = Buffer.from(JSON.stringify(p), "utf8").toString("base64url");
  const sig = createHmac("sha256", ticketSecret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/**
 * وارسی بلیت برای موجودیت معیّن — همه‌چیز یا پیام منفی:
 * امضا یا انقضا یا ناهمخوانی موجودیت ⇒ null (بدون افشای دلیل دقیق).
 */
export function verifyExportTicket(ticket: string, entity: string): ExportTicketPayload | null {
  if (!ticket || ticket.length > 2048) return null;
  const dot = ticket.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = ticket.slice(0, dot);
  const sig = Buffer.from(ticket.slice(dot + 1), "base64url");
  if (sig.length !== 32) return null;
  const expect = createHmac("sha256", ticketSecret()).update(body).digest();
  if (!timingSafeEqual(sig, expect)) return null;
  let p: ExportTicketPayload;
  try {
    p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ExportTicketPayload;
  } catch {
    return null;
  }
  if (typeof p !== "object" || p === null) return null;
  if (p.e !== entity) return null;
  if (typeof p.x !== "number" || !Number.isFinite(p.x) || Date.now() > p.x) return null;
  if (typeof p.q !== "string" || p.q.length > MAX_Q_LEN) return null;
  if (typeof p.r !== "string" || typeof p.n !== "string" || typeof p.s !== "string") return null;
  return p;
}
