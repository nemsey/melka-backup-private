/**
 * PN-016 — تست‌های سیستم مدیریت کاربران پیشرفته
 * ---------------------------------------------------------------------------
 * پوشش (شورا-ن۰۲۰):
 *   ۱) مدل دامنه: نقش‌ها، اعتبارسنجی، ماتریس پیش‌فرض
 *   ۲) رجیستری User در resolveAllowedTiles (هستهٔ رفع خطای دو کاربر)
 *   ۳) resolvePersonnelLoginUser: مالک/موجود/خودساخت/غیرفعال
 *   ۴) مکانیزم OTP مهمان: صدور/تأیید/غلط/یک‌بارمصرف
 *   ۵) مرز نقش‌ها روی روت‌های مدیریت کاربران (CONSULTANT→403 · OWNER→200)
 *   ۶) گاردها: اجرای هر سه اسکریپت PASS
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { createHash } from "crypto";

process.env.OWNER_PERSONNEL_CODES = "410099950"; // کد مالک تستی (ایزوله از واقعی‌ها)
const { db } = await import("@/lib/db");

const createdSessions: string[] = [];
async function makeSession(role: "OWNER" | "CONSULTANT", personnelCode = role === "OWNER" ? "960001" : "960002") {
  const { createSession } = await import("@/lib/auth/session");
  const { token } = await createSession(
    { personnelCode, displayName: `تست کاربران ${role}`, role },
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
describe("PN-016 · مدل دامنهٔ کاربران", () => {
  test("پنج نقش مجاز + برچسب فارسی هر یک", async () => {
    const { USER_ROLES, ROLE_LABELS_FA } = await import("@/lib/users/user-model");
    expect(USER_ROLES).toEqual(["OWNER", "MANAGER", "EXPERT", "VIEWER", "GUEST"]);
    for (const r of USER_ROLES) expect(ROLE_LABELS_FA[r].length).toBeGreaterThan(3);
  });

  test("تصویر نقش جدید روی نقش قدیمی — صفر تغییر گاردهای موجود", async () => {
    const { legacyRoleOf } = await import("@/lib/users/user-model");
    expect(legacyRoleOf("OWNER")).toBe("OWNER");
    expect(legacyRoleOf("MANAGER")).toBe("CONSULTANT");
    expect(legacyRoleOf("EXPERT")).toBe("CONSULTANT");
    expect(legacyRoleOf("VIEWER")).toBe("CONSULTANT");
    expect(legacyRoleOf("GUEST")).toBe("CONSULTANT");
  });

  test("ماتریس پیش‌فرض: EXPERT شش کاشیِ قابل‌مدیریت با خواندن/نوشتن/خروجی — بدون حذف/همگام", async () => {
    const { defaultPermissionsForRole } = await import("@/lib/users/user-model");
    const expert = defaultPermissionsForRole("EXPERT");
    expect(expert.length).toBe(6);
    for (const p of expert) {
      expect(p.canRead).toBe(true);
      expect(p.canWrite).toBe(true);
      expect(p.canExport).toBe(true);
      expect(p.canDelete).toBe(false);
      expect(p.canSync).toBe(false);
    }
  });

  test("ماتریس پیش‌فرض: VIEWER فقط خواندن · GUEST هیچ", async () => {
    const { defaultPermissionsForRole } = await import("@/lib/users/user-model");
    const viewer = defaultPermissionsForRole("VIEWER");
    expect(viewer.length).toBe(10);
    expect(viewer.every((p) => p.canRead && !p.canWrite && !p.canDelete && !p.canExport && !p.canSync)).toBe(true);
    expect(defaultPermissionsForRole("GUEST")).toHaveLength(0);
  });

  test("اعتبارسنجی ورودی: بدون شناسه/نام کوتاه/نقش غلط/موبایل غلط", async () => {
    const { validateUserInput } = await import("@/lib/users/user-model");
    expect(validateUserInput({ fullName: "تست", role: "VIEWER" })).toContain("کد پرسنلی یا موبایل");
    expect(validateUserInput({ personnelCode: "960001", fullName: "ت", role: "VIEWER" })).toContain("نام کامل");
    expect(validateUserInput({ personnelCode: "960001", fullName: "تست کاربر", role: "SUPERADMIN" } as never)).toContain("نقش نامعتبر");
    expect(validateUserInput({ mobile: "12345", fullName: "تست کاربر", role: "VIEWER" })).toContain("موبایل");
    expect(validateUserInput({ personnelCode: "960001", fullName: "تست کاربر", role: "EXPERT" })).toBeNull();
  });
});

/* ═══════ ۲) رجیستری User در resolveAllowedTiles ═══════ */
describe("PN-016 · resolveAllowedTiles با رجیستری User", () => {
  test("کاربر EXPERT → شش کاشی؛ بدون رکورد User → همان رفتار قدیمی none", async () => {
    const u = await db.user.create({
      data: { personnelCode: "960010", fullName: "کارشناس تست", role: "EXPERT", isActive: true, createdBy: "test" },
    });
    TEST_USERS.push(u.id);
    const { defaultPermissionsForRole } = await import("@/lib/users/user-model");
    await db.userPermission.createMany({
      data: defaultPermissionsForRole("EXPERT").map((p) => ({ userId: u.id, ...p })),
    });

    const { resolveAllowedTiles } = await import("@/lib/access/personnel-access");
    const r1 = await resolveAllowedTiles("CONSULTANT", "960010");
    expect(r1.level).toBe("limited");
    expect(r1.tiles).toContain("arm-listings");
    expect(r1.tiles).not.toContain("learning-tier");
    expect(r1.tiles.length).toBe(6);

    // بدون رکورد → رفتار قدیمی (PersonnelAccess خالی) = none
    const r2 = await resolveAllowedTiles("CONSULTANT", "960099");
    expect(r2.level).toBe("none");
    expect(r2.tiles).toHaveLength(0);

    // OWNER همیشه کامل — حتی با رکورد محدود
    const r3 = await resolveAllowedTiles("OWNER", "960010");
    expect(r3.level).toBe("full");
  });

  test("کاربر غیرفعال → none (دفاع عمقی) · GUEST → هیچ کاشی", async () => {
    const { resolveAllowedTiles } = await import("@/lib/access/personnel-access");
    const u = await db.user.create({
      data: { personnelCode: "960011", fullName: "غیرفعال تست", role: "EXPERT", isActive: false, createdBy: "test" },
    });
    TEST_USERS.push(u.id);
    const r = await resolveAllowedTiles("CONSULTANT", "960011");
    expect(r.level).toBe("none");

    const g = await db.user.create({
      data: { mobile: "099960011", fullName: "مهمان تست", role: "GUEST", isActive: true, createdBy: "test" },
    });
    TEST_USERS.push(g.id);
    const rg = await resolveAllowedTiles("CONSULTANT", "099960011"); // مهمان با موبایل — کد پرسنلی ندارد
    expect(rg.level).toBe("none");
  });

  test("fallback به PersonnelAccess قدیمی هنوز کار می‌کند (سازگاری PN-008)", async () => {
    await db.personnelAccess.create({
      data: { personnelCode: "960012", level: "limited", allowedTiles: JSON.stringify(["experts"]), grantedBy: "test" },
    });
    try {
      const { resolveAllowedTiles } = await import("@/lib/access/personnel-access");
      const r = await resolveAllowedTiles("CONSULTANT", "960012");
      expect(r.level).toBe("limited");
      expect(r.tiles).toEqual(["experts"]);
    } finally {
      await db.personnelAccess.deleteMany({ where: { personnelCode: "960012" } });
    }
  });
});

