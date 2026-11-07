/**
 * تست قلعهٔ داده (PN-041 · شورا-ن۰۶۷)
 * ------------------------------------------------------
 * پوشش:
 *   A) runRollingBackup — ساخت/هرس/مانیفست/AuditLog روی DB تست
 *   B) runSacredBackup — مقصد پایدار upload/.data/sacred + نگه‌داری ۵ نسل
 *   C) منسوخ در PN-042 (جلسهٔ ۰۷۰) — db-fortress-guard حذف شد؛ زنجیرهٔ بازیابی به resurrect-ultimate.sh منتقل شد
 *   D) منسوخ در PN-042 — recover-all.sh حذف شد؛ دستور یک‌خطی مالک: curl رستاخیز از گیت‌هاب
 *   E) Workflow ابری — وجود + قانون دادهٔ مقدس + هرس ۳ نسخه
 *   F) احراز Bearer مالک (db-export) — زمان-ثابت
 *   G) حل‌کنندهٔ مسیر زنده (live-db-path.sh) — اولویت قلعه
 *   H) اتصال بوت — راهنمای رستاخیز در dev-entry (PN-042) + watchdog محلی-اول
 * اجرا: bun test tests/pn041-data-fortress.test.ts
 */

import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, existsSync, readFileSync, chmodSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Database } from "bun:sqlite";

const ROOT = join(import.meta.dir, "..");
const SCRATCH = "/tmp/pn041-fortress";
const SANDBOX = join(SCRATCH, "repo"); // شبیه‌ساز REPO_DIR برای تست اسکریپت

function makeDb(file: string, props: number, extra = false): void {
  rmSync(file, { force: true });
  mkdirSync(join(file, ".."), { recursive: true });
  const db = new Database(file);
  db.run("CREATE TABLE IF NOT EXISTS PropertyRecord (id TEXT)");
  for (let i = 0; i < props; i++) db.run("INSERT INTO PropertyRecord VALUES (?)", [`x${i}`]);
  if (extra) {
    db.run("CREATE TABLE IF NOT EXISTS RequestRecord (id TEXT)");
    db.run("INSERT INTO RequestRecord VALUES ('r1')");
  }
  db.close();
}

async function runDb(): Promise<import("@prisma/client").PrismaClient> {
  const { PrismaClient } = await import("@prisma/client");
  return new PrismaClient();
}

async function runScript(cmd: string[], env: Record<string, string> = {}): Promise<{ code: number; out: string }> {
  const p = Bun.spawnSync(cmd, {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...env },
  });
  return { code: p.exitCode ?? -1, out: p.stdout.toString() + p.stderr.toString() };
}

beforeAll(() => {
  rmSync(SCRATCH, { recursive: true, force: true });
  mkdirSync(SANDBOX, { recursive: true });
  // شبیه‌ساز: اسکریپت‌ها از مخزن اصلی (سیم‌لینک) · ساختار upload اختصاصی
  rmSync(join(SANDBOX, "scripts"), { force: true });
  Bun.spawnSync(["ln", "-s", join(ROOT, "scripts"), join(SANDBOX, "scripts")]);
  mkdirSync(join(SANDBOX, "upload/.data/rolling"), { recursive: true });
  mkdirSync(join(SANDBOX, "upload/.survival/PN-TEST-1/db"), { recursive: true });
  // دیوار تست: گارد مقدس خاموش در sandbox تا داوری مستقل گارد قلعه آزموده شود
});

afterAll(() => {
  rmSync(SCRATCH, { recursive: true, force: true });
});

