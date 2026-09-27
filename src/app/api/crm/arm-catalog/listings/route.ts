/**
 * GET /api/crm/arm-catalog/listings — کاتالوگ تک‌صفحه‌ای آگهی‌های سامانه ARM
 * ------------------------------------------------------
 * کاشی «آگهی‌های ملک تبریز» (P6.5-10):
 *   فیلترها: کدآگهی (contains) + نام و نام خانوادگی کارشناس (contains)
 *            + وضعیت شش‌حالتهٔ چندانتخابی (P6521/M1 — statuses=published,expired,...)
 *   ستون‌ها: کدآگهی، کارشناس، مالک ملک (نام + تماس)، آدرس ملک
 *   بینش: توزیع شش‌حالته + سایر (P6521/M1 — statusCounts)
 *
 * غنی‌سازی هدفمند: اگر فیلتر کدآگهی داده شده باشد و ردیف‌های یافته هنوز
 * لایه ۲ (تماس مالک/آدرس دقیق) را نداشته باشند، همان ردیف‌ها زنده از
 * زنجیرهٔ عین خود سامانه (properties/owner + properties/details) غنی می‌شوند
 * (سقف ۵ ردیف در هر پاسخ) — هیچ فیلدی برای آنچه جست‌وجو می‌شود خالی نمی‌ماند.
 *
 * دامنه (P6.5-04-i): موجودیت property تجمیعی است — مالک همه را بدون فیلتر
 * می‌بیند (شاهد owner.read)؛ مشاوران هم گزارش سراسری می‌بینند (ماتریس §۵.۳).
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { ownerLoginPath, resolveEntityAccess } from "@/lib/access/scope";
import { witnessScopedRead } from "@/lib/audit";
import { getPropertyRecordRepository } from "@/core/repositories";
import { enrichArmListings } from "@/lib/melk-api/arm-catalog";
import { execWithArmToken } from "@/lib/listing/crm-transfer";
import { listingStateRawValues, parseListingStateFilter, rollupStatusCounts } from "@/lib/listing-status";
// P6525 — قانون یکسان‌سازی ورودی: منبع یگانه (رفع باگ تاریخی ۴/۵ در این روت)
import { normalizeFilterInput } from "@/lib/normalize-input";
// P6527 — انتقال فشردهٔ فهرست سنگین (۵٫۹MB → ~۱MB) برای موبایل
import { compressedJson } from "@/lib/http/compressed-json";

function num(v: string | null): number | undefined {
  if (v === null || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  try {
    const sp = request.nextUrl.searchParams;
    // P6525 — نرمال‌سازی مرکزی: ارقام فارسی/عربی/لاتین + حروف ي/ك — نتیجه همیشه یکسان
    const code = normalizeFilterInput(sp.get("code")) || undefined;
    const realtorName = normalizeFilterInput(sp.get("realtorName")) || undefined;
    // P6521/M1 — فیلتر شش‌حالتهٔ چندانتخابی: کلیدهای canonical → مقادیر خام قانون‌مند
    const stateKeys = parseListingStateFilter(sp.get("states"));
    const statuses = stateKeys.length > 0 ? listingStateRawValues(stateKeys) : undefined;
    // P6.5-10 — تک‌صفحه‌ای و بی‌نهایت: سقف سرور ۲۵٬۰۰۰ ردیف (کل کاتالوگ منبع ۱۱٬۳۶۳)
    const limit = Math.min(Math.max(num(sp.get("limit")) ?? 25000, 1), 25000);

    const repo = getPropertyRecordRepository();

    // ---- غنی‌سازی هدفمند ردیف‌های جست‌وجو‌شده با کد (زنده، سقف ۵) ----
    if (code && guard.armTokens?.accessToken) {
      try {
        const targeted = await repo.listArmCatalog({ code }, 5);
        const incompleteIds = targeted.rows.filter((r) => !r.enrichedAt).slice(0, 5).map((r) => r.id);
        if (incompleteIds.length > 0) {
          await execWithArmToken(guard, (t) => enrichArmListings(t, { maxRows: incompleteIds.length, rowIds: incompleteIds }));
        }
      } catch {
        /* غنی‌سازی هدفمند بهترین-تلاش است — فهرست بدون آن هم برگردانده می‌شود */
      }
    }

    // P6.5-04-i — دامنه فقط از helper مرکزی (تجمیعی §۵.۳؛ مالک ⇒ شاهد owner.read)
    const access = resolveEntityAccess(guard, "property");
    const { rows, total } = await repo.listArmCatalog({ code, realtorName, statuses }, limit);
    await witnessScopedRead(guard, "property", total, access.isOwnerRead, ownerLoginPath(guard));

    const counts = await repo.countEnrichment();
    // P6521/M1 — بینش توزیع شش‌حالته (همیشه از کل کاتالوگ، مستقل از فیلتر فعال)
    const breakdown = await repo.statusBreakdown();
    const statusCounts = rollupStatusCounts(breakdown.map((b) => [b.status, b.count] as [string | null, number]));
    // P6527 — فشردهٔ gzip وقتی کلاینت می‌پذیرد (بدون آن عین Response.json)
    return await compressedJson({
      ok: true,
      rows,
      total,
      limit,
      enrichment: counts,
      statusCounts,
      dataSource: {
        system: "سامانه مدیریت آگهی و درخواست ملک تبریز (ARM)",
        layer1: "فهرست کامل آگهی‌ها — کد، عنوان، کارشناس، وضعیت، موقعیت",
        layer2: `تماس مالک و آدرس دقیق — ${counts.complete} از ${counts.total} تکمیل شده`,
      },
    }, request.headers.get("accept-encoding"));
  } catch (err) {
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در خواندن کاتالوگ آگهی‌های ملک تبریز.", 500, false));
  }
}
