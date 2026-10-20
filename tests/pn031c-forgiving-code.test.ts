/**
 * تست‌های PN-031-C — کد راه‌اندازی بخشنده (شورای عالی ملکا · جلسهٔ فوق‌العاده ۰۴۰)
 * ---------------------------------------------------------------------------
 * پوشش مستقیم تست‌های A و B دروازهٔ پایانی سند ۰۴۰ + بندهای ۲.۳:
 *   A) دروازه-A: تلاش اول «ناموفق» (شبیه‌سازی — دانلود بدون Poll) ← همان کد
 *      برای تلاش دوم کار می‌کند ← PASS (پایان چرخهٔ ۴۰۳)
 *   B) دروازه-B: سه تلاش بدون اتصال گوشی ← تلاش چهارم ← رد دقیق «limit» (سقف)
 *   C) سوختن صحیح: اولین Poll موفق ← enrolledAt + خنثی‌سازی پنجره ←
 *      دانلود بعدی همان کد ← رد «used» (سوختهٔ واقعی، نه کاذب)
 *   D) پیام‌های متمایز: invalid / expired / revoked / used / limit
 *   E) relayEnrollState — نگاشت وضعیت‌ها (waiting/installing/enrolled/…)
 *   F) روت code-status + آینهٔ v1 + روت سبک (مرز مخزن) + سازگاری UI
 *   G) بقای اسکیمای مهاجرت (فیلدهای تازه روی RelayDevice)
 *
 * اجرا: bun test tests/pn031c-forgiving-code.test.ts
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = join(import.meta.dir, "..");

const saved: Record<string, string | undefined> = {};
function setEnv(key: string, value: string | undefined) {
  if (!(key in saved)) saved[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
beforeAll(() => {
  for (const k of ["MELK_ARM_RELAY_MODE", "MELK_ARM_OFFLINE"]) setEnv(k, process.env[k]);
});
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

/** ساخت دستگاه تستی با کدِ قابل کنترل — پاکسازی خودکار در پایان هر describe */
async function seedTestDevice(deviceId: string, over: Record<string, unknown> = {}): Promise<string> {
  const { db } = await import("@/lib/db");
  const enrollCode = `pn031c-code-${deviceId}`;
  await db.relayDevice.upsert({
    where: { deviceId },
    create: {
      deviceId,
      secret: "f".repeat(64),
      label: `تست PN-031-C ${deviceId}`,
      enrollCode,
      enrollExpires: new Date(Date.now() + 30 * 60 * 1000),
      ...over,
    },
    update: { enrollCode, enrolledAt: null, revokedAt: null, attemptCount: 0, enrollExpires: new Date(Date.now() + 30 * 60 * 1000), ...over },
  });
  return enrollCode;
}

async function cleanup(ids: string[]): Promise<void> {
  const { db } = await import("@/lib/db");
  await db.relayDevice.deleteMany({ where: { deviceId: { in: ids } } });
}

// ───────────────────── A) دروازه-A شورا — چرخهٔ شکست → موفقیت با همان کد ─────────────────────

describe("PN-031-C · A) دروازهٔ A سند ۰۴۰ — تلاش ناموفف کد را نمی‌سوزاند", () => {
  const ids = ["test-pn031c-a1"];

  test("A-1) تلاش اول (شبیه‌سازی خطا — دانلود بدون Poll) ← کد هنوز زنده", async () => {
    const { consumeEnrollCode } = await import("@/lib/melk-api/relay");
    const code = await seedTestDevice("test-pn031c-a1");
    const r = await consumeEnrollCode(code, "127.0.0.1");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.device.attemptCount).toBe(1);
      expect(r.device.maxAttempts).toBe(3);
    }
  });

  test("A-2) تلاش دوم با همان کد ← باز هم موفق (پایان چرخهٔ ۴۰۳ جلسهٔ ۰۴۰)", async () => {
    const { consumeEnrollCode } = await import("@/lib/melk-api/relay");
    const code = `pn031c-code-test-pn031c-a1`;
    const r = await consumeEnrollCode(code, "127.0.0.1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.device.attemptCount).toBe(2);
  });

  test("A-3) تلاش سوم با همان کد ← باز هم مجاز (سقف = ۳)", async () => {
    const { consumeEnrollCode } = await import("@/lib/melk-api/relay");
    const r = await consumeEnrollCode(`pn031c-code-test-pn031c-a1`, "127.0.0.1");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.device.attemptCount).toBe(3);
  });

  test("A-4) پس از سه تلاش، کد هنوز در DB است (سوخته فقط با Poll)", async () => {
    const { db } = await import("@/lib/db");
    const dev = await db.relayDevice.findUnique({ where: { deviceId: "test-pn031c-a1" } });
    expect(dev?.enrollCode).not.toBeNull();
    expect(dev?.enrolledAt).toBeNull();
    expect(dev?.attemptCount).toBe(3);
    await cleanup(ids);
  });
});

