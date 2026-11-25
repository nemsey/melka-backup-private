/**
 * tests/dir-ff-cap-502.test.ts — دستور DIR-FF-CAP-502 (۱۴۰۵/۰۸/۳۰)
 * ---------------------------------------------------------------------------
 * اولاً) کارت «مغز ملکا — تمام ظرفیت‌ها در خدمت فایل‌یابی» بازشونده با
 *        پیش‌فرض «بسته» + بارگذاری تنبلکار مغز در نخستین بازشدن.
 * ثانیاً) تغییر نام کلیدهای بخش «شروع حالت تمام‌ظرفیت» در دو کاشی:
 *        «شروع حالت تمام‌ظرفیت» → «تمام ظرفیت»
 *        «پایان و بازگشت چرخه‌های عادی» → «حالت عادی»
 * ثالثاً) ریشه‌یابی و رفع واقعی خطای ۵۰۲ در لینک preview:
 *        · شاهد: خود مسیر 200 سالم است؛ ۵۰۲ از لبهٔ دروازه در پنجرهٔ بوت
 *          سندباکس (~۱۴۵ث) می‌آید → کلاینت باید خوددرمان شود.
 *        · هلپر مشترک toggleCapacitySessionResilient با تلاش مجدد پلکانی؛
 *          فقط خطاهای گذرا (۵xx/۵۰۲/۵۰۴/تایم‌اوت/شبکه)؛ ۴xx هرگز.
 * رابعاً) قانون دادهٔ مقدس — هلپر فقط همان POST موجود را مقاوم می‌کند؛
 *        صفر import دیتابیس/حذف در لایهٔ کلاینت.
 */

