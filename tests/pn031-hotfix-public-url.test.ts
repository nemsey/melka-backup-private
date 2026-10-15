/**
 * تست‌های PN-031-HOTFIX — نشانی عمومی سرور (شورای عالی ملکا · جلسهٔ فوری ۰۳۸)
 * ---------------------------------------------------------------------------
 * زمینه (کشف جلسهٔ ۰۳۸): دستور نصب رله از request.nextUrl.origin ساخته می‌شد
 * که در محیط کانتینر http://0.0.0.0:3000 برمی‌گرداند — آدرس داخلی که از
 * گوشی مالک (اینترنت) قابل دسترس نیست؛ curl گوشی با خطای (7) شکست خورد.
 *
 * پوشش تستی (بند ۲-۵ دستور فوری):
 *   A) اولویت‌های getPublicBaseUrl (۵) — env → x-forwarded-host → host عمومی
 *      → رد میزبان داخلی (0.0.0.0/localhost/127.x) → fail-closed با خطای فارسی
 *   B) رگرسیون روت‌ها (۳) — دو روت enroll/bootstrap از getPublicBaseUrl
 *      می‌گذرند و هرگز nextUrl.origin برای URL بیرونی نمی‌سازند
 *   C) ثبت env و بقای آن (۳) — env.platform.json + WATCHED_KEYS + escrow
 *   D) سازگاری سازنده‌ها (۲) — URL عمومی بدون تغییر در دستور نصب/اسکریپت
 *
 * اجرا: bun test tests/pn031-hotfix-public-url.test.ts
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = join(import.meta.dir, "..");
const PUBLIC_URL = "https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai";

const saved: Record<string, string | undefined> = {};
function setEnv(key: string, value: string | undefined) {
  if (!(key in saved)) saved[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}
beforeAll(() => {
  setEnv("MELK_PUBLIC_BASE_URL", process.env.MELK_PUBLIC_BASE_URL);
});
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

/** درخواست ساختگی با هدرهای دلخواه — همان قرارداد مینیمال ماژول */
function fakeReq(headers: Record<string, string>, connectionProtocol = "http:") {
  return {
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
    connectionProtocol,
  };
}

// ───────────────────── A) اولویت‌های getPublicBaseUrl (۵) ─────────────────────

describe("PN-031-HOTFIX · A) اولویت‌های نشانی عمومی", () => {
  test("A-1) متغیر محیطی MELK_PUBLIC_BASE_URL — قطعی‌ترین منبع (اولویت ۱)", async () => {
    const { getPublicBaseUrl } = await import("@/lib/http/public-url");
    setEnv("MELK_PUBLIC_BASE_URL", PUBLIC_URL + "/");
    // حتی با هدر داخلی خراب، env برنده است + / انتهایی پاک می‌شود
    expect(getPublicBaseUrl(fakeReq({ host: "0.0.0.0:3000" }))).toBe(PUBLIC_URL);
    expect(getPublicBaseUrl(fakeReq({ host: "example.com" }))).toBe(PUBLIC_URL);
    setEnv("MELK_PUBLIC_BASE_URL", undefined);
  });

  test("A-2) x-forwarded-host + x-forwarded-proto — استاندارد reverse-proxy (اولویت ۲)", async () => {
    const { getPublicBaseUrl } = await import("@/lib/http/public-url");
    expect(
      getPublicBaseUrl(fakeReq({ "x-forwarded-host": "melka.example.com, proxy.internal", "x-forwarded-proto": "https" }))
    ).toBe("https://melka.example.com");
    // پروتکل غایب → پیش‌فرض https (مصرف بیرونی روی اینترنت)
    expect(getPublicBaseUrl(fakeReq({ "x-forwarded-host": "melka.example.com" }))).toBe("https://melka.example.com");
  });

  test("A-3) هدر host عمومی — فقط وقتی میزبان بیرونی است (اولویت ۳)", async () => {
    const { getPublicBaseUrl } = await import("@/lib/http/public-url");
    expect(getPublicBaseUrl(fakeReq({ host: "melka.example.com" }))).toBe("http://melka.example.com"); // پروتکل اتصال واقعی
    expect(getPublicBaseUrl(fakeReq({ host: "melka.example.com", "x-forwarded-proto": "https" }))).toBe("https://melka.example.com");
  });

  test("A-4) میزبان داخلی همیشه رد می‌شود — 0.0.0.0 / localhost / 127.x / ::1", async () => {
    const { getPublicBaseUrl, isPublicHost, PublicBaseUrlError } = await import("@/lib/http/public-url");
    for (const h of ["0.0.0.0", "0.0.0.0:3000", "localhost", "localhost:3000", "127.0.0.1", "127.0.0.1:3000", "[::1]", "::1"]) {
      expect(isPublicHost(h)).toBe(false);
      expect(() => getPublicBaseUrl(fakeReq({ host: h }))).toThrow(PublicBaseUrlError);
    }
    // host داخلی + forwarded داخلی → باز هم fail-closed (نه URL خراب)
    expect(() => getPublicBaseUrl(fakeReq({ host: "0.0.0.0:3000", "x-forwarded-host": "localhost:8080" }))).toThrow(
      PublicBaseUrlError
    );
  });

  test("A-5) fail-closed — خطای صریح فارسی برای مالک، نه URL خراب", async () => {
    const { getPublicBaseUrl, PublicBaseUrlError } = await import("@/lib/http/public-url");
    let msg = "";
    try {
      getPublicBaseUrl(fakeReq({ host: "0.0.0.0:3000" }));
    } catch (e) {
      expect(e).toBeInstanceOf(PublicBaseUrlError);
      msg = (e as Error).message;
    }
    expect(msg.length).toBeGreaterThan(20);
    expect(msg).toContain("MELK_PUBLIC_BASE_URL");
    expect(msg).not.toContain("http://0.0.0.0");
  });
});

