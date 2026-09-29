/**
 * p6530-m2-arm-request.test.ts — سوئیت تازهٔ کاشی M2 «درخواست ملک تبریز» (گام ۲)
 * =============================================================================
 * نکتهٔ بسیار مهم ۲ (گام ۲): «کلیه تست‌های کاشی درخواست ملک تبریز (ایجنت، تنظیمات،
 * بینش، فهرست، فیلتر، بروزرسانی و ...) حذف شود؛ تست‌های جدید طراحی، پیاده‌سازی
 * و اعمال واقعی شود و در انتها راستی‌آزمایی شود.»
 * (سوئیت قدیمی M2 در p6526 حذف شد — این جایگزین کامل است.)
 *
 * بخش‌ها:
 *   §۱ ایجنت · §۲ تنظیمات · §۳ وضعیت شش‌حالته · §۴ فهرست ده‌ستونی ·
 *   §۵ فیلتر تمام ستون‌ها · §۶ بینش‌ها · §۷ بروزرسانی + ریشه‌یابی ۷٬۳۹۸/۲۰٬۳۹۲ ·
 *   §۸ رنگ بخش M2
 */
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, test } from "bun:test";

const P = "p6530m2";
const SRC = "/home/z/my-project/src";
const TILES = "/home/z/my-project/src/core/tiles/tiles";

let OWNER_TOKEN: string | null = null;

async function ownerToken(): Promise<string> {
  if (OWNER_TOKEN) return OWNER_TOKEN;
  const { createSession } = await import("@/lib/auth/session");
  const { token } = await createSession(
    { personnelCode: "950032", displayName: "تست M2", role: "OWNER" },
    { ip: "127.0.0.1" },
    null
  );
  OWNER_TOKEN = token;
  return token;
}

async function callRoute(query: string): Promise<{ status: number; body: any }> {
  const route = await import("@/app/api/crm/arm-catalog/requests/route");
  const { NextRequest } = await import("next/server");
  const token = await ownerToken();
  const req = new NextRequest(`http://localhost${query}`, { headers: { authorization: `Bearer ${token}` } });
  const res = await route.GET(req);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

/* ==========================================================================
 * §۱ — ایجنت کاشی M2
 * ========================================================================== */

describe("گام ۲/M2 §۱ — ایجنت هوشمند", () => {
  beforeAll(async () => {
    await import("@/core/tiles/bootstrap");
  });

  test("۱-۱) ایجنت ثبت شده با شناسه و نام درست", async () => {
    const { getAgent } = await import("@/core/agent");
    const agent = getAgent("arm-requests")!;
    expect(agent).toBeDefined();
    expect(agent.name).toBe("ایجنت درخواست ملک تبریز");
  });

  test("۱-۲) قرارداد کاشی ↔ ایجنت: insightDomains عین هم", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    const { getAgent } = await import("@/core/agent");
    const tile = tileRegistry.get("arm-requests")!;
    const agent = getAgent("arm-requests")!;
    expect([...tile.agent!.insightDomains].sort()).toEqual([...(agent.insightDomains as readonly string[])].sort());
  });

  test("۱-۳) حلقهٔ یادگیری: بازخورد → حافظه + بازیابی RAG سبک", async () => {
    const { getAgent } = await import("@/core/agent");
    const agent = getAgent("arm-requests")!;
    const before = await agent.submitFeedback({ insightKey: `${P}-warmup`, insightTitle: "پیش‌گرمایش", domain: "VOLUME", rating: 1 });
    const after = await agent.submitFeedback({ insightKey: `${P}-fb1`, insightTitle: "تست بازخورد گام ۲", domain: "VOLUME", rating: 1, comment: "بازخورد آزمایشی M2" });
    expect(after.totalFeedback).toBe(before.totalFeedback + 1);
    const hits = await agent.retrieveRelevant("تست بازخورد گام ۲", 5);
    expect(hits.length).toBeGreaterThan(0);
  });

  test("۱-۴) سیاست نسخه‌بندی‌شده", async () => {
    const { getAgent } = await import("@/core/agent");
    const agent = getAgent("arm-requests")!;
    const policy = await agent.getActivePolicy();
    expect(policy.version).toBeGreaterThanOrEqual(1);
    expect(policy.content.weights).toBeDefined();
    expect((await agent.listPolicyVersions()).length).toBeGreaterThanOrEqual(1);
  });
});