import { describe, expect, test, afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

Object.assign(process.env, {
  NODE_ENV: process.env.NODE_ENV ?? "test",
  DATABASE_URL: process.env.DATABASE_URL ?? "file:/home/z/my-project/db/test.db",
  MELK_TOKEN_KEY: process.env.MELK_TOKEN_KEY ?? "test-only-key-not-a-real-secret",
});

const ROOT = "/home/z/my-project";
const FF = readFileSync(join(ROOT, "src/core/tiles/tiles/file-finder/FileFinderPage.tsx"), "utf8");
const CH = readFileSync(join(ROOT, "src/core/tiles/tiles/changes/ChangesPage.tsx"), "utf8");
const CC = readFileSync(join(ROOT, "src/lib/changes/capacity-client.ts"), "utf8");

/* ═══════════ اولاً — کارت مغز ملکا: بازشونده، پیش‌فرض بسته ═══════════ */

describe("DIR-FF-CAP-502 · اولاً — مغز ملکا بازشونده با پیش‌فرض بسته", () => {
  test("۱-۱ کامپوننت Collapsible نصب است (ترایگر + محتوا + onOpenChange)", () => {
    expect(FF).toContain('from "@/components/ui/collapsible"');
    expect(FF).toContain("<Collapsible open={brainOpen} onOpenChange={handleBrainOpenChange}>");
    expect(FF).toContain("<CollapsibleTrigger");
    expect(FF).toContain("<CollapsibleContent>");
  });

  test("۱-۲ پیش‌فرض بسته — brainOpen با false آغاز می‌شود", () => {
    expect(FF).toMatch(/const \[brainOpen, setBrainOpen\] = useState\(false\)/);
    expect(FF).toMatch(/const \[brainLoadedOnce, setBrainLoadedOnce\] = useState\(false\)/);
  });

  test("۱-۳ بارگذاری تنبلکار — loadBrain دیگر در افکت نصب (mount) صدا نمی‌شود؛ فقط در نخستین بازشدن", () => {
    const mountFx = FF.slice(
      FF.indexOf("useEffect(() => {"),
      FF.indexOf("}, [bucket, loadAds, loadSettings, loadScanLogs, loadCapacity]);")
    );
    expect(mountFx).not.toContain("loadBrain(");
    // و مهاجرت به handleBrainOpenChange — بارگذاری در نخستین بازشدن
    expect(FF).toContain("if (open && !brainLoadedOnce)");
    expect(FF).toContain("setBrainLoadedOnce(true);");
  });

  test("۱-۴ «تازه‌سازی مغز» بیرون از ترایگر — سربرگ حتی در حالت بسته کار می‌کند", () => {
    // لنگر: کارت مغز (نگین nili) — نه توضیح‌های متنی بالای فایل
    const cardIdx = FF.indexOf('data-negin="nili"');
    expect(cardIdx).toBeGreaterThan(0);
    const refreshIdx = FF.indexOf("تازه‌سازی مغز", cardIdx);
    expect(refreshIdx).toBeGreaterThan(cardIdx);
    // آخرین ترایگرِ باز پیش از دکمه — دکمه پس از بسته‌شدن ترایگر می‌آید (نه داخل آن)
    const triggerOpen = FF.lastIndexOf("<CollapsibleTrigger", refreshIdx);
    const between = FF.slice(triggerOpen, refreshIdx);
    expect(between).toContain("</CollapsibleTrigger>");
  });

  test("۱-۵ عنوان و نگین پابرجا — «مغز ملکا — تمام ظرفیت‌ها در خدمت فایل‌یابی» + یک میلهٔ نگین", () => {
    expect(FF).toContain("مغز ملکا — تمام ظرفیت‌ها در خدمت فایل‌یابی");
    expect((FF.match(/negin-bar/g) ?? []).length).toBe(1);
  });
});

/* ═══════════ ثانیاً — تغییر نام دو کلید در هر دو کاشی ═══════════ */

describe("DIR-FF-CAP-502 · ثانیاً — کلیدهای «تمام ظرفیت» و «حالت عادی»", () => {
  // DIR-FF-SUPER-001/گام سوم (دستور مالک): در کاشی فایل‌یابی، حالت تمام‌ظرفیت
  // فقط و فقط «خودکار» هنگام ثبت فایل در سامانه ARM فعال می‌شود — کلید دستی
  // «تمام ظرفیت» از این کاشی حذف شد؛ کلید «حالت عادی» (پایان زودهنگام) پابرجاست.
  // کاشی تغییرات (بیرون از حوزهٔ این دستور) هر دو کلید را دارد.
  test("۲-۱ کاشی فایل‌یابی: فقط «حالت عادی» — کلید دستی آغاز حذف شده است", () => {
    expect(FF).toContain("حالت عادی\n");
    expect(FF).not.toContain("تمام ظرفیت\n");
    expect(FF).not.toContain('toggleCapacitySession("begin")');
  });

  test("۲-۲ کاشی تغییرات: نام‌های تازه حاضرند", () => {
    expect(CH).toContain("تمام ظرفیت\n");
    expect(CH).toContain("حالت عادی\n");
  });

  test("۲-۳ نام‌های قدیمی در هیچ‌کدام از دو کاشی باقی نمانده", () => {
    expect(FF).not.toContain("شروع حالت تمام‌ظرفیت\n");
    expect(FF).not.toContain("پایان و بازگشت چرخه‌های عادی");
    expect(CH).not.toContain("شروع حالت تمام‌ظرفیت\n");
    expect(CH).not.toContain("پایان و بازگشت چرخه‌های عادی");
  });

  test("۲-۴ هر دو کاشی از هلپر مشترک استفاده می‌کنند (قانون لینک — یک منبع حقیقت)", () => {
    expect(FF).toContain('from "@/lib/changes/capacity-client"');
    expect(CH).toContain('from "@/lib/changes/capacity-client"');
    expect(FF).toContain("toggleCapacitySessionResilient(");
    expect(CH).toContain("toggleCapacitySessionResilient(");
  });

  test("۲-۵ نشانگر پیشرفت تلاش مجدد در هر دو کاشی رندر می‌شود", () => {
    expect(FF).toContain("تلاش مجدد خودکار");
    expect(CH).toContain("تلاش مجدد خودکار");
    expect(FF).toContain("aria-live=\"polite\"");
    expect(CH).toContain("aria-live=\"polite\"");
  });
});

/* ═══════════ ثالثاً — ریشه‌یابی ۵۰۲ و خوددرمانی کلاینت ═══════════ */

describe("DIR-FF-CAP-502 · ثالثاً — شواهد ریشه‌یابی در سورس", () => {
  test("۳-۱ سند ریشه‌یابی: مسیر سالم؛ ۵۰۲ از لبهٔ preview در پنجرهٔ بوت سندباکس", () => {
    expect(CC).toContain("لبهٔ preview");
    expect(CC).toContain("idempotent");
  });

  test("۳-۲ قانون دادهٔ مقدس — هلپر صفر import دیتابیس دارد؛ فقط همان POST", () => {
    expect(CC).not.toContain("@/lib/db");
    expect(CC).not.toContain("prisma");
    expect(CC).toContain("/api/changes/session");
  });
});

describe("DIR-FF-CAP-502 · ثالثاً — رفتار تلاش مجدد (fetch ماک‌شده)", () => {
  const realFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  function mockFetchStatuses(statuses: number[], body?: Record<string, unknown>): { calls: string[] } {
    const calls: string[] = [];
    let i = 0;
    globalThis.fetch = (async (input: unknown) => {
      const idx = i++;
      calls.push(String(idx));
      const status = statuses[Math.min(idx, statuses.length - 1)];
      if (status === 200) {
        return new Response(JSON.stringify(body ?? { ok: true, message: "تست" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ ok: false, code: "UPSTREAM", message: `خطای ${status}` }), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
    return { calls };
  }

  test("۳-۳ ۵۰۲ → ۵۰۲ → ۲۰۰: تلاش سوم موفق؛ دو onProgress و ترتیب وقفه‌ها", async () => {
    const { toggleCapacitySessionResilient } = await import("@/lib/changes/capacity-client");
    const { calls } = mockFetchStatuses([502, 502, 200], { ok: true, message: "حالت فعال شد" });
    const progress: Array<{ attempt: number; total: number; nextDelayMs: number }> = [];
    const res = await toggleCapacitySessionResilient("begin", {
      retryDelaysMs: [5, 7],
      onProgress: (p) => progress.push({ attempt: p.attempt, total: p.total, nextDelayMs: p.nextDelayMs }),
    });
    expect(res.ok).toBe(true);
    expect(res.attempts).toBe(3);
    expect(calls.length).toBe(3);
    expect(progress.length).toBe(2);
    expect(progress[0].attempt).toBe(1);
    expect(progress[0].total).toBe(3);
    expect(progress[0].nextDelayMs).toBe(5);
    expect(progress[1].nextDelayMs).toBe(7);
  });

  test("۳-۴ ۵۰۲ همیشگی: پس از کل تلاش‌ها خطا می‌دهد؛ کل = delays.length + 1", async () => {
    const { toggleCapacitySessionResilient } = await import("@/lib/changes/capacity-client");
    const { calls } = mockFetchStatuses([502]);
    let thrown: unknown = null;
    try {
      await toggleCapacitySessionResilient("begin", { retryDelaysMs: [1, 1, 1] });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).not.toBeNull();
    expect((thrown as { status: number }).status).toBe(502);
    expect(calls.length).toBe(4); // ۴ تلاش = ۳ وقفه + ۱
  });

  test("۳-۵ ۴۰۳ قطعی: هرگز تلاش مجدد نمی‌شود (یک فراخوانی)", async () => {
    const { toggleCapacitySessionResilient } = await import("@/lib/changes/capacity-client");
    const { calls } = mockFetchStatuses([403]);
    let thrown: unknown = null;
    try {
      await toggleCapacitySessionResilient("end", { retryDelaysMs: [1, 1] });
    } catch (err) {
      thrown = err;
    }
    expect(thrown).not.toBeNull();
    expect((thrown as { status: number }).status).toBe(403);
    expect(calls.length).toBe(1);
  });

  test("۳-۶ داوری خطا — گذرا: 502/504/500/0/TIMEOUT؛ قطعی: 400/401/403/429", async () => {
    const mod = await import("@/lib/changes/capacity-client");
    const { ApiClientError } = await import("@/lib/client/api");
    const mk = (code: string, status: number) => new ApiClientError(code, "تست", status);
    expect(mod.isTransientCapacityError(mk("UPSTREAM_UNAVAILABLE", 502))).toBe(true);
    expect(mod.isTransientCapacityError(mk("UPSTREAM_UNAVAILABLE", 504))).toBe(true);
    expect(mod.isTransientCapacityError(mk("BAD_GATEWAY", 500))).toBe(true);
    expect(mod.isTransientCapacityError(mk("TIMEOUT", 504))).toBe(true);
    expect(mod.isTransientCapacityError(mk("NETWORK_ERROR", 0))).toBe(true);
    expect(mod.isTransientCapacityError(mk("UNKNOWN", 400))).toBe(false);
    expect(mod.isTransientCapacityError(mk("UNAUTHORIZED", 401))).toBe(false);
    expect(mod.isTransientCapacityError(mk("FORBIDDEN", 403))).toBe(false);
    expect(mod.isTransientCapacityError(mk("RATE_LIMITED", 429))).toBe(false);
    expect(mod.isTransientCapacityError(new Error("خارج از قرارداد"))).toBe(false);
  });

  test("۳-۷ وقفهٔ رسمی پلکانی — ۵ بازگشت بین ۶ تلاش (~۱۰۱ث؛ پوشش پنجرهٔ بوت ~۱۴۵ث)", async () => {
    const mod = await import("@/lib/changes/capacity-client");
    expect(mod.CAPACITY_RETRY_DELAYS_MS.length).toBe(5);
    const total = mod.CAPACITY_RETRY_DELAYS_MS.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThanOrEqual(100_000);
    expect(total).toBeLessThanOrEqual(103_000);
  });
});
