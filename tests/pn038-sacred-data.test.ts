/**
 * تست قانون دادهٔ مقدس (PN-038 · فاز ۱ — شورا-ن۰۶۳)
 * ------------------------------------------------------
 * پوشش:
 *   A) گارد مقدس (sacred-data-guard.ts) — داوری سه‌لایه با اجرای واقعی اسکریپت
 *   B) اتصال گارد به ۴ مسیر بازیابی (restore/recovery-guard/p6549/auto-recovery)
 *   C) صفر-حذف در سینک (audit-data-sacred سبز)
 *   D) کار بکاپ مقدس در Worker + رفتار runSacredBackup روی DB تست
 * اجرا: bun test tests/pn038-sacred-data.test.ts
 */

import { beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { Database } from "bun:sqlite";

const GUARD = join(import.meta.dir, "../scripts/recovery/sacred-data-guard.ts");
const SCRATCH = "/tmp/pn038-sacred";

function makeDb(file: string, props: number, mtime?: Date): void {
  rmSync(file, { force: true });
  const db = new Database(file);
  db.run("CREATE TABLE PropertyRecord (id TEXT)");
  for (let i = 0; i < props; i++) db.run("INSERT INTO PropertyRecord VALUES (?)", [`x${i}`]);
  db.close();
  if (mtime) {
    // mtime پس از بسته‌شدن — history دست‌نخورده (ایزوله از ساخت)
    const { utimesSync } = require("node:fs") as typeof import("node:fs");
    utimesSync(file, mtime, mtime);
  }
}

async function runGuard(candidate: string, live: string): Promise<{ code: number; out: string }> {
  const p = Bun.spawnSync(["bun", GUARD, candidate, "--live", live], { stdout: "pipe", stderr: "pipe" });
  return { code: p.exitCode ?? -1, out: p.stdout.toString() + p.stderr.toString() };
}

beforeAll(() => {
  mkdirSync(SCRATCH, { recursive: true });
});

describe("PN-038/A — گارد مقدس: داوری سه‌لایه", () => {
  test("A-1 زنده پرتر ⇒ BLOCK (live-richer-rowcounts)", async () => {
    const live = join(SCRATCH, "rich-live.db");
    const cand = join(SCRATCH, "poor-cand.db");
    const old = new Date(Date.now() - 86400000); // دیروز
    makeDb(live, 500, old);
    makeDb(cand, 100, old);
    const r = await runGuard(cand, live);
    expect(r.code).toBe(2);
    expect(r.out).toContain("BLOCK");
  });

  test("A-2 نامزد جدول را ندارد که زنده پر است ⇒ BLOCK", async () => {
    const live = join(SCRATCH, "tab-live.db");
    const cand = join(SCRATCH, "tab-cand.db");
    const now = new Date();
    makeDb(live, 50, now);
    makeDb(cand, 50, now);
    // نامزد جدول RequestRecord ندارد — زنده دارد
    const l = new Database(live); l.run("CREATE TABLE RequestRecord (id TEXT)"); l.run("INSERT INTO RequestRecord VALUES ('r1')"); l.close();
    const r = await runGuard(cand, live);
    expect(r.code).toBe(2);
  });

  test("A-3 شمارش برابر + نامزد تازه‌تر ⇒ ALLOW (بازیابی سالم)", async () => {
    const live = join(SCRATCH, "eq-live.db");
    const cand = join(SCRATCH, "eq-cand.db");
    const old = new Date(Date.now() - 7200000); // ۲ ساعت پیش
    makeDb(live, 100, old);
    makeDb(cand, 100, new Date()); // تازه
    const r = await runGuard(cand, live);
    expect(r.code).toBe(0);
    expect(r.out).toContain("ALLOW");
  });

  test("A-4 شمارش برابر + زنده فقط چند دقیقه جدیدتر (پنجرهٔ VACUUM) ⇒ ALLOW", async () => {
    const live = join(SCRATCH, "vac-live.db");
    const cand = join(SCRATCH, "vac-cand.db");
    makeDb(cand, 100, new Date(Date.now() - 300000)); // ۵ دقیقه پیش
    makeDb(live, 100, new Date()); // الان (VACUUM تازه)
    const r = await runGuard(cand, live);
    expect(r.code).toBe(0);
  });

  test("A-5 زنده نیست ⇒ ALLOW (بازیابی DB گم‌شده)", async () => {
    const cand = join(SCRATCH, "gone-cand.db");
    makeDb(cand, 10);
    const r = await runGuard(cand, join(SCRATCH, "nonexistent.db"));
    expect(r.code).toBe(0);
  });

  test("A-6 شاهد JSON نوشته می‌شود", async () => {
    const w = "/home/z/my-project/upload/.runtime/sacred-data-guard.json";
    expect(existsSync(w)).toBe(true);
    const j = JSON.parse(await Bun.file(w).text());
    expect(j.guard).toContain("sacred-data-guard");
    expect(["ALLOW", "BLOCK", "OVERRIDE-BLOCK-DISARMED"]).toContain(j.verdict);
  });
});

describe("PN-038/B — اتصال گارد به مسیرهای بازیابی", () => {
  const read = (p: string) => Bun.file(join(import.meta.dir, "..", p)).text();

  test("B-1 restore.sh گارد را با BLOCK-handling صدا می‌زند", async () => {
    const src = await read("scripts/recovery-034/restore.sh");
    expect(src).toContain("sacred-data-guard.ts");
    expect(src).toMatch(/GRC.*-eq 2|BLOCK/);
  });

  test("B-2 recovery-guard.sh مسیر block دارد (DB/WAL دست‌نخورده)", async () => {
    const src = await read("scripts/pn005c/recovery-guard.sh");
    expect(src).toContain("sacred-data-guard.ts");
    expect(src).toContain('SACRED_VERDICT="block"');
  });

  test("B-3 p6549-recovery.sh گارد را صدا می‌زند", async () => {
    const src = await read("scripts/p6549-recovery.sh");
    expect(src).toContain("sacred-data-guard.ts");
  });

  test("B-4 auto-recovery.sh + reset-guard.sh گارد مقدس را می‌شناسند", async () => {
    const a = await read("scripts/recovery/auto-recovery.sh");
    const r = await read("scripts/recovery/reset-guard.sh");
    expect(a).toContain("sacred-data-guard");
    expect(r).toContain("sacred-data-guard");
  });
});

describe("PN-038/C — گارد audit-data-sacred سبز", () => {
  test("C-1 اجرای گارد صفر تخطیف", async () => {
    const p = Bun.spawnSync(["bash", join(import.meta.dir, "../scripts/audit-data-sacred.sh")], { stdout: "pipe", stderr: "pipe" });
    expect(p.exitCode).toBe(0);
    expect(p.stdout.toString()).toContain("PASS");
  });
});

describe("PN-038/D — بکاپ مقدس Worker", () => {
  test("D-1 runSacredBackup: بکاپ اتمی + مانیفست + هرس", async () => {
    const { PrismaClient } = await import("@prisma/client");
    const dir = join(SCRATCH, "backups");
    mkdirSync(dir, { recursive: true });
    // DB تازه در هر اجرا (پیشوند ثابت /tmp بین اجراها می‌ماند)
    rmSync(join(SCRATCH, "sacred-live.db"), { force: true });
    const db = new PrismaClient({ datasources: { db: { url: `file:${join(SCRATCH, "sacred-live.db")}` } } });
    // ساخت جدول شاهد
    await db.$executeRawUnsafe("CREATE TABLE IF NOT EXISTS PropertyRecord (id TEXT)");
    await db.$executeRawUnsafe("INSERT INTO PropertyRecord VALUES ('a')");
    // سه بکاپ قدیمی ساختگی (باید هرس شوند با keep=2)
    for (const f of ["sacred-old-1.db", "sacred-old-2.db", "sacred-old-3.db"]) writeFileSync(join(dir, f), "x");
    const { runSacredBackup } = await import("@/core/runtime/jobs");
    const r = await runSacredBackup(db, { keep: 2, backupsDir: dir });
    expect(existsSync(r.created)).toBe(true);
    expect(r.kept.length).toBeLessThanOrEqual(3); // keep=2 + فایل تازه
    expect(r.pruned.length).toBeGreaterThanOrEqual(1); // قدیمی‌ها هرس شدند
    // مانیفست شمارش واقعی
    expect(r.counts["PropertyRecord"]).toBe(1);
    await db.$disconnect();
  });

  test("D-2 کار sacred-backup در رجیستری با فاصلهٔ ۱۵ دقیقه", async () => {
    const { buildWorkerJobs, WORKER_JOB_IDS } = await import("@/core/runtime/jobs");
    const jobs = buildWorkerJobs(null as never);
    const j = jobs.find((x) => x.id === WORKER_JOB_IDS.sacredBackup);
    expect(j).toBeDefined();
    expect(j!.intervalMs).toBe(15 * 60_000);
    expect(j!.firstRunDelayMs).toBeLessThan(60_000);
  });
});
