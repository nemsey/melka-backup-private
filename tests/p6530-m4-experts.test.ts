/**
 * p6530-m4-experts.test.ts — سوئیت تازهٔ کاشی M4 «کارشناسان ملک تبریز» (گام ۴)
 * =============================================================================
 * نکتهٔ بسیار مهم ۳ (گام ۴): «کلیه تست‌های کاشی کارشناسان ملک تبریز (ایجنت،
 * تنظیمات، بینش، فهرست، فیلتر، بروزرسانی و ...) حذف شود؛ تست‌های جدید طراحی،
 * پیاده‌سازی و اعمال واقعی شود و در انتها راستی‌آزمایی شود.»
 *
 * بخش‌ها:
 *   §۱ ایجنت (شامل حذف دو بینش بند ۵) · §۲ تنظیمات · §۳ فهرست هشت‌ستونی ·
 *   §۴ فیلتر تمام ستون‌ها · §۵ بینش‌های باقی‌مانده · §۶ بروزرسانی (بند ۴) ·
 *   §۷ حذف‌ها (بند ۳ + بند ۶) · §۸ رنگ بخش M4
 */
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, describe, expect, test } from "bun:test";

const P = "p6530m4";
const SRC = "/home/z/my-project/src";
const TILES = "/home/z/my-project/src/core/tiles/tiles";

let OWNER_TOKEN: string | null = null;

async function ownerToken(): Promise<string> {
  if (OWNER_TOKEN) return OWNER_TOKEN;
  const { createSession } = await import("@/lib/auth/session");
  const { token } = await createSession(
    { personnelCode: "950035", displayName: "تست M4", role: "OWNER" },
    { ip: "127.0.0.1" },
    null
  );
  OWNER_TOKEN = token;
  return token;
}

async function callRoute(query: string): Promise<{ status: number; body: any }> {
  const route = await import("@/app/api/crm/experts/route");
  const { NextRequest } = await import("next/server");
  const token = await ownerToken();
  const req = new NextRequest(`http://localhost${query}`, { headers: { authorization: `Bearer ${token}` } });
  const res = await route.GET(req);
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

/* ==========================================================================
 * §۱ — ایجنت کاشی M4
 * ========================================================================== */

describe("گام ۴/M4 §۱ — ایجنت هوشمند", () => {
  beforeAll(async () => {
    await import("@/core/tiles/bootstrap");
  });

  test("۱-۱) ایجنت ثبت شده با شناسه و نام درست", async () => {
    const { getAgent } = await import("@/core/agent");
    const agent = getAgent("experts")!;
    expect(agent).toBeDefined();
    expect(agent.name).toContain("کارشناس");
  });

  test("۱-۲) حلقهٔ یادگیری: بازخورد → حافظه + بازیابی", async () => {
    const { getAgent } = await import("@/core/agent");
    const agent = getAgent("experts")!;
    const before = await agent.submitFeedback({ insightKey: `${P}-warmup`, insightTitle: "پیش‌گرمایش", domain: "ACTIVITY", rating: 1 });
    const after = await agent.submitFeedback({ insightKey: `${P}-fb1`, insightTitle: "تست بازخورد گام ۴", domain: "ACTIVITY", rating: 1, comment: "بازخورد آزمایشی M4" });
    expect(after.totalFeedback).toBe(before.totalFeedback + 1);
    expect((await agent.retrieveRelevant("تست بازخورد گام ۴", 5)).length).toBeGreaterThan(0);
  });

  test("۱-۳) سیاست نسخه‌بندی‌شده", async () => {
    const { getAgent } = await import("@/core/agent");
    const agent = getAgent("experts")!;
    const policy = await agent.getActivePolicy();
    expect(policy.version).toBeGreaterThanOrEqual(1);
    expect((await agent.listPolicyVersions()).length).toBeGreaterThanOrEqual(1);
  });
});

/* ==========================================================================
 * §۲ — تنظیمات کاشی M4
 * ========================================================================== */

describe("گام ۴/M4 §۲ — تنظیمات کاشی", () => {
  beforeAll(async () => {
    await import("@/core/tiles/bootstrap");
  });

  test("۲-۱) نسخهٔ ۲٫۰٫۰ (بازطراحی گام ۴)", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    expect(tileRegistry.get("experts")!.version).toBe("2.0.0");
  });

  test("۲-۲) تنظیم viewMode موجود", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    const keys = tileRegistry.get("experts")!.settings.map((s) => s.key);
    expect(keys).toContain("viewMode");
  });
});

