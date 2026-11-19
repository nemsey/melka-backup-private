/**
 * تست‌های DIR-CHANGES-TILE-001 — کاشی «تغییرات» (دستور مالک ۱۴۰۵/۰۸/۲۸)
 * ---------------------------------------------------------------------------
 * پوشش:
 *   ۱) متغیرهای گام اول — تبدیل تاریخ جلالی↔ISO عین قرارداد ۰۹۹
 *      (۱۴۰۵/۰۸/۲۰ ساعت ۱۷:۳۰ تهران = 2026-11-11T14:00:00.000Z)
 *   ۲) دو قابلیت (گام دوم) — شرح کاپبیلیتی‌ها + شناسه‌های کاتالوگ ARM
 *   ۳) نشست تمام‌ظرفیت (گام سوم) — چرخهٔ کامل begin/active/idempotent/end
 *      + انقضای خودکار + ممیزی AuditLog
 *   ۴) گیت‌های توقف فهرست‌ها — runLcppCycle/catalogDaemonTick/runExpertsListUpdate
 *   ۵) اولویت رله — خانوادهٔ تغییرات ۵ عادی / ۱۰ در حالت تمام‌ظرفیت؛ انبوه دست‌نخورده
 *   ۶) کاشی در رجیستری — ثبت شده + minRole=OWNER + آیکون/شناسه پایدار
 *   ۷) اسکریپت ترموکس نسل O — پرچم boost + poll میان‌موجی تندتر + لاین اکسپرس تغییرات
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// دایرکتوری اجرایی ایزوله برای فایل نشست (عین الگوی MELK_LCPP_RUNTIME_DIR)
const RUNTIME_DIR = mkdtempSync(join(tmpdir(), "changes-tile-runtime-"));
process.env.MELK_LCPP_RUNTIME_DIR = RUNTIME_DIR;

const { db } = await import("@/lib/db");
const V = await import("@/lib/changes/variables");
const S = await import("@/lib/changes/session");
const { relayPriorityForUrl, RELAY_PRIORITY_CHANGES, RELAY_PRIORITY_INTERACTIVE } = await import("@/lib/melk-api/relay");
const { buildRelayScript, buildInstallCommand } = await import("@/lib/melk-api/relay-script");

const ACTOR = { code: V.OWNER_IDENTITY.personnelCode, name: V.OWNER_IDENTITY.fullName };
const ARM = (p: string) => `https://arus-api.melketabriz.ir/api/apm/${p}`;

beforeAll(async () => {
  await db.auditLog.deleteMany({ where: { action: { startsWith: "CHANGES_SESSION" } } }).catch(() => undefined);
});

afterAll(async () => {
  // تضمین: حتی اگر تستی شکست خورد، نشست باقی نماند (پاک‌سازی فایل مستقیم)
  S.endChangesSession(db, ACTOR).catch(() => undefined);
  await db.auditLog.deleteMany({ where: { action: { startsWith: "CHANGES_SESSION" } } }).catch(() => undefined);
  await db.$disconnect();
  rmSync(RUNTIME_DIR, { recursive: true, force: true });
});

/* ═══════════ ۱) متغیرهای گام اول — تاریخ عین ۰۹۹ ═══════════ */

describe("DIR-CHANGES-TILE-001 · ۱) متغیرها — تاریخ جلالی ↔ ISO (قرارداد ۰۹۹)", () => {
  test("۱-۱ شاهکار ۰۹۹: ۱۴۰۵/۰۸/۲۰ ساعت ۱۷:۳۰ تهران → 2026-11-11T14:00:00.000Z", () => {
    expect(V.jalaliHourToIsoUtc("1405/08/20", "17:30")).toBe("2026-11-11T14:00:00.000Z");
  });

  test("۱-۲ فقط-تاریخ: ۱۴۰۵/۰۸/۲۰ → 2026-11-11 (قالب JalaliDatePicker)", () => {
    expect(V.jalaliToIsoDate("1405/08/20")).toBe("2026-11-11");
  });

  test("۱-۳ رفت‌وبرگشت: ISO → «۱۷:۳۰ | ۱۴۰۵/۰۸/۲۰»", () => {
    expect(V.isoToJalaliHour("2026-11-11T14:00:00.000Z")).toBe("17:30 | 1405/08/20");
  });

  test("۱-۴ نیمه‌شب تهران (قرض روز) و قالب خط تیره و ورودی نامعتبر", () => {
    expect(V.jalaliHourToIsoUtc("1405/08/20", "00:00")).toBe("2026-11-10T20:30:00.000Z");
    expect(V.jalaliHourToIsoUtc("1405-08-20", "17:30")).toBe("2026-11-11T14:00:00.000Z");
    expect(V.jalaliHourToIsoUtc("1405/08/20", "25:00")).toBeNull();
    expect(V.jalaliHourToIsoUtc("بی‌تاریخ", "17:30")).toBeNull();
  });

  test("۱-۵ مکان رسمی — شهر تبریز عین منطقه‌بندی رسمی (منبع یکتا)", () => {
    expect(V.LOCATION_IDS.country).toBe("614ed19700cace6eac4f9ded");
    expect(V.LOCATION_IDS.state).toBe("614ed19700cace6eac4f9df0");
    expect(V.LOCATION_IDS.city).toBe("614ed19700cace6eac4f9df2");
  });

  test("۱-۶ اقدام تاریخچهٔ «ایجاد مشاور» — شناسهٔ واقعی کشف‌شدهٔ ۰۹۹", () => {
    expect(V.HISTORY_ACTION_TYPES.createRealtor.id).toBe("6506dde8c772727517fed9b8");
    expect(V.HISTORY_ACTION_TYPES.createRealtor.name).toBe("ایجاد مشاور");
  });

  test("۱-۷ مقادیر استاندارد ۰۹۹ — نقدی + زیاد", () => {
    expect(V.STANDARD_DEFAULTS.userPaymentMethod).toBe("61a39bf0f06329efdeacbbef");
    expect(V.STANDARD_DEFAULTS.userSeriousity).toBe("61a753650927675c45489a4f");
  });
});