// ───────────────────── B) رگرسیون روت‌ها (۳) ─────────────────────

describe("PN-031-HOTFIX · B) رگرسیون — روت‌ها از نقطهٔ یگانه می‌گذرند", () => {
  const AFFECTED = [
    "src/app/api/admin/relay/enroll/route.ts",
    "src/app/api/mobile-relay/bootstrap/route.ts",
  ];

  test("B-1) دو روت آسیب‌دیده از getPublicBaseUrl استفاده می‌کنند", () => {
    for (const f of AFFECTED) {
      const src = readFileSync(join(REPO, f), "utf8");
      expect(src).toContain("getPublicBaseUrl(");
    }
  });

  test("B-2) هیچ روتی nextUrl.origin برای URL نمی‌سازد (رگرسیون جلسهٔ ۰۳۸)", () => {
    for (const f of AFFECTED) {
      const src = readFileSync(join(REPO, f), "utf8");
      expect(src).not.toMatch(/nextUrl\.origin/);
    }
  });

  test("B-3) fail-closed در هر دو روت — PublicBaseUrlError به خطای صریح تبدیل می‌شود", () => {
    for (const f of AFFECTED) {
      const src = readFileSync(join(REPO, f), "utf8");
      expect(src).toContain("PublicBaseUrlError");
      expect(src).toMatch(/status:\s*503/);
    }
  });
});

// ───────────────────── C) ثبت env و بقای آن (۳) ─────────────────────

describe("PN-031-HOTFIX · C) ثبت env و بقای سه‌لایه", () => {
  test("C-1) env.platform.json کلید MELK_PUBLIC_BASE_URL را با URL عمومی دارد", () => {
    const raw = JSON.parse(readFileSync(join(REPO, "env.platform.json"), "utf8")) as Record<string, string>;
    expect(raw.MELK_PUBLIC_BASE_URL).toBe(PUBLIC_URL);
  });

  test("C-2) کلید در WATCHED_KEYS تست platform-env ثبت شده (درس نشت env)", () => {
    const src = readFileSync(join(REPO, "tests/platform-env-fallback.test.ts"), "utf8");
    expect(src).toContain('"MELK_PUBLIC_BASE_URL"');
  });

  test("C-3) بقا در escrow — کلید در BOOT_SECRET_KEYS (رفت‌وبرگشت از بازنشانی محیط)", async () => {
    const { BOOT_SECRET_KEYS } = await import("@/lib/auth/boot-secrets");
    expect(BOOT_SECRET_KEYS as readonly string[]).toContain("MELK_PUBLIC_BASE_URL");
    // fail-fast بوت را تشدید نمی‌کند (فقط دو راز اصلی):
    const config = readFileSync(join(REPO, "src/lib/melk-api/config.ts"), "utf8");
    expect(config).not.toMatch(/missing\.push\("MELK_PUBLIC_BASE_URL"\)/);
  });
});

// ───────────────────── D) سازگاری سازنده‌ها (۲) ─────────────────────

describe("PN-031-HOTFIX · D) سازگاری دستور نصب و اسکریپت رله", () => {
  test("D-1) دستور نصب یک‌خطی از URL عمومی درست ساخته می‌شود", async () => {
    const { buildInstallCommand } = await import("@/lib/melk-api/relay-script");
    const cmd = buildInstallCommand(PUBLIC_URL, "a".repeat(36));
    expect(cmd).toContain(`${PUBLIC_URL}/api/mobile-relay/bootstrap?code=`);
    expect(cmd).not.toContain("0.0.0.0");
    // PN-031-I: همان حمل‌ونقل مقاوم — http1.1 + UA بروزری (همچنین curl -fsSL پابرجا)
    expect(cmd).toContain("--http1.1");
    expect(cmd).toContain('-A "Mozilla/5.0');
    expect(cmd).toMatch(/^pkg install -y curl openssl jq && curl --http1\.1 -A "Mozilla\/\d\.\d .+" -fsSL "/);
  });

  test("D-2) اسکریپت رله SERVER_URL عمومی می‌گیرد و مسیر poll عمومی است", async () => {
    const { buildRelayScript } = await import("@/lib/melk-api/relay-script");
    const s = buildRelayScript({ serverUrl: PUBLIC_URL, deviceId: "poco-f3-test", deviceSecret: "f".repeat(64) });
    expect(s).toContain(`SERVER_URL="${PUBLIC_URL}"`);
    expect(s).toContain('"/api/mobile-relay/poll"');
    expect(s).not.toContain("0.0.0.0");
  });
});
