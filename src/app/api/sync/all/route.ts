/**
 * POST /api/sync/all — نکتهٔ بسیار مهم ۳ (P6.5-11)
 * ------------------------------------------------------
 * «زمینهٔ لازم و کافی جهت انتقال اطلاعات تمام کاشی‌ها فراهم گردد تا
 *  مالک انتقال اطلاعات را انجام دهد» — یک دکمه، همهٔ منابع:
 *
 *   ۱) همگام‌سازی اصلی (معاملات/کارشناسان/قراردادها/تعاملات/بازدیدها/
 *      عرضه‌وتقاضا) با تمدید خودکار توکن — همان /api/sync
 *   ۲) کاتالوگ آگهی‌های ARM — لایهٔ ۱ (فهرست) با «ازسرگیری» از آخرین
 *      صفحهٔ کامل-ذخیره‌شده (بند ب) + لایهٔ ۲ (غنی‌سازی تماس مالک)
 *   ۳) کاتالوگ درخواست‌های ARM — همان الگو (غنی‌سازی تماس درخواست‌دهنده)
 *
 * هر مرحله مستقل گزارش می‌شود؛ شکست یک مرحله بقیه را متوقف نمی‌کند
 * (هر مرحله از checkpoint خودش ادامه می‌دهد — هیچ‌چیز از ابتدا شروع نمی‌شود).
 * AuditLog: DATA_SYNC_ALL با خلاصهٔ کامل.
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { audit, updateSessionArmTokens } from "@/lib/auth/session";
import { syncWithRefresh } from "@/lib/melk-api/sync";
import { syncArmListingsCatalog, syncArmRequestsCatalog, enrichArmListings, enrichArmRequests } from "@/lib/melk-api/arm-catalog";
import { syncPmPersonnel, syncSpecialProperties, getAccBestRealtor, getPmSyncToken } from "@/lib/melk-api/pm-acc-sync";
import { execWithArmToken } from "@/lib/listing/crm-transfer";

/** قفل درون‌فرایندی — هم‌زمان فقط یک انتقال کامل فعال است */
let inflightAll = false;

