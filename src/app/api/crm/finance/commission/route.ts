/**
 * POST /api/crm/finance/commission
 * محاسبه کمیسیون با تعرفه واقعی اتحادیه مشاورین املاک تبریز —
 * عین کارکرد «محاسبه‌گر کمیسیون» خود سامانه مالی ملک تبریز
 * (fm-api /apm/commission) با محاسبه شفاف سمت داشبورد.
 * هر محاسبه در CommissionCalcLog ثبت می‌شود (فقط افزودنی — حافظه ایجنت).
 */

import { NextRequest } from "next/server";
import { getOutcomeRepository } from "@/core/repositories";
import { getCommissionConfig } from "@/lib/melk-api/sync";
import { calculateCommission, validateCommissionInput } from "@/lib/melk-api/commission";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";

function num(v: unknown): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(/[٬,،\s]/g, ""));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

export async function POST(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  try {
    const body = (await request.json()) as {
      contractType?: string;
      contractPrice?: number | string;
      contractDeposite?: number | string;
      contractRent?: number | string;
      hologramNumber?: string;
      buyerName?: string;
      sellerName?: string;
      contractDate?: string;
    };

    const contractType = String(body.contractType ?? "");
    const values = {
      contractPrice: num(body.contractPrice),
      contractDeposite: num(body.contractDeposite),
      contractRent: num(body.contractRent),
    };

    const validationError = validateCommissionInput(contractType, values);
    if (validationError) {
      return Response.json({ ok: false, error: validationError }, { status: 400 });
    }

    // درصد مالیات از پیکربندی زنده سامانه مالی (پیش‌فرض ۱۰)
    const { configs } = await getCommissionConfig();
    const tabriz = configs.find((c) => c.cityName.includes("تبریز")) ?? configs[0];
    const vatPercent = tabriz?.valueAddedPercentage ?? 10;

    const result = calculateCommission({ ...values, contractType, vatPercent });

    // ثبت فقط افزودنی برای حافظه ایجنت مالی
    await getOutcomeRepository().createCommissionCalc({
      contractType,
      inputsJson: JSON.stringify({ ...values, hologramNumber: body.hologramNumber ?? null }),
      resultJson: JSON.stringify(result),
      dealValue: result.dealValue,
      vatPercent,
      actorCode: guard.personnelCode,
    });

    return Response.json({
      ok: true,
      result,
      tariff: tabriz?.realEstateTariff ?? null,
      labels:
        tabriz?.detail.find((d) => d.contractType === contractType) != null
          ? {
              buyerLabel: tabriz.detail.find((d) => d.contractType === contractType)!.buyerLabel,
              sellerLabel: tabriz.detail.find((d) => d.contractType === contractType)!.sellerLabel,
              contractTypeFa: tabriz.detail.find((d) => d.contractType === contractType)!.contractTypeFa,
            }
          : null,
      vatPercent,
    });
  } catch (err) {
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در محاسبه کمیسیون.", 500, false));
  }
}