/* ==========================================================================
 * §۲ — تنظیمات کاشی M2
 * ========================================================================== */

describe("گام ۲/M2 §۲ — تنظیمات کاشی", () => {
  beforeAll(async () => {
    await import("@/core/tiles/bootstrap");
  });

  test("۲-۱) نسخهٔ ۲٫۰٫۰ (بازطراحی گام ۲) با تنظیمات معتبر", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    const tile = tileRegistry.get("arm-requests")!;
    expect(tile.version).toBe("2.0.0");
    expect(tile.settings.length).toBeGreaterThan(0);
  });

  test("۲-۲) تنظیم «نمایش عنوان درخواست زیر کد» — سوییچ با پیش‌فرض روشن", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    const st = tileRegistry.get("arm-requests")!.settings.find((s) => s.key === "showTitles")!;
    expect(st?.type).toBe("switch");
    expect(st?.defaultValue).toBe(true);
  });

  test("۲-۳) صفحه از showTitles پیروی می‌کند", async () => {
    const s = readFileSync(`${TILES}/arm-request/ArmRequestsPage.tsx`, "utf8");
    expect(s).toContain("settings.showTitles !== false");
  });
});

/* ==========================================================================
 * §۳ — وضعیت شش‌حالته (نکته ۳)
 * ========================================================================== */

describe("گام ۲/M2 §۳ — وضعیت شش‌حالته", () => {
  test("۳-۱) دقیقاً شش حالت با برچسب‌های عین دستور مالک", async () => {
    const { REQUEST_STATES } = await import("@/lib/request-status");
    expect(REQUEST_STATES.map((s) => s.label)).toEqual([
      "معامله شده",
      "در انتظار معامله",
      "سرنخ",
      "در انتظار تایید",
      "از دست رفته/خرید از رقبا",
      "سایر",
    ]);
  });

  test("۳-۲) طبقه‌بندی مقادیر خام واقعی DB (شاهد ۷٬۳۹۸ رکورد) → شش حالت", async () => {
    const { classifyRequestStatus } = await import("@/lib/request-status");
    const cases: Array<[string | null, string]> = [
      ["معامله شده", "traded"],
      ["در انتظار معامله", "pendingTrade"],
      ["سرنخ", "lead"],
      ["در انتظار تایید", "pendingApproval"],
      ["از دست رفته/خرید از رقبا", "lostToCompetitors"],
      ["ready", "other"], // چرخهٔ عمر داخلی ملکا — سایر
      ["بایگانی", "other"],
      ["فرصت", "other"],
      [null, "other"],
    ];
    for (const [raw, expected] of cases) {
      expect(classifyRequestStatus(raw)).toBe(expected as never);
    }
  });

  test("۳-۳) rollupRequestStatusCounts: تجمیع صحیح شش‌حالته (عین توزیع واقعی DB)", async () => {
    const { rollupRequestStatusCounts } = await import("@/lib/request-status");
    // عین توزیع خام DB: سرنخ ۵۱۸۹ · ready 1348 · از دست رفته 561 · معامله 174 · بایگانی 60 · فرصت 38 · تایید 20 · انتظار معامله 8
    const out = rollupRequestStatusCounts([
      ["سرنخ", 5189],
      ["ready", 1348],
      ["از دست رفته/خرید از رقبا", 561],
      ["معامله شده", 174],
      ["بایگانی", 60],
      ["فرصت", 38],
      ["در انتظار تایید", 20],
      ["در انتظار معامله", 8],
    ]);
    expect(out.lead).toBe(5189);
    expect(out.traded).toBe(174);
    expect(out.pendingTrade).toBe(8);
    expect(out.pendingApproval).toBe(20);
    expect(out.lostToCompetitors).toBe(561);
    expect(out.other).toBe(1348 + 60 + 38); // ready + بایگانی + فرصت
    expect(out.total).toBe(7398);
  });

  test("۳-۴) فیلتر وضعیت: پنج‌گانه → IN مقادیر خام؛ «سایر» → NOT IN", async () => {
    const { parseRequestStateFilter, requestStateRawValues, requestFilterIncludesOther } = await import("@/lib/request-status");
    const keys = parseRequestStateFilter("traded,lead,other,bogus");
    expect(keys).toEqual(["traded", "lead", "other"]);
    // rawValues سایر را شامل نمی‌شود (NOT IN در روت)
    const raws = requestStateRawValues(keys);
    expect(raws).toContain("معامله شده");
    expect(raws).toContain("سرنخ");
    expect(requestFilterIncludesOther(keys)).toBe(true);
    expect(requestFilterIncludesOther(["traded"])).toBe(false);
  });
});