/* ═══════════ ۲) دو قابلیت (گام دوم) ═══════════ */

describe("DIR-CHANGES-TILE-001 · ۲) دو قابلیت — شرح و مسیرهای ARM", () => {
  test("۲-۱ دقیقاً دو قابلیت: کدآگهی (۱) + کد درخواست (۲)", () => {
    expect(V.CAPABILITIES.length).toBe(2);
    expect(V.CAPABILITIES[0].key).toBe("listing");
    expect(V.CAPABILITIES[0].order).toBe(1);
    expect(V.CAPABILITIES[1].key).toBe("request");
    expect(V.CAPABILITIES[1].order).toBe(2);
  });

  test("۲-۲ مسیرهای حیاتی هر دو قابلیت در ARM_PATHS", () => {
    expect(V.ARM_PATHS.requestCreate).toBe("requests/create");
    expect(V.ARM_PATHS.requestUpdate("X")).toBe("requests/update/X");
    expect(V.ARM_PATHS.requestHistory("X")).toBe("requests/history/X");
    expect(V.ARM_PATHS.requestInfo("X")).toBe("requests/info/X");
    expect(V.ARM_PATHS.requestEventCreate).toBe("request-events/create");
    expect(V.ARM_PATHS.requestEventUpdate("X")).toBe("request-events/update/X");
    expect(V.ARM_PATHS.requestEventDelete("X")).toBe("request-events/delete/X");
    expect(V.ARM_PATHS.propertyUpdate("X")).toBe("properties/update/X");
    expect(V.ARM_PATHS.propertyByCode(55920)).toBe("properties/info/by-code/55920");
    expect(V.ARM_PATHS.propertyOwner("X")).toBe("properties/owner/X");
    expect(V.ARM_PATHS.customerUpdate("X")).toBe("users/update/X");
    expect(V.ARM_PATHS.customerDelete("X")).toBe("users/delete/X");
    // واریانت‌های کشف ۰۰۲ — تاریخچهٔ کامل آگهی و حذف
    expect(V.ARM_PATHS.propertyHistoryVariants("X")[0]).toBe("properties/history/X");
    expect(V.ARM_PATHS.propertyDeleteVariants("X")[0].path).toBe("properties/delete/X");
    expect(V.ARM_PATHS.requestDeleteVariants("X")[0].path).toBe("requests/delete/X");
  });
});

/* ═══════════ ۳) نشست تمام‌ظرفیت (گام سوم) ═══════════ */

