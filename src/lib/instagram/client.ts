/**
 * کلاینت Instagram Graph API — انتشار پست/رییلز روی حساب کسب‌وکار
 * ------------------------------------------------------
 * جریان رسمی انتشار (دو مرحله‌ای):
 *   ۱. POST /{ig-user-id}/media      → ساخت «کانتینر» (creation_id)
 *      - پست تصویری: image_url + caption
 *      - رییلز:       media_type=REELS + video_url + caption
 *   ۲. POST /{ig-user-id}/media_publish?creation_id=… → انتشار نهایی
 *      (کانتینر رییلز باید روی سرور اینستاگرام «پردازش» شود؛ چند ثانیه صبر و poll)
 */

import { IG_GRAPH_BASE, IG_GRAPH_VERSION } from "./config";

export interface IgAccountInfo {
  id: string;
  username?: string;
  name?: string;
  followersCount?: number;
  mediaCount?: number;
  accountType?: string;
}

interface GraphResponse<T> {
  data?: T;
  error?: { message: string; type: string; code: number };
}

/** فراخوانی خام Graph API — خطاها به پیام فارسی ترجمه می‌شوند */
async function graphCall<T>(path: string, init: RequestInit): Promise<T> {
  const url = `${IG_GRAPH_BASE}/${IG_GRAPH_VERSION}/${path.replace(/^\//, "")}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
    const text = await res.text().catch(() => "");
    let body: GraphResponse<T> | null = null;
    try {
      body = text ? (JSON.parse(text) as GraphResponse<T>) : null;
    } catch {
      body = null;
    }
    if (body?.error) {
      const msg = translateGraphError(body.error);
      throw new Error(msg);
    }
    if (!res.ok && !body?.data) {
      throw new Error(translateGraphError({ message: text.slice(0, 160) || `HTTP ${res.status}`, type: "http", code: res.status }));
    }
    return (body?.data ?? (body as unknown as T)) as T;
  } catch (err) {
    if (err instanceof Error && (err.name === "AbortError" || err.message.includes("abort"))) {
      throw new Error("پاسخ سرور اینستاگرام در مهلت مقرر دریافت نشد.");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/** ترجمه خطاهای رایج Graph API به فارسی */
export function translateGraphError(e: { message?: string; code?: number; type?: string }): string {
  const m = e.message ?? "";
  if (e.code === 190 || /access token|invalid credential/i.test(m)) {
    return "توکن دسترسی اینستاگرام نامعتبر یا منقضی است — توکن تازه در تنظیمات ثبت کنید.";
  }
  if (e.code === 4 || /rate limit/i.test(m)) {
    return "محدودیت نرخ انتشار اینستاگرام — کمی بعدتر تلاش کنید.";
  }
  if (/media.*not.*ready|not finished processing/i.test(m)) {
    return "رسانه هنوز روی سرور اینستاگرام پردازش نشده است — چند لحظه بعد دوباره منتشر کنید.";
  }
  if (/image.*url|could not download/i.test(m)) {
    return "دانلود تصویر از نشانی آن توسط اینستاگرام ناموفق بود — نشانی تصویر باید عمومی و در دسترس باشد.";
  }
  if (/permission|authorize/i.test(m)) {
    return "توکن مجوز انتشار محتوا (instagram_content_publish) ندارد.";
  }
  return `خطای اینستاگرام: ${m.slice(0, 140)}`;
}

/** ساخت کوئری‌رشته */
function qs(params: Record<string, string | number | boolean | undefined>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  }
  return parts.length ? `?${parts.join("&")}` : "";
}

// ===================== اتصال =====================

/** آزمون اتصال — GET /{igUserId}?fields=username,followers_count */
export async function igTestConnection(token: string, igUserId?: string): Promise<IgAccountInfo> {
  const userPath = igUserId && igUserId.trim() ? igUserId.trim() : "me";
  const info = await graphCall<IgAccountInfo>(
    `${userPath}${qs({ fields: "username,name,followers_count,media_count,account_type", access_token: token })}`,
    { method: "GET" }
  );
  return { ...info, id: (info.id && info.id !== "me" ? info.id : igUserId?.trim()) || info.id || "" };
}

// ===================== انتشار =====================

export interface PublishPostInput {
  igUserId: string;
  token: string;
  /** نوع محتوا */
  kind: "post" | "reel";
  /** نشانی عمومی تصویر اصلی (پست) — برای کروسل چند تصویر */
  imageUrls?: string[];
  /** نشانی عمومی ویدیو (رییلز) */
  videoUrl?: string;
  /** کپشن نهایی (پس از تأیید کاربر) */
  caption: string;
}

export interface PublishResult {
  mediaId: string;
  creationId: string;
  permalink?: string;
}

/** ساخت کانتینر رسانه (گام ۱) */
async function createContainer(input: PublishPostInput): Promise<string> {
  if (input.kind === "reel") {
    if (!input.videoUrl) throw new Error("برای انتشار رییلز، نشانی عمومی ویدیو لازم است.");
    const res = await graphCall<{ id: string }>(
      `${input.igUserId}/media${qs({
        media_type: "REELS",
        video_url: input.videoUrl,
        caption: input.caption.slice(0, 2200),
        share_to_feed: true,
        access_token: input.token,
      })}`,
      { method: "POST" }
    );
    return res.id;
  }
  const imageUrl = input.imageUrls?.[0];
  if (!imageUrl) throw new Error("برای انتشار پست، حداقل یک تصویر با نشانی عمومی لازم است.");
  const res = await graphCall<{ id: string }>(
    `${input.igUserId}/media${qs({ image_url: imageUrl, caption: input.caption.slice(0, 2200), access_token: input.token })}`,
    { method: "POST" }
  );
  return res.id;
}

/** انتشار کانتینر (گام ۲) — با پایش آماده‌شدن رییلز */
export async function igPublish(input: PublishPostInput): Promise<PublishResult> {
  const creationId = await createContainer(input);

  // رییلز: باید ASYNC_PROCESSING تمام شود — تا ۳۰ ثانیه poll
  if (input.kind === "reel") {
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const status = await graphCall<{ status_code?: string }>(
        `${creationId}${qs({ fields: "status_code", access_token: input.token })}`,
        { method: "GET" }
      ).catch(() => ({ status_code: "IN_PROGRESS" }));
      if (status.status_code === "FINISHED") break;
      if (status.status_code === "ERROR") throw new Error("پردازش ویدیوی رییلز روی سرور اینستاگرام شکست خورد.");
    }
  } else {
    // تصویر: چند ثانیه مهلت پردازش اولیه
    await new Promise((r) => setTimeout(r, 2500));
  }

  const published = await graphCall<{ id: string }>(
    `${input.igUserId}/media_publish${qs({ creation_id: creationId, access_token: input.token })}`,
    { method: "POST" }
  );
  const permalink = await graphCall<{ permalink }>(
    `${published.id}${qs({ fields: "permalink", access_token: input.token })}`,
    { method: "GET" }
  ).catch(() => ({ permalink: undefined }));

  return { mediaId: published.id, creationId, permalink: permalink.permalink };
}
