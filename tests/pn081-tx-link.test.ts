/**
 * pn081-tx-link.test.ts — PN-081 (بهینه‌سازی استخراج رکوردهای فهرست معاملات)
 * =============================================================================
 * سه ریشهٔ دستور مالک ۱۴۰۵/۰۸/۲۰:
 *   §۱ — تجمیع حق‌السهم: جایگزین سهم سهام‌داران (shareholderList) وقتی مشاوران
 *        ثبت نشده‌اند؛ نام از دفترچهٔ ExpertRecord؛ هرگز ادغام با سهم مشاوران (دوبرابرشمارش ممنوع)
 *   §۲ — کد ملک/کد درخواست: زنجیرهٔ fallback تماس مالک/درخواست‌دهنده با مقادیر
 *        رفع‌شدهٔ ARM (ستون‌های linkOwner و linkRequester) برای کدهای غیرمنطبقه
 *   §۳ — تاخیر بروزرسانی: سیم‌کشی نشانگر توقف (syncStalled) + چرخهٔ تازگی +
 *        سقف صفحهٔ M9 و ترتیب جدیدترین‌اول (بررسی ایستا روی منبع)
 */

import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const SRC = "/home/z/my-project/src";
const DAEMON_SRC = readFileSync(`${SRC}/lib/melk-api/catalog-daemon.ts`, "utf8");
const ROUTE_SRC = readFileSync(`${SRC}/app/api/crm/transactions/route.ts`, "utf8");
const REPO_SRC = readFileSync(`${SRC}/core/repositories/prisma/transaction.repository.ts`, "utf8");
const TXLIST_SRC = readFileSync(`${SRC}/sync/lists/transactions.ts`, "utf8");
const TXINFO_SRC = readFileSync(`${SRC}/lib/melk-api/tx-info-enrichment.ts`, "utf8");
const TAB_SRC = readFileSync(`${SRC}/core/tiles/tiles/transactions-contracts/TransactionsTab.tsx`, "utf8");

/* ==========================================================================
 * §۱ — جایگزین سهم سهام‌داران در نگاشت info
 * ========================================================================== */

