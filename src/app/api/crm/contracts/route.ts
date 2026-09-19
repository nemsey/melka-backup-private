/**
 * GET /api/crm/contracts
 * قراردادها و اسناد (صورت وضعیت‌های سامانه ARM) — خوانده‌شده از کش محلی
 * که فقط با داده واقعی arus-api.melketabriz.ir (توکن‌دار) پر می‌شود.
 * خروجی: قیف چرخه عمر ۹ مرحله‌ای + ردیف‌های قرارداد (هولوگرام، کدها،
 * نوع، وضعیت، ثبت‌کننده، تاریخ‌ها، خریداران، حق‌السهم مشاوران).
 */

import { NextRequest } from "next/server";
import { getContractRepository } from "@/core/repositories";
import { ensureSeeded, getSyncState } from "@/lib/melk-api/sync";
import {
  CONTRACT_FUNNEL_ORDER,
  CONTRACT_REJECT_STATUSES,
  CONTRACT_STATUS_FA,
  type ContractFunnelStage,
  type ContractRealtorShare,
  type CrmContract,
} from "@/lib/melk-api/types";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";

function num(v: string | null): number | undefined {
  if (v === null || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function toIso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  try {
    const seed = await ensureSeeded(guard.armTokens?.accessToken);
    const syncState = await getSyncState();
    const sp = request.nextUrl.searchParams;

    // فیلتر وضعیت (اختیاری) + جست‌وجوی هولوگرام/کد آگهی/کد درخواست
    const statusFilter = sp.get("status");
    const search = sp.get("search")?.trim();

    const rows = await getContractRepository().findAllOrderByCreatedAtDesc();
    const total = rows.length;

    const contracts: CrmContract[] = rows.map((r) => ({
      id: r.id,
      status: r.status,
      // P6.5-04-e-v2 — لایه ۱ حقیقت در مسیر خواندن v1 حمل می‌شود (بدون تغییر رفتار)
      rawDate: null,
      contractHolo: r.contractHolo,
      propertyCode: r.propertyCode,
      requestCode: r.requestCode,
      contractType: r.contractType,
      creatorName: r.creatorName,
      createdAt: toIso(r.createdAt),
      contractDate: toIso(r.contractDate),
      documentDate: toIso(r.documentDate),
      deliveryDate: toIso(r.deliveryDate),
      propertyTitle: r.propertyTitle,
      propertyAddress: r.propertyAddress,
      buyers: parseJson(r.buyerListJson, [] as { fullName: string; mobileNumber: string }[]),
      sellers: parseJson(r.sellerListJson, [] as { fullName: string; mobileNumber: string }[]),
      realtorShares: parseJson(r.realtorListJson, [] as ContractRealtorShare[]),
      canAddRealtor: r.canAddRealtor,
    }));

    // قیف چرخه عمر — شمارش هر وضعیت واقعی سامانه
    const statusCounts = new Map<string, number>();
    for (const c of contracts) statusCounts.set(c.status, (statusCounts.get(c.status) ?? 0) + 1);
    const funnel: ContractFunnelStage[] = CONTRACT_FUNNEL_ORDER.map((status) => ({
      status,
      label: CONTRACT_STATUS_FA[status],
      count: statusCounts.get(status) ?? 0,
      sharePercent: total > 0 ? Math.round(((statusCounts.get(status) ?? 0) / total) * 100) : 0,
    }));

    // وضعیت‌های رد/فسخ — مجموع و تفکیک
    const rejectedTotal = CONTRACT_REJECT_STATUSES.reduce((sum, s) => sum + (statusCounts.get(s) ?? 0), 0);
    const payedCount = statusCounts.get("payed") ?? 0;

    // فیلتر + صفحه‌بندی روی ردیف‌ها
    let filtered = contracts;
    if (statusFilter && statusFilter !== "all") {
      if (statusFilter === "rejected") {
        filtered = filtered.filter((c) => (CONTRACT_REJECT_STATUSES as string[]).includes(c.status));
      } else {
        filtered = filtered.filter((c) => c.status === statusFilter);
      }
    }
    if (search) {
      const q = search.replace(/\s+/g, "");
      filtered = filtered.filter((c) =>
        [c.contractHolo ?? "", c.propertyCode ?? "", c.requestCode ?? "", c.creatorName ?? ""]
          .some((f) => f.replace(/\s+/g, "").includes(q))
      );
    }
    const limit = Math.min(Math.max(num(sp.get("limit")) ?? 30, 1), 200);
    const offset = Math.max(num(sp.get("offset")) ?? 0, 0);
    const page = filtered.slice(offset, offset + limit);

    return Response.json({
      ok: true,
      rows: page,
      total: filtered.length,
      limit,
      offset,
      summary: {
        totalCount: total,
        funnel,
        rejectedTotal,
        payedCount,
        /** گلوگاه: پرجمعیت‌ترین مرحله انتظار */
        bottleneck: funnel
          .filter((f) => f.status.startsWith("waitingFor"))
          .sort((a, b) => b.count - a.count)[0] ?? null,
        /** اسناد ناقص: تایید شده مالی اما تاریخ سند ثبت نشده */
        missingDocument: contracts.filter(
          (c) => (c.status === "confirmedByFinance" || c.status === "waitingForDocument") && !c.documentDate
        ).length,
      },
      dataSource: {
        real: true,
        cached: syncState.lastSuccessAt !== null,
        lastSuccessAt: syncState.lastSuccessAt,
        lastSyncedAt: syncState.lastSyncedAt,
        liveError: seed.liveError ?? syncState.lastError,
        syncAttempts: syncState.attempts,
      },
    });
  } catch (err) {
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در استخراج قراردادها.", 500, false));
  }
}
