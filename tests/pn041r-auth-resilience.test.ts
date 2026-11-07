/**
 * تست‌های PN-041-R (شورا-ن۰۶۸ · جلسهٔ ۰۶۸ — بازنگری PN-041 + رفع ۳ باگ ورود + ۵ دلیل رله)
 * ------------------------------------------------------
 * پوشش ۸ بخش:
 *   A) مهلت تطبیقی کلاینت — getAdaptiveTimeoutMs (۲۰ث سبک / ۱۵۰ث سنگین)
 *   B) Long-Polling ۱۰۰ث — POLL_MAX_WAIT_S + سازگاری اسکریپت نسل L (wait:100 · curl 110)
 *   C) فیوز قطع‌کننده — shouldBypassCircuit (روت‌های رله مستثنی) + auto-reset رلهٔ برگشته
 *   D) اسکریپت رلهٔ نسل L — wake-lock + wait:100 + مهلت curl پارامتری
 *   E) بهینه‌سازی SQLite — پراگماهای بوت (busy_timeout/cache_size/mmap/sync/wal_autocheckpoint)
 *   F) کار db-health-probe — رجیستری کار ۲۱ + منطق خوددرمانی
 *   G) UI تنظیمات رله — ۸ سنجهٔ سند (۳ لایه · QR · MIUI · timeout-info · تست بدون نقش مالک)
 *   H) مسیرهای بازیابی — live-db-path محلی-اول + ensure-wal محلی-اول + گارد قلعه
 */

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const ROOT = join(import.meta.dir, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("PN-041-R · A) مهلت تطبیقی کلاینت", () => {
  test("A-1 سبک ۲۰ث برای ورود/متادیتا", async () => {
    const { getAdaptiveTimeoutMs } = await import("@/lib/client/api");
    expect(getAdaptiveTimeoutMs("/api/auth/master-login")).toBe(20_000);
    expect(getAdaptiveTimeoutMs("/api/auth/verify-otp")).toBe(20_000);
    expect(getAdaptiveTimeoutMs("/api/health")).toBe(20_000);
    expect(getAdaptiveTimeoutMs("/api/connection/status")).toBe(20_000);
  });

  test("A-2 سنگین ۱۵۰ث برای فهرست‌ها/همگام‌سازی", async () => {
    const { getAdaptiveTimeoutMs } = await import("@/lib/client/api");
    expect(getAdaptiveTimeoutMs("/api/crm/arm-catalog/listings?page=1")).toBe(150_000);
    expect(getAdaptiveTimeoutMs("/api/listings?limit=50")).toBe(150_000);
    expect(getAdaptiveTimeoutMs("/api/requests?status=open")).toBe(150_000);
    expect(getAdaptiveTimeoutMs("/api/sync/all")).toBe(150_000);
    expect(getAdaptiveTimeoutMs("/api/experts")).toBe(150_000);
  });

  test("A-3 کوئری‌استرینگ در داوری مسیر اثر نمی‌گذارد", async () => {
    const { getAdaptiveTimeoutMs } = await import("@/lib/client/api");
    expect(getAdaptiveTimeoutMs("/api/requests?x=/api/health")).toBe(150_000);
  });
});

describe("PN-041-R · B) Long-Polling ۱۰۰ث", () => {
  test("B-1 سقف wait روت poll = ۱۰۰", async () => {
    const mod = await import("@/app/api/mobile-relay/poll/route");
    expect(mod.POLL_MAX_WAIT_S).toBe(100);
  });

  test("B-2 روت قدیمی wait>100 کلمپ می‌شود (سازگاری عقبه)", () => {
    const src = read("src/app/api/mobile-relay/poll/route.ts");
    expect(src).toContain("Math.min(Math.max(parsed.wait, 0), POLL_MAX_WAIT_S)");
  });

  test("B-3 فاصلهٔ داخلی تطبیقی (۷۰۰ms تعاملی → ۳ث)", () => {
    const src = read("src/app/api/mobile-relay/poll/route.ts");
    expect(src).toContain("POLL_INTERVAL_FAST_MS = 700");
    expect(src).toContain("POLL_INTERVAL_SLOW_MS = 3_000");
    expect(src).toContain("INTERACTIVE_WINDOW_MS = 15_000");
  });
});

describe("PN-041-R · C) فیوز — مستثنی‌سازی رله", () => {
  test("C-1 روتهای داخلی رله مستثنی", async () => {
    const { shouldBypassCircuit } = await import("@/lib/melk-api/circuit-breaker");
    expect(shouldBypassCircuit("/api/mobile-relay/poll")).toBe(true);
    expect(shouldBypassCircuit("/api/mobile-relay/result")).toBe(true);
    expect(shouldBypassCircuit("/api/relay/health")).toBe(true);
    expect(shouldBypassCircuit("/api/admin/relay/enroll")).toBe(true);
  });

  test("C-2 مسیرهای غیررله مستثنی نیستند", async () => {
    const { shouldBypassCircuit } = await import("@/lib/melk-api/circuit-breaker");
    expect(shouldBypassCircuit("/api/auth/master-login")).toBe(false);
    expect(shouldBypassCircuit("/api/crm/transactions")).toBe(false);
    expect(shouldBypassCircuit("/")).toBe(false);
  });

  test("C-3 armCall مسیر را به checkCircuit پاس می‌دهد", () => {
    const src = read("src/lib/melk-api/client.ts");
    expect(src).toContain('checkCircuit(target, { path: opts.path })');
  });

  test("C-4 شکست در عصرِ رلهٔ آفلاین ثبت نمی‌شود (کد)", () => {
    const src = read("src/lib/melk-api/circuit-breaker.ts");
    expect(src).toContain("if (await isRelayOfflineForBreaker()) return; // رلهٔ قطع = شکست قابل انتظار — نثبت");
  });

  test("C-5 قفل بسته + رلهٔ برخط = عبور (auto-reset)", () => {
    const src = read("src/lib/melk-api/circuit-breaker.ts");
    expect(src).toContain('if (!gate.allowed && (await isRelayOnlineNow()))');
  });
});

describe("PN-041-R · D) اسکریپت رلهٔ نسل L", () => {
  test("D-1 نسل L در سربرگ", () => {
    const src = read("src/lib/melk-api/relay-script.ts");
    expect(src).toContain("نسل L = PN-041-R");
  });

  test("D-2 wait:100 در بدنهٔ poll", () => {
    const src = read("src/lib/melk-api/relay-script.ts");
    expect(src).toContain('BODY="{\\\\"wait\\\\":100,\\\\"batch\\\\":$BATCH}"');
  });

  test("D-3 مهلت curl پارامتری + poll با ۱۱۰ث", () => {
    const src = read("src/lib/melk-api/relay-script.ts");
    expect(src).toContain('timeout_s="\\${MELKA_CURL_TIMEOUT:-35}"');
    expect(src).toContain("MELKA_CURL_TIMEOUT=110 signed_curl");
  });

  test("D-4 wake-lock پابرجا (دلیل قطعی ۱)", () => {
    const src = read("src/lib/melk-api/relay-script.ts");
    expect(src).toContain("termux-wake-lock");
  });

  test("D-5 مولد: اسکریپت تولیدی صحیح شکل می‌گیرد (bash -n)", async () => {
    const { buildRelayScript } = await import("@/lib/melk-api/relay-script");
    const script = buildRelayScript({
      serverUrl: "https://example.invalid",
      deviceId: "test-device-1",
      deviceSecret: "ABC123",
      altServerUrl: "https://alt.example.invalid",
    });
    expect(script).toContain('SERVER_URL="https://example.invalid"');
    expect(script).toContain('ALT_SERVER_URL="https://alt.example.invalid"');
    expect(script).toContain('\\"wait\\":100');
    expect(script).toContain("termux-wake-lock");
    // اسکریپتِ تولیدی بس‌پذیر است (bash -n) — نوشتن در tmp و بررسی نحوی
    const tmp = join(ROOT, "upload/.runtime/pn041r-gen-script.sh");
    const { writeFileSync } = await import("node:fs");
    writeFileSync(tmp, script);
    const rc = execSync(`bash -n ${tmp} && echo OK`).toString().trim();
    expect(rc).toBe("OK");
  });
});

describe("PN-041-R · E) بهینه‌سازی SQLite (پراگماهای بوت)", () => {
  test("E-1 ماژول با پنج پراگمای مصوب", async () => {
    const { optimizeSqliteOnBoot } = await import("@/lib/db-optimize");
    expect(typeof optimizeSqliteOnBoot).toBe("function");
    const src = read("src/lib/db-optimize.ts");
    expect(src).toContain("busy_timeout=10000");
    expect(src).toContain("cache_size=-20000");
    expect(src).toContain("mmap_size=268435456");
    expect(src).toContain("synchronous=NORMAL");
    expect(src).toContain("wal_autocheckpoint=1000");
  });

  test("E-2 instrumentation در هر بوت صدا می‌زند", () => {
    const src = read("src/instrumentation.ts");
    expect(src).toContain("optimizeSqliteOnBoot");
    expect(src).toContain("sqlite-optimize-boot");
  });

  test("E-3 DATABASE_URL محلی با connection_limit=1 و socket_timeout", () => {
    const envp = JSON.parse(read("env.platform.json"));
    expect(envp.DATABASE_URL).toContain("db/custom.db?connection_limit=1&socket_timeout=30");
  });
});

describe("PN-041-R · F) کار db-health-probe (خوددرمانی)", () => {
  test("F-1 شناسهٔ کار ثبت شده", async () => {
    const { WORKER_JOB_IDS, buildWorkerJobs } = await import("@/core/runtime/jobs");
    expect(WORKER_JOB_IDS.dbHealthProbe).toBe("db-health-probe");
    const jobs = buildWorkerJobs(null as never);
    expect(jobs.some((j) => j.id === "db-health-probe")).toBe(true);
  });

  test("F-2 منطق: ۳ شکست پیاپی = خروج ۷۵ (بازیابی نگهبان)", () => {
    const src = read("src/core/runtime/jobs.ts");
    expect(src).toContain('failures.count >= 3');
    expect(src).toContain("process.exit(75)");
    expect(src).toContain("UPDATE AppMeta SET recordedAt=recordedAt");
  });

  test("F-3 بکاپ‌ها زیرپروسه‌ای — اتصال اصلی هرگز بلاک نمی‌شود", () => {
    const src = read("src/core/runtime/jobs.ts");
    expect(src).toContain("runVacuumSubprocess");
    expect(src).toContain("scripts/pn041/vacuum-copy.ts");
  });
});

describe("PN-041-R · G) UI تنظیمات رله — ۸ سنجه", () => {
  const section = "src/core/tiles/tiles/settings/RelaySetupSection.tsx";
  const guide = "src/core/tiles/tiles/settings/MiuiWakeLockGuide.tsx";

  test("G-1 سنجهٔ ۱: وضعیت ۳ لایه از /api/relay/health", () => {
    const src = read(section);
    expect(src).toContain('"/api/relay/health"');
    expect(src).toContain("layers?.map");
  });

  test("G-2 سنجهٔ ۲: تولید کد نصب (دستور — PN-047/گام دوم-۲: QR به دستور مالک حذف شد)", () => {
    const src = read(section);
    expect(src).toContain("/api/admin/relay/enroll");
    expect(src).toContain("کپی دستور نصب");
    // دستور مالک ۱۴۰۵/۰۷/۲۹ (PN-047): بخش QR کد نصب از تنظیمات رله حذف شد —
    // دکمهٔ تولید کد نصب + دستور + کپی پابرجا (درس ۰۵۴: دکمه حذف نشود)
    expect(src).not.toContain("/api/admin/relay/qr?text=");
    expect(src).not.toContain("اسکن با دوربین");
  });

  test("G-3 سنجهٔ ۳: راهنمای MIUI تصویری", () => {
    expect(existsSync(join(ROOT, guide))).toBe(true);
    const g = read(guide);
    expect(g).toContain("بدون محدودیت");
    expect(g).toContain("termux-wake-lock");
    expect(g).toContain("Recent");
  });

  test("G-4 سنجهٔ ۴: نمایش Timeout تطبیقی + Long-Polling", () => {
    const src = read(section);
    expect(src).toContain("Poll طولانی: ۱۰۰ ثانیه");
    expect(src).toContain("سبک (ورود): ۲۰ث");
    expect(src).toContain("سنگین (فهرست‌ها): ۱۵۰ث");
  });

  test("G-5 سنجهٔ ۵: تست اتصال بدون نقش مالک", () => {
    const src = read(section);
    // نقش غیر OWNER هم بخش را می‌بیند (return null حذف شد برای کاربران عادی)
    expect(src).not.toContain('if (role !== "OWNER") return null');
    expect(src).toContain("isOwner ? \"تست تونل\" : \"تست اتصال\"");
  });

  test("G-6 سنجهٔ ۶/۷/۸: وضعیت زنده + آمار + راهنمای ۳ خطی", () => {
    const src = read(section);
    expect(src).toContain("رله زنده");
    expect(src).toContain("done24h");
    expect(src).toContain("pkg install -y openssl-tool");
  });
});

describe("PN-041-R · H) مسیرهای بازیابی (معماری محلی-اول)", () => {
  test("H-1 live-db-path.sh دیسک محلی اول", () => {
    const src = read("scripts/recovery/live-db-path.sh");
    expect(src).toContain('LOCAL="$REPO/db/custom.db"');
    const out = execSync(`bash ${join(ROOT, "scripts/recovery/live-db-path.sh")}`).toString().trim();
    expect(out).toBe(join(ROOT, "db/custom.db"));
  });

  test("H-2 ensure-wal.ts محلی-اول + پوست‌کوندن پارامتر URL", () => {
    const src = read("scripts/pn008/ensure-wal.ts");
    expect(src).toContain('split("?")[0]');
    expect(src).toContain('return local; // مقصد پیش‌فرض: دیسک محلی (شورا-ن۰۶۸)');
  });

  test("H-3 prod-watchdog LIVE_DB_URL محلی با پارامترها", () => {
    const src = read("scripts/prod-watchdog.sh");
    expect(src).toContain('LIVE_DB_URL="file:$LOCAL_DB?connection_limit=1&socket_timeout=30"');
  });

  test("H-4 رستاخیز نهایی: زنده = دیسک محلی + زنجیرهٔ قلعه (PN-042)", () => {
    const src = read("resurrect-ultimate.sh");
    expect(src).toContain('LIVE="$REPO/db/custom.db"');
    expect(src).toContain('FORT="$REPO/upload/.data/custom.db"');
    expect(src).toContain("صفر مداخله");
  });

  test("H-5 enroll خطای DB_BUSY شفاف (بند ۲.۳)", () => {
    const src = read("src/app/api/admin/relay/enroll/route.ts");
    expect(src).toContain("DB_BUSY");
    expect(src).toContain("قفل نوشتن");
  });
});