describe("PN-081 §۱ — mapTxInfoPayload: جایگزین سهم سهام‌داران", () => {
  const expertMap = new Map<string, string>([
    ["6187e0a949f9d91f47e039fa", "هوشنگ احمدی"],
    ["6176cdfd15bcf012cb292fb9", "حسین احمدی"],
  ]);

  test("۱-الف) بدون مشاور + shareholderList با واحد → سهم با نام رفع‌شده و نقش shareholder", async () => {
    const { mapTxInfoPayload } = await import("@/lib/melk-api/tx-info-enrichment");
    const row = mapTxInfoPayload("tx-1", {
      shareholderList: [
        { shareholder: "6187e0a949f9d91f47e039fa", shareholderUnit: 47.5, shareholderType: 3 },
        { shareholder: "6176cdfd15bcf012cb292fb9", shareholderUnit: 47.5, shareholderType: 3 },
      ],
      realtorsListDecider: ["64874ddd0ffbfc15f223feba"],
    }, expertMap);
    expect(row.realtorSharesJson).not.toBeNull();
    const shares = JSON.parse(row.realtorSharesJson as string) as Array<{ name: string; unitPercent: number; confirmation: string; role: string }>;
    expect(shares.length).toBe(2);
    expect(shares[0].name).toBe("هوشنگ احمدی");
    expect(shares[0].unitPercent).toBe(47.5);
    expect(shares[0].role).toBe("shareholder");
    expect(shares[0].confirmation).toBe("unknown"); // صادقانه — وضعیت تأیید در مبدأ ثبت نشده
  });

  test("۱-ب) با مشاور ثبت‌شده → shareholderList هرگز ادغام نمی‌شود (دوبرابرشمارش ممنوع)", async () => {
    const { mapTxInfoPayload } = await import("@/lib/melk-api/tx-info-enrichment");
    const row = mapTxInfoPayload("tx-2", {
      primaryRealtorList: [
        { realtor: { _id: "a1", fullName: "مهدیه حدادی" }, realtorUnit: 40, confirmation: "confirm" },
        { realtor: { _id: "a2", fullName: "وحید حیدری" }, realtorUnit: 5, confirmation: "confirm" },
      ],
      shareholderList: [
        { shareholder: "6187e0a949f9d91f47e039fa", shareholderUnit: 22.5, shareholderType: 3 },
      ],
    }, expertMap);
    const shares = JSON.parse(row.realtorSharesJson as string) as Array<{ name: string; role: string }>;
    expect(shares.length).toBe(2); // فقط مشاوران — سهام‌داران نیامده‌اند
    expect(shares.every((s) => s.role !== "shareholder")).toBe(true);
  });

  test("۱-پ) بدون دفترچهٔ نام → سهم سهام‌دار بی‌نام رها می‌شود (null می‌ماند)", async () => {
    const { mapTxInfoPayload } = await import("@/lib/melk-api/tx-info-enrichment");
    const row = mapTxInfoPayload("tx-3", {
      shareholderList: [{ shareholder: "6187e0a949f9d91f47e039fa", shareholderUnit: 47.5 }],
    }, null);
    expect(row.realtorSharesJson).toBeNull();
  });

  test("۱-ت) هیچ دادهٔ سهمی در مبدأ → null صادقانه", async () => {
    const { mapTxInfoPayload } = await import("@/lib/melk-api/tx-info-enrichment");
    const row = mapTxInfoPayload("tx-4", { contractPrice: "1000000000" }, expertMap);
    expect(row.realtorSharesJson).toBeNull();
  });

  test("۱-ث) تجمیع سهم سهام‌داران — مجموع درصد درست محاسبه می‌شود", async () => {
    const { aggregateConsultantShares } = await import("@/lib/melk-api/tx-enrichment");
    const json = JSON.stringify([
      { name: "هوشنگ احمدی", unitPercent: 47.5, confirmation: "unknown", role: "shareholder" },
      { name: "حسین احمدی", unitPercent: 47.5, confirmation: "unknown", role: "shareholder" },
      { name: "الیار حسامی", unitPercent: 5, confirmation: "unknown", role: "shareholder" },
    ]);
    const summary = aggregateConsultantShares(json);
    expect(summary).not.toBeNull();
    expect(summary!.count).toBe(3);
    expect(summary!.totalPercent).toBe(100);
    expect(summary!.pending).toBe(3); // unknown → در انتظار (صادقانه)
  });
});

/* ==========================================================================
 * §۲ — زنجیرهٔ fallback تماس مالک/درخواست‌دهنده با مقادیر رفع‌شدهٔ ARM
 * ========================================================================== */

describe("PN-081 §۲ — enrichTransactionRows: مقادیر link* برای کدهای غیرمنطبقه", () => {
  const baseRow = {
    id: "tx-pn081", contractDate: new Date("2025-01-01T00:00:00Z"), propertyCode: "39032",
    propertyCustomer: "فروشنده", requestCode: "32482", requestCustomer: "خریدار",
    contractHolo: null, suggestedPropertyCount: 0, eventsCount: 0,
  };

  test("۲-الف) رجیستری خالی + link رفع‌شده → نام/موبایل مالک و درخواست‌دهنده از link", async () => {
    const { enrichTransactionRows } = await import("@/lib/melk-api/tx-enrichment");
    const rows = enrichTransactionRows(
      [baseRow],
      {
        owners: [], requesters: [], contracts: [], agencies: [],
        txInfo: [
          {
            txId: "tx-pn081", contractType: "مبایعه نامه", contractPrice: 5_000_000_000,
            buyerName: "خریدار", buyerMobile: null, sellerName: "فروشنده", sellerMobile: null,
            realtorSharesJson: null, propertyTitle: "فروش ساختمان تجاری", propertyAddress: "روبروی شهرداری",
            status: "finished", documentDate: null, deliveryDate: null,
            linkOwnerName: "ربابه محمدی", linkOwnerMobile: "09141234567",
            linkRequesterName: "سعید رضایی", linkRequesterMobile: "09147654321",
          },
        ],
      }
    );
    // link مقدم بر برچسب نقش/فروشندهٔ صورت‌وضعیت است
    expect(rows[0].ownerName).toBe("ربابه محمدی");
    expect(rows[0].ownerMobile).toBe("09141234567");
    expect(rows[0].requesterName).toBe("سعید رضایی");
    expect(rows[0].requesterMobile).toBe("09147654321");
  });

  test("۲-ب) رجیستری پرموجود → مقدار رجیستری بر link مقدم است (کاشی آگهی منبع اول)", async () => {
    const { enrichTransactionRows } = await import("@/lib/melk-api/tx-enrichment");
    const rows = enrichTransactionRows(
      [baseRow],
      {
        owners: [{ propertyCode: "39032", ownerName: "مالک رجیستری", ownerMobile: "09140000000" }],
        requesters: [{ requestCode: "32482", customerName: "متقاضی رجیستری", customerMobile: "09141111111" }],
        contracts: [], agencies: [],
        txInfo: [
          {
            txId: "tx-pn081", contractType: null, contractPrice: null, buyerName: null, buyerMobile: null,
            sellerName: null, sellerMobile: null, realtorSharesJson: null, propertyTitle: null,
            propertyAddress: null, status: null, documentDate: null, deliveryDate: null,
            linkOwnerName: "ربابه محمدی", linkOwnerMobile: null,
            linkRequesterName: "سعید رضایی", linkRequesterMobile: null,
          },
        ],
      }
    );
    expect(rows[0].ownerName).toBe("مالک رجیستری");
    expect(rows[0].requesterName).toBe("متقاضی رجیستری");
  });

  test("۲-پ) بدون link و بدون رجیستری → رفتار عقبه حفظ می‌شود (برچسب نقش)", async () => {
    const { enrichTransactionRows } = await import("@/lib/melk-api/tx-enrichment");
    const rows = enrichTransactionRows([baseRow], { owners: [], requesters: [], contracts: [], agencies: [] });
    expect(rows[0].ownerName).toBe("فروشنده");
    expect(rows[0].requesterName).toBe("خریدار");
  });
});

