/**
 * لایه ذخیره‌سازی اینستاگرام — اتصال (رمزنگاری‌شده) و گزارش محتوا/انتشار
 */

import { db } from "@/lib/db";
import { encryptSecret, decryptSecret } from "@/lib/auth/crypto";
import { igTestConnection } from "./client";
import { IG_DEFAULT_SETTINGS, type InstagramSettings } from "./config";

// ===================== اتصال =====================

export interface InstagramConnectionStatus {
  status: "connected" | "disconnected" | "error";
  igUserId: string | null;
  username: string | null;
  displayName: string | null;
  followersCount: number | null;
  hasToken: boolean;
  lastCheckedAt: string | null;
  lastError: string | null;
}

/** وضعیت اتصال اینستاگرام */
export async function getInstagramStatus(): Promise<InstagramConnectionStatus> {
  const row = await db.instagramConnection.findFirst();
  if (!row) {
    return {
      status: "disconnected",
      igUserId: null,
      username: null,
      displayName: null,
      followersCount: null,
      hasToken: false,
      lastCheckedAt: null,
      lastError: null,
    };
  }
  return {
    status: (row.status as InstagramConnectionStatus["status"]) ?? "disconnected",
    igUserId: row.igUserId ?? null,
    username: row.username ?? null,
    displayName: row.displayName ?? null,
    followersCount: null,
    hasToken: Boolean(row.tokenEnc),
    lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
    lastError: row.lastError ?? null,
  };
}

/** ذخیره اعتبارنامه + آزمون زنده */
export async function saveInstagramConnection(input: {
  accessToken: string;
  igUserId?: string;
}): Promise<{ ok: boolean; message: string; username?: string; followersCount?: number }> {
  const token = input.accessToken.trim();
  if (token.length < 20) {
    return { ok: false, message: "توکن دسترسی اینستاگرام نامعتبر است (کوتاه‌تر از حد معمول)." };
  }
  try {
    const info = await igTestConnection(token, input.igUserId);
    const username = info.username ?? undefined;
    await db.instagramConnection.upsert({
      where: { id: rowId() },
      create: {
        id: rowId(),
        status: "connected",
        igUserId: input.igUserId?.trim() || info.id || null,
        username: username ?? null,
        displayName: info.name ?? username ?? null,
        tokenEnc: encryptSecret(token),
        lastCheckedAt: new Date(),
        lastError: null,
      },
      update: {
        status: "connected",
        igUserId: input.igUserId?.trim() || info.id || null,
        username: username ?? null,
        displayName: info.name ?? username ?? null,
        tokenEnc: encryptSecret(token),
        lastCheckedAt: new Date(),
        lastError: null,
      },
    });
    return {
      ok: true,
      message: `اتصال برقرار است — حساب «${username ?? "اینستاگرام"}» شناسایی شد.`,
      username,
      followersCount: info.followersCount,
    };
  } catch (err) {
    const message = (err as Error).message ?? "آزمون اتصال ناموفق بود.";
    await db.instagramConnection.upsert({
      where: { id: rowId() },
      create: { id: rowId(), status: "error", igUserId: input.igUserId?.trim() || null, tokenEnc: encryptSecret(token), lastCheckedAt: new Date(), lastError: message },
      update: { status: "error", igUserId: input.igUserId?.trim() || null, tokenEnc: encryptSecret(token), lastCheckedAt: new Date(), lastError: message },
    });
    return { ok: false, message };
  }
}

/** آزمون مجدد اتصال موجود */
export async function retestInstagramConnection(): Promise<{ ok: boolean; message: string; username?: string }> {
  const row = await db.instagramConnection.findFirst();
  const token = decryptSecret(row?.tokenEnc ?? null);
  if (!token) {
    return { ok: false, message: "هیچ توکنی ثبت نشده است." };
  }
  try {
    const info = await igTestConnection(token, row?.igUserId ?? undefined);
    await db.instagramConnection.update({
      where: { id: row!.id },
      data: { status: "connected", username: info.username ?? row?.username ?? null, lastCheckedAt: new Date(), lastError: null },
    });
    return { ok: true, message: `اتصال سالم است — «${info.username ?? row?.username ?? "اینستاگرام"}»`, username: info.username };
  } catch (err) {
    const message = (err as Error).message;
    await db.instagramConnection.update({
      where: { id: row!.id },
      data: { status: "error", lastCheckedAt: new Date(), lastError: message },
    }).catch(() => undefined);
    return { ok: false, message };
  }
}

/** ریست اتصال */
export async function resetInstagramConnection(): Promise<void> {
  await db.instagramConnection.deleteMany({});
}

/** خواندن اعتبارنامه برای انتشار */
export async function readInstagramCredentials(): Promise<{ token: string; igUserId: string } | null> {
  const row = await db.instagramConnection.findFirst();
  const token = decryptSecret(row?.tokenEnc ?? null);
  const igUserId = row?.igUserId?.trim();
  if (!token || !igUserId) return null;
  return { token, igUserId };
}

// ===================== تنظیمات =====================

const SETTINGS_KEY = "instagram-settings";

export async function loadInstagramSettings(): Promise<InstagramSettings> {
  const row = await db.refListCache.findUnique({ where: { key: SETTINGS_KEY } });
  if (!row) return { ...IG_DEFAULT_SETTINGS };
  try {
    return { ...IG_DEFAULT_SETTINGS, ...(JSON.parse(row.dataJson) as Partial<InstagramSettings>) };
  } catch {
    return { ...IG_DEFAULT_SETTINGS };
  }
}

export async function saveInstagramSettings(patch: Partial<InstagramSettings>): Promise<InstagramSettings> {
  const current = await loadInstagramSettings();
  const next: InstagramSettings = {
    defaultTone: patch.defaultTone ?? current.defaultTone,
    includeContactInCaption: patch.includeContactInCaption ?? current.includeContactInCaption,
    contactLine: (patch.contactLine ?? current.contactLine).slice(0, 80),
  };
  await db.refListCache.upsert({
    where: { key: SETTINGS_KEY },
    create: { key: SETTINGS_KEY, dataJson: JSON.stringify(next) },
    update: { dataJson: JSON.stringify(next) },
  });
  return next;
}

// ===================== گزارش محتوا (فقط افزودنی) =====================

export async function logInstagramPost(input: {
  listingId: string;
  kind: "post" | "reel";
  caption: string;
  media: string[];
  status: "generated" | "approved" | "published" | "failed";
  resultJson?: unknown;
  publishedAt?: Date;
  actorCode: string;
}): Promise<string> {
  const row = await db.instagramPostLog.create({
    data: {
      listingId: input.listingId,
      kind: input.kind,
      caption: input.caption,
      mediaJson: JSON.stringify(input.media),
      status: input.status,
      resultJson: input.resultJson ? JSON.stringify(input.resultJson) : null,
      publishedAt: input.publishedAt ?? null,
      actorCode: input.actorCode,
    },
  });
  return row.id;
}

export async function updateInstagramPostLog(id: string, patch: { status?: string; resultJson?: unknown; publishedAt?: Date }): Promise<void> {
  await db.instagramPostLog
    .update({
      where: { id },
      data: {
        ...(patch.status ? { status: patch.status } : {}),
        ...(patch.resultJson !== undefined ? { resultJson: JSON.stringify(patch.resultJson) } : {}),
        ...(patch.publishedAt ? { publishedAt: patch.publishedAt } : {}),
      },
    })
    .catch(() => undefined);
}

/** id یکتای رکورد اتصال */
function rowId(): string {
  return "singleton";
}
