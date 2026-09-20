/**
 * GET /api/crm/arm-catalog/requests — کاتالوگ تک‌صفحه‌ای درخواست‌های سامانه ARM
 * ------------------------------------------------------
 * کاشی «درخواست‌های ملک تبریز» (P6.5-10):
 *   فیلترها: کد درخواست (contains) + نام و نام خانوادگی کارشناس (contains)
 *   ستون‌ها: کد درخواست، کارشناس، درخواست‌دهنده (نام + تماس)
 *
 * غنی‌سازی هدفمند: اگر فیلتر کد درخواست داده شده باشد و ردیف‌های یافته هنوز
 * لایه ۲ (تماس درخواست‌دهنده) را نداشته باشند، همان ردیف‌ها زنده از
 * زنجیرهٔ عین خود سامانه (requests/applicant) غنی می‌شوند (سقف ۵ ردیف).
 *
 * دامنه (P6.5-10): موجودیت arm-request تجمیعی است (عین property — گزارش
 * دپارتمانی عین خود سامانه) — مالک همه را بدون فیلتر می‌بیند (شاهد owner.read).
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { ownerLoginPath, resolveEntityAccess } from "@/lib/access/scope";
import { witnessScopedRead } from "@/lib/audit";
import { getRequestRepository } from "@/core/repositories";
import { enrichArmRequests } from "@/lib/melk-api/arm-catalog";
import { execWithArmToken } from "@/lib/listing/crm-transfer";

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
    const code = (sp.get("code") ?? "").replace(/[۰-۹]/g, (d) => String("۰۱۲۳۵۴۶۷۸۹".indexOf(d))).trim() || undefined;
    const realtorName = (sp.get("realtorName") ?? "").trim() || undefined;
    // P6.5-10 — تک‌صفحه‌ای و بی‌نهایت: سقف سرور ۲۵٬۰۰۰ ردیف (کل کاتالوگ منبع ۲۰٬۳۹۲)
    const limit = Math.min(Math.max(num(sp.get("limit")) ?? 25000, 1), 25000);

    const repo = getRequestRepository();

    // ---- غنی‌سازی هدفمند ردیف‌های جست‌وجو‌شده با کد (زنده، سقف ۵) ----
    if (code && guard.armTokens?.accessToken) {
      try {
        const targeted = await repo.listArmCatalog({ code }, 5);
        const incompleteIds = targeted.rows.filter((r) => !r.enrichedAt).slice(0, 5).map((r) => r.id);
        if (incompleteIds.length > 0) {
          await execWithArmToken(guard, (t) => enrichArmRequests(t, { maxRows: incompleteIds.length, rowIds: incompleteIds }));
        }
      } catch {
        /* غنی‌سازی هدفمند بهترین-تلاش است — فهرست بدون آن هم برگردانده می‌شود */
      }
    }

    // P6.5-10 — دامنه از helper مرکزی: arm-request تجمیعی؛ مالک ⇒ شاهد owner.read
    const access = resolveEntityAccess(guard, "arm-request");
    const { rows, total } = await repo.listArmCatalog({ code, realtorName }, limit);
    await witnessScopedRead(guard, "arm-request", total, access.isOwnerRead, ownerLoginPath(guard));

    const counts = await repo.countArmEnrichment();
    return Response.json({
      ok: true,
      rows,
      total,
      limit,
      enrichment: counts,
      dataSource: {
        system: "سامانه مدیریت آگهی و درخواست ملک تبریز (ARM)",
        layer1: "فهرست کامل درخواست‌ها — کد، عنوان، کارشناس، وضعیت، درخواست‌دهنده",
        layer2: `تماس درخواست‌دهنده — ${counts.complete} از ${counts.total} تکمیل شده`,
      },
    });
  } catch (err) {
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در خواندن کاتالوگ درخواست‌های ملک تبریز.", 500, false));
  }
}
