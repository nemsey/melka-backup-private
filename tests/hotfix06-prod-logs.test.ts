/**
 * تست‌های HOTFIX-06 — خاموشی لاگ تولید (D1, D2)
 * ------------------------------------------------------
 * پوشش:
 *  D2) singleton: فقط یک نمونه PrismaClient (globalThis cache) — تایمر پس‌زمینه
 *      هم از همان singleton استفاده می‌کند (نه new PrismaClient در هر tick)
 *  D2) سورس‌اسکن: new PrismaClient فقط در lib/db.ts
 *  D1) production: فقط ['error'] — هیچ 'query' در لاگ نیست
 *  D1) development: ['warn', 'error'] — کوئری‌ها لاگ نمی‌شوند
 *  D1) زمان اجرا: کلاینت production حین اجرای کوئری هیچ «prisma:query» چاپ نمی‌کند
 *
 * ⚠️ ترتیب مهم است: تست‌های singleton ابتدا اجرا می‌شوند تا نخستین import ماژول
 *    در حالت عادی توسعه انجام شود (کش globalThis فقط در غیر-production پر می‌شود).
 */

import { describe, expect, test, afterAll } from "bun:test";

const ENV_BACKUP: Record<string, string | undefined> = {};
function setEnv(key: string, value: string | undefined) {
  if (!(key in ENV_BACKUP)) ENV_BACKUP[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
afterAll(() => {
  for (const [k, v] of Object.entries(ENV_BACKUP)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("HOTFIX-06/D2 — singleton بدون PrismaClient در هر tick", () => {
  test("db صادرشده همان نمونه globalThis است (یک نمونه در کل فرایند)", async () => {
    // این تست قبل از هر تنظیم NODE_ENV=production اجرا می‌شود تا ماژول
    // در حالت توسعه کش globalThis را پر کند (رفتار عادی فرایند تست).
    const { db } = await import("@/lib/db");
    const globalCache = (globalThis as unknown as { prisma?: unknown }).prisma;
    expect(globalCache).toBe(db);

    // ایمپورت مجدد همان نمونه را می‌دهد (کش ماژول + globalThis)
    const mod = await import("@/lib/db");
    expect(mod.db).toBe(db);
  });

  test("سورس‌اسکن: new PrismaClient فقط در lib/db.ts (تولیدکننده singleton)", async () => {
    const glob = new Bun.Glob("src/**/*.{ts,tsx}");
    const offenders: string[] = [];
    for (const file of glob.scanSync({ cwd: process.cwd() })) {
      let text = await Bun.file(file).text();
      // حذف کامنت‌ها — تست روی «کد» است
      text = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      if (/new PrismaClient\s*\(/.test(text) && !file.endsWith("lib/db.ts")) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("سورس‌اسکن: هیچ log:['query'] دائمی در src باقی نمانده", async () => {
    const glob = new Bun.Glob("src/**/*.{ts,tsx}");
    const offenders: string[] = [];
    for (const file of glob.scanSync({ cwd: process.cwd() })) {
      let text = await Bun.file(file).text();
      // حذف کامنت‌ها — فقط کد واقعی
      text = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      if (/log\s*:\s*\[\s*['"]query['"]\s*\]/.test(text)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  test("instrumentation: تایمر پس‌زمینه از singleton db استفاده می‌کند (نه new)", async () => {
    const text = await Bun.file("src/instrumentation.ts").text();
    expect(text).toContain('await import("@/lib/db")');
    expect(text).not.toContain("new PrismaClient");
  });
});

describe("HOTFIX-06/D1 — پیکربندی لاگ شرطی", () => {
  test("production → فقط ['error'] (بدون query)", async () => {
    setEnv("NODE_ENV", "production");
    const { resolvePrismaLogConfig } = await import("@/lib/db");
    expect(resolvePrismaLogConfig()).toEqual(["error"]);
  });

  test("development → ['warn', 'error'] (کوئری لاگ نمی‌شود)", async () => {
    setEnv("NODE_ENV", "development");
    const { resolvePrismaLogConfig } = await import("@/lib/db");
    expect(resolvePrismaLogConfig()).toEqual(["warn", "error"]);
    expect(resolvePrismaLogConfig()).not.toContain("query");
  });

  test("زمان اجرا: کلاینت بدون 'query' حین اجرای کوئری هیچ «prisma:query» چاپ نمی‌کند", async () => {
    setEnv("NODE_ENV", "production");
    // singleton از همین فرایند — پیکربندی فعلی آن 'query' ندارد (هم production هم dev)
    const { db } = await import("@/lib/db");

    const logged: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    };
    try {
      await db.session.count(); // یک کوئری واقعی روی singleton
    } finally {
      console.log = originalLog;
    }
    expect(logged.filter((l) => l.includes("prisma:query"))).toEqual([]);
    expect(logged.length).toBe(0); // هیچ خروجی کوئری روی stdout
  });

  test("مقایسه رفتار قدیمی: log=['query'] همان کوئری را چاپ می‌کرد (اثبات اینکه سنجه معنادار است)", async () => {
    const { PrismaClient } = await import("@prisma/client");
    const client = new PrismaClient({ log: [{ emit: "stdout", level: "query" }] });

    const logged: string[] = [];
    const originalLog = console.log;
    console.log = (...args: unknown[]) => {
      logged.push(args.map(String).join(" "));
    };
    try {
      await client.session.count();
    } finally {
      console.log = originalLog;
      await client.$disconnect();
    }
    expect(logged.some((l) => l.includes("prisma:query"))).toBe(true);
  });
});
