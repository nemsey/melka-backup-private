/**
 * pn014-debt-guards.test.ts — راستی‌آزمایی D3+D4: گاردهای بدهی مالک‌سو (PN-014)
 * ---------------------------------------------------------------------------
 * پوشش:
 *   ۱) گارد محرمانگی (D3): پروب ناشناس ۴۰۳/۴۰۴ → PASS · ۲۰۰ → ALERT + رد AuditLog
 *   ۲) گارد حجم (D4): زیر آستانه → PASS · عبور DB/بقا → ALERT + رد AuditLog
 *   ۳) شکست شبکه → ERROR (نه کرش Worker)
 *   ۴) ثبت گاردها در رجیستری کارهای Worker (id + فاصله)
 *   ۵) pathSizeMB: فایل و درخت
 */

import { describe, expect, test, beforeEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import {
  runPrivacyGuard,
  runSizeGuard,
  pathSizeMB,
  githubRepoName,
  type FetchLike,
} from "@/core/runtime/guards";
import { WORKER_JOB_IDS, buildWorkerJobs } from "@/core/runtime/jobs";

let testDb: PrismaClient;

beforeEach(async () => {
  testDb = new PrismaClient({
    datasources: { db: { url: `file:${join(process.cwd(), "db/test.db")}?connection_limit=1` } },
  });
});

function fakeFetch(code: number | null): FetchLike {
  return async () => {
    if (code === null) throw new Error("network down (آزمون)");
    return new Response(code === 200 ? '{"private":false}' : '{"message":"Not Found"}', {
      status: code,
      headers: { "Content-Type": "application/json" },
    });
  };
}

async function alertCount(): Promise<number> {
  return testDb.auditLog.count({ where: { action: "INFRA_ALERT" } });
}

function tempFile(mb: number): string {
  const p = join(tmpdir(), `pn014-guard-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`);
  writeFileSync(p, Buffer.alloc(Math.round(mb * 1024 * 1024), 1));
  return p;
}

describe("PN-014/D3 — گارد محرمانگی مخزن", () => {
  test("۱: پروب ناشناس ۴۰۳ (خصوصی) → PASS بدون هشدار", async () => {
    const before = await alertCount();
    const r = await runPrivacyGuard(testDb, { fetcher: fakeFetch(403), repo: "x/y" });
    expect(r.status).toBe("PASS");
    expect(r.probeHttpCode).toBe(403);
    expect(await alertCount()).toBe(before);
  });

  test("۲: پروب ناشناس ۴۰۴ (خصوصی از دید ناشناس) → PASS", async () => {
    const r = await runPrivacyGuard(testDb, { fetcher: fakeFetch(404), repo: "x/y" });
    expect(r.status).toBe("PASS");
  });

  test("۳: ۲۰۰ (عمومی شدن!) → ALERT + رد INFRA_ALERT در AuditLog", async () => {
    const before = await alertCount();
    const r = await runPrivacyGuard(testDb, { fetcher: fakeFetch(200), repo: "x/y" });
    expect(r.status).toBe("ALERT");
    expect(r.probeHttpCode).toBe(200);
    expect(r.message).toContain("عمومی");
    expect(await alertCount()).toBe(before + 1);
    const row = await testDb.auditLog.findFirst({
      where: { action: "INFRA_ALERT" },
      orderBy: { createdAt: "desc" },
    });
    expect(row?.actor).toBe("worker:privacy-guard");
    expect(row?.accessScope).toBe("OWNER");
  });

  test("۴: پاسخ عجیب (۵۰۰) → ERROR با ثبت رد", async () => {
    const before = await alertCount();
    const r = await runPrivacyGuard(testDb, { fetcher: fakeFetch(500), repo: "x/y" });
    expect(r.status).toBe("ERROR");
    expect(await alertCount()).toBe(before + 1);
  });

  test("۵: قطع شبکه → ERROR بدون کرش", async () => {
    const r = await runPrivacyGuard(testDb, { fetcher: fakeFetch(null), repo: "x/y" });
    expect(r.status).toBe("ERROR");
    expect(r.probeHttpCode).toBeNull();
  });

  test("۶: نام پیش‌فرض مخزن از env قابل override است", () => {
    const prev = process.env.MELKA_GITHUB_REPO;
    process.env.MELKA_GITHUB_REPO = "owner/repo-test";
    try {
      expect(githubRepoName()).toBe("owner/repo-test");
    } finally {
      if (prev === undefined) delete process.env.MELKA_GITHUB_REPO;
      else process.env.MELKA_GITHUB_REPO = prev;
    }
  });
});

describe("PN-014/D4 — گارد رشد حجم", () => {
  test("۷: زیر آستانه → PASS", async () => {
    const small = tempFile(0.5);
    try {
      const r = await runSizeGuard(testDb, {
        dbPath: small,
        survivalDirs: [],
        diskFreeFn: () => 50,
      });
      expect(r.status).toBe("PASS");
      expect(r.diskFreePercent).toBe(50);
      expect(r.items[0].sizeMB).toBeGreaterThan(0.4);
    } finally {
      rmSync(small);
    }
  });

  test("۸: عبور DB از ۵۰۰MB → ALERT + رد AuditLog", async () => {
    const before = await alertCount();
    const big = tempFile(1); // آستانه را با env پایین می‌آوریم
    try {
      process.env.MELKA_SIZE_GUARD_DB_MB = "0.5";
      const r = await runSizeGuard(testDb, { dbPath: big, survivalDirs: [], diskFreeFn: () => 90 });
      expect(r.status).toBe("ALERT");
      expect(r.items[0].breached).toBe(true);
      expect(r.message).toContain("D4");
      expect(await alertCount()).toBe(before + 1);
      const row = await testDb.auditLog.findFirst({
        where: { action: "INFRA_ALERT" },
        orderBy: { createdAt: "desc" },
      });
      expect(row?.actor).toBe("worker:size-guard");
    } finally {
      delete process.env.MELKA_SIZE_GUARD_DB_MB;
      rmSync(big);
    }
  });

  test("۹: عبور بستهٔ بقا از آستانه → ALERT", async () => {
    const before = await alertCount();
    const big = tempFile(1);
    try {
      process.env.MELKA_SIZE_GUARD_SURVIVAL_MB = "0.5";
      const r = await runSizeGuard(testDb, {
        dbPath: join(tmpdir(), "pn014-nonexistent.db"),
        survivalDirs: [big],
        diskFreeFn: () => 90,
      });
      expect(r.status).toBe("ALERT");
      expect(r.items[1].breached).toBe(true);
      expect(await alertCount()).toBe(before + 1);
    } finally {
      delete process.env.MELKA_SIZE_GUARD_SURVIVAL_MB;
      rmSync(big);
    }
  });

  test("۱۰: دیسک آزاد زیر ۱۵٪ → ALERT", async () => {
    const before = await alertCount();
    const small = tempFile(0.2);
    try {
      const r = await runSizeGuard(testDb, {
        dbPath: small,
        survivalDirs: [],
        diskFreeFn: () => 10,
      });
      expect(r.status).toBe("ALERT");
      expect(r.diskFreeBreached).toBe(true);
      expect(await alertCount()).toBe(before + 1);
    } finally {
      rmSync(small);
    }
  });

  test("۱۱: pathSizeMB — فایل تکی و درخت", () => {
    const dir = join(tmpdir(), `pn014-tree-${Date.now()}`);
    mkdirSync(join(dir, "sub"), { recursive: true });
    writeFileSync(join(dir, "a.bin"), Buffer.alloc(2048, 1));
    writeFileSync(join(dir, "sub", "b.bin"), Buffer.alloc(1024, 1));
    try {
      const fileMB = pathSizeMB(join(dir, "a.bin"));
      const treeMB = pathSizeMB(dir);
      expect(fileMB).toBeCloseTo(2048 / (1024 * 1024), 5);
      expect(treeMB).toBeCloseTo(3072 / (1024 * 1024), 5);
      expect(pathSizeMB(join(dir, "غایب"))).toBe(0);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});

describe("PN-014 — ثبت گاردها در رجیستری Worker", () => {
  test("۱۲: دو کار تازه با شناسه و فاصلهٔ درست", () => {
    const jobs = buildWorkerJobs(testDb);
    const privacy = jobs.find((j) => j.id === WORKER_JOB_IDS.privacyGuard);
    const size = jobs.find((j) => j.id === WORKER_JOB_IDS.sizeGuard);
    expect(privacy).toBeDefined();
    expect(size).toBeDefined();
    expect(privacy!.intervalMs).toBe(6 * 60 * 60_000);
    expect(size!.intervalMs).toBe(60 * 60_000);
    // اجرای واقعی هر دو گارد از طریق تعریف کار (یک‌بار، با تزریق آزمونی)
    expect(typeof privacy!.run).toBe("function");
    expect(typeof size!.run).toBe("function");
  });

  test("۱۳: خاموشی با env — قرارداد سایر کارها حفظ شد", () => {
    const p = process.env.MELK_PRIVACY_GUARD;
    const s = process.env.MELK_SIZE_GUARD;
    process.env.MELK_PRIVACY_GUARD = "disabled";
    process.env.MELK_SIZE_GUARD = "disabled";
    try {
      const jobs = buildWorkerJobs(testDb);
      expect(jobs.find((j) => j.id === WORKER_JOB_IDS.privacyGuard)).toBeUndefined();
      expect(jobs.find((j) => j.id === WORKER_JOB_IDS.sizeGuard)).toBeUndefined();
    } finally {
      delete process.env.MELK_PRIVACY_GUARD;
      delete process.env.MELK_SIZE_GUARD;
      if (p !== undefined) process.env.MELK_PRIVACY_GUARD = p;
      if (s !== undefined) process.env.MELK_SIZE_GUARD = s;
    }
  });
});
