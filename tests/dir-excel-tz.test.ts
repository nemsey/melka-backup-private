/**
 * DIR-TZ-001 + DIR-EXCEL-FIX-001 — آزمون‌های واحد
 * ------------------------------------------------
 * ۱) لنگر تهران: تبدیل تاریخ/ساعت مستقل از TZ ماشین — سرور چین/UTC
 *    هم عین مرورگر تهران باید بنشیند (دستور مالک ۱۴۰۵/۰۸/۲۴ ۲۲:۵۰).
 * ۲) بلیت دانلود اکسل: امضا/وارسی/انقضا/ناهمخوانی موجودیت.
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import {
  tehranParts,
  tehranDateKey,
  tehranDateTimeKey,
  dateToJalali,
  formatJalaliShortDateTime,
  isoToJalaliString,
} from "@/lib/jalali";
import { signExportTicket, verifyExportTicket, EXPORT_TICKET_TTL_MS } from "@/lib/export-ticket";

const ORIG_TZ = process.env.TZ;

describe("DIR-TZ-001 — لنگر ساعت تهران", () => {
  test("tehranParts — مستقل از TZ ماشین (UTC و چین یکسان)", () => {
    // ۲۰۲۶-۱۱-۱۴ ۱۹:۳۰Z = ۲۰۲۶-۱۱-۱۴ ۲۳:۰۰ تهران
    const d = new Date("2026-11-14T19:30:00.000Z");
    const before = JSON.stringify(tehranParts(d));
    process.env.TZ = "Asia/Shanghai";
    expect(JSON.stringify(tehranParts(d))).toBe(before);
    process.env.TZ = "America/New_York";
    expect(JSON.stringify(tehranParts(d))).toBe(before);
    process.env.TZ = ORIG_TZ;
  });

  test("۲۲:۵۰ تهران همان لحظهٔ سرور — ساعت درست برمی‌گردد", () => {
    // ۱۹:۲۰Z = ۲۲:۵۰ تهران (زمان پیام مالک)
    const p = tehranParts(new Date("2026-11-14T19:20:00.000Z"));
    expect(p.hh).toBe(22);
    expect(p.mm).toBe(50);
    expect(p.d).toBe(14);
  });

  test("مرز نیمه‌شب تهران (۲۰:۳۰Z) — دقیقهٔ قبل و بعد از نیمه‌شب", () => {
    // نیمه‌شب تهران = ۲۰:۳۰Z — پیش از آن «امروزِ تهران» هنوز دیروزِ UTC است
    expect(tehranDateKey(new Date("2026-11-14T20:29:00.000Z"))).toBe("2026-11-14"); // ۲۳:۵۹ تهران
    expect(tehranDateKey(new Date("2026-11-14T20:31:00.000Z"))).toBe("2026-11-15"); // ۰۰:۰۱ تهران
    // سرور چین‌زمان (UTC+8) ساعت ۰۴:۰۰ بامداد ۱۵ نوامبر را می‌بیند؛ تهران هنوز ۱۴ است:
    // ۲۰۲۶-۱۱-۱۴ ۲۰:۰۰Z = ۲۰۲۶-۱۱-۱۵ ۰۴:۰۰ چین = ۲۰۲۶-۱۱-۱۴ ۲۳:۳۰ تهران
    expect(tehranDateKey(new Date("2026-11-14T20:00:00.000Z"))).toBe("2026-11-14");
  });

  test("dateToJalali — ۲۰۲۶-۰۹-۱۲ = ۲۱ شهریور ۱۴۰۵ (مستقل از TZ)", () => {
    process.env.TZ = "Asia/Shanghai";
    expect(dateToJalali(new Date("2026-09-12T12:00:00.000Z")).jd).toBe(21);
    expect(dateToJalali(new Date("2026-09-12T12:00:00.000Z")).jm).toBe(6);
    process.env.TZ = ORIG_TZ;
    expect(isoToJalaliString("2026-09-12T12:00:00.000Z")).toBe("1405/06/21");
  });

  test("formatJalaliShortDateTime — ساعت تهران", () => {
    // ۱۴:۳۰Z = ۱۸:۰۰ تهران
    const s = formatJalaliShortDateTime(new Date("2026-09-12T14:30:00.000Z"));
    expect(s).toContain("۱۸:۰۰");
    expect(s).toContain("۱۴۰۵/۰۶/۲۱");
  });

  test("tehranDateTimeKey — «YYYY-MM-DD HH:MM»", () => {
    expect(tehranDateTimeKey(new Date("2026-11-14T19:20:00.000Z"))).toBe("2026-11-14 22:50");
  });
});

describe("DIR-EXCEL-FIX-001 — بلیت دانلود اکسل", () => {
  beforeAll(() => {
    if (!process.env.MELK_TOKEN_KEY) process.env.MELK_TOKEN_KEY = "test-key-only-for-unit-tests";
  });
  afterAll(() => {
    process.env.TZ = ORIG_TZ;
  });

  test("امضا → وارسی رفت‌وبرگشت", () => {
    const t = signExportTicket({ e: "requests", q: "code=100", r: "OWNER", s: "OWNER", n: "مالک", x: Date.now() + EXPORT_TICKET_TTL_MS });
    const p = verifyExportTicket(t, "requests");
    expect(p).not.toBeNull();
    expect(p?.r).toBe("OWNER");
    expect(p?.q).toBe("code=100");
  });

  test("بلیت برای موجودیت دیگر پذیرفته نمی‌شود", () => {
    const t = signExportTicket({ e: "requests", q: "", r: "OWNER", s: "", n: "x", x: Date.now() + 60_000 });
    expect(verifyExportTicket(t, "transactions")).toBeNull();
  });

  test("بلیت منقضی رد می‌شود", () => {
    const t = signExportTicket({ e: "transactions", q: "", r: "CONSULTANT", s: "", n: "کارشناس", x: Date.now() - 1 });
    expect(verifyExportTicket(t, "transactions")).toBeNull();
  });

  test("دستکاری امضا رد می‌شود", () => {
    const t = signExportTicket({ e: "requests", q: "", r: "OWNER", s: "", n: "o", x: Date.now() + 60_000 });
    const tampered = t.slice(0, -4) + "AAAA";
    expect(verifyExportTicket(tampered, "requests")).toBeNull();
    expect(verifyExportTicket("garbage", "requests")).toBeNull();
    expect(verifyExportTicket("a.b.c.d", "requests")).toBeNull();
  });
});
