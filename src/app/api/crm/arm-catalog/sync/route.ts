/**
 * POST /api/crm/arm-catalog/sync — استخراج/بروزرسانی کاتالوگ‌های ARM
 * ------------------------------------------------------
 * بدنه: { entity: "listings" | "requests" | "both", mode: "lists" | "enrich" | "both", maxRows?: number }
 *   mode=lists — لایهٔ ۱: همگام‌سازی فهرست (صفحه‌به‌صفحه با نرخ‌محدود)
 *   mode=enrich — لایهٔ ۲: غنی‌سازی برشی تا maxRows ردیفِ در انتظار (پیش‌فرض ۱۰۰،
 *                سقف ۵۰۰) — تماس مالک/درخواست‌دهنده + آدرس دقیق از زنجیرهٔ
 *                عین خود سامانه؛ ردیف‌های تکمیل‌شده دیگر پرسیده نمی‌شوند
 *
 * P6546/گام پنجم-پ (دستور مالک — لایه‌های بروزرسانی):
 *   · لایهٔ فهرست آگهی‌ها: هر کلیک ≈ ۵٬۰۰۰ رکورد (۱۰ صفحه × ۵۰۰)
 *   · لایهٔ فهرست درخواست‌ها: هر کلیک ۵۰ صفحه (≈ ۲٬۵۰۰ رکورد)
 *   · لایهٔ تکمیل جزئیات: هر کلیک ≈ ۵۰۰ رکورد غنی‌سازی
 *
 * توکن ARM فقط از نشست جاری (SEC-3 عین HOTFIX-02) — تمدید خودکار در صورت انقضا.
 * هر اجرا با personnelCode بازیگر در AuditLog ثبت می‌شود (ARM_CATALOG_SYNC).
 *
 * PN-083 (هماهنگ‌ساز چهار فهرست):
 *   · قفل بین‌فرایندی update:m1/update:m2 (JobLock) دور «کل بروزرسانی هر
 *     موجودیت» — دیگر هیچ اجرای دستی هم‌زمان با چرخهٔ خودکار Worker یا
 *     بروزرسانی دستی دیگری روی همان فهرست نمی‌افتد (صفر آشفتگی نرخ‌محدود).
 *   · وضعیت هر فهرست در SyncJobState (list-m1/list-m2) ثبت می‌شود — همان
 *     حقیقتی که نوار داشبورد و «کارهای پس‌زمینهٔ» تنظیمات نشان می‌دهند.
 *   · قفل زندهٔ دیگری = پاسخ صادقانهٔ busy + پیشرفت جاری (نه خطا، نه اجرای دوباره).
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { audit } from "@/lib/auth/session";
import { execWithArmToken } from "@/lib/listing/crm-transfer";
import {
  enrichArmListings,
  enrichArmRequests,
  syncArmListingsCatalog,
  syncArmRequestsCatalog,
  type ArmCatalogEnrichResult,
  type ArmCatalogSyncResult,
} from "@/lib/melk-api/arm-catalog";
import { withListLock, upsertFourListState, type FourListId } from "@/lib/melk-api/four-lists";

/** P2-03 — روت‌ها هرگز import مستقیم @/lib/db ندارند (الگوی db تنبل) */
async function getDb(): Promise<import("@prisma/client").PrismaClient> {
  const mod = (await import("@/lib/db")) as { db: import("@prisma/client").PrismaClient };
  return mod.db;
}

