/**
 * PN-033 — گارد تمیزکاری نهایی (شورای عالی ملکا · جلسهٔ فوق‌العاده ۰۵۴ · ۱۴۰۵/۰۷/۲۶)
 * «قفل از دوران جنگ مانده. الآن که تونل زنده است، این قفل باید برود.»
 * PN-034 (شورا-ن۰۵۵): بخش C به واقعیت تازه به‌روزرسانی شد — قانون مالک:
 * «صفر محدودیت اتصال» + درس ۰۵۴: «پاکسازی بیش از حد، به اندازهٔ ناکافی بد است»
 *
 * A) فیوز — خاموشی دائمی: MELK_ARM_CIRCUIT_DISABLED=1 + اولویت تست صریح + DB خالی از قفل
 * B) env — دوران Worker پایان یافت: صفر MELK_ARM_PROXY_URL / MELK_RELAY_ALT_URL + فیوز خاموش
 * C) UI — (ن۰۵۵) تولید کد نصب احیا · ورود مجدد حذف کامل · ARM مستقیم احیا
 * D) escrow — همگام‌سازی سه‌لایه: کلید تازه جای کلیدهای کهنه
 *
 * اجرا: bun test tests/pn033-cleanup.test.ts
 */
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = join(import.meta.dir, "..");
const read = (p: string) => readFileSync(join(REPO, p), "utf8");
const readJson = (p: string) => JSON.parse(read(p));

// ───────────────────── A) فیوز — خاموشی دائمی ─────────────────────

describe("PN-033 · A) فیوز قطع‌کننده — خاموشی دائمی (شورا-ن۰۵۴)", () => {
  test("A-1) MELK_ARM_CIRCUIT_DISABLED=1 ⇒ فیوز خاموش — درگاه همیشه باز", async () => {
    const { isCircuitBreakerEnabled, checkCircuit } = await import("@/lib/melk-api/circuit-breaker");
    const prev = process.env.MELK_ARM_CIRCUIT_DISABLED;
    process.env.MELK_ARM_CIRCUIT_DISABLED = "1";
    try {
      expect(isCircuitBreakerEnabled()).toBe(false);
      const gate = await checkCircuit("arus-api.melketabriz.ir");
      expect(gate.allowed).toBe(true);
      expect(gate.retryInMs).toBe(-1);
    } finally {
      if (prev === undefined) delete process.env.MELK_ARM_CIRCUIT_DISABLED;
      else process.env.MELK_ARM_CIRCUIT_DISABLED = prev;
    }
  });

  test("A-2) تست صریح فیوز (MELK_CIRCUIT_BREAKER=on) بر خاموشی دائمی اولویت دارد — B-5 پابرجا", async () => {
    const { isCircuitBreakerEnabled } = await import("@/lib/melk-api/circuit-breaker");
    const prevD = process.env.MELK_ARM_CIRCUIT_DISABLED;
    const prevC = process.env.MELK_CIRCUIT_BREAKER;
    process.env.MELK_ARM_CIRCUIT_DISABLED = "1";
    process.env.MELK_CIRCUIT_BREAKER = "on";
    try {
      expect(isCircuitBreakerEnabled()).toBe(true);
    } finally {
      if (prevD === undefined) delete process.env.MELK_ARM_CIRCUIT_DISABLED;
      else process.env.MELK_ARM_CIRCUIT_DISABLED = prevD;
      if (prevC === undefined) delete process.env.MELK_CIRCUIT_BREAKER;
      else process.env.MELK_CIRCUIT_BREAKER = prevC;
    }
  });

  test("A-3) DB زنده — صفر قفل فعال روی میزبانهای واقعی ملک تبریز", async () => {
    const { PrismaClient } = await import("@prisma/client");
    const db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });
    try {
      const now = new Date();
      const hosts = ["arus-api.melketabriz.ir", "pm-api.melketabriz.ir", "gap-api.melketabriz.ir"];
      // ناوردای پایدار: هیچ قفل سخت/خنک‌سازی فعالی روی مسیر مالک نیست
      const locked = await db.circuitBreakerState.count({
        where: { target: { in: hosts }, OR: [{ lockUntil: { gt: now } }, { nextAttemptAt: { gt: now } }] },
      });
      expect(locked).toBe(0);
      // دستگاه‌های ابطال‌شده نیز پاک شده‌اند (فقط فعال‌ها می‌مانند)
      const revoked = await db.relayDevice.count({ where: { revokedAt: { not: null } } });
      expect(revoked).toBe(0);
      // حداقل یک دستگاه فعال (رلهٔ Termux مالک)
      const active = await db.relayDevice.count({ where: { revokedAt: null, lastSeenAt: { not: null } } });
      expect(active).toBeGreaterThanOrEqual(1);
    } finally {
      await db.$disconnect();
    }
  });

  test("A-4) شاهد پاکسازی — circuit-cleared.json با VERDICT موفق", () => {
    const w = readJson("download/pn033/circuit-cleared.json");
    expect(w.verdict).toBe("CIRCUIT-CLEARED");
    expect(w.after.count).toBe(0);
    expect(w.gateVerification.allAllowed).toBe(true);
  });
});

