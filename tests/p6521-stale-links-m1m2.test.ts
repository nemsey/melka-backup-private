/**
 * تست‌های P6521 — ازسرگیری M1/M2 (دستور ۰۲۰ مالک) + بستن حلقهٔ مورد ششم لینک‌های کهنه
 * ---------------------------------------------------------------------------
 * مبنای تصمیم: docs/decision-preview-publish-v2.md
 *
 *  الف) قانون شش‌حالتهٔ وضعیت آگهی‌ها (src/lib/listing-status.ts) — M1
 *  ب) مخزن آگهی: فیلتر وضعیت + توزیع (statusBreakdown) — M1
 *  ج) مخزن درخواست: منطقه (areaNamesJson رفت‌وبرگشت) — M2
 *  د) استخراج دفاعی منطقهٔ درخواست از payload جزئیات ARM — M2
 *  هـ) روت API آگهی: پارامتر states + statusCounts — M1
 *  و) UI کاشی آگهی: فیلتر چندانتخابی شش‌حالته + Badge رنگی + ستون «مالک» + کارت بینش — M1
 *  ز) UI کاشی درخواست: ستون «منطقه» + دو تغییر نام (متقاضی) — M2
 *  ح) رگرسیون: برچسب‌های قدیمی حذف شده‌اند؛ برچسب‌های تازه یکتا هستند
 */

import { beforeAll, describe, expect, test } from "bun:test";

const { db } = await import("@/lib/db");
const { readFileSync } = await import("fs");

const T = "p6521t";

// ===================== الف) قانون شش‌حالته — M1 =====================

describe("P6521-الف — قانون شش‌حالتهٔ وضعیت آگهی (M1)", () => {
  beforeAll(async () => {
    await import("@/core/tiles/bootstrap");
  });

  test("ا۱) دقیقاً شش حالت با برچسب‌های عین دستور ۰۲۰ و ترتیب دستور", async () => {
    const { LISTING_STATES } = await import("@/lib/listing-status");
    expect(LISTING_STATES.length).toBe(6);
    expect(LISTING_STATES.map((s) => s.label)).toEqual([
      "منتشر شده",
      "منقضی شده",
      "معامله شده",
      "رد توسط مدیر",
      "نمایش خصوصی",
      "فایل غیر قابل احیا",
    ]);
  });

  test("ا۲) نگاشت یازده مقدار خام واقعی DB → شش حالت + سایر (بدون نگاشت اختراعی)", async () => {
    const { classifyListingStatus } = await import("@/lib/listing-status");
    // شش مقدار معادل حالت‌های دستور (شاهد DB زندهٔ 2026-09-24)
    expect(classifyListingStatus("منتشر شده")).toBe("published");
    expect(classifyListingStatus("منقضی شده")).toBe("expired");
    expect(classifyListingStatus("معامله شده")).toBe("traded");
    expect(classifyListingStatus("رد شده توسط مدیر")).toBe("rejected");
    expect(classifyListingStatus("اکران خصوصی")).toBe("private");
    expect(classifyListingStatus("فایل غیر قابل احیا")).toBe("unrecoverable");
    // پنج مقدار انتظاری/سایر — خارج از شش‌گانه، طبق تصمیم §۳
    expect(classifyListingStatus("در انتظار بررسی مشاوران")).toBeNull();
    expect(classifyListingStatus(" فایل قابل احیا")).toBeNull();
    expect(classifyListingStatus("در انتظار تایید مشاور")).toBeNull();
    expect(classifyListingStatus("در انتظار معامله")).toBeNull();
    expect(classifyListingStatus("در انتظار تایید مدیر")).toBeNull();
    // تهی‌ها
    expect(classifyListingStatus(null)).toBeNull();
    expect(classifyListingStatus(undefined)).toBeNull();
    expect(classifyListingStatus("")).toBeNull();
  });

  test("ا۳) نرمال‌سازی متن: نیم‌فاصله و فاصله‌های اضافی و ابتدای/انتها", async () => {
    const { classifyListingStatus } = await import("@/lib/listing-status");
    expect(classifyListingStatus("منتشر\u200cشده")).toBe("published"); // نیم‌فاصله
    expect(classifyListingStatus("  منتشر شده  ")).toBe("published"); // فاصله ابتدا/انتها
    expect(classifyListingStatus("فایل   غیر   قابل   احیا")).toBe("unrecoverable"); // فاصله‌های تکراری
  });

  test("ا۴) برچسب canonical: دو تغییر برچسب دستور + fallback متن خام", async () => {
    const { listingStatusLabel } = await import("@/lib/listing-status");
    expect(listingStatusLabel("رد شده توسط مدیر")).toBe("رد توسط مدیر");
    expect(listingStatusLabel("اکران خصوصی")).toBe("نمایش خصوصی");
    expect(listingStatusLabel("در انتظار بررسی مشاوران")).toBe("در انتظار بررسی مشاوران"); // خام
    expect(listingStatusLabel(null)).toBe("—");
  });

  test("ا۵) مقادیر خام معادل کلیدها — برای فیلتر WHERE IN", async () => {
    const { listingStateRawValues } = await import("@/lib/listing-status");
    expect(listingStateRawValues(["rejected"])).toEqual(["رد شده توسط مدیر"]);
    expect(listingStateRawValues(["private"])).toEqual(["اکران خصوصی"]);
    expect(listingStateRawValues(["published", "expired", "traded", "unrecoverable"])).toEqual([
      "منتشر شده",
      "منقضی شده",
      "معامله شده",
      "فایل غیر قابل احیا",
    ]);
    expect(listingStateRawValues([])).toEqual([]);
  });

  test("ا۷) تجمیع شمارش‌ها: شش حالت + other + total (ریاضی شاهد DB)", async () => {
    const { rollupStatusCounts } = await import("@/lib/listing-status");
    const out = rollupStatusCounts([
      ["منتشر شده", 782],
      ["منقضی شده", 1604],
      ["معامله شده", 266],
      ["رد شده توسط مدیر", 156],
      ["اکران خصوصی", 69],
      ["فایل غیر قابل احیا", 6475],
      ["در انتظار بررسی مشاوران", 1305],
      [" فایل قابل احیا", 492],
      [null, 3],
    ] as Array<[string | null, number]>);
    expect(out.published).toBe(782);
    expect(out.expired).toBe(1604);
    expect(out.traded).toBe(266);
    expect(out.rejected).toBe(156);
    expect(out.private).toBe(69);
    expect(out.unrecoverable).toBe(6475);
    expect(out.other).toBe(1800); // 1305 + 492 + 3
    expect(out.total).toBe(11152); // جمع کل ردیف‌های داده‌شدهٔ همین تست
  });
});

