/**
 * tests/dir-ff-super-001.test.ts — دستور مالک «فوق پیشرفته کردن فایل‌یابی» (DIR-FF-SUPER-001)
 * ---------------------------------------------------------------------------
 * گام اول — اسکن چندوجهی و فراعمیق + کشف فراجامع فایل‌های شخصی:
 *   موتور نسخهٔ ۳ = کارِ اسکن پس‌زمینه با پنج فاز زنده + خطوط موازی واکشی
 *   جزئیات + ثبت دسته‌ای lastSeen + ایزوله‌سازی خطای تک‌آگهی.
 * گام دوم — اسکن دیوار بی‌واسطهٔ ترموکس (بدون رله):
 *   · POST /api/divar/scan فوری برمی‌گردد (کار پس‌زمینه) ⇒ مهلت ۲۰ثانیه‌ای
 *     مرورگر برای اسکن منتفی — ریشهٔ پیام «رِلهٔ گوشی خاموش… Termux» درمان شد.
 *   · پیام مهلت سبک کلاینت دیگر رله/ترموکس را مقصر نمی‌کند (صادقانه).
 * گام سوم — حالت تمام‌ظرفیت ترموکس فقط هنگام «ثبت فایل در سامانه ARM»:
 *   · کلید دستی آغاز از کاشی فایل‌یابی حذف شد؛ روت اسکن هرگز نشست فعال نمی‌کند.
 *   · روت ثبت همچنان تنها نقطهٔ فعال‌سازی خودکار است (ensureChangesSessionForOperation).
 *
 * پوشش: الف) گاردهای ساختاری سه گام · ب) رفتار زندهٔ کار اسکن با fetch ماک‌شده
 * (دو آگهی شخصی → ذخیره، شمارنده‌ها، گزارش، قفل تک‌نمونه) · ج) روت‌ها (مالک/
 * مشاور/نشست‌دار).
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "crypto";

Object.assign(process.env, {
  NODE_ENV: process.env.NODE_ENV ?? "test",
  DATABASE_URL: process.env.DATABASE_URL ?? "file:/home/z/my-project/db/test.db",
  MELK_TOKEN_KEY: process.env.MELK_TOKEN_KEY ?? "test-only-key-not-a-real-secret",
});

const ROOT = "/home/z/my-project";

/** کد خالص — بدون نظرات (سربرگ‌های مستندسازی، اثباتِ کد نیستند) */
function codeOf(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const SCAN_ROUTE = readFileSync(join(ROOT, "src/app/api/divar/scan/route.ts"), "utf8");
const SCAN_LIB = readFileSync(join(ROOT, "src/lib/divar/scan.ts"), "utf8");
const API_CLIENT = readFileSync(join(ROOT, "src/lib/client/api.ts"), "utf8");
const REGISTER_ROUTE = readFileSync(join(ROOT, "src/app/api/divar/ads/[token]/register/route.ts"), "utf8");
const FF_PAGE = readFileSync(join(ROOT, "src/core/tiles/tiles/file-finder/FileFinderPage.tsx"), "utf8");

/* ═══════════ الف — گاردهای ساختاری سه گام ═══════════ */

describe("DIR-FF-SUPER-001 · الف-۱ گام دوم — روت اسکن: کار پس‌زمینه، بی‌انتظار و بی‌رله", () => {
  test("۱-۱ روت: اسکن را «آغاز» می‌کند نه «منتظر پایان آن می‌ماند»", () => {
    const code = codeOf(SCAN_ROUTE);
    expect(code).toContain("startScanJob(");
    expect(code).not.toContain("await runDivarScan(");
    expect(code).toContain("getScanJob()");
  });

  test("۱-۲ روت: پاسخ POST وضعیت کار را برمی‌گرداند (قرارداد job فوری)", () => {
    const code = codeOf(SCAN_ROUTE);
    expect(code).toContain('Response.json({ ok: true, started, job })');
  });

  test("۱-۳ روت اسکن: صفر اتصال به نشست تمام‌ظرفیت/صف رله (پابرجایی DIR-FF-RELAY-POLICY-001)", () => {
    const code = codeOf(SCAN_ROUTE);
    expect(code).not.toContain("ensureChangesSessionForOperation");
    expect(code).not.toContain("enqueueRelayRequest");
    expect(code).not.toContain("changes/session");
  });

  test("۱-۴ پیام مهلت سبک کلاینت دیگر رلهٔ ترموکس را مقصر نمی‌کند", () => {
    expect(API_CLIENT).not.toContain("رلهٔ گوشی خاموش");
    expect(API_CLIENT).not.toContain("Termux را باز کنید");
    // پیام صادقانهٔ عمومی جایگزین شد — مهلت ۲۰ث همچنان پابرجاست
    expect(API_CLIENT).toMatch(/مهلت ۲۰ ثانیه دریافت نشد/);
  });
});

describe("DIR-FF-SUPER-001 · الف-۲ گام اول — موتور اسکن چندوجهی نسخهٔ ۳", () => {
  test("۲-۱ پنج فاز زندهٔ اسکن با برچسب فارسی", () => {
    expect(SCAN_LIB).toContain("SCAN_PHASE_LABELS");
    for (const ph of ['"search"', '"details"', '"stats"', '"rescore"', '"finalize"']) {
      expect(SCAN_LIB).toContain(ph);
    }
  });

  test("۲-۲ خطوط موازی واکشی جزئیات و جست‌وجوی چنددسته‌ای (runPool + لِین‌ها از config)", () => {
    expect(SCAN_LIB).toContain("async function runPool");
    expect(SCAN_LIB).toContain("DIVAR_CONFIG.scanDetailLanes");
    expect(SCAN_LIB).toContain("DIVAR_CONFIG.scanCategoryLanes");
  });

  test("۲-۳ قرارداد کار اسکن: ScanJobView + شمارنده‌های زنده + snapshot", () => {
    const code = codeOf(SCAN_LIB);
    expect(code).toContain("export function startScanJob(");
    expect(code).toContain("export function getScanJob(");
    expect(code).toContain("queueTotal");
    expect(code).toContain("processed");
  });

  test("۲-۴ ایزوله‌سازی خطای تک‌آگهی + ثبت دسته‌ای lastSeen (به‌جای N نوشتن سریالی)", () => {
    const code = codeOf(SCAN_LIB);
    expect(code).toContain("updateMany");
    expect(code).toContain("unchangedTokens");
  });

  test("۲-۵ پیکربندی پیش‌فرض لِین‌ها: جزئیات ۶ · دسته‌ها ۳ (خواندن ماژول)", async () => {
    const { DIVAR_CONFIG } = await import("@/lib/divar/config");
    expect(DIVAR_CONFIG.scanDetailLanes).toBe(6);
    expect(DIVAR_CONFIG.scanCategoryLanes).toBe(3);
  });
});

describe("DIR-FF-SUPER-001 · الف-۳ گام سوم — تمام‌ظرفیت فقط هنگام ثبت فایل در ARM", () => {
  test("۳-۱ کاشی فایل‌یابی: DIR-OWNER-4STEPS-001/گام دوم اولاً — کل بخش تمام‌ظرفیت حذف شد؛ آغاز فقط خودکار در روت ثبت", () => {
    expect(FF_PAGE).not.toContain("تمام ظرفیت\n");
    expect(FF_PAGE).not.toContain('toggleCapacitySession("begin")');
    expect(FF_PAGE).not.toContain("حالت عادی\n");
    // بخش نمایش حذف شد — یادداشت‌های کارت دیگر نیستند؛ سلوک سرور در روت ثبت پابرجاست
    expect(FF_PAGE).not.toContain("آغاز خودکار — فقط هنگام ثبت فایل در ARM");
    expect(FF_PAGE).toContain("DIR-OWNER-4STEPS-001");
  });

  test("۳-۲ روت ثبت: تنها نقطهٔ فعال‌سازی خودکار (پیش از انتقال به آرم)", () => {
    expect(REGISTER_ROUTE).toContain("ensureChangesSessionForOperation");
    const sessIdx = REGISTER_ROUTE.indexOf("await ensureChangesSessionForOperation(");
    const xferIdx = REGISTER_ROUTE.indexOf("transferListingToCrm(");
    expect(sessIdx).toBeGreaterThan(0);
    expect(xferIdx).toBeGreaterThan(sessIdx);
  });

  test("۳-۳ سربرگ کاشی: دستور DIR-FF-SUPER-001 مستند شده است", () => {
    expect(FF_PAGE).toContain("DIR-FF-SUPER-001");
  });
});

describe("DIR-FF-SUPER-001 · الف-۴ گام اول/UI — نظارت زندهٔ اسکن در کاشی", () => {
  test("۴-۱ runScan: POST فوری + نظارت ۲.۵ثانیه‌ای تا پایان کار", () => {
    const runScanIdx = FF_PAGE.indexOf("const runScan = async () => {");
    expect(runScanIdx).toBeGreaterThan(0);
    const runScanBody = FF_PAGE.slice(runScanIdx, FF_PAGE.indexOf("setScanning(false);", runScanIdx));
    expect(runScanBody).toContain('"/api/divar/scan"');
    expect(runScanBody).toContain("setTimeout(r, 2500)");
    expect(runScanBody).not.toContain("changes/session");
    expect(runScanBody).not.toContain("toggleCapacitySession");
  });

  test("۴-۲ پنل پیشرفت زندهٔ اسکن (فاز + شمارنده‌ها + نوار پیشرفت + aria-live)", () => {
    expect(FF_PAGE).toContain("data-scan-progress");
    expect(FF_PAGE).toContain("scanJob.phaseLabel");
    expect(FF_PAGE).toContain("scanProgressPct");
    expect(FF_PAGE).toMatch(/role="status" aria-live="polite" data-scan-progress/);
  });
});

/* ═══════════ ب — رفتار زندهٔ کار اسکن (fetch ماک‌شده · DB تست) ═══════════ */

const { db } = await import("@/lib/db");
const { gregorianToJalali, JALALI_MONTHS } = await import("@/lib/jalali");

const realFetch = globalThis.fetch;
const TEST_TOKENS = ["supA1tok", "supB2tok"];

function faNum(s: string | number): string {
  return String(s).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

/** «۴ آذر ۱۴۰۵، ۱۲:۰۰» — یک ساعت پیشِ همین لحظه (درون هر بازهٔ زمانی) */
function publishedAnHourAgo(): string {
  const now = new Date(Date.now() - 3600 * 1000);
  const [jy, jm, jd] = gregorianToJalali(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate());
  return `${faNum(jd)} ${JALALI_MONTHS[jm - 1]} ${faNum(jy)}، ${faNum("12:00")}`;
}

function jsonRes(obj: unknown): Response {
  return new Response(JSON.stringify(obj), { status: 200, headers: { "Content-Type": "application/json" } });
}

/** جزئیات آگهی شخصی (بدون BUSINESS_SECTION ⇒ personal) با زمان انتشار درون بازه */
function personalPostDetail(token: string): Record<string, unknown> {
  const published = publishedAnHourAgo();
  return {
    city: { name: "تبریز" },
    contact: { chat_enabled: true },
    sections: [
      {
        section_name: "TITLE",
        widgets: [
          { widget_type: "LEGEND_TITLE_ROW", data: { title: `فروش فوری آپارتمان ۷۵متری ولیعصر — مستقیم از مالک ${token}` } },
          {
            widget_type: "EXPANDABLE_SECTION",
            data: {
              title: "۱ ساعت پیش در تبریز، ولیعصر",
              widget_list: [{ widget_type: "DESCRIPTION_ROW", data: { text: `انتشار آگهی: ${published}\nآخرین نردبان: ${published}` } }],
            },
          },
        ],
      },
      { section_name: "DESCRIPTION", widgets: [{ widget_type: "DESCRIPTION_ROW", data: { text: "فروش فوری آپارتمان — مستقیم از مالک، بدون واسطه" } }] },
      { section_name: "IMAGE", widgets: [{ widget_type: "IMAGE_CAROUSEL", data: { items: [{ image: { url: "https://s100.divar.ir/thumb/1.jpg" } }] } }] },
      {
        section_name: "LIST_DATA",
        widgets: [
          {
            widget_type: "GROUP_INFO_ROW",
            data: {
              items: [
                { title: "قیمت کل", value: "۳,۰۰۰,۰۰۰,۰۰۰ تومان" },
                { title: "قیمت هر متر", value: "۴۰,۰۰۰,۰۰۰ تومان" },
                { title: "متراژ", value: "۷۵" },
                { title: "اتاق", value: "۲" },
                { title: "ساخت", value: "۱۳۹۵" },
                { title: "طبقه", value: "۲ از ۵" },
              ],
            },
          },
        ],
      },
      { section_name: "MAP", widgets: [{ widget_type: "MAP_ROW", data: { location: { exact_data: { point: { latitude: 38.05, longitude: 46.32 } } } } }] },
    ],
  };
}

/** ماک fetch دیوار: جست‌وجو = دو ردیف شخصی · جزئیات = آگهی شخصی درون بازه */
function installDivarMock(): void {
  globalThis.fetch = (async (input: unknown) => {
    const url = String(input);
    if (url.includes("/v8/postlist/w/search")) {
      return jsonRes({
        list_widgets: TEST_TOKENS.map((t) => ({
          widget_type: "POST_ROW",
          data: { token: t, title: `آپارتمان ${t}`, middle_description_text: "۳,۰۰۰,۰۰۰,۰۰۰ تومان", red_text: null, image_count: 1, image_url: null, top_description_text: null, bottom_description_text: null },
        })),
        pagination: { has_next_page: false, data: { page: 1, last_post_date: "", search_uid: "u", viewed_tokens: "" } },
      });
    }
    if (url.includes("/v8/posts-v2/web/")) {
      const token = url.split("/").filter(Boolean).pop() ?? "";
      return jsonRes(personalPostDetail(token));
    }
    return jsonRes({});
  }) as typeof fetch;
}

/** انتظار قطعی برای پایان کار اسکن (سقف ۳۰ث) */
async function waitForJobDone(): Promise<import("@/lib/divar/scan").ScanJobView> {
  const { getScanJob } = await import("@/lib/divar/scan");
  const deadline = Date.now() + 30_000;
  for (;;) {
    const job = getScanJob();
    if (job && job.status !== "running") return job;
    if (Date.now() > deadline) throw new Error("کار اسکن در مهلت تست پایان نیافت");
    await new Promise((r) => setTimeout(r, 100));
  }
}

let settingsBackup: { dataJson: string; locFilterInit: boolean } | null = null;
let statsBackup: Array<{ scopeKey: string; medianPerMeter: number; p25PerMeter: number; p75PerMeter: number; sampleCount: number }> = [];
const testStart = new Date();
const sessionTokens: string[] = [];

beforeAll(async () => {
  const row = await db.divarSetting.findUnique({ where: { id: "singleton" } });
  if (row) settingsBackup = { dataJson: row.dataJson, locFilterInit: row.locFilterInit };
  statsBackup = await db.marketPriceStat.findMany({ select: { scopeKey: true, medianPerMeter: true, p25PerMeter: true, p75PerMeter: true, sampleCount: true } });
  // تنظیمات ایزولهٔ تست: یک دسته · یک صفحه · بدون فیلتر مکان · پنجرهٔ هفته
  const { DIVAR_DEFAULT_SETTINGS } = await import("@/lib/divar/config");
  const testSettings = {
    ...DIVAR_DEFAULT_SETTINGS,
    timeWindow: "7d" as const,
    categories: ["apartment-sell"],
    maxScanPages: 1,
    autoScanMinutes: 0,
    areaIds: [] as string[],
    lineIds: [] as string[],
  };
  await db.divarSetting.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", dataJson: JSON.stringify(testSettings), locFilterInit: true },
    update: { dataJson: JSON.stringify(testSettings), locFilterInit: true },
  });
  await db.divarAd.deleteMany({ where: { token: { in: TEST_TOKENS } } });
  await db.divarScanLog.deleteMany({ where: { startedAt: { gte: testStart } } });
});

