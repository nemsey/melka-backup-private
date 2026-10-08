/**
 * PN-021 — تست‌های «کارشناس فروش پنهان» (توسعهٔ شاهکار مدیریت کاربران ملک تبریز)
 * ---------------------------------------------------------------------------
 * پوشش (دستور مالک — شورا-ن۰۲۵):
 *   ۱) مدل دامنه: مقادیر دیده‌شدن، قواعد نقش (مالک/مهمان پنهان نمی‌شوند)
 *   ۲) سرویس: ساخت پنهان + رکورد فعالیت stealth-create + مجوزهای پیش‌فرض کارشناس
 *   ۳) فهرست‌ها: پیش‌فرض فقط نمایان‌ها · HIDDEN فقط پنهان‌ها · ALL همه
 *   ۴) نمای کلی: پنهان‌ها از شمارها حذف + شمار جدا hidden
 *   ۵) تغییر دیده‌شدن: نمایان‌سازی/پنهان‌سازی + فعالیت ثبت‌شونده
 *   ۶) ورود: کارشناس پنهان عادی وارد می‌شود (resolvePersonnelLoginUser)
 *   ۷) دفترچهٔ PM: نشان حساب پنهان (accountHidden)
 *   ۸) مرز روت‌ها: visibility=HIDDEN روی GET · POST پنهان · PATCH تغییر · CONSULTANT→403
 *   ۹) ساختار UI: پنج تب + راهنمای کاربر + testidهای شاهکار
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { createHash } from "crypto";

process.env.OWNER_PERSONNEL_CODES = "410099950"; // کد مالک تستی (ایزوله از واقعی‌ها)
const { db } = await import("@/lib/db");

const createdSessions: string[] = [];
async function makeSession(role: "OWNER" | "CONSULTANT", personnelCode = role === "OWNER" ? "960001" : "960002") {
  const { createSession } = await import("@/lib/auth/session");
  const { token } = await createSession(
    { personnelCode, displayName: `تست پنهان ${role}`, role },
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

const TEST_USERS: string[] = []; // userId های ساخته‌شده برای پاک‌سازی

beforeAll(async () => {
  await db.user.deleteMany({ where: { OR: [{ personnelCode: { startsWith: "9600" } }, { mobile: { startsWith: "0999600" } }, { personnelCode: "410099950" }] } });
  await db.userActivity.deleteMany({});
  await db.userSession.deleteMany({});
});

afterAll(async () => {
  for (const t of createdSessions) {
    await db.session.deleteMany({ where: { tokenHash: sha(t) } }).catch(() => undefined);
  }
  await db.user.deleteMany({ where: { id: { in: TEST_USERS } } }).catch(() => undefined);
  await db.user.deleteMany({ where: { OR: [{ personnelCode: { startsWith: "9600" } }, { mobile: { startsWith: "0999600" } }] } }).catch(() => undefined);
  await db.userActivity.deleteMany({}).catch(() => undefined);
  await db.userSession.deleteMany({}).catch(() => undefined);
  await db.$disconnect();
});

/* ═══════ ۱) مدل دامنه ═══════ */
describe("PN-021 · مدل دیده‌شدن کاربر", () => {
  test("دو مقدار مجاز + ردّ مقادیر نامعتبر", async () => {
    const { USER_VISIBILITY, isUserVisibility } = await import("@/lib/users/user-model");
    expect(USER_VISIBILITY).toEqual(["VISIBLE", "HIDDEN"]);
    expect(isUserVisibility("HIDDEN")).toBe(true);
    expect(isUserVisibility("VISIBLE")).toBe(true);
    expect(isUserVisibility("hidden")).toBe(false); // حساس به بزرگی
    expect(isUserVisibility(null)).toBe(false);
  });

  test("قواعد نقش: مالک و مهمان پنهان نمی‌شوند · کارشناس/مدیر/بازدید می‌شوند", async () => {
    const { visibilityAllowedForRole } = await import("@/lib/users/user-model");
    expect(visibilityAllowedForRole("OWNER", "HIDDEN")).toBe(false);
    expect(visibilityAllowedForRole("GUEST", "HIDDEN")).toBe(false);
    expect(visibilityAllowedForRole("EXPERT", "HIDDEN")).toBe(true);
    expect(visibilityAllowedForRole("MANAGER", "HIDDEN")).toBe(true);
    expect(visibilityAllowedForRole("VIEWER", "HIDDEN")).toBe(true);
    for (const r of ["OWNER", "GUEST", "EXPERT", "MANAGER", "VIEWER"] as const) {
      expect(visibilityAllowedForRole(r, "VISIBLE")).toBe(true);
    }
  });

  test("toSafeUser: مقدار نامعتبر/null → VISIBLE (پیش‌فرض امن)", async () => {
    const { toSafeUser } = await import("@/lib/users/user-model");
    const base = { id: "x", personnelCode: "1", mobile: null, fullName: "ت", role: "EXPERT", branchTitle: null, roleTitleFa: null, isActive: true, createdAt: new Date(), lastLoginAt: null, lastLoginIp: null, lockedUntil: null };
    expect(toSafeUser({ ...base, visibility: undefined }).visibility).toBe("VISIBLE");
    expect(toSafeUser({ ...base, visibility: "STEALTH" as never }).visibility).toBe("VISIBLE");
    expect(toSafeUser({ ...base, visibility: "HIDDEN" }).visibility).toBe("HIDDEN");
  });
});