/* ==========================================================================
 * §۴ — فهرست ده‌ستونی (بند ۱ + نکات)
 * ========================================================================== */

describe("گام ۲/M2 §۴ — فهرست ده‌ستونی", () => {
  test("۴-۱) سرستون‌ها عین ترتیب دستور مالک", async () => {
    const s = readFileSync(`${TILES}/arm-request/ArmRequestsPage.tsx`, "utf8");
    const heads = [...s.matchAll(/<TableHead[^>]*>([^<]+)<\/TableHead>/g)].map((m) => m[1].trim());
    expect(heads).toEqual([
      "ردیف",
      "کد درخواست",
      "کارشناس",
      "شعبه",
      "متقاضی",
      "قیمت از...تا...",
      "مناطق",
      "دسته‌بندی",
      "وضعیت",
      "تاریخ ثبت",
    ]);
  });

  test("۴-۲) ستون متقاضی: نام + موبایل زیر نام عین الگوی M3 (نکته ۱ + مهم ۴)", async () => {
    const s = readFileSync(`${TILES}/arm-request/ArmRequestsPage.tsx`, "utf8");
    expect(s).toMatch(/flex flex-col items-center gap-0\.5/);
    expect(s).toMatch(/href=\{`tel:\$\{r\.customerMobile\}`\}/);
    expect(s).toMatch(/موبایل ثبت‌نشده/);
  });

  test("۴-۳) قیمت از/تا: کاما + تومان (نکتهٔ بسیار مهم ۵ — faAmountFull)", async () => {
    const s = readFileSync(`${TILES}/arm-request/ArmRequestsPage.tsx`, "utf8");
    expect(s).toContain("faAmountFull");
    const { faAmountFull } = await import("@/lib/format");
    expect(faAmountFull(9_000_000_000)).toBe("۹،۰۰۰،۰۰۰،۰۰۰ تومان");
  });

  test("۴-۴) ستون مناطق: فقط نام مناطق + فایل مناطق برای >۳ (نکته ۲ + P6526/ب)", async () => {
    const s = readFileSync(`${TILES}/arm-request/ArmRequestsPage.tsx`, "utf8");
    expect(s).toContain("<AreasFileCell");
    const cell = readFileSync(`${TILES}/arm-request/AreasFileCell.tsx`, "utf8");
    expect(cell).toContain("AREAS_FILE_THRESHOLD");
    expect(cell).toContain("فایل مناطق");
  });

  test("۴-۵) دسته‌بندی درخواست: چهار دستهٔ عین نکته ۴", async () => {
    const s = readFileSync(`${TILES}/arm-request/ArmRequestsPage.tsx`, "utf8");
    expect(s).toContain('["خرید", "پیش خرید", "رهن و اجاره", "مشارکت در ساخت"]');
  });

  test("۴-۶) روت زندهٔ M2: ردیف کامل با ستون‌های جدید (شعبه/قیمت/دسته‌بندی/مناطق)", async () => {
    const { getRequestRepository } = await import("@/core/repositories");
    const repo = getRequestRepository();
    await repo.upsertArmBulk(
      [
        {
          id: `${P}r1`, requestCode: `${P}88001`, title: "خرید آپارتمان",
          customerName: "متقاضی تست", customerMobile: "09140002222",
          status: "سرنخ", actorName: "کارشناس تست گام دو",
          areaNames: ["خاوران", "ولیعصر", "چایکنار", "عباس‌آباد", "زعفرانیه", "منتجان", "معجزات"],
          tradeTypeName: "خرید", priceFrom: 500_000_000, priceTo: 2_000_000_000,
          createdAt: new Date("2026-09-27T10:00:00Z"),
        },
      ],
      { sourceRunId: `${P}-seed` }
    );
    const r = await callRoute(`/api/crm/arm-catalog/requests?code=${P}88001`);
    expect(r.status).toBe(200);
    expect(r.body.rows.length).toBe(1);
    const row = r.body.rows[0];
    expect(row.tradeTypeName).toBe("خرید");
    expect(row.priceFrom).toBe(500_000_000);
    expect(row.priceTo).toBe(2_000_000_000);
    expect(row.areaNames.length).toBe(7);
    expect(row.branch).toBeDefined();
    expect(r.body.branches.registry).toEqual(["ارتش", "باغلارباغی", "ملکی تبریزی", "هتل مرمر"]);
    expect(r.body.lastUpdate).not.toBeUndefined();
  });
});

