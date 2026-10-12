/**
 * PN-017 — تست‌های جابه‌جایی دو بخش تنظیمات + شاهکار «مدیریت کاربران ملک تبریز»
 * ---------------------------------------------------------------------------
 * دستور مالک (شورا-ن۰۲۱ · ۱۴۰۵/۰۷/۱۹):
 *   الف) بخش «مدیریت دسترسی کارشناسان» → «مدیریت کاربران ملک تبریز» (شاهکار —
 *        بررسی فراکامل سامانه‌های ملک تبریز + انتقال دقیق مدیریت کاربران)
 *   ب) بخش «مدیریت کاربران» → «مدیریت دسترسی کارشناسان ملکا»
 *
 * پوشش:
 *   ۱) جابه‌جایی ساختاری: جایگاه ۸ = شاهکار (کاربران ملک تبریز) · جایگاه ۹ = دسترسی کارشناسان ملکا
 *   ۲) روت دفترچهٔ چندوجهی /api/admin/melk-users (مرز نقش + شکل + فیلترها + پیوند)
 *   ۳) جریان ارتقا: پرسنل PM بدون حساب → ساخت کاربر → پیوند در دفترچه
 *   ۴) آینهٔ v1 همان ماژول است (تک‌منبع حقیقت)
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { createHash } from "crypto";
import { existsSync, readFileSync } from "node:fs";

process.env.OWNER_PERSONNEL_CODES = "410099950"; // کد مالک تستی (ایزوله از واقعی‌ها)
const { db } = await import("@/lib/db");

const createdSessions: string[] = [];
async function makeSession(role: "OWNER" | "CONSULTANT", personnelCode = role === "OWNER" ? "960001" : "960002") {
  const { createSession } = await import("@/lib/auth/session");
  const { token } = await createSession(
    { personnelCode, displayName: `تست ن۰۱۷ ${role}`, role },
    { ip: "127.0.0.1" },
    null
  );
  createdSessions.push(token);
  return { token, personnelCode };
}
const hdr = (t: string) => ({ authorization: `Bearer ${t}` });
async function NR(u: string, init?: RequestInit): Promise<import("next/server").NextRequest> {
  const { NextRequest } = await import("next/server");
  return new NextRequest(`http://localhost${u}`, init as never);
}
const sha = (t: string) => createHash("sha256").update(t).digest("hex");

/** کد پرسنلی آزمایشی PM — ردیف تازهٔ ExpertProfile فقط برای این تست */
const TEST_PM_CODE = "960071";
const TEST_PM_ID = "test-pn017-pm-profile";

beforeAll(async () => {
  await db.user.deleteMany({ where: { personnelCode: { startsWith: "9600" } } });
  await db.userActivity.deleteMany({});
  await db.userSession.deleteMany({});
  // PN-031: کاربر نمایان آزمایشی — نمای کلی (overview.total) به آن وابسته است؛
  // پس از بازسازی test.db با db:push دیگر کاربران مانده از دورهای قبلی وجود ندارند
  await db.user.deleteMany({ where: { personnelCode: "970017" } });
  await db.user.create({
    data: {
      personnelCode: "970017",
      fullName: "کاربر نمایان آزمون ن۰۱۷",
      role: "EXPERT",
      isActive: true,
    },
  });
  // ردیف PM آزمایشی (شعبه/سمت غیرواقعی اما معتبر — پس از تست حذف کامل می‌شود)
  await db.expertProfile.deleteMany({ where: { personnelCode: TEST_PM_CODE } });
  await db.expertProfile.create({
    data: {
      id: TEST_PM_ID,
      personnelCode: TEST_PM_CODE,
      fullName: "آزمون پرسنل ملک تبریز",
      mobile: "0999600711",
      roleTitle: "مشاور فروش",
      branchTitle: "شعبهٔ آزمون ن۰۱۷",
      headManager: "مدیر آزمون",
      active: true,
    },
  });
});

afterAll(async () => {
  for (const t of createdSessions) {
    await db.session.deleteMany({ where: { tokenHash: sha(t) } }).catch(() => undefined);
  }
  await db.user.deleteMany({ where: { personnelCode: { startsWith: "9600" } } });
  await db.user.deleteMany({ where: { personnelCode: "970017" } });
  await db.expertProfile.deleteMany({ where: { personnelCode: TEST_PM_CODE } });
  await db.userActivity.deleteMany({});
  await db.userSession.deleteMany({});
  await db.$disconnect();
});

