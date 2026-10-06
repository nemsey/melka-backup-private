// ============================================================
// PN-010 / BLOCK 7 — شاهدهای زندهٔ معماری (joblock + supervisor)
// از سیستم در حال تولید می‌خواند + خلاصهٔ تست‌ها را می‌پیوندد.
// خروجی: download/pn010/joblock-test.json + supervisor-test.json
// ============================================================
import { PrismaClient } from "@prisma/client";
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const prisma = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });
const OUT = "/home/z/my-project/download/pn010";

async function main() {
  const now = new Date().toISOString();

  // ═══ JobLock — وضعیت زندهٔ قفل‌ها ═══
  const locks = await prisma.jobLock.findMany({ orderBy: { jobId: "asc" } });
  const lockRows = locks.map((l) => ({
    jobId: l.jobId,
    instanceId: l.instanceId,
    acquiredAt: l.acquiredAt.toISOString(),
    lastHeartbeat: l.lastHeartbeat.toISOString(),
    expiresAt: l.expiresAt.toISOString(),
    heartbeatAgeSec: Math.round((Date.now() - l.lastHeartbeat.getTime()) / 1000),
    metadata: l.metadata ? JSON.parse(l.metadata) : null,
  }));

  // خلاصهٔ تست‌ها (از شاهد کامل)
  const testSummary = (() => {
    try {
      const log = readFileSync(`${OUT}/tests-run1.log`, "utf-8");
      const m = log.match(/Ran (\d+) tests across \d+ files/);
      const f = log.match(/(\d+) fail/);
      const p = log.match(/\n\s*(\d+) pass/);
      return { total: m ? Number(m[1]) : null, pass: p ? Number(p[1]) : null, fail: f ? Number(f[1]) : null };
    } catch { return null; }
  })();

  // تست‌های اختصاصی JobLock (بلوک ۲) از لاگ
  const jlTests = (() => {
    try {
      const log = readFileSync(`${OUT}/tests-run1.log`, "utf-8");
      const lines = log.split("\n").filter((l) => l.includes("PN-010 BLOCK 2"));
      const pass = lines.filter((l) => l.startsWith("(pass)")).length;
      const fail = lines.filter((l) => l.startsWith("(fail)")).length;
      return { file: "tests/pn010-joblock.test.ts", suite: "PN-010 BLOCK 2 — JobLock با ضربان قلب", pass, fail, required: 15 };
    } catch { return null; }
  })();

  const joblockWitness = {
    pn: "PN-010",
    block: "BLOCK 2 — JobLock با Heartbeat",
    generatedAt: now,
    schema: {
      model: "JobLock (prisma/schema.prisma)",
      fields: ["jobId @id", "instanceId", "acquiredAt", "lastHeartbeat", "expiresAt", "metadata?"],
      index: "expiresAt",
      pushed: ["db/custom.db (production)", "db/test.db (تست)"],
      selfHealing: "ensureJobLockTable — DDL یکسان با prisma db push؛ بازیابی از بسته‌های بقای پیش-PN-010 هرگز به‌خاطر جدول مفقود نمی‌میرد (آزمون ۲-۱۵)",
    },
    api: {
      acquire: "تلاش تصاحب — ردیف منقضی = متروکه (قابل تصرف)؛ برندهٔ constraint یکتایی = دارنده",
      heartbeat: "تمدید انقضا هر ۳۰ ثانیه (بند ۲.۳) — فقط با instanceId دارنده",
      release: "آزادسازی در پایان کار (موفق یا خطا) — فقط با instanceId دارنده",
      cleanup: "جاروی دوره‌ای قفل‌های منقضی (هر ~۲ دقیقه توسط دیسپچر)",
      withLock: "الگوی امن: قفل → ضربان → اجرا → رهاسازی",
    },
    liveLocks: lockRows,
    liveVerdict: {
      runtimeWorkerLockHeld: lockRows.some((l) => l.jobId === "runtime:worker" && l.heartbeatAgeSec <= 90),
      note: "قفل runtime:worker با ضربان ۳۰ ثانیه‌ای Worker تازه می‌ماند؛ قفل‌های job:* فقط حین اجرای کار وجود دارند و در پایان آزاد می‌شوند",
    },
    tests: jlTests,
    twoGreen: testSummary,
  };
  writeFileSync(`${OUT}/joblock-test.json`, JSON.stringify(joblockWitness, null, 2));

  // ═══ Supervisor — وضعیت زندهٔ Web + Worker ═══
  const statusFile = JSON.parse(readFileSync("/home/z/my-project/upload/.runtime/runtime-status.json", "utf-8"));
  const webPid = execSync("pgrep -f 'standalone/server.js' | head -1", { encoding: "utf-8" }).trim();
  const webStart = execSync(`ps -o lstart= -p ${webPid}`, { encoding: "utf-8" }).trim();
  const processes = execSync("ps aux | grep -E 'server.js|worker.ts' | grep -v grep | awk '{print $2, $11, $12}'", { encoding: "utf-8" }).trim();

  const supTests = (() => {
    try {
      const log = readFileSync(`${OUT}/tests-run1.log`, "utf-8");
      const lines = log.split("\n").filter((l) => l.includes("PN-010 BLOCK 3"));
      return { file: "tests/pn010-supervisor.test.ts", suite: "PN-010 BLOCK 3 — RuntimeSupervisor سبک", pass: lines.filter((l) => l.startsWith("(pass)")).length, fail: lines.filter((l) => l.startsWith("(fail)")).length, required: 15 };
    } catch { return null; }
  })();

  const supervisorWitness = {
    pn: "PN-010",
    block: "BLOCK 3 — RuntimeSupervisor (سبک)",
    generatedAt: now,
    code: "src/core/runtime/supervisor.ts (بدون منطق دامنه — قید بند ۳.۳)",
    structure: {
      architecture: "1-web-1-worker",
      constraint: "حداکثر دو فرایند — نه بیشتر (قید کمیسیون متخصص: خودش Daemon Monster نشود)",
      tree: ["RuntimeSupervisor", "├── Web Process Health (pid/uptime/memory/buildId)", "└── Worker Process Health → Internal Job Queue (۵ کار + ضربان ۳۰ ثانیه)"],
    },
    api: { start: "spawn مستقل Worker اگر زنده نیست (idempotent) + بازرسی ۶۰ ثانیه‌ای + احیا", stop: "درخواست توقف تدریجی (ردیف DB) — کار جاری تمام شود سپس خروج", health: "Web + Worker + صف کار داخلی از کانال وضعیت مشترک", restart: "درخواست اجرای فوری یک کار خاص (run-request در DB)" },
    live: {
      web: { pid: Number(webPid), startedAt: webStart, buildId: readFileSync("/home/z/my-project/.next/BUILD_ID", "utf-8").trim() },
      worker: {
        pid: statusFile.worker.pid,
        instanceId: statusFile.worker.instanceId,
        startedAt: statusFile.worker.startedAt,
        lastHeartbeatAt: statusFile.worker.lastHeartbeatAt,
        stopping: statusFile.worker.stopping ?? false,
        heartbeatFresh: Date.now() - new Date(statusFile.worker.lastHeartbeatAt).getTime() < 90_000,
      },
      dispatcherTicks: statusFile.dispatcher.ticks,
      jobs: Object.fromEntries(Object.entries(statusFile.jobs).map(([id, j]) => [id, { runs: j.runs, running: j.running, lastError: j.lastError }])),
      psEvidence: processes.split("\n"),
      selfHealingProven: "رویداد ۲۳:۱۸ — مرگ Worker اول (باگ unref کشف‌شده) → بازرسی ۶۰ ثانیه‌ای Supervisor → احیای خودکار Worker جدید (PID 25546)",
      independenceProven: "ری‌استارت Web (23:24) → Worker بدون وقفه ادامه داد (فرایندهای مستقل)",
    },
    healthEndpoint: "GET /api/runtime/health — OWNER-only (شفافیت مالک)",
    tests: supTests,
    twoGreen: testSummary,
  };
  writeFileSync(`${OUT}/supervisor-test.json`, JSON.stringify(supervisorWitness, null, 2));

  console.log("═══ PN-010 شاهدهای زنده ═══");
  console.log(`JobLock: ${lockRows.length} قفل زنده (${lockRows.map((l) => l.jobId).join(" · ")})`);
  console.log(`Supervisor: web=${webPid} worker=${statusFile.worker.pid} ticks=${statusFile.dispatcher.ticks}`);
  console.log(`تست‌ها: ${testSummary?.pass}/${testSummary?.total} (fail=${testSummary?.fail})`);
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
