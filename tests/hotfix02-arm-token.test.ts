/**
 * تست‌های HOTFIX-02 — حذف اشتراک توکن ARM بین کاربران (SEC-3)
 * ------------------------------------------------------
 * پوشش:
 *  ۱) جداسازی per-user: نشست B هرگز توکن A را نمی‌بیند (حتی با وجود توکن در A)
 *  ۲) logout کاربر A توکن A را پاک می‌کند، نشست B دست‌نخورده می‌ماند
 *  ۳) POST /api/sync با نشستِ بدون توکن ARM → 412 (نه استفاده از توکن دیگری)
 *  ۴) اسکیما: SyncState دیگر ستون armTokenEnc ندارد (تضمین سطح مدل)
 *  ۵) سورس: هیچ مسیری توکن ARM را از SyncState نمی‌خواند
 *  ۶) AuditLog: بازیگر sync با personnelCode ثبت می‌شود
 */

import { describe, expect, test, afterAll } from "bun:test";
import { createHash } from "crypto";

const { db } = await import("@/lib/db");

// نشست‌های موقت تست
const created: string[] = [];
async function makeSession(personnelCode: string, withArmToken: boolean) {
  const { createSession } = await import("@/lib/auth/session");
  const { token, context } = await createSession(
    { personnelCode, displayName: `تست ${personnelCode}`, role: personnelCode === "OWNER" ? "OWNER" : "CONSULTANT" },
    { ip: "127.0.0.1" },
    withArmToken
      ? { accessToken: `arm-token-of-${personnelCode}`, refreshToken: `refresh-of-${personnelCode}`, userType: "realtor" }
      : null
  );
  created.push(token);
  return { token, context };
}

afterAll(async () => {
  for (const t of created) {
    await db.session.deleteMany({ where: { tokenHash: createHash("sha256").update(t).digest("hex") } }).catch(() => undefined);
  }
  await db.$disconnect();
});

// ==========================================================================
// ۱) جداسازی per-user
// ==========================================================================

describe("HOTFIX-02 — جداسازی توکن ARM بین کاربران", () => {
  test("نشست B (بدون توکن) هرگز توکن A را نمی‌بیند — حتی وقتی A توکن دارد", async () => {
    const a = await makeSession("910001", true); // کاربر A با توکن ARM
    const b = await makeSession("910002", false); // کاربر B بدون توکن

    const { validateSession } = await import("@/lib/auth/session");
    const ctxB = await validateSession(b.token);
    expect(ctxB).not.toBeNull();
    expect(ctxB!.armTokens).toBeNull(); // B هیچ توکنی ندارد — نه خودش نه مال A

    const ctxA = await validateSession(a.token);
    expect(ctxA!.armTokens?.accessToken).toBe("arm-token-of-910001"); // A فقط توکن خودش
  });

  test("logout کاربر A: توکن A پاک می‌شود، نشست B دست‌نخورده می‌ماند", async () => {
    const a = await makeSession("910003", true);
    const b = await makeSession("910004", true);

    const { revokeSession } = await import("@/lib/auth/session");
    const revoked = await revokeSession(a.token, "USER_LOGOUT");
    expect(revoked).toBe(true);

    const rowA = await db.session.findUnique({ where: { tokenHash: createHash("sha256").update(a.token).digest("hex") } });
    const rowB = await db.session.findUnique({ where: { tokenHash: createHash("sha256").update(b.token).digest("hex") } });

    expect(rowA?.revoked).toBe(true);
    expect(rowA?.armTokenEnc).toBeNull(); // توکن A پاک شد
    expect(rowA?.armRefreshTokenEnc).toBeNull();
    expect(rowB?.revoked).toBe(false); // B دست‌نخورده
    expect(rowB?.armTokenEnc).not.toBeNull(); // توکن B سر جایش است
  });

  test("POST /api/sync با نشست بدون توکن ARM → 412 (بدون هیچ fallback)", async () => {
    const { NextRequest } = await import("next/server");
    const b = await makeSession("910005", false);

    const route = await import("@/app/api/sync/route");
    const req = new NextRequest("http://localhost/api/sync", {
      method: "POST",
      headers: { authorization: `Bearer ${b.token}` },
    });
    const res = await route.POST(req);
    expect(res.status).toBe(412); // PRECONDITION_FAILED — نه 200 با داده دیگران
    const body = (await res.json()) as { ok: boolean; code: string };
    expect(body.ok).toBe(false);
    expect(body.code).toBe("PRECONDITION_FAILED");
  });

  test("POST /api/sync با نشست A فقط توکن A را مصرف می‌کند (مسیر 412/200، نه توکن B)", async () => {
    // کاربر A بدون توکن + کاربر B با توکن → A همچنان 412 می‌گیرد (توکن B استفاده نمی‌شود)
    const aNoToken = await makeSession("910006", false);
    await makeSession("910007", true); // B با توکن — نباید به A کمک کند

    const { NextRequest } = await import("next/server");
    const route = await import("@/app/api/sync/route");
    const req = new NextRequest("http://localhost/api/sync", {
      method: "POST",
      headers: { authorization: `Bearer ${aNoToken.token}` },
    });
    const res = await route.POST(req);
    expect(res.status).toBe(412);
  });
});