// ===================== ب) مخزن آگهی — فیلتر وضعیت + توزیع (M1) =====================

describe("P6521-ب — مخزن آگهی: فیلتر شش‌حالته + توزیع وضعیت", () => {
  // P6525 — کاشت دادهٔ تست از تستِ فیلترِ حذف‌شدهٔ ب۱ به beforeAll منتقل شد (ب۲ به آن وابسته است)
  beforeAll(async () => {
    const { getPropertyRecordRepository } = await import("@/core/repositories");
    const { listingStateRawValues } = await import("@/lib/listing-status");
    const repo = getPropertyRecordRepository();
    await repo.upsertBulk(
      [
        {
          id: `${T}-p1`,
          propertyCode: `${T}-911`,
          ownerName: "کارشناس تست ب",
          status: listingStateRawValues(["published"])[0],
          createdAt: new Date("2026-09-24T09:00:00Z"),
        },
        {
          id: `${T}-p2`,
          propertyCode: `${T}-912`,
          ownerName: "کارشناس تست ب",
          status: listingStateRawValues(["traded"])[0],
          createdAt: new Date("2026-09-24T09:01:00Z"),
        },
        {
          id: `${T}-p3`,
          propertyCode: `${T}-913`,
          ownerName: "کارشناس تست ب",
          status: listingStateRawValues(["private"])[0],
          createdAt: new Date("2026-09-24T09:02:00Z"),
        },
      ],
      { sourceRunId: `${T}-run-b` }
    );
  });

  test("ب۲) توزیع وضعیت: groupBy خام → تجمیع canonical با ریاضی درست", async () => {
    const { getPropertyRecordRepository } = await import("@/core/repositories");
    const { rollupStatusCounts, classifyListingStatus } = await import("@/lib/listing-status");
    const repo = getPropertyRecordRepository();
    const breakdown = await repo.statusBreakdown();
    expect(Array.isArray(breakdown)).toBe(true);
    // هر ردیف breakdown یا تهی است یا رشته
    for (const b of breakdown) expect(typeof b.status === "string" || b.status === null).toBe(true);
    // تجمیع: جمع شش حالت + سایر = جمع کل
    const rolled = rollupStatusCounts(breakdown.map((b) => [b.status, b.count] as [string | null, number]));
    const sum = breakdown.reduce((acc, b) => acc + b.count, 0);
    expect(rolled.total).toBe(sum);
    expect(rolled.published + rolled.expired + rolled.traded + rolled.rejected + rolled.private + rolled.unrecoverable + rolled.other).toBe(sum);
    // ردیف‌های تست ما داخلش‌اند
    expect(rolled.published).toBeGreaterThanOrEqual(1);
    expect(rolled.traded).toBeGreaterThanOrEqual(1);
    expect(rolled.private).toBeGreaterThanOrEqual(1);
    // سازگاری تابعی: شمار هر حالت = جمع شمارش‌های خام نگاشت‌شده
    const pubRaw = breakdown.filter((b) => classifyListingStatus(b.status) === "published").reduce((a, b) => a + b.count, 0);
    expect(rolled.published).toBe(pubRaw);
  });
});

