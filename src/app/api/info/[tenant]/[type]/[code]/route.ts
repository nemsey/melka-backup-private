/**
 * /api/info/[tenant]/[type]/[code] — ستون «اطلاعات» (PN-045 · فاز ۳ — شورا-ن۰۸۹)
 * ---------------------------------------------------------------------------
 * GET — فایل اطلاعات کامل یک کد: (۱) فیلدهای نرمال‌شده (۲) دادهٔ خام منبع
 *       (۳) متادیتای استخراج — «پنجره‌ای به دادهٔ خام» (بخش ۱ گزارش شورا).
 *
 * گارد: نشست + دسترسی کاشی همان فهرست (عین الگوی owner-notes — PN-039):
 *   · listing → کاشی arm-listings · request → کاشی arm-requests
 *   · transaction → transactions-contracts · expert → experts
 * مرز مخزن (PN-012/۱.۳): صفر db.* در روت — تولید از generator (lib).
 *
 * تولید: lazy — هر GET فایل را از رکورد تازه regenerate می‌کند (بدون LLM،
 * بدون هزینه). کد ضد پیمایش مسیر: فقط [A-Za-z0-9_-] (سقف ۶۴).
 * پاسخ (پیش‌فرض): text/plain; charset=utf-8 — فایل متنی خوانا برای مالک.
 * PN-047/گام دوم-۱: ?format=json → سند ساختاری InfoDoc برای UI زیبای
 * فایل اطلاعات (همانند فایل قرارداد) — فایل متنی همچنان روی دیسک regenerate
 * می‌شود (شاهد PN-045 دست‌نخورده).
 * PN-049/گام ۲-الف (قانون حساب کاربری): برای type=listing/request و نشست
 * غیر-مالک، فایل فقط وقتی باز می‌شود که رکورد توسط خود کاربر ثبت شده باشد
 * (عین دامنهٔ فهرست‌ها — مالک: صفر فیلتر).
 */

import { NextRequest } from "next/server";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { requireTileAccessFor } from "@/lib/access/personnel-access";
import { MelkApiError } from "@/lib/melk-api/types";
import {
  generateInfoDoc,
  generateInfoFile,
  infoRecordRegistrarRaw,
  isInfoTenant,
  isInfoType,
  isValidInfoCode,
} from "@/lib/info-files/generator";
import { catalogUserScope } from "@/lib/access/scope";
import { normalizeFilterInput } from "@/lib/normalize-input";

/** type → کاشیِ همان فهرست (مرز دسترسی — عین الگوی owner-notes) */
const TYPE_TILE: Record<string, "arm-listings" | "arm-requests" | "transactions-contracts" | "experts"> = {
  listing: "arm-listings",
  request: "arm-requests",
  transaction: "transactions-contracts",
  expert: "experts",
};

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ tenant: string; type: string; code: string }> }
) {
  const guard = await requireSessionAsync(_request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const { tenant, type, code } = await ctx.params;

  if (!isInfoTenant(tenant)) {
    return errorResponse(new MelkApiError("UNKNOWN", "tenant نامعتبر است (tabriz | melketun).", 400, false));
  }
  if (!isInfoType(type)) {
    return errorResponse(
      new MelkApiError("UNKNOWN", "نوع رکورد نامعتبر است (listing | request | transaction | expert).", 400, false)
    );
  }
  if (!isValidInfoCode(code)) {
    return errorResponse(new MelkApiError("UNKNOWN", "کد رکورد نامعتبر است (فقط حروف/رقم/خط تیره).", 400, false));
  }

  const tileAccess = await requireTileAccessFor(guard, TYPE_TILE[type]);
  if (tileAccess instanceof MelkApiError) return errorResponse(tileAccess);

  // PN-049/گام ۲-الف — قانون حساب کاربری: فایل اطلاعاتِ رکورد فقط برای ثبت‌کنندهٔ خودش
  // (و مالک) باز است — عین دامنهٔ فهرست‌ها؛ نشت از مسیر مستقیم کد ناممکن.
  const infoScope = catalogUserScope(guard);
  if (infoScope.kind === "OWN" && (type === "listing" || type === "request")) {
    const registrarRaw = await infoRecordRegistrarRaw(tenant, type, code);
    const registrarNorm = normalizeFilterInput(registrarRaw ?? "");
    if (registrarNorm !== infoScope.nameNorm) {
      return errorResponse(
        new MelkApiError(
          "FORBIDDEN",
          "این رکورد توسط شما ثبت نشده است — طبق قانون حساب کاربری، فایل اطلاعات فقط برای رکوردهای خود شما باز است (PN-049).",
          403,
          false
        )
      );
    }
  }

  try {
    // PN-047/گام دوم-۱ — حالت سند ساختاری برای UI زیبا (فایل قرارداد-گونه)
    if (_request.nextUrl.searchParams.get("format") === "json") {
      const doc = await generateInfoDoc(tenant, type, code);
      return Response.json(doc, {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "X-Info-Found": doc.found ? "1" : "0",
        },
      });
    }
    const result = await generateInfoFile(tenant, type, code);
    return new Response(result.content, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Info-Found": result.found ? "1" : "0",
      },
    });
  } catch (err) {
    return errorResponse(
      new MelkApiError("UNKNOWN", (err as Error)?.message ?? "خطای تولید فایل اطلاعات", 500, false)
    );
  }
}
