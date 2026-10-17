/**
 * تست‌های PN-029 — بازیابی اتصال به سامانه‌های ملک تبریز (سند شورا-ن۰۳۳)
 * ---------------------------------------------------------------------------
 * پوشش تستی مصوب مرحلهٔ ۹:
 *   A) تشخیص/حالت آفلینی (۶) — گاردهای client/probeGet + پرچم MELK_ARM_OFFLINE
 *   B) فیوز قطع‌کننده (۵) — backoff ۶/۱۲/۲۴س · قفل ۲۴س پس از ۳ شکست · درگاه
 *   C) (ن۰۵۵) صفر محدودیت — مکانیزم تک‌بارة PN-029 حذف کامل (PN-034)
 *   D) گارد IP کانتینر (۳) — تشخیص/ثبت + رجیستری Worker در حالت آفلینی
 *   E) دسته‌بندی/نمایش (۴) — وضعیت آفلاین provider + حذف بخش عمومی از تنظیمات + پیامهای دقیق
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

// ───────────────────── A) تشخیص — حالت آفلینی (۶) ─────────────────────

describe("PN-029 · A) حالت آفلینی ملک تبریز (مرحلهٔ ۲)", () => {
  const saved = process.env.MELK_ARM_OFFLINE;
  afterAll(() => {
    if (saved === undefined) delete process.env.MELK_ARM_OFFLINE;
    else process.env.MELK_ARM_OFFLINE = saved;
  });

  test("A-1) پرچم MELK_ARM_OFFLINE — مقادیر پذیرفته و پیش‌فرض خاموش", async () => {
    const { isArmOfflineMode } = await import("@/lib/melk-api/offline-mode");
    delete process.env.MELK_ARM_OFFLINE;
    expect(isArmOfflineMode()).toBe(false);
    process.env.MELK_ARM_OFFLINE = "1";
    expect(isArmOfflineMode()).toBe(true);
    process.env.MELK_ARM_OFFLINE = "true";
    expect(isArmOfflineMode()).toBe(true);
    process.env.MELK_ARM_OFFLINE = "0";
    expect(isArmOfflineMode()).toBe(false);
    process.env.MELK_ARM_OFFLINE = "";
    expect(isArmOfflineMode()).toBe(false);
  });

  test("A-2) عبور از گارد فقط با صراحت (bypass) — هیچ مسیر خودکاری عبور نمی‌کند", async () => {
    const { offlineBypassAllowed } = await import("@/lib/melk-api/offline-mode");
    expect(offlineBypassAllowed(undefined)).toBe(false);
    expect(offlineBypassAllowed(false)).toBe(false);
    expect(offlineBypassAllowed(true)).toBe(true);
  });

  test("A-3) پیام حالت آفلینی — فارسی، دقیق، با شناسهٔ پرونده", async () => {
    const { offlineModeMessage } = await import("@/lib/melk-api/offline-mode");
    const msg = offlineModeMessage();
    expect(msg).toContain("PN-029");
    expect(msg).toContain("آفلینی");
    expect(msg.length).toBeGreaterThan(50);
  });

  test("A-4) armCall در حالت آفلینی — پیش از هر شبکه، خطای ARM_OFFLINE (صفر تلاش خودکار)", async () => {
    const { armCall } = await import("@/lib/melk-api/client");
    process.env.MELK_ARM_OFFLINE = "1";
    const originalFetch = globalThis.fetch;
    let networkCalled = false;
    globalThis.fetch = (() => { networkCalled = true; return Promise.reject(new Error("نباید شبکه صدا زده شود")); }) as unknown as unknown as typeof fetch;
    try {
      await armCall({ path: "x", baseUrl: "https://arus-api.melketabriz.ir/api/apm/", timeoutMs: 100, maxRetries: 0 });
      throw new Error("باید خطا می‌داد");
    } catch (e) {
      const err = e as { code?: string };
      expect(err.code).toBe("ARM_OFFLINE");
      expect(networkCalled).toBe(false); // گارد پیش از fetch
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.MELK_ARM_OFFLINE;
    }
  });

  test("A-5) probeGet در حالت آفلینی — نشانگر offlineMode بدون هیچ شبکه‌ای", async () => {
    const { probeGet } = await import("@/lib/melk-api/client");
    process.env.MELK_ARM_OFFLINE = "1";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => Promise.reject(new Error("نباید شبکه صدا زده شود"))) as unknown as typeof fetch;
    try {
      const r = await probeGet("https://pm-api.melketabriz.ir/api/", "public/portalInfo", 1000);
      expect(r.offlineMode).toBe(true);
      expect(r.httpStatus).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.MELK_ARM_OFFLINE;
    }
  });

  test("A-6) probeGet با bypass (دکمهٔ تست مالک) — از گارد آفلاین عبور می‌کند و پاسخ می‌گیرد", async () => {
    const { probeGet } = await import("@/lib/melk-api/client");
    process.env.MELK_ARM_OFFLINE = "1";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("{}", { status: 200 })) as unknown as typeof fetch;
    try {
      const r = await probeGet("https://pn029-bypass-test.example/api/", "x", 1000, { bypassOffline: true });
      expect(r.offlineMode).toBeUndefined();
      expect(r.httpStatus).toBe(200);
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.MELK_ARM_OFFLINE;
    }
  });
});

// ───────────────────── B) فیوز قطع‌کننده (۵) ─────────────────────

describe("PN-029 · B) فیوز قطع‌کنندهٔ Retry هوشمند (مرحلهٔ ۶)", () => {
  test("B-1) کلید فیوز از baseUrl — فقط میزبان استخراج می‌شود", async () => {
    const { breakerKeyFromBaseUrl } = await import("@/lib/melk-api/circuit-breaker");
    expect(breakerKeyFromBaseUrl("https://arus-api.melketabriz.ir/api/apm/")).toBe("arus-api.melketabriz.ir");
    expect(breakerKeyFromBaseUrl("https://pm-api.melketabriz.ir/api/")).toBe("pm-api.melketabriz.ir");
    expect(breakerKeyFromBaseUrl("arus-api.melketabriz.ir/api/apm/")).toBe("arus-api.melketabriz.ir");
  });

  test("B-2) نردبان backoff — شکست ۱/۲/۳ ⇒ ۶ ساعت/۱۲ ساعت/۲۴ ساعت", async () => {
    const { computeNextAttemptAt } = await import("@/lib/melk-api/circuit-breaker");
    const now = new Date("2026-10-11T08:00:00Z");
    const h6 = computeNextAttemptAt(1, now).getTime() - now.getTime();
    const h12 = computeNextAttemptAt(2, now).getTime() - now.getTime();
    const h24 = computeNextAttemptAt(3, now).getTime() - now.getTime();
    const h24cap = computeNextAttemptAt(9, now).getTime() - now.getTime();
    expect(h6).toBe(6 * 60 * 60 * 1000);
    expect(h12).toBe(12 * 60 * 60 * 1000);
    expect(h24).toBe(24 * 60 * 60 * 1000);
    expect(h24cap).toBe(24 * 60 * 60 * 1000); // سقف نردبان
  });

  test("B-3) سه شکست پیاپی ⇒ قفل سخت ۲۴ ساعته (Circuit Breaker)", async () => {
    const { breakerAfterFailure } = await import("@/lib/melk-api/circuit-breaker");
    const now = new Date("2026-10-11T08:00:00Z");
    const after1 = breakerAfterFailure(null, now);
    const after2 = breakerAfterFailure({ target: "t", consecutiveFailures: 1, lastFailureAt: null, lastSuccessAt: null, nextAttemptAt: null, lockUntil: null }, now);
    const after3 = breakerAfterFailure({ target: "t", consecutiveFailures: 2, lastFailureAt: null, lastSuccessAt: null, nextAttemptAt: null, lockUntil: null }, now);
    expect(after1.consecutiveFailures).toBe(1);
    expect(after1.lockUntil).toBeNull();
    expect(after2.consecutiveFailures).toBe(2);
    expect(after2.lockUntil).toBeNull();
    expect(after3.consecutiveFailures).toBe(3);
    expect(after3.lockUntil?.getTime()).toBe(now.getTime() + 24 * 60 * 60 * 1000); // قفل ۲۴س
    expect(after3.nextAttemptAt?.getTime()).toBe(now.getTime() + 24 * 60 * 60 * 1000);
  });

  test("B-4) داوری درگاه — قفل/خنک‌ساز/باز (جدول تصمیم)", async () => {
    const { breakerGate } = await import("@/lib/melk-api/circuit-breaker");
    const now = new Date("2026-10-11T08:00:00Z");
    const base = { target: "t", lastFailureAt: null, lastSuccessAt: null };
    expect(breakerGate(null, now).allowed).toBe(true); // بدون رکورد = باز
    expect(breakerGate({ ...base, consecutiveFailures: 0, nextAttemptAt: null, lockUntil: null }, now).allowed).toBe(true);
    const locked = breakerGate({ ...base, consecutiveFailures: 3, nextAttemptAt: null, lockUntil: new Date(now.getTime() + 3 * 3600_000) }, now);
    expect(locked.allowed).toBe(false);
    expect(locked.reason).toBe("locked");
    expect(locked.retryInMs).toBe(3 * 3600_000);
    const cooling = breakerGate({ ...base, consecutiveFailures: 1, nextAttemptAt: new Date(now.getTime() + 90 * 60_000), lockUntil: null }, now);
    expect(cooling.allowed).toBe(false);
    expect(cooling.reason).toBe("cooldown");
    const expired = breakerGate({ ...base, consecutiveFailures: 1, nextAttemptAt: new Date(now.getTime() - 1000), lockUntil: null }, now);
    expect(expired.allowed).toBe(true); // مهلت گذشته = باز
  });

  test("B-5) رفت‌وبرگشت DB — شکست ثبت/قفل می‌شود، موفقیت بازنشانی می‌کند (fail-open)", async () => {
    const { recordBreakerFailure, recordBreakerSuccess, checkCircuit, breakerKeyFromBaseUrl, isCircuitBreakerEnabled } = await import("@/lib/melk-api/circuit-breaker");
    // فیوز در محیط تست خاموش است — برای این رفت‌وبرگشت صریحاً روشن می‌شود
    process.env.MELK_CIRCUIT_BREAKER = "on";
    expect(isCircuitBreakerEnabled()).toBe(true);
    const target = `test-pn029-${Date.now()}.example`;
    // سه شکست پیاپی
    for (let i = 0; i < 3; i++) await recordBreakerFailure(target);
    const gate = await checkCircuit(target);
    expect(gate.allowed).toBe(false);
    expect(gate.reason).toBe("locked");
    // موفقیت — بازنشانی کامل
    await recordBreakerSuccess(target);
    const gate2 = await checkCircuit(target);
    expect(gate2.allowed).toBe(true);
    // کلید میزبان از baseUrl یکسان است
    expect(breakerKeyFromBaseUrl("https://x.example/a/")).toBe("x.example");
    // بازگردانی به حالت تست (خاموش) برای بقیهٔ جلسه
    delete process.env.MELK_CIRCUIT_BREAKER;
    expect(isCircuitBreakerEnabled()).toBe(false);
  });
});

// ───────────────────── C) (ن۰۵۵) مکانیزم OTP تک‌بارة PN-029 — حذف کامل ─────────────────────

describe("PN-029 · C) (ن۰۵۵) قانون مالک: صفر محدودیت اتصال — مکانیزم تک‌بارة مرده", () => {
  test("C-1) (ن۰۵۵) ماژول قفل + جدول DB — هر دو حذف کامل شدند (PN-034)", () => {
    // سند ن۰۵۵: «هیچ محدودیتی برای اتصال به سامانه‌ها باقی نماند» —
    // ماژول otp-lock.ts، روت otp-burn و مدل OtpRateLimit همگی برافتادند
    expect(existsSync("src/lib/auth/otp-lock.ts")).toBe(false);
    expect(existsSync("src/app/api/admin/otp-burn/route.ts")).toBe(false);
    const schema = readFileSync("prisma/schema.prisma", "utf8");
    expect(schema).not.toContain("model OtpRateLimit");
  });

  test("C-2) (ن۰۵۵) مسیر ورود مستقیم — صفر قفل: request-otp بدون checkRate/otp-lock", () => {
    const route = readFileSync("src/app/api/auth/request-otp/route.ts", "utf-8");
    expect(route).not.toContain("checkRate");
    expect(route).not.toContain("otp-lock");
    expect(route).not.toContain("OTP_LOCKED");
    // فراخوانی واقعی سامانه پابرجاست
    expect(route).toContain("provider.requestOtp");
  });

  test("C-3) (ن۰۵۵) ناوردای جدول — OtpRateLimit در DB زنده وجود ندارد", async () => {
    const { db } = await import("@/lib/db");
    const tables = await db.$queryRawUnsafe<{ name: string }[]>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='OtpRateLimit'"
    );
    expect(tables.length).toBe(0);
  });
});

// ───────────────────── D) گارد IP کانتینر (۳) ─────────────────────

describe("PN-029 · D) گارد IP کانتینر (مرحلهٔ ۷)", () => {
  test("D-1) تشخیص IP — منبع اصلی و پشتیبان (بدون وابستگی به گارد آفلینی)", async () => {
    const { detectContainerIp } = await import("@/lib/melk-api/container-ip");
    const originalFetch = globalThis.fetch;
    try {
      // منبع اصلی fail → پشتیبان جواب می‌دهد
      globalThis.fetch = (async (url: string | URL | Request) => {
        if (String(url).includes("ifconfig.me")) return new Response("503 unavailable", { status: 503 });
        return new Response("203.0.113.7", { status: 200 });
      }) as unknown as unknown as typeof fetch;
      const r = await detectContainerIp();
      expect(r.source).toBe("api.ipify.org");
      // هر دو fail → null با source=none (fail-open)
      globalThis.fetch = (async () => { throw new Error("net down"); }) as unknown as unknown as typeof fetch;
      const r2 = await detectContainerIp();
      expect(r2.ip).toBeNull();
      expect(r2.source).toBe("none");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("D-2) رفت‌وبرگشت DB — ثبت IP + تشخیص تغییر + شاهد AuditLog", async () => {
    const { db } = await import("@/lib/db");
    const { recordContainerIp, containerIpStatus, lastLoggedIp } = await import("@/lib/melk-api/container-ip");
    const before = await lastLoggedIp(db);
    // شبیه‌سازی detect با fetch stub — IP تازه و متفاوت
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response("198.51.100.77", { status: 200 })) as unknown as typeof fetch;
    try {
      const info = await recordContainerIp(db);
      expect(info.ip).toBe("198.51.100.77");
      expect(info.changed).toBe(before !== null && before !== "198.51.100.77");
      const status = await containerIpStatus(db);
      expect(status.currentIp).toBe("198.51.100.77");
      expect(status.historyCount).toBeGreaterThan(0);
      const audit = await db.auditLog.findFirst({ where: { action: "CONTAINER_IP_LOG" }, orderBy: { createdAt: "desc" } });
      expect(audit).not.toBeNull();
      // پاکسازی رکوردهای تست
      await db.containerIpLog.deleteMany({ where: { ip: "198.51.100.77" } });
      await db.auditLog.deleteMany({ where: { action: "CONTAINER_IP_LOG", actor: "worker:ip-log" } });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("D-3) رجیستری Worker در حالت آفلینی — catalog-cycle حذف، ip-log حاضر، کارهای محلی پابرجا", async () => {
    const { buildWorkerJobs, WORKER_JOB_IDS } = await import("@/core/runtime/jobs");
    const saved = process.env.MELK_ARM_OFFLINE;
    try {
      // حالت عادی: همهٔ کارها + ip-log
      delete process.env.MELK_ARM_OFFLINE;
      const normal = buildWorkerJobs(null as never).map((j) => j.id);
      expect(normal).toContain(WORKER_JOB_IDS.catalogCycle);
      expect(normal).toContain(WORKER_JOB_IDS.ipLog);
      expect(normal).toContain(WORKER_JOB_IDS.backupRotation);
      // حالت آفلینی: صفر کار خارجی به ملک تبریز — اما گارد IP و کارهای محلی پابرجا
      process.env.MELK_ARM_OFFLINE = "1";
      const offline = buildWorkerJobs(null as never).map((j) => j.id);
      expect(offline).not.toContain(WORKER_JOB_IDS.catalogCycle); // توقف کامل
      expect(offline).toContain(WORKER_JOB_IDS.ipLog); // گارد IP می‌ماند (میزبان غیرملک‌تبریزی)
      expect(offline).toContain(WORKER_JOB_IDS.intelligenceCycle); // مغز — محلی
      expect(offline).toContain(WORKER_JOB_IDS.mirrorCycle); // آینهٔ GitHub — قانون تثبیت ۰۳۱
      expect(offline).toContain(WORKER_JOB_IDS.logRotate);
    } finally {
      if (saved === undefined) delete process.env.MELK_ARM_OFFLINE;
      else process.env.MELK_ARM_OFFLINE = saved;
    }
  });
});

// ───────────────────── E) دسته‌بندی/نمایش (۴) ─────────────────────

describe("PN-029 · E) وضعیت آفلاین و نمایش (دسته‌بندی سرویس‌ها)", () => {
  beforeAll(() => { process.env.MELK_ARM_OFFLINE = "1"; });
  afterAll(() => { delete process.env.MELK_ARM_OFFLINE; });

  test("E-1) provider.testConnection بدون live — هر پنج سرویس با برچسب آفلاین، صفر شبکه", async () => {
    const { getMelkProvider } = await import("@/lib/melk-api/provider");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => Promise.reject(new Error("نباید شبکه صدا زده شود"))) as unknown as typeof fetch;
    try {
      const st = await getMelkProvider().testConnection();
      expect(st.ok).toBe(false);
      expect(st.services?.length).toBe(5);
      for (const s of st.services ?? []) expect(s.detail).toContain("آفلینی");
      expect(st.detail).toContain("PN-029");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("E-2) provider.testConnection با live — اقدام آگاهانه از گارد عبور می‌کند (شکست شبکه صادقانه)", async () => {
    // پاک‌سازی وضعیت فیوز میزبانهای ملک تبریز — تست باید از وضعیت قطعی شروع شود
    const { db } = await import("@/lib/db");
    await db.circuitBreakerState.deleteMany({
      where: { target: { in: ["arus-api.melketabriz.ir", "pm-api.melketabriz.ir", "gap-api.melketabriz.ir"] } },
    });
    const { getMelkProvider } = await import("@/lib/melk-api/provider");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => { throw new Error("network unreachable"); }) as unknown as unknown as typeof fetch;
    try {
      const st = await getMelkProvider().testConnection({ live: true });
      expect(st.services?.length).toBe(5);
      for (const s of st.services ?? []) {
        expect(s.reachable).toBe(false); // شبکه در تست شبیه‌سازی‌شده قطع است — صادقانه
        expect(s.detail).not.toContain("آفلینی"); // این بار پروب واقعی زده شد
      }
    } finally {
      globalThis.fetch = originalFetch;
      await db.circuitBreakerState.deleteMany({
        where: { target: { in: ["arus-api.melketabriz.ir", "pm-api.melketabriz.ir", "gap-api.melketabriz.ir"] } },
      }).catch(() => undefined);
    }
  });

  test("E-3) اولاً — بخش «رابط سامانهٔ عمومی ملک تبریز» از تنظیمات حذف شده، سرویس apu پابرجا", () => {
    const ui = readFileSync("src/core/tiles/tiles/settings/MelkTabrizConnectionSection.tsx", "utf-8");
    expect(ui).not.toContain("رابط سامانهٔ عمومی ملک تبریز");
    expect(ui).not.toContain("melkPublicApiBase");
    expect(ui).toContain("PmConnectionSection"); // ARM و PM می‌مانند
    // سرویس استخراج عمومی (apu) پابرجاست — فقط از تنظیمات حذف شد
    const svc = readFileSync("src/lib/melk-api/melk-public.ts", "utf-8");
    expect(svc).toContain("melkPublic");
    const indicators = readFileSync("src/lib/indicators.ts", "utf-8");
    expect(indicators).toContain("melkPublicApi");
  });

  test("E-4) (ن۰۵۵) پیامهای خطای دقیق برای مالک (L6) — فیوز پابرجا · قفل OTP مرده", async () => {
    const { circuitLockedError, formatRemainingMs } = await import("@/lib/melk-api/circuit-breaker");
    // قالب‌بندی فارسی
    expect(formatRemainingMs(5 * 3600_000 + 23 * 60_000)).toBe("۵ ساعت و ۲۳ دقیقه");
    expect(formatRemainingMs(2 * 60_000)).toBe("۲ دقیقه");
    expect(formatRemainingMs(0)).toBe("هم‌اکنون");
    // خطای فیوز — با دلیل و زمان
    const err = circuitLockedError({ allowed: false, reason: "locked", retryInMs: 24 * 3600_000, snapshot: null });
    expect(err.code).toBe("CIRCUIT_COOLDOWN");
    expect(err.message).toContain("قفل سخت ۲۴ ساعته");
    expect(err.message).toContain("۲۴ ساعت");
    // (ن۰۵۵) قفل OTP تک‌بارة PN-029 دیگر وجود ندارد — قانون مالک: صفر محدودیت
    expect(existsSync("src/lib/auth/otp-lock.ts")).toBe(false);
  });
});