// ───────────────────── B) env — پایان دوران Worker ─────────────────────

describe("PN-033 · B) env — پاکسازی کلیدهای دوران Worker", () => {
  test("B-1) env.platform.json — صفر کلید Worker + فیوز خاموش + حالت رله", () => {
    const env = readJson("env.platform.json");
    expect(env).not.toHaveProperty("MELK_ARM_PROXY_URL");
    expect(env).not.toHaveProperty("MELK_RELAY_ALT_URL");
    expect(env.MELK_ARM_RELAY_MODE).toBe("mobile");
    expect(env.MELK_ARM_CIRCUIT_DISABLED).toBe("1");
  });

  test("B-2) env.platform.json.example — همگام با فایل زنده", () => {
    const ex = read("env.platform.json.example");
    expect(ex).not.toContain('"MELK_ARM_PROXY_URL"');
    expect(ex).not.toContain('"MELK_RELAY_ALT_URL"');
    expect(ex).toContain('"MELK_ARM_CIRCUIT_DISABLED"');
    expect(ex).toContain('"MELK_ARM_RELAY_MODE"');
    expect(JSON.parse(ex)).toBeTruthy(); // JSON معتبر (خط ولگرد قبلی نمونه پاک شد)
  });

  test("B-3) اسکرو سه‌لایه — دو لایهٔ متنی همگام (کلید تازه جای کهنه)", () => {
    for (const p of ["db/.runtime/boot-secrets.json", "upload/.runtime/boot-secrets.json"]) {
      const esc = readJson(p);
      expect(esc).not.toHaveProperty("MELK_ARM_PROXY_URL");
      expect(esc).not.toHaveProperty("MELK_RELAY_ALT_URL");
      expect(esc.MELK_ARM_CIRCUIT_DISABLED).toBe("1");
      expect(esc.MELK_ARM_RELAY_MODE).toBe("mobile");
    }
  });

  test("B-4) BOOT_SECRET_KEYS — کلید حیاتی تفته ثبت، کلیدهای Worker حذف", async () => {
    const { BOOT_SECRET_KEYS } = await import("@/lib/auth/boot-secrets");
    const keys = BOOT_SECRET_KEYS as readonly string[];
    expect(keys).toContain("MELK_ARM_CIRCUIT_DISABLED");
    expect(keys).not.toContain("MELK_ARM_PROXY_URL");
    expect(keys).not.toContain("MELK_RELAY_ALT_URL");
  });

  test("B-5) شاهد env-cleanup.json موجود و PASS", () => {
    const w = readJson("download/pn033/env-cleanup.json");
    expect(w.verdict).toBe("ENV-CLEAN");
  });
});

// ───────────────────── C) UI — (ن۰۵۵) سه بازگردانی + یک حذف ─────────────────────