afterAll(async () => {
  // پایان کارِ احتمالیِ باقی‌مانده پیش از بازگرداندن fetch واقعی
  try {
    await waitForJobDone();
  } catch {
    /* کار تمام‌شده یا مهلت — fetch بازگردانده می‌شود */
  }
  globalThis.fetch = realFetch;
  if (settingsBackup) {
    await db.divarSetting.update({ where: { id: "singleton" }, data: { dataJson: settingsBackup.dataJson, locFilterInit: settingsBackup.locFilterInit } });
  }
  await db.divarAd.deleteMany({ where: { token: { in: TEST_TOKENS } } });
  await db.divarScanLog.deleteMany({ where: { startedAt: { gte: testStart } } });
  // بازگردانی آمار بازار به عین قبلِ تست
  const after = await db.marketPriceStat.findMany();
  const before = new Map(statsBackup.map((s) => [s.scopeKey, s]));
  for (const s of after) {
    if (!before.has(s.scopeKey)) {
      await db.marketPriceStat.delete({ where: { id: s.id } }).catch(() => undefined);
    }
  }
  for (const b of statsBackup) {
    await db.marketPriceStat.updateMany({ where: { scopeKey: b.scopeKey }, data: { medianPerMeter: b.medianPerMeter, p25PerMeter: b.p25PerMeter, p75PerMeter: b.p75PerMeter, sampleCount: b.sampleCount } });
  }
  // پاک‌سازی نشست‌ها و ممیزی‌های تست
  for (const t of sessionTokens) {
    await db.session.deleteMany({ where: { tokenHash: createHash("sha256").update(t).digest("hex") } }).catch(() => undefined);
  }
  await db.auditLog.deleteMany({ where: { OR: [{ actor: { startsWith: "scan-job:" } }, { actor: { in: ["920001", "920002"] } }] } }).catch(() => undefined);
  await db.$disconnect();
});