// ===================== ج) مخزن درخواست — منطقه (M2) =====================

describe("P6521-ج — مخزن درخواست: ستون منطقه (areaNames)", () => {
  test("ج۱) upsert با areaNames → ذخیره در areaNamesJson → خواندن در کاتالوگ", async () => {
    const { getRequestRepository } = await import("@/core/repositories");
    const repo = getRequestRepository();
    await repo.upsertArmBulk(
      [
        {
          id: `${T}-r1`,
          requestCode: `${T}-701`,
          customerName: "متقاضی تست",
          status: "سرنخ",
          actorName: "کارشناس تست",
          title: "خرید آپارتمان ولیعصر",
          areaNames: ["ولیعصر", "خاوران"],
          createdAt: new Date("2026-09-24T09:00:00Z"),
        },
      ],
      { sourceRunId: `${T}-run-r` }
    );
    const found = await repo.listArmCatalog({ code: `${T}-701` }, 10);
    expect(found.rows.length).toBe(1);
    expect(found.rows[0].areaNames).toEqual(["ولیعصر", "خاوران"]);
  });

  test("ج۲) رکورد بدون منطقه → آرایهٔ خالی (نه undefined/null) + رکورد با JSON خراب → خالی", async () => {
    const { getRequestRepository } = await import("@/core/repositories");
    const repo = getRequestRepository();
    await repo.upsertArmBulk(
      [
        {
          id: `${T}-r2`,
          requestCode: `${T}-702`,
          customerName: "متقاضی دوم",
          status: "فرصت",
          actorName: "کارشناس تست",
          createdAt: new Date("2026-09-24T08:00:00Z"),
        },
      ],
      { sourceRunId: `${T}-run-r` }
    );
    const found = await repo.listArmCatalog({ code: `${T}-702` }, 10);
    expect(found.rows.length).toBe(1);
    expect(Array.isArray(found.rows[0].areaNames)).toBe(true);
    expect(found.rows[0].areaNames).toEqual([]);
  });

  test("ج۳) upsert دوم بدون areaNames → منطقهٔ قبلی حفظ می‌شود (merge non-null)", async () => {
    const { getRequestRepository } = await import("@/core/repositories");
    const repo = getRequestRepository();
    await repo.upsertArmBulk(
      [
        {
          id: `${T}-r1`,
          requestCode: `${T}-701`,
          customerMobile: "09141112233",
        },
      ],
      { sourceRunId: `${T}-run-r2` }
    );
    const found = await repo.listArmCatalog({ code: `${T}-701` }, 10);
    expect(found.rows[0].customerMobile).toBe("09141112233");
    // areaNames ارسال نشد ⇒ areaNamesJson قبلی دست‌نخورده می‌ماند
    expect(found.rows[0].areaNames).toEqual(["ولیعصر", "خاوران"]);
  });
});

