/**
 * PN-018 — تست‌های ترمیم T2+T3 (سرریز Int32 / دامنهٔ نرمال‌ساز) + فاز ۷ (Outcome Learning)
 * ---------------------------------------------------------------------------
 * بخش A (این فایل): ترمیم دو خطای گزارش‌شدهٔ مالک
 *   ۱) دامنهٔ معتبر per-field در detailsToPropertyExtras (نویسندهٔ تأییدشدهٔ آگهی ۴۸۸۱۳)
 *   ۲) دامنهٔ معتبر در extractApuDetails (نویسندهٔ دوم — سامانهٔ عمومی)
 *   ۳) گارد audit-int-overflow.sh — سبز روی دادهٔ تمیز + قرمز روی تزریق
 *   ۴) دادهٔ زنده: صفر سرریز Int32 پس از ترمیم
 */

import { describe, expect, test } from "bun:test";
import { execSync } from "child_process";

/* ═══════ A) نرمال‌ساز دامنه‌دار (ریشهٔ T2+T3) ═══════ */
describe("PN-018/T2+T3 · نرمال‌ساز دامنه‌دار آگهی (arm-catalog)", () => {
  test("سناریوی زندهٔ آگهی ۴۸۸۱۳: floor=۱۶٬۵۰۰٬۰۰۰٬۰۰۰ → تهی؛ خام محفوظ", async () => {
    const { detailsToPropertyExtras } = await import("@/lib/melk-api/arm-catalog");
    // عین payload جزئیات آگهی ۴۸۸۱۳ (برچسب floor با ارزش قیمتی)
    const payload = {
      details: [
        { name: "کد آگهی", value: "48813" },
        { name: "space", value: "150" },
        { name: "floor", value: "16500000000" },
        { name: "room_whole", value: "3" },
        { name: "year", value: "1401" },
      ],
    };
    const extras = detailsToPropertyExtras(payload);
    expect(extras.floor).toBeUndefined(); // خارج از دامنه → تهی (نمی‌نویسد)
    expect(extras.meterage).toBe(150);
    expect(extras.rooms).toBe(3);
    expect(extras.buildYear).toBe(1401);
    expect(JSON.stringify(extras.detailsJson)).toContain("16500000000"); // لایهٔ خام محفوظ (دادهٔ مقدس)
  });

  test("مقادیر معتبر در دامنه عبور می‌کنند (floor=۵ · طبقهٔ منطقی)", async () => {
    const { detailsToPropertyExtras } = await import("@/lib/melk-api/arm-catalog");
    const extras = detailsToPropertyExtras({
      details: [
        { name: "floor", value: "5" },
        { name: "space", value: "120" },
        { name: "room_whole", value: "2" },
        { name: "year", value: "1399" },
      ],
    });
    expect(extras.floor).toBe(5);
    expect(extras.meterage).toBe(120);
    expect(extras.rooms).toBe(2);
    expect(extras.buildYear).toBe(1399);
  });

  test("مرزهای دامنه: floor ۰ و ۲۰۰ معتبر · ۲۰۱ و منفی رد · سال ۱۲۹۹/۱۴۵۱ رد · متراژ ۰/۵۰۰۱ رد", async () => {
    const { detailsToPropertyExtras } = await import("@/lib/melk-api/arm-catalog");
    const mk = (floor: string, year: string, space: string, rooms: string) =>
      detailsToPropertyExtras({ details: [
        { name: "floor", value: floor },
        { name: "year", value: year },
        { name: "space", value: space },
        { name: "room_whole", value: rooms },
      ] });
    expect(mk("0", "1300", "1", "0").floor).toBe(0); // همکف معتبر
    expect(mk("200", "1450", "5000", "30").floor).toBe(200);
    expect(mk("201", "1400", "100", "2").floor).toBeUndefined();
    expect(mk("-3", "1400", "100", "2").floor).toBeUndefined();
    expect(mk("5", "1299", "100", "2").buildYear).toBeUndefined();
    expect(mk("5", "1451", "100", "2").buildYear).toBeUndefined();
    expect(mk("5", "1400", "0", "2").meterage).toBeUndefined();
    expect(mk("5", "1400", "5001", "2").meterage).toBeUndefined();
    expect(mk("5", "1400", "100", "31").rooms).toBeUndefined();
    // rawArea حتی خارج دامنه حفظ می‌شود (لایهٔ خام)
    expect(mk("5", "1400", "9000", "2").rawArea).toBe("9000");
  });

  test("سایر ردیف‌های خراب واقعی (۱۲۳۴۵ · ۲۳۴۵ · ۱۲۳۴۵) هم رد می‌شوند", async () => {
    const { detailsToPropertyExtras } = await import("@/lib/melk-api/arm-catalog");
    for (const bad of ["12345", "2345", "1234", "999999999999"]) {
      const extras = detailsToPropertyExtras({ details: [{ name: "floor", value: bad }] });
      expect(extras.floor).toBeUndefined();
    }
  });
});