/* ═══════ A) بکاپ چرخشی (فاز ۲) ═══════ */
describe("PN-041/A — runRollingBackup", () => {
  test("A-1 ساخت اسنپ‌شات + مانیفست + AuditLog", async () => {
    const db = await runDb();
    try {
      const dir = join(SCRATCH, "rolling-a");
      const r = await (await import("@/core/runtime/jobs")).runRollingBackup(db, { rollingDir: dir, keep: 3 });
      expect(r.created).toContain("live-");
      expect(existsSync(r.created)).toBe(true);
      expect(r.integrity).toBe("1");
      expect(r.counts.PropertyRecord).toBeGreaterThan(0);
      // مانیفست
      const manifest = JSON.parse(readFileSync(join(ROOT, "upload/.runtime/rolling-backups.json"), "utf8"));
      expect(manifest.created).toContain("live-");
      expect(manifest.counts.PropertyRecord).toBeGreaterThan(0);
      // AuditLog
      const last = await db.auditLog.findFirst({ where: { action: "ROLLING_BACKUP" }, orderBy: { id: "desc" } });
      expect(last?.actor).toBe("worker:rolling-backup");
      expect(String(last?.detail)).toContain("live-");
    } finally {
      await db.$disconnect();
    }
  });

  test("A-2 هرس: نگه‌داری فقط N نسخهٔ اخیر", async () => {
    const db = await runDb();
    try {
      const dir = join(SCRATCH, "rolling-b");
      for (let i = 0; i < 5; i++) {
        await (await import("@/core/runtime/jobs")).runRollingBackup(db, { rollingDir: dir, keep: 2 });
      }
      const files = readdirSync(dir).filter((f) => f.startsWith("live-") && f.endsWith(".db"));
      expect(files.length).toBe(2);
    } finally {
      await db.$disconnect();
    }
  });

  test("A-3 پیشوند live- فقط — بکاپ‌های sacred لمس نمی‌شوند", async () => {
    const db = await runDb();
    try {
      const dir = join(SCRATCH, "rolling-c");
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "sacred-keepme.db"), "x");
      await (await import("@/core/runtime/jobs")).runRollingBackup(db, { rollingDir: dir, keep: 2 });
      expect(existsSync(join(dir, "sacred-keepme.db"))).toBe(true);
      const live = readdirSync(dir).filter((f) => f.startsWith("live-") && f.endsWith(".db"));
      expect(live.length).toBe(1);
    } finally {
      await db.$disconnect();
    }
  });

  test("A-4 کار Worker ثبت شده با فاصلهٔ ۵ دقیقه", async () => {
    const { buildWorkerJobs, WORKER_JOB_IDS } = await import("@/core/runtime/jobs");
    const db = await runDb();
    try {
      const jobs = buildWorkerJobs(db);
      const rolling = jobs.find((j) => j.id === WORKER_JOB_IDS.rollingBackup);
      expect(rolling).toBeDefined();
      expect(rolling!.intervalMs).toBe(5 * 60_000);
      expect(rolling!.firstRunDelayMs).toBeLessThanOrEqual(30_000);
    } finally {
      await db.$disconnect();
    }
  });
});

/* ═══════ B) بکاپ مقدس پایدار (فاز ۳) ═══════ */
describe("PN-041/B — runSacredBackup در منطقهٔ پایدار", () => {
  test("B-1 مقصد پیش‌فرض = upload/.data/sacred (تأیید منبع)", async () => {
    const src = await Bun.file(join(ROOT, "src/core/runtime/jobs.ts")).text();
    expect(src).toContain('join(REPO_ROOT, "upload/.data/sacred")');
    expect(src).toContain('MELK_SACRED_BACKUP_KEEP ?? "5"');
  });

  test("B-2 نگه‌داری ۵ نسل با پیشوند sacred- در دایرکتوری اختصاصی", async () => {
    const db = await runDb();
    try {
      const dir = join(SCRATCH, "sacred-b");
      for (let i = 0; i < 8; i++) {
        await (await import("@/core/runtime/jobs")).runSacredBackup(db, { backupsDir: dir, keep: 5 });
      }
      const files = readdirSync(dir).filter((f) => f.startsWith("sacred-") && f.endsWith(".db"));
      expect(files.length).toBe(5);
    } finally {
      await db.$disconnect();
    }
  });
});

/* ═══════ C/D) منسوخ در PN-042 (جلسهٔ ۰۷۰) — سازوکارهای موازی حذف شدند ═══════ */

/* ═══════ E) Workflow ابری (فاز ۴) ═══════ */
describe("PN-041/E — .github/workflows/db-backup.yml", () => {
  test("E-1 وجود + زمان‌بندی روزانه + قانون مقدس + هرس ۳", async () => {
    const f = join(ROOT, ".github/workflows/db-backup.yml");
    expect(existsSync(f)).toBe(true);
    const src = await Bun.file(f).text();
    expect(src).toContain("cron: '0 3 * * *'");
    expect(src).toContain("workflow_dispatch");
    expect(src).toContain("MIN_RECORDS");
    expect(src).toContain("/api/admin/db-export");
    expect(src).toContain("gz");
    // قانون دادهٔ مقدس: کوچک‌تر از آخرین Release → صفر پوش
    expect(src).toContain("zero-push sacred law");
    // هرس: نگه‌داری ۳
    expect(src).toContain("tail -n +4");
  });
});