// ===================== د) استخراج دفاعی منطقه از payload جزئیات (M2) =====================

describe("P6521-د — extractRequestAreas (دفاعی؛ شکل payload مستند نیست)", () => {
  test("د۱) آرایهٔ رشته‌ها + آرایهٔ اشیای name دار + رشتهٔ تکی", async () => {
    const { extractRequestAreas } = await import("@/lib/melk-api/arm-catalog");
    expect(extractRequestAreas({ relatedAreas: ["ولیعصر", "خاوران"] })).toEqual(["ولیعصر", "خاوران"]);
    expect(extractRequestAreas({ areas: [{ name: "ولیعصر" }, { title: "باغمیشه" }] })).toEqual(["ولیعصر", "باغمیشه"]);
    expect(extractRequestAreas({ area: "خاوران" })).toEqual(["خاوران"]);
  });

  test("د۲) پاکت تودرتو (data) + حذف تکراری + ورودی بی‌شکل → خالی", async () => {
    const { extractRequestAreas } = await import("@/lib/melk-api/arm-catalog");
    expect(extractRequestAreas({ data: { relatedAreas: ["ولیعصر", "ولیعصر"] } })).toEqual(["ولیعصر"]);
    expect(extractRequestAreas(null)).toEqual([]);
    expect(extractRequestAreas("متن")).toEqual([]);
    expect(extractRequestAreas({})).toEqual([]);
    expect(extractRequestAreas({ relatedAreas: [42, null, { noName: true }, ""] })).toEqual([]);
    expect(extractRequestAreas({ lines: [{ name: "جزیره بزرگ" }] })).toEqual(["جزیره بزرگ"]);
  });
});

// ===================== هـ) روت API آگهی (M1) =====================

describe("P6521-هـ — روت /api/crm/arm-catalog/listings (ساختاری)", () => {

  test("ه۲) بینش توزیع در پاسخ هست: statusCounts از groupBy کل کاتالوگ", () => {
    const src = readFileSync("src/app/api/crm/arm-catalog/listings/route.ts", "utf8");
    expect(src.includes("statusBreakdown")).toBe(true);
    expect(src.includes("rollupStatusCounts")).toBe(true);
    expect(src.includes("statusCounts")).toBe(true);
  });

  test("ه۳) غنی‌سازی هدفمند و دامنه و شاهد دست‌نخورده (رگرسیون)", () => {
    const src = readFileSync("src/app/api/crm/arm-catalog/listings/route.ts", "utf8");
    expect(src.includes("enrichArmListings")).toBe(true);
    expect(src.includes("resolveEntityAccess")).toBe(true);
    expect(src.includes("witnessScopedRead")).toBe(true);
    expect(src.includes("25000")).toBe(true);
  });
});

// ===================== و) UI کاشی آگهی (M1) =====================

describe("P6521-و — UI کاشی آگهی‌های ملک تبریز (ساختاری)", () => {
  const page = readFileSync("src/core/tiles/tiles/arm-listing/ArmListingsPage.tsx", "utf8");


  test("و۲) ستون وضعیت: Badge رنگی canonical + خنثی برای خارج از شش‌گانه", () => {
    expect(page.includes("STATE_BADGE_CLASS")).toBe(true);
    expect(page.includes("classifyListingStatus")).toBe(true);
    expect(page.includes("listingStatusLabel")).toBe(true);
    for (const cls of ["emerald", "amber", "teal", "rose", "fuchsia", "stone"]) {
      expect(page.includes(cls)).toBe(true);
    }
  });

  test("و۳) کارت بینش توزیع: شمار + درصد هر شش حالت + سایر", () => {
    expect(page.includes('id="arm-listing-states-insight"')).toBe(true);
    expect(page.includes("توزیع وضعیت آگهی‌ها")).toBe(true);
    expect(page.includes("سایر وضعیت‌ها")).toBe(true);
    expect(page.includes("statusCounts")).toBe(true);
  });

  test("و۴) تغییر نام ستون: «مالک» (نه «مالک ملک») — دستور ۰۲۰", () => {
    expect(page.includes('">مالک</TableHead>')).toBe(true);
    expect(page.includes('">مالک ملک</TableHead>')).toBe(false);
  });

  test("و۵) نشانی: نمایش آدرس کامل (کوی/پلاک منبع) + اشارهٔ صریح در توضیح", () => {
    expect(page.includes("آدرس ملک")).toBe(true);
    expect(page.includes("کوی/پلاک")).toBe(true);
  });

  test("و۶) ساختارهای قبلی دست‌نخورده (رگرسیون)", () => {
    expect(page.includes("AgentPanel")).toBe(true);
    expect(page.includes('id="arm-listing-code"')).toBe(true);
    expect(page.includes('id="arm-listing-realtor"')).toBe(true);
    expect(page.includes("بروزرسانی از سامانه")).toBe(true);
    expect(page.includes("pageSize")).toBe(false);
    expect(page.includes("slice(0,")).toBe(false);
  });
});

