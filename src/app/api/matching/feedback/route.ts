/**
 * POST /api/matching/feedback — PN-028/رابعاً-ج (دستور مالک)
 * ---------------------------------------------------------------------------
 * «کلید رد ... چند مورد گزینه رد پیشنهاد قابل تیم زدن وجود داشته باشد و
 * آخرین گزینه سایر باشد و کاربر دلیل رد پیشنهاد را در آن درج کند تا مغز ملکا
 * دلیل واقعی رد را متوجه شده و در پیشنهادهای تطبیق آینده آن را تکرار نکند.»
 *
 * بدنه: { direction, listingCode, requestCode, reasons: string[], note?, scoreAtReject? }
 * سه‌لایهٔ یادگیری (همه در یک فراخوانی — در لایهٔ سرویس):
 *   ۱) MatchRejectionRecord — جفت (آگهی×درخواست) دیگر هرگز پیشنهاد نمی‌شود
 *   ۲) دلایل ساختاریافته — وزن عامل متناظر در پیشنهادهای آینده تقویت می‌شود
 *   ۳) AgentFeedback کاشی smart-matching — همان حلقهٔ وزن‌های آموخته (PN-011)
 * محدودیت: «سایر» بدون یادداشت پذیرفته نمی‌شود — دلیل واقعی، سوخت یادگیری است.
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { audit } from "@/lib/auth/session";
import { recordMatchRejection, rejectionStats } from "@/core/matching/rejection-store";

export const dynamic = "force-dynamic";

/** کلیدهای دلایل مجاز — عین دیالوگ رد (فایل MatchRejectDialog) */
const ALLOWED_REASONS = new Set([
  "price", "geo", "meterage", "type", "rooms", "floor", "age", "stale",
  "dealt", "customer", "expert", "other",
]);

async function getDb() {
  const mod = (await import("@/lib/db")) as { db: import("@prisma/client").PrismaClient };
  return mod.db;
}

export async function POST(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  let body: {
    direction?: string;
    listingCode?: string;
    requestCode?: string;
    reasons?: string[];
    note?: string;
    scoreAtReject?: number;
    factors?: Array<{ factor: string; value: number }>;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "بدنه درخواست نامعتبر است.", 400, false));
  }

  const direction = body.direction === "request_to_listing" ? "request_to_listing" : "listing_to_request";
  const listingCode = typeof body.listingCode === "string" && body.listingCode.trim() ? body.listingCode.trim() : null;
  const requestCode = typeof body.requestCode === "string" && body.requestCode.trim() ? body.requestCode.trim() : null;
  const reasons = Array.isArray(body.reasons) ? body.reasons.filter((r) => typeof r === "string" && ALLOWED_REASONS.has(r)) : [];
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";
  const scoreAtReject = typeof body.scoreAtReject === "number" && Number.isFinite(body.scoreAtReject) ? body.scoreAtReject : null;

  if (!listingCode && !requestCode) {
    return errorResponse(new MelkApiError("UNPROCESSABLE", "کد آگهی یا کد درخواست الزامی است.", 400, false));
  }
  if (reasons.length === 0) {
    return errorResponse(new MelkApiError("UNPROCESSABLE", "حداقل یک دلیل رد انتخاب کنید — دلایل، سوخت یادگیری مغز ملکا هستند.", 400, false));
  }
  if (reasons.includes("other") && !note) {
    return errorResponse(new MelkApiError("UNPROCESSABLE", "برای گزینهٔ «سایر»، توضیح دلیل رد را بنویسید تا مغز ملکا آن را بیاموزد.", 400, false));
  }

  const db = await getDb();
  const { rejectionId } = await recordMatchRejection(db, {
    direction,
    listingCode,
    requestCode,
    reasons,
    note: note || null,
    scoreAtReject,
    factors: Array.isArray(body.factors) ? body.factors : [],
    actorCode: guard.personnelCode,
  });

  await audit("MATCH_REJECT_WITH_REASONS", guard.personnelCode, `pair=${listingCode ?? "-"}|${requestCode ?? "-"};reasons=${reasons.join(",")}`).catch(() => undefined);

  return Response.json({
    ok: true,
    rejectionId,
    message: "رد ثبت شد و مغز ملکا آموخت — این جفت دیگر پیشنهاد نمی‌شود و دلایل رد در وزن‌های پیشنهادهای آینده لحاظ می‌شود.",
  });
}

/** GET /api/matching/feedback — درس‌های آموخته‌شده تاکنون (شفافیت کامل یادگیری) */
export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const db = await getDb();
  const stats = await rejectionStats(db);

  return Response.json({
    ok: true,
    ...stats,
    note: "دلایل پرتکرار رد، وزن عامل متناظر را در پیشنهادهای تطبیق آینده تقویت می‌کنند (PN-028/رابعاً-ج).",
  });
}
