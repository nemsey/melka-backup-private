/**
 * pn020-h2-disk-guard.test.ts — PN-020/H2 — گارد فضای دیسک + هرس خودکار نسل‌ها
 * =============================================================================
 * مصوبهٔ جلسهٔ شورای ۰۲۴ (H2 — راه‌حل ساختاری چهارمین ENOSPC):
 *   · آستانهٔ هشدار ۲۰٪ / بحرانی ۱۰٪
 *   · هرس «بستهٔ بقا»: نگه‌داشت ۵ نسل آخر (upload/.survival + deliver-store)
 *   · هرس download/: ۳ نسل آخر — فقط ردیابی‌نشده (صفر شکست تاریخچه)
 *   · ثبت رخداد هرس در AuditLog با action=DISK_PRUNE
 */

import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync, rmSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const { db } = await import("@/lib/db");

// ─── fixture ایزوله — ساختار واقعی بدون دست‌زدن به دادهٔ تولید ───
const FIX = "/tmp/pn020-disk-guard-fixture";
function buildFixture(): void {
  rmSync(FIX, { recursive: true, force: true });
  // upload/.survival — ۸ نسل + دو فایل آزاد که هرگز نباید دست بخورند
  mkdirSync(join(FIX, "upload/.survival"), { recursive: true });
  for (const g of ["PN-001-x", "PN-002-x", "PN-003-x", "PN-004-x", "PN-005-x", "PN-006-x", "PN-007-x", "PN-008-x"]) {
    mkdirSync(join(FIX, `upload/.survival/${g}`));
    writeFileSync(join(FIX, `upload/.survival/${g}/survival.db`), "x".repeat(1024));
  }
  writeFileSync(join(FIX, "upload/.survival/recovery-log.jsonl"), "keep-me");
  writeFileSync(join(FIX, "upload/.survival/expected-counts.json"), "keep-me");
  // deliver-store — ۸ نسل قطعه + فراداده‌های سبک
  mkdirSync(join(FIX, "deliver-store"), { recursive: true });
  for (let g = 1; g <= 8; g++) {
    const pad = String(g).padStart(3, "0");
    writeFileSync(join(FIX, `deliver-store/pn${pad}-survival-part00.bin`), "y".repeat(2048));
    writeFileSync(join(FIX, `deliver-store/pn${pad}-survival-part01.bin`), "y".repeat(2048));
    writeFileSync(join(FIX, `deliver-store/pn${pad}-ALL.zip`), "meta"); // سبک — می‌ماند
    writeFileSync(join(FIX, `deliver-store/pn${pad}-SHA256SUMS.txt`), "meta");
  }
  // download — ۵ نسل + پوشه‌های غیر-نسل که می‌مانند
  for (const d of ["pn001", "pn002", "pn003", "pn004", "pn005", "screens"]) {
    mkdirSync(join(FIX, `download/${d}`), { recursive: true });
    writeFileSync(join(FIX, `download/${d}/evidence.json`), "{}");
  }
}

afterAll(async () => {
  rmSync(FIX, { recursive: true, force: true });
  // پاک‌سازی رد هرس — تست‌ها نباید گیت حاکمیت را برای تست‌های بعدی مسموم کنند
  // (GOV-DATA-002: DELETE بدون BACKUP تازه = نقض بحرانی — درس جداسازی تست)
  await db.auditLog.deleteMany({ where: { action: "DISK_PRUNE", actor: "worker:disk-guard" } }).catch(() => undefined);
  await db.$disconnect();
});

