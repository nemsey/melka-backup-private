/**
 * GET /api/crm/finance
 * مالی و کمیسیون — تعرفه زنده اتحادیه (سامانه مالی fm) + تجمیع
 * حق‌السهم قراردادهای نهایی‌شده به تفکیک مشاور و شعبه در بازه زمانی.
 */

import { NextRequest } from "next/server";
import { getContractRepository, getExpertRepository } from "@/core/repositories";
import { ensureSeeded, getCommissionConfig, getSyncState } from "@/lib/melk-api/sync";
import { COMMISSION_TYPE_FA } from "@/lib/melk-api/commission";
import type { ContractRealtorShare } from "@/lib/melk-api/types";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** وضعیت‌های نهایی‌شده (تسویه‌شده/در جریان مالی) که حق‌السهم آن‌ها معتبر است */
const FINALIZED_STATUSES = ["confirmedByFinance", "waitingForDocument", "finished", "payed"];

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  try {
    const seed = await ensureSeeded(guard.armTokens?.accessToken);
    const syncState = await getSyncState();
    const sp = request.nextUrl.searchParams;

    // تعرفه زنده کمیسیون از سامانه مالی (عمومی + کش ۶ ساعته)
    const commission = await getCommissionConfig();
    const tabrizConfig = commission.configs.find((c) => c.cityName.includes("تبریز")) ?? commission.configs[0] ?? null;

    // بازه زمانی تجمیع (اختیاری — پیش‌فرض: همه زمان‌ها)
    const dateFrom = sp.get("dateFrom");
    const dateTo = sp.get("dateTo");

    const contracts = await getContractRepository().findAll();
    const inRange = contracts.filter((c) => {
      const t = (c.contractDate ?? c.createdAt)?.getTime() ?? null;
      if (t === null) return !dateFrom && !dateTo;
      if (dateFrom && t < new Date(`${dateFrom}T00:00:00`).getTime()) return false;
      if (dateTo && t > new Date(`${dateTo}T23:59:59.999`).getTime()) return false;
      return true;
    });

    // فقط قراردادهای رسیده به مرحله مالی — حق‌السهم آن‌ها معتبر است
    const finalized = inRange.filter((c) => FINALIZED_STATUSES.includes(c.status));

    // تجمیع حق‌السهم به تفکیک مشاور
    const consultantMap = new Map<string, { consultant: string; shareCount: number; totalPercent: number; confirmed: number; pending: number; rejected: number }>();
    for (const c of finalized) {
      const shares = parseJson<ContractRealtorShare[]>(c.realtorListJson, []);
      for (const s of shares) {
        const entry =
          consultantMap.get(s.name) ??
          { consultant: s.name, shareCount: 0, totalPercent: 0, confirmed: 0, pending: 0, rejected: 0 };
        entry.shareCount += 1;
        entry.totalPercent += s.unitPercent;
        if (s.confirmation === "confirm") entry.confirmed += 1;
        else if (s.confirmation === "reject") entry.rejected += 1;
        else entry.pending += 1;
        consultantMap.set(s.name, entry);
      }
    }
    const consultantShares = [...consultantMap.values()]
      .sort((a, b) => b.shareCount - a.shareCount || b.totalPercent - a.totalPercent)
      .slice(0, 60);

    // تجمیع به تفکیک شعبه (از کسر مشاوران هر شعبه)
    const experts = await getExpertRepository().findAll();
    const expertBranch = new Map(experts.map((e) => [e.fullName, e.businessTitle || "بدون شعبه"]));
    const branchMap = new Map<string, { branch: string; contractCount: number; totalPercent: number }>();
    for (const c of finalized) {
      const shares = parseJson<ContractRealtorShare[]>(c.realtorListJson, []);
      const branchesTouched = new Set<string>();
      for (const s of shares) {
        const branch = expertBranch.get(s.name) ?? "مشاور خارج از شعبه‌های ثبت‌شده";
        branchesTouched.add(branch);
      }
      for (const b of branchesTouched) {
        const entry = branchMap.get(b) ?? { branch: b, contractCount: 0, totalPercent: 0 };
        entry.contractCount += 1;
        entry.totalPercent += shares.reduce((sum, s) => sum + s.unitPercent, 0);
        branchMap.set(b, entry);
      }
    }
    const branchShares = [...branchMap.values()]
      .sort((a, b) => b.contractCount - a.contractCount)
      .slice(0, 30);

    // روند ماهانه قراردادهای مالی (هجری شمسی)
    const monthMap = new Map<string, number>();
    for (const c of finalized) {
      const t = (c.contractDate ?? c.createdAt)?.getTime();
      if (!t) continue;
      const d = new Date(t);
      // کلید ماه میلادی-تقریبی برای سری زمانی — UI با تقویم جلالی نمایش می‌دهد
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthMap.set(key, (monthMap.get(key) ?? 0) + 1);
    }
    const monthly = [...monthMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, count]) => ({ key, count }));

    return Response.json({
      ok: true,
      commissionConfig: tabrizConfig
        ? {
            cityId: tabrizConfig.cityId,
            cityName: tabrizConfig.cityName,
            valueAddedPercentage: tabrizConfig.valueAddedPercentage,
            realEstateTariff: tabrizConfig.realEstateTariff,
            image: tabrizConfig.image,
            detail: tabrizConfig.detail.map((d) => ({
              contractType: d.contractType,
              contractTypeFa: d.contractTypeFa,
              buyerLabel: d.buyerLabel,
              sellerLabel: d.sellerLabel,
              inputs: d.inputs,
            })),
          }
        : null,
      typesFa: COMMISSION_TYPE_FA,
      summary: {
        totalContracts: inRange.length,
        finalizedContracts: finalized.length,
        consultantsWithShare: consultantShares.length,
        branchesWithShare: branchShares.length,
        avgSharePercent:
          consultantShares.length > 0
            ? Math.round((consultantShares.reduce((s, c) => s + c.totalPercent / c.shareCount, 0) / consultantShares.length) * 10) / 10
            : 0,
      },
      consultantShares,
      branchShares,
      monthly,
      dataSource: {
        real: true,
        cached: syncState.lastSuccessAt !== null,
        lastSuccessAt: syncState.lastSuccessAt,
        liveError: seed.liveError ?? syncState.lastError ?? commission.liveError,
        tariffLive: tabrizConfig !== null,
        syncAttempts: syncState.attempts,
      },
    });
  } catch (err) {
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در استخراج داده‌های مالی.", 500, false));
  }
}