describe("DIR-FF-SUPER-001 · ب — کار اسکن: آغاز، فازها، شمارنده‌ها و ذخیرهٔ فایل شخصی", () => {
  test("۵-۱ آغاز کار → پایان موفق؛ دو فایل شخصی کشف و ذخیره می‌شوند", async () => {
    installDivarMock();
    const { startScanJob, getScanJob } = await import("@/lib/divar/scan");
    const { started, job } = startScanJob("manual");
    expect(started).toBe(true);
    expect(job.status).toBe("running");
    expect(job.triggeredBy).toBe("manual");
    // snapshot کپی عمیق است — جهش آن وضعیت زندهٔ سرور را عوض نمی‌کند
    const mutated = job;
    mutated.progress.scanned = 999;

    const done = await waitForJobDone();
    expect(done.status).toBe("done");
    expect(done.summary).not.toBeNull();
    expect(done.summary!.ok).toBe(true);
    expect(done.phase).toBe("finalize");
    // شمارنده‌های زنده (نه مقدار جهش‌یافتهٔ ۹۹۹)
    expect(done.progress.scanned).toBe(2);
    expect(done.progress.queueTotal).toBe(2);
    expect(done.progress.processed).toBe(2);
    expect(done.progress.fetched).toBe(2);
    expect(done.progress.inWindow).toBe(2);
    expect(done.progress.newAds).toBe(2);
    expect(done.progress.autoRejected).toBe(0);
    // کپی مستقل — سرور همان ۲ را دید نه ۹۹۹
    expect(getScanJob()!.progress.scanned).toBe(2);

    // ذخیرهٔ دو فایل شخصی با وضعیت active و برچسب شخصی
    const ads = await db.divarAd.findMany({ where: { token: { in: TEST_TOKENS } }, select: { token: true, status: true, publisherType: true, pricePerMeter: true, meterage: true } });
    expect(ads.length).toBe(2);
    for (const ad of ads) {
      expect(ad.status).toBe("active");
      expect(ad.publisherType).toBe("personal");
      expect(ad.pricePerMeter).toBe(40_000_000);
      expect(ad.meterage).toBe(75);
    }

    // گزارش DB — شمارنده‌های نهایی و بدون خطا
    const logRow = await db.divarScanLog.findFirst({ where: { startedAt: { gte: testStart } }, orderBy: { startedAt: "desc" } });
    expect(logRow).not.toBeNull();
    expect(logRow!.scanned).toBe(2);
    expect(logRow!.newAds).toBe(2);
    expect(logRow!.fetched).toBe(2);
    expect(logRow!.error).toBeNull();
  });

  test("۵-۲ قفل تک‌نمونه: در حین اجرا، آغاز دوباره همان کار را برمی‌گرداند (started=false)", async () => {
    const { startScanJob } = await import("@/lib/divar/scan");
    const first = startScanJob("manual");
    expect(first.started).toBe(true);
    // فراخوانی هم‌زمان (پیش از هر ریزکار) — قفل باید کار نخست را برگرداند
    const second = startScanJob("auto");
    expect(second.started).toBe(false);
    expect(second.job.id).toBe(first.job.id);
    await waitForJobDone();
  });
});