describe("DIR-CHANGES-TILE-001 · ۳) نشست تمام‌ظرفیت — چرخهٔ کامل", () => {
  test("۳-۱ پیش از شروع غیرفعال است", () => {
    expect(S.isChangesSessionActive()).toBe(false);
    expect(S.readChangesSession()).toBeNull();
  });

  test("۳-۲ begin → فعال + فایل نشست + شمارنده‌های صف + ممیزی", async () => {
    const res = await S.beginChangesSession(db, ACTOR, "آزمون ۳-۲");
    expect(res.ok).toBe(true);
    expect(res.alreadyActive).toBe(false);
    expect(res.session.actorName).toBe(V.OWNER_IDENTITY.fullName);
    expect(res.session.note).toBe("آزمون ۳-۲");
    expect(typeof res.session.started.queuePending).toBe("number");
    expect(new Date(res.session.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(S.isChangesSessionActive()).toBe(true);
    expect(existsSync(join(RUNTIME_DIR, V.CHANGES_SESSION_FILE))).toBe(true);
    const auditRows = await db.auditLog.findMany({ where: { action: "CHANGES_SESSION_BEGIN" } });
    expect(auditRows.length).toBeGreaterThanOrEqual(1);
  });

  test("۳-۳ begin تکراری → idempotent (همان نشست)", async () => {
    const res = await S.beginChangesSession(db, ACTOR, "دوباره");
    expect(res.alreadyActive).toBe(true);
  });

  test("۳-۴ انقضای خودکار — فایل منقضی = غیرفعال (محافظ فراموشی پایان)", async () => {
    const view = S.changesSessionView();
    expect(view.active).toBe(true);
    // شبیه‌سازی آینده: ۳۱ دقیقه بعد → نشست منقضی
    const future = new Date(Date.now() + (V.CHANGES_SESSION_MAX_MS + 60_000));
    expect(S.isChangesSessionActive(future)).toBe(false);
    expect(S.readChangesSession(future)).toBeNull();
  });

  test("۳-۵ end → غیرفعال + ممیزی پایان + شمارندهٔ بعد", async () => {
    const res = await S.endChangesSession(db, ACTOR);
    expect(res.ok).toBe(true);
    expect(res.wasActive).toBe(true);
    expect(res.after).not.toBeNull();
    expect(typeof res.after?.pending).toBe("number");
    expect(S.isChangesSessionActive()).toBe(false);
    const auditRows = await db.auditLog.findMany({ where: { action: "CHANGES_SESSION_END" } });
    expect(auditRows.length).toBeGreaterThanOrEqual(1);
  });

  test("۳-۶ end بدون نشست → wasActive=false (بی‌خطر)", async () => {
    const res = await S.endChangesSession(db, ACTOR);
    expect(res.wasActive).toBe(false);
  });

  test("۳-۷ ensureChangesSessionForOperation — خودکار برای هر عملیات نوشتاری", async () => {
    const before = S.isChangesSessionActive();
    expect(before).toBe(false);
    const res = await S.ensureChangesSessionForOperation(db, ACTOR, "آزمون ۳-۷");
    expect(res.active).toBe(true);
    expect(res.autoStarted).toBe(true);
    await S.endChangesSession(db, ACTOR);
  });
});

/* ═══════════ ۴) گیت‌های توقف فهرست‌ها ═══════════ */

describe("DIR-CHANGES-TILE-001 · ۴) گیت توقف بروزرسانی فهرست‌ها هنگام نشست فعال", () => {
  beforeAll(async () => {
    await S.beginChangesSession(db, ACTOR, "آزمون گیت‌ها");
  });
  afterAll(async () => {
    await S.endChangesSession(db, ACTOR);
  });

  test("۴-۱ runLcppCycle → null بی‌صدا (پیش از هر تماس شبکه — سریع)", async () => {
    const { runLcppCycle } = await import("@/sync/lists");
    const t0 = Date.now();
    const res = await runLcppCycle(db);
    expect(res).toBeNull();
    expect(Date.now() - t0).toBeLessThan(3000);
  });

  test("۴-۲ catalogDaemonTick → رد سریع بدون اجرای تیک", async () => {
    const { catalogDaemonTick } = await import("@/lib/melk-api/catalog-daemon");
    const t0 = Date.now();
    const st = await catalogDaemonTick(db);
    expect(st.running ?? false).toBe(false);
    expect(Date.now() - t0).toBeLessThan(3000);
  });

  test("۴-۳ runExpertsListUpdate → ran=false با reason=changes-session", async () => {
    const { runExpertsListUpdate } = await import("@/lib/melk-api/four-lists");
    const out = await runExpertsListUpdate(db, { pmToken: null, source: "forced" });
    expect(out.ran).toBe(false);
    expect(out.reason).toBe("changes-session");
  });

  test("۴-۴ پس از پایان نشست، مسیر عادی برمی‌گردد (no-token — نه changes-session)", async () => {
    await S.endChangesSession(db, ACTOR);
    const { runExpertsListUpdate } = await import("@/lib/melk-api/four-lists");
    const out = await runExpertsListUpdate(db, { pmToken: null, source: "manual" });
    expect(out.reason).toBe("no-token");
  });
});

/* ═══════════ ۵) اولویت رله (گام سوم — تمام ظرفیت ترموکس) ═══════════ */

describe("DIR-CHANGES-TILE-001 · ۵) اولویت رله — کاشی مقدم بر همه", () => {
  const CHANGES_PATHS = [
    "requests/create",
    "requests/update/abc123",
    "request-events/create",
    "properties/create",
    "properties/update/abc123",
    "properties/info/by-code/55920/title",
  ];

  test("۵-۱ در حالت عادی: خانوادهٔ تغییرات هم‌ردهٔ تعاملی (۵) — مقدم بر سینک", () => {
    for (const p of CHANGES_PATHS) {
      expect(relayPriorityForUrl(ARM(p))).toBe(RELAY_PRIORITY_INTERACTIVE);
    }
    // سینک/کاتالوگ دست‌نخورده
    expect(relayPriorityForUrl(ARM("requests/list"))).toBe(1);
    expect(relayPriorityForUrl(ARM("properties/details/x"))).toBe(0);
  });

  test("۵-۲ در حالت تمام‌ظرفیت: تغییرات ۱۰ (سقف)؛ انبوه همان پایین", async () => {
    await S.beginChangesSession(db, ACTOR, "آزمون اولویت");
    try {
      for (const p of CHANGES_PATHS) {
        expect(relayPriorityForUrl(ARM(p))).toBe(RELAY_PRIORITY_CHANGES);
      }
      // خواندن تاریخچه/جزئیات برای راستی‌آزمایی هم ۱۰
      expect(relayPriorityForUrl(ARM("requests/history/abc"))).toBe(RELAY_PRIORITY_CHANGES);
      expect(relayPriorityForUrl(ARM("request-event-types/list"))).toBe(RELAY_PRIORITY_CHANGES);
      // انبوه همچنان کم‌اولویت — فقط انتظار
      expect(relayPriorityForUrl(ARM("requests/list"))).toBe(1);
      expect(relayPriorityForUrl(ARM("properties/details/x"))).toBe(0);
    } finally {
      await S.endChangesSession(db, ACTOR);
    }
  });

  test("۵-۳ RELAY_PRIORITY_CHANGES = ۱۰ (سقف قرارداد صف)", () => {
    expect(RELAY_PRIORITY_CHANGES).toBe(10);
    expect(RELAY_PRIORITY_CHANGES).toBeGreaterThan(RELAY_PRIORITY_INTERACTIVE);
  });
});

/* ═══════════ ۶) کاشی در رجیستری ═══════════ */

describe("DIR-CHANGES-TILE-001 · ۶) کاشی در رجیستری", () => {
  test("۶-۱ ثبت شده با شناسهٔ پایدار + OWNER-only + ترتیب هشتم", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    await import("@/core/tiles/bootstrap");
    const t = tileRegistry.get(V.CHANGES_TILE_ID);
    expect(t).toBeDefined();
    expect(t!.id).toBe("changes");
    expect(t!.minRole).toBe("OWNER");
    expect(t!.order).toBe(8);
    expect(t!.title).toBe("تغییرات");
    // برای مشاور پنهان است (minRole=OWNER)
    const consultantView = tileRegistry.listAll("CONSULTANT").find((x) => x.id === "changes");
    expect(consultantView).toBeUndefined();
    const ownerView = tileRegistry.listAll("OWNER").find((x) => x.id === "changes");
    expect(ownerView).toBeDefined();
  });
});

/* ═══════════ ۷) اسکریپت ترموکس نسل O (کدنصب — گام سوم) ═══════════ */

describe("DIR-CHANGES-TILE-001 · ۷) کدنصب نسل O — آگاهی از حالت تمام‌ظرفیت", () => {
  const script = buildRelayScript({ serverUrl: "https://x.example", deviceId: "dev-1", deviceSecret: "s".repeat(64) });

  test("۷-۱ نشانگر نسل O + ثابت‌های boost", () => {
    expect(script).toContain("نسل O · DIR-CHANGES-TILE-001");
    expect(script).toContain("EXPRESS_POLL_S_BOOST=2");
    expect(script).toContain("BOOST_MODE=0");
  });

  test("۷-۲ پارس پرچم boost از پاسخ poll + بنر اختصاص ظرفیت", () => {
    expect(script).toContain(".boost // false");
    expect(script).toContain("حالت تمام‌ظرفیت کاشی تغییرات فعال شد");
    expect(script).toContain("BOOST_MODE=1");
  });

  test("۷-۳ poll میان‌موجی تندتر در boost (۲ث ← ۵ث)", () => {
    expect(script).toContain("EP_NOW=$(( BOOST_MODE == 1 ? EXPRESS_POLL_S_BOOST : EXPRESS_POLL_S ))");
  });

  test("۷-۴ لاین اکسپرس شامل کنش‌های تغییر کد درخواست/کدآگهی", () => {
    expect(script).toContain("/requests/create|/requests/update|/request-events/create|/properties/update");
  });

  test("۷-۵ دستور نصب نسل O پابرجا (حمل‌ونقل بقا)", () => {
    const cmd = buildInstallCommand("https://x.example", "CODE123");
    expect(cmd).toContain("نسل O");
    expect(cmd).toContain("pkg install -y curl openssl-tool jq");
    expect(cmd).toContain("/api/mobile-relay/bootstrap?code=CODE123");
  });
});