/* ═══════ ۱) جابه‌جایی ساختاری دو بخش ═══════ */
describe("PN-017 · جابه‌جایی دو بخش تنظیمات (دستور مالک)", () => {
  const settings = readFileSync("src/core/tiles/tiles/settings/SettingsPage.tsx", "utf8");

  test("جایگاه ۸ = شاهکار «مدیریت کاربران ملک تبریز» و جایگاه ۹ = «مدیریت دسترسی کارشناسان ملکا»", () => {
    const posMelk = settings.indexOf("<MelkTabrizUsersSection />");
    const posPa = settings.indexOf("<PersonnelAccessSection />");
    expect(posMelk).toBeGreaterThan(0);
    expect(posPa).toBeGreaterThan(0);
    expect(posMelk).toBeLessThan(posPa); // شاهکار پیش از دسترسی کارشناسان
  });

  test("عنوان بخش شاهکار: «مدیریت کاربران ملک تبریز» + توضیح دپارتمان", () => {
    const src = readFileSync("src/core/tiles/tiles/settings/MelkTabrizUsersSection.tsx", "utf8");
    expect(src).toContain("مدیریت کاربران ملک تبریز");
    expect(src).toContain("شاهکار");
    expect(src).toContain("پرسنل ملک تبریز"); // تب دفترچهٔ PM
    expect(src).toContain("همگام‌سازی"); // تب سوم
  });

  test("عنوان بخش دوم: «مدیریت دسترسی کارشناسان ملکا» + ارجاع به بخش شاهکار", () => {
    const src = readFileSync("src/core/tiles/tiles/settings/PersonnelAccessSection.tsx", "utf8");
    expect(src).toContain("مدیریت دسترسی کارشناسان ملکا");
    expect(src).toContain("مدیریت کاربران ملک تبریز"); // ارجاع متنی به بخش شاهکار
  });

  test("کامپوننت قدیمی UsersManagementSection جذب شاهکار شده (فایل حذف)", () => {
    expect(existsSync("src/core/tiles/tiles/settings/UsersManagementSection.tsx")).toBe(false);
    const src = readFileSync("src/core/tiles/tiles/settings/MelkTabrizUsersSection.tsx", "utf8");
    // testid های اصلی PN-016 در شاهکار حفظ + testid های تازهٔ دفترچهٔ PM
    for (const tid of ["users-add", "users-list", "users-perm-matrix", "users-row-", "mtb-overview", "mtb-pm-list", "mtb-sync-btn", "mtb-promote-"]) {
      expect(src).toContain(tid);
    }
  });

  test("پیام راهنمای داشبورد به بخش تازه ارجاع می‌دهد", () => {
    const src = readFileSync("src/components/app/DashboardHome.tsx", "utf8");
    expect(src).toContain("مدیریت کاربران ملک تبریز");
    expect(src).not.toContain("← مدیریت کاربران»");
  });
});