describe("PN-020 §H2 — گارد فضای دیسک + هرس خودکار نسل‌ها", () => {
  test("H2-۱) آستانه‌های مصوب شورا: هشدار ۲۰٪ · بحرانی ۱۰٪ · بقا ۵ نسل · download ۳ نسل", async () => {
    const { diskGuardThresholds } = await import("@/core/runtime/guards");
    const th = diskGuardThresholds();
    expect(th.warnPercent).toBe(20);
    expect(th.criticalPercent).toBe(10);
    expect(th.keepSurvivalGens).toBe(5);
    expect(th.keepDownloadGens).toBe(3);
  });

  test("H2-۲) سنجش واقعی فضای آزاد — عددی در بازهٔ (۰، ۱۰۰]", async () => {
    const { readDiskFreePercent } = await import("@/core/runtime/guards");
    const free = readDiskFreePercent("/home/z/my-project");
    expect(free).not.toBeNull();
    expect(free!).toBeGreaterThan(0);
    expect(free!).toBeLessThanOrEqual(100);
  });

  test("H2-۳) دریل منفی: ۸ نسل → هرس به ۵ نسل + فراداده‌های سبک هرگز حذف نمی‌شوند", async () => {
    buildFixture();
    const { runDiskGuard } = await import("@/core/runtime/guards");
    // حالت خشک — هیچ حذفی، فقط نقشه
    const dry = await runDiskGuard(db, { repoRoot: FIX, diskFreeFn: () => 50, apply: false });
    expect(dry.status).toBe("PASS");
    expect(dry.pruned.survivalStagingDirs.length).toBe(3); // ۸ − ۵
    expect(dry.pruned.deliverPartFiles.length).toBe(6); // ۳ نسل × ۲ قطعه
    expect(existsSync(join(FIX, "upload/.survival/PN-001-x"))).toBe(true); // هنوز هست

    // هرس واقعی
    const res = await runDiskGuard(db, { repoRoot: FIX, diskFreeFn: () => 50, apply: true });
    expect(res.status).toBe("PASS");
    expect(res.pruned.survivalStagingDirs.sort()).toEqual(["PN-001-x", "PN-002-x", "PN-003-x"]);
    expect(res.pruned.deliverPartFiles.length).toBe(6);
    // نسل‌های قدیمی حذف، ۵ نسل آخر ماند
    for (const g of ["PN-001-x", "PN-002-x", "PN-003-x"]) {
      expect(existsSync(join(FIX, `upload/.survival/${g}`))).toBe(false);
    }
    for (const g of ["PN-004-x", "PN-005-x", "PN-006-x", "PN-007-x", "PN-008-x"]) {
      expect(existsSync(join(FIX, `upload/.survival/${g}`))).toBe(true);
    }
    // فایل‌های آزاد .survival دست نمی‌خورند (recovery-log و expected-counts)
    expect(existsSync(join(FIX, "upload/.survival/recovery-log.jsonl"))).toBe(true);
    expect(existsSync(join(FIX, "upload/.survival/expected-counts.json"))).toBe(true);
    // قطعات قدیمی حذف؛ ۵ نسل آخر + فراداده‌های سبک همه نسل‌ها می‌مانند
    expect(existsSync(join(FIX, "deliver-store/pn001-survival-part00.bin"))).toBe(false);
    expect(existsSync(join(FIX, "deliver-store/pn008-survival-part00.bin"))).toBe(true);
    expect(existsSync(join(FIX, "deliver-store/pn001-ALL.zip"))).toBe(true); // فراداده سبک — می‌ماند
    expect(existsSync(join(FIX, "deliver-store/pn003-SHA256SUMS.txt"))).toBe(true);
    // idempotent — اجرای دوم هیچ چیزی برای هرس ندارد
    const again = await runDiskGuard(db, { repoRoot: FIX, diskFreeFn: () => 50, apply: true });
    expect(again.pruned.survivalStagingDirs.length).toBe(0);
    expect(again.pruned.deliverPartFiles.length).toBe(0);
  });

  test("H2-۴) وضعیت‌های آستانه — ۲۵٪ = PASS · ۱۵٪ = WARN · ۸٪ = CRITICAL", async () => {
    buildFixture();
    const { runDiskGuard } = await import("@/core/runtime/guards");
    const pass = await runDiskGuard(db, { repoRoot: FIX, diskFreeFn: () => 25, apply: false });
    expect(pass.status).toBe("PASS");
    const warn = await runDiskGuard(db, { repoRoot: FIX, diskFreeFn: () => 15, apply: false });
    expect(warn.status).toBe("WARN");
    const crit = await runDiskGuard(db, { repoRoot: FIX, diskFreeFn: () => 8, apply: false });
    expect(crit.status).toBe("CRITICAL");
    expect(crit.diskFreePercent).toBe(8);
  });

  test("H2-۵) download — محافظه‌کار: در دایرکتوری غیر-git هیچ حذفی انجام نمی‌شود (صفر شکست تاریخچه)", async () => {
    buildFixture();
    const { runDiskGuard } = await import("@/core/runtime/guards");
    const res = await runDiskGuard(db, { repoRoot: FIX, diskFreeFn: () => 50, apply: true });
    // fixture یک مخزن git نیست → بررسی ردیابی شکست می‌خورد → حذف نمی‌شود (سلوک محافظه‌کار)
    expect(res.pruned.downloadDirs.length).toBe(0);
    for (const d of ["pn001", "pn005", "screens"]) {
      expect(existsSync(join(FIX, `download/${d}`))).toBe(true);
    }
  });

  test("H2-۶) ثبت هرس در AuditLog با action=DISK_PRUNE (رد قابل بازرسی)", async () => {
    buildFixture();
    const before = await db.auditLog.count({ where: { action: "DISK_PRUNE" } });
    const { runDiskGuard } = await import("@/core/runtime/guards");
    await runDiskGuard(db, { repoRoot: FIX, diskFreeFn: () => 50, apply: true });
    const after = await db.auditLog.count({ where: { action: "DISK_PRUNE" } });
    expect(after).toBe(before + 1);
    const last = await db.auditLog.findFirst({ where: { action: "DISK_PRUNE" }, orderBy: { id: "desc" } });
    expect(last?.actor).toBe("worker:disk-guard");
    expect(last?.operation).toBe("DELETE");
    // پاک‌سازی هم‌زمان — رد این تست پس از اثبات، حذف می‌شود (GOV-DATA-002 نبیند)
    await db.auditLog.deleteMany({ where: { action: "DISK_PRUNE", actor: "worker:disk-guard" } });
  });

  test("H2-۷) کار سیزدهم Worker ثبت شده — diskGuard با چرخهٔ ۱ ساعته", async () => {
    const { buildWorkerJobs, WORKER_JOB_IDS } = await import("@/core/runtime/jobs");
    const prevDisabled = process.env.MELK_DISK_GUARD;
    delete process.env.MELK_DISK_GUARD;
    const jobs = buildWorkerJobs(db);
    if (prevDisabled !== undefined) process.env.MELK_DISK_GUARD = prevDisabled;
    const disk = jobs.find((j) => j.id === WORKER_JOB_IDS.diskGuard);
    expect(disk).toBeDefined();
    expect(disk!.intervalMs).toBe(60 * 60_000); // هر ۱ ساعت — عین مصوبه
    expect(jobs.length).toBeGreaterThanOrEqual(13); // ۱۲ کار قبلی + تازه
  });

  test("H2-۸) اسکریپت گارد CI — حالت check خشک پاس است (فضای آزاد سالم)", () => {
    const out = Bun.spawnSync(["bash", "scripts/audit-disk-space.sh", "check"], { cwd: "/home/z/my-project" });
    expect(out.exitCode).toBe(0);
    const text = new TextDecoder().decode(out.stdout);
    expect(text).toContain("DISK-SPACE: PASS");
  });
});