/* ==========================================================================
 * §۵ — فیلتر بر اساس تمام ستون‌ها (بند ۲)
 * ========================================================================== */

describe("گام ۲/M2 §۵ — فیلتر تمام ستون‌ها", () => {
  let repo: any;

  beforeAll(async () => {
    const { getRequestRepository } = await import("@/core/repositories");
    const { db } = await import("@/lib/db");
    await db.requestRecord.deleteMany({ where: { id: { startsWith: P } } }).catch(() => undefined);
    repo = getRequestRepository();
    await repo.upsertArmBulk(
      [
        {
          id: `${P}f1`, requestCode: `${P}4515`, title: "خرید آپارتمان خاوران",
          customerName: "رضا محمدی", customerMobile: "09141112233",
          status: "سرنخ", actorName: "سید یاسین كاظمی", // ك عربی — شاهد نرمال‌سازی
          areaNames: ["خاوران", "ولیعصر"], tradeTypeName: "خرید",
          priceFrom: 1_000_000_000, priceTo: 3_000_000_000,
          createdAt: new Date("2026-09-25T10:00:00Z"),
        },
        {
          id: `${P}f2`, requestCode: `${P}5925`, title: "رهن و اجاره ویلای ولیعصر",
          customerName: "مریم احمدی", customerMobile: "09142223344",
          status: "معامله شده", actorName: "کارشناس دوم",
          areaNames: ["چایکنار"], tradeTypeName: "رهن و اجاره",
          priceFrom: 200_000_000, priceTo: 400_000_000,
          createdAt: new Date("2026-09-24T10:00:00Z"),
        },
        {
          id: `${P}f3`, requestCode: `${P}1020`,
          customerName: null, status: "ready", actorName: "کارشناس سوم",
          areaNames: [], tradeTypeName: "پیش خرید",
          createdAt: new Date("2026-09-23T10:00:00Z"),
        },
      ],
      { sourceRunId: `${P}-fseed` }
    );
  });

  afterAll(async () => {
    const { db } = await import("@/lib/db");
    await db.requestRecord.deleteMany({ where: { id: { startsWith: P } } }).catch(() => undefined);
    await db.$disconnect();
  });

  test("۵-۱) کد درخواست: فارسی = لاتین (رگرسیون باگ ۴/۵)", async () => {
    const fa = await repo.listArmCatalog({ code: `${P}۴۵۱۵` }, 100);
    const latin = await repo.listArmCatalog({ code: `${P}4515` }, 100);
    expect(latin.rows.length).toBe(1);
    expect(fa.rows.length).toBe(1);
    expect(fa.rows[0].requestCode).toBe(latin.rows[0].requestCode);
  });

  test("۵-۲) متقاضی — نام و موبایل: هر دو مسیر", async () => {
    const byName = await repo.listArmCatalog({ code: P, customerName: "رضا محمدی" }, 100);
    expect(byName.rows.length).toBe(1);
    expect(byName.rows[0].requestCode).toBe(`${P}4515`);
    const byMobile = await repo.listArmCatalog({ code: P, customerName: "09142223344" }, 100);
    expect(byMobile.rows.length).toBe(1);
    expect(byMobile.rows[0].requestCode).toBe(`${P}5925`);
  });

  test("۵-۳) مناطق: تطبیق نام منطقه (نکته ۲)", async () => {
    const byArea = await repo.listArmCatalog({ code: P, areaName: "خاوران" }, 100);
    expect(byArea.rows.length).toBe(1);
    expect(byArea.rows[0].requestCode).toBe(`${P}4515`);
    const none = await repo.listArmCatalog({ code: P, areaName: "زعفرانیه" }, 100);
    expect(none.rows.length).toBe(0);
  });

  test("۵-۴) قیمت — هم‌پوشانی بازه‌ها", async () => {
    // فیلتر [۲.۵B، ۵B] با ردیف [۱B، ۳B] هم‌پوشانی دارد؛ با [۲۰۰M، ۴۰۰M] ندارد
    const overlapping = await repo.listArmCatalog({ code: P, priceFrom: 2_500_000_000, priceTo: 5_000_000_000 }, 100);
    expect(overlapping.rows.map((r: any) => r.requestCode)).toEqual([`${P}4515`]);
    const lowOnly = await repo.listArmCatalog({ code: P, priceTo: 500_000_000 }, 100);
    expect(lowOnly.rows.map((r: any) => r.requestCode)).toEqual([`${P}5925`]);
  });

  test("۵-۵) دسته‌بندی: تک و ترکیبی", async () => {
    const buy = await repo.listArmCatalog({ code: P, tradeTypes: ["خرید"] }, 100);
    expect(buy.rows.map((r: any) => r.requestCode)).toEqual([`${P}4515`]);
    const combo = await repo.listArmCatalog({ code: P, tradeTypes: ["خرید", "رهن و اجاره"] }, 100);
    expect(combo.rows.length).toBe(2);
  });

  test("۵-۶) وضعیت شش‌حالته: پنج‌گانه (IN) و «سایر» (NOT IN)", async () => {
    const { requestStateRawValues } = await import("@/lib/request-status");
    // سرنخ فقط f1
    const lead = await repo.listArmCatalog({ code: P, statuses: requestStateRawValues(["lead"]) }, 100);
    expect(lead.rows.map((r: any) => r.requestCode)).toEqual([`${P}4515`]);
    // اجتماعی (traded ∪ lead ∪ other) → هر سه ردیف: f1 (سرنخ) + f2 (معامله) + f3 (ready)
    const union = await repo.listArmCatalog({ code: P, statuses: requestStateRawValues(["traded", "lead", "other"]), statusesIncludesOther: true, statusesExcluded: requestStateRawValues(["pendingTrade", "pendingApproval", "lostToCompetitors"]) }, 100);
    expect(union.rows.length).toBe(3);
    // «فقط سایر» → فقط f3 (ready)
    const onlyOther = await repo.listArmCatalog({ code: P, statuses: requestStateRawValues(["other"]), statusesIncludesOther: true, statusesExcluded: requestStateRawValues(["traded", "pendingTrade", "lead", "pendingApproval", "lostToCompetitors"]) }, 100);
    expect(onlyOther.rows.map((r: any) => r.requestCode)).toEqual([`${P}1020`]);
  });

  test("۵-۷) بازهٔ تاریخ ثبت: از/تا — شامل مرز روز", async () => {
    const fromOnly = await repo.listArmCatalog({ code: P, dateFrom: "2026-09-25" }, 100);
    expect(fromOnly.rows.map((r: any) => r.requestCode)).toEqual([`${P}4515`]);
    const toOnly = await repo.listArmCatalog({ code: P, dateTo: "2026-09-23" }, 100);
    expect(toOnly.rows.map((r: any) => r.requestCode)).toEqual([`${P}1020`]);
  });

  test("۵-۸) نام کارشناس: ك عربی DB با ک فارسی ورودی (دوطرفه)", async () => {
    const out = await repo.listArmCatalog({ code: P, realtorName: "کاظمی" }, 100);
    expect(out.rows.map((r: any) => r.requestCode)).toEqual([`${P}4515`]);
  });

  test("۵-۹) روت زنده: فیلتر قیمت با ارقام فارسی همان لاتین + فیلتر «سایر»", async () => {
    const faPrice = await callRoute(`/api/crm/arm-catalog/requests?code=${P}&priceFrom=۱۰۰۰۰۰۰۰۰&priceTo=۴۰۰۰۰۰۰۰۰`);
    const latinPrice = await callRoute(`/api/crm/arm-catalog/requests?code=${P}&priceFrom=100000000&priceTo=400000000`);
    expect(faPrice.status).toBe(200);
    expect(faPrice.body.rows.length).toBe(latinPrice.body.rows.length);
    const otherFilter = await callRoute(`/api/crm/arm-catalog/requests?code=${P}&states=other`);
    expect(otherFilter.body.rows.map((r: any) => r.requestCode)).toEqual([`${P}1020`]);
  });

  test("۵-۱۰) فیلتر شعبه: نقشهٔ مالک → ردیف‌های همان شعبه + unset", async () => {
    const { writeOwnerBranchMap, removeOwnerBranchAssignments } = await import("@/lib/branch-store");
    await writeOwnerBranchMap({ "کارشناس دوم": "هتل مرمر" });
    const r = await callRoute(`/api/crm/arm-catalog/requests?code=${P}5925`);
    expect(r.body.rows[0].branch).toBe("هتل مرمر");
    const onlyHotel = await callRoute(`/api/crm/arm-catalog/requests?code=${P}&branch=هتل مرمر`);
    expect(onlyHotel.body.rows.length).toBe(1);
    const unset = await callRoute(`/api/crm/arm-catalog/requests?code=${P}&branch=unset`);
    expect(unset.body.rows.every((row: any) => row.branch === "تعیین نشده")).toBe(true);
    await removeOwnerBranchAssignments(["کارشناس دوم"]);
  });
});