/* ═══════ ۳) نقطهٔ اتصال ورود ═══════ */
describe("PN-016 · resolvePersonnelLoginUser", () => {
  test("کد مالک env → همیشه OWNER (قانون هویت دوگانه — حتی با رکورد غلط)", async () => {
    // رکورد غلط با نقش VIEWER برای کد مالک (ایزوله — beforeAll پاک کرده)
    await db.user.create({
      data: { personnelCode: "410099950", fullName: "مالک تست", role: "VIEWER", isActive: true, createdBy: "test" },
    }).catch(async () => {
      await db.user.deleteMany({ where: { personnelCode: "410099950" } });
      return db.user.create({
        data: { personnelCode: "410099950", fullName: "مالک تست", role: "VIEWER", isActive: true, createdBy: "test" },
      });
    });
    const { resolvePersonnelLoginUser } = await import("@/lib/services/users-service");
    const r = await resolvePersonnelLoginUser("410099950", "مالک تست");
    expect(r.effectiveRole).toBe("OWNER");
    expect(r.legacyRole).toBe("OWNER");
    // رکورد هم تصحیح شد
    const row = await db.user.findUnique({ where: { personnelCode: "410099950" } });
    expect(row?.role).toBe("OWNER");
  });

  test("بدون رکورد → خودساخت VIEWER با ماتریس کامل VIEWER", async () => {
    const { resolvePersonnelLoginUser } = await import("@/lib/services/users-service");
    const r = await resolvePersonnelLoginUser("960020", "کاربر تازه");
    TEST_USERS.push(r.user.id);
    expect(r.effectiveRole).toBe("VIEWER");
    expect(r.legacyRole).toBe("CONSULTANT");
    expect(r.isNewlyProvisioned).toBe(true);
    const perms = await db.userPermission.findMany({ where: { userId: r.user.id } });
    expect(perms.length).toBe(10); // VIEWER: همهٔ کاشی‌ها فقط-خواندن
  });

  test("کاربر غیرفعال → isActive=false (روت ورود باید 403 بدهد)", async () => {
    const u = await db.user.create({
      data: { personnelCode: "960021", fullName: "مسدود تست", role: "EXPERT", isActive: false, createdBy: "test" },
    });
    TEST_USERS.push(u.id);
    const { resolvePersonnelLoginUser } = await import("@/lib/services/users-service");
    const r = await resolvePersonnelLoginUser("960021", "مسدود تست");
    expect(r.user.isActive).toBe(false);
  });
});