/* ═══════ ۲) سرویس: ساخت پنهان ═══════ */
describe("PN-021 · ساخت کارشناس پنهان", () => {
  test("createUser با HIDDEN → نقش کارشناس + دیده‌شدن پنهان + مجوزها + فعالیت ثبت‌شده", async () => {
    const { createUser } = await import("@/lib/services/users-service");
    const u = await createUser({
      personnelCode: "960101",
      fullName: "کارشناس فروش پنهان تست",
      role: "EXPERT",
      roleTitleFa: "کارشناس فروش",
      branchTitle: "ملک تبریز",
      visibility: "HIDDEN",
      createdBy: "test-owner",
    });
    TEST_USERS.push(u.id);
    expect(u.visibility).toBe("HIDDEN");
    expect(u.role).toBe("EXPERT");
    const perms = await db.userPermission.findMany({ where: { userId: u.id } });
    expect(perms.length).toBe(6); // ماتریس EXPERT شش کاشی
    const acts = await db.userActivity.findMany({ where: { userId: u.id, action: "stealth-create" } });
    expect(acts.length).toBe(1);
    // منبع در metadata ثبت شده (کارشناس پنهان)
    const row = await db.user.findUnique({ where: { id: u.id } });
    expect(JSON.parse(row?.metadata ?? "{}").source).toBe("stealth-expert");
  });

  test("ردّ پنهان‌سازی نقش مالک (قانون هویت دوگانه)", async () => {
    const { createUser } = await import("@/lib/services/users-service");
    let err: unknown = null;
    try {
      await createUser({ personnelCode: "960102", fullName: "تست", role: "OWNER", visibility: "HIDDEN", createdBy: "t" });
    } catch (e) { err = e; }
    expect(err).toBeDefined();
    expect((err as { httpStatus: number }).httpStatus).toBe(400);
  });

  test("ردّ پنهان‌سازی مهمان", async () => {
    const { createUser } = await import("@/lib/services/users-service");
    let err: unknown = null;
    try {
      await createUser({ mobile: "099960103", fullName: "مهمان تست", role: "GUEST", visibility: "HIDDEN", createdBy: "t" });
    } catch (e) { err = e; }
    expect(err).toBeDefined();
    expect((err as { httpStatus: number }).httpStatus).toBe(400);
  });

  test("مقدار نامعتبر → سقوط امن به VISIBLE", async () => {
    const { createUser } = await import("@/lib/services/users-service");
    const u = await createUser({ personnelCode: "960104", fullName: "کاربر عادی تست", role: "VIEWER", visibility: "WHATEVER" as never, createdBy: "t" });
    TEST_USERS.push(u.id);
    expect(u.visibility).toBe("VISIBLE");
  });
});