/* ═══════ ۲) روت دفترچهٔ چندوجهی ═══════ */
describe("PN-017 · روت /api/admin/melk-users", () => {
  test("بدون توکن → 401", async () => {
    const route = await import("@/app/api/admin/melk-users/route");
    const res = await route.GET(await NR("/api/admin/melk-users"));
    expect(res.status).toBe(401);
  });

  test("CONSULTANT → 403", async () => {
    const { token } = await makeSession("CONSULTANT");
    const route = await import("@/app/api/admin/melk-users/route");
    const res = await route.GET(await NR("/api/admin/melk-users", { headers: hdr(token) }));
    expect(res.status).toBe(403);
  });

  test("OWNER → 200 با دفترچهٔ کامل (rows + stats + filterOptions + pmConnection + overview)", async () => {
    const { token } = await makeSession("OWNER");
    const route = await import("@/app/api/admin/melk-users/route");
    const res = await route.GET(await NR("/api/admin/melk-users", { headers: hdr(token) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.rows)).toBe(true);
    expect(body.rows.length).toBeGreaterThan(0); // پرسنل واقعی + ردیف آزمون
    expect(body.stats.pmTotal).toBeGreaterThan(0);
    expect(body.stats.linkedAccounts).toBeGreaterThanOrEqual(0);
    expect(body.stats.withoutAccount).toBe(body.stats.pmTotal - body.stats.linkedAccounts);
    expect(Object.keys(body.stats.byBranch).length).toBeGreaterThan(0);
    expect(body.filterOptions.branches.length).toBeGreaterThan(0);
    expect(body.filterOptions.roleTitles.length).toBeGreaterThan(0);
    expect(body.overview.total).toBeGreaterThan(0); // نمای کلی کاربران اپ
    // ردیف آزمون: بدون حساب باید باشد
    const mine = body.rows.find((r: { personnelCode: string | null }) => r.personnelCode === TEST_PM_CODE);
    expect(mine).toBeDefined();
    expect(mine.hasAccount).toBe(false);
    expect(mine.branchTitle).toBe("شعبهٔ آزمون ن۰۱۷");
  });

  test("فیلتر q + onlyWithoutAccount کار می‌کند", async () => {
    const { token } = await makeSession("OWNER");
    const route = await import("@/app/api/admin/melk-users/route");
    const res = await route.GET(await NR(`/api/admin/melk-users?q=${encodeURIComponent(TEST_PM_CODE)}`, { headers: hdr(token) }));
    const body = await res.json();
    expect(body.rows.length).toBe(1);
    expect(body.rows[0].personnelCode).toBe(TEST_PM_CODE);

    const res2 = await route.GET(await NR("/api/admin/melk-users?onlyWithoutAccount=1&branch=" + encodeURIComponent("شعبهٔ آزمون ن۰۱۷"), { headers: hdr(token) }));
    const body2 = await res2.json();
    expect(body2.rows.every((r: { hasAccount: boolean }) => r.hasAccount === false)).toBe(true);
    expect(body2.rows.length).toBe(1);
  });

  test("آینهٔ v1 همان ماژول است (تک‌منبع حقیقت)", async () => {
    const aliasMod = await import("@/app/api/admin/melk-users/route");
    const v1Mod = await import("@/app/api/v1/admin/melk-users/route");
    expect(v1Mod.GET).toBe(aliasMod.GET);
  });

  test("روت لاغر است — صفر db.* مستقیم (مرز مخزن)", async () => {
    const src = readFileSync("src/app/api/admin/melk-users/route.ts", "utf8");
    expect(src).not.toMatch(/\bdb\.[a-zA-Z]/);
  });
});

/* ═══════ ۳) جریان ارتقا: پرسنل PM → کاربر اپ → پیوند در دفترچه ═══════ */
describe("PN-017 · جریان ارتقای پرسنل PM", () => {
  test("ساخت کاربر با دادهٔ PM → hasAccount=true در دفترچه → پس از حذف، پیوند برمی‌گردد", async () => {
    const { token } = await makeSession("OWNER");
    const usersRoute = await import("@/app/api/admin/users/route");
    const dirRoute = await import("@/app/api/admin/melk-users/route");

    // ۱) ارتقا: POST /api/admin/users با دادهٔ پیش‌پرشدهٔ PM (عین دکمهٔ «ساخت کاربر»)
    const res = await usersRoute.POST(await NR("/api/admin/users", {
      method: "POST",
      headers: { ...hdr(token), "content-type": "application/json" },
      body: JSON.stringify({
        personnelCode: TEST_PM_CODE,
        fullName: "آزمون پرسنل ملک تبریز",
        role: "EXPERT",
        branchTitle: "شعبهٔ آزمون ن۰۱۷",
        roleTitleFa: "مشاور فروش",
      }),
    }));
    expect(res.status).toBe(200);
    const created = await res.json();
    expect(created.user.role).toBe("EXPERT");
    const perms = await db.userPermission.findMany({ where: { userId: created.user.id } });
    expect(perms.length).toBe(6); // EXPERT: شش کاشی

    // ۲) دفترچه: پیوند ظاهر می‌شود
    const dir = await dirRoute.GET(await NR(`/api/admin/melk-users?q=${encodeURIComponent(TEST_PM_CODE)}`, { headers: hdr(token) }));
    const dirBody = await dir.json();
    expect(dirBody.rows[0].hasAccount).toBe(true);
    expect(dirBody.rows[0].accountRole).toBe("EXPERT");

    // ۳) فیلتر «فقط بدون حساب» دیگر این پرسنل را نشان نمی‌دهد
    const dir2 = await dirRoute.GET(await NR("/api/admin/melk-users?onlyWithoutAccount=1&branch=" + encodeURIComponent("شعبهٔ آزمون ن۰۱۷"), { headers: hdr(token) }));
    const dir2Body = await dir2.json();
    expect(dir2Body.rows.length).toBe(0);

    // ۴) پاک‌سازی: حذف کاربر آزمون → پیوند برمی‌گردد
    await db.user.deleteMany({ where: { personnelCode: TEST_PM_CODE } });
    const dir3 = await dirRoute.GET(await NR(`/api/admin/melk-users?q=${encodeURIComponent(TEST_PM_CODE)}`, { headers: hdr(token) }));
    const dir3Body = await dir3.json();
    expect(dir3Body.rows[0].hasAccount).toBe(false);
  });
});