/* ═══════ ۴) مکانیزم OTP مهمان ═══════ */
describe("PN-016 · OTP مهمان", () => {
  test("صدور → قالب ۴رقمی · تأیید درست → ok · غلط → رد · تکرار → رد (یک‌بارمصرف)", async () => {
    const { issueGuestOtp, verifyGuestOtp, hasActiveGuestOtp } = await import("@/lib/auth/guest-otp");
    const m = "099960030";
    expect(hasActiveGuestOtp(m)).toBe(false);
    const { code, expiresInSeconds } = issueGuestOtp(m);
    expect(/^\d{4}$/.test(code)).toBe(true);
    expect(expiresInSeconds).toBe(300);
    expect(hasActiveGuestOtp(m)).toBe(true);
    expect(verifyGuestOtp(m, code === "0000" ? "1111" : "0000").ok).toBe(false); // غلط
    expect(verifyGuestOtp(m, code).ok).toBe(true); // درست
    expect(verifyGuestOtp(m, code).ok).toBe(false); // replay — یک‌بارمصرف
    expect(hasActiveGuestOtp(m)).toBe(false);
  });

  test("پنج تلاش غلط → قفل کد (تلاش ششم حتی با کد درست رد)", async () => {
    const { issueGuestOtp, verifyGuestOtp } = await import("@/lib/auth/guest-otp");
    const m = "099960031";
    const { code } = issueGuestOtp(m);
    const wrong = code === "0000" ? "1111" : "0000";
    for (let i = 0; i < 5; i++) expect(verifyGuestOtp(m, wrong).ok).toBe(false);
    expect(verifyGuestOtp(m, code).ok).toBe(false); // قفل شد
  });

  test("موبایل نامعتبر رد می‌شود", async () => {
    const { isValidGuestMobile } = await import("@/lib/auth/guest-otp");
    expect(isValidGuestMobile("09141234567")).toBe(true);
    expect(isValidGuestMobile("9141234567")).toBe(false);
    expect(isValidGuestMobile("0914123456")).toBe(false);
  });

  test("کاربر مهمان با موبایل → GUEST + نشست با کلید guest:", async () => {
    const { resolveGuestLoginUser } = await import("@/lib/services/users-service");
    const g = await resolveGuestLoginUser("099960032");
    TEST_USERS.push(g.user.id);
    expect(g.effectiveRole).toBe("GUEST");
    expect(g.isNewlyProvisioned).toBe(true);
    const again = await resolveGuestLoginUser("099960032");
    expect(again.isNewlyProvisioned).toBe(false);
    expect(again.user.id).toBe(g.user.id);
  });
});