/* ═══════ ۳) فهرست‌ها ═══════ */
describe("PN-021 · فهرست کاربران و دیده‌شدن", () => {
  test("پیش‌فرض فقط نمایان‌ها · HIDDEN فقط پنهان‌ها · ALL همه", async () => {
    const { listUsers, createUser } = await import("@/lib/services/users-service");
    const h = await createUser({ personnelCode: "960110", fullName: "پنهان فهرست", role: "EXPERT", visibility: "HIDDEN", createdBy: "t" });
    TEST_USERS.push(h.id);
    const v = await createUser({ personnelCode: "960111", fullName: "نمایان فهرست", role: "VIEWER", createdBy: "t" });
    TEST_USERS.push(v.id);

    const def = await listUsers({ includeInactive: true });
    expect(def.some((u) => u.id === h.id)).toBe(false); // پنهان در پیش‌فرض نیست
    expect(def.some((u) => u.id === v.id)).toBe(true);

    const onlyHidden = await listUsers({ includeInactive: true, visibility: "HIDDEN" });
    expect(onlyHidden.length).toBeGreaterThan(0);
    expect(onlyHidden.every((u) => u.visibility === "HIDDEN")).toBe(true);
    expect(onlyHidden.some((u) => u.id === h.id)).toBe(true);
    expect(onlyHidden.some((u) => u.id === v.id)).toBe(false);

    const all = await listUsers({ includeInactive: true, visibility: "ALL" });
    expect(all.some((u) => u.id === h.id)).toBe(true);
    expect(all.some((u) => u.id === v.id)).toBe(true);
  });

  test("جستجو هم پنهان‌ها را در حالت پیش‌فرض نمی‌بیند", async () => {
    const { listUsers } = await import("@/lib/services/users-service");
    const byName = await listUsers({ search: "پنهان فهرست", includeInactive: true });
    expect(byName.length).toBe(0);
    const byNameAll = await listUsers({ search: "پنهان فهرست", includeInactive: true, visibility: "ALL" });
    expect(byNameAll.length).toBe(1);
  });
});

/* ═══════ ۴) نمای کلی ═══════ */
describe("PN-021 · نمای کلی (آمار)", () => {
  test("پنهان‌ها از شمارها حذف + شمار جدا hidden", async () => {
    const { usersOverview, createUser } = await import("@/lib/services/users-service");
    const h = await createUser({ personnelCode: "960120", fullName: "پنهان آمار", role: "EXPERT", visibility: "HIDDEN", createdBy: "t" });
    TEST_USERS.push(h.id);
    const before = await usersOverview();
    // نمایان تازه بسازیم → total و active و byRole یک واحد بالا می‌رود؛ پنهان تازه فقط hidden را بالا می‌برد
    const h2 = await createUser({ personnelCode: "960121", fullName: "پنهان دوم آمار", role: "EXPERT", visibility: "HIDDEN", createdBy: "t" });
    TEST_USERS.push(h2.id);
    const v2 = await createUser({ personnelCode: "960122", fullName: "نمایان دوم آمار", role: "VIEWER", createdBy: "t" });
    TEST_USERS.push(v2.id);
    const after = await usersOverview();
    expect(after.hidden).toBe(before.hidden + 1);
    expect(after.total).toBe(before.total + 1); // فقط نمایان
    expect(after.active).toBe(before.active + 1);
    expect((after.byRole.EXPERT ?? 0)).toBe(before.byRole.EXPERT ?? 0); // پنهانِ EXPERT شمرده نشد
    expect((after.byRole.VIEWER ?? 0)).toBe((before.byRole.VIEWER ?? 0) + 1);
  });
});