export async function POST(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  if (!guard.armTokens?.accessToken) {
    return errorResponse(
      new MelkApiError(
        "PRECONDITION_FAILED",
        "انتقال اطلاعات از سامانه ملک تبریز نیاز به اتصال ARM دارد. از صفحه ورود با «کد پرسنلی + پیامک» وارد شوید یا در تنظیمات عمومی به ARM متصل شوید.",
        412,
        false
      )
    );
  }

  if (inflightAll) {
    return Response.json({
      ok: true,
      busy: true,
      message: "یک انتقال کامل در حال اجراست — پس از پایان آن دوباره بزنید تا از همان نقطه ادامه یابد.",
    });
  }

  inflightAll = true;
  try {
    // ---- مرحلهٔ ۱: همگام‌سازی اصلی (گزارش تطابق + کارشناسان + قراردادها) ----
    let main: Awaited<ReturnType<typeof syncWithRefresh>>["sync"] | null = null;
    let mainError: string | null = null;
    try {
      const { sync, newArmToken } = await syncWithRefresh(guard.armTokens.accessToken, guard.armTokens.refreshToken);
      main = sync;
      if (newArmToken) {
        const { vaultKeyForSession } = await import("@/lib/auth/arm-vault");
        await updateSessionArmTokens(
          guard.sessionId,
          {
            accessToken: newArmToken,
            refreshToken: guard.armTokens.refreshToken,
            userType: guard.armTokens.userType,
          },
          { ownerKey: vaultKeyForSession(guard.personnelCode, guard.role) }
        ).catch(() => undefined);
      }
    } catch (err) {
      mainError = err instanceof MelkApiError ? err.message : String(err);
    }

    // ---- مرحلهٔ ۲ و ۳: کاتالوگ‌های ARM (فهرست + غنی‌سازی) با ازسرگیری ----
    // هر مرحله مستقل — شکست یکی بقیه را نمی‌شکند (بند ب: ادامه از checkpoint)
    const runStage = async <T,>(fn: () => Promise<T>): Promise<{ ok: boolean; result: T | null; error: string | null }> => {
      try {
        return { ok: true, result: await fn(), error: null };
      } catch (err) {
        return { ok: false, result: null, error: err instanceof MelkApiError ? err.message : String(err) };
      }
    };

    const listingsRes = await runStage(() => execWithArmToken(guard, (t) => syncArmListingsCatalog(t, { maxPages: 5 })));
    const requestsRes = await runStage(() => execWithArmToken(guard, (t) => syncArmRequestsCatalog(t, { maxPages: 20 })));
    const listingsEnrichRes = await runStage(() => execWithArmToken(guard, (t) => enrichArmListings(t, { maxRows: 200 })));
    const requestsEnrichRes = await runStage(() => execWithArmToken(guard, (t) => enrichArmRequests(t, { maxRows: 200 })));

    // ---- P6.5-12: مراحل بین‌سامانه‌ای — پرسنل PM + کارگزاری‌ها + شاهد مالی ----
    // پرسنل PM: کد پرسنلی کارشناسان (توکن PM ماندگار؛ در نبودش مرحله رد می‌شود)
    const pmRes = await runStage(async () => {
      const pmToken = await getPmSyncToken();
      if (!pmToken) throw new MelkApiError("PRECONDITION_FAILED", "اتصال سامانهٔ پرسنلی (PM) برقرار نیست.", 412, false);
      return syncPmPersonnel(pmToken);
    });
    // کارگزاری‌های صادره + بهترین کارشناسان از دید سامانهٔ مالی (توکن ARM)
    const agenciesRes = await runStage(() => execWithArmToken(guard, (t) => syncSpecialProperties(t)));
    const accRes = await runStage(() => execWithArmToken(guard, (t) => getAccBestRealtor(t).then((r) => ({ count: r.length }))));

    const summaryParts = [
      main ? `main:tx=${main.transactions};ex=${main.experts};ct=${main.contracts}` : `main:error=${mainError?.slice(0, 60)}`,
      listingsRes.ok && listingsRes.result
        ? `listings:${listingsRes.result.fetched}/${listingsRes.result.totalAtSource};cp=${listingsRes.result.checkpoint?.lastCompletedPage ?? "-"}/${listingsRes.result.checkpoint?.totalPages ?? "-"}${listingsRes.result.resumedFromPage ? `;resumed=${listingsRes.result.resumedFromPage}` : ""}`
        : `listings:error=${listingsRes.error?.slice(0, 60)}`,
      requestsRes.ok && requestsRes.result
        ? `requests:${requestsRes.result.fetched}/${requestsRes.result.totalAtSource};cp=${requestsRes.result.checkpoint?.lastCompletedPage ?? "-"}/${requestsRes.result.checkpoint?.totalPages ?? "-"}${requestsRes.result.resumedFromPage ? `;resumed=${requestsRes.result.resumedFromPage}` : ""}`
        : `requests:error=${requestsRes.error?.slice(0, 60)}`,
      listingsEnrichRes.ok && listingsEnrichRes.result ? `enr-l:+${listingsEnrichRes.result.enriched};left=${listingsEnrichRes.result.remaining}` : "",
      requestsEnrichRes.ok && requestsEnrichRes.result ? `enr-r:+${requestsEnrichRes.result.enriched};left=${requestsEnrichRes.result.remaining}` : "",
      pmRes.ok && pmRes.result ? `pm:${pmRes.result.personnel}` : `pm:error=${pmRes.error?.slice(0, 40)}`,
      agenciesRes.ok && agenciesRes.result ? `agencies:${agenciesRes.result.total};detailed=${agenciesRes.result.detailed}` : `agencies:error=${agenciesRes.error?.slice(0, 40)}`,
      accRes.ok && accRes.result ? `acc-best:${accRes.result.count}` : "",
    ].filter(Boolean);

    await audit("DATA_SYNC_ALL", guard.personnelCode, summaryParts.join(" | "));

    return Response.json({
      ok: true,
      main: main ? { ...main, ok: true } : { ok: false, error: mainError },
      listings: listingsRes.result ?? { ok: false, errorCode: listingsRes.error },
      requests: requestsRes.result ?? { ok: false, errorCode: requestsRes.error },
      enrichListings: listingsEnrichRes.result ?? null,
      enrichRequests: requestsEnrichRes.result ?? null,
      // P6.5-12 — مراحل بین‌سامانه‌ای
      pmPersonnel: pmRes.result ?? { ok: false, error: pmRes.error },
      agencies: agenciesRes.result ?? { ok: false, error: agenciesRes.error },
      accBestRealtor: accRes.result ?? null,
    });
  } catch (err) {
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در انتقال کامل اطلاعات.", 500, false));
  } finally {
    inflightAll = false;
  }
}
