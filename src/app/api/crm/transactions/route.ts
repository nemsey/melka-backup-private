/**
 * GET /api/crm/transactions
 * فهرست معاملات (گزارش تطابق) با فیلترهای واقعی — خوانده‌شده از کش محلی
 * که «فقط» با داده واقعی استخراج‌شده از arus-api.melketabriz.ir پر می‌شود.
 * اگر کش خالی باشد و نشست دارای توکن ARM باشد، همگام‌سازی زنده انجام می‌شود.
 * فیلترها (عین خود سامانه + توسعه داشبورد):
 *   بازه تاریخ (جلالی در UI → ISO)، کد ملک، کد درخواست، شماره هولوگرام،
 *   نوع تطبیق (رویداد / آگهی پیشنهادی / هر دو)
 *
 * P6.5-11 (بند پ-۵) — ستون‌های جدید فهرست معاملات کاشی ادغامی
 * «معاملات و قراردادهای ملک تبریز»:
 *   بعد از کد ملک: نام+موبایل مالک · بعد از کد درخواست: نام+موبایل درخواست‌دهنده
 *   + ستون «متن قرارداد» + ستون «تجمیع حق‌السهم مشاوران»
 *   (لایهٔ تحلیل — فقط خواندن؛ قانون دادهٔ خام بند الف هرگز نقض نمی‌شود)
 */

import { NextRequest } from "next/server";
import { getContractRepository, getPropertyRecordRepository, getRequestRepository, getTransactionRepository } from "@/core/repositories";
import { ensureSeeded, getSyncState } from "@/lib/melk-api/sync";
import { MelkApiError } from "@/lib/melk-api/types";
import { enrichTransactionRows, type ContractLookup } from "@/lib/melk-api/tx-enrichment";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
// P6.5-04-i — دامنه فقط از helper مرکزی (تک‌نقطه تصمیم)
import { ownerLoginPath, resolveEntityAccess } from "@/lib/access/scope";
import { witnessScopedRead } from "@/lib/audit";

function num(v: string | null): number | undefined {
  if (v === null || v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  try {
    // تلاش برای استخراج زنده در صورت خالی‌بودن کش (فقط داده واقعی)
    const seed = await ensureSeeded(guard.armTokens?.accessToken);
    const syncState = await getSyncState();
    const sp = request.nextUrl.searchParams;

    const limit = Math.min(Math.max(num(sp.get("limit")) ?? 50, 1), 5000);
    const offset = Math.max(num(sp.get("offset")) ?? 0, 0);
    const sortBy = (sp.get("sortBy") ?? "contractDate") as "contractDate" | "eventsCount" | "suggestedPropertyCount";
    const sortDir: "asc" | "desc" = sp.get("sortDir") === "asc" ? "asc" : "desc";

    // P6.5-04-i — معامله تجمیعی است (ماتریس §۵.۳): همهٔ دامنه‌ها همهٔ ردیف‌ها؛
    // مالک با شاهد owner.read — صفر فیلتر برای همه (رفتار v1 حفظ)
    const access = resolveEntityAccess(guard, "transaction");

    // فیلتر + خلاصه چهارگانه از انبار — عین منطق where قبلی (buildTransactionWhere)
    const { rows, total, summary } = await getTransactionRepository().listWithSummary({
      filter: {
        dateFrom: sp.get("dateFrom") ?? undefined,
        dateTo: sp.get("dateTo") ?? undefined,
        propertyCode: sp.get("propertyCode") ?? undefined,
        requestCode: sp.get("requestCode") ?? undefined,
        contractHolo: sp.get("contractHolo") ?? undefined,
        matchKind: (sp.get("matchKind") as "event" | "suggested" | "both" | null) ?? undefined,
      },
      sortBy,
      sortDir,
      limit,
      offset,
    });

    // ---- P6.5-11 (بند پ-۵): غنی‌سازی تحلیلی ستون‌های جدید (فقط خواندن) ----
    const propertyCodes = [...new Set(rows.map((r) => r.propertyCode).filter(Boolean))];
    const requestCodes = [...new Set(rows.map((r) => r.requestCode).filter((c): c is string => Boolean(c)))];
    const [owners, requesters, contractRows] = await Promise.all([
      getPropertyRecordRepository().findOwnerContactsByCodes(propertyCodes),
      getRequestRepository().findArmRequesterContactsByCodes(requestCodes),
      getContractRepository().findAll(),
    ]);
    const contracts: ContractLookup[] = contractRows.map((c) => ({
      contractHolo: c.contractHolo,
      propertyCode: c.propertyCode,
      requestCode: c.requestCode,
      contractType: c.contractType,
      contractDate: c.contractDate,
      documentDate: c.documentDate,
      deliveryDate: c.deliveryDate,
      propertyTitle: c.propertyTitle,
      propertyAddress: c.propertyAddress,
      buyerListJson: c.buyerListJson,
      sellerListJson: c.sellerListJson,
      realtorListJson: c.realtorListJson,
      status: c.status,
    }));
    const enrichedRows = enrichTransactionRows(rows, { owners, requesters, contracts });

    await witnessScopedRead(guard, "transaction", total, access.isOwnerRead, ownerLoginPath(guard));

    return Response.json({
      ok: true,
      rows: enrichedRows,
      total,
      limit,
      offset,
      summary,
      // شفافیت منبع داده برای UI
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
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در استخراج معاملات.", 500, false));
  }
}