/* ==========================================================================
 * §۳ — سیم‌کشی تاخیر بروزرسانی (بررسی ایستا روی منبع — الگوی PN-060 §۴)
 * ========================================================================== */

describe("PN-081 §۳ — سیم‌کشی ریشه‌های تاخیر بروزرسانی", () => {
  test("۳-الف) دیمن کاتالوگ: هر دو برش رفع گره و تازگی سیم‌شده‌اند", () => {
    expect(DAEMON_SRC).toContain("resolveTransactionLinks(armTokens.accessToken");
    expect(DAEMON_SRC).toContain("refreshTransactionsInfo(armTokens.accessToken");
    expect(DAEMON_SRC).toContain("TX_LINK_ROWS_PER_TICK");
    expect(DAEMON_SRC).toContain("TX_INFO_REFRESH_ROWS_PER_TICK");
  });

  test("۳-ب) روت معاملات: نشانگر syncStalled + stalledHours در dataSource", () => {
    expect(ROUTE_SRC).toContain("syncStalled");
    expect(ROUTE_SRC).toContain("stalledHours");
    expect(ROUTE_SRC).toContain("latestSyncActivityAt");
  });

  test("۳-پ) مخزن: ستون‌های link در select غنی‌سازی + متد آخرین فعالیت", () => {
    expect(REPO_SRC).toContain("linkOwnerName: true");
    expect(REPO_SRC).toContain("linkRequesterMobile: true");
    expect(REPO_SRC).toContain("latestSyncActivityAt");
  });

  test("۳-ت) M9 فاز A: سقف صفحه ۴۰ (پوشش کامل ~۱۷ صفحهٔ منبع)", () => {
    expect(TXLIST_SRC).toContain("opts.maxPages ?? 40");
  });

  test("۳-ث) غنی‌سازی معاملات: ترتیب جدیدترین‌اول (رفع گرسنگی رکوردهای تازه)", () => {
    expect(TXINFO_SRC).toContain('orderBy: { contractDate: "desc" }');
  });

  test("۳-ج) UI فهرست معاملات: بنر هشدار توقف همگام‌سازی", () => {
    expect(TAB_SRC).toContain("m3-sync-stalled");
    expect(TAB_SRC).toContain("syncStalled");
    expect(TAB_SRC).toContain("بروزرسانی فهرست معاملات متوقف است");
  });

  test("۳-چ) تابع رفع گره: نشانهٔ تلاش (linkResolvedAt) در به‌روزرسانی نوشته می‌شود", () => {
    expect(TXINFO_SRC).toContain("linkResolvedAt: new Date()");
  });
});