describe("PN-033 · C) UI — قانون مالک: صفر محدودیت (به‌روزرسانی PN-034 · ن۰۵۵)", () => {
  const relay = read("src/core/tiles/tiles/settings/RelaySetupSection.tsx");
  const melk = read("src/core/tiles/tiles/settings/MelkTabrizConnectionSection.tsx");

  test("C-1) (ن۰۵۵) رلهٔ Termux — «تولید کد نصب» احیا شد (مسیر اثبات‌شدهٔ PN-031-I)؛ صفر APK/QR/مرورگری/فهرست دستگاه", () => {
    expect(relay).toContain("رلهٔ Termux");
    expect(relay).toContain("تولید کد نصب");
    expect(relay).toContain('"/api/admin/relay/enroll"');
    expect(relay).toContain("pkg install -y openssl-tool");
    expect(relay).toContain("تست تونل");
    expect(relay).not.toContain("melka-relay.apk");
    expect(relay).not.toContain("apkQr");
    expect(relay).not.toContain("browser-poll");
    expect(relay).not.toContain("activeDevices.map");
  });

  test("C-2) (ن۰۵۵) «ورود مجدد به ملک تبریز» + مکانیزم OTP تک‌بارة PN-029 — حذف کامل سه‌لایه", () => {
    // بخش UI + روت سوزاندن + ماژول قفل — هر سه مرده‌اند (قانون صفر-محدودیت)
    expect(existsSync(join(REPO, "src/core/tiles/tiles/settings/OtpReloginSection.tsx"))).toBe(false);
    expect(existsSync(join(REPO, "src/app/api/admin/otp-burn/route.ts"))).toBe(false);
    expect(existsSync(join(REPO, "src/app/api/v1/admin/otp-burn/route.ts"))).toBe(false);
    expect(existsSync(join(REPO, "src/lib/auth/otp-lock.ts"))).toBe(false);
    // جدول OtpRateLimit هم از اسکیمای زنده حذف شد
    const schema = read("prisma/schema.prisma");
    expect(schema).not.toContain("model OtpRateLimit");
  });

  test("C-3) (ن۰۵۵) پیکرهٔ اتصال — «اتصال به حساب شخصی ARM» احیا (embedded · فرم مستقیم بدون قفل) + رله + PM", () => {
    expect(melk).not.toContain("حالت آفلینی ملک تبریز فعال است");
    expect(melk).not.toContain("فیوز قطع‌کنندهٔ اتصال");
    expect(melk).not.toContain("IP عمومی کانتینر");
    expect(melk).not.toContain("OtpReloginSection");
    expect(melk).toContain("<ArmConnectionSection embedded />");
    expect(melk).toContain('s.service === "ARM_API" || s.service === "ARM_PUBLIC" || s.service === "PM_API" || s.service === "MELK_PUBLIC_API"');
    expect(melk).toContain("<RelaySetupSection />");
  });

  test("C-4) شاهد پاکسازی DB — relay-devices-cleanup.json با فقط ۱ دستگاه", () => {
    const w = readJson("download/pn033/relay-devices-cleanup.json");
    expect(w.verdict).toBe("CLEANUP-OK");
    expect(w.after.deviceCount).toBe(1);
    expect(w.deleted.count).toBeGreaterThan(10); // «۱۰+ دستگاه مرده» سند ن۰۵۴
  });
});

// ───────────────────── D) کتابخانهٔ فیوز پابرجا ─────────────────────

describe("PN-033 · D) منطق فیوز دست‌نخورده (فقط مهار شده)", () => {
  test("D-1) قواعد خالص — ۳ شکست = قفل ۲۴ ساعته؛ موفقیت = بازنشانی", async () => {
    const { breakerAfterFailure, breakerGate } = await import("@/lib/melk-api/circuit-breaker");
    const now = new Date("2026-10-16T10:00:00Z");
    const s1 = breakerAfterFailure(null, now);
    expect(s1.consecutiveFailures).toBe(1);
    // (ن۰۵۵) اصلاح تایپ نهفته: BreakerSnapshot کامل ساخته می‌شود (خطای TS2345 پنهان از دوران ۰۵۴)
    const s3 = { target: "x", lastFailureAt: now, lastSuccessAt: null, ...s1, consecutiveFailures: 3 };
    const s = breakerAfterFailure(s3, now);
    expect(s.lockUntil?.getTime()).toBe(now.getTime() + 24 * 3600 * 1000);
    expect(breakerGate({ target: "x", ...s, lastFailureAt: now, lastSuccessAt: null } as never, now).reason).toBe("locked");
  });
});
