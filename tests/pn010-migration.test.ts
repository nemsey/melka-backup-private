/**
 * تست‌های مهاجرت دیمن‌ها → Worker — PN-010 / BLOCK 4 (بند ۴.۳: هر انتقال با آزمون)
 * ------------------------------------------------------
 * پوشش: حذف دیمن‌های درون‌فرایندی از Web · نصب Supervisor · ماندن Auto-Recovery
 * به‌عنوان Boot Hook · رجیستری پنج‌کار + کار backup-rotation · حفظ فاصله‌ها و
 * کلیدهای خاموشی عین قبل (صفر قطع خدمت) · اسکریپت چرخهٔ واحد آینه.
 */

import { describe, expect, test, beforeEach } from "bun:test";
import { existsSync, statSync, readFileSync, writeFileSync, rmSync } from "node:fs";

const { buildWorkerJobs, WORKER_JOB_IDS, REPO_ROOT } = await import("@/core/runtime/jobs");
const { readWorkerStatus, writeWorkerStatus, RUNTIME_STATUS_DIR } = await import("@/core/runtime/worker-status");
const { daemonHealth } = await import("@/lib/intelligence/daemon");
const { catalogDaemonStatus } = await import("@/lib/melk-api/catalog-daemon");

const INSTRUMENTATION = readFileSync(`${REPO_ROOT}/src/instrumentation.ts`, "utf-8");

/** محیط پیش‌فرض: همهٔ دیمن‌ها فعال */
function clearSwitches() {
  for (const k of ["MELK_INTELLIGENCE_DAEMON", "MELK_CATALOG_DAEMON", "MELK_MIRROR_JOB", "MELK_BACKUP_ROTATION"]) delete process.env[k];
}

beforeEach(() => {
  clearSwitches();
});

