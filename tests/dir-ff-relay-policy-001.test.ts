/**
 * tests/dir-ff-relay-policy-001.test.ts — سیاست رلهٔ ترموکس در کاشی فایل‌یابی
 * ---------------------------------------------------------------------------
 * دستور مالک (۱۴۰۵/۰۹/۰۱ · DIR-FF-RELAY-POLICY-001):
 *   اولاً-۱) «اسکن دیوار در کاشی فایل‌یابی نیاز به رلهٔ ترموکس ندارد؛ لذا اسکن
 *            دیوار در حالت عادی بدون رلهٔ ترموکس انجام شود.»
 *   اولاً-۲) «فقط زمانی‌که مالک قصد دارد فایل کشف‌شده‌ای را در سامانه ARM ثبت
 *            کند، از طریق رلهٔ ترموکس انجام شود.»
 *
 * پوشش (سه لایهٔ دفاعی + رفتار زندهٔ توابع):
 *   ۱) خلوص مسیر اسکن — روت اسکن، کتابخانهٔ اسکن و کلاینت دیوار: صفر اتصال
 *      به رله/نشست تمام‌ظرفیت؛ میزبان‌ها فقط خانوادهٔ divar.ir
 *   ۲) مسیر ثبت — تنها نقطهٔ اتصال فایل‌یابی به رله: ensureChangesSessionForOperation
 *      پیش از انتقال به آرم + خانواده‌های ثبت در اولویت‌نامهٔ رله
 *   ۳) مرز سخت رله — proxyFetch میزبان غیر-ARM را مستقیم می‌زند؛
 *      enqueueRelayRequest میزبان غیر-ARM را رد می‌کند؛ relayPriorityForUrl
 *      خانواده‌های ثبت را تعاملی/سقف برمی‌گرداند و آدرس دیوار را ۰
 */