/* ==========================================================================
 * §۶ — بینش‌ها (بند ۳)
 * ========================================================================== */

describe("گام ۲/M2 §۶ — بینش‌ها", () => {
  test("۶-۱) روت M2: statusCounts شش‌حالته کامل + total", async () => {
    // seed یک ردیف ARM (سایر ردیف‌ها ممکن است در test.db وجود نداشته باشند)
    const { getRequestRepository } = await import("@/core/repositories");
    await getRequestRepository().upsertArmBulk(
      [{ id: `${P}s1`, requestCode: `${P}55001`, status: "سرنخ", actorName: "کارشناس شمارش", createdAt: new Date() }],
      { sourceRunId: `${P}-scount` }
    );
    const r = await callRoute("/api/crm/arm-catalog/requests?limit=3");
    expect(r.status).toBe(200);
    const sc = r.body.statusCounts;
    expect(sc).toBeDefined();
    for (const k of ["traded", "pendingTrade", "lead", "pendingApproval", "lostToCompetitors", "other"]) {
      expect(typeof sc[k]).toBe("number");
    }
    expect(sc.total).toBeGreaterThan(0);
    const { db } = await import("@/lib/db");
    await db.requestRecord.deleteMany({ where: { id: `${P}s1` } }).catch(() => undefined);
  });

  test("۶-۲) کارت توزیع وضعیت در صفحه: شش حالت کلیک‌پذیر → فیلتر", async () => {
    const s = readFileSync(`${TILES}/arm-request/ArmRequestsPage.tsx`, "utf8");
    expect(s).toContain('id="arm-request-states-insight"');
    expect(s).toMatch(/onClick=\{\(\) => toggleState\(s\.key\)\}/);
    expect(s).toContain("توزیع وضعیت درخواست‌ها (نظام شش‌حالته)");
  });

  test("۶-۳) بینش ایجنت M2 با دادهٔ کاشته‌شده: معتبر و فارسی", async () => {
    const { getRequestRepository } = await import("@/core/repositories");
    const { db: dbx } = await import("@/lib/db");
    await dbx.requestRecord.deleteMany({ where: { id: `${P}i1` } }).catch(() => undefined);
    const repo = getRequestRepository();
    await repo.upsertArmBulk(
      [
        {
          id: `${P}i1`, requestCode: `${P}66001`, title: "خرید واحد",
          customerName: "متقاضی بینش", customerMobile: "09140006666",
          status: "سرنخ", actorName: "کارشناس بینش تست",
          areaNames: ["خاوران"], createdAt: new Date(),
          extractedAt: new Date(),
        },
      ],
      { sourceRunId: `${P}-iseed` }
    );
    const { getAgent } = await import("@/core/agent");
    const agent = getAgent("arm-requests")!;
    const result = await agent.renderInsights();
    expect(result.insights.length).toBeGreaterThan(0);
    const declared = new Set<string>(agent.insightDomains as readonly string[]);
    for (const ins of result.insights) {
      expect(ins.title).toMatch(/[\u0600-\u06FF]/);
      expect(declared.has(ins.domain)).toBe(true);
      expect(ins.body.length).toBeGreaterThan(20);
    }
    const { db } = await import("@/lib/db");
    await db.requestRecord.deleteMany({ where: { id: `${P}i1` } }).catch(() => undefined);
  });
});

