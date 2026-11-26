/**
 * tests/dir-owner-4steps-001.test.ts — سوئیت تخصصی دستور چهارسگامی مالک
 * ---------------------------------------------------------------------------
 * دستور مالک (۱۴۰۵/۰۹/۰۵ · DIR-OWNER-4STEPS-001):
 *   گام اول: «کدنصب تولید شده، رلهٔ ترموکس را فعال نمی‌کند» — چهار ترمیم
 *            ریشه‌ای DIR-RELAY-ACTIVATE-001 + شاهد فعال‌سازی در هستهٔ رله.
 *   گام دوم: حذف کامل بخش «حالت تمام‌ظرفیت ترموکس» از کاشی فایل‌یابی +
 *            رلهٔ ترموکس = اولویت اول ارسال/دریافت پیام برای ۱) اعمال تغییر/
 *            حذف کدملک/کددرخواست (کاشی تغییرات) و ۲) ثبت آگهی (کاشی فایل‌یابی) —
 *            فقط ثبت آگهی در فایل‌یابی از رله استفاده می‌کند، ولاغیر.
 *   گام سوم: جستجوی مناطق/محله‌ها در «تنظیمات اختصاصی ایجنت فایل‌یابی» و
 *            «فیلتر فهرست‌های چهارگانه» دقیقاً همانند و منطبق با بخش مناطق
 *            ثبت آگهی جدید در سامانه ARM.
 *   گام چهارم: حذف «پیش‌فرض ۱۷ منطقه» + تثبیت آخرین تنظیم مالک تا تنظیم بعدی.
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { readFileSync, mkdtempSync, writeFileSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

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

const FF_PAGE = readFileSync(join(ROOT, "src/core/tiles/tiles/file-finder/FileFinderPage.tsx"), "utf8");
const FF_REGISTER = readFileSync(join(ROOT, "src/core/tiles/tiles/file-finder/RegisterDialog.tsx"), "utf8");
const CH_PAGE = readFileSync(join(ROOT, "src/core/tiles/tiles/changes/ChangesPage.tsx"), "utf8");
const FF_INDEX = readFileSync(join(ROOT, "src/core/tiles/tiles/file-finder/index.ts"), "utf8");
const PROXY_LIB = readFileSync(join(ROOT, "src/lib/melk-api/proxy.ts"), "utf8");
const CLIENT_LIB = readFileSync(join(ROOT, "src/lib/melk-api/client.ts"), "utf8");
const RELAY_LIB = readFileSync(join(ROOT, "src/lib/melk-api/relay.ts"), "utf8");
const CHANGES_LISTING_ROUTE = readFileSync(join(ROOT, "src/app/api/changes/listing/route.ts"), "utf8");
const CHANGES_REQUEST_ROUTE = readFileSync(join(ROOT, "src/app/api/changes/request/route.ts"), "utf8");
const REGISTER_ROUTE = readFileSync(join(ROOT, "src/app/api/divar/ads/[token]/register/route.ts"), "utf8");
const ARM_PICKER = readFileSync(join(ROOT, "src/components/app/shared/arm-region-picker.tsx"), "utf8");
const AREA_LINE_FILTER = readFileSync(join(ROOT, "src/components/app/shared/area-line-filter.tsx"), "utf8");
const NEW_LISTING_DIALOG = readFileSync(join(ROOT, "src/core/tiles/tiles/listing/NewListingDialog.tsx"), "utf8");
const ARM_LISTINGS_PAGE = readFileSync(join(ROOT, "src/core/tiles/tiles/arm-listing/ArmListingsPage.tsx"), "utf8");
const ARM_REQUESTS_PAGE = readFileSync(join(ROOT, "src/core/tiles/tiles/arm-request/ArmRequestsPage.tsx"), "utf8");
const DIVAR_CONFIG = readFileSync(join(ROOT, "src/lib/divar/config.ts"), "utf8");
const DIVAR_STORE = readFileSync(join(ROOT, "src/lib/divar/store.ts"), "utf8");
const SETTINGS_ROUTE = readFileSync(join(ROOT, "src/app/api/divar/settings/route.ts"), "utf8");
const LOCATIONS_ROUTE = readFileSync(join(ROOT, "src/app/api/divar/locations/route.ts"), "utf8");

const ARM_URL = "https://arus-api.melketabriz.ir/api/apm/properties/create";
const DIVAR_URL = "https://api.divar.ir/v8/postlist/w/search";

/* ═══════════════════════ گام اول — کدنصب فعال‌سازی رله ═══════════════════════ */

