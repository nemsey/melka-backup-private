/**
 * GET /api/crm/customer-club
 * باشگاه مشتریان — تلفیق جامعه واقعی:
 *   • معاملات (propertyCustomer فروشنده / requestCustomer خریدار)
 *   • قراردادها (buyerList / sellerList با شماره تماس)
 *   • مشاوران (realtors — جامعه حرفه‌ای)
 * + فهرست‌های مرجع زنده سامانه ARM (شخصیت/شغل/نقش/جدیت — عمومی).
 * خروجی: خلاصه جامعه، مشتریان تکراری، سری رشد ماهانه (هجری شمسی).
 */

import { NextRequest } from "next/server";
import { getContractRepository, getExpertRepository, getTransactionRepository } from "@/core/repositories";
import { ensureSeeded, getCustomerRefLists, getSyncState } from "@/lib/melk-api/sync";
import {
  buildCustomerClub,
  customerGrowthSeries,
  topCustomers,
  type CustomerAppearance,
} from "@/lib/melk-api/customer-club";
import type { CustomerClubSummary, ContractRealtorShare } from "@/lib/melk-api/types";
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

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  try {
    const seed = await ensureSeeded(guard.armTokens?.accessToken);
    const syncState = await getSyncState();

    // فهرست‌های مرجع زنده (عمومی — بدون نیاز به توکن)
    const refLists = await getCustomerRefLists();

    // حضورهای واقعی مشتریان در داده‌های کش‌شده
    const appearances: CustomerAppearance[] = [];

    const txs = await getTransactionRepository().findAll();
    for (const t of txs) {
      if (t.propertyCustomer) {
        appearances.push({ name: t.propertyCustomer, role: "SELLER", date: t.contractDate.toISOString() });
      }
      if (t.requestCustomer) {
        appearances.push({ name: t.requestCustomer, role: "BUYER", date: t.contractDate.toISOString() });
      }
    }

    const contracts = await getContractRepository().findAll();
    for (const c of contracts) {
      const date = c.contractDate?.toISOString() ?? c.createdAt?.toISOString() ?? null;
      const buyers = parseJson<{ fullName: string; mobileNumber: string }[]>(c.buyerListJson, []);
      const sellers = parseJson<{ fullName: string; mobileNumber: string }[]>(c.sellerListJson, []);
      for (const b of buyers) {
        appearances.push({ name: b.fullName, role: "BUYER", date, mobile: b.mobileNumber });
      }
      for (const s of sellers) {
        appearances.push({ name: s.fullName, role: "SELLER", date, mobile: s.mobileNumber });
      }
    }

    const experts = await getExpertRepository().findAll();
    for (const e of experts) {
      appearances.push({ name: e.fullName, role: "EXPERT", date: e.createdAt.toISOString(), mobile: e.mobile });
    }

    const members = buildCustomerClub(appearances);

    const summary: CustomerClubSummary = {
      totalMembers: members.length,
      buyers: members.filter((m) => m.roles.includes("BUYER")).length,
      sellers: members.filter((m) => m.roles.includes("SELLER")).length,
      experts: members.filter((m) => m.roles.includes("EXPERT")).length,
      repeatCustomers: members.filter((m) => m.repeat).length,
      growthSeries: customerGrowthSeries(members),
      topCustomers: topCustomers(members, 10),
      catalogs: {
        characters: refLists.characters,
        jobs: refLists.jobs,
        roles: refLists.roles,
        seriousness: refLists.seriousness,
      },
    };

    // مشتریان تکراری (خریدار و فروشنده) — مرتب بر پایه مجموع حضور
    const repeatMembers = members
      .filter((m) => m.repeat)
      .sort((a, b) => b.buyerCount + b.sellerCount - (a.buyerCount + a.sellerCount))
      .slice(0, 50);

    // تجمیع شعبه‌ای: تعداد مشتریان ثبت‌شده توسط مشاوران هر شعبه
    const branchMap = new Map<string, number>();
    for (const e of experts) {
      const branch = e.businessTitle || "بدون شعبه";
      branchMap.set(branch, (branchMap.get(branch) ?? 0) + 1);
    }
    const branches = [...branchMap.entries()]
      .map(([branch, consultantCount]) => ({ branch, consultantCount }))
      .sort((a, b) => b.consultantCount - a.consultantCount);

    return Response.json({
      ok: true,
      summary,
      repeatMembers,
      branches,
      dataSource: {
        real: true,
        cached: syncState.lastSuccessAt !== null,
        lastSuccessAt: syncState.lastSuccessAt,
        liveError: seed.liveError ?? syncState.lastError ?? refLists.liveError,
        catalogsLive: refLists.characters.length > 0,
        syncAttempts: syncState.attempts,
      },
    });
  } catch (err) {
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در تحلیل باشگاه مشتریان.", 500, false));
  }
}
