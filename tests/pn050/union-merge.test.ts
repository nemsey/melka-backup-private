/**
 * PN-050 · دستور ۶ — تست‌های پذیرش UNION (سناریوی A + سه تست دستور ۱)
 * ---------------------------------------------------------------------------
 * اجرا: bun test tests/pn050/union-merge.test.ts
 *
 * معیار پذیرش دستور ۱ (عین دستور):
 *   تست ۱: live=3, rolling=5 (شامل ۲ رکورد جدید) → live=5 (نه 3)
 *   تست ۲: live={A,B,C,D}, rolling={A,B,E,F} → live={A,B,C,D,E,F}
 *   تست ۳: هیچ رکوردی در live حذف نشده
 * به‌علاوه: رد resurrect_union در AuditLog + ایدمپوتنت (اجرای دوباره = بدون تغییر)
 *
 * اسکریپت واقعی scripts/pn050/merge_union.py روی DBهای سنتزی اجرا می‌شود —
 * همان مسیر رسمی resurrect (هچ شبیه‌سازی مجدد در TS؛ شاهد = ابزار تولید).
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { Database } from "bun:sqlite";

const REPO = "/home/z/my-project";
const MERGE = join(REPO, "scripts/pn050/merge_union.py");
const TMP = mkdtempSync(join(REPO, "scripts/pn050/test-artifacts/union-"));

// ساخت DB سنتزی با ستون‌های لازم (ایده‌نتپروپشن‌کننده — همان محدودیت‌های طرح واقعی)
function makeDb(path: string, props: { id: string; code: string; title: string }[]): void {
  const db = new Database(path);
  db.exec(`
    CREATE TABLE PropertyRecord (
      id TEXT PRIMARY KEY,
      propertyCode TEXT UNIQUE,
      title TEXT
    );
    CREATE TABLE RequestRecord (
      id TEXT PRIMARY KEY,
      requestCode TEXT UNIQUE,
      customerName TEXT
    );
    CREATE TABLE AuditLog (
      id TEXT PRIMARY KEY,
      action TEXT, actor TEXT, detail TEXT, createdAt DATETIME,
      operation TEXT, entityType TEXT, recordCount INTEGER,
      accessScope TEXT, tenantId TEXT DEFAULT 'melk-tabriz'
    );
  `);
  const ins = db.prepare("INSERT INTO PropertyRecord (id, propertyCode, title) VALUES (?, ?, ?)");
  for (const p of props) ins.run(p.id, p.code, p.title);
  db.close();
}

function count(path: string, table: string): number {
  const db = new Database(path, { readonly: true });
  const n = (db.query(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number | bigint }).n;
  db.close();
  return Number(n);
}

function ids(path: string, table: string, col: string): string[] {
  const db = new Database(path, { readonly: true });
  const rows = db.query(`SELECT ${col} AS v FROM ${table} ORDER BY v`).all() as { v: string }[];
  db.close();
  return rows.map((r) => r.v);
}

function runMerge(live: string, sources: string[]): Record<string, unknown> {
  const cmd = ["python3", MERGE, "--live", live, ...sources.flatMap((s) => ["--source", s])];
  const out = execSync(cmd.join(" "), { encoding: "utf8", timeout: 60_000 });
  return JSON.parse(out.trim().split("\n").pop() as string) as Record<string, unknown>;
}

beforeAll(() => {
  mkdirSync(TMP, { recursive: true });
});

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

describe("PN-050 · دستور ۱ — UNION رستاخیز (merge_union.py)", () => {
  test("تست ۱: live=3 · rolling=5 (شامل ۲ رکورد جدید) → live=5 (نه 3)", () => {
    const live = join(TMP, "t1-live.db");
    const rolling = join(TMP, "t1-rolling.db");
    makeDb(live, [
      { id: "a1", code: "A", title: "آگهی A" },
      { id: "b1", code: "B", title: "آگهی B" },
      { id: "c1", code: "C", title: "آگهی C" },
    ]);
    makeDb(rolling, [
      { id: "a1", code: "A", title: "آگهی A" },
      { id: "b1", code: "B", title: "آگهی B" },
      { id: "c1", code: "C", title: "آگهی C" },
      { id: "d1", code: "D", title: "آگهی D (سینک پس‌زمینه پس از ریست)" },
      { id: "e1", code: "E", title: "آگهی E (سینک پس‌زمینه پس از ریست)" },
    ]);

    const before = count(live, "PropertyRecord");
    const res = runMerge(live, [rolling]);
    const after = count(live, "PropertyRecord");

    expect(before).toBe(3);
    expect(after).toBe(5); // نه 3 — UNION افزودنی
    expect(res.status).toBe("UNION_OK");
    expect((res.after as Record<string, number>).PropertyRecord).toBe(5);
  });

  test("تست ۲: live={A,B,C,D} · rolling={A,B,E,F} → live={A,B,C,D,E,F}", () => {
    const live = join(TMP, "t2-live.db");
    const rolling = join(TMP, "t2-rolling.db");
    makeDb(live, [
      { id: "a", code: "A", title: "A" },
      { id: "b", code: "B", title: "B" },
      { id: "c", code: "C", title: "C" },
      { id: "d", code: "D", title: "D" },
    ]);
    makeDb(rolling, [
      { id: "a", code: "A", title: "A" },
      { id: "b", code: "B", title: "B" },
      { id: "e", code: "E", title: "E" },
      { id: "f", code: "F", title: "F" },
    ]);

    runMerge(live, [rolling]);
    const got = ids(live, "PropertyRecord", "propertyCode");
    expect(got).toEqual(["A", "B", "C", "D", "E", "F"]);
  });

  test("تست ۳: هیچ رکوردی در live حذف نشده — هر ۴ رکورد اصلی با عنوان دست‌نخورده", () => {
    const live = join(TMP, "t3-live.db");
    const rolling = join(TMP, "t3-rolling.db");
    makeDb(live, [
      { id: "a", code: "A", title: "عنوان-اصلی-A" },
      { id: "b", code: "B", title: "عنوان-اصلی-B" },
      { id: "c", code: "C", title: "عنوان-اصلی-C" },
      { id: "d", code: "D", title: "عنوان-اصلی-D" },
    ]);
    makeDb(rolling, [
      { id: "a", code: "A", title: "عنوان-مغایر-از-بکاپ" }, // حتی اگر منبع مقدار متفاوت دارد
      { id: "e", code: "E", title: "E" },
    ]);

    runMerge(live, [rolling]);
    const db = new Database(live, { readonly: true });
    const rows = db.prepare("SELECT propertyCode, title FROM PropertyRecord ORDER BY propertyCode").all() as {
      propertyCode: string;
      title: string;
    }[];
    db.close();
    const map = new Map(rows.map((r) => [r.propertyCode, r.title]));
    expect(rows.length).toBe(5); // A..D + E — بدون حذف
    expect(map.get("A")).toBe("عنوان-اصلی-A"); // overwrite ممنوع — مقدار live برنده
    expect(map.get("B")).toBe("عنوان-اصلی-B");
    expect(map.get("C")).toBe("عنوان-اصلی-C");
    expect(map.get("D")).toBe("عنوان-اصلی-D");
  });

  test("رد resurrect_union در AuditLog با {type, sources, before_count, after_count}", () => {
    const live = join(TMP, "t4-live.db");
    const rolling = join(TMP, "t4-rolling.db");
    makeDb(live, [{ id: "a", code: "A", title: "A" }]);
    makeDb(rolling, [{ id: "a", code: "A", title: "A" }, { id: "z", code: "Z", title: "Z" }]);

    runMerge(live, [rolling]);
    const db = new Database(live, { readonly: true });
    const rows = db.prepare("SELECT detail FROM AuditLog WHERE action = 'resurrect_union'").all() as {
      detail: string;
    }[];
    db.close();
    expect(rows.length).toBe(1);
    const d = JSON.parse(rows[0].detail) as {
      type: string;
      sources: string[];
      before_count: Record<string, number>;
      after_count: Record<string, number>;
    };
    expect(d.type).toBe("resurrect_union");
    expect(d.sources.length).toBe(1);
    expect(d.before_count.PropertyRecord).toBe(1);
    expect(d.after_count.PropertyRecord).toBe(2);
  });

  test("ایدمپوتنت: اجرای دوبارهٔ UNION = بدون هیچ تغییر (صفر تکرار، صفر حذف)", () => {
    const live = join(TMP, "t5-live.db");
    const rolling = join(TMP, "t5-rolling.db");
    makeDb(live, [{ id: "a", code: "A", title: "A" }, { id: "b", code: "B", title: "B" }]);
    makeDb(rolling, [{ id: "b", code: "B", title: "B" }, { id: "c", code: "C", title: "C" }]);

    runMerge(live, [rolling]);
    const after1 = count(live, "PropertyRecord");
    runMerge(live, [rolling]);
    const after2 = count(live, "PropertyRecord");
    expect(after1).toBe(3);
    expect(after2).toBe(3); // ثابت — یونیون ایدمپوتنت است
  });

  test("چند-منبع: قلعه + چرخشی + بقا همگی در یک UNION افزوده می‌شوند", () => {
    const live = join(TMP, "t6-live.db");
    const fort = join(TMP, "t6-fort.db");
    const roll = join(TMP, "t6-roll.db");
    const surv = join(TMP, "t6-surv.db");
    makeDb(live, [{ id: "a", code: "A", title: "A" }]);
    makeDb(fort, [{ id: "a", code: "A", title: "A" }, { id: "f", code: "F", title: "F" }]);
    makeDb(roll, [{ id: "r", code: "R", title: "R" }]);
    makeDb(surv, [{ id: "s", code: "S", title: "S" }]);

    runMerge(live, [fort, roll, surv]);
    const got = ids(live, "PropertyRecord", "propertyCode");
    expect(got).toEqual(["A", "F", "R", "S"]);
  });

  test("RequestRecord هم UNION می‌شود (کلید طبیعی requestCode)", () => {
    const live = join(TMP, "t7-live.db");
    const roll = join(TMP, "t7-roll.db");
    makeDb(live, []);
    makeDb(roll, []);
    const d1 = new Database(live);
    d1.prepare("INSERT INTO RequestRecord (id, requestCode, customerName) VALUES (?, ?, ?)").run("r1", "POT1", "متقاضی یک");
    d1.close();
    const d2 = new Database(roll);
    d2.prepare("INSERT INTO RequestRecord (id, requestCode, customerName) VALUES (?, ?, ?)").run("r1", "POT1", "متقاضی یک");
    d2.prepare("INSERT INTO RequestRecord (id, requestCode, customerName) VALUES (?, ?, ?)").run("r2", "POT2", "متقاضی دو");
    d2.close();

    runMerge(live, [roll]);
    const db = new Database(live, { readonly: true });
    const codes = (db.prepare("SELECT requestCode FROM RequestRecord ORDER BY requestCode").all() as { requestCode: string }[]).map(
      (r) => r.requestCode,
    );
    db.close();
    expect(codes).toEqual(["POT1", "POT2"]);
  });

  // ═══ PN-068 (دستور مالک ۲۰۲۶-۱۱-۰۷: «اتصال به حساب‌های شخصی پس از هر ریست قطع می‌شود — پایدار کن») ═══
  // ریشهٔ قطعی: جدول‌های اعتبارنامه (ArmConnection/DivarConnection/PmConnection/GapConnection)
  // و نشست‌ها (Session/UserSession) از UNION کنار گذاشته شده بودند → پس از هر ریستِ
  // پلتفرم، DB زنده خالی می‌شد و اتصال ARM/دیوار/PM قطع می‌شد (کد پرسنلی + پیامک دوباره).
  test("PN-068: اعتبارنامه‌ها و نشست‌ها پس از ریست زنده می‌مانند (ArmConnection · DivarConnection · Session)", () => {
    const live = join(TMP, "t8-live.db"); // شبیهٔ DB زندهٔ «تازه‌بوت‌شدهٔ خالی» پس از ریست
    const roll = join(TMP, "t8-roll.db"); // لایهٔ چرخشی ۵دقیقه‌ای — رکوردهای پیش از ریست
    makeDb(live, []);
    makeDb(roll, []);

    const CONNECTION_TABLES: Array<[string, string[]]> = [
      // [جدول, ستون‌ها] — قیدهای یکتا عین schema واقعی (id PK · کلید طبیعی UNIQUE)
      ["ArmConnection", ["id TEXT PRIMARY KEY", "ownerKey TEXT UNIQUE", "tokenEnc TEXT", "refreshTokenEnc TEXT", "status TEXT"]],
      ["DivarConnection", ["id TEXT PRIMARY KEY", "method TEXT UNIQUE", "status TEXT", "tokenEnc TEXT"]],
      ["PmConnection", ["id TEXT PRIMARY KEY", "status TEXT", "tokenEnc TEXT"]],
      ["GapConnection", ["id TEXT PRIMARY KEY", "status TEXT", "tokenEnc TEXT"]],
      ["Session", ["id TEXT PRIMARY KEY", "tokenHash TEXT UNIQUE", "personnelCode TEXT", "role TEXT", "expiresAt TEXT", "revoked TEXT"]],
      ["UserSession", ["id TEXT PRIMARY KEY", "tokenHash TEXT UNIQUE", "expiresAt TEXT"]],
    ];
    const mk = (path: string, withRows: boolean) => {
      const db = new Database(path);
      for (const [t, cols] of CONNECTION_TABLES) {
        db.exec(`CREATE TABLE ${t} (${cols.join(", ")})`);
      }
      if (withRows) {
        db.prepare("INSERT INTO ArmConnection (id, ownerKey, tokenEnc, refreshTokenEnc, status) VALUES (?,?,?,?,?)")
          .run("arm-1", "master", "ENC-TOKEN", "ENC-REFRESH", "connected");
        db.prepare("INSERT INTO DivarConnection (id, method, status, tokenEnc) VALUES (?,?,?,?)")
          .run("dv-1", "phone", "connected", "ENC-DIVAR");
        db.prepare("INSERT INTO PmConnection (id, status, tokenEnc) VALUES (?,?,?)")
          .run("pm-1", "connected", "ENC-PM");
        db.prepare("INSERT INTO Session (id, tokenHash, personnelCode, role, expiresAt, revoked) VALUES (?,?,?,?,?,?)")
          .run("s-1", "HASH-1", "56101", "CONSULTANT", "2030-01-01", "0");
        db.prepare("INSERT INTO UserSession (id, tokenHash, expiresAt) VALUES (?,?,?)")
          .run("us-1", "UHASH-1", "2030-01-01");
      }
      db.close();
    };
    mk(live, false); // زنده = خالی (پس از ریست پلتفرم)
    mk(roll, true); // چرخشی = همهٔ اعتبارنامه‌ها و نشست‌های پیش از ریست

    runMerge(live, [roll]);

    const db = new Database(live, { readonly: true });
    expect((db.prepare("SELECT COUNT(*) AS n FROM ArmConnection WHERE ownerKey='master' AND status='connected'").get() as { n: number }).n).toBe(1);
    expect((db.prepare("SELECT COUNT(*) AS n FROM DivarConnection WHERE method='phone'").get() as { n: number }).n).toBe(1);
    expect((db.prepare("SELECT COUNT(*) AS n FROM PmConnection").get() as { n: number }).n).toBe(1);
    expect((db.prepare("SELECT COUNT(*) AS n FROM Session WHERE personnelCode='56101'").get() as { n: number }).n).toBe(1);
    expect((db.prepare("SELECT COUNT(*) AS n FROM UserSession").get() as { n: number }).n).toBe(1);
    db.close();
  });

  // PN-068 — ایدمپوتنس اعتبارنامه‌ها: ردیف موجود در live هرگز بازنویسی نمی‌شود
  // (توکنِ تازه‌ترِ کاربرِ فعلی مقدم بر توکنِ کهنهٔ بکاپ است — INSERT OR IGNORE).
  test("PN-068: ردیف اعتبارنامهٔ موجود در live بازنویسی نمی‌شود (توکن زنده مقدم بر بکاپ)", () => {
    const live = join(TMP, "t9-live.db");
    const roll = join(TMP, "t9-roll.db");
    makeDb(live, []);
    makeDb(roll, []);
    const mk = (path: string, token: string) => {
      const db = new Database(path);
      db.exec("CREATE TABLE ArmConnection (id TEXT PRIMARY KEY, ownerKey TEXT UNIQUE, tokenEnc TEXT, refreshTokenEnc TEXT, status TEXT)");
      db.prepare("INSERT INTO ArmConnection (id, ownerKey, tokenEnc, refreshTokenEnc, status) VALUES (?,?,?,?,?)")
        .run("arm-1", "master", token, "REF", "connected");
      db.close();
    };
    mk(live, "ENC-FRESH-TOKEN"); // کاربر پس از بوت دوباره وصل شده — توکن تازه در live
    mk(roll, "ENC-STALE-TOKEN"); // بکاپ توکن کهنه دارد

    runMerge(live, [roll]);

    const db = new Database(live, { readonly: true });
    const tok = (db.prepare("SELECT tokenEnc FROM ArmConnection WHERE ownerKey='master'").get() as { tokenEnc: string }).tokenEnc;
    db.close();
    expect(tok).toBe("ENC-FRESH-TOKEN"); // توکن کهنهٔ بکاپ آن را بازنویسی نکرد
  });
});
