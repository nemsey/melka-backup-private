/**
 * GET /api/experts — فهرست تازهٔ کارشناسان (PN-008 ثانیاً — بازنویسی کامل)
 * ---------------------------------------------------------------------------
 * ستون‌ها عین کشف سرد سامانهٔ PM (download/pn008/pm-exploration.json):
 *   کارشناس (نام + موبایل) · کدپرسنلی · شعبه · مبایعه‌نامه (+پیش‌فروش) ·
 *   اجاره‌نامه (+تمدید) · تاریخ استخدام · آدرس + کشف‌شده‌ها:
 *   سمت · نوع همکاری · مدیر · تلفن · کد پستی · داخلی · شهر · استان · وضعیت
 * فیلتر بر اساس تمام ستون‌ها؛ گزینه‌های فیلتر از دادهٔ زنده (بروزرسانی فیلتر).
 * رکورد بدون داده = null — UI صادقانه «-» نمایش می‌دهد.
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { requireTileAccessFor } from "@/lib/access/personnel-access";
import { normalizeFilterInput } from "@/lib/normalize-input";
import { listExpertProfiles, expertFilterOptions, type ExpertProfileFilter } from "@/lib/experts/profile-store";

function num(v: string | null): number | undefined {
  if (v === null || v.trim() === "") return undefined;
  const n = Number(normalizeFilterInput(v));
  return Number.isFinite(n) ? n : undefined;
}
function str(v: string | null): string | undefined {
  const s = normalizeFilterInput(v);
  return s ? s : undefined;
}

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);
  // PN-008 BLOCK 7 (بند ۷.۴) — دسترسی کاشی («experts») از PersonnelAccess
  const tileErr = await requireTileAccessFor(guard, "experts");
  if (tileErr) return errorResponse(tileErr);

  try {
    const sp = request.nextUrl.searchParams;
    const activeRaw = sp.get("active");
    const empRaw = num(sp.get("employmentType"));
    // PN-011 ثالثاً — فیلترهای چندانتخابی چیپی: پارامتر تکرارشونده ← آرایه
    const branchTitles = (sp.getAll("branchTitle") || []).map((v) => normalizeFilterInput(v)).filter(Boolean);
    const roleTitles = (sp.getAll("roleTitle") || []).map((v) => normalizeFilterInput(v)).filter(Boolean);
    const employmentTypes = (sp.getAll("employmentType") || []).map((v) => num(v)).filter((v): v is number => v !== undefined);
    const headManagers = (sp.getAll("headManager") || []).map((v) => normalizeFilterInput(v)).filter(Boolean);
    const cities = (sp.getAll("city") || []).map((v) => normalizeFilterInput(v)).filter(Boolean);
    const actives = (sp.getAll("active") || []).filter((v) => v === "true" || v === "false").map((v) => v === "true");
    const filter: ExpertProfileFilter = {
      q: str(sp.get("q")),
      fullName: str(sp.get("fullName")),
      mobile: str(sp.get("mobile")),
      personnelCode: str(sp.get("personnelCode")),
      branchTitle: str(sp.get("branchTitle")),
      roleTitle: str(sp.get("roleTitle")),
      employmentType: empRaw !== undefined ? empRaw : undefined,
      headManager: str(sp.get("headManager")),
      address: str(sp.get("address")),
      telephone: str(sp.get("telephone")),
      postalCode: str(sp.get("postalCode")),
      voipExtension: str(sp.get("voipExtension")),
      city: str(sp.get("city")),
      active: activeRaw === "true" || activeRaw === "false" ? activeRaw === "true" : undefined,
      branchTitles: branchTitles.length > 0 ? branchTitles : undefined,
      roleTitles: roleTitles.length > 0 ? roleTitles : undefined,
      employmentTypes: employmentTypes.length > 0 ? employmentTypes : undefined,
      headManagers: headManagers.length > 0 ? headManagers : undefined,
      cities: cities.length > 0 ? cities : undefined,
      actives: actives.length > 0 ? actives : undefined,
      hireFrom: str(sp.get("hireFrom")),
      hireTo: str(sp.get("hireTo")),
      saleFrom: num(sp.get("saleFrom")),
      saleTo: num(sp.get("saleTo")),
      rentFrom: num(sp.get("rentFrom")),
      rentTo: num(sp.get("rentTo")),
      sort: (["name", "sale", "rent", "hire", "branch"] as const).includes(sp.get("sort") as never) ? (sp.get("sort") as ExpertProfileFilter["sort"]) : "name",
      sortDir: sp.get("sortDir") === "desc" ? "desc" : "asc",
      limit: num(sp.get("limit")) ?? 500,
      offset: num(sp.get("offset")) ?? 0,
    };

    const [{ rows, total }, options] = await Promise.all([listExpertProfiles(filter), expertFilterOptions()]);

    // شفافیت منبع داده
    const lastSyncedAt = rows.length > 0 ? rows.reduce<string | null>((acc, r) => (acc === null || r.syncedAt < acc ? r.syncedAt : acc), null) : null;
    const filled = (get: (r: (typeof rows)[number]) => unknown) => rows.filter((r) => get(r) !== null && get(r) !== "").length;

    return Response.json({
      ok: true,
      rows,
      total,
      filterOptions: options,
      dataSource: {
        real: true,
        source: "سامانهٔ PM (pm-api.melketabriz.ir) + شمارش ARM محلی",
        lastSyncedAt,
        coverage: {
          personnelCode: `${filled((r) => r.personnelCode)}/${rows.length}`,
          branchTitle: `${filled((r) => r.branchTitle)}/${rows.length}`,
          hireDate: `${filled((r) => r.hireDate)}/${rows.length}`,
          address: `${filled((r) => r.address)}/${rows.length}`,
          mobile: `${filled((r) => r.mobile)}/${rows.length}`,
        },
      },
    });
  } catch (err) {
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در استخراج فهرست کارشناسان.", 500, false));
  }
}