// ===================== ز) UI کاشی درخواست (M2) =====================

describe("P6521-ز — UI کاشی درخواست‌های ملک تبریز (ساختاری)", () => {
  const page = readFileSync("src/core/tiles/tiles/arm-request/ArmRequestsPage.tsx", "utf8");

  test("ز۱) ستون منطقه: متن ساده + جای‌نگهدار شفاف وقتی منبع تکمیل نشده", () => {
    expect(page.includes('">منطقه</TableHead>')).toBe(true);
    expect(page.includes("areaNames")).toBe(true);
    expect(page.includes('id="arm-request-area-cell"')).toBe(true);
    expect(page.includes("در نوبت تکمیل از سامانه")).toBe(true);
  });

  test("ز۲) دو تغییر نام ستون: متقاضی + شماره تماس متقاضی", () => {
    expect(page.includes('">متقاضی</TableHead>')).toBe(true);
    expect(page.includes('">شماره تماس متقاضی</TableHead>')).toBe(true);
    expect(page.includes('">درخواست‌دهنده</TableHead>')).toBe(false);
    expect(page.includes('">شماره تماس درخواست‌دهنده</TableHead>')).toBe(false);
  });

  test("ز۳) ساختارهای قبلی دست‌نخورده (رگرسیون)", () => {
    expect(page.includes("AgentPanel")).toBe(true);
    expect(page.includes('id="arm-request-code"')).toBe(true);
    expect(page.includes('id="arm-request-realtor"')).toBe(true);
    expect(page.includes("بروزرسانی از سامانه")).toBe(true);
    expect(page.includes("pageSize")).toBe(false);
    expect(page.includes("slice(0,")).toBe(false);
  });
});

// ===================== ح) غنی‌سازی ARM — مسیر دادهٔ منطقه (M2) =====================

describe("P6521-ح — غنی‌سازی درخواست: مسیر دادهٔ منطقه", () => {
  test("ح۱) حلقهٔ غنی‌سازی جزئیات درخواست را هم می‌پرسد و منطقه ذخیره می‌کند (بهترین-تلاش)", () => {
    const src = readFileSync("src/lib/melk-api/arm-catalog.ts", "utf8");
    expect(src.includes("requestDetails")).toBe(true);
    expect(src.includes("extractRequestAreas")).toBe(true);
    expect(src.includes("input.areaNames = areaNames")).toBe(true);
    // بهترین-تلاش: خطای جزئیات نباید غنی‌سازی تماس را بشکند
    expect(src.includes("جزئیات درخواست بهترین-تلاش")).toBe(true);
  });

  test("ح۲) کوی/پلاک دفاعی در غنی‌سازی آگهی: الحاق به آدرس فقط اگر فیلد جدا و تازه باشد", () => {
    const src = readFileSync("src/lib/melk-api/arm-catalog.ts", "utf8");
    expect(src.includes("کوی ${kooi}")).toBe(true);
    expect(src.includes("پلاک ${plak}")).toBe(true);
    expect(src.includes("!address.includes(kooi)")).toBe(true);
    expect(src.includes("!address.includes(plak)")).toBe(true);
  });
});

// ===================== پاک‌سازی رکوردهای تست =====================

describe("P6521 — پاک‌سازی", () => {
  test("حذف رکوردهای تست", async () => {
    await db.propertyRecord.deleteMany({ where: { propertyCode: { startsWith: `${T}-` } } });
    await db.requestRecord.deleteMany({ where: { requestCode: { startsWith: `${T}-` } } });
    expect(true).toBe(true);
  });
});