/* ═══════ B) نویسندهٔ دوم — سامانهٔ عمومی (melk-public) ═══════ */
describe("PN-018/T2+T3 · نرمال‌ساز دامنه‌دار سامانهٔ عمومی (melk-public)", () => {
  test("extractApuDetails: طبقهٔ فارسی با ارزش قیمتی → تهی · معتبر → عدد", async () => {
    const { extractApuDetails } = await import("@/lib/melk-api/melk-public");
    const dirty = extractApuDetails({
      details: [
        { label: "طبقه", value: "۱۶٬۵۰۰٬۰۰۰٬۰۰۰" },
        { label: "متراژ", value: "۱۵۰" },
        { label: "سال ساخت", value: "۱۴۰۱" },
      ],
    });
    expect(dirty.floor).toBeNull();
    expect(dirty.meterage).toBe(150);
    expect(dirty.buildYear).toBe(1401);

    const clean = extractApuDetails({
      details: [
        { label: "طبقه", value: "۴" },
        { label: "متراژ", value: "۹۵" },
        { label: "اتاق", value: "۲" },
      ],
    });
    expect(clean.floor).toBe(4);
    expect(clean.meterage).toBe(95);
    expect(clean.rooms).toBe(2);
  });

  test("inputs خود ردیف نیز دامنه‌دار خوانده می‌شود (space خارج دامنه → تهی)", async () => {
    const { extractApuDetails } = await import("@/lib/melk-api/melk-public");
    const r = extractApuDetails({ inputs: { space: 999999999 } });
    expect(r.meterage).toBeNull();
    const r2 = extractApuDetails({ inputs: { space: 210 } });
    expect(r2.meterage).toBe(210);
  });
});

/* ═══════ C) گارد سرریز Int32 ═══════ */
describe("PN-018/T2+T3 · گارد audit-int-overflow.sh", () => {
  test("روی دادهٔ ترمیم‌شده: PASS (خروج ۰)", () => {
    const out = execSync("bash scripts/audit-int-overflow.sh", { encoding: "utf8" });
    expect(out).toContain("PASS");
    expect(out).toContain("46 ستون Int"); // پوشش کامل پس از ترمیم regex (قبلاً ۳۳ ناقص بود)
  });

  test("دریل منفی: تزریق ۹۹٬۹۹۹٬۹۹۹٬۹۹۹ در floor → FAIL (خروج ۱)", () => {
    execSync(
      `python3 -c "
import sqlite3
con = sqlite3.connect('db/custom.db')
con.execute(\\"UPDATE PropertyRecord SET floor=99999999999 WHERE id=(SELECT id FROM PropertyRecord WHERE floor IS NULL LIMIT 1)\\")
con.commit(); con.close()"`,
      { encoding: "utf8" }
    );
    let failed = false;
    try {
      execSync("bash scripts/audit-int-overflow.sh", { encoding: "utf8", stdio: "pipe" });
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
    // پاک‌سازی دریل
    execSync(
      `python3 -c "
import sqlite3
con = sqlite3.connect('db/custom.db')
con.execute(\\"UPDATE PropertyRecord SET floor=NULL WHERE floor > 2147483647\\")
con.commit(); con.close()"`,
      { encoding: "utf8" }
    );
    const after = execSync("bash scripts/audit-int-overflow.sh", { encoding: "utf8" });
    expect(after).toContain("PASS");
  });
});

/* ═══════ D) دادهٔ زندهٔ production پس از ترمیم (فقط‌خواندنی — دکترین preload-guard) ═══════ */
describe("PN-018/T2+T3 · دادهٔ زندهٔ production پس از ترمیم (RO)", () => {
  const ro = (sql: string): string =>
    execSync(`python3 -c "
import sqlite3, json
con = sqlite3.connect('db/custom.db')
print(json.dumps(con.execute(\\"${sql}\\").fetchall()))"`, { encoding: "utf8" }).trim();

  test("آگهی ۴۸۸۱۳ ترمیم شده: floor تهی · قیمت ۱۵ میلیارد سالم (Float)", () => {
    const rows = JSON.parse(ro("SELECT floor, price, meterage FROM PropertyRecord WHERE propertyCode='48813'")) as Array<[number | null, number, number]>;
    expect(rows.length).toBe(1);
    expect(rows[0][0]).toBeNull();
    expect(rows[0][1]).toBe(15000000000);
    expect(rows[0][2]).toBe(150);
  });

  test("سایر ۳ ردیف خراب (۵۳۲۲۹ · ۴۷۶۴۵ · ۳۷۵۶۰) هم floor تهی دارند + صفر سرریز کل", () => {
    const rows = JSON.parse(ro("SELECT propertyCode, floor FROM PropertyRecord WHERE propertyCode IN ('53229','47645','37560')")) as Array<[string, number | null]>;
    expect(rows.length).toBe(3);
    for (const r of rows) expect(r[1]).toBeNull();
    const overflow = JSON.parse(ro("SELECT COUNT(*) FROM PropertyRecord WHERE floor > 2147483647 OR floor < -2147483648")) as Array<[number]>;
    expect(overflow[0][0]).toBe(0);
  });
});
