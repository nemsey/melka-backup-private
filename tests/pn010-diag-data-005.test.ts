/**
 * تست‌های ترمیم DIAG-DATA-005 — PN-010 / BLOCK 1 (بند ۱.۴: راستی‌آزمایی)
 * ------------------------------------------------------
 * پوشش: منطق حکم بررسی (۰=قرمز، ۱=زرد، ≥۲=سبز) · نگاشت خودترمیمی P11 ·
 * چرخش بکاپ واقعی (VACUUM + هرس + سلامت) · شمارش معادل سبزی در قرق.
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdirSync, rmSync, existsSync, readdirSync, writeFileSync, utimesSync, statSync } from "node:fs";

const { db } = await import("@/lib/db");
const { SelfDiagnosisEngineImpl, healthySnapshot } = await import("@/core/intelligence/p10-core");
const { repairActionFor } = await import("@/core/intelligence/p11-core");
const { runBackupRotation, REPO_ROOT } = await import("@/core/runtime/jobs");

const SCRATCH = `${REPO_ROOT}/upload/.runtime/test-scratch-diag005`;

function diagFor(backupFiles: number) {
  const engine = new SelfDiagnosisEngineImpl();
  const checks = engine.runAllChecks({ ...healthySnapshot(4), backupFilesPresent: backupFiles });
  return checks.find((c) => c.id === "DIAG-DATA-005")!;
}

beforeAll(async () => {
  mkdirSync(SCRATCH, { recursive: true });
});

afterAll(async () => {
  rmSync(SCRATCH, { recursive: true, force: true });
  await db.$disconnect();
});

describe("PN-010 BLOCK 1 — ترمیم DIAG-DATA-005 (بکاپ‌ها)", () => {
  test("۱-۱ حکم با صفر بکاپ: قرمز (ریشهٔ وضعیت فعلی پیش از ترمیم)", () => {
    const c = diagFor(0);
    expect(c.status).toBe("fail");
  });

  test("۱-۲ حکم با یک بکاپ: زرد", () => {
    const c = diagFor(1);
    expect(c.status).toBe("warn");
  });

  test("۱-۳ حکم با دو بکاپ: سبز (هدف بند ۱.۴)", () => {
    const c = diagFor(2);
    expect(c.status).toBe("pass");
  });

  test("۱-۴ حکم با پنج بکاپ: سبز + آستانهٔ ۲ در جزئیات", () => {
    const c = diagFor(5);
    expect(c.status).toBe("pass");
    expect(c.threshold).toBe(2);
  });

  test("۱-۵ نگاشت خودترمیمی P11: DIAG-DATA-005 → restore_backup با وارسی md5", () => {
    const action = repairActionFor("DIAG-DATA-005");
    expect(action.type).toBe("restore_backup");
    expect((action.parameters as { verifyMd5?: boolean }).verifyMd5).toBe(true);
  });

  test("۱-۶ چرخش بکاپ: فایل تازه ساخته می‌شود (VACUUM معتبر)", async () => {
    const r = await runBackupRotation(db, { backupsDir: SCRATCH, keep: 3 });
    expect(existsSync(r.created)).toBe(true);
    expect(r.created.endsWith(".db")).toBe(true);
    expect(r.kept.length).toBeGreaterThanOrEqual(1);
  });

  test("۱-۷ چرخش بکاپ: هرس به N نسل آخر", async () => {
    // پنج فایل قدیمی ساختگی + یک چرخش تازه → فقط ۳ می‌ماند
    for (let i = 0; i < 5; i++) {
      const old = `${SCRATCH}/old-${i}.db`;
      writeFileSync(old, `old-${i}`);
      const dt = new Date(Date.now() - (10 - i) * 60_000);
      utimesSync(old, dt, dt);
    }
    const r = await runBackupRotation(db, { backupsDir: SCRATCH, keep: 3 });
    expect(r.kept.length).toBe(3);
    expect(r.pruned.length).toBeGreaterThanOrEqual(3);
    expect(readdirSync(SCRATCH).filter((f) => f.endsWith(".db")).length).toBe(3);
  });

  test("۱-۸ چرخش بکاپ: سلامت فایل تازه (integrity ok)", async () => {
    const r = await runBackupRotation(db, { backupsDir: SCRATCH, keep: 2 });
    expect(r.integrity).toBe("ok");
  });

  test("۱-۹ شمارش سبزی: پس از دو چرخش متوالی، معادل DIAG-DATA-005 = pass", async () => {
    await runBackupRotation(db, { backupsDir: SCRATCH, keep: 3 });
    await runBackupRotation(db, { backupsDir: SCRATCH, keep: 3 });
    const count = readdirSync(SCRATCH).filter((f) => f.endsWith(".db") && !f.endsWith("-wal") && !f.endsWith("-shm")).length;
    // همان عبارت شمارش core-cycle (بند DIAG-DATA-005): پوشه + پسوند .db
    expect(count).toBeGreaterThanOrEqual(2);
    expect(diagFor(count).status).toBe("pass");
  });

  test("۱-۱۰ تازگی: بکاپ‌های چرخشی همیشه ≤ ۷ روز (بند ۱.۴)", async () => {
    const r = await runBackupRotation(db, { backupsDir: SCRATCH, keep: 3 });
    const now = Date.now();
    for (const f of r.kept) {
      const ageDays = (now - statSync(`${SCRATCH}/${f}`).mtimeMs) / 86_400_000;
      expect(ageDays).toBeLessThanOrEqual(7);
    }
    // بکاپ تازه همین الان ساخته شده
    const freshAgeDays = (now - statSync(r.created).mtimeMs) / 86_400_000;
    expect(freshAgeDays).toBeLessThan(1 / 24); // کمتر از یک ساعت
  });
});