// ───────────────────── B) دروازه-B شورا — سقف ۳ تلاش ─────────────────────

describe("PN-031-C · B) دروازهٔ B سند ۰۴۰ — چهارمین تلاش پس از سه تلاش بی‌اتصال", () => {
  const ids = ["test-pn031c-b1"];

  test("B-1) سه دانلود موفق (بدون Poll) ← تلاش چهارم رد دقیق «limit»", async () => {
    const { consumeEnrollCode } = await import("@/lib/melk-api/relay");
    const code = await seedTestDevice("test-pn031c-b1");
    expect((await consumeEnrollCode(code, "127.0.0.1")).ok).toBe(true);
    expect((await consumeEnrollCode(code, "127.0.0.1")).ok).toBe(true);
    expect((await consumeEnrollCode(code, "127.0.0.1")).ok).toBe(true);
    const fourth = await consumeEnrollCode(code, "127.0.0.1");
    expect(fourth.ok).toBe(false);
    if (!fourth.ok) expect(fourth.reason).toBe("limit");
    await cleanup(ids);
  });
});

// ───────────────────── C) سوختن صحیح — فقط اولین Poll موفق ─────────────────────

describe("PN-031-C · C) سوختن نهایی با اولین Poll موفق گوشی", () => {
  const ids = ["test-pn031c-c1"];

  test("C-1) markRelayEnrollCompleted ← enrolledAt ثبت + پنجره خنثی + کد حفظ (تشخیص «used»)", async () => {
    const { markRelayEnrollCompleted } = await import("@/lib/melk-api/relay");
    const { db } = await import("@/lib/db");
    const code = await seedTestDevice("test-pn031c-c1");
    // یک دانلود (تلاش ۱)
    const { consumeEnrollCode } = await import("@/lib/melk-api/relay");
    await consumeEnrollCode(code, "127.0.0.1");
    // اولین Poll موفق گوشی
    const n = await markRelayEnrollCompleted("test-pn031c-c1");
    expect(n).toBe(1);
    const dev = await db.relayDevice.findUnique({ where: { deviceId: "test-pn031c-c1" } });
    expect(dev?.enrolledAt).not.toBeNull();
    expect(dev?.enrollExpires).toBeNull();
    expect(dev?.enrollCode).not.toBeNull(); // حفظ برای تشخیص «used» در برابر «invalid»
  });

  test("C-2) دانلود بعد از نصب کامل ← رد «used» (سوختهٔ واقعی) — نه ۴۰۳ خام", async () => {
    const { consumeEnrollCode } = await import("@/lib/melk-api/relay");
    const r = await consumeEnrollCode(`pn031c-code-test-pn031c-c1`, "127.0.0.1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("used");
  });

  test("C-3) فراخوانی دوبارهٔ markRelayEnrollCompleted روی دستگاه کامل‌شده ← صفر (ایدمپتانس)", async () => {
    const { markRelayEnrollCompleted } = await import("@/lib/melk-api/relay");
    expect(await markRelayEnrollCompleted("test-pn031c-c1")).toBe(0);
    await cleanup(ids);
  });
});

// ───────────────────── D) پیام‌های متمایز (کار ۵) ─────────────────────

describe("PN-031-C · D) دلایل رد متمایز — نامعتبر/منقضی/ابطال‌شده", () => {
  const ids = ["test-pn031c-d1", "test-pn031c-d2"];

  test("D-1) کد ناموجود ← invalid", async () => {
    const { consumeEnrollCode } = await import("@/lib/melk-api/relay");
    const r = await consumeEnrollCode("pn031c-no-such-code-0000", "127.0.0.1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("invalid");
  });

  test("D-2) کد منقضی (پنجرهٔ ۳۰ دقیقه گذشته) ← expired", async () => {
    const { consumeEnrollCode } = await import("@/lib/melk-api/relay");
    const code = await seedTestDevice("test-pn031c-d1", {
      enrollExpires: new Date(Date.now() - 60 * 1000), // یک دقیقه پیش
    });
    const r = await consumeEnrollCode(code, "127.0.0.1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("expired");
  });

  test("D-3) دستگاه ابطال‌شده ← revoked", async () => {
    const { consumeEnrollCode } = await import("@/lib/melk-api/relay");
    const code = await seedTestDevice("test-pn031c-d2", { revokedAt: new Date() });
    const r = await consumeEnrollCode(code, "127.0.0.1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("revoked");
    await cleanup(ids);
  });

  test("D-4) روت bootstrap — جدول پیام‌های فارسی متمایز برای هر دلیل", () => {
    const src = readFileSync(join(REPO, "src/app/api/mobile-relay/bootstrap/route.ts"), "utf8");
    expect(src).toContain('used: {');
    expect(src).toContain('limit: {');
    expect(src).toContain('expired: {');
    expect(src).toContain('invalid: {');
    expect(src).toContain('revoked: {');
    expect(src).toContain("کد سوخته");
    expect(src).toContain("کد منقضی");
    expect(src).toContain("کد نامعتبر");
  });

  test("D-5) روت bootstrap — کد بخشنده: سرآیند تلاش + هدرهای شمارش تلاش", () => {
    const src = readFileSync(join(REPO, "src/app/api/mobile-relay/bootstrap/route.ts"), "utf8");
    expect(src).toContain("x-melka-attempts-used");
    expect(src).toContain("x-melka-attempts-max");
    expect(src).toContain("این کد تا");
  });
});

// ───────────────────── E) نگاشت وضعیت relayEnrollState ─────────────────────

describe("PN-031-C · E) وضعیت کد (relayEnrollState) — بدون راز، برای UI/کد-استاتوس", () => {
  const now = new Date();
  const base = {
    enrollCode: "x",
    enrollExpires: new Date(now.getTime() + 10 * 60 * 1000),
    attemptCount: 0,
    maxAttempts: 3,
    lastAttemptAt: null,
    enrolledAt: null,
    revokedAt: null,
    lastSeenAt: null,
  };

  test("E-1) کد تازه بدون تلاش ← waiting", async () => {
    const { relayEnrollState } = await import("@/lib/melk-api/relay");
    expect(relayEnrollState(base).state).toBe("waiting");
  });

  test("E-2) تلاش بدون اتصال گوشی ← installing (همان کد دوباره کار می‌کند)", async () => {
    const { relayEnrollState } = await import("@/lib/melk-api/relay");
    expect(relayEnrollState({ ...base, attemptCount: 1, lastAttemptAt: now }).state).toBe("installing");
  });

  test("E-3) نصب کامل ← enrolled · سقف پر ← burned-limit · ابطال ← revoked", async () => {
    const { relayEnrollState } = await import("@/lib/melk-api/relay");
    expect(relayEnrollState({ ...base, enrolledAt: now }).state).toBe("enrolled");
    expect(relayEnrollState({ ...base, attemptCount: 3 }).state).toBe("burned-limit");
    expect(relayEnrollState({ ...base, revokedAt: now }).state).toBe("revoked");
  });

  test("E-4) کد منقضی ← expired · بدون کد ← absent", async () => {
    const { relayEnrollState } = await import("@/lib/melk-api/relay");
    expect(relayEnrollState({ ...base, enrollExpires: new Date(now.getTime() - 1000) }).state).toBe("expired");
    expect(relayEnrollState({ ...base, enrollCode: null }).state).toBe("absent");
  });

  test("E-5) getRelayCodeStatus — تازه‌ترین دستگاه صاحب کد (لایهٔ سرویس)", async () => {
    const { getRelayCodeStatus } = await import("@/lib/melk-api/relay");
    const code = await seedTestDevice("test-pn031c-e5");
    const st = await getRelayCodeStatus("test-pn031c-e5");
    expect(st.found).toBe(true);
    expect(st.deviceId).toBe("test-pn031c-e5");
    expect(st.code?.state).toBe("waiting");
    expect(st.code?.maxAttempts).toBe(3);
    // بدون deviceId — تازه‌ترین دستگاه صاحب کد
    const latest = await getRelayCodeStatus();
    expect(latest.found).toBe(true);
    expect(latest.code?.state).toBe("waiting");
    await cleanup(["test-pn031c-e5"]);
  });
});

// ───────────────────── F) روت‌ها + آینه‌ها + UI ─────────────────────

describe("PN-031-C · F) سازگاری ساختاری — روت تازه، روت سبک، UI، Poll", () => {
  test("F-1) روت code-status + آینهٔ v1 موجودند و روت سبک است (مرز مخزن P2)", () => {
    const route = readFileSync(join(REPO, "src/app/api/admin/relay/code-status/route.ts"), "utf8");
    expect(route).toContain('requireRole(request, "OWNER"');
    expect(route).toContain("getRelayCodeStatus");
    expect(route).toContain("no-store");
    expect(route).not.toContain('from "@/lib/db"');
    expect(route).not.toContain("@prisma/client");
    const mirror = readFileSync(join(REPO, "src/app/api/v1/admin/relay/code-status/route.ts"), "utf8");
    expect(mirror).toContain('export * from "../../../../admin/relay/code-status/route";');
  });

  test("F-2) روت poll — markRelayEnrollCompleted پس از احراز موفق صدا زده می‌شود", () => {
    const src = readFileSync(join(REPO, "src/app/api/mobile-relay/poll/route.ts"), "utf8");
    const iAuth = src.indexOf("if (!auth.ok)");
    const iMark = src.indexOf("await markRelayEnrollCompleted(auth.device!.deviceId)");
    expect(iMark).toBeGreaterThan(iAuth);
    expect(src.indexOf("return Response.json", iAuth + 10)).toBeLessThan(iMark + 200); // ردِ ناحراز پیش از فراخوانی
  });

  test("F-3) روت enroll — پاسخ حاوی maxAttempts=3 و یادداشت کد بخشنده", () => {
    const src = readFileSync(join(REPO, "src/app/api/admin/relay/enroll/route.ts"), "utf8");
    expect(src).toContain("maxAttempts: 3");
    expect(src).toContain("کد تا ۳ بار قابل استفاده است");
  });

  test("F-4) UI تنظیمات — ساده‌شدهٔ ن۰۵۴: فهرست دستگاه/کد بخشنده حذف؛ صفر راز", () => {
    const ui = readFileSync(join(REPO, "src/core/tiles/tiles/settings/RelaySetupSection.tsx"), "utf8");
    // PN-033 (شورا-ن۰۵۴): فهرست دستگاه‌ها و وضعیت کد از UI حذف شد — ثبت کد فقط توسط GLM
    expect(ui).not.toContain("بار قابل استفاده");
    expect(ui).not.toContain("در حال نصب — تلاش");
    expect(ui).not.toContain("کد سوخته");
    expect(ui).toContain("رلهٔ Termux");
    // صفر راز (بند ۸ گارد رله) — پابرجا
    expect(ui).not.toContain("deviceSecret");
  });

  test("F-5) اسکیمای بقای مهاجرت — سه فیلد تازه روی RelayDevice", () => {
    const schema = readFileSync(join(REPO, "prisma/schema.prisma"), "utf8");
    expect(schema).toMatch(/attemptCount\s+Int\s+@default\(0\)/);
    expect(schema).toMatch(/maxAttempts\s+Int\s+@default\(3\)/);
    expect(schema).toMatch(/lastAttemptAt\s+DateTime\?/);
    expect(schema).toContain("PN-031-C (شورا-ن۰۴۰) — کد بخشنده");
  });

  test("F-6) (ن۰۶۷→PN-047) مانیفست api-versioning — ۱۱۵ روت (+db-export) (+glm/probe +relay/health +owner-notes +integrations/melketun/sync +info text-file +crm/melketun/funnel) با code-status و relay/job/[id] (otp-burn حذف کامل · PN-034)", () => {
    const manifest = JSON.parse(readFileSync(join(REPO, "download/pn012/api-versioning.json"), "utf8"));
    // PN-035 (ن۰۵۷): +۱ روت relay/job/[id] · PN-038 (ن۰۶۳): +۱ glm/probe +۱ relay/health
    // PN-039 (ن۰۶۴/گام ۴): +۱ owner-notes/[entity]/[id] — یادداشت مالک M1/M2
    expect(manifest.totalRoutes).toBe(115); // PN-043: +integrations/melketun · PN-044: +integrations/melketun/sync · PN-045/فاز ۳: +api/v1/info (114) · PN-047: +crm/melketun/funnel (115)
    // ن۰۶۳: بازتولید مانیفست با مولد رسمی (generate-v1-aliases) — نام فیلد: aliasOf
    const key = (r: { aliasOf?: string; original?: string }) => r.aliasOf ?? r.original ?? "";
    expect(manifest.routes.some((r: { aliasOf?: string; original?: string }) => key(r) === "/api/admin/relay/code-status")).toBe(true);
    expect(manifest.routes.some((r: { aliasOf?: string; original?: string }) => key(r) === "/api/relay/job/[id]")).toBe(true);
    expect(manifest.routes.some((r: { aliasOf?: string; original?: string }) => key(r) === "/api/glm/probe")).toBe(true);
    expect(manifest.routes.some((r: { aliasOf?: string; original?: string }) => key(r) === "/api/relay/health")).toBe(true);
    // PN-039 (ن۰۶۴/گام ۴) — یادداشت مالک M1/M2 با آینهٔ v1
    expect(manifest.routes.some((r: { aliasOf?: string; original?: string }) => key(r) === "/api/owner-notes/[entity]/[id]")).toBe(true);
    expect(manifest.routes.some((r: { v1: string }) => r.v1 === "/api/v1/admin/otp-burn")).toBe(false);
  });

  test("F-7) relayOverview — فیلد enroll برای UI بدون راز", async () => {
    const src = readFileSync(join(REPO, "src/lib/melk-api/relay.ts"), "utf8");
    expect(src).toContain("enroll: relayEnrollState(d)");
    expect(src).not.toMatch(/enroll:[^}]*secret/);
  });
});