export async function POST(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  if (!guard.armTokens?.accessToken) {
    return errorResponse(
      new MelkApiError(
        "PRECONDITION_FAILED",
        "استخراج از سامانه ملک تبریز با توکن نشست شما ممکن نیست. لطفاً از صفحه ورود، مسیر «کد پرسنلی + پیامک» را بگذارید یا در تنظیمات عمومی به ARM متصل شوید.",
        412,
        false
      )
    );
  }

  let body: { entity?: string; mode?: string; maxRows?: number };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "بدنه درخواست نامعتبر است.", 400, false));
  }

  const entity = body.entity === "requests" ? "requests" : body.entity === "listings" ? "listings" : "both";
  const mode = body.mode === "lists" ? "lists" : body.mode === "enrich" ? "enrich" : "both";
  // P6546/گام پنجم-پ-۲ — لایهٔ تکمیل جزئیات: هر کلیک ≈ ۵۰۰ رکورد (سقف ۵۰۰)
  const maxRows = Math.min(Math.max(Number(body.maxRows ?? 100) || 100, 1), 500);

  const wantListings = entity === "listings" || entity === "both";
  const wantRequests = entity === "requests" || entity === "both";

  const db = await getDb();

  try {
    const listResults: ArmCatalogSyncResult[] = [];
    const enrichResults: ArmCatalogEnrichResult[] = [];
    /** PN-083 — موجودیت‌هایی که همین حالا زیر بروزرسانیِ زندهٔ دیگری هستند */
    const busy: Partial<Record<"listings" | "requests", { by: string | null; message: string }>> = {};

    /**
     * PN-083 — اجرای یک موجودیت زیر قفل هماهنگ‌ساز + ثبت وضعیت یکپارچه.
     * ساختار پاسخ برای هر دو حالت (اجرا/مشغول) با مسیر قبلی هم‌شکل می‌ماند
     * تا UI صفحات بدون تغییر سازوکار، خروجی را بفهمد.
     */
    const runEntity = async (
      listId: FourListId,
      entityName: "listings" | "requests",
      maxPages: number,
      want: { lists: boolean; enrich: boolean },
    ): Promise<void> => {
      const lock = await withListLock(
        db,
        listId,
        async () => {
          await upsertFourListState(db, listId, {
            status: "running", lastCompletedPage: 0, totalPages: 2,
            detail: { source: "manual", stage: want.lists ? "lists" : "enrich", at: new Date().toISOString(), pages: maxPages },
          }).catch(() => undefined);
          // ---- لایه ۱ — همگام‌سازی فهرست (ادامه از checkpoint · P6546/گام پنجم-پ-۱) ----
          if (want.lists) {
            const syncFn = entityName === "listings" ? syncArmListingsCatalog : syncArmRequestsCatalog;
            const res = await execWithArmToken(guard, (t) => syncFn(t, { maxPages }));
            listResults.push(res);
            await upsertFourListState(db, listId, {
              status: "running", lastCompletedPage: 1, totalPages: 2,
              detail: { source: "manual", stage: "enrich", at: new Date().toISOString(), fetched: res.fetched, written: res.fetched },
            }).catch(() => undefined);
          }
          // ---- لایه ۲ — غنی‌سازی برشی (همان قفل M1/M2 — P6546/گام پنجم-پ-۲) ----
          if (want.enrich) {
            const enrichFn = entityName === "listings" ? enrichArmListings : enrichArmRequests;
            const enr = await execWithArmToken(guard, (t) => enrichFn(t, { maxRows }));
            enrichResults.push(enr);
            await upsertFourListState(db, listId, {
              status: "running", lastCompletedPage: 1, totalPages: 2,
              detail: { source: "manual", stage: "done", at: new Date().toISOString(), enriched: enr.enriched, remaining: enr.remaining },
            }).catch(() => undefined);
          }
          const res0 = listResults.find((r) => r.entity === entityName);
          await upsertFourListState(db, listId, {
            status: res0 ? (res0.ok ? "done" : "failed") : "done",
            lastCompletedPage: 2,
            totalPages: 2,
            detail: {
              source: "manual", stage: "done", finishedAt: new Date().toISOString(),
              ...(res0 ? { lastWritten: res0.fetched, fetched: res0.fetched, totalAtSource: res0.totalAtSource, error: res0.ok ? null : `${res0.errorCode ?? "error"}` } : {}),
            },
          }).catch(() => undefined);
        },
        { metadata: { source: "manual", entity: entityName, route: "/api/crm/arm-catalog/sync" } },
      );
      if (!lock.ran) {
        busy[entityName] = {
          by: lock.reason ?? "held",
          message: `بروزرسانی فهرست ${entityName === "listings" ? "آگهی‌ها" : "درخواست‌ها"} همین حالا در پس‌زمینه در جریان است — پس از پایان آن، تازه‌ترین داده در دسترس است و این درخواست بی‌اثر ثبت نشد (صفر اجرای موازی).`,
        };
      }
    };

    if (wantListings) await runEntity("m1", "listings", 10, { lists: mode === "lists" || mode === "both", enrich: mode === "enrich" || mode === "both" });
    if (wantRequests) await runEntity("m2", "requests", 50, { lists: mode === "lists" || mode === "both", enrich: mode === "enrich" || mode === "both" });

    const summary = [
      ...listResults.map((r) => `list:${r.entity}=${r.fetched}/${r.totalAtSource}${r.ok ? "" : `!${r.errorCode}`}`),
      ...enrichResults.map((r) => `enrich:${r.entity}=+${r.enriched}(ماند:${r.remaining})`),
    ].join("; ");

    await audit("ARM_CATALOG_SYNC", guard.personnelCode, summary || `entity=${entity}; mode=${mode}; busy=${Object.keys(busy).join(",")}`);

    const anyBusy = Object.keys(busy).length > 0;
    return Response.json({
      ok: true,
      entity,
      mode,
      lists: listResults,
      enrich: enrichResults,
      ...(anyBusy ? { busy, message: Object.values(busy).map((b) => b.message).join(" ") } : {}),
    });
  } catch (err) {
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطا در همگام‌سازی کاتالوگ ملک تبریز.", 500, false));
  }
}
