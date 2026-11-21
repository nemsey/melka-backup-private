/**
 * DIR-TODAY-DROP-001 — گاردهای معماری و رفتار (دستور مالک ۱۴۰۵/۰۸/۳۱ · دو بند)
 * ------------------------------------------------------------------
 * اولاً) ریشهٔ افت «آگهی امروز» ۶۸ ← ۳۴ پس از ریست سرور:
 *        شمارنده‌های «آگهی/درخواست امروز» پنجرهٔ غلتان ۲۴ساعته بودند
 *        (now − createdAt < ۸۶٬۴۰۰٬۰۰۰) نه «امروزِ تقویمی»؛ رکوردهای
 *        بعدازظهرِ دیروز ظرف روز از پنجره بیرون می‌افتادند و عددِ برچسب‌خوردهٔ
 *        «امروز» کم می‌شد — بدون هیچ اتلاف داده (کل کاتالوگ در هر دو
 *        اسکرین‌شات مالک یکسان بود). درمان: مرزِ «امروز» = نیمه‌شب تقویمی
 *        تهران (tehranDayStartMs) — شمارنده در طول روز فقط رشد می‌کند و
 *        تنها در گذر نیمه‌شب صفر می‌شود؛ پس از ریست سرور هم هرگز کم نمی‌شود
 *        (داده از DB مقدس بازخوانی می‌شود).
 * ثانیاً) چهار قانون — جداگانه با اسکریپت‌های زنده راستی‌آزمایی می‌شود
 *        (audit-data-sacred.sh + union-snapshot.py + همگرایی پنج‌واحدی).
 * اجرا: bun test tests/dir-today-drop-001.test.ts
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { tehranDayStartMs, TEHRAN_UTC_OFFSET_MINUTES } from "@/lib/jalali";

const ROOT = "/home/z/my-project";
const M1 = readFileSync(`${ROOT}/src/core/tiles/tiles/arm-listing/ArmListingsPage.tsx`, "utf8");
const M2 = readFileSync(`${ROOT}/src/core/tiles/tiles/arm-request/ArmRequestsPage.tsx`, "utf8");
const AGENT_M1 = readFileSync(`${ROOT}/src/core/agent/arm-listing-agent.ts`, "utf8");
const AGENT_M2 = readFileSync(`${ROOT}/src/core/agent/arm-request-agent.ts`, "utf8");
const JALALI = readFileSync(`${ROOT}/src/lib/jalali.ts`, "utf8");

/* ═══════════ گام ۱ — هستهٔ خالص: مرز نیمه‌شب تهران ═══════════ */

describe("DIR-TODAY-DROP-001 · ۱ — tehranDayStartMs (مرزِ «امروز»)", () => {
  test("۱-۱ نیمه‌شب تهران = نیمه‌شب UTC همان تاریخ منهای آفست ثابت ۳:۳۰", () => {
    // ۱۴۰۵/۰۸/۲۶ ساعت ۱۲:۳۸ تهران (= ۰۹:۰۸ UTC) → مرز = ۲۰:۳۰ UTC روز قبل
    const at = new Date("2026-11-17T09:08:17.000Z");
    expect(tehranDayStartMs(at)).toBe(Date.UTC(2026, 10, 16, 20, 30, 0, 0));
  });

  test("۱-۲ لحظهٔ درست قبل از نیمه‌شب و درست بعدش دو مرز متوالی می‌سازند", () => {
    const justBefore = new Date("2026-11-17T20:29:59.999Z"); // ۲۳:۵۹:۵۹ تهران ۱۴۰۵/۰۸/۲۶
    const justAfter = new Date("2026-11-17T20:30:00.000Z"); // ۰۰:۰۰:۰۰ تهران ۱۴۰۵/۰۸/۲۷
    expect(tehranDayStartMs(justBefore)).toBe(Date.UTC(2026, 10, 16, 20, 30, 0, 0));
    expect(tehranDayStartMs(justAfter)).toBe(Date.UTC(2026, 10, 17, 20, 30, 0, 0));
    expect(tehranDayStartMs(justAfter) - tehranDayStartMs(justBefore)).toBe(86_400_000);
  });

  test("۱-۳ مستقل از TZ ماشین — آفست ثابت (بدون ساعت تابستانی) تک‌منبع حقیقت است", () => {
    expect(TEHRAN_UTC_OFFSET_MINUTES).toBe(210);
    expect(JALALI).toContain("export function tehranDayStartMs");
  });
});

/* ═══════════ گام ۲ — گاردهای منبع: پنجرهٔ غلتان حذف، مرز نیمه‌شب نشسته ═══════════ */

describe("DIR-TODAY-DROP-001 · ۲ — هر دو کاشی و هر دو ایجنت روی مرز نیمه‌شب", () => {
  test("۲-۱ M1 آگهی: از tehranDayStartMs می‌شمارد، نه پنجرهٔ غلتان ۲۴ساعته", () => {
    expect(M1).toContain("import { faDigits, tehranDayStartMs }");
    expect(M1).toContain("const todayStartMs = tehranDayStartMs();");
    expect(M1).toContain("new Date(r.createdAt).getTime() >= todayStartMs");
    // الگوی کهنه (شمارندهٔ نزولی) باید در خطِ todayCount نمانده باشد
    expect(M1).not.toContain("Date.now() - new Date(r.createdAt).getTime() < 86400_000");
  });

  test("۲-۲ M2 درخواست: همان درمان", () => {
    expect(M2).toContain("import { faDigits, tehranDayStartMs }");
    expect(M2).toContain("const todayStartMs = tehranDayStartMs();");
    expect(M2).toContain("new Date(r.createdAt).getTime() >= todayStartMs");
    expect(M2).not.toContain("Date.now() - new Date(r.createdAt).getTime() < 86400_000");
  });

  test("۲-۳ هر دو ایجنت: «امروز» از نیمه‌شب؛ «هفته» غلتان ۷روزه با برچسب صادق", () => {
    for (const src of [AGENT_M1, AGENT_M2]) {
      expect(src).toContain("tehranDayStartMs()");
      expect(src).toContain("r.createdAt.getTime() >= todayStart");
      expect(src).not.toContain("now - r.createdAt.getTime() < dayMs");
      expect(src).toContain("هفت روز گذشته");
    }
    expect(AGENT_M1).toContain("آگهی امروز (از نیمه‌شب)");
    expect(AGENT_M2).toContain("درخواست امروز (از نیمه‌شب)");
  });

  test("۲-۴ KPI هر دو کاشی زیرنویس مرز را به مالک می‌گوید", () => {
    expect(M1).toContain('label={"آگهی امروز"}');
    expect(M1).toContain('sub={loading ? undefined : "از نیمه‌شب تهران"}');
    expect(M2).toContain('label="درخواست امروز"');
    expect(M2).toContain('sub={loading ? undefined : "از نیمه‌شب تهران"}');
  });
});