describe("DIR-OWNER-4STEPS-001 · گام اول — چهار ترمیم ریشه‌ای کدنصب", () => {
  let relayScript: typeof import("@/lib/melk-api/relay-script");
  let installCommand: string;
  let coreScript: string;
  let tmp: string;

  beforeAll(() => {
    relayScript = require("@/lib/melk-api/relay-script");
    installCommand = relayScript.buildInstallCommand("https://melka.example.com", "a1b2c3d4e5f6a7b8c9d0");
    coreScript = relayScript.buildRelayScript({
      serverUrl: "https://melka.example.com",
      deviceId: "dev-4steps-001",
      deviceSecret: "f".repeat(64),
      altServerUrl: "",
    });
    tmp = mkdtempSync(join(tmpdir(), "melka-4steps-install-"));
    writeFileSync(join(tmp, "install.sh"), installCommand, "utf8");
    writeFileSync(join(tmp, "core-relay.sh"), coreScript, "utf8");
  });

  afterAll(() => {
    try {
      rmSync(tmp, { recursive: true, force: true });
    } catch {
      /* بهترین‌تلاش */
    }
  });

  test("۱-۱ ترمیم ۸: قرارداد reason رد bootstrap — خواندن دلیل و پیام‌های تمایزیافته", () => {
    expect(installCommand).toContain("jq -r '.reason // empty'");
    expect(installCommand).toContain('reject_reason=""');
    for (const reason of ["used", "limit", "expired", "invalid", "revoked"]) {
      expect(installCommand).toContain(`    ${reason})`);
    }
  });

  test("۱-۲ ترمیم ۹: reason=used + هستهٔ محلی → احیای محلی (بی‌نیاز از کد تازه)", () => {
    expect(installCommand).toContain("هستهٔ موجود روی همین گوشی را دوباره راه می‌اندازم");
    expect(installCommand).toContain("start_relay_core \"$HOME/melka-relay/core-relay.sh\"");
  });

  test("۱-۳ ترمیم ۱۰: تصدیب tmux با has-session — شکست tmux هرگز «نصب موفق» جعلی نمی‌سازد", () => {
    expect(installCommand).toContain("tmux new-session -d -s melka-relay");
    expect(installCommand).toContain("if tmux has-session -t melka-relay");
    expect(installCommand).toContain("عقبهٔ nohup");
  });

  test("۱-۴ ترمیم ۱۱: تماشای فعال‌سازی ۱۵۰ثانیه‌ای با شاهد نخستین Poll موفق", () => {
    expect(installCommand).toContain("watch_relay_activation()");
    expect(installCommand).toContain("تا ۱۵۰ ثانیه");
    expect(installCommand).toContain("رلهٔ ترموکس فعال شد و به سرور ملکا متصل است");
    expect(installCommand).toContain("رلهٔ ملکا فعال است");
    // رد ابطال در تماشا نیز پوشش داده شده است
    expect(installCommand).toContain("device revoked");
  });

  test("۱-۵ هستهٔ رله: خط شاهد فعال‌سازی (CONNECT_OK) در هر دو مسیر Poll (خالی و پر)", () => {
    expect(coreScript).toContain("CONNECT_OK");
    expect(coreScript).toContain("✓ اتصال تأیید شد — رلهٔ ملکا فعال است");
    // مسیر خالی (204) و مسیر پر (items) — هر دو CONNECT_OK را صادر می‌کنند
    const code = codeOf(coreScript);
    const occurrences = code.split("CONNECT_OK=1").length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(2);
  });

  test("۱-۶ bash -n — هر دو اسکریپت (دستور نصب و هستهٔ رله) از نظر نحوی سالم‌اند", () => {
    expect(() => execSync(`bash -n ${join(tmp, "install.sh")}`, { stdio: "pipe" })).not.toThrow();
    expect(() => execSync(`bash -n ${join(tmp, "core-relay.sh")}`, { stdio: "pipe" })).not.toThrow();
  });
});

/* ═══════════════════════ گام دوم — حذف بخش + اولویت اول رله ═══════════════════════ */