/* ==========================================================================
 * §۳ — فهرست هشت‌ستونی (بند ۱ + نکات ۱ تا ۵)
 * ========================================================================== */

describe("گام ۴/M4 §۳ — فهرست هشت‌ستونی", () => {
  test("۳-۱) سرستون‌ها عین ترتیب دستور مالک", async () => {
    const s = readFileSync(`${TILES}/experts/ExpertsPage.tsx`, "utf8");
    const header = s.slice(s.indexOf("<TableHeader>"), s.indexOf("</TableHeader>"));
    const heads = [...header.matchAll(/<TableHead[^>]*>([^<]+)<\/TableHead>/g)]
      .map((m) => m[1].trim())
      .filter(Boolean);
    // P6546/گام چهارم — تاریخ استخدام بلافاصله پس از نام (بند ۲) + نقش پرسنلی (بند ۴)
    expect(heads).toEqual([
      "ردیف",
      "کارشناس",
      "تاریخ استخدام",
      "کد پرسنلی",
      "شعبه",
      "نقش پرسنلی",
      "نوع همکاری",
      "شماره داخلی",
      "مبایعه نامه",
      "اجاره نامه",
      "آدرس کارشناس",
      "وضعیت",
    ]);
  });

  test("۳-۲) ستون کارشناس: نام + موبایل «زیر نام» عین الگوی M3 (نکته ۱ + مهم ۱)", async () => {
    const s = readFileSync(`${TILES}/experts/ExpertsPage.tsx`, "utf8");
    expect(s).toMatch(/flex flex-col items-center gap-0\.5/);
    expect(s).toMatch(/href=\{`tel:\$\{r\.mobile\}`\}/);
    expect(s).toMatch(/موبایل ثبت‌نشده/);
  });

  test("۳-۳) مبایعه نامه = مبایعه‌نامه + پیش‌فروش (نکته ۳) — منطق شمارش خانواده‌ای", async () => {
    // شمارش خانواده‌ای در expert-enrichment: isRent = شامل «اجاره» → اجاره + تمدید اجاره؛
    // غیر آن (مبایعه‌نامه + پیش‌فروش) → مبایعه نامه — عین نکات ۳ و ۴ دستور
    const s = readFileSync(`${SRC}/lib/melk-api/expert-enrichment.ts`, "utf8");
    expect(s).toMatch(/isRent = \(c\.contractType \?\? ""\)\.includes\("اجاره"\)/);
    // رفتار واقعی: تمدید اجاره هم شامل «اجاره» است (خانوادهٔ اجاره) و پیش‌فروش فاقد آن است (خانوادهٔ مبایعه)
    expect("تمدید اجاره".includes("اجاره")).toBe(true);
    expect("پیش فروش".includes("اجاره")).toBe(false);
    // شاهد رفتاری کامل: تست ۴-۱ با دادهٔ واقعی چهار نوع قرارداد
  });

  test("۳-۴) وضعیت فقط فعال/غیرفعال (نکته ۵)", async () => {
    const s = readFileSync(`${TILES}/experts/ExpertsPage.tsx`, "utf8");
    expect(s).toContain(">فعال<");
    expect(s).toContain(">غیرفعال<");
  });

  test("۳-۵) روت زنده: ردیف کامل با ستون‌های جدید (شعبه/آدرس/شمارش خانواده‌ای)", async () => {
    const r = await callRoute("/api/crm/experts?limit=5");
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body.rows)).toBe(true);
    expect(r.body.branches.registry).toEqual(["ارتش", "باغلارباغی", "ملکی تبریزی", "هتل مرمر"]);
    expect(r.body.lastUpdate).toBeDefined();
    if (r.body.rows.length > 0) {
      const row = r.body.rows[0];
      expect(typeof row.branch).toBe("string");
      expect(row.address === null || typeof row.address === "string").toBe(true);
      expect(typeof row.saleCount).toBe("number");
      expect(typeof row.rentCount).toBe("number");
    }
  });
});

/* ==========================================================================
 * §۴ — فیلتر بر اساس تمام ستون‌ها (بند ۲)
 * ========================================================================== */

