/**
 * /api/divar/ads/[token]/reject — کلید «رد آگهی» با چک‌لیست دلایل + یادگیری
 * ------------------------------------------------------
 * POST { reasons: string[], note?: string }
 *  • چک‌لیست دلایل احتمالی رد (پیش‌بینی‌شده توسط ایجنت) تیک‌خورده + توضیح کاربر
 *  • سیگنال یادگیری در DivarRejectLog ثبت می‌شود (فقط افزودنی)
 *  • خود آگهی هرگز آرشیو نمی‌شود — رکورد DivarAd حذف می‌گردد
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";
import { audit } from "@/lib/auth/session";
import { divarAgent } from "@/core/agent/divar-agent";

const KNOWN_REASONS = new Set([
  "broker", "semi-personal", "no-price", "overpriced", "location",
  "not-underpriced", "already-sold", "condition", "other",
]);

export async function POST(request: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const { token } = await ctx.params;
  let body: { reasons?: string[]; note?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "بدنه درخواست نامعتبر است.", 400, false));
  }

  const reasons = Array.isArray(body.reasons) ? body.reasons.filter((r) => KNOWN_REASONS.has(r)) : [];
  if (reasons.length === 0) {
    return errorResponse(
      new MelkApiError("UNKNOWN", "حداقل یک دلیل از چک‌لیست انتخاب کنید — این دلایل مبنای یادگیری ایجنت‌اند.", 400, false)
    );
  }
  const note = typeof body.note === "string" ? body.note.slice(0, 1000) : null;

  // HOTFIX-04 (B1): کل زنجیره DB با try/catch — خطای پایگاه هرگز 500 خام نمی‌شود
  try {
    const ad = await db.divarAd.findUnique({ where: { token } });
    if (!ad) {
      return errorResponse(new MelkApiError("NOT_FOUND", "این فایل یافت نشد — ممکن است قبلاً رد شده باشد.", 404, false));
    }

    // ۱) سیگنال یادگیری — فقط افزودنی (آگهی آرشیو نمی‌شود؛ فقط ویژگی‌های لازم برای یادگیری می‌ماند)
    await db.divarRejectLog.create({
      data: {
        token,
        reasons: JSON.stringify(reasons),
        note,
        scoreSnapshotJson: JSON.stringify({
          personal: ad.personalScore,
          underprice: ad.underpriceScore,
          other: ad.otherScore,
          location: ad.locationScore,
          total: ad.totalScore,
          bucket: ad.bucket,
        }),
        featureSnapshotJson: JSON.stringify({
          title: ad.title,
          category: ad.category,
          description: (ad.description ?? "").slice(0, 600),
          matchedLineName: ad.matchedLineName,
          matchedAreaName: ad.matchedAreaName,
          pricePerMeter: ad.pricePerMeter,
        }),
        actorCode: guard.personnelCode,
      },
    });

    // ۲) حافظه ایجنت — یادگیری از دلایل رد
    await db.agentMemory.create({
      data: {
        tileId: divarAgent.tileId,
        kind: "REJECT",
        payload: JSON.stringify({
          at: new Date().toISOString(),
          token,
          reasons,
          note,
          personal: ad.personalScore,
          underprice: ad.underpriceScore,
          other: ad.otherScore,
          location: ad.locationScore,
          total: ad.totalScore,
          title: ad.title.slice(0, 120),
          line: ad.matchedLineName,
        }),
      },
    });

    // ۳) آگهی هرگز آرشیو نمی‌شود — حذف کامل رکورد
    await db.divarAd.delete({ where: { token } });

    await audit("DIVAR_REJECT", guard.personnelCode, `token=${token} reasons=${reasons.join(",")}`);

    return Response.json({
      ok: true,
      message: "فایل رد شد — آگهی آرشیو نمی‌شود و فقط سیگنال یادگیری آن نگه داشته می‌شود تا ایجنت این اشتباه را تکرار نکند.",
      learned: { reasons, note },
    });
  } catch {
    return errorResponse(
      new MelkApiError("UNKNOWN", "رد فایل ناموفق بود — احتمالاً مشکل موقت پایگاه داده. چند لحظه بعد دوباره تلاش کنید.", 500, false)
    );
  }
}
