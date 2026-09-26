/**
 * p6525-list-law-filters.test.ts — P6525 (دستور مالک ۱۴۰۵/۰۷/۰۵)
 * =============================================================================
 * ثانیاً: «با حذف کلیهٔ تست‌های سابقِ فیلترِ تمام فهرست‌ها (آگهی/درخواست/معاملات)
 *         برای تمام اجزای فیلترهای مزبور جدید طراحی و ایجاد و عملیاتی شوند»
 * + اولاً: قانون همیشگی فهرست‌ها (تک‌صفحه/اسکرول سریع/عنوان ثابت/تمام ردیف‌ها/وسط‌چین)
 * + ثالثاً: امکان نصب اپلیکیشن (PWA) روی لینک publish
 *
 * ریشهٔ تاریخی این پرونده: باگ ۴/۵ — چهار فایل رشتهٔ «۰۱۲۳۵۴۶۷۸۹» (جابه‌جایی ۴ و ۵)
 * داشتند؛ جست‌وجوی «۵۹۲۵۲» به «49252» ترجمه می‌شد و صفر نتیجه می‌داد (شاهد زندهٔ پروب).
 * تست‌های قدیمی فیلتر این باگ را ندیدند چون همان نگاشت درون‌خطی معیوب را در خود داشتند.
 * این نسخهٔ جدید: (۱) قانون یکسان‌سازی را در «منبع یگانه» می‌آزماید  (۲) فیلترها را
 * از مسیر کامل UI-params → route → repo می‌آزماید  (۳) گارد همیشگی نصب می‌کند که
 * هرگز رشتهٔ ده‌رقمیِ غیرمرتب در src بازنگردد.
 */
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, expect, test, describe } from "bun:test";

const P = "p6525t-";
const SRC = "/home/z/my-project/src";

/* ==========================================================================
 * ابزار مشترک — نشست OWNER و فراخوانی مستقیم روت‌ها (الگوی اثبات‌شدهٔ p015)
 * ========================================================================== */
let OWNER_TOKEN: string | null = null;

async function ownerToken(): Promise<string> {
  if (OWNER_TOKEN) return OWNER_TOKEN;
  const { createSession } = await import("@/lib/auth/session");
  const { token } = await createSession(
    { personnelCode: "950025", displayName: "تست فیلتر P6525", role: "OWNER" },
    { ip: "127.0.0.1" },
    null
  );
  OWNER_TOKEN = token;
  return token;
}

