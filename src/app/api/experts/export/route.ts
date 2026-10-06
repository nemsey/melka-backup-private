/**
 * GET /api/experts/export — خروجی اکسل فهرست تازهٔ کارشناسان (PN-008 ثانیاً)
 * ---------------------------------------------------------------------------
 * همهٔ ستون‌های فهرست (الزامی مالک + کشف‌شده از PM) با فیلترهای جاری؛
 * رکورد بدون داده = «-». اکسل سمت سرور (RTL + جداساز هزارگان).
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { normalizeFilterInput } from "@/lib/normalize-input";
import { listExpertProfiles, type ExpertProfileFilter, type ExpertProfileRow } from "@/lib/experts/profile-store";
import { faJalaliShort } from "@/lib/format";

function num(v: string | null): number | undefined {
  if (v === null || v.trim() === "") return undefined;
  const n = Number(normalizeFilterInput(v));
  return Number.isFinite(n) ? n : undefined;
}
function str(v: string | null): string | undefined {
  const s = normalizeFilterInput(v);
  return s ? s : undefined;
}
const dash = (v: string | number | null | undefined): string | number => (v === null || v === undefined || v === "" ? "-" : v);

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  try {
    const sp = request.nextUrl.searchParams;
    const activeRaw = sp.get("active");
    const filter: ExpertProfileFilter = {
      q: str(sp.get("q")),
      fullName: str(sp.get("fullName")),
      mobile: str(sp.get("mobile")),
      personnelCode: str(sp.get("personnelCode")),
      branchTitle: str(sp.get("branchTitle")),
      roleTitle: str(sp.get("roleTitle")),
      headManager: str(sp.get("headManager")),
      address: str(sp.get("address")),
      telephone: str(sp.get("telephone")),
      postalCode: str(sp.get("postalCode")),
      voipExtension: str(sp.get("voipExtension")),
      city: str(sp.get("city")),
      active: activeRaw === "true" || activeRaw === "false" ? activeRaw === "true" : undefined,
      hireFrom: str(sp.get("hireFrom")),
      hireTo: str(sp.get("hireTo")),
      saleFrom: num(sp.get("saleFrom")),
      saleTo: num(sp.get("saleTo")),
      rentFrom: num(sp.get("rentFrom")),
      rentTo: num(sp.get("rentTo")),
      sort: "name",
      sortDir: "asc",
      limit: 5000,
      offset: 0,
    };

    const { rows } = await listExpertProfiles(filter);

    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    wb.creator = "ملکا — اکوسیستم هوشمند ملک ایران";
    const ws = wb.addWorksheet("کارشناسان", { views: [{ rightToLeft: true, state: "frozen", ySplit: 1 }] });
    ws.columns = [
      { header: "ردیف", width: 6 },
      { header: "کارشناس", width: 22 },
      { header: "موبایل", width: 14 },
      { header: "کد پرسنلی", width: 12 },
      { header: "شعبه", width: 14 },
      { header: "مبایعه نامه (شامل پیش‌فروش)", width: 16 },
      { header: "اجاره نامه (شامل تمدید)", width: 16 },
      { header: "تاریخ استخدام", width: 14 },
      { header: "آدرس", width: 40 },
      { header: "سمت پرسنلی", width: 16 },
      { header: "نوع همکاری", width: 14 },
      { header: "مدیر", width: 16 },
      { header: "تلفن ثابت", width: 14 },
      { header: "کد پستی", width: 12 },
      { header: "داخلی", width: 8 },
      { header: "شهر", width: 10 },
      { header: "وضعیت", width: 10 },
    ].map((c) => ({ header: c.header, width: c.width }));
    const header = ws.getRow(1);
    header.font = { bold: true, size: 11 };
    header.alignment = { vertical: "middle", horizontal: "center" };

    rows.forEach((r: ExpertProfileRow, i: number) => {
      ws.addRow([
        i + 1,
        dash(r.fullName),
        dash(r.mobile),
        dash(r.personnelCode),
        dash(r.branchTitle),
        r.saleCount,
        r.rentCount,
        r.hireDate ? faJalaliShort(r.hireDate) : "-",
        dash(r.address),
        dash(r.roleTitle),
        dash(r.employmentTypeFa),
        dash(r.headManager),
        dash(r.telephone),
        dash(r.postalCode),
        dash(r.voipExtension),
        dash(r.city),
        r.active ? "فعال" : "غیرفعال",
      ]);
    });
    ws.eachRow((row) => {
      row.eachCell((cell) => {
        if (typeof cell.value === "number" && Math.abs(cell.value) >= 1000) cell.numFmt = "#,##0";
      });
    });
    const out = Buffer.from(await wb.xlsx.writeBuffer());

    return new Response(new Uint8Array(out), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="melka-experts-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    });
  } catch (err) {
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در خروجی اکسل کارشناسان.", 500, false));
  }
}