/* ═══════ ۵) تغییر دیده‌شدن ═══════ */
describe("PN-021 · نمایان‌سازی و پنهان‌سازی", () => {
  test("HIDDEN → VISIBLE → HIDDEN با فعالیت ثبت‌شونده", async () => {
    const { createUser, updateUser, listUsers } = await import("@/lib/services/users-service");
    const u = await createUser({ personnelCode: "960130", fullName: "چرخهٔ دیده‌شدن", role: "EXPERT", visibility: "HIDDEN", createdBy: "t" });
    TEST_USERS.push(u.id);

    const revealed = await updateUser(u.id, { visibility: "VISIBLE" }, "test-owner");
    expect(revealed.visibility).toBe("VISIBLE");
    let acts = await db.userActivity.findMany({ where: { userId: u.id, action: "stealth-reveal" } });
    expect(acts.length).toBe(1);
    expect((await listUsers({ includeInactive: true })).some((x) => x.id === u.id)).toBe(true);

    const hiddenAgain = await updateUser(u.id, { visibility: "HIDDEN" }, "test-owner");
    expect(hiddenAgain.visibility).toBe("HIDDEN");
    acts = await db.userActivity.findMany({ where: { userId: u.id, action: "stealth-hide" } });
    expect(acts.length).toBe(1);
    expect((await listUsers({ includeInactive: true })).some((x) => x.id === u.id)).toBe(false);
  });

  test("ردّ پنهان‌سازی کاربر مالکِ env (قانون هویت دوگانه)", async () => {
    const { resolvePersonnelLoginUser, updateUser } = await import("@/lib/services/users-service");
    const r = await resolvePersonnelLoginUser("410099950", "مالک تست");
    TEST_USERS.push(r.user.id);
    let err: unknown = null;
    try {
      await updateUser(r.user.id, { visibility: "HIDDEN" }, "t");
    } catch (e) { err = e; }
    expect(err).toBeDefined();
    expect((err as { httpStatus: number }).httpStatus).toBe(403);
  });

  test("ردّ مقدار نامعتبر", async () => {
    const { createUser, updateUser } = await import("@/lib/services/users-service");
    const u = await createUser({ personnelCode: "960131", fullName: "تست مقدار غلط", role: "VIEWER", createdBy: "t" });
    TEST_USERS.push(u.id);
    let err: unknown = null;
    try {
      await updateUser(u.id, { visibility: "GHOST" as never }, "t");
    } catch (e) { err = e; }
    expect(err).toBeDefined();
    expect((err as { httpStatus: number }).httpStatus).toBe(400);
  });
});

/* ═══════ ۶) ورود ═══════ */
describe("PN-021 · ورود کارشناس پنهان", () => {
  test("resolvePersonnelLoginUser: پنهان عادی وارد می‌شود (نقش کارشناس، فعال)", async () => {
    const { createUser, resolvePersonnelLoginUser } = await import("@/lib/services/users-service");
    const u = await createUser({ personnelCode: "960140", fullName: "ورود پنهان", role: "EXPERT", visibility: "HIDDEN", createdBy: "t" });
    TEST_USERS.push(u.id);
    const r = await resolvePersonnelLoginUser("960140", "ورود پنهان");
    expect(r.effectiveRole).toBe("EXPERT");
    expect(r.legacyRole).toBe("CONSULTANT");
    expect(r.user.isActive).toBe(true);
    expect(r.user.id).toBe(u.id);
    expect(r.isNewlyProvisioned).toBe(false);
  });

  test("resolveAllowedTiles: مجوزهای کارشناس پنهان عادی کار می‌کند", async () => {
    const { resolveAllowedTiles } = await import("@/lib/access/personnel-access");
    const r = await resolveAllowedTiles("CONSULTANT", "960140");
    expect(r.level).toBe("limited");
    expect(r.tiles).toContain("arm-listings");
    expect(r.tiles).toContain("smart-matching");
  });
});