describe("DIR-FF-SUPER-001 · ج — روت‌های اسکن با موتور تازه", () => {
  function makeAuthRequest(token: string, method: "GET" | "POST"): Request {
    return new Request("http://localhost/api/divar/scan", { method, headers: { authorization: `Bearer ${token}` } });
  }

  test("۶-۱ POST مالک → 200 فوری با کارِ دستی (started=true + job) — بی‌مهلت ۲۰ث", async () => {
    installDivarMock();
    const { createSession } = await import("@/lib/auth/session");
    const { token } = await createSession({ personnelCode: "920001", displayName: "تست مالک", role: "OWNER" }, { ip: "127.0.0.1" }, null);
    sessionTokens.push(token);
    const route = await import("@/app/api/divar/scan/route");
    const t0 = Date.now();
    const res = await route.POST(makeAuthRequest(token, "POST") as never);
    const elapsedMs = Date.now() - t0;
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; started: boolean; job: { id: string; status: string; triggeredBy: string } | null };
    expect(body.ok).toBe(true);
    expect(body.started).toBe(true);
    expect(body.job).not.toBeNull();
    expect(body.job!.triggeredBy).toBe("manual");
    // گام دوم — بازگشت فوری: روت هرگز منتظر پایان اسکن نمی‌ماند
    expect(elapsedMs).toBeLessThan(5000);
    await waitForJobDone();
  });

  test("۶-۲ GET نشست‌دار → 200 + logs + فیلد job", async () => {
    const { createSession } = await import("@/lib/auth/session");
    const { token } = await createSession({ personnelCode: "920001", displayName: "تست مالک", role: "OWNER" }, { ip: "127.0.0.1" }, null);
    sessionTokens.push(token);
    const route = await import("@/app/api/divar/scan/route");
    const res = await route.GET(makeAuthRequest(token, "GET") as never);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; logs: unknown[]; job: unknown };
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.logs)).toBe(true);
    expect("job" in body).toBe(true);
  });

  test("۶-۳ POST مشاور → 403 بدون آغاز کار (بدون رکورد DivarScanLog جدید)", async () => {
    const before = await db.divarScanLog.count();
    const { createSession } = await import("@/lib/auth/session");
    const { token } = await createSession({ personnelCode: "920002", displayName: "تست مشاور", role: "CONSULTANT" }, { ip: "127.0.0.1" }, null);
    sessionTokens.push(token);
    const route = await import("@/app/api/divar/scan/route");
    const res = await route.POST(makeAuthRequest(token, "POST") as never);
    expect(res.status).toBe(403);
    const after = await db.divarScanLog.count();
    expect(after).toBe(before);
  });
});