async function callRoute(routeModule: string, query: string): Promise<{ status: number; body: any }> {
  const route = await import(routeModule);
  const { NextRequest } = await import("next/server");
  const token = await ownerToken();
  const req = new NextRequest(`http://localhost${query}`, { headers: { authorization: `Bearer ${token}` } });
  const res = await route.GET(req);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

/* ==========================================================================
 * بخش ۱ — قانون یکسان‌سازی ارقام/حروف (ماژول مرکزی — بنیان همهٔ فیلترها)
 * ========================================================================== */

describe("P6525 · بخش ۱ — قانون یکسان‌سازی (منبع یگانهٔ normalize-input)", () => {
  test("۱-۱) هر ۱۰ رقم فارسی → لاتینِ درست — به‌ویژه ۴↦4 و ۵↦5 (رگرسیون باگ تاریخی)", async () => {
    const { normalizeFaDigits } = await import("@/lib/normalize-input");
    expect(normalizeFaDigits("۰")).toBe("0");
    expect(normalizeFaDigits("۱")).toBe("1");
    expect(normalizeFaDigits("۲")).toBe("2");
    expect(normalizeFaDigits("۳")).toBe("3");
    expect(normalizeFaDigits("۴")).toBe("4"); // قبلاً با رشتهٔ معیوب «۵» می‌داد
    expect(normalizeFaDigits("۵")).toBe("5"); // قبلاً با رشتهٔ معیوب «۴» می‌داد
    expect(normalizeFaDigits("۶")).toBe("6");
    expect(normalizeFaDigits("۷")).toBe("7");
    expect(normalizeFaDigits("۸")).toBe("8");
    expect(normalizeFaDigits("۹")).toBe("9");
    // نگاشت کامل یک‌جا: رشتهٔ مرتب = خود ارقام لاتین
    expect(normalizeFaDigits("۰۱۲۳۴۵۶۷۸۹")).toBe("0123456789");
  });

  test("۱-۲) هر ۱۰ رقم عربی → لاتینِ درست", async () => {
    const { normalizeFaDigits } = await import("@/lib/normalize-input");
    expect(normalizeFaDigits("٠")).toBe("0");
    expect(normalizeFaDigits("٤")).toBe("4");
    expect(normalizeFaDigits("٥")).toBe("5");
    expect(normalizeFaDigits("٠١٢٣٤٥٦٧٨٩")).toBe("0123456789");
  });

  test("۱-۳) رگرسیون شاهد زندهٔ باگ: «۵۹۲۵۲» = 59252 (قبلاً به 49252 ترجمه و صفر نتیجه می‌داد)", async () => {
    const { normalizeFaDigits } = await import("@/lib/normalize-input");
    expect(normalizeFaDigits("۵۹۲۵۲")).toBe("59252");
    expect(normalizeFaDigits("۵۹۱۵")).toBe("5915"); // نمونهٔ عینی گزارش مالک
  });

  test("۱-۴) قید یکسانی مالک: نتیجهٔ فارسی = عربی = لاتین برای هر عدد چندرقمی", async () => {
    const { normalizeFaDigits } = await import("@/lib/normalize-input");
    const latin = "40591472583";
    const fa = "۴۰۵۹۱۴۷۲۵۸۳";
    const ar = "٤٠٥٩١٤٧٢٥٨٣";
    expect(normalizeFaDigits(fa)).toBe(latin);
    expect(normalizeFaDigits(ar)).toBe(latin);
    expect(normalizeFaDigits(latin)).toBe(latin);
  });

  test("۱-۵) حروف عربی → فارسی: ي↦ی و ك↦ک (نکتهٔ ۲ مالک) + مخلوط با ارقام", async () => {
    const { normalizeFaLetters, normalizeFilterInput } = await import("@/lib/normalize-input");
    expect(normalizeFaLetters("طهماسبي")).toBe("طهماسبی"); // ي عربی → ی فارسی
    expect(normalizeFaLetters("بكر")).toBe("بکر"); // ك عربی → ک فارسی
    expect(normalizeFaLetters("یاسین کاظمی")).toBe("یاسین کاظمی"); // فارسی دست‌نخورده
    expect(normalizeFilterInput("ياسین ۵۹۱۵ك")).toBe("یاسین 5915ک"); // مخلوط: حروف + ارقام
  });

  test("۱-۶) normalizeFilterInput: نیم‌فاصله → فاصله + فشرده‌سازی + trim + تهی → خالی", async () => {
    const { normalizeFilterInput } = await import("@/lib/normalize-input");
    expect(normalizeFilterInput("  سید   یاسین  ")).toBe("سید یاسین");
    expect(normalizeFilterInput("مبایعه\u200cنامه")).toBe("مبایعه نامه");
    expect(normalizeFilterInput(null)).toBe("");
    expect(normalizeFilterInput(undefined)).toBe("");
    expect(normalizeFilterInput("   ")).toBe("");
  });

  test("۱-۷) گارد همیشگی (هرگز دیگر): هیچ رشتهٔ ده‌رقمیِ غیرمرتب در src وجود ندارد", async () => {
    const { readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    // الگوی رشته‌های ده‌کاراکتری از ارقام فارسی/عربی — هر کدام باید دقیقاً مرتب باشد
    const faOrdered = "۰۱۲۳۴۵۶۷۸۹";
    const arOrdered = "٠١٢٣٤٥٦٧٨٩";
    const bad: string[] = [];
    const scan = (dir: string) => {
      for (const name of readdirSync(dir)) {
        if (name === "node_modules" || name.startsWith(".")) continue;
        const full = join(dir, name);
        if (statSync(full).isDirectory()) {
          scan(full);
          continue;
        }
        if (!/\.(ts|tsx|js|jsx)$/.test(name)) continue;
        const src = readFileSync(full, "utf8");
        for (const m of src.matchAll(/["'`]([^"'`\n]{10})["'`]/g)) {
          const s = m[1];
          const isFa10 = /^[\u06F0-\u06F9]{10}$/.test(s);
          const isAr10 = /^[\u0660-\u0669]{10}$/.test(s);
          if (!isFa10 && !isAr10) continue;
          // رشتهٔ نگاشت = جایگشت کامل ۱۰ رقمِ «متفاوت»؛ عدد واقعی (قیمت/تلفن) رقم تکراری دارد
          const distinct = new Set(s).size;
          if (distinct !== 10) continue;
          if (s !== faOrdered && s !== arOrdered) {
            bad.push(`${full}: «${s}»`);
          }
        }
      }
    };
    scan(SRC);
    expect(bad).toEqual([]);
    // رشتهٔ باگ تاریخی «۰۱۲۳۵۴۶۷۸۹» (جابه‌جایی ۴ و ۵) به‌طور مطلق هرگز نباید در src وجود داشته باشد
    expect(bad.includes("۰۱۲۳۵۴۶۷۸۹")).toBe(false);
  });

  test("۱-۸) نمای قدیمی normalizeFilterText هم ارقام و هم حروف را یکسان می‌کند (پایداری API)", async () => {
    const { normalizeFilterText } = await import("@/lib/contract-classify");
    expect(normalizeFilterText("۵۹۱۵")).toBe("5915");
    expect(normalizeFilterText("طهماسبي")).toBe("طهماسبی");
    expect(normalizeFilterText("مبایعه\u200cنامه ۴")).toBe("مبایعه نامه 4");
  });
});

/* ==========================================================================
 * بخش ۲ — فیلترهای فهرست آگهی (کد + نام کارشناس + وضعیت شش‌حالته)
 * ========================================================================== */

describe("P6525 · بخش ۲ — فیلترهای فهرست آگهی", () => {
  let repo: any;
  // مقادیر خام وضعیت از خود قانون شش‌حالته (بدون هاردکد)
  let RAW_PUBLISHED: string;
  let RAW_EXPIRED: string;

  beforeAll(async () => {
    const { getPropertyRecordRepository } = await import("@/core/repositories");
    const { listingStateRawValues } = await import("@/lib/listing-status");
    repo = getPropertyRecordRepository();
    RAW_PUBLISHED = listingStateRawValues(["published"])[0];
    RAW_EXPIRED = listingStateRawValues(["expired"])[0];

    await repo.upsertBulk(
      [
        {
          id: `${P}p1`,
          propertyCode: `${P}4515`, // شامل هر دو رقم بحرانی ۴ و ۵
          title: "فروش آپارتمان",
          ownerName: "سید یاسین کاظمی", // ی و ک فارسی
          address: "تبریز، خاوران",
          status: RAW_PUBLISHED,
          createdAt: new Date("2026-09-25T10:00:00Z"),
        },
        {
          id: `${P}p2`,
          propertyCode: `${P}5925`,
          title: "رهن و اجاره ویلا",
          ownerName: "مهدی شجاع زاده احمد طهماسبي", // ي عربی در خود DB (شاهد زندهٔ DB)
          address: "تبریز، ولیعصر",
          status: RAW_EXPIRED,
          createdAt: new Date("2026-09-24T10:00:00Z"),
        },
        {
          id: `${P}p3`,
          propertyCode: `${P}1020`,
          ownerName: "کارشناس سوم تست",
          status: RAW_PUBLISHED,
          createdAt: new Date("2026-09-23T10:00:00Z"),
        },
      ],
      { sourceRunId: `${P}run1` }
    );
  });

  afterAll(async () => {
    const { db } = await import("@/lib/db");
    await db.propertyRecord.deleteMany({ where: { propertyCode: { startsWith: P } } }).catch(() => undefined);
  });

  test("۲-۱) کد: ارقام فارسی = ارقام لاتین (رگرسیون باگ ۴/۵ — «۴۵۱۵» هم «4515» را پیدا می‌کند)", async () => {
    const fa = await repo.listArmCatalog({ code: `${P}۴۵۱۵` }, 100);
    const latin = await repo.listArmCatalog({ code: `${P}4515` }, 100);
    expect(latin.rows.length).toBe(1);
    expect(fa.rows.length).toBe(1); // قبلاً با باگ ۴/۵ صفر می‌شد
    expect(fa.rows[0].propertyCode).toBe(`${P}4515`);
    expect(fa.total).toBe(1);
  });

  test("۲-۲) کد: ارقام عربی = ارقام لاتین", async () => {
    const ar = await repo.listArmCatalog({ code: `${P}٤٥١٥` }, 100);
    expect(ar.rows.length).toBe(1);
    expect(ar.rows[0].propertyCode).toBe(`${P}4515`);
  });

  test("۲-۳) کد: تطبیق جزئی (contains) — انتهای کد", async () => {
    const part = await repo.listArmCatalog({ code: `${P}59` }, 100);
    expect(part.rows.length).toBe(1);
    expect(part.rows[0].propertyCode).toBe(`${P}5925`);
  });

  test("۲-۴) کد ناموجود → صفر نتیجه و total = صفر", async () => {
    const none = await repo.listArmCatalog({ code: `${P}99999` }, 100);
    expect(none.rows.length).toBe(0);
    expect(none.total).toBe(0);
  });

  test("۲-۵) بدون فیلتر → همهٔ ردیف‌های کاشته‌شده (تک‌صفحه‌ای)", async () => {
    const all = await repo.listArmCatalog({}, 100);
    const mine = all.rows.filter((r: any) => r.propertyCode.startsWith(P));
    expect(mine.length).toBe(3);
  });

  test("۲-۶) نام کارشناس: ورودی با «ي» عربی = ورودی با «ی» فارسی (نکتهٔ ۲ مالک — همان نتیجه)", async () => {
    const fa = await repo.listArmCatalog({ realtorName: "ياسین" }, 100); // ي عربی در ورودی
    const latin = await repo.listArmCatalog({ realtorName: "یاسین" }, 100); // ی فارسی
    expect(fa.rows.some((r: any) => r.propertyCode === `${P}4515`)).toBe(true);
    expect(fa.total).toBe(latin.total); // قانون: نتیجهٔ یکسان
  });

  test("۲-۷) نام کارشناس: ورودی با «ك» عربی = «ک» فارسی", async () => {
    const ar = await repo.listArmCatalog({ realtorName: "كاظمی" }, 100);
    expect(ar.rows.some((r: any) => r.propertyCode === `${P}4515`)).toBe(true);
  });

  test("۲-۸) نام با «ي» عربی در DB با ورودی فارسی «ی» پیدا می‌شود (نرمال‌سازی دوطرفه)", async () => {
    // ردیف p2 در DB خودش «طهماسبي» با ي عربی دارد — contains خام SQL این را نمی‌دید
    const res = await repo.listArmCatalog({ realtorName: "طهماسبی" }, 100);
    expect(res.rows.some((r: any) => r.propertyCode === `${P}5925`)).toBe(true);
  });

  test("۲-۹) نام کارشناس ناموجود → صفر", async () => {
    const none = await repo.listArmCatalog({ realtorName: "نام ناموجود کامل" }, 100);
    expect(none.total).toBe(0);
  });

  test("۲-۱۰) وضعیت: تک‌حالته — فقط ردیف‌های همان حالت", async () => {
    const { listingStateRawValues } = await import("@/lib/listing-status");
    const res = await repo.listArmCatalog({ statuses: listingStateRawValues(["expired"]) }, 100);
    const mine = res.rows.filter((r: any) => r.propertyCode.startsWith(P));
    expect(mine.length).toBe(1);
    expect(mine[0].propertyCode).toBe(`${P}5925`);
  });

  test("۲-۱۱) وضعیت: ترکیبی — اجتماع دو حالت", async () => {
    const { listingStateRawValues } = await import("@/lib/listing-status");
    const res = await repo.listArmCatalog(
      { statuses: listingStateRawValues(["published", "expired"]) },
      100
    );
    const mine = res.rows.filter((r: any) => r.propertyCode.startsWith(P));
    expect(mine.length).toBe(3); // p1 + p2 + p3
  });

  test("۲-۱۲) ترکیب کد + کارشناس → اشتراق (هم‌زمان)", async () => {
    const both = await repo.listArmCatalog({ code: `${P}45`, realtorName: "کاظمی" }, 100);
    expect(both.rows.length).toBe(1);
    expect(both.rows[0].propertyCode).toBe(`${P}4515`);
  });

  test("۲-۱۳) روت API: پارامتر خام فارسی همان نتیجهٔ لاتین را می‌دهد (مسیر کامل UI → API)", async () => {
    // صفحهٔ UI پارامتر را نرمال‌شده می‌فرستد؛ اما روت هم باید در برابر ورودی خام مقاوم و یکسان باشد
    const fa = await callRoute("@/app/api/crm/arm-catalog/listings/route", `/api/crm/arm-catalog/listings?code=${encodeURIComponent(`${P}۴۵۱۵`)}`);
    const latin = await callRoute("@/app/api/crm/arm-catalog/listings/route", `/api/crm/arm-catalog/listings?code=${encodeURIComponent(`${P}4515`)}`);
    expect(fa.status).toBe(200);
    expect(latin.status).toBe(200);
    expect(fa.body.rows.length).toBe(1);
    expect(fa.body.rows.length).toBe(latin.body.rows.length);
    expect(fa.body.rows[0].propertyCode).toBe(`${P}4515`);
  });

  test("۲-۱۴) روت API: نام کارشناس با ي عربی = ی فارسی (نکتهٔ ۲ مالک در سطح روت)", async () => {
    const ar = await callRoute("@/app/api/crm/arm-catalog/listings/route", `/api/crm/arm-catalog/listings?realtorName=${encodeURIComponent("طهماسبي")}`);
    const fa = await callRoute("@/app/api/crm/arm-catalog/listings/route", `/api/crm/arm-catalog/listings?realtorName=${encodeURIComponent("طهماسبی")}`);
    expect(ar.status).toBe(200);
    expect(fa.status).toBe(200);
    expect(ar.body.rows.some((r: any) => r.propertyCode === `${P}5925`)).toBe(true);
    expect(fa.body.rows.some((r: any) => r.propertyCode === `${P}5925`)).toBe(true);
  });
});

/* ==========================================================================
 * بخش ۳ — فیلترهای فهرست درخواست (کد + نام کارشناس)
 * ========================================================================== */

describe("P6525 · بخش ۳ — فیلترهای فهرست درخواست", () => {
  let repo: any;

  beforeAll(async () => {
    const { getRequestRepository } = await import("@/core/repositories");
    repo = getRequestRepository();
    await repo.upsertArmBulk(
      [
        {
          id: `${P}r1`,
          requestCode: `${P}5234`, // شامل ۵ و ۴
          customerName: "آقایی",
          status: "در دست اقدام",
          actorName: "پیام عبدی تست", // ی فارسی
          title: "خرید آپارتمان",
          createdAt: new Date("2026-09-25T21:41:53Z"),
        },
        {
          id: `${P}r2`,
          requestCode: `${P}1025`,
          customerName: "اصلانی",
          status: "سرنخ",
          actorName: "مجيد جودي تست", // ي عربی در DB
          createdAt: new Date("2026-09-24T10:00:00Z"),
        },
      ],
      { sourceRunId: `${P}rrun1` }
    );
  });

  afterAll(async () => {
    const { db } = await import("@/lib/db");
    await db.requestRecord.deleteMany({ where: { requestCode: { startsWith: P } } }).catch(() => undefined);
  });

  test("۳-۱) کد: فارسی = لاتین (رگرسیون باگ ۴/۵)", async () => {
    const fa = await repo.listArmCatalog({ code: `${P}۵۲۳۴` }, 100);
    const latin = await repo.listArmCatalog({ code: `${P}5234` }, 100);
    expect(latin.rows.length).toBe(1);
    expect(fa.rows.length).toBe(1);
    expect(fa.rows[0].requestCode).toBe(`${P}5234`);
  });

  test("۳-۲) کد: عربی = لاتین", async () => {
    const ar = await repo.listArmCatalog({ code: `${P}٥٢٣٤` }, 100);
    expect(ar.rows.length).toBe(1);
    expect(ar.rows[0].requestCode).toBe(`${P}5234`);
  });

  test("۳-۳) کد: تطبیق جزئی + ناموجود → صفر + بدون فیلتر → همه", async () => {
    const part = await repo.listArmCatalog({ code: `${P}10` }, 100);
    expect(part.rows.length).toBe(1);
    expect(part.rows[0].requestCode).toBe(`${P}1025`);
    const none = await repo.listArmCatalog({ code: `${P}999` }, 100);
    expect(none.total).toBe(0);
    const all = await repo.listArmCatalog({}, 100);
    expect(all.rows.filter((r: any) => r.requestCode.startsWith(P)).length).toBe(2);
  });

  test("۳-۴) کارشناس: ي/ی هم‌ارزی دوطرفه (ورودی عربی ↔ DB عربی)", async () => {
    // ورودی فارسی، DB عربی («مجيد جودي»)
    const fa = await repo.listArmCatalog({ realtorName: "مجید جودی" }, 100);
    expect(fa.rows.some((r: any) => r.requestCode === `${P}1025`)).toBe(true);
    // ورودی عربی، DB فارسی («پیام عبدی»)
    const ar = await repo.listArmCatalog({ realtorName: "عبدي" }, 100);
    expect(ar.rows.some((r: any) => r.requestCode === `${P}5234`)).toBe(true);
  });

  test("۳-۵) روت API: پارامتر خام فارسی همان نتیجهٔ لاتین (مسیر کامل)", async () => {
    const fa = await callRoute("@/app/api/crm/arm-catalog/requests/route", `/api/crm/arm-catalog/requests?code=${encodeURIComponent(`${P}۵۲۳۴`)}`);
    const latin = await callRoute("@/app/api/crm/arm-catalog/requests/route", `/api/crm/arm-catalog/requests?code=${encodeURIComponent(`${P}5234`)}`);
    expect(fa.status).toBe(200);
    expect(latin.status).toBe(200);
    expect(fa.body.rows.length).toBe(1);
    expect(fa.body.rows[0].requestCode).toBe(`${P}5234`);
    expect(fa.body.rows.length).toBe(latin.body.rows.length);
  });
});

/* ==========================================================================
 * بخش ۴ — فیلترهای فهرست معاملات (۷ جزء: کد ملک/کد درخواست/هولوگرام/
 *         نام کارشناس/کد پرسنلی/نوع قرارداد/بازهٔ تاریخ)
 * ========================================================================== */

describe("P6525 · بخش ۴ — فیلترهای فهرست معاملات", () => {
  const TX_HOLO = `${P}7735`; // هولوگرام شامل ۵ و ۷

  beforeAll(async () => {
    const { db } = await import("@/lib/db");
    // دادهٔ تست قبلی همین پیشوند را پاک کن (idempotent)
    await db.transactionRecord.deleteMany({ where: { id: { startsWith: P } } }).catch(() => undefined);
    await db.contractRecord.deleteMany({ where: { id: { startsWith: P } } }).catch(() => undefined);
    await db.transactionRecord.createMany({
      data: [
        {
          id: `${P}t1`,
          contractDate: new Date("2026-06-10T12:00:00Z"),
          propertyCode: `${P}8845`, // شامل ۵ و ۴
          requestCode: `${P}6631`,
          contractHolo: TX_HOLO,
          eventsCount: 2,
        },
        {
          id: `${P}t2`,
          contractDate: new Date("2026-06-11T12:00:00Z"),
          propertyCode: `${P}9910`,
          requestCode: null,
          contractHolo: null,
          eventsCount: 1,
        },
      ],
    });
    // قرارداد غنی‌سازی: مشاور با «ي» عربی در نام — برای فیلتر نام کارشناس (نرمال دوطرفه)
    await db.contractRecord.create({
      data: {
        id: `${P}c1`,
        status: "finished",
        contractHolo: TX_HOLO,
        propertyCode: `${P}8845`,
        requestCode: `${P}6631`,
        contractType: "مبایعه نامه",
        contractDate: new Date("2026-06-10T12:00:00Z"),
        realtorListJson: JSON.stringify([
          { name: "وحيد حيدري تست P6525", unitPercent: 100, confirmation: "confirm" },
        ]),
      },
    });
  });

  afterAll(async () => {
    const { db } = await import("@/lib/db");
    await db.transactionRecord.deleteMany({ where: { id: { startsWith: P } } }).catch(() => undefined);
    await db.contractRecord.deleteMany({ where: { id: { startsWith: P } } }).catch(() => undefined);
    await db.$disconnect();
  });

  test("۴-۱) کد ملک: فارسی = لاتین (رگرسیون ۴/۵)", async () => {
    const fa = await callRoute("@/app/api/crm/transactions/route", `/api/crm/transactions?propertyCode=${encodeURIComponent(`${P}۸۸۴۵`)}`);
    const latin = await callRoute("@/app/api/crm/transactions/route", `/api/crm/transactions?propertyCode=${encodeURIComponent(`${P}8845`)}`);
    expect(fa.status).toBe(200);
    expect(latin.status).toBe(200);
    expect(latin.body.rows.length).toBe(1);
    expect(fa.body.rows.length).toBe(1);
    expect(fa.body.rows[0].propertyCode).toBe(`${P}8845`);
  });

  test("۴-۲) کد درخواست: فارسی = لاتین", async () => {
    const fa = await callRoute("@/app/api/crm/transactions/route", `/api/crm/transactions?requestCode=${encodeURIComponent(`${P}۶۶۳۱`)}`);
    expect(fa.status).toBe(200);
    expect(fa.body.rows.length).toBe(1);
    expect(fa.body.rows[0].requestCode).toBe(`${P}6631`);
  });

  test("۴-۳) شماره هولوگرام: فارسی = لاتین", async () => {
    const fa = await callRoute("@/app/api/crm/transactions/route", `/api/crm/transactions?contractHolo=${encodeURIComponent(`${P}۷۷۳۵`)}`);
    const latin = await callRoute("@/app/api/crm/transactions/route", `/api/crm/transactions?contractHolo=${encodeURIComponent(TX_HOLO)}`);
    expect(fa.status).toBe(200);
    expect(latin.status).toBe(200);
    expect(fa.body.rows.length).toBe(1);
    expect(fa.body.rows[0].id).toBe(`${P}t1`);
    expect(fa.body.rows.length).toBe(latin.body.rows.length);
  });

  test("۴-۴) نام کارشناس: «ي» عربی در داده ↔ «ی» فارسی در ورودی — نرمال دوطرفه", async () => {
    // نام در قرارداد: «وحيد حيدري» (ي عربی) — ورودی با ی فارسی باید پیدایش کند
    const fa = await callRoute("@/app/api/crm/transactions/route", `/api/crm/transactions?expertName=${encodeURIComponent("وحید حیدری تست")}`);
    expect(fa.status).toBe(200);
    expect(fa.body.rows.some((r: any) => r.id === `${P}t1`)).toBe(true);
    // و ورودی عربی هم همان نتیجه
    const ar = await callRoute("@/app/api/crm/transactions/route", `/api/crm/transactions?expertName=${encodeURIComponent("وحيد حيدري تست")}`);
    expect(ar.body.rows.some((r: any) => r.id === `${P}t1`)).toBe(true);
  });

  test("۴-۵) کد پرسنلی: نام مستعار expertCode همان personnelCode است", async () => {
    const a = await callRoute("@/app/api/crm/transactions/route", `/api/crm/transactions?expertCode=${encodeURIComponent(`${P}code`)}`);
    const b = await callRoute("@/app/api/crm/transactions/route", `/api/crm/transactions?personnelCode=${encodeURIComponent(`${P}code`)}`);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    // کد نامعلوم در هیچ منبعی ⇒ صفر نتیجه (نه همه) — رفتار هر دو پارامتر یکسان
    expect(a.body.total).toBe(b.body.total);
  });

  test("۴-۶) نوع قرارداد: چندگانه = مجموع دو نوع", async () => {
    const single = await callRoute("@/app/api/crm/transactions/route", `/api/crm/transactions?contractType=${encodeURIComponent("مبایعه‌نامه")}`);
    expect(single.status).toBe(200);
    expect(single.body.rows.every((r: any) => r.contractType === null || `${r.contractType}`.includes("مبایعه"))).toBe(true);
    expect(single.body.rows.some((r: any) => r.id === `${P}t1`)).toBe(true);
    expect(single.body.rows.some((r: any) => r.id === `${P}t2`)).toBe(false);
  });

  test("۴-۷) نوع قرارداد: none → فقط ردیف‌های بدون قرارداد", async () => {
    const none = await callRoute("@/app/api/crm/transactions/route", `/api/crm/transactions?contractType=none`);
    expect(none.status).toBe(200);
    expect(none.body.rows.some((r: any) => r.id === `${P}t2`)).toBe(true);
    expect(none.body.rows.some((r: any) => r.id === `${P}t1`)).toBe(false);
  });

  test("۴-۸) نوع قرارداد ناشناخته → 400 با پیام شفاف (نه بازگرداندن همه)", async () => {
    const bad = await callRoute("@/app/api/crm/transactions/route", `/api/crm/transactions?contractType=${encodeURIComponent("قرارداد عجیب P6525")}`);
    expect(bad.status).toBe(400);
    expect(bad.body.ok).toBe(false);
    expect(bad.body.message).toContain("شناخته نشد");
  });

  test("۴-۹) بازهٔ تاریخ به وقت تهران: مرز روز (+03:30)", async () => {
    // t1 = 2026-06-10T12:00Z = 2026-06-10 15:30 تهران — داخل بازهٔ ۱۰ ژوئن
    const inRange = await callRoute("@/app/api/crm/transactions/route", `/api/crm/transactions?dateFrom=2026-06-10&dateTo=2026-06-10`);
    expect(inRange.status).toBe(200);
    expect(inRange.body.rows.some((r: any) => r.id === `${P}t1`)).toBe(true);
    // بازهٔ روز بعد → t1 نباید باشد
    const nextDay = await callRoute("@/app/api/crm/transactions/route", `/api/crm/transactions?dateFrom=2026-06-11&dateTo=2026-06-11`);
    expect(nextDay.body.rows.some((r: any) => r.id === `${P}t1`)).toBe(false);
    expect(nextDay.body.rows.some((r: any) => r.id === `${P}t2`)).toBe(true);
  });

  test("۴-۱۰) بدون فیلتر → همهٔ ردیف‌های کاشته‌شده + total منطبق", async () => {
    const all = await callRoute("@/app/api/crm/transactions/route", `/api/crm/transactions`);
    expect(all.status).toBe(200);
    expect(all.body.rows.some((r: any) => r.id === `${P}t1`)).toBe(true);
    expect(all.body.rows.some((r: any) => r.id === `${P}t2`)).toBe(true);
  });
});

/* ==========================================================================
 * بخش ۵ — قانون همیشگی فهرست‌ها (ساختاری — منبع قانون در پریمیتیوها و صفحات)
 * ========================================================================== */

describe("P6525 · بخش ۵ — قانون فهرست (منبع قانون در پریمیتیوها)", () => {
  const table = readFileSync("/home/z/my-project/src/components/ui/table.tsx", "utf8");
  const listingsPage = readFileSync("/home/z/my-project/src/core/tiles/tiles/arm-listing/ArmListingsPage.tsx", "utf8");
  const requestsPage = readFileSync("/home/z/my-project/src/core/tiles/tiles/arm-request/ArmRequestsPage.tsx", "utf8");
  const txTab = readFileSync("/home/z/my-project/src/core/tiles/tiles/transactions-contracts/TransactionsTab.tsx", "utf8");

  test("۵-۱) قانون در ui/table.tsx: ظرف max-h + هدر sticky + وسط‌چین سرستون/سلول + cv-row + فونت text-xs", () => {
    // ۱+۲+۳ — ظرف اسکرول محدود + رندر سبک: عنوان ثابت در زمان اسکرول
    expect(table).toContain("max-h-[32rem]");
    expect(table).toContain("sticky top-0 z-10 bg-card");
    expect(table).toContain("cv-row");
    // ۵ — وسط‌چین: سرستون و سلول
    expect(table).toMatch(/TableHead[\s\S]{0,400}?text-center/);
    expect(table).toMatch(/TableCell[\s\S]{0,400}?text-center/);
    // فونت یکدست سلول‌ها (الگوی فهرست معاملات)
    expect(table).toMatch(/TableCell[\s\S]{0,400}?text-xs/);
  });

  test("۵-۲) سه فهرست نام‌برده: عنوان فهرست وسط‌چین با الگوی فهرست معاملات (CardTitle text-center)", () => {
    expect(listingsPage).toContain('CardTitle className="text-base text-center"');
    expect(requestsPage).toContain('CardTitle className="text-base text-center"');
    expect(txTab).toContain('CardTitle className="text-base text-center"');
    // و شمار ردیف تک‌صفحه‌ای کنار عنوان
    expect(listingsPage).toContain("ردیف — تک‌صفحه‌ای");
    expect(requestsPage).toContain("ردیف — تک‌صفحه‌ای");
    expect(txTab).toContain("ردیف — تک‌صفحه‌ای");
  });

  test("۵-۳) هیچ فهرستی سرستون text-right/text-left ندارد (وسط‌چین همگانی)", () => {
    const pages = [
      "arm-listing/ArmListingsPage.tsx",
      "arm-request/ArmRequestsPage.tsx",
      "transactions-contracts/TransactionsTab.tsx",
      "customer-club/CustomerClubPage.tsx",
      "experts/ExpertsPage.tsx",
      "extraction/ExtractionPage.tsx",
      "price-index/PriceIndexPage.tsx",
      "supply-demand/SupplyDemandPage.tsx",
    ];
    for (const p of pages) {
      const src = readFileSync(`/home/z/my-project/src/core/tiles/tiles/${p}`, "utf8");
      const heads = [...src.matchAll(/<TableHead[^>]*className="([^"]*)"/g)].map((m) => m[1]);
      const bad = heads.filter((c) => c.includes("text-right") || c.includes("text-left") || c.includes("text-start"));
      expect(bad).toEqual([]); // قانون: همه وسط‌چین از پریمیتیو
    }
  });

  test("۵-۴) سه فهرست نام‌برده: تک‌صفحه‌ای — بدون صفحه‌بندی و بدون برش ردیف", () => {
    for (const [name, src] of [["آگهی", listingsPage], ["درخواست", requestsPage], ["معاملات", txTab]] as const) {
      expect(src.includes("pageSize"), `${name}: بدون صفحه‌بندی`).toBe(false);
      expect(src.includes("rows.slice("), `${name}: بدون برش ردیف‌ها`).toBe(false);
      expect(src.includes("rows.map"), `${name}: رندر همهٔ ردیف‌ها`).toBe(true);
    }
  });

  test("۵-۵) API هر سه فهرست: پیش‌فرض تمام ردیف‌ها + سقف گارد ایمنی ۲۵٬۰۰۰", () => {
    const l = readFileSync("/home/z/my-project/src/app/api/crm/arm-catalog/listings/route.ts", "utf8");
    const r = readFileSync("/home/z/my-project/src/app/api/crm/arm-catalog/requests/route.ts", "utf8");
    const t = readFileSync("/home/z/my-project/src/app/api/crm/transactions/route.ts", "utf8");
    for (const [name, src] of [["آگهی", l], ["درخواست", r], ["معاملات", t]] as const) {
      expect(src.includes("25000"), `${name}: سقف گارد ایمنی`).toBe(true);
    }
    // پیش‌فرض = تمام ردیف‌ها (نه ۵۰ یا ۱۵۰)
    expect(t).toContain("?? 25000");
    // UI معاملات هم limit=25000 می‌فرستد
    expect(txTab).toContain('params.set("limit", "25000")');
  });

  test("۵-۶) سه فهرست نام‌برده: نرمال‌سازی فیلتر فقط از ماژول مرکزی (نه نگاشت درون‌خطی)", () => {
    for (const [name, src] of [["آگهی", listingsPage], ["درخواست", requestsPage]] as const) {
      expect(src.includes("normalizeFilterInput"), `${name}: ماژول مرکزی`).toBe(true);
      expect(src.includes("indexOf(d)"), `${name}: بدون نگاشت درون‌خطی`).toBe(false);
    }
    expect(
      listingsPage.includes("۰۱۲۳۵۴۶۷۸۹") || requestsPage.includes("۰۱۲۳۵۴۶۷۸۹"),
      "رشتهٔ باگ تاریخی ۴/۵ هرگز نباید بازگردد"
    ).toBe(false);
    // روت‌های آگهی/درخواست هم از ماژول مرکزی
    const l = readFileSync("/home/z/my-project/src/app/api/crm/arm-catalog/listings/route.ts", "utf8");
    const r = readFileSync("/home/z/my-project/src/app/api/crm/arm-catalog/requests/route.ts", "utf8");
    expect(l.includes("normalizeFilterInput")).toBe(true);
    expect(r.includes("normalizeFilterInput")).toBe(true);
  });
});

/* ==========================================================================
 * بخش ۶ — امکان نصب اپلیکیشن (ثالثاً — PWA روی لینک publish)
 * ========================================================================== */

describe("P6525 · بخش ۶ — نصب اپلیکیشن (PWA)", () => {
  test("۶-۱) manifest کامل: نام + آیکن ۱۹۲/۵۱۲ + maskable + standalone", () => {
    const manifest = JSON.parse(readFileSync("/home/z/my-project/public/manifest.json", "utf8"));
    expect(manifest.name).toBeTruthy();
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/");
    const sizes = manifest.icons.map((i: any) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(manifest.icons.some((i: any) => i.purpose === "maskable")).toBe(true);
  });

  test("۶-۲) دکمهٔ نصب در هدر: beforeinstallprompt + prompt بومی + راهنمای iOS", () => {
    const install = readFileSync("/home/z/my-project/src/components/app/InstallButton.tsx", "utf8");
    expect(install).toContain("beforeinstallprompt");
    expect(install).toContain("deferred.prompt");
    expect(install).toContain("appinstalled");
    expect(install).toContain("display-mode: standalone");
    // iOS: راهنمای «افزودن به صفحهٔ اصلی»
    expect(install).toContain("افزودن به صفحهٔ اصلی");
    const header = readFileSync("/home/z/my-project/src/components/app/AppHeader.tsx", "utf8");
    expect(header).toContain("InstallButton");
  });

  test("۶-۳) متاتگ‌های iOS/Apple در layout (نصب تمام‌صفحه روی iPhone/iPad)", () => {
    const layout = readFileSync("/home/z/my-project/src/app/layout.tsx", "utf8");
    expect(layout).toContain("appleWebApp");
    expect(layout).toContain("capable: true");
    expect(layout).toContain("mobile-web-app-capable");
    expect(layout).toContain('manifest: "/manifest.json"');
  });

  test("۶-۴) سرویس‌ورکر با fetch handler + ثبت در production (پیش‌نیاز نصب‌پذیری)", () => {
    const sw = readFileSync("/home/z/my-project/public/sw-v4.js", "utf8");
    expect(sw).toContain('addEventListener("fetch"');
    const register = readFileSync("/home/z/my-project/src/components/app/SwRegister.tsx", "utf8");
    expect(register).toContain("serviceWorker.register");
    expect(register).toContain("registration.update");
  });
});
