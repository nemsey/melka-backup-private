/**
 * DIR-MISSING-REQ-001 — تست‌های رگرسیون دو ریشهٔ گم‌شدن کدهای فهرست درخواست (M2)
 * ---------------------------------------------------------------------------
 * اجرا: bun test tests/dir-missing-req-001.test.ts
 *
 * ریشهٔ A — تلهٔ بستن زودهنگام چرخهٔ کاتالوگ:
 *   منبع ۴۳۲ صفحه دارد؛ چرخهٔ هر تیک ۱۲ صفحه می‌رود و چون DB مقدس همیشه ≥۹۰٪
 *   منبع است، گارد پوشش چرخه را در صفحهٔ ۱۲ «کامل» جا می‌زد ⇒ کورگاه دائمی
 *   صفحه‌های ۱۳..۴۳۲. تست: shouldMarkCycleComplete فقط با رسیدن به پایان واقعی.
 *
 * ریشهٔ B — حل‌کنندهٔ توکن:
 *   آخرین نشستِ دیده‌شده جسد کهنهٔ خزانه (منقضی) را حمل می‌کرد ⇒ همهٔ چرخه‌ها
 *   401. تست: resolveBestArmToken تازه‌ترین توکنِ دارای exp آینده را برمی‌دارد،
 *   از نشست یا خزانه؛ خزانه را هم خوددرمانی می‌کند (بدون لمس refreshToken).
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

// env آزمون — عین package.json test script (Object.assign: سازگار با bun-types که NODE_ENV را readonly می‌بیند)
Object.assign(process.env, {
  NODE_ENV: process.env.NODE_ENV ?? "test",
  DATABASE_URL: process.env.DATABASE_URL ?? "file:/home/z/my-project/db/test.db",
  MELK_TOKEN_KEY: process.env.MELK_TOKEN_KEY ?? "test-only-key-not-a-real-secret",
});

import { shouldMarkCycleComplete, hasEnoughCoverage } from "@/lib/melk-api/arm-catalog";
import { resolveBestArmToken, invalidateArmTokenResolverCache } from "@/lib/melk-api/arm-token-resolver";
import { encryptSecret, decryptSecret } from "@/lib/auth/crypto";
import { armTokenExpiresAtMs } from "@/lib/auth/arm-token-exp";
import { PrismaClient } from "@prisma/client";

// ───────────────────────── ریشهٔ A — تصمیم بستن چرخه ─────────────────────────

describe("DIR-MISSING-REQ-001 · ریشهٔ A — shouldMarkCycleComplete", () => {
  test("تلهٔ قدیمی: بودجهٔ ۱۲ صفحه‌ای تمام شده اما منبع ۴۳۲ صفحه دارد ⇒ هرگز complete", () => {
    const decision = shouldMarkCycleComplete({
      lastCompletedPage: 12,
      endPage: 12,
      trueTotalPages: 432,
      coverageOk: true, // DB مقدس ≥ ۹۰٪ منبع — عین وضعیت زندهٔ ۱۴۰۵/۰۸/۲۵
    });
    expect(decision).toBe(false); // چرخه باز می‌ماند؛ تیک بعدی از صفحهٔ ۱۳ ادامه می‌دهد
  });

  test("رسیدن به پایان واقعی (۴۳۲ از ۴۳۲) با پوشش کافی ⇒ complete", () => {
    const decision = shouldMarkCycleComplete({
      lastCompletedPage: 432,
      endPage: 432,
      trueTotalPages: 432,
      coverageOk: true,
    });
    expect(decision).toBe(true);
  });

  test("پایان واقعی اما پوشش ناکافی (گارد P6530) ⇒ باز می‌ماند (رفتار پیشین حفظ)", () => {
    const decision = shouldMarkCycleComplete({
      lastCompletedPage: 408,
      endPage: 408,
      trueTotalPages: 408,
      coverageOk: false,
    });
    expect(decision).toBe(false);
  });

  test("پاسخ معیوب/ناشناختهٔ totalPages (۰) ⇒ عین رفتار پیشین تکیه بر گارد پوشش", () => {
    expect(
      shouldMarkCycleComplete({ lastCompletedPage: 12, endPage: 12, trueTotalPages: 0, coverageOk: true })
    ).toBe(true);
    expect(
      shouldMarkCycleComplete({ lastCompletedPage: 12, endPage: 12, trueTotalPages: 0, coverageOk: false })
    ).toBe(false);
  });

  test("منبع کوچک شده (lastCompleted از پایان واقعی گذشته) ⇒ پایان واقعی دیده می‌شود", () => {
    const decision = shouldMarkCycleComplete({
      lastCompletedPage: 425, // از tp جدید (۴۲۰) گذشته — منبع ریزش کرده
      endPage: 420,
      trueTotalPages: 420,
      coverageOk: true,
    });
    expect(decision).toBe(true);
  });

  test("ازسرگیری میانهٔ چرخه (صفحهٔ ۲۳ از ۴۳۲) ⇒ باز می‌ماند", () => {
    const decision = shouldMarkCycleComplete({
      lastCompletedPage: 23,
      endPage: 23,
      trueTotalPages: 432,
      coverageOk: true,
    });
    expect(decision).toBe(false);
  });
});

// گارد پوشش خودش عین پیشین — سانتی برای اطمینان
describe("DIR-MISSING-REQ-001 · گارد پوشش P6530 (بدون رگرسیون)", () => {
  test("۲۶٬۲۷۲ در برابر ۲۱٬۵۵۴ منبع ⇒ کافی", () => {
    expect(hasEnoughCoverage(26272, 21554)).toBe(true);
  });
  test("۷٬۳۹۸ در برابر ۲۰٬۳۹۲ منبع ⇒ ناکافی", () => {
    expect(hasEnoughCoverage(7398, 20392)).toBe(false);
  });
});

// ───────────────────────── ریشهٔ B — حل‌کنندهٔ توکن ─────────────────────────

/** ساخت JWT آزمایشی با exp دلخواه — فقط exp خوانده می‌شود (امضا ساختگی) */
function fakeJwt(expMs: number): string {
  const b64url = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ exp: Math.floor(expMs / 1000) })}.sig`;
}

const HOUR = 3_600_000;

describe("DIR-MISSING-REQ-001 · ریشهٔ B — resolveBestArmToken", () => {
  let db: PrismaClient;

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
  });

  afterAll(async () => {
    await db.$disconnect();
  });

  test("JWT آزمایشی ساخته‌شده exp را درست می‌دهد", () => {
    const exp = Date.now() + 24 * HOUR;
    expect(armTokenExpiresAtMs(fakeJwt(exp))).toBe(Math.floor(exp / 1000) * 1000);
  });

  test("سناریوی زندهٔ ۱۴۰۵/۰۸/۲۵: آخرین نشست جسد کهنه، نشست کهنه‌تر زنده — توکن زنده برد", async () => {
    invalidateArmTokenResolverCache();
    // پاک‌سازی نامزدهای قبلی همین تست
    await db.session.deleteMany({ where: { personnelCode: { startsWith: "dir-req-test" } } });

    const now = Date.now();
    // نشست «جدیدتر» با توکن منقضی (جسد خزانه — عین صبح امروز)
    await db.session.create({
      data: {
        tokenHash: `dir-req-test-exp-${now}`,
        personnelCode: "dir-req-test-exp",
        displayName: "تست",
        role: "OWNER",
        armTokenEnc: encryptSecret(fakeJwt(now - 135 * HOUR)),
        expiresAt: new Date(now + 10 * HOUR),
        lastSeenAt: new Date(now - 1 * 60_000),
      },
    });
    // نشست «قدیمی‌تر» با توکن زندهٔ ۲۴ساعته (عین نشست ۰۶:۱۸ امروز)
    const aliveToken = fakeJwt(now + 24 * HOUR);
    await db.session.create({
      data: {
        tokenHash: `dir-req-test-alive-${now}`,
        personnelCode: "dir-req-test-alive",
        displayName: "تست",
        role: "OWNER",
        armTokenEnc: encryptSecret(aliveToken),
        expiresAt: new Date(now + 10 * HOUR),
        lastSeenAt: new Date(now - 5 * 60_000),
      },
    });

    const resolved = await resolveBestArmToken(db);
    expect(resolved).not.toBeNull();
    expect(resolved!.source).toBe("session");
    expect(decryptSecret(encryptSecret(resolved!.token!))).toBe(resolved!.token);
    expect(armTokenExpiresAtMs(resolved!.token!)).not.toBeNull();
    expect(armTokenExpiresAtMs(resolved!.token!)! - now).toBeGreaterThan(12 * HOUR); // توکن ۲۴ساعته، نه جسد
    expect(resolved!.token).toBe(aliveToken);

    await db.session.deleteMany({ where: { personnelCode: { startsWith: "dir-req-test" } } });
  });

  test("خزانهٔ زنده بر نشستِ منقضی مقدم است؛ خزانهٔ خوددرمانی‌شده refreshToken را لمس نمی‌زند", async () => {
    invalidateArmTokenResolverCache();
    const now = Date.now();
    await db.session.deleteMany({ where: { personnelCode: { startsWith: "dir-req-test" } } });

    // نشست فقط جسد دارد
    await db.session.create({
      data: {
        tokenHash: `dir-req-test-exp2-${now}`,
        personnelCode: "dir-req-test-exp2",
        displayName: "تست",
        role: "OWNER",
        armTokenEnc: encryptSecret(fakeJwt(now - 100 * HOUR)),
        expiresAt: new Date(now + 10 * HOUR),
        lastSeenAt: new Date(now - 30_000),
      },
    });

    // خزانهٔ master با توکن زندهٔ کوتاه + refreshToken مقدس
    const vaultToken = fakeJwt(now + 6 * HOUR);
    const sacredRefresh = "sacred-refresh-token-keep-me";
    const masterRow = await db.armConnection.upsert({
      where: { ownerKey: "master" },
      create: {
        ownerKey: "master",
        personnelCode: "410031320",
        tokenEnc: encryptSecret(vaultToken),
        refreshTokenEnc: encryptSecret(sacredRefresh),
        status: "connected",
      },
      update: {
        tokenEnc: encryptSecret(vaultToken),
        refreshTokenEnc: encryptSecret(sacredRefresh),
        status: "connected",
      },
    });

    const resolved = await resolveBestArmToken(db);
    expect(resolved).not.toBeNull();
    expect(resolved!.token).toBe(vaultToken); // زندهٔ خزانه بر جسدِ نشست مقدم است
    expect(resolved!.vaultHealed).toBe(false); // برنده از خزانه آمد — درمان لازم نیست

    await db.armConnection.update({ where: { id: masterRow.id }, data: { status: "connected" } });
  });

  test("خوددرمانی خزانه: برندهٔ زنده از نشست OWNER ⇒ master فقط tokenEnc تازه می‌گیرد و refreshToken محفوظ می‌ماند", async () => {
    invalidateArmTokenResolverCache();
    const now = Date.now();
    await db.session.deleteMany({ where: { personnelCode: { startsWith: "dir-req-test" } } });

    // خزانهٔ master: جسد + refreshToken مقدس
    const sacredRefresh = "sacred-refresh-token-keep-me-2";
    const masterRow = await db.armConnection.upsert({
      where: { ownerKey: "master" },
      create: {
        ownerKey: "master",
        personnelCode: "410031320",
        tokenEnc: encryptSecret(fakeJwt(now - 135 * HOUR)),
        refreshTokenEnc: encryptSecret(sacredRefresh),
        status: "connected",
      },
      update: {
        tokenEnc: encryptSecret(fakeJwt(now - 135 * HOUR)),
        refreshTokenEnc: encryptSecret(sacredRefresh),
        status: "connected",
      },
    });

    // نشست OWNER با توکن زندهٔ ۳۰ساعته (تازه‌ترین exp)
    const aliveToken = fakeJwt(now + 30 * HOUR);
    await db.session.create({
      data: {
        tokenHash: `dir-req-test-heal-${now}`,
        personnelCode: "dir-req-test-heal",
        displayName: "تست",
        role: "OWNER",
        armTokenEnc: encryptSecret(aliveToken),
        expiresAt: new Date(now + 10 * HOUR),
        lastSeenAt: new Date(now - 10_000),
      },
    });

    const resolved = await resolveBestArmToken(db);
    expect(resolved).not.toBeNull();
    expect(resolved!.token).toBe(aliveToken);
    expect(resolved!.vaultHealed).toBe(true); // خزانه درمان شد

    // وارسی: tokenEnc خزانه = توکن زنده؛ refreshTokenEnc هنوز همان مقدس است
    const after = await db.armConnection.findUnique({ where: { ownerKey: "master" } });
    expect(after!.tokenEnc).not.toBeNull();
    expect(decryptSecret(after!.tokenEnc!)).toBe(aliveToken);
    expect(after!.refreshTokenEnc).not.toBeNull();
    expect(decryptSecret(after!.refreshTokenEnc!)).toBe(sacredRefresh);

    await db.session.deleteMany({ where: { personnelCode: { startsWith: "dir-req-test" } } });
    // خزانه را به حالت پیشین آزمون برنگردانیم — تست بعدی خودش upsert می‌کند
  });

  test("هیچ توکنی نیست ⇒ null (صرف‌نظر صادقانه)", async () => {
    invalidateArmTokenResolverCache();
    // ساخت resolver با DB بدون نشست/خزانهٔ زنده: پاک‌سازی کامل نامزدها
    const now = Date.now();
    await db.session.deleteMany({ where: { personnelCode: { startsWith: "dir-req-test" } } });
    const masters = await db.armConnection.findMany({ where: { ownerKey: "master" } });
    for (const m of masters) {
      await db.armConnection.update({ where: { id: m.id }, data: { tokenEnc: null, refreshTokenEnc: null } });
    }
    // همهٔ نشست‌های دیگر تست را هم موقتاً جسد کن (فقط تست خودمان — با exp گذشته)
    const realSessions = await db.session.findMany({ where: { revoked: false } });
    const saved: Array<{ id: string; enc: string | null }> = [];
    for (const s of realSessions) {
      saved.push({ id: s.id, enc: s.armTokenEnc });
      await db.session.update({ where: { id: s.id }, data: { armTokenEnc: null } });
    }
    try {
      const resolved = await resolveBestArmToken(db);
      expect(resolved).toBeNull();
    } finally {
      for (const s of saved) {
        await db.session.update({ where: { id: s.id }, data: { armTokenEnc: s.enc } });
      }
      void now;
    }
  });
});