// ==========================================================================
// ۴) اسکیما: SyncState بدون راز
// ==========================================================================

describe("HOTFIX-02 — اسکیمای بدون راز در SyncState", () => {
  test("ستون armTokenEnc از SyncState حذف شده (رکورد فقط متادیتا دارد)", async () => {
    const state = await db.syncState.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    });
    const keys = Object.keys(state);
    expect(keys).not.toContain("armTokenEnc");
    expect(keys).toContain("lastSyncedAt");
    expect(keys).toContain("summaryJson");
  });

  test("کلیدهای رمزنگاری‌شده فقط در Session (per-user) هستند", async () => {
    const schema = await Bun.file("prisma/schema.prisma").text();
    const syncStateBlock = schema.split("model SyncState")[1]?.split("}")[0] ?? "";
    expect(syncStateBlock.includes("armTokenEnc")).toBe(false);
    const sessionBlock = schema.split("model Session")[1]?.split("\n}")[0] ?? "";
    expect(sessionBlock.includes("armTokenEnc")).toBe(true);
  });
});

// ==========================================================================
// ۵) سورس‌اسکن: هیچ مسیر خواندن توکن مشترک باقی نمانده
// ==========================================================================

describe("HOTFIX-02 — سورس بدون خواندن توکن ARM از SyncState", () => {
  test("هیچ فایلی armToken را از SyncState نمی‌خواند", async () => {
    const glob = new Bun.Glob("src/**/*.{ts,tsx}");
    const offenders: string[] = [];
    for (const file of glob.scanSync({ cwd: process.cwd() })) {
      let text = await Bun.file(file).text();
      // حذف کامنت‌ها (تست روی «کد» است، نه مستندات)
      text = text
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      // الگوی خواندن توکن از syncState (به هر شکلی)
      if (/syncState\.\w*armToken/i.test(text) || /state\??\.armTokenEnc/.test(text)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("instrumentation: تایمر پس‌زمینه فقط با فعال‌سازی صریح روشن می‌شود", async () => {
    const text = await Bun.file("src/instrumentation.ts").text();
    expect(text).toContain('MELK_BACKGROUND_SYNC === "enabled"');
    // در مسیر پس‌زمینه فقط از نشست زنده با توکن خودش استفاده می‌شود
    expect(text).toContain("sessionToArmTokens");
    expect(text).not.toContain("new PrismaClient()"); // (پیش‌نیاز HOTFIX-06 هم عینی شد)
  });
});

// ==========================================================================
// ۶) AuditLog با personnelCode
// ==========================================================================

describe("HOTFIX-02 — حسابرسی sync با بازیگر", () => {
  test("ثبت audit برای DATA_SYNC شامل personnelCode است", async () => {
    const { audit } = await import("@/lib/auth/session");
    await audit("DATA_SYNC", "910008", "tx=0; ex=0; in=0");
    const last = await db.auditLog.findFirst({ where: { action: "DATA_SYNC", actor: "910008" }, orderBy: { createdAt: "desc" } });
    expect(last).not.toBeNull();
    expect(last!.actor).toBe("910008");
    await db.auditLog.delete({ where: { id: last!.id } }).catch(() => undefined);
  });
});