/* ═══════════ گام ۳ — بازسازی رفتاری: سناریوی ۶۸ ← ۳۴ دیگر ناممکن است ═══════════ */

describe("DIR-TODAY-DROP-001 · ۳ — بازسازی عددی حادثه (رفتار، نه فقط متن)", () => {
  /** بازتولید عین سناریوی اسکرین‌شات‌های مالک (۱۴۰۵/۰۸/۲۶):
   *  ۶۸ رکورد در پنجرهٔ غلتان در ساعت ۱۲:۳۸ تهران؛ ۳۴ رکورد با createdAt در
   *  بعدازظهر دیروز (۱۲:۳۸–۱۵:۳۹) که تا ۱۵:۳۹ از پنجره بیرون می‌افتند؛
   *  هیچ رکورد تازه‌ای وارد نمی‌شود (ریست سرور — رله/دیمن متوقف). */
  const S1 = new Date("2026-11-17T09:08:17.000Z"); // ۱۲:۳۸ تهران
  const S2 = new Date("2026-11-17T12:09:09.000Z"); // ۱۵:۳۹ تهران
  const mk = (iso: string) => ({ createdAt: iso });

  function rollingCount(rows: { createdAt: string }[], at: Date): number {
    return rows.filter((r) => at.getTime() - new Date(r.createdAt).getTime() < 86_400_000).length;
  }
  function todayCount(rows: { createdAt: string }[], at: Date): number {
    const start = tehranDayStartMs(at);
    return rows.filter((r) => new Date(r.createdAt).getTime() >= start).length;
  }

  test("۳-۱ منطق کهنه: در همان داده، عدد ۶۸ ← ۳۴ کم می‌شد (بازتولید حادثه)", () => {
    const rows: { createdAt: string }[] = [];
    // ۳۴ رکورد بعدازظهر دیروز (۱۲:۳۹ تا ۱۵:۳۸ تهران = ۰۹:۰۹ تا ۱۲:۰۸ UTC روز قبل)
    for (let i = 0; i < 34; i++) {
      rows.push(mk(new Date(Date.UTC(2026, 10, 16, 9, 9 + (i % 179), 0)).toISOString()));
    }
    // ۳۴ رکورد صبح امروز (۰۰:۳۰ تا ۱۲:۳۷ تهران = ۲۱:۰۰ قبل‌از UTC)
    for (let i = 0; i < 34; i++) {
      rows.push(mk(new Date(Date.UTC(2026, 10, 16, 21, 0 + (i % 90), 0)).toISOString()));
    }
    expect(rollingCount(rows, S1)).toBe(68);
    expect(rollingCount(rows, S2)).toBe(34); // ← عین شکایت مالک
  });

  test("۳-۲ منطق تازه: در همان داده، عدد فقط رشد می‌کند (هرگز کم نمی‌شود)", () => {
    const rows: { createdAt: string }[] = [];
    for (let i = 0; i < 34; i++) {
      rows.push(mk(new Date(Date.UTC(2026, 10, 16, 9, 9 + (i % 179), 0)).toISOString()));
    }
    for (let i = 0; i < 34; i++) {
      rows.push(mk(new Date(Date.UTC(2026, 10, 16, 21, 0 + (i % 90), 0)).toISOString()));
    }
    const c1 = todayCount(rows, S1);
    const c2 = todayCount(rows, S2);
    expect(c1).toBe(34); // فقط جریان امروز — نه بعدازظهر دیروز
    expect(c2).toBe(34); // پس از ریست و بی‌ورود دادهٔ تازه: ثابت
    expect(c2).toBeGreaterThanOrEqual(c1); // تک‌شاخصِ رشد — قانون دادهٔ مقدس
  });

  test("۳-۳ مرز نیمه‌شب: رکورد ثبت‌شده در ۲۳:۵۹ امروز، فردا شمرده نمی‌شود", () => {
    const lateNight = mk(new Date(Date.UTC(2026, 10, 16, 20, 29, 59)).toISOString()); // ۲۳:۵۹:۵۹ تهران ۱۴۰۵/۰۸/۲۶
    const sameDay2230 = new Date(Date.UTC(2026, 10, 16, 19, 0, 0)); // ۲۲:۳۰ تهران همان روز
    const nextMorning = new Date(Date.UTC(2026, 10, 16, 21, 0, 0)); // ۰۰:۳۰ تهران روز بعد
    expect(todayCount([lateNight], sameDay2230)).toBe(1); // تا آخرِ روز شمرده می‌شود
    expect(todayCount([lateNight], nextMorning)).toBe(0); // فردا دیگر «امروز» نیست
  });
});
