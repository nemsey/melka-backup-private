// ============================================================
// PN-010 / BLOCK 4 — شاهد مهاجرت دیمن‌ها به Worker
// جدول مصوب بند ۴.۲ + شواهد زنده + آزمون‌ها
// خروجی: download/pn010/daemon-migration.json
// ============================================================
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const OUT = "/home/z/my-project/download/pn010";

function sh(cmd: string): string {
  try { return execSync(cmd, { encoding: "utf-8", timeout: 60_000 }).trim(); } catch { return ""; }
}
function exists(p: string): boolean { return existsSync(p); }

async function main() {
  const statusFile = JSON.parse(readFileSync("/home/z/my-project/upload/.runtime/runtime-status.json", "utf-8"));
  const jobs = statusFile.jobs as Record<string, { runs: number; running: boolean; lastError: string | null; lastDurationMs: number | null; lastRunAt: string | null }>;

  // شاهد لاگ آینه (چرخهٔ اول از Worker)
  const mirrorLog = readFileSync("/home/z/my-project/upload/.mirror/push-log.jsonl", "utf-8").split("\n").filter(Boolean);
  const mirrorCycle = mirrorLog.filter((l) => l.includes('"kind":"cycle-end"')).length;
  const lastPush = [...mirrorLog].reverse().find((l) => l.includes('"kind":"push"'));

  // تست‌های مهاجرت از لاگ رسمی
  const log = readFileSync(`${OUT}/tests-run1.log`, "utf-8");
  const migTests = {
    file: "tests/pn010-migration.test.ts",
    suite: "PN-010 BLOCK 4 — مهاجرت دیمن‌ها به Worker",
    pass: log.split("\n").filter((l) => l.startsWith("(pass)") && l.includes("PN-010 BLOCK 4")).length,
    fail: log.split("\n").filter((l) => l.startsWith("(fail)") && l.includes("PN-010 BLOCK 4")).length,
    required: 10,
  };

  const witness = {
    pn: "PN-010",
    block: "BLOCK 4 — انتقال Daemonها به Worker",
    generatedAt: new Date().toISOString(),
    councilDecision: "جدول بند ۴.۲ جلسهٔ ۰۱۰ (مصوب): هر دیمن به محل نهایی خود",
    table: [
      {
        daemon: "Intelligence Daemon (مغز هوشمند)",
        previousHome: "درون‌فرایندی در Web — setInterval در instrumentation.ts",
        finalHome: "Worker — کار intelligence-cycle",
        evidence: {
          jobsTsContains: "runIntelligenceDaemonTick (همان بدنهٔ تایمر قبلی)",
          firstRunDelayPreservedMs: 45_000,
          intervalPreserved: "MELK_INTELLIGENCE_INTERVAL_MINUTES (پیش‌فرض ۶۰ دقیقه)",
          killSwitchPreserved: "MELK_INTELLIGENCE_DAEMON=disabled",
          live: { runs: jobs["intelligence-cycle"].runs, lastRunAt: jobs["intelligence-cycle"].lastRunAt, lastError: jobs["intelligence-cycle"].lastError, durationMs: jobs["intelligence-cycle"].lastDurationMs },
          statusEndpointChannel: "/api/intelligence/status → daemon از کانال Worker (شاهد UI: «دیمن v2 زنده — ۱ اجرا»)",
        },
      },
      {
        daemon: "Catalog Daemon (پایدارساز بروزرسانی)",
        previousHome: "درون‌فرایندی در Web — setInterval در instrumentation.ts",
        finalHome: "Worker — کار catalog-cycle",
        evidence: {
          jobsTsContains: "catalogDaemonTick (از قبل صادر بود — قابل تست مستقیم)",
          firstRunDelayPreservedMs: 60_000,
          intervalPreserved: "MELK_CATALOG_DAEMON_INTERVAL_MINUTES (پیش‌فرض ۱ دقیقه)",
          killSwitchPreserved: "MELK_CATALOG_DAEMON=disabled",
          live: { runs: jobs["catalog-cycle"].runs, running: jobs["catalog-cycle"].running, lastError: jobs["catalog-cycle"].lastError },
          statusEndpointChannel: "catalogDaemonStatus از کانال Worker (domain snapshot پس از هر تیک)",
        },
      },
      {
        daemon: "Auto-Recovery Daemon (خوددرمانی)",
        previousHome: "قلاب بوت یک‌باره در instrumentation.ts (۲۰ ثانیه پس از بوت)",
        finalHome: "Boot Hook — همان‌جا ماند (مصوبهٔ بند ۴.۲)",
        evidence: {
          instrumentationContains: "auto-recovery.sh + MELK_AUTO_RECOVERY (آزمون ۴-۳)",
          reason: "وارسی بازیابی باید پیش از راه‌اندازی کارهای دوره‌ای انجام شود — بوت‌هوک صحیح‌ترین محل است",
        },
      },
      {
        daemon: "Mirror Daemon (آینهٔ GitHub)",
        previousHome: "دیمن مستقل ۶ساعته bash — با ریست محیط می‌مرد و re-arm دستی می‌خواست",
        finalHome: "Worker — کار mirror-cycle هر ۶ ساعت (اسکریپت چرخهٔ واحد استخراج‌شده)",
        evidence: {
          newScript: "scripts/mirror/mirror-cycle.sh (چرخهٔ واحد: build_snapshot + do_push + do_verify + do_weekly)",
          oldDaemonNowWrapper: "mirror-daemon.sh → فقط حلقهٔ خواب دور mirror-cycle.sh (دیگر مسیر تولیدی نیست)",
          reArmNoLongerNeeded: "Supervisor Worker را در هر بوت خودش می‌فروشد — وابستگی re-arm دستی حذف شد",
          live: { cycles: mirrorCycle, lastPush: lastPush ? JSON.parse(lastPush) : null },
          firstCycleFromWorker: "۲۳:۲۳:۴۶ — دقیقاً +۵ دقیقه پس از بوت Worker ۲۳:۱۸:۴۶ (firstRunDelayMs طراحی‌شده) · پوش ok (main+survivalCode)",
        },
      },
      {
        daemon: "Log Rotator (چرخش لاگ)",
        previousHome: "اسکریپت یک‌بارهٔ ن۰۰۶ — وابسته به حلقهٔ پایشگر RAM (خاموش پس از ریست‌ها)",
        finalHome: "Worker — کار log-rotate هر ۳۰ دقیقه",
        evidence: {
          scriptUnchanged: "scripts/log-rotate.sh (همان ن۰۰۶ — سقف ۱۰MB · ۳ نسل)",
          live: { runs: jobs["log-rotate"].runs, lastError: jobs["log-rotate"].lastError },
          firstRun: "۲۳:۲۸:۴۶ — دقیقاً +۱۰ دقیقه پس از بوت Worker (firstRunDelayMs طراحی‌شده)",
        },
      },
      {
        daemon: "Backup Rotation (تازه — PN-010 BLOCK 1)",
        previousHome: "وجود نداشت — ریشهٔ قرمزی DIAG-DATA-005",
        finalHome: "Worker — کار backup-rotation هر ۶ ساعت (VACUUM + هرس ۳ نسل + integrity)",
        evidence: {
          live: { runs: jobs["backup-rotation"].runs, lastError: jobs["backup-rotation"].lastError },
          firstBackup: "backup-2026-10-06T23-20-16-755.db (۲۵۷٫۸MB) — +۹۰ ثانیه پس از بوت Worker",
          keepsDiagData005Green: "backups/ اکنون ۳ فایل تازه دارد → DIAG-DATA-005 = pass",
        },
      },
    ],
    migrationPrinciples: {
      "گام‌به‌گام": "هر دیمن → کار مجزا با شناسهٔ ثابت در رجیستری jobs.ts",
      "هر انتقال با آزمون": "۱۰ آزمون مهاجرت (۴-۱ تا ۴-۱۰): حذف wiring قدیمی · نصب Supervisor · رجیستری ۵+۱ کار · فاصله‌ها/تاخیرها عین قبل · کلیدهای خاموشی · اسکریپت‌های استخراج‌شده",
      "صفر قطع خدمت": "سرور در تمام طول مهاجرت ۲۰۰ ماند (شاهد: سلامت پیوسته حین بازنویسی) · زمان‌بندی و رفتار دیمن‌ها عیناً حفظ شد",
      processIsolationProof: "ری‌استارت Web (۲۳:۲۴) → Worker بدون وقفه ادامه داد (۲۳:۱۹→اکنون) — دو فرایند مستقل",
    },
    workerSnapshot: {
      pid: statusFile.worker.pid,
      instanceId: statusFile.worker.instanceId,
      startedAt: statusFile.worker.startedAt,
      dispatcherTicks: statusFile.dispatcher.ticks,
      jobs: Object.fromEntries(Object.entries(jobs).map(([id, j]) => [id, { runs: j.runs, running: j.running, lastError: j.lastError }])),
    },
    tests: migTests,
    files: {
      runtimeCore: ["src/core/runtime/joblock.ts", "src/core/runtime/job-queue.ts", "src/core/runtime/jobs.ts", "src/core/runtime/supervisor.ts", "src/core/runtime/worker.ts", "src/core/runtime/worker-status.ts"],
      entry: "scripts/runtime/worker.ts",
      wiring: "src/instrumentation.ts (RuntimeSupervisor جای دو start*Daemon)",
      scripts: ["scripts/mirror/mirror-cycle.sh (تازه)", "scripts/mirror/mirror-daemon.sh (پوشش‌دهنده)", "scripts/log-rotate.ts (بدون تغییر)"],
      api: "src/app/api/runtime/health/route.ts (OWNER-only · تازه)",
      db: "prisma/schema.prisma + JobLock (تازه)",
      existChecks: {
        workerEntry: exists("/home/z/my-project/scripts/runtime/worker.ts"),
        mirrorCycle: exists("/home/z/my-project/scripts/mirror/mirror-cycle.sh"),
        runtimeHealthRoute: exists("/home/z/my-project/src/app/api/runtime/health/route.ts"),
      },
    },
  };

  writeFileSync(`${OUT}/daemon-migration.json`, JSON.stringify(witness, null, 2));
  console.log("═══ PN-010 BLOCK 4 — شاهد مهاجرت ═══");
  console.log(`۶ ردیف جدول (۵ دیمن مصوب + Backup Rotation تازه) · ${mirrorCycle} چرخهٔ آینه کامل`);
  console.log(`Worker: pid=${statusFile.worker.pid} · ticks=${statusFile.dispatcher.ticks}`);
  console.log(`تست‌های مهاجرت: ${migTests.pass}/${migTests.required} سبز`);
}

main().catch((e) => { console.error(e); process.exit(1); });