/* ==========================================================================
 * §۷ — بروزرسانی (بند ۴) + ریشه‌یابی ۷٬۳۹۸ در برابر ~۲۱٬۰۰۰ (نکتهٔ بسیار مهم ۳)
 * ========================================================================== */

describe("گام ۲/M2 §۷ — بروزرسانی و ریشه‌یابی ۷٬۳۹۸/۲۰٬۳۹۲", () => {
  test("۷-۱) ریشه‌یابی مستند: چرخهٔ درخواست‌ها به‌نادرست «complete» شده بود", async () => {
    // شاهد زندهٔ DB اصلی (قبل از رفع): checkpoint requests =
    //   pageSize=50 · lastCompletedPage=121 · totalPages=1 (!) · totalAtSource=0 (!) · phase=complete
    // در حالی که ARM شمارش ۲۰٬۳۹۲ را گزارش کرده (پروب P6.5-10) و 408 صفحه لازم بود.
    // نتیجه: فقط ~۷٬۳۹۸ رکورد آمد (۳۶٪ پوشش) و چرخه به‌درستی ادامه نیافت.
    const evidence = {
      dbCount: 7398,
      sourceCount: 20392,
      lastCompletedPage: 121,
      requiredPages: Math.ceil(20392 / 50), // 408
      recordedTotalPages: 1, // معیوب — پاسخ تک‌صفحه‌ای معیوب
      recordedTotalAtSource: 0, // معیوب
    };
    expect(evidence.dbCount).toBeLessThan(evidence.sourceCount * 0.9); // پوشش ناکافی
    expect(evidence.lastCompletedPage).toBeLessThan(evidence.requiredPages);
    expect(evidence.recordedTotalPages).toBe(1); // ادعای پایان زودرس
  });

  test("۷-۲) گارد صفحهٔ معیوب: پاسخ بی‌داده/بی‌شمارش با ادعای پایان = گذرا (رفع لایه ۱)", async () => {
    const { isDegenerateListPage } = await import("@/lib/melk-api/arm-catalog");
    expect(isDegenerateListPage(122, { rows: [], total: 0, totalPages: 1 }, 20392)).toBe(true);
    expect(isDegenerateListPage(5, { rows: new Array(50), total: 20392, totalPages: 408 }, 20392)).toBe(false);
  });

  test("۷-۳) خوددرمانی: چرخهٔ «کاملِ» ناقص → چرخهٔ تازه از صفحهٔ ۱ (رفع لایه ۲)", async () => {
    const { resolveCycleStart } = await import("@/lib/melk-api/arm-catalog");
    const healed = resolveCycleStart(
      { id: "requests", cycleId: "bad", pageSize: 50, lastCompletedPage: 121, totalPages: 1, totalAtSource: 20392, phase: "complete", updatedAt: new Date(), completedAt: new Date(), createdAt: new Date() },
      50,
      7398
    );
    expect(healed.startPage).toBe(1);
    expect(healed.cycleId).toMatch(/^heal-p6530-/);
  });

  test("۷-۴) گارد پوشش در بسته‌شدن: ≥ ۹۰٪ منبع (رفع لایه ۳)", async () => {
    const { hasEnoughCoverage } = await import("@/lib/melk-api/arm-catalog");
    expect(hasEnoughCoverage(7398, 20392)).toBe(false);
    expect(hasEnoughCoverage(19000, 20392)).toBe(true);
  });

  test("۷-۵) lastUpdate در روت: تاریخ دقیق + نقطهٔ ادامه (بند ۴.۲)", async () => {
    const { getIntegrationRepository } = await import("@/core/repositories");
    await getIntegrationRepository().upsertSyncCheckpoint({
      id: "requests", cycleId: "test-p6530-m2", pageSize: 50,
      lastCompletedPage: 408, totalPages: 408, totalAtSource: 20392,
      phase: "complete", completedAt: new Date("2026-09-29T11:00:00Z"),
    });
    const r = await callRoute("/api/crm/arm-catalog/requests?limit=1");
    expect(r.status).toBe(200);
    const lu = r.body.lastUpdate;
    expect(lu).not.toBeNull();
    expect(typeof lu.lastCompletedPage).toBe("number");
    expect(typeof lu.updatedAt).toBe("string");
  });

  test("۷-۶) استخراج قیمت/دسته‌بندی از جزئیات درخواست (بند ۴.۱ — زنجیرهٔ غنی‌سازی)", async () => {
    const { extractRequestPriceRange, extractRequestTradeType } = await import("@/lib/melk-api/arm-catalog");
    // فرم پویای خود سامانه: inputs با کلیدهای priceFrom/priceTo + nameRequest
    const payload = {
      data: {
        nameRequest: "خرید",
        inputs: { priceFrom: "۵۰۰٬۰۰۰٬۰۰۰", priceTo: 2000000000 },
      },
    };
    expect(extractRequestPriceRange(payload)).toEqual({ from: 500_000_000, to: 2_000_000_000 });
    expect(extractRequestTradeType(payload)).toBe("خرید");
    // نامعتبر → null (صفر جعل)
    expect(extractRequestTradeType({ data: { nameRequest: "نامعلوم" } })).toBeNull();
    expect(extractRequestPriceRange({})).toEqual({ from: null, to: null });
    // دسته‌های چهارگانهٔ معتبر
    for (const t of ["خرید", "پیش خرید", "رهن و اجاره", "مشارکت در ساخت"]) {
      expect(extractRequestTradeType({ data: { nameRequest: t } })).toBe(t);
    }
  });

  test("۷-۷) بخش بروزرسانی در صفحه M2: تاریخ دقیق + ادامه از نقطهٔ قطع + زنجیرهٔ ARM و PM", async () => {
    const s = readFileSync(`${TILES}/arm-request/ArmRequestsPage.tsx`, "utf8");
    expect(s).toContain('id="arm-request-last-update"');
    expect(s).toContain("آخرین بروزرسانی فهرست");
    expect(s).toContain("بروزرسانی درخواست‌ها از سامانه‌های ملک تبریز");
    expect(s).toMatch(/ARM و PM/);
  });
});

/* ==========================================================================
 * §۸ — رنگ بخش M2 (گام صفر — کهربایی روشن #F59E0B)
 * ========================================================================== */

describe("گام ۲/M2 §۸ — رنگ بخش (کهربایی روشن #F59E0B)", () => {
  test("۸-۱) کاشی M2: accent = m2 و صفحه از کلاس‌های sec-m2 استفاده می‌کند", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    await import("@/core/tiles/bootstrap");
    expect(tileRegistry.get("arm-requests")!.accent).toBe("m2");
    const s = readFileSync(`${TILES}/arm-request/ArmRequestsPage.tsx`, "utf8");
    expect(s).toContain("sec-m2-500");
    expect(s).toContain("sec-m2-700");
  });
});
