/**
 * POST /api/crm/arm-catalog/sync — استخراج/بروزرسانی کاتالوگ‌های ARM
 * ------------------------------------------------------
 * بدنه: { entity: "listings" | "requests" | "both", mode: "lists" | "enrich" | "both", maxRows?: number }
 *   mode=lists — لایه ۱: همگام‌سازی فهرست (صفحه‌به‌صفحه با نرخ‌محدود)
 *   mode=enrich — لایه ۲: غنی‌سازی برشی تا maxRows ردیفِ در انتظار (پیش‌فرض ۱۰۰،
 *                سقف ۵۰۰) — تماس مالک/درخواست‌دهنده + آدرس دقیق از زنجیرهٔ
 *                عین خود سامانه؛ ردیف‌های تکمیل‌شده دیگر پرسیده نمی‌شوند
 *
 * P6546/گام پنجم-پ (دستور مالک — لایه‌های بروزرسانی):
 *   · لایهٔ فهرست آگهی‌ها: هر کلیک ≈ ۵٬۰۰۰ رکورد (۱۰ صفحه × ۵۰۰)
 *   · لایهٔ فهرست درخواست‌ها: هر کلیک ۵۰ صفحه (≈ ۲٬۵۰۰ رکورد)
 *   · لایهٔ تکمیل جزئیات: هر کلیک ≈ ۵۰۰ رکورد غنی‌سازی
 *
 * توکن ARM فقط از نشست جاری (SEC-3 عین HOTFIX-02) — تمدید خودکار در صورت انقضا.
 * هر اجرا با personnelCode بازیگر در AuditLog ثبت می‌شود (ARM_CATALOG_SYNC).
 * قفل درون‌فرایندی: هم‌زمان فقط یک غنی‌سازی در هر موجودیت فعال است.
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { audit } from "@/lib/auth/session";
import { execWithArmToken } from "@/lib/listing/crm-transfer";
import {
  enrichArmListings,
  enrichArmRequests,
  syncArmListingsCatalog,
  syncArmRequestsCatalog,
  type ArmCatalogEnrichResult,
  type ArmCatalogSyncResult,
} from "@/lib/melk-api/arm-catalog";

/** قفل درون‌فرایندی — جلوگیری از یورش برش‌های هم‌زمان به سامانه مبدأ */
const inflight = { listings: false, requests: false };

export async function POST(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  if (!guard.armTokens?.accessToken) {
    return errorResponse(
      new MelkApiError(
        "PRECONDITION_FAILED",
        "استخراج از سامانه ملک تبریز با توکن نشست شما ممکن نیست. لطفاً از صفحه ورود، مسیر «کد پرسنلی + پیامک» را بگذارید یا در تنظیمات عمومی به ARM متصل شوید.",
        412,
        false
      )
    );
  }

  let body: { entity?: string; mode?: string; maxRows?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "بدنه درخواست نامعتبر است.", 400, false));
  }

  const entity = body.entity === "requests" ? "requests" : body.entity === "listings" ? "listings" : "both";
  const mode = body.mode === "lists" ? "lists" : body.mode === "enrich" ? "enrich" : "both";
  // P6546/گام پنجم-پ-۲ — لایهٔ تکمیل جزئیات: هر کلیک ≈ ۵۰۰ رکورد (سقف ۵۰۰)
  const maxRows = Math.min(Math.max(Number(body.maxRows ?? 100) || 100, 1), 500);

  const wantListings = entity === "listings" || entity === "both";
  const wantRequests = entity === "requests" || entity === "both";

  try {
    const listResults: ArmCatalogSyncResult[] = [];
    const enrichResults: ArmCatalogEnrichResult[] = [];

    // ---- لایه ۱ — همگام‌سازی فهرست (P6546/گام پنجم-پ-۱:
    //      آگهی‌ها ≈ ۵٬۰۰۰ رکورد/کلیک (۱۰ صفحه × ۵۰۰) و درخواست‌ها ۵۰ صفحه/کلیک؛
    //      ادامهٔ برش‌ها با کلیک‌های بعدی — checkpoint از همان نقطه ادامه می‌یابد) ----
    if ((mode === "lists" || mode === "both") && wantListings) {
      const res = await execWithArmToken(guard, (t) => syncArmListingsCatalog(t, { maxPages: 10 }));
      listResults.push(res);
    }
    if ((mode === "lists" || mode === "both") && wantRequests) {
      const res = await execWithArmToken(guard, (t) => syncArmRequestsCatalog(t, { maxPages: 50 }));
      listResults.push(res);
    }

    // ---- لایه ۲ — غنی‌سازی برشی (با قفل) ----
    if ((mode === "enrich" || mode === "both") && wantListings && !inflight.listings) {
      inflight.listings = true;
      try {
        const res = await execWithArmToken(guard, (t) => enrichArmListings(t, { maxRows }));
        enrichResults.push(res);
      } finally {
        inflight.listings = false;
      }
    }
    if ((mode === "enrich" || mode === "both") && wantRequests && !inflight.requests) {
      inflight.requests = true;
      try {
        const res = await execWithArmToken(guard, (t) => enrichArmRequests(t, { maxRows }));
        enrichResults.push(res);
      } finally {
        inflight.requests = false;
      }
    }

    const summary = [
      ...listResults.map((r) => `list:${r.entity}=${r.fetched}/${r.totalAtSource}${r.ok ? "" : `!${r.errorCode}`}`),
      ...enrichResults.map((r) => `enrich:${r.entity}=+${r.enriched}(ماند:${r.remaining})`),
    ].join("; ");

    await audit("ARM_CATALOG_SYNC", guard.personnelCode, summary || `entity=${entity}; mode=${mode}; busy`);

    return Response.json({ ok: true, entity, mode, lists: listResults, enrich: enrichResults });
  } catch (err) {
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در همگام‌سازی کاتالوگ ملک تبریز.", 500, false));
  }
}
