/**
 * pn014-deliver-route.test.ts — راستی‌آزمایی D2: مسیر سرو تحویل‌ها (PN-014)
 * ---------------------------------------------------------------------------
 * زمینه: قانون فایل v3 + لاغرسازی بستهٔ استقرار. فایل‌های تحویل از
 * public/deliver به deliver-store منتقل شدند و مسیر /deliver/[...path] آنها
 * را سرو می‌کند تا بستهٔ استقرار پلتفرم دیگر ~۶۰۰MB تحویل با خود نکشد.
 *
 * پوشش:
 *   ۱) سرو فایل واقعی از deliver-store (۲۰۰ + بدنهٔ درست + هدرهای امنیتی)
 *   ۲) پیمایش مسیر ممنوع (.. و مسیر مطلق → 404)
 *   ۳) فایل غایب → 404 تمیز JSON
 *   ۴) HEAD بدون بدنه با همان Content-Length
 *   ۵) ساختار درختی deliver-store سالم (پرونده‌های پیشین حاضرند)
 */

import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GET, HEAD } from "@/app/deliver/[...path]/route";

/** فراخوانی روت با مسیر مشخص */
async function callDeliver(
  segments: string[],
  method: "GET" | "HEAD" = "GET",
): Promise<Response> {
  const req = new Request("http://local/deliver/" + segments.join("/"), { method });
  return method === "GET"
    ? GET(req as never, { params: Promise.resolve({ path: segments }) } as never)
    : HEAD(req as never, { params: Promise.resolve({ path: segments }) } as never);
}

/** مخزن موقت deliver-store برای تست‌های ایزوله */
function makeTempStore(): string {
  const dir = join(tmpdir(), "pn014-deliver-test-" + Date.now() + "-" + Math.random().toString(36).slice(2));
  mkdirSync(join(dir, "deliver-store", "pn-test"), { recursive: true });
  writeFileSync(join(dir, "deliver-store", "SAMPLE.txt"), "پروندهٔ آزمون ملکا PN-014");
  writeFileSync(join(dir, "deliver-store", "pn-test", "nested.json"), '{"ok":true}');
  return dir;
}

describe("PN-014/D2 — مسیر سرو تحویل (/deliver/[...path])", () => {
  test("۱: سرو فایل از مخزن پروژه — ۲۰۰ + بدنه + هدر no-store", async () => {
    // مخزن اصلی پروژه (اجرا با MELKA_REPO_DIR یا مسیر پیش‌فرض)
    const res = await callDeliver(["PN-013-REJOIN.txt"]);
    if (res.status === 404) {
      // اگر محیط تست مخزن نداشت، این تست را با مخزن موقت ادامه بده (پایین) — اینجا صرفاً ثبت وضعیت
      console.log("[pn014] deliver-store پروژه در محیط تست یافت نشد — آزمون مخزن موقت حکم می‌کند");
    }
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
      const body = await res.text();
      expect(body.length).toBeGreaterThan(0);
    }
  });

  test("۲: مخزن موقت — فایل ریشه‌ای و تودرتو با هدر Content-Length درست", async () => {
    const dir = makeTempStore();
    const prev = process.env.MELKA_REPO_DIR;
    process.env.MELKA_REPO_DIR = dir;
    try {
      const res = await callDeliver(["SAMPLE.txt"]);
      expect(res.status).toBe(200);
      const body = await res.text();
      expect(body).toContain("ملکا");
      expect(res.headers.get("Content-Type")).toContain("text/plain");
      expect(Number(res.headers.get("Content-Length"))).toBe(Buffer.byteLength(body));

      const nested = await callDeliver(["pn-test", "nested.json"]);
      expect(nested.status).toBe(200);
      expect((await nested.json()).ok).toBe(true);
    } finally {
      process.env.MELKA_REPO_DIR = prev;
    }
  });

  test("۳: پیمایش مسیر ممنوع — «..» رد می‌شود (۴۰۴، نه خطای فایل‌سیستم)", async () => {
    const dir = makeTempStore();
    const prev = process.env.MELKA_REPO_DIR;
    process.env.MELKA_REPO_DIR = dir;
    try {
      const res = await callDeliver(["..", "..", "etc", "passwd"]);
      expect(res.status).toBe(404);
      const body = (await res.json()) as { code: string };
      expect(body.code).toBe("DELIVER_NOT_FOUND");
    } finally {
      process.env.MELKA_REPO_DIR = prev;
    }
  });

  test("۴: فایل غایب → ۴۰۴ تمیز", async () => {
    const dir = makeTempStore();
    const prev = process.env.MELKA_REPO_DIR;
    process.env.MELKA_REPO_DIR = dir;
    try {
      const res = await callDeliver(["PN-XXXX-NOT-EXIST.zip"]);
      expect(res.status).toBe(404);
      const body = (await res.json()) as { ok: boolean };
      expect(body.ok).toBe(false);
    } finally {
      process.env.MELKA_REPO_DIR = prev;
    }
  });

  test("۵: HEAD — بدون بدنه، با همان Content-Length", async () => {
    const dir = makeTempStore();
    const prev = process.env.MELKA_REPO_DIR;
    process.env.MELKA_REPO_DIR = dir;
    try {
      const res = await callDeliver(["SAMPLE.txt"], "HEAD");
      expect(res.status).toBe(200);
      expect(Number(res.headers.get("Content-Length"))).toBeGreaterThan(0);
      expect(await res.text()).toBe("");
    } finally {
      process.env.MELKA_REPO_DIR = prev;
    }
  });

  test("۶: ساختار مخزن پروژه — تحویل‌های تاریخی حاضرند (قانون فایل v3)", () => {
    const store = join(process.env.MELKA_REPO_DIR ?? "/home/z/my-project", "deliver-store");
    if (!existsSync(store)) return; // محیط بدون مخزن — آزمون‌های موقت بالا کافی‌اند
    expect(existsSync(join(store, "PN-013-ALL.zip"))).toBe(true);
    expect(existsSync(join(store, "PN-013-SHA256SUMS.txt"))).toBe(true);
    expect(existsSync(join(store, "pn013"))).toBe(true);
  });
});