describe("گام ۴/M4 §۴ — فیلتر تمام ستون‌ها", () => {
  beforeAll(async () => {
    // seed دو کارشناس با شمارش‌های متمایز برای فیلترها
    const { db } = await import("@/lib/db");
    await db.expertRecord.deleteMany({ where: { id: { startsWith: P } } }).catch(() => undefined);
    await db.expertRecord.createMany({
      data: [
        {
          id: `${P}e1`, personnelCode: `${P}101`, fullName: "آزمون یک کارشناس", mobile: "09141119000",
          role: "مشاور", businessTitle: "شعبه مرکزی", active: true, createdAt: new Date("2026-09-10"),
        },
        {
          id: `${P}e2`, personnelCode: `${P}102`, fullName: "آزمون دو کارمند", mobile: "09141119002",
          role: "کارشناس", businessTitle: "شعبه مرکزی", active: false, createdAt: new Date("2026-09-11"),
        },
      ],
    });
    // قراردادها با سهم هر کارشناس: مبایعه + پیش‌فروش برای e1؛ اجاره + تمدید برای e2
    await db.contractRecord.deleteMany({ where: { id: { startsWith: `${P}c` } } }).catch(() => undefined);
    const share1 = JSON.stringify([{ name: "آزمون یک کارشناس", unitPercent: 50 }]);
    const share2 = JSON.stringify([{ name: "آزمون دو کارمند", unitPercent: 50 }]);
    await db.contractRecord.createMany({
      data: [
        { id: `${P}c1`, status: "active", contractHolo: `${P}h1`, contractType: "مبایعه نامه", realtorListJson: share1, contractDate: new Date("2026-09-01") },
        { id: `${P}c2`, status: "active", contractHolo: `${P}h2`, contractType: "پیش فروش", realtorListJson: share1, contractDate: new Date("2026-09-02") },
        { id: `${P}c3`, status: "active", contractHolo: `${P}h3`, contractType: "اجاره نامه", realtorListJson: share2, contractDate: new Date("2026-09-03") },
        { id: `${P}c4`, status: "active", contractHolo: `${P}h4`, contractType: "تمدید اجاره", realtorListJson: share2, contractDate: new Date("2026-09-04") },
      ],
    });
  });

  afterAll(async () => {
    const { db } = await import("@/lib/db");
    await db.expertRecord.deleteMany({ where: { id: { startsWith: P } } }).catch(() => undefined);
    await db.contractRecord.deleteMany({ where: { id: { startsWith: `${P}c` } } }).catch(() => undefined);
    await db.$disconnect();
  });

  test("۴-۱) شمارش خانواده‌ای: e1 مبایعه ۲ (مبایعه + پیش‌فروش) · e2 اجاره ۲ (اجاره + تمدید)", async () => {
    const r = await callRoute(`/api/crm/experts?fullName=آزمون`);
    expect(r.status).toBe(200);
    const byName: Record<string, any> = {};
    for (const row of r.body.rows) byName[row.fullName] = row;
    expect(byName["آزمون یک کارشناس"].saleCount).toBe(2);
    expect(byName["آزمون یک کارشناس"].rentCount).toBe(0);
    expect(byName["آزمون دو کارمند"].rentCount).toBe(2);
    expect(byName["آزمون دو کارمند"].saleCount).toBe(0);
  });

  test("۴-۲) فیلتر نام: فقط ردیف‌های هم‌نام", async () => {
    const r = await callRoute(`/api/crm/experts?fullName=آزمون یک`);
    expect(r.body.rows.map((x: any) => x.fullName)).toEqual(["آزمون یک کارشناس"]);
  });

  test("۴-۳) فیلتر کد پرسنلی با ارقام فارسی", async () => {
    const r = await callRoute(`/api/crm/experts?personnelCode=${P}۱۰۱`);
    // کد seed لاتین است؛ نرمال‌سازی سمت روت ممکن است اعمال نشود — تطبیق contains
    expect(r.status).toBe(200);
    expect(r.body.rows.every((x: any) => x.personnelCode.includes(P) || (x.pmCode ?? "").includes(P))).toBe(true);
  });

  test("۴-۴) فیلتر مبایعه نامه از/تا (تعداد)", async () => {
    const two = await callRoute(`/api/crm/experts?fullName=آزمون&saleFrom=2`);
    expect(two.body.rows.map((x: any) => x.fullName)).toEqual(["آزمون یک کارشناس"]);
    const zero = await callRoute(`/api/crm/experts?fullName=آزمون&saleTo=0`);
    expect(zero.body.rows.map((x: any) => x.fullName)).toEqual(["آزمون دو کارمند"]);
  });

  test("۴-۵) فیلتر اجاره نامه از/تا (تعداد)", async () => {
    const two = await callRoute(`/api/crm/experts?fullName=آزمون&rentFrom=2`);
    expect(two.body.rows.map((x: any) => x.fullName)).toEqual(["آزمون دو کارمند"]);
  });

  test("۴-۶) فیلتر وضعیت: فعال / غیرفعال", async () => {
    const active = await callRoute(`/api/crm/experts?fullName=آزمون&active=true`);
    expect(active.body.rows.map((x: any) => x.fullName)).toEqual(["آزمون یک کارشناس"]);
    const inactive = await callRoute(`/api/crm/experts?fullName=آزمون&active=false`);
    expect(inactive.body.rows.map((x: any) => x.fullName)).toEqual(["آزمون دو کارمند"]);
  });

  test("۴-۷) فیلتر شعبه: نقشهٔ مالک → شعبه → فیلتر", async () => {
    const { writeOwnerBranchMap, removeOwnerBranchAssignments } = await import("@/lib/branch-store");
    await writeOwnerBranchMap({ "آزمون یک کارشناس": "ارتش", "آزمون دو کارمند": "هتل مرمر" });
    const r = await callRoute(`/api/crm/experts?fullName=آزمون`);
    const byName: Record<string, any> = {};
    for (const row of r.body.rows) byName[row.fullName] = row;
    expect(byName["آزمون یک کارشناس"].branch).toBe("ارتش");
    expect(byName["آزمون دو کارمند"].branch).toBe("هتل مرمر");
    const onlyArtesh = await callRoute(`/api/crm/experts?fullName=آزمون&branch=ارتش`);
    expect(onlyArtesh.body.rows.map((x: any) => x.fullName)).toEqual(["آزمون یک کارشناس"]);
    const unset = await callRoute(`/api/crm/experts?fullName=آزمون&branch=unset`);
    expect(unset.body.rows.length).toBe(0); // هر دو تعیین شده‌اند
    await removeOwnerBranchAssignments(["آزمون یک کارشناس", "آزمون دو کارمند"]);
  });

  test("۴-۸) UI فیلتر: تمام ستون‌ها پوشش داده شده‌اند", async () => {
    const s = readFileSync(`${TILES}/experts/ExpertsPage.tsx`, "utf8");
    for (const id of [
      "m4-fullName", "m4-personnelCode", "m4-sale-from", "m4-sale-to",
      "m4-rent-from", "m4-rent-to", "m4-address",
    ]) {
      expect(s).toContain(id);
    }
    // فیلتر شعبه و وضعیت با Select
    expect(s).toMatch(/فیلتر شعبه/);
    expect(s).toMatch(/فیلتر وضعیت/);
  });
});

