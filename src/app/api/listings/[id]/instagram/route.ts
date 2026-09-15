/**
 * /api/listings/[id]/instagram — کلید «انتقال به اینستاگرام» (بخش «پ»)
 * ------------------------------------------------------
 * GET  ?tone=… — تولید محتوای هوشمند (کپشن + هشتگ + انتخاب پست/رییلز) از فایل آگهی
 * POST — انتشار پس از تأیید کاربر (کپشن نهایی + رسانه) روی حساب اینستاگرام کسب‌وکار
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";
import { audit } from "@/lib/auth/session";
import { generateInstagramContent } from "@/lib/instagram/content";
import { loadInstagramSettings, readInstagramCredentials, logInstagramPost, updateInstagramPostLog, getInstagramStatus } from "@/lib/instagram/store";
import { igPublish } from "@/lib/instagram/client";
import type { IgTone } from "@/lib/instagram/config";
import { priceEvaluationLabel, desirabilityLabel, sellReasonLabel } from "@/lib/listing/types";

function buildSource(rec: NonNullable<Awaited<ReturnType<typeof db.listingRecord.findUnique>>>) {
  let inputs: Record<string, string> = {};
  try {
    inputs = rec.inputsJson ? (JSON.parse(rec.inputsJson) as Record<string, string>) : {};
  } catch {
    inputs = {};
  }
  let images: string[] = [];
  try {
    images = rec.imagesJson ? (JSON.parse(rec.imagesJson) as string[]) : [];
  } catch {
    images = [];
  }
  let videos: string[] = [];
  try {
    videos = rec.videosJson ? (JSON.parse(rec.videosJson) as string[]) : [];
  } catch {
    videos = [];
  }
  return {
    listing: rec,
    inputs,
    images,
    videos,
  };
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const { id } = await ctx.params;
  const rec = await db.listingRecord.findUnique({ where: { id } });
  if (!rec) return errorResponse(new MelkApiError("NOT_FOUND", "این فایل آگهی یافت نشد.", 404, false));

  const url = new URL(request.url);
  const toneParam = url.searchParams.get("tone") as IgTone | null;
  const settings = await loadInstagramSettings();
  const tone: IgTone = toneParam ?? settings.defaultTone;

  const { inputs, images, videos } = buildSource(rec);
  const content = generateInstagramContent(
    {
      propertyTypeName: rec.propertyTypeName,
      tradeTypeName: rec.tradeTypeName,
      buildingTypeName: rec.buildingTypeName,
      lineName: rec.lineName,
      areaName: rec.areaName,
      inputs,
      priceEvaluationLabel: priceEvaluationLabel(rec.priceEvaluation),
      desirabilityLabel: desirabilityLabel(rec.desirabilityLevel),
      sellReasonLabel: sellReasonLabel(rec.sellReason),
      description: rec.description,
      isLuxury: rec.isLuxury,
      isUrgent: rec.isUrgent,
      isVacation: rec.isVacation,
      imageCount: images.length,
      videoCount: videos.length,
    },
    tone,
    settings.includeContactInCaption ? settings.contactLine : undefined
  );

  const conn = await getInstagramStatus();
  const price = inputs["قیمت"] ?? null;

  return Response.json({
    ok: true,
    content,
    media: { images, videos },
    price,
    tones: [
      { value: "professional", label: "رسمی و حرفه‌ای" },
      { value: "warm", label: "صمیمی و پرانرژی" },
      { value: "urgent", label: "فوری و فرصت‌محور" },
    ],
    connection: {
      connected: conn.status === "connected",
      username: conn.username,
      message:
        conn.status === "connected"
          ? `محتوا روی حساب «${conn.username ?? "اینستاگرام"}» منتشر می‌شود.`
          : "اتصال اینستاگرام برقرار نیست — از تنظیمات عمومی، حساب کسب‌وکار را متصل کنید.",
    },
    published: rec.instagramPublishedAt ? { at: rec.instagramPublishedAt.toISOString(), mediaId: rec.instagramMediaId } : null,
  });
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const { id } = await ctx.params;
  const rec = await db.listingRecord.findUnique({ where: { id } });
  if (!rec) return errorResponse(new MelkApiError("NOT_FOUND", "این فایل آگهی یافت نشد.", 404, false));

  let body: { caption?: string; kind?: "post" | "reel"; imageUrl?: string; videoUrl?: string; tone?: string; confirmed?: boolean };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "بدنه درخواست نامعتبر است.", 400, false));
  }

  if (!body.confirmed) {
    return errorResponse(
      new MelkApiError("PRECONDITION_FAILED", "انتشار اینستاگرام نیازمند تأیید نهایی کاربر است — پیش‌نمایش را بررسی و تأیید کنید.", 412, false)
    );
  }

  const credentials = await readInstagramCredentials();
  if (!credentials) {
    return errorResponse(
      new MelkApiError("PRECONDITION_FAILED", "اتصال اینستاگرام برقرار نیست — توکن Graph API را از تنظیمات عمومی ثبت کنید.", 412, false)
    );
  }

  const { inputs, images, videos } = buildSource(rec);
  const kind: "post" | "reel" = body.kind ?? (videos.length > 0 ? "reel" : "post");
  const caption = (body.caption ?? "").trim();
  if (caption.length < 5) {
    return errorResponse(new MelkApiError("UNKNOWN", "کپشن انتشار خالی است — متن محتوا را تأیید کنید.", 400, false));
  }

  const imageUrl = body.imageUrl?.trim() || images[0] || null;
  const videoUrl = body.videoUrl?.trim() || videos[0] || null;
  if (kind === "post" && !imageUrl) {
    return errorResponse(
      new MelkApiError("UNKNOWN", "برای انتشار پست، نشانی عمومی تصویر لازم است — نشانی تصویر را وارد کنید.", 400, false)
    );
  }

  // ثبت گزارش محتوا (فقط افزودنی) — وضعیت approved پیش از انتشار
  const logId = await logInstagramPost({
    listingId: id,
    kind,
    caption,
    media: kind === "reel" ? [videoUrl ?? ""] : [imageUrl ?? ""],
    status: "approved",
    actorCode: guard.personnelCode,
  });

  try {
    const result = await igPublish({
      igUserId: credentials.igUserId,
      token: credentials.token,
      kind,
      imageUrls: kind === "post" ? [imageUrl!] : undefined,
      videoUrl: kind === "reel" ? videoUrl ?? undefined : undefined,
      caption,
    });

    const publishedAt = new Date();
    await updateInstagramPostLog(logId, { status: "published", publishedAt, resultJson: result });
    await db.listingRecord.update({
      where: { id },
      data: {
        instagramPublishedAt: publishedAt,
        instagramMediaId: result.mediaId,
        instagramPostJson: JSON.stringify({ kind, caption, tone: body.tone ?? "professional", media: kind === "reel" ? [videoUrl] : [imageUrl], permalink: result.permalink ?? null, mediaId: result.mediaId }),
      },
    });
    await audit("LISTING_INSTAGRAM_PUBLISH", guard.personnelCode, `id=${id} kind=${kind} mediaId=${result.mediaId}`);
    return Response.json({
      ok: true,
      mediaId: result.mediaId,
      permalink: result.permalink ?? null,
      kind,
      message: `محتوا با موفقیت در اینستاگرام ${kind === "reel" ? "منتشر (رییلز)" : "منتشر (پست)"} شد.`,
    });
  } catch (err) {
    const message = (err as Error).message ?? "انتشار در اینستاگرام ناموفق بود.";
    await updateInstagramPostLog(logId, { status: "failed", resultJson: { error: message } });
    await audit("LISTING_INSTAGRAM_PUBLISH_FAIL", guard.personnelCode, `id=${id} ${message.slice(0, 100)}`).catch(() => undefined);
    return errorResponse(new MelkApiError("UNKNOWN", message, 502, false));
  }
}