/* ═══════ F) احراز Bearer مالک (db-export) ═══════ */
describe("PN-041/F — verifyOwnerBearerToken", () => {
  // کد آزمایشی ساختگی — هرگز کد واقعی مالک در تست نمی‌نشیند (قاعدهٔ ۱۲ جلسهٔ ۰۳۴)
  const CODE = "99990011";

  test("F-1 توکن درست → true", async () => {
    const { verifyOwnerBearerToken } = await import("@/lib/melk-api/db-export");
    expect(verifyOwnerBearerToken(`Bearer ${CODE}`, CODE)).toBe(true);
    expect(verifyOwnerBearerToken(`bearer ${CODE}`, CODE)).toBe(true); // case-insensitive
  });

  test("F-2 غایب/نادرست/طول‌متفاوت → false", async () => {
    const { verifyOwnerBearerToken } = await import("@/lib/melk-api/db-export");
    expect(verifyOwnerBearerToken(null, CODE)).toBe(false);
    expect(verifyOwnerBearerToken("Bearer wrong-code", CODE)).toBe(false);
    expect(verifyOwnerBearerToken("Bearer " + CODE.slice(0, 4), CODE)).toBe(false);
    expect(verifyOwnerBearerToken("Basic xyz", CODE)).toBe(false);
    expect(verifyOwnerBearerToken(`Bearer ${CODE}`, undefined)).toBe(false);
    expect(verifyOwnerBearerToken(`Bearer ${CODE}`, "different-master")).toBe(false);
  });

  test("F-3 شکل لاگ بدون افشای راز", async () => {
    const { bearerTokenShape } = await import("@/lib/melk-api/db-export");
    expect(bearerTokenShape(null)).toBe("none");
    expect(bearerTokenShape(`Bearer ${CODE}`)).toBe("bearer:<hidden>");
    expect(bearerTokenShape("weird")).not.toContain(CODE);
  });
});

/* ═══════ G) حل‌کنندهٔ مسیر زنده ═══════ */
describe("PN-041/G — live-db-path.sh (معماری PN-041-R · شورا-ن۰۶۸)", () => {
  test("G-1 زندهٔ محلی موجود → اولویت؛ غایب → fallback قلعهٔ ossfs", async () => {
    // مخزن اصلی: زندهٔ محلی موجود است (معماری شورا-ن۰۶۸)
    const r1 = await runScript(["bash", join(ROOT, "scripts/recovery/live-db-path.sh")]);
    expect(r1.out.trim()).toBe(join(ROOT, "db/custom.db"));

    // sandbox: زندهٔ محلی غایب → fallback به قلعهٔ ossfs (فقط upload موجود است)
    const sandbox3 = join(SCRATCH, "repo3");
    rmSync(sandbox3, { recursive: true, force: true });
    mkdirSync(join(sandbox3, "upload/.data"), { recursive: true });
    makeDb(join(sandbox3, "upload/.data/custom.db"), 10);
    const r2 = await runScript(["bash", join(ROOT, "scripts/recovery/live-db-path.sh")], { REPO_DIR: sandbox3 });
    expect(r2.out.trim()).toContain("upload/.data/custom.db");
  });
});

/* ═══════ H) اتصال بوت و watchdog ═══════ */
describe("PN-041/H — اتصال بوت (Boot Guard) و watchdog", () => {
  test("H-1 dev-entry (PN-042): راهنمای رستاخیز + حذف قلاب‌های بازیابی خودکار", async () => {
    const src = await Bun.file(join(ROOT, "scripts/pn006/dev-entry.sh")).text();
    expect(src).toContain("resurrect-ultimate.sh");
    expect(src).toContain("curl -fsSL");
    expect(src).not.toContain("github-supreme-guard.sh");
    expect(src).not.toContain("db-fortress-guard.sh");
  });

  test("H-2 prod-watchdog: اولویت قلعه + ensure-WAL + پروب سرآیند", async () => {
    const src = await Bun.file(join(ROOT, "scripts/prod-watchdog.sh")).text();
    expect(src).toContain('FORTRESS_DB="/home/z/my-project/upload/.data/custom.db"');
    expect(src).toContain('DATABASE_URL="$LIVE_DB_URL"');
    expect(src).toContain("ensure-wal.ts");
    expect(src).toContain("SQLite format 3");
  });

  test("H-3 env.platform.json: مسیر زندهٔ محلی رسمی (شورا-ن۰۶۸) + پارامترهای اتصال", async () => {
    const d = JSON.parse(readFileSync(join(ROOT, "env.platform.json"), "utf8"));
    expect(d.DATABASE_URL).toBe("file:/home/z/my-project/db/custom.db?connection_limit=1&socket_timeout=30");
  });
});