/* ═══════ ۵) مرز نقش‌ها روی روت‌های مدیریت کاربران ═══════ */
describe("PN-016 · مرز روت‌های مدیریت کاربران", () => {
  test("CONSULTANT → GET /api/admin/users → 403", async () => {
    const { token } = await makeSession("CONSULTANT");
    const route = await import("@/app/api/admin/users/route");
    const res = await route.GET(await NR("/api/admin/users", { headers: hdr(token) }));
    expect(res.status).toBe(403);
  });

  test("بدون توکن → 401", async () => {
    const route = await import("@/app/api/admin/users/route");
    const res = await route.GET(await NR("/api/admin/users"));
    expect(res.status).toBe(401);
  });

  test("OWNER → GET /api/admin/users → 200 با فهرست + رجیستری + نقش‌ها", async () => {
    const { token } = await makeSession("OWNER");
    const route = await import("@/app/api/admin/users/route");
    const res = await route.GET(await NR("/api/admin/users", { headers: hdr(token) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.rows)).toBe(true);
    expect(body.registry.length).toBe(10);
    expect(body.roles.map((r: { id: string }) => r.id)).toEqual(["OWNER", "MANAGER", "EXPERT", "VIEWER", "GUEST"]);
  });

  test("OWNER → POST ساخت کاربر + نقش مالک حفظ می‌شود", async () => {
    const { token } = await makeSession("OWNER");
    const route = await import("@/app/api/admin/users/route");
    const res = await route.POST(await NR("/api/admin/users", {
      method: "POST",
      headers: { ...hdr(token), "content-type": "application/json" },
      body: JSON.stringify({ personnelCode: "960040", fullName: "کاربر ساخته‌شده تست", role: "MANAGER" }),
    }));
    expect(res.status).toBe(200);
    const body = await res.json();
    TEST_USERS.push(body.user.id);
    expect(body.user.role).toBe("MANAGER");
    const perms = await db.userPermission.findMany({ where: { userId: body.user.id } });
    expect(perms.length).toBe(10); // MANAGER: همهٔ کاشی‌ها

    // نقش مالک env از POST نمی‌تواند کم شود (قانون هویت دوگانه)
    await db.user.deleteMany({ where: { personnelCode: "410099950" } });
    const res2 = await route.POST(await NR("/api/admin/users", {
      method: "POST",
      headers: { ...hdr(token), "content-type": "application/json" },
      body: JSON.stringify({ personnelCode: "410099950", fullName: "تلاش جعل مالک", role: "VIEWER" }),
    }));
    const body2 = await res2.json();
    expect(body2.user.role).toBe("OWNER");
  });

  test("OWNER → PATCH مجوزهای مالک → 403 (عبور می‌کند نه محدود)", async () => {
    const ownerRow = await db.user.findUnique({ where: { personnelCode: "410099950" } });
    const { token } = await makeSession("OWNER");
    const route = await import("@/app/api/admin/users/[id]/permissions/route");
    const res = await route.PUT(
      await NR(`/api/admin/users/${ownerRow!.id}/permissions`, {
        method: "PUT",
        headers: { ...hdr(token), "content-type": "application/json" },
        body: JSON.stringify({ permissions: [] }),
      }),
      { params: Promise.resolve({ id: ownerRow!.id }) }
    );
    expect(res.status).toBe(403);
  });
});

/* ═══════ ۶) سه گارد جدید ═══════ */
describe("PN-016 · سه گارد کاربران", () => {
  test("audit-user-roles.sh → PASS (exit 0)", async () => {
    const { execSync } = await import("child_process");
    const out = execSync("bash scripts/audit-user-roles.sh", { encoding: "utf8" }).toString();
    expect(out).toContain("PASS");
  });

  test("audit-permission-boundary.sh → PASS (exit 0)", async () => {
    const { execSync } = await import("child_process");
    const out = execSync("bash scripts/audit-permission-boundary.sh", { encoding: "utf8" }).toString();
    expect(out).toContain("PASS");
  });

  test("audit-activity-log.sh → PASS (exit 0)", async () => {
    const { execSync } = await import("child_process");
    const out = execSync("bash scripts/audit-activity-log.sh", { encoding: "utf8" }).toString();
    expect(out).toContain("PASS");
  });
});