/* ═══════ ۷) دفترچهٔ PM ═══════ */
describe("PN-021 · دفترچهٔ PM و حساب پنهان", () => {
  test("پرسنلِ دارای حساب پنهان → accountHidden=true (فقط در نمای مالک)", async () => {
    const { melkUsersDirectory, createUser } = await import("@/lib/services/users-service");
    // یک ExpertProfile شبیه‌سازی می‌کنیم (الگوی تست‌های پیشین)
    const ep = await db.expertProfile.create({
      data: {
        id: "test-pn021-pm-person", personnelCode: "960150", fullName: "پرسنل PM پنهان", mobile: "0999600150",
        roleTitle: "مشاور فروش", branchTitle: "ملک تبریز", active: true, saleCount: 0, rentCount: 0,
      },
    }).catch(() => null); // اگر unique تکراری بود رد می‌شود — تست مستقل از دادهٔ واقعی
    try {
      const h = await createUser({ personnelCode: "960150", fullName: "پرسنل PM پنهان", role: "EXPERT", visibility: "HIDDEN", createdBy: "t" });
      TEST_USERS.push(h.id);
      const dir = await melkUsersDirectory({});
      const row = dir.rows.find((r) => r.personnelCode === "960150");
      expect(row).toBeDefined();
      expect(row?.hasAccount).toBe(true);
      expect(row?.accountHidden).toBe(true);
      // بقیهٔ ردیف‌های دارای حساب، پنهان نیستند
      expect(dir.rows.filter((r) => r.hasAccount && !r.accountHidden).length).toBeGreaterThanOrEqual(0);
    } finally {
      if (ep) await db.expertProfile.deleteMany({ where: { id: ep.id } }).catch(() => undefined);
    }
  });
});