describe("PN-010 BLOCK 4 — مهاجرت دیمن‌ها به Worker", () => {
  test("۴-۱ Web دیگر دیمن درون‌فرایندی راه نمی‌اندازد (حذف از instrumentation)", () => {
    expect(INSTRUMENTATION).not.toContain("startIntelligenceDaemon(db)");
    expect(INSTRUMENTATION).not.toContain("startCatalogDaemon(db)");
  });

  test("۴-۲ Web: RuntimeSupervisor نصب شده (نقطهٔ اتصال معماری ۱+۱)", () => {
    expect(INSTRUMENTATION).toContain("RuntimeSupervisor");
    expect(INSTRUMENTATION).toContain("supervisor.start()");
  });

  test("۴-۳ Auto-Recovery می‌ماند Boot Hook (مصوبهٔ بند ۴.۲)", () => {
    expect(INSTRUMENTATION).toContain("auto-recovery.sh");
    expect(INSTRUMENTATION).toContain("MELK_AUTO_RECOVERY");
  });

  test("۴-۴ رجیستری: پنج کار اصلی + دو گارد بدهی PN-014 در Worker", () => {
    const jobs = buildWorkerJobs(null as never); // رجیستری خالص — db فقط به run پاس می‌شود
    const ids = jobs.map((j) => j.id);
    expect(ids).toContain(WORKER_JOB_IDS.intelligenceCycle);
    expect(ids).toContain(WORKER_JOB_IDS.catalogCycle);
    expect(ids).toContain(WORKER_JOB_IDS.mirrorCycle);
    expect(ids).toContain(WORKER_JOB_IDS.logRotate);
    expect(ids).toContain(WORKER_JOB_IDS.backupRotation);
    // PN-014/D3+D4 — دو گارد تازه (فاصله‌ها در تست‌های همان پرونده)
    expect(ids).toContain(WORKER_JOB_IDS.privacyGuard);
    expect(ids).toContain(WORKER_JOB_IDS.sizeGuard);
    expect(ids.length).toBe(7);
  });

  test("۴-۵ فاصله‌ها عین دیمن‌های قبلی (صفر قطع خدمت در رفتار زمانی)", () => {
    const jobs = buildWorkerJobs(null as never);
    const by = Object.fromEntries(jobs.map((j) => [j.id, j]));
    expect(by[WORKER_JOB_IDS.intelligenceCycle].intervalMs).toBe(60 * 60_000); // ۶۰ دقیقه
    expect(by[WORKER_JOB_IDS.intelligenceCycle].firstRunDelayMs).toBe(45_000); // عین قبل
    expect(by[WORKER_JOB_IDS.catalogCycle].intervalMs).toBe(60_000); // ۱ دقیقه
    expect(by[WORKER_JOB_IDS.catalogCycle].firstRunDelayMs).toBe(60_000); // عین قبل
    expect(by[WORKER_JOB_IDS.mirrorCycle].intervalMs).toBe(6 * 60 * 60_000); // ۶ ساعت
    expect(by[WORKER_JOB_IDS.logRotate].intervalMs).toBe(30 * 60_000);
    expect(by[WORKER_JOB_IDS.backupRotation].intervalMs).toBe(6 * 60 * 60_000);
  });

  test("۴-۶ کلیدهای خاموشی محترم: حذف انتخابی کارها با env های قبلی", () => {
    // PN-015 (احیا): ترمیم بهداشت ایزوله‌سازی — این شش env پیش‌تر بدون بازگردانی
    // نشت می‌کردند و تست ۱۲ pn014-debt-guards (ثبت پیش‌فرض گاردها) را در ترتیبِ
    // «migration قبل از debt-guards» می‌شکست؛ بازنشانی هفتم ترتیب شمارش فایل‌ها را
    // عوض کرد و ریشهٔ نهفته را آشکار کرد (عین درس سه‌گانهٔ نوسان PN-012).
    const keys = [
      "MELK_INTELLIGENCE_DAEMON",
      "MELK_CATALOG_DAEMON",
      "MELK_MIRROR_JOB",
      "MELK_BACKUP_ROTATION",
      "MELK_PRIVACY_GUARD",
      "MELK_SIZE_GUARD",
    ] as const;
    const saved = keys.map((k) => [k, process.env[k]] as const);
    try {
      for (const k of keys) process.env[k] = "disabled";
      const jobs = buildWorkerJobs(null as never);
      const ids = jobs.map((j) => j.id);
      expect(ids).not.toContain(WORKER_JOB_IDS.intelligenceCycle);
      expect(ids).not.toContain(WORKER_JOB_IDS.catalogCycle);
      expect(ids).not.toContain(WORKER_JOB_IDS.mirrorCycle);
      expect(ids).not.toContain(WORKER_JOB_IDS.backupRotation);
      expect(ids).not.toContain(WORKER_JOB_IDS.privacyGuard);
      expect(ids).not.toContain(WORKER_JOB_IDS.sizeGuard);
      expect(ids).toEqual([WORKER_JOB_IDS.logRotate]); // چرخش لاگ همیشه فعال
    } finally {
      for (const [k, v] of saved) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });

  test("۴-۷ آینه: چرخهٔ واحد استخراج شد + دیمن پوشش‌دهنده به آن واگذار کرد", () => {
    const cycle = `${REPO_ROOT}/scripts/mirror/mirror-cycle.sh`;
    const daemon = `${REPO_ROOT}/scripts/mirror/mirror-daemon.sh`;
    expect(existsSync(cycle)).toBe(true);
    expect(existsSync(daemon)).toBe(true);
    const cycleSrc = readFileSync(cycle, "utf-8");
    const daemonSrc = readFileSync(daemon, "utf-8");
    expect(cycleSrc).toContain("build_snapshot");
    expect(cycleSrc).toContain("do_push");
    expect(cycleSrc).toContain("do_verify");
    expect(cycleSrc).toContain("do_weekly");
    expect(cycleSrc).toContain('exit "$FAIL"');
    expect(daemonSrc).toContain("mirror-cycle.sh"); // دیمن فقط حلقهٔ خواب است
    expect((statSync(cycle).mode & 0o111) !== 0).toBe(true); // اجرایی
  });

  test("۴-۸ تیک هوشمندی صادرشده و قابل فراخوانی از Worker", async () => {
    const mod = await import("@/lib/intelligence/daemon");
    expect(typeof mod.runIntelligenceDaemonTick).toBe("function");
    const mod2 = await import("@/lib/melk-api/catalog-daemon");
    expect(typeof mod2.catalogDaemonTick).toBe("function"); // از قبل صادر بود (تست‌پذیر)
  });

  test("۴-۹ daemonHealth از کانال Worker می‌خواند (منبع حقیقت جابجا شده)", () => {
    const statusFile = `${RUNTIME_STATUS_DIR}/runtime-status.json`;
    const hadOriginal = existsSync(statusFile);
    const original = hadOriginal ? readFileSync(statusFile, "utf-8") : null;
    try {
      writeWorkerStatus({
        version: 1,
        worker: { pid: 555, instanceId: "worker:test-mig", startedAt: new Date().toISOString(), lastHeartbeatAt: new Date().toISOString() },
        dispatcher: { ticks: 3, startedAt: new Date().toISOString() },
        jobs: {
          "intelligence-cycle": { running: false, runs: 9, lastRunAt: "2026-10-07T08:00:00Z", lastDurationMs: 1200, lastError: null },
          "catalog-cycle": { running: true, runs: 77, lastRunAt: "2026-10-07T09:00:00Z", lastDurationMs: 300, lastError: null, domain: { enabled: true, running: true, lastTickAt: 1770000000000, lastSuccessAt: 1770000000000, lastError: null, ticks: 77, lastResult: { listingsPages: 2, requestsPages: 1, listingsEnriched: 5, requestsEnriched: 3, txInfoEnriched: 4, pmInfoEnriched: 1, melkPublicNewCodes: 0, typeRegistriesSynced: 2, cooldownSkip: false } } },
        },
        updatedAt: new Date().toISOString(),
      });
      const dh = daemonHealth();
      expect(dh.runs).toBe(9); // از کانال Worker — نه حافظهٔ Web
      expect(dh.lastRunAt).toBe("2026-10-07T08:00:00Z");
      const cs = catalogDaemonStatus();
      expect(cs.ticks).toBe(77);
      expect(cs.lastResult?.typeRegistriesSynced).toBe(2);
    } finally {
      if (original !== null) writeFileSync(statusFile, original, "utf-8");
      else if (existsSync(statusFile)) rmSync(statusFile);
    }
  });

  test("۴-۱۰ ورودی Worker وجود دارد و به بوت‌استرپ رسمی وصل است", () => {
    const entry = `${REPO_ROOT}/scripts/runtime/worker.ts`;
    expect(existsSync(entry)).toBe(true);
    const src = readFileSync(entry, "utf-8");
    expect(src).toContain("startWorkerRuntime");
    expect(src).toContain("applyPlatformEnvFallbacks"); // بقای env (درس PN-009)
    expect(src).toContain('process.env.MELK_WORKER === "disabled"'); // خروج بی‌صدا Worker دوم
  });
});