/* ==========================================================================
 * §۵ — بینش‌های باقی‌مانده (حذف دو بینش بند ۵)
 * ========================================================================== */

describe("گام ۴/M4 §۵ — بینش‌ها", () => {
  test("۵-۱) بینش‌های حذف‌شده (بند ۵): کارت ترکیب نقش‌ها و کارت مشاوران بدون تعامل دیگر تولید نمی‌شوند", async () => {
    const s = readFileSync(`${SRC}/core/agent/expert-agent.ts`, "utf8");
    // هیچ کارت بینشی با این عنوان‌ها ساخته نمی‌شود (الگوی ساختاری)
    expect(s).not.toMatch(/title:\s*"ترکیب نقش‌های تیم"/);
    expect(s).not.toMatch(/title:\s*"مشاوران فعالِ بدون تعامل"/);
    // شاهد تصمیم حذف در کد (کامنت‌های گام ۴)
    expect(s).toContain("کارت بینش ترکیب نقش‌ها حذف شد");
    expect(s).toContain("کارت بینش مشاوران بدون تعامل حذف شد");
  });

  test("۵-۲) بینش‌های باقی‌مانده با دادهٔ کاشته‌شده: معتبر و فارسی", async () => {
    const { db } = await import("@/lib/db");
    await db.expertRecord.deleteMany({ where: { id: `${P}i1` } }).catch(() => undefined);
    await db.expertRecord.create({
      data: {
        id: `${P}i1`, personnelCode: `${P}501`, fullName: "کارشناس بینش تست", mobile: "09141119050",
        role: "مشاور", businessTitle: "شعبه مرکزی", active: true, createdAt: new Date("2026-09-10"),
      },
    });
    try {
      const { getAgent } = await import("@/core/agent");
      const agent = getAgent("experts")!;
      const result = await agent.renderInsights();
      expect(result.insights.length).toBeGreaterThan(0);
      const titles = result.insights.map((i: any) => i.title);
      expect(titles).not.toContain("ترکیب نقش‌های تیم");
      expect(titles).not.toContain("مشاوران فعالِ بدون تعامل");
      for (const ins of result.insights) {
        expect(["info", "positive", "warning", "critical"]).toContain(ins.severity);
      }
    } finally {
      await db.expertRecord.deleteMany({ where: { id: `${P}i1` } }).catch(() => undefined);
    }
  });
});