describe("DIR-OWNER-4STEPS-001 · گام دوم اولاً — حذف کامل بخش «حالت تمام‌ظرفیت ترموکس» از کاشی فایل‌یابی", () => {
  test("۲-۱ صفحهٔ کاشی: هیچ اثری از بخش در کد نیست (کارت، کلید حالت عادی، نبض ۱۵ث، هلپر)", () => {
    // نظرات مستندسازیِ «حذفِ بخش» مجازند — کدِ خالص باید پاک باشد
    const code = codeOf(FF_PAGE);
    expect(code).not.toContain("حالت تمام‌ظرفیت ترموکس");
    expect(code).not.toContain("حالت عادی");
    expect(code).not.toContain("capacity-client");
    expect(code).not.toContain("/api/changes");
    expect(code).not.toContain("capacityRetry");
    expect(code).not.toContain("togglingCapacity");
    expect(code).not.toContain("CapacityStatus");
  });

  test("۲-۲ پنجرهٔ ثبت: بلوک نمایش وضعیت نشست حذف شد — سلوک سرور پابرجاست", () => {
    expect(FF_REGISTER).not.toContain("حالت تمام‌ظرفیت ترموکس");
    expect(FF_REGISTER).not.toContain("api<{ ok: boolean; session: CapacitySessionView }>(\"/api/changes\")");
    expect(codeOf(FF_REGISTER)).not.toContain("/api/changes");
  });

  test("۲-۳ رجیستری کاشی: tagline و تنظیم نمایشی «autoFullCapacity» پاک شد", () => {
    expect(FF_INDEX).not.toContain("حالت تمام‌ظرفیت ترموکس");
    expect(FF_INDEX).not.toContain("autoFullCapacity");
  });

  test("۲-۴ کاشی تغییرات دست‌نخورده — بخش تمام‌ظرفیت خود را نگه دارد (خارج از دستور)", () => {
    expect(CH_PAGE).toContain("حالت تمام‌ظرفیت ترموکس");
  });

  test("۲-۵ روت ثبت: نشست عملیاتی خودکار پیش از انتقال به ARM (اولویت اول رله)", () => {
    const code = codeOf(REGISTER_ROUTE);
    expect(code).toContain("ensureChangesSessionForOperation");
    const sessIdx = REGISTER_ROUTE.indexOf("await ensureChangesSessionForOperation(");
    const xferIdx = REGISTER_ROUTE.indexOf("transferListingToCrm(");
    expect(sessIdx).toBeGreaterThan(0);
    expect(xferIdx).toBeGreaterThan(sessIdx);
  });
});

