/**
 * تست‌های PN-030 — پروکسی عبوری ابری + ورود مجدد به ملک تبریز (شورای عالی ملکا · جلسهٔ فوق‌العاده ۰۳۵)
 * ---------------------------------------------------------------------------
 * پوشش تستی سفارش کار PN-030:
 *   A) ماژول پروکسی proxy.ts (۹) — whitelist · HMAC · قرارداد امضا · نقطهٔ یگانه
 *   B) سورس Worker melka-proxy (۶) — whitelist موازی · زمان-ثابت · ضد replay · صفر لاگ محتوا
 *   C) یکپارچگی client/overview/route (۳) — نقطهٔ یگانه + نمایش وضعیت
 *   D) UI تنظیمات عمومی (۵) — بخش «ورود مجدد» · otp-burn با تأیید · فقط OWNER
 *   E) env + ترتیب کاشی‌ها (۴) — راز ۶۴هگز · قفل ترتیب URL · شاخص ششم/پوشش هفتم
 *   F) سازگاری PN-029 (۲) — گارد آفلینی پابرجا · راز در اسکریپت دیپلای لو نمی‌رود
 *
 * اجرا: bun test tests/pn030-proxy-connection.test.ts
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const REPO = join(import.meta.dir, "..");

// ───────────────────── A) ماژول پروکسی — src/lib/melk-api/proxy.ts (۹) ─────────────────────

describe("PN-030 · A) ماژول پروکسی (proxy.ts)", () => {
  const saved: Record<string, string | undefined> = {};
  beforeAll(() => {
    // PN-031 (شورا-ن۰۳۷): MELK_ARM_RELAY_MODE هم ایزوله می‌شود — حالت رله
    // پیش از تستهای این بلوک باید خاموش باشد تا مسیر Worker ارزیابی شود
    for (const k of ["MELK_ARM_PROXY_URL", "MELK_PROXY_SECRET", "MELK_ARM_RELAY_MODE"]) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });
  afterAll(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  test("A-1) proxyStatus بدون env — پیکربندی نشده و بدون میزبان", async () => {
    const { proxyStatus } = await import("@/lib/melk-api/proxy");
    const s = proxyStatus();
    expect(s.configured).toBe(false);
    expect(s.host).toBeNull();
    expect(s.secretConfigured).toBe(false);
  });

  test("A-2) proxyStatus با URL معتبر — میزبان استخراج و راز شناسایی می‌شود", async () => {
    const { proxyStatus } = await import("@/lib/melk-api/proxy");
    process.env.MELK_ARM_PROXY_URL = "https://melka-proxy.example.workers.dev";
    process.env.MELK_PROXY_SECRET = "a".repeat(64);
    const s = proxyStatus();
    expect(s.configured).toBe(true);
    expect(s.host).toBe("melka-proxy.example.workers.dev");
    expect(s.secretConfigured).toBe(true);
  });

  test("A-3) whitelist میزبان — فقط سه دامنهٔ API ملک تبریز", async () => {
    const { isMelkTabrizHost, MELK_PROXY_ALLOWED_HOSTS } = await import("@/lib/melk-api/proxy");
    expect(MELK_PROXY_ALLOWED_HOSTS).toContain("arus-api.melketabriz.ir");
    expect(MELK_PROXY_ALLOWED_HOSTS).toContain("pm-api.melketabriz.ir");
    expect(MELK_PROXY_ALLOWED_HOSTS).toContain("gap-api.melketabriz.ir");
    expect(isMelkTabrizHost("https://arus-api.melketabriz.ir/api/apm/x")).toBe(true);
    expect(isMelkTabrizHost("https://pm-api.melketabriz.ir/api/y")).toBe(true);
    expect(isMelkTabrizHost("https://gap-api.melketabriz.ir/api/z")).toBe(true);
    // کنترل‌ها و سرویسهای خارجی — مستقیم می‌مانند
    expect(isMelkTabrizHost("https://api.github.com")).toBe(false);
    expect(isMelkTabrizHost("https://api.divar.ir")).toBe(false);
    expect(isMelkTabrizHost("https://evil.melketabriz.ir.attacker.com")).toBe(false);
    expect(isMelkTabrizHost("https://melketabriz.ir")).toBe(false); // دامنهٔ اصلی (وب‌سایت) — فقط API ها پروکسی می‌شوند
    expect(isMelkTabrizHost("not a url")).toBe(false);
  });

  test("A-4) hmacSignHex — خروجی هگز ۶۴ کاراکتری، قطعی، حساس به ورودی", async () => {
    const { hmacSignHex } = await import("@/lib/melk-api/proxy");
    const secret = "5398f07bfe9fc709bd96120853e0d965a78bbf47ef2327fe0cce07bebaab1f09";
    const s1 = await hmacSignHex(secret, "GET\n/x\nabc\n123");
    const s2 = await hmacSignHex(secret, "GET\n/x\nabc\n123");
    const s3 = await hmacSignHex(secret, "POST\n/x\nabc\n123");
    const s4 = await hmacSignHex("another-secret", "GET\n/x\nabc\n123");
    expect(s1).toMatch(/^[0-9a-f]{64}$/);
    expect(s1).toBe(s2); // قطعی
    expect(s1).not.toBe(s3); // حساس به متد
    expect(s1).not.toBe(s4); // حساس به راز
  });

  test("A-5) قرارداد امضا — «METHOD\\npath?query\\nsha256(body)\\nts» (یکسان سمت Worker)", async () => {
    const { buildSignatureMessage } = await import("@/lib/melk-api/proxy");
    const { message, bodyDigest } = await buildSignatureMessage(
      "POST",
      "https://arus-api.melketabriz.ir/api/apm/authentication/otp/login?x=1",
      '{"personnelCode":"410031320"}',
      "1700000000000"
    );
    expect(message).toBe(`POST\n/api/apm/authentication/otp/login?x=1\n${bodyDigest}\n1700000000000`);
    expect(bodyDigest).toMatch(/^[0-9a-f]{64}$/);
    // بدنهٔ خالی GET — همان قرارداد با هش رشتهٔ خالی
    const g = await buildSignatureMessage("GET", "https://pm-api.melketabriz.ir/api/health", "", "42");
    expect(g.message).toBe(`GET\n/api/health\n${g.bodyDigest}\n42`);
  });

  test("A-6) proxyFetch بدون MELK_ARM_PROXY_URL — عین fetch مستقیم (سازگاری کامل PN-029)", async () => {
    const { proxyFetch } = await import("@/lib/melk-api/proxy");
    delete process.env.MELK_ARM_PROXY_URL;
    let calledUrl = "";
    let calledInit: RequestInit | undefined;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((url: string, init?: RequestInit) => {
      calledUrl = url;
      calledInit = init;
      return Promise.resolve(new Response("{}", { status: 200 }));
    }) as unknown as typeof fetch;
    try {
      const res = await proxyFetch("https://arus-api.melketabriz.ir/api/apm/x", { method: "GET" });
      expect(res.status).toBe(200);
      expect(calledUrl).toBe("https://arus-api.melketabriz.ir/api/apm/x"); // مستقیم — نه پروکسی
      const h = new Headers(calledInit?.headers);
      expect(h.get("X-Melka-Target")).toBeNull(); // بدون هدرهای پروکسی
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("A-7) proxyFetch با میزبان غیرملک‌تبریزی — مستقیم (کنترل‌ها از پروکسی عبور نمی‌کنند)", async () => {
    const { proxyFetch } = await import("@/lib/melk-api/proxy");
    process.env.MELK_ARM_PROXY_URL = "https://melka-proxy.example.workers.dev";
    process.env.MELK_PROXY_SECRET = "b".repeat(64);
    let calledUrl = "";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((url: string) => {
      calledUrl = url;
      return Promise.resolve(new Response("", { status: 403 }));
    }) as unknown as typeof fetch;
    try {
      await proxyFetch("https://api.github.com/health", { method: "GET" });
      expect(calledUrl).toBe("https://api.github.com/health");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("A-8) proxyFetch با میزبان ملک تبریز — POST به پروکسی با سه هدر X-Melka-* و امضای معتبر", async () => {
    const { proxyFetch, hmacSignHex, sha256Hex } = await import("@/lib/melk-api/proxy");
    const secret = "c".repeat(64);
    process.env.MELK_ARM_PROXY_URL = "https://melka-proxy.example.workers.dev";
    process.env.MELK_PROXY_SECRET = secret;
    let calledUrl = "";
    let calledInit: RequestInit | undefined;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((url: string, init?: RequestInit) => {
      calledUrl = url;
      calledInit = init;
      return Promise.resolve(new Response("{}", { status: 200 }));
    }) as unknown as typeof fetch;
    try {
      const target = "https://arus-api.melketabriz.ir/api/apm/authentication/otp/login";
      const body = JSON.stringify({ personnelCode: "410031320" });
      await proxyFetch(target, { method: "POST", body, headers: { Authorization: "Bearer tok" } });
      // مقصد = پروکسی، نه ملک تبریز
      expect(calledUrl).toBe("https://melka-proxy.example.workers.dev");
      const h = new Headers(calledInit?.headers);
      expect(h.get("X-Melka-Target")).toBe(target);
      expect(h.get("Authorization")).toBe("Bearer tok"); // هدر عبوری حفظ می‌شود
      const ts = h.get("X-Melka-Timestamp");
      expect(ts).toBeTruthy();
      expect(Math.abs(Date.now() - Number(ts))).toBeLessThan(10_000); // تازه
      // امضا را بازتولید و مقایسه می‌کنیم (قرارداد یکسان دو سر)
      const digest = await sha256Hex(body);
      const expected = await hmacSignHex(secret, `POST\n/api/apm/authentication/otp/login\n${digest}\n${ts}`);
      expect(h.get("X-Melka-Signature")).toBe(expected);
      expect(calledInit?.method).toBe("POST");
      expect(calledInit?.body).toBe(body);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("A-9) بدون MELK_PROXY_SECRET — مسیر مستقیم (امضای خالی هرگز ارسال نمی‌شود)", async () => {
    const { proxyFetch } = await import("@/lib/melk-api/proxy");
    process.env.MELK_ARM_PROXY_URL = "https://melka-proxy.example.workers.dev";
    delete process.env.MELK_PROXY_SECRET;
    let calledUrl = "";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((url: string) => {
      calledUrl = url;
      return Promise.resolve(new Response("", { status: 502 }));
    }) as unknown as typeof fetch;
    try {
      await proxyFetch("https://arus-api.melketabriz.ir/api/apm/x", { method: "GET" });
      expect(calledUrl).toBe("https://arus-api.melketabriz.ir/api/apm/x"); // مستقیم — خطای واقعی شبکه دیده می‌شود
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

// ───────────────────── B) سورس Worker — melka-proxy/src/index.ts (۶) ─────────────────────

describe("PN-030 · B) Worker عبوری (melka-proxy)", () => {
  const SRC = readFileSync(join(REPO, "melka-proxy", "src", "index.ts"), "utf8");

  test("B-1) whitelist سه دامنه — عین سمت ملکا (دفاع دولایه)", () => {
    expect(SRC).toContain("arus-api.melketabriz.ir");
    expect(SRC).toContain("pm-api.melketabriz.ir");
    expect(SRC).toContain("gap-api.melketabriz.ir");
    expect(SRC).toContain('targetUrl.protocol !== "https:"');
  });

  test("B-2) احراز HMAC با مقایسهٔ زمان-ثابت (بدون نشت بایت‌ها)", () => {
    expect(SRC).toContain("verifyHmac");
    expect(SRC).toContain("crypto.subtle.importKey");
    expect(SRC).toContain("crypto.subtle.sign");
    // XOR-based comparison (timing-safe)
    expect(SRC).toContain("diff |= expected[i] ^ provided[i]");
  });

  test("B-3) پنجرهٔ زمانی ضد replay — ±۵ دقیقه", () => {
    expect(SRC).toContain("TIMESTAMP_WINDOW_MS");
    expect(SRC).toMatch(/5 \* 60 \* 1000/);
    expect(SRC).toContain("stale request");
  });

  test("B-4) صفر لاگ محتوا — هیچ console/JSON.stringify در مسیر عبور نیست", () => {
    expect(SRC).not.toContain("console.");
    expect(SRC).not.toContain("JSON.stringify");
    // شمارندهٔ بدون محتوا
    expect(SRC).toContain("stats");
  });

  test("B-5) هدرهای X-Melka-* هرگز به مقصد forward نمی‌شوند", () => {
    expect(SRC).toContain("FORWARD_REQUEST_HEADERS");
    expect(SRC).not.toMatch(/["']x-melka[^"']*["']\s*,?\s*\);\s*\/\/\s*forward/i);
    // فهرست عبوری فقط چهار هدر بی‌خطر است
    expect(SRC).toContain('"authorization"');
    expect(SRC).toContain('"content-type"');
  });

  test("B-6) پاسخ عبوری — بدون کش و بدون ریدایرکت خودکار (تصمیم با کلاینت)", () => {
    expect(SRC).toContain('redirect: "manual"');
    expect(SRC).toContain('"cache-control", "no-store"');
  });
});

// ───────────────────── C) یکپارچگی نقطهٔ یگانه (۳) ─────────────────────

describe("PN-030 · C) نقطهٔ یگانهٔ خروج (client.ts)", () => {
  const CLIENT = readFileSync(join(REPO, "src/lib/melk-api/client.ts"), "utf8");
  const OVERVIEW = readFileSync(join(REPO, "src/lib/melk-api/connection-overview.ts"), "utf8");
  const ROUTE = readFileSync(join(REPO, "src/app/api/connection/status/route.ts"), "utf8");

  test("C-1) هر دو نقطهٔ شبکه (armCall + probeGet) از proxyFetch می‌گذرند — صفر fetch مستقیم باقی", () => {
    expect(CLIENT).toContain('import { proxyFetch } from "./proxy"');
    // هر دو فراخوانی شبکه به proxyFetch تبدیل شده‌اند
    const direct = CLIENT.match(/await fetch\(/g) ?? [];
    expect(direct.length).toBe(0); // صفر فراخوانی مستقیم در لایهٔ client
    expect((CLIENT.match(/proxyFetch\(/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test("C-2) نمای اتصال — فیلد proxy (configured · host · secretConfigured)", () => {
    expect(OVERVIEW).toContain("proxyStatus");
    expect(OVERVIEW).toContain("proxy:");
  });

  test("C-3) روت وضعیت اتصال — proxy بدون افشای راز به UI می‌رسد", () => {
    expect(ROUTE).toContain("proxy: overview.proxy");
    expect(ROUTE).not.toContain("MELK_PROXY_SECRET");
  });
});

// ───────────────────── D) UI — تنظیمات عمومی (۵) ─────────────────────

describe("PN-030 · D) بخش «ورود مجدد به ملک تبریز» (مرحلهٔ ۶ سند)", () => {
  const SEC = readFileSync(join(REPO, "src/core/tiles/tiles/settings/OtpReloginSection.tsx"), "utf8");
  const MELK_SECTION = readFileSync(join(REPO, "src/core/tiles/tiles/settings/MelkTabrizConnectionSection.tsx"), "utf8");

  test("D-1) بخش با عنوان سند موجود است", () => {
    expect(existsSync(join(REPO, "src/core/tiles/tiles/settings/OtpReloginSection.tsx"))).toBe(true);
    expect(SEC).toContain("ورود مجدد به ملک تبریز");
    expect(SEC).toContain("PN-030");
  });

  test("D-2) دکمهٔ «ارسال کد» → POST /api/admin/otp-burn با تأیید صریح (confirm: true)", () => {
    expect(SEC).toContain('"/api/admin/otp-burn"');
    expect(SEC).toContain("confirm: true");
    // تأیید آگاهانه پیش از سوزاندن — AlertDialog (متن قفل ۶ ساعته)
    expect(SEC).toContain("سوزاندن تک‌تلاش OTP؟");
    expect(SEC).toContain("۶ ساعت");
  });

  test("D-3) فیلد کد → تأیید از مسیر استاندارد اتصال ARM (توکن ← نشست + Vault)", () => {
    expect(SEC).toContain('"/api/arm/connection"');
    expect(SEC).toContain('action: "verify"');
  });

  test("D-4) داخل پیکرهٔ «اتصال به ملک تبریز» رندر می‌شود و وضعیت پروکسی/آفلینی را می‌گیرد", () => {
    expect(MELK_SECTION).toContain('import { OtpReloginSection } from "./OtpReloginSection"');
    expect(MELK_SECTION).toContain("<OtpReloginSection");
    expect(MELK_SECTION).toContain("proxy={conn?.proxy}");
    expect(MELK_SECTION).toContain("offlineMode={conn?.offlineMode}");
  });

  test("D-5) فقط نقش OWNER — مکانیزم تک‌تلاش برای مشاوران رندر نمی‌شود", () => {
    expect(SEC).toContain('role !== "OWNER"');
    expect(SEC).toContain('return null');
  });
});

// ───────────────────── E) env + ترتیب کاشی‌ها (۴) ─────────────────────

describe("PN-030 · E) پیکربندی env + ترتیب کاشی‌های داشبورد مدیریتی (گام دوم مالک)", () => {
  beforeAll(async () => {
    await import("@/core/tiles/bootstrap");
  });

  test("E-1) env.platform.json — راز HMAC ۶۴ کاراکتر هگز نصب است", () => {
    const env = JSON.parse(readFileSync(join(REPO, "env.platform.json"), "utf8")) as Record<string, string>;
    expect(env.MELK_PROXY_SECRET ?? "").toMatch(/^[0-9a-f]{64}$/);
  });

  test("E-2) قفل ترتیب — پویایی سه‌فازی: خالی ← دیپلوی‌شده (Worker) ← رلهٔ موبایل (PN-031)", () => {
    const env = JSON.parse(readFileSync(join(REPO, "env.platform.json"), "utf8")) as Record<string, string>;
    // فاز فعلی: Worker دیپلوی شده و URL ثبت است (۱۴۰۵/۰۷/۲۱ — deploy موفق)، اما
    // مسیر عبوری نهایی حالا رلهٔ موبایل PN-031 است چون سد جغرافیایی کلودفلر را هم بلاک کرد.
    // قفل ترتیب واقعی = MELK_ARM_OFFLINE=1 تا قبولی تست دروازهٔ زنده.
    expect(env.MELK_ARM_PROXY_URL ?? "").toMatch(/^https:\/\/melka-proxy\.[a-z0-9-]+\.workers\.dev$/);
    expect(env.MELK_ARM_RELAY_MODE ?? "").toBe("mobile"); // PN-031: رله مسیر فعال
    expect(env.MELK_ARM_OFFLINE ?? "").toBe("1"); // قفل ترتیب پابرجا تا تست زنده
    // مستندسازی قفل در همان فایل
    expect(env._pn030 ?? "").toContain("MELK_ARM_PROXY_URL");
    expect(env._pn031 ?? "").toContain("شورا-ن۰۳۷");
  });

  test("E-3) ترتیب هشت کاشی — آگهی، درخواست، معاملات، کارشناسان، تطبیق، شاخص، پوشش، مغز ملکا", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    const ids = tileRegistry.listChildren("management-dashboard", "OWNER").map((t) => t.id);
    expect(ids).toEqual([
      "arm-listings", // ۱ آگهی
      "arm-requests", // ۲ درخواست
      "transactions-contracts", // ۳ معاملات
      "experts", // ۴ کارشناسان
      "smart-matching", // ۵ تطبیق
      "market-index", // ۶ شاخص (گام دوم — شاخص ششم)
      "data-coverage", // ۷ پوشش (گام دوم — پوشش هفتم)
      "learning-tier", // ۸ مغز ملکا
    ]);
    // ترتیب عددی هم عین فهرست مالک است
    expect(tileRegistry.get("market-index")!.order).toBe(6);
    expect(tileRegistry.get("data-coverage")!.order).toBe(7);
    expect(tileRegistry.get("learning-tier")!.order).toBe(8);
  });

  test("E-4) پروژهٔ Worker آمادهٔ دیپلوی است (wrangler.toml + deploy.sh + README)", () => {
    expect(existsSync(join(REPO, "melka-proxy", "wrangler.toml"))).toBe(true);
    expect(existsSync(join(REPO, "melka-proxy", "deploy.sh"))).toBe(true);
    expect(existsSync(join(REPO, "melka-proxy", "README.md"))).toBe(true);
    const toml = readFileSync(join(REPO, "melka-proxy", "wrangler.toml"), "utf8");
    expect(toml).toContain('name = "melka-proxy"');
    expect(toml).toContain("src/index.ts");
  });
});

// ───────────────────── F) سازگاری PN-029 (۲) ─────────────────────

describe("PN-030 · F) سازگاری — قوانین PN-029 پابرجا می‌مانند", () => {
  test("F-1) پروکسی گارد آفلینی را دور نمی‌زند — armCall در حالت آفلینی صفر شبکه", async () => {
    const { armCall } = await import("@/lib/melk-api/client");
    const savedFlag = process.env.MELK_ARM_OFFLINE;
    const savedUrl = process.env.MELK_ARM_PROXY_URL;
    const savedSecret = process.env.MELK_PROXY_SECRET;
    process.env.MELK_ARM_OFFLINE = "1";
    process.env.MELK_ARM_PROXY_URL = "https://melka-proxy.example.workers.dev";
    process.env.MELK_PROXY_SECRET = "d".repeat(64);
    let networkCalled = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      networkCalled = true;
      return Promise.reject(new Error("نباید شبکه صدا زده شود — نه مستقیم نه پروکسی"));
    }) as unknown as typeof fetch;
    try {
      await expect(
        armCall({ path: "x", baseUrl: "https://arus-api.melketabriz.ir/api/apm/", timeoutMs: 100, maxRetries: 0 })
      ).rejects.toThrow();
      expect(networkCalled).toBe(false); // گارد پیش از هر شبکه (مستقیم یا پروکسی) می‌ایستد
    } finally {
      globalThis.fetch = originalFetch;
      if (savedFlag === undefined) delete process.env.MELK_ARM_OFFLINE;
      else process.env.MELK_ARM_OFFLINE = savedFlag;
      if (savedUrl === undefined) delete process.env.MELK_ARM_PROXY_URL;
      else process.env.MELK_ARM_PROXY_URL = savedUrl;
      if (savedSecret === undefined) delete process.env.MELK_PROXY_SECRET;
      else process.env.MELK_PROXY_SECRET = savedSecret;
    }
  });

  test("F-2) اسکریپت دیپلوی — مقدار راز هرگز echo/چاپ نمی‌شود (فقط به wrangler pipe می‌شود)", () => {
    const sh = readFileSync(join(REPO, "melka-proxy", "deploy.sh"), "utf8");
    expect(sh).toContain('wrangler secret put MELKA_PROXY_SECRET');
    // مقدار $SECRET هرگز در خروجی/لاگ نمی‌رود — فقط pipe به wrangler
    expect(sh).not.toMatch(/echo[^\n]*\$SECRET/i);
    expect(sh).not.toMatch(/printf[^\n]*\$SECRET[^\n]*"\s*\\n\s*"/i);
    expect(sh).not.toMatch(/set -x/); // ترسیم حالت debug هم راز را لو می‌دهد
  });
});