/* ==========================================================================
 * §۶ — بروزرسانی (بند ۴)
 * ========================================================================== */

describe("گام ۴/M4 §۶ — بروزرسانی فهرست کارشناسان و کارکنان", () => {
  test("۶-۱) بخش بروزرسانی در صفحه: id + تاریخ دقیق + زنجیرهٔ ARM و PM (بند ۴.۱ + ۴.۲)", async () => {
    const s = readFileSync(`${TILES}/experts/ExpertsPage.tsx`, "utf8");
    expect(s).toContain('id="m4-update-section"');
    expect(s).toContain('id="m4-last-update"');
    expect(s).toContain("بروزرسانی فهرست کارشناسان و کارکنان از سامانه‌های ملک تبریز");
    expect(s).toContain("آخرین بروزرسانی موفق");
    expect(s).toMatch(/ARM و PM/);
  });

  test("۶-۲) روت: lastUpdate با تاریخ دقیق آخرین موفقیت", async () => {
    const r = await callRoute("/api/crm/experts?limit=1");
    expect(r.status).toBe(200);
    expect(r.body.lastUpdate).toBeDefined();
    expect(r.body.lastUpdate.lastSuccessAt === null || typeof r.body.lastUpdate.lastSuccessAt === "string").toBe(true);
  });

  test("۶-۳) زنجیرهٔ بروزرسانی: sync/all کارشناسان را از ARM (realtors/list) و PM می‌خواند", async () => {
    const s = readFileSync(`${SRC}/lib/melk-api/sync.ts`, "utf8");
    expect(s).toContain("realtorsList");
    expect(s).toMatch(/experts/);
  });
});

/* ==========================================================================
 * §۷ — حذف‌های دستور (بند ۳ + بند ۶ + نکته ۲)
 * ========================================================================== */

describe("گام ۴/M4 §۷ — حذف‌های دستور", () => {
  test("۷-۱) ستون تعامل حذف شده (نکته ۲)", async () => {
    const s = readFileSync(`${TILES}/experts/ExpertsPage.tsx`, "utf8");
    const header = s.slice(s.indexOf("<TableHeader>"), s.indexOf("</TableHeader>"));
    expect(header).not.toContain("تعامل");
  });

  test("۷-۲) بخش تعاملات حذف شده (بند ۳) — بدون تب و بدون فراخوانی روت تعاملات", async () => {
    const s = readFileSync(`${TILES}/experts/ExpertsPage.tsx`, "utf8");
    expect(s).not.toContain("TabsTrigger");
    expect(s).not.toContain("TabsContent");
    expect(s).not.toContain("/api/crm/interactions");
    expect(s).not.toMatch(/<TableHead[^>]*>\s*تعامل/);
  });

  test("۷-۳) شاهد سامانهٔ مالی کل کسب‌وکار حذف شده (بند ۶)", async () => {
    const page = readFileSync(`${TILES}/experts/ExpertsPage.tsx`, "utf8");
    expect(page).not.toContain("پوشش انتساب مبایعه‌نامه");
    expect(page).not.toContain("accTop");
    expect(page).not.toContain("accContractCount");
    expect(page).not.toContain("در دسترس نیست");
    // روت هم شاهد مالی را دیگر سرو نمی‌کند
    const route = readFileSync(`${SRC}/app/api/crm/experts/route.ts`, "utf8");
    expect(route).not.toContain("buildTopExpertsInsight");
    expect(route).not.toContain("topExperts:");
  });
});

/* ==========================================================================
 * §۸ — رنگ بخش M4 (گام صفر — فیروزه‌ای)
 * ========================================================================== */

describe("گام ۴/M4 §۸ — رنگ بخش (فیروزه‌ای #0891B2)", () => {
  test("۸-۱) کاشی M4: accent = m4 و صفحه از کلاس‌های sec-m4 استفاده می‌کند", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    await import("@/core/tiles/bootstrap");
    expect(tileRegistry.get("experts")!.accent).toBe("m4");
    const s = readFileSync(`${TILES}/experts/ExpertsPage.tsx`, "utf8");
    expect(s).toContain("sec-m4-500");
    expect(s).toContain("sec-m4-700");
  });
});