describe("DIR-OWNER-4STEPS-001 · گام دوم ثانیاً — رلهٔ ترموکس اولویت اول ارسال/دریافت پیام", () => {
  let proxy: typeof import("@/lib/melk-api/proxy");
  let relay: typeof import("@/lib/melk-api/relay");
  let db: typeof import("@/lib/db")["db"];
  let tmpRuntime: string;
  const deviceId = "dev-4steps-priority-001";
  let prevRuntimeDir: string | undefined;
  let prevRelayMode: string | undefined;

  beforeAll(() => {
    proxy = require("@/lib/melk-api/proxy");
    relay = require("@/lib/melk-api/relay");
    db = require("@/lib/db").db;
    tmpRuntime = mkdtempSync(join(tmpdir(), "owner-4steps-runtime-"));
    prevRuntimeDir = process.env.MELK_LCPP_RUNTIME_DIR;
    prevRelayMode = process.env.MELK_ARM_RELAY_MODE;
    process.env.MELK_LCPP_RUNTIME_DIR = tmpRuntime;
    process.env.MELK_ARM_RELAY_MODE = ""; // حالت سراسری خاموش — آزمون «اولویت اول عملیاتی»
  });

  afterAll(() => {
    if (prevRuntimeDir !== undefined) process.env.MELK_LCPP_RUNTIME_DIR = prevRuntimeDir;
    if (prevRelayMode !== undefined) process.env.MELK_ARM_RELAY_MODE = prevRelayMode;
    try {
      rmSync(tmpRuntime, { recursive: true, force: true });
    } catch {
      /* بهترین‌تلاش */
    }
    void db.relayDevice.deleteMany({ where: { deviceId } }).catch(() => undefined);
  });

  /** نشست عملیاتی فعال را شبیه‌سازی می‌کند (عین beginChangesSession ولی بدون db) */
  function writeSession(): void {
    const now = new Date();
    writeFileSync(
      join(tmpRuntime, "changes-session.json"),
      JSON.stringify({
        version: 1,
        startedAt: now.toISOString(),
        expiresAt: new Date(now.getTime() + 30 * 60_000).toISOString(),
        actor: "TEST",
        note: "owner-4steps fixture",
      }),
      "utf8"
    );
  }

  function clearSession(): void {
    try {
      unlinkSync(join(tmpRuntime, "changes-session.json"));
    } catch {
      /* نبود = بی‌نشست */
    }
  }

  test("۲-۶ تصمیم مسیریابی — shouldRouteViaRelay (منبع یگانه در proxy.ts)", () => {
    expect(PROXY_LIB).toContain("export async function shouldRouteViaRelay");
    expect(PROXY_LIB).toContain("if (await shouldRouteViaRelay(url)) return relayFetch(url, init);");
    // armCall هم همان تصمیم را برای مهلت انتظار صف می‌گیرد
    expect(CLIENT_LIB).toContain("isChangesSessionActive()");
    expect(CLIENT_LIB).toContain("(relayModeActive() || isChangesSessionActive()) && isMelkTabrizHost(url)");
  });

  test("۲-۷ رفتار زنده — بدون نشست و بدون حالت سراسری: مسیر مستقیم (رله خاموش)", async () => {
    clearSession();
    await expect(proxy.shouldRouteViaRelay(ARM_URL)).resolves.toBe(false);
  });

  test("۲-۸ رفتار زنده — نشست عملیاتی فعال (تغییرات/ثبت) + رله برخط: رله اولویت اول", async () => {
    clearSession();
    // دستگاه رله برخط
    await db.relayDevice.create({
      data: {
        deviceId,
        secret: "s".repeat(64),
        label: "owner-4steps test",
        enrollCode: "t".repeat(36),
        enrollExpires: new Date(Date.now() + 3600_000),
        maxAttempts: 99,
        lastSeenAt: new Date(),
        enrolledBy: "test",
      },
    });
    try {
      writeSession();
      await expect(proxy.shouldRouteViaRelay(ARM_URL)).resolves.toBe(true); // رله مقدم است
      await expect(proxy.shouldRouteViaRelay(DIVAR_URL)).resolves.toBe(false); // دیوار هرگز
      clearSession();
      await expect(proxy.shouldRouteViaRelay(ARM_URL)).resolves.toBe(false); // بدون نشست → مسیر قبلی
    } finally {
      clearSession();
      await db.relayDevice.deleteMany({ where: { deviceId } });
    }
  });

  test("۲-۹ رفتار زنده — نشست فعال اما رله آفلاین: صادقانه مسیر قبلی ادامه می‌یابد", async () => {
    clearSession();
    // دستگاهی با آخرین دیده‌شدنِ ۳۰ دقیقه پیش (خارج از پنجرهٔ ۲۴۰ث)
    await db.relayDevice.create({
      data: {
        deviceId,
        secret: "s".repeat(64),
        label: "owner-4steps offline",
        enrollCode: "u".repeat(36),
        enrollExpires: new Date(Date.now() + 3600_000),
        maxAttempts: 99,
        lastSeenAt: new Date(Date.now() - 30 * 60_000),
        enrolledBy: "test",
      },
    });
    try {
      writeSession();
      await expect(proxy.shouldRouteViaRelay(ARM_URL)).resolves.toBe(false);
    } finally {
      clearSession();
      await db.relayDevice.deleteMany({ where: { deviceId } });
    }
  });

  test("۲-۱۰ رفتار زنده — حالت سراسری رله روشن: همیشه رله (مثل قبل)", async () => {
    process.env.MELK_ARM_RELAY_MODE = "mobile";
    try {
      await expect(proxy.shouldRouteViaRelay(ARM_URL)).resolves.toBe(true);
      await expect(proxy.shouldRouteViaRelay(DIVAR_URL)).resolves.toBe(false); // میزبان غیر-آرم مستقیم
    } finally {
      process.env.MELK_ARM_RELAY_MODE = "";
    }
  });

  test("۲-۱۱ اولویت صف — خانوادهٔ ثبت (users/create) در نشست فعال: سقف ۱۰؛ بیرونش ۵", () => {
    expect(RELAY_LIB).toContain("/users\\/(update|info|create|delete)");
    clearSession();
    expect(relay.relayPriorityForUrl("https://arus-api.melketabriz.ir/api/apm/users/create")).toBe(5);
    expect(relay.relayPriorityForUrl("https://arus-api.melketabriz.ir/api/apm/users/info/mobile-number/989144018677")).toBe(5);
    writeSession();
    try {
      expect(relay.relayPriorityForUrl("https://arus-api.melketabriz.ir/api/apm/users/create")).toBe(10);
      expect(relay.relayPriorityForUrl("https://arus-api.melketabriz.ir/api/apm/users/info/mobile-number/989144018677")).toBe(10);
      expect(relay.relayPriorityForUrl("https://arus-api.melketabriz.ir/api/apm/properties/create")).toBe(10);
      expect(relay.relayPriorityForUrl("https://arus-api.melketabriz.ir/api/apm/requests/list")).toBe(10);
    } finally {
      clearSession();
    }
  });

  test("۲-۱۲ کاشی تغییرات: هر دو روت نوشتاری، نشست را خودکار فعال می‌کنند (اولویت اول رله)", () => {
    for (const [name, route] of [["listing", CHANGES_LISTING_ROUTE], ["request", CHANGES_REQUEST_ROUTE]] as const) {
      expect(route, `روت ${name}`).toContain("ensureChangesSessionForOperation");
      // نشست پیش از نخستین فراخوانیِ عملیات نوشتاری برپا می‌شود (نه صرفاً import)
      const sessIdx = route.indexOf("await ensureChangesSessionForOperation(");
      const firstExecIdx = route.search(/await (changeListingOwnerInfo|changeListingHistoryDate|deleteListingCode|changeRequestHistoryDate|deleteRequestCode)\(/);
      expect(sessIdx).toBeGreaterThan(0);
      expect(firstExecIdx).toBeGreaterThan(sessIdx);
    }
  });

  test("۲-۱۳ اسکن دیوار همچنان صفر رله — تنها نقطهٔ اتصال فایل‌یابی به رله، روت ثبت است", () => {
    // (گارد کامل سیاست در dir-ff-relay-policy-001) — اینجا قرارداد گام دوم:
    const scanRoute = readFileSync(join(ROOT, "src/app/api/divar/scan/route.ts"), "utf8");
    expect(codeOf(scanRoute)).not.toContain("ensureChangesSessionForOperation");
    expect(codeOf(scanRoute)).not.toContain("enqueueRelayRequest");
  });
});

/* ═══════════════════════ گام سوم — مناطق دقیقاً همانند ثبت آگهی آرم ═══════════════════════ */

describe("DIR-OWNER-4STEPS-001 · گام سوم — جستجوی مناطق/محله‌ها عین بخش مناطق ثبت آگهی آرم", () => {
  test("۳-۱ انتخابگر مشترک ArmRegionPicker — عین ساختار بخش مناطق ثبت آگهی آرم (دو دراپ‌داون وابسته)", () => {
    expect(ARM_PICKER).toContain("منطقه (منطقه‌بندی آرم)");
    expect(ARM_PICKER).toContain("ابتدا منطقه را انتخاب کنید"); // عین placeholder فرم آرم
    expect(ARM_PICKER).toContain("SelectValue placeholder=\"انتخاب کنید\""); // عین placeholder منطقهٔ فرم آرم
    expect(ARM_PICKER).toContain('disabled={!currentArea}');
  });

  test("۳-۲ رجیستری یگانه — ArmRegionPicker و فرم ثبت آگهی آرم از همان منبع می‌خوانند", () => {
    expect(ARM_PICKER).toContain('from "@/lib/divar/tabriz-locations"');
    expect(NEW_LISTING_DIALOG).toContain('api<LocationsResponse>("/api/divar/locations")'); // فرم آرم از همان رجیستری
    const { TABRIZ_AREAS, ALL_LINES } = require("@/lib/divar/tabriz-locations");
    expect(TABRIZ_AREAS.length).toBe(130);
    expect(ALL_LINES.length).toBe(926);
  });

  test("۳-۳ تنظیمات اختصاصی ایجنت فایل‌یابی: ArmRegionPicker نشسته و فهرست/جستجوی قدیمی حذف شد", () => {
    expect(FF_PAGE).toContain("<ArmRegionPicker");
    expect(FF_PAGE).toContain('idPrefix="file-finder-agent"');
    expect(FF_PAGE).toContain("جستجوی مناطق و محله‌ها");
    expect(FF_PAGE).not.toContain("جست‌وجوی منطقه یا محله…"); // اینپوت جستجوی قدیمی
    expect(FF_PAGE).not.toContain("toggleAreaSelected"); // چک‌لیست قدیمی
  });

  test("۳-۴ فیلتر فهرست‌های چهارگانه: AreaLineFilter پوششی روی همان ArmRegionPicker است", () => {
    expect(AREA_LINE_FILTER).toContain('from "./arm-region-picker"');
    expect(AREA_LINE_FILTER).toContain("ArmRegionPicker idPrefix={idPrefix}");
    // قرارداد بیرونی نامی حفظ شد (تغییر صفر برای روت‌های فهرست)
    expect(AREA_LINE_FILTER).toContain("export interface AreaLineSelection {");
  });

  test("۳-۵ هر دو فهرست چهارگانه (آگهی/درخواست) از همان فیلتر استفاده می‌کنند", () => {
    expect(ARM_LISTINGS_PAGE).toContain("<AreaLineFilter");
    expect(ARM_REQUESTS_PAGE).toContain("<AreaLineFilter");
  });

  test("۳-۶ روت locations: همان رجیستری ثبت آگهی آرم — بدون defaults (گام چهارم)", () => {
    expect(codeOf(LOCATIONS_ROUTE)).not.toContain("DEFAULT_LOCATION_AREA_IDS");
    expect(codeOf(LOCATIONS_ROUTE)).toContain("TABRIZ_AREAS.map");
  });
});

/* ═══════════════════════ گام چهارم — حذف پیش‌فرض ۱۷ + تثبیت آخرین تنظیم ═══════════════════════ */

describe("DIR-OWNER-4STEPS-001 · گام چهارم — حذف «پیش‌فرض ۱۷ منطقه» + تثبیت آخرین تنظیم", () => {
  test("۴-۱ UI: دکمهٔ «پیش‌فرض ۱۷ منطقه» و تابع بازگردانی آن حذف شد", () => {
    expect(FF_PAGE).not.toContain("پیش‌فرض ۱۷ منطقه");
    expect(FF_PAGE).not.toContain("resetDefaultLocations");
    // کلید «همه تبریز» (پاک‌کردن فیلتر) پابرجاست
    expect(FF_PAGE).toContain("همه تبریز");
  });

  test("۴-۲ پیش‌فرض خاموش = همهٔ تبریز — هیچ کاشت ۱۷منطقه‌ای در config/store نیست", () => {
    const { DIVAR_DEFAULT_SETTINGS } = require("@/lib/divar/config");
    expect(DIVAR_DEFAULT_SETTINGS.areaIds).toEqual([]);
    expect(DIVAR_DEFAULT_SETTINGS.lineIds).toEqual([]);
    expect(codeOf(DIVAR_CONFIG)).not.toContain("DEFAULT_LOCATION_AREA_IDS");
    expect(codeOf(DIVAR_STORE)).not.toContain("DEFAULT_LOCATION_AREA_IDS"); // مهاجرت دیگر کاشت نمی‌کند
  });

  test("۴-۳ API: فیلد پیش‌فرضِ جدا (locationDefaults/defaults) از پاسخ‌ها حذف شد", () => {
    expect(codeOf(SETTINGS_ROUTE)).not.toContain("locationDefaults");
    expect(codeOf(LOCATIONS_ROUTE)).not.toContain("defaults:");
  });

  test("۴-۴ سازوکار تثبیت: ذخیرهٔ سرور — آخرین تنظیم مالک بارها بارگذاری می‌شود و تغییر نمی‌کند", async () => {
    const { loadDivarSettings, saveDivarSettings } = require("@/lib/divar/store");
    const { TABRIZ_AREAS } = require("@/lib/divar/tabriz-locations");
    // مالک سه منطقه برمی‌گزیند
    const picked = [TABRIZ_AREAS[0].id, TABRIZ_AREAS[5].id, TABRIZ_AREAS[9].id];
    await saveDivarSettings({ areaIds: picked, lineIds: [] });
    // «بارگذاری مجدد» چندباره — تنظیم مالک تثبیت است (تا تنظیم بعدی مالک)
    const loads = [await loadDivarSettings(), await loadDivarSettings(), await loadDivarSettings()];
    for (const s of loads) expect(s.areaIds).toEqual(picked);
    // بازگشت به خنثی برای سایر سوئیت‌ها
    await saveDivarSettings({ areaIds: [], lineIds: [] });
  });
});