import { describe, expect, test, beforeAll } from "bun:test";
import { readFileSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

Object.assign(process.env, {
  NODE_ENV: process.env.NODE_ENV ?? "test",
  DATABASE_URL: process.env.DATABASE_URL ?? "file:/home/z/my-project/db/test.db",
  MELK_TOKEN_KEY: process.env.MELK_TOKEN_KEY ?? "test-only-key-not-a-real-secret",
});

const ROOT = "/home/z/my-project";

/** کد خالص — بدون نظرات (سربرگ‌های مستندسازی سیاست، اثباتِ کد نیستند) */
function codeOf(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")   // نظرات بلوکی
    .replace(/^\s*\/\/.*$/gm, "");        // نظرات خطی
}

const SCAN_ROUTE = readFileSync(join(ROOT, "src/app/api/divar/scan/route.ts"), "utf8");
const SCAN_LIB = readFileSync(join(ROOT, "src/lib/divar/scan.ts"), "utf8");
const DIVAR_CLIENT = readFileSync(join(ROOT, "src/lib/divar/client.ts"), "utf8");
const DIVAR_CONFIG = readFileSync(join(ROOT, "src/lib/divar/config.ts"), "utf8");
const REGISTER_ROUTE = readFileSync(join(ROOT, "src/app/api/divar/ads/[token]/register/route.ts"), "utf8");
const FF_PAGE = readFileSync(join(ROOT, "src/core/tiles/tiles/file-finder/FileFinderPage.tsx"), "utf8");
const RELAY_LIB = readFileSync(join(ROOT, "src/lib/melk-api/relay.ts"), "utf8");
const PROXY_LIB = readFileSync(join(ROOT, "src/lib/melk-api/proxy.ts"), "utf8");

/* ═══════════ اولاً-۱ — اسکن دیوار بدون رلهٔ ترموکس (حالت عادی) ═══════════ */

describe("DIR-FF-RELAY-POLICY-001 · اولاً-۱ — اسکن دیوار بدون رله", () => {
  test("۱-۱ روت اسکن: هیچ ارجاعی به نشست تمام‌ظرفیت یا صف رله ندارد", () => {
    const code = codeOf(SCAN_ROUTE);
    expect(code).not.toContain("ensureChangesSessionForOperation");
    expect(code).not.toContain("enqueueRelayRequest");
    expect(code).not.toContain("melk-api/relay");
    // مستندسازی سیاست مالک در سربرگ روت (نظر — جدا از کد)
    expect(SCAN_ROUTE).toContain("DIR-FF-RELAY-POLICY-001");
  });

  test("۱-۲ کتابخانهٔ اسکن (scan.ts): صفر واژهٔ relay — اسکن همیشه مستقیم است", () => {
    expect(codeOf(SCAN_LIB)).not.toMatch(/\brelay\b/i);
    // مسیرهای ورودی اسکن: فقط کتابخانهٔ خود دیوار
    expect(SCAN_LIB).toContain("webSearchTabriz");
    expect(SCAN_LIB).toContain("webGetPostDetail");
  });

  test("۱-۳ کلاینت دیوار: fetch مستقیم — بدون صف رله و بدون میزبان آرم", () => {
    const code = codeOf(DIVAR_CLIENT);
    expect(code).not.toContain("enqueueRelayRequest");
    expect(code).not.toContain("relayFetch");
    expect(code).not.toContain("melketabriz");
    expect(code).toMatch(/await fetch\(/);
  });

  test("۱-۴ پیکربندی دیوار: میزبان‌ها فقط خانوادهٔ divar.ir — هرگز melketabriz", () => {
    expect(DIVAR_CONFIG).not.toContain("melketabriz");
    expect(DIVAR_CONFIG).toContain("https://divar.ir");
    expect(DIVAR_CONFIG).toContain("api.divar.ir");
  });

  test("۱-۵ دکمهٔ «اسکن دیوار» در UI فقط روت اسکن را صدا می‌زند (نه نشست رله)", () => {
    const runScanIdx = FF_PAGE.indexOf("const runScan = async () => {");
    expect(runScanIdx).toBeGreaterThan(0);
    const runScanBody = FF_PAGE.slice(runScanIdx, FF_PAGE.indexOf("setScanning(false);", runScanIdx));
    expect(runScanBody).toContain('"/api/divar/scan"');
    expect(runScanBody).not.toContain("changes/session");
    expect(runScanBody).not.toContain("toggleCapacitySession");
  });

  test("۱-۶ سربرگ کاشی: سیاست مالک رابعاً ثبت شده است", () => {
    expect(FF_PAGE).toContain("DIR-FF-RELAY-POLICY-001");
    expect(FF_PAGE).toContain("اسکن دیوار به رلهٔ ترموکس نیازی ندارد");
  });
});

/* ═══════════ اولاً-۲ — ثبت فایل کشف‌شده در ARM از طریق رلهٔ ترموکس ═══════════ */

describe("DIR-FF-RELAY-POLICY-001 · اولاً-۲ — ثبت در ARM از طریق رله", () => {
  test("۲-۱ روت ثبت: تنها نقطهٔ اتصال فایل‌یابی به رله (نشست تمام‌ظرفیت)", () => {
    expect(REGISTER_ROUTE).toContain('from "@/lib/changes/session"');
    expect(REGISTER_ROUTE).toContain("ensureChangesSessionForOperation");
    // پیش از اجرای انتقال به آرم، نشست فعال می‌شود (ترتیب در فایل)
    const sessIdx = REGISTER_ROUTE.indexOf("await ensureChangesSessionForOperation(");
    const xferIdx = REGISTER_ROUTE.indexOf("transferListingToCrm(");
    expect(sessIdx).toBeGreaterThan(0);
    expect(xferIdx).toBeGreaterThan(sessIdx);
    expect(REGISTER_ROUTE).toContain("DIR-FF-RELAY-POLICY-001");
  });

  test("۲-۲ هیچ روت دیگری از فایل‌یابی به نشست/رله متصل نیست — register یگانه است", () => {
    const divarRoutes = [
      "src/app/api/divar/scan/route.ts",
      "src/app/api/divar/locations/route.ts",
      "src/app/api/divar/ads/route.ts",
      "src/app/api/divar/ads/[token]/route.ts",
      "src/app/api/divar/ads/[token]/reject/route.ts",
      "src/app/api/divar/settings/route.ts",
      "src/app/api/divar/connection/route.ts",
    ];
    for (const rel of divarRoutes) {
      const src = readFileSync(join(ROOT, rel), "utf8");
      expect(codeOf(src), `${rel} نباید به نشست/رله متصل باشد`).not.toContain("ensureChangesSessionForOperation");
      expect(codeOf(src), `${rel} نباید به رله متصل باشد`).not.toContain("melk-api/relay");
    }
  });
});

/* ═══════════ مرز سخت رله — رفتار زندهٔ توابع (واحد) ═══════════ */

describe("DIR-FF-RELAY-POLICY-001 · مرز سخت رله — توابع زنده", () => {
  let proxy: typeof import("@/lib/melk-api/proxy");
  let relay: typeof import("@/lib/melk-api/relay");
  let tmpRuntime: string;

  beforeAll(() => {
    proxy = require("@/lib/melk-api/proxy");
    relay = require("@/lib/melk-api/relay");
    // دایرکتوری اجرایی ایزوله برای کنترل «حالت تمام‌ظرفیت» در آزمون اولویت
    tmpRuntime = mkdtempSync(join(tmpdir(), "ff-relay-policy-"));
    process.env.MELK_LCPP_RUNTIME_DIR = tmpRuntime;
  });

  test("۳-۱ آدرس دیوار میزبانِ رله نیست (isMelkTabrizHost = false)", () => {
    expect(proxy.isMelkTabrizHost("https://api.divar.ir/v8/postlist/w/search")).toBe(false);
    expect(proxy.isMelkTabrizHost("https://divar.ir/s/tabriz")).toBe(false);
    expect(proxy.isMelkTabrizHost("https://open-api.divar.ir/v2/open-platform/finder/post")).toBe(false);
    // میزبان آرم هست (کنترل مثبت)
    expect(proxy.isMelkTabrizHost("https://arus-api.melketabriz.ir/api/apm/properties/create")).toBe(true);
  });

  test("۳-۲ گارد enqueueRelayRequest: میزبان غیر-ARM (دیوار) هرگز پذیرفته نمی‌شود", async () => {
    await expect(
      relay.enqueueRelayRequest({
        method: "GET",
        url: "https://api.divar.ir/v8/postlist/w/search",
        source: "test-ff-policy",
      })
    ).rejects.toThrow("host not allowed");
  });

  test("۳-۳ اولویت رله: خانواده‌های ثبت آرم تعاملی (۵) — آدرس دیوار صفر", () => {
    // ثبت آگهی: جستجو/ایجاد مالک + ثبت نهایی
    expect(relay.relayPriorityForUrl("https://arus-api.melketabriz.ir/api/apm/users/info/mobile-number/989144018677")).toBe(5);
    expect(relay.relayPriorityForUrl("https://arus-api.melketabriz.ir/api/apm/users/create")).toBe(5);
    expect(relay.relayPriorityForUrl("https://arus-api.melketabriz.ir/api/apm/properties/create")).toBe(5);
    // آدرس دیوار هرگز اولویت رله نمی‌گیرد
    expect(relay.relayPriorityForUrl("https://api.divar.ir/v8/postlist/w/search")).toBe(0);
  });

  test("۳-۴ در نشست تمام‌ظرفیت (ثبت)، نوشتارهای آرم اولویت سقف (۱۰) می‌گیرند", () => {
    // شبیه‌سازی نشست فعال — عین beginChangesSession ولی بدون db
    const now = new Date();
    const session = {
      version: 1,
      startedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 30 * 60_000).toISOString(),
      actor: "TEST",
      note: "ff-relay-policy fixture",
    };
    writeFileSync(join(tmpRuntime, "changes-session.json"), JSON.stringify(session), "utf8");
    try {
      expect(relay.relayPriorityForUrl("https://arus-api.melketabriz.ir/api/apm/properties/create")).toBe(10);
      expect(relay.relayPriorityForUrl("https://arus-api.melketabriz.ir/api/apm/users/info/mobile-number/989144018677")).toBe(10);
    } finally {
      // پایان نشست — بازگشت به حالت عادی
      const { unlinkSync } = require("node:fs") as typeof import("node:fs");
      unlinkSync(join(tmpRuntime, "changes-session.json"));
    }
    // پس از پایان نشست: خانوادهٔ تغییرات/ثبت به تعاملی (۵) بازمی‌گردد
    expect(relay.relayPriorityForUrl("https://arus-api.melketabriz.ir/api/apm/properties/create")).toBe(5);
  });

  test("۳-۵ proxyFetch میزبان غیر-ARM را مستقیم می‌زند (خط اول تابع)", () => {
    expect(PROXY_LIB).toContain("if (!isMelkTabrizHost(url)) return fetch(url, init);");
  });

  test("۳-۶ صف رله فقط با میزبان مجاز آرم پر می‌شود (گارد کد)", () => {
    expect(RELAY_LIB).toContain('if (!isMelkTabrizHost(params.url)) throw new Error("relay: host not allowed");');
  });
});