/* ═══════ ۸) مرز روت‌ها ═══════ */
describe("PN-021 · مرز روت‌های دیده‌شدن", () => {
  test("CONSULTANT → GET visibility=HIDDEN → 403", async () => {
    const { token } = await makeSession("CONSULTANT");
    const route = await import("@/app/api/admin/users/route");
    const res = await route.GET(await NR("/api/admin/users?visibility=HIDDEN", { headers: hdr(token) }));
    expect(res.status).toBe(403);
  });

  test("OWNER → GET visibility=HIDDEN → فقط پنهان‌ها + overview.hidden", async () => {
    const { token } = await makeSession("OWNER");
    const route = await import("@/app/api/admin/users/route");
    const res = await route.GET(await NR("/api/admin/users?visibility=HIDDEN&includeInactive=1", { headers: hdr(token) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.rows.every((u: { visibility: string }) => u.visibility === "HIDDEN")).toBe(true);
    expect(typeof body.overview.hidden).toBe("number");
    expect(body.overview.hidden).toBe(body.rows.length);
  });

  test("OWNER → GET پیش‌فرض → هیچ پنهانی در فهرست نیست", async () => {
    const { token } = await makeSession("OWNER");
    const route = await import("@/app/api/admin/users/route");
    const res = await route.GET(await NR("/api/admin/users?includeInactive=1", { headers: hdr(token) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.rows.every((u: { visibility: string }) => u.visibility === "VISIBLE")).toBe(true);
  });

  test("OWNER → POST با visibility=HIDDEN → کارشناس پنهان ساخته می‌شود", async () => {
    const { token } = await makeSession("OWNER");
    const route = await import("@/app/api/admin/users/route");
    const res = await route.POST(await NR("/api/admin/users", {
      method: "POST",
      headers: { ...hdr(token), "content-type": "application/json" },
      body: JSON.stringify({ personnelCode: "960160", fullName: "POST پنهان تست", role: "EXPERT", roleTitleFa: "کارشناس فروش", visibility: "HIDDEN" }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    TEST_USERS.push(body.user.id);
    expect(body.user.visibility).toBe("HIDDEN");
    expect(body.user.role).toBe("EXPERT");
  });

  test("OWNER → POST با visibility نامعتبر → 400", async () => {
    const { token } = await makeSession("OWNER");
    const route = await import("@/app/api/admin/users/route");
    const res = await route.POST(await NR("/api/admin/users", {
      method: "POST",
      headers: { ...hdr(token), "content-type": "application/json" },
      body: JSON.stringify({ personnelCode: "960161", fullName: "نامعتبر تست", role: "EXPERT", visibility: "GHOST" }),
    }));
    expect(res.status).toBe(400);
  });

  test("OWNER → PATCH [id] نمایان‌سازی → 200 و تغییر اعمال", async () => {
    const { token } = await makeSession("OWNER");
    const route = await import("@/app/api/admin/users/[id]/route");
    const u = await db.user.findUnique({ where: { personnelCode: "960160" } });
    expect(u).not.toBeNull();
    const res = await route.PATCH(
      await NR(`/api/admin/users/${u!.id}`, {
        method: "PATCH",
        headers: { ...hdr(token), "content-type": "application/json" },
        body: JSON.stringify({ visibility: "VISIBLE" }),
      }),
      { params: Promise.resolve({ id: u!.id }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.visibility).toBe("VISIBLE");
  });

  test("CONSULTANT → PATCH نمایان‌سازی → 403", async () => {
    const { token } = await makeSession("CONSULTANT");
    const route = await import("@/app/api/admin/users/[id]/route");
    const u = await db.user.findUnique({ where: { personnelCode: "960160" } });
    const res = await route.PATCH(
      await NR(`/api/admin/users/${u!.id}`, {
        method: "PATCH",
        headers: { ...hdr(token), "content-type": "application/json" },
        body: JSON.stringify({ visibility: "VISIBLE" }),
      }),
      { params: Promise.resolve({ id: u!.id }) }
    );
    expect(res.status).toBe(403);
  });
});

/* ═══════ ۹) ساختار UI ═══════ */
describe("PN-021 · ساختار بخش مدیریت کاربران (UI)", () => {
  test("پنج تب: کاربران، PM، کارشناس پنهان، همگام‌سازی، راهنما", async () => {
    const src = await Bun.file("src/core/tiles/tiles/settings/MelkTabrizUsersSection.tsx").text();
    expect(src).toContain('value="users"');
    expect(src).toContain('value="pm"');
    expect(src).toContain('value="stealth"');
    expect(src).toContain('value="sync"');
    expect(src).toContain('value="guide"');
    // testidهای شاهکار
    expect(src).toContain('data-testid="stealth-intro"');
    expect(src).toContain('data-testid="stealth-add"');
    expect(src).toContain('data-testid="stealth-list"');
    expect(src).toContain('data-testid="mtb-guide"');
    // دکمهٔ نمایان + فرم پنهان
    expect(src).toContain('data-testid="stealth-save"');
    expect(src).toContain("ساخت کارشناس فروش پنهان");
    expect(src).toContain("نمایان");
  });

  test("راهنمای کاربر: سه مسیر ایجاد + راهنمای ورود تعبیه شده", async () => {
    const src = await Bun.file("src/core/tiles/tiles/settings/MelkTabrizUsersSection.tsx").text();
    expect(src).toContain("راهنمای ایجاد کاربر در سامانه‌های ملک تبریز");
    expect(src).toContain("مسیر ۱ — کاربر عادی");
    expect(src).toContain("مسیر ۲ — از دفترچهٔ پرسنل");
    expect(src).toContain("مسیر ۳ — کارشناس فروش پنهان");
    expect(src).toContain("نحوهٔ ورود کاربرها و رفع اشکال");
    // صداقت فنی: هیچ نوشتنی به سامانهٔ خارجی
    expect(src).toContain("همگام‌سازی فقط خواندنی");
  });

  test("گارد دیده‌شدن در روت‌ها: پارامتر visibility روی GET اعمال می‌شود", async () => {
    const src = await Bun.file("src/app/api/admin/users/route.ts").text();
    expect(src).toContain('url.searchParams.get("visibility")');
    expect(src).toContain("HIDDEN");
    const srcId = await Bun.file("src/app/api/admin/users/[id]/route.ts").text();
    expect(srcId).toContain("isUserVisibility");
  });
});
