/**
 * PN-048-007 · موج صفر — تست گاردین‌های دادهٔ مقدس (G1/G2/G3/G6)
 * ------------------------------------------------------------------------
 * اجرا: bun test tests/pn048-guardians.test.ts
 *
 * G1/G2 — stripProtectedNulls: null هرگز روی دادهٔ پر نمی‌نشیند (additive-only)
 * G3    — دروازهٔ بیلد=HEAD: بیلد کهنه → توقف (شبیه‌سازی sandbox)
 * G6    — گارد سورس: worker.ts بدون G1 GATE حق بوت ندارد
 */

import { describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import fs from "fs";
import path from "path";
import {
  stripProtectedNulls,
  G1_STRIP_PROTECTED_NULLS,
  PROTECTED_PII_FIELDS,
  type FieldProvenance,
} from "@/lib/integrations/melketun/protected-nulls";

const REPO = "/home/z/my-project";

describe("G1/G2 — stripProtectedNulls (محافظ دادهٔ مقدس)", () => {
  test("G1 flag فعال است (Worker حق بوت دارد)", () => {
    expect(G1_STRIP_PROTECTED_NULLS).toBe(true);
  });

  test("null/undefined از update payload کنده می‌شود", () => {
    const out = stripProtectedNulls({
      ownerMobile: null as unknown as string,
      address: undefined as unknown as string,
      title: "آپارتمان ۱۴۸ متری",
      status: "فعال",
    });
    expect(out).not.toHaveProperty("ownerMobile");
    expect(out).not.toHaveProperty("address");
    expect(out.title).toBe("آپارتمان ۱۴۸ متری");
    expect(out.status).toBe("فعال");
  });

  test("PII محافظت‌شده با رشتهٔ تهی پاک نمی‌شود (G1)", () => {
    const out = stripProtectedNulls({
      ownerName: "",
      ownerMobile: "  ",
      customerName: "خریدار تست",
    });
    expect(out).not.toHaveProperty("ownerName");
    expect(out).not.toHaveProperty("ownerMobile"); // «  » بعد از trim تهی است
    expect(out.customerName).toBe("خریدار تست");
  });

  test("مقدار واقعی جدید PII جایگزین می‌شود (جابجایی موبایل مالک)", () => {
    const out = stripProtectedNulls({ ownerMobile: "0914XXXXXXX" });
    expect(out.ownerMobile).toBe("0914XXXXXXX");
  });

  test("ایدمپوتنت — اجرای دوباره همان نتیجه", () => {
    const src = { a: 1, b: null as unknown as number, ownerNote: "" };
    expect(stripProtectedNulls(src)).toEqual(stripProtectedNulls(stripProtectedNulls(src)));
  });

  test("PROTECTED_PII_FIELDS شامل فیلدهای کلیدی مالک/متقاضی است", () => {
    for (const f of ["ownerName", "ownerMobile", "rawOwnerName", "customerName", "address", "mobile"]) {
      expect(PROTECTED_PII_FIELDS).toContain(f);
    }
  });

  test("FieldProvenance (G5): طرح provenance دارای فیلدهای الزام است", () => {
    const p: FieldProvenance = {
      field: "ownerMobile",
      source: "melketun-myfilings",
      endpoint: "/Melketunfilingplus",
      extractedAt: new Date().toISOString(),
      runId: "pn048-test",
      confidence: 1,
      verified: true,
    };
    expect(p.field).toBe("ownerMobile");
    expect(p.confidence).toBeLessThanOrEqual(1);
  });
});

describe("G1 — گارد سورس: محافظ در مسیرهای upsert نصب است", () => {
  test("sync.ts هر ۶ نقطهٔ upsert/update را با محافظ می‌پوشاند", () => {
    const src = fs.readFileSync(path.join(REPO, "src/lib/integrations/melketun/sync.ts"), "utf8");
    const calls = [
      "db.propertyRecord.upsert",
      "db.propertyRecord.update",
      "db.requestRecord.upsert",
      "db.requestRecord.update",
      "db.expertRecord.upsert",
      "db.expertProfile.upsert",
    ];
    for (const call of calls) {
      expect(src).toContain(call);
    }
    // شمار stripProtectedNulls در sync.ts باید ≥ ۶ باشد (۴ upsert + ۲ ادغام P2002 + آینهٔ پروفایل)
    const count = (src.match(/stripProtectedNulls/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(6);
  });

  test("worker.ts حقیقی دارای G1 GATE با توقف فوری است (قانون توقف)", () => {
    const src = fs.readFileSync(path.join(REPO, "scripts/runtime/worker.ts"), "utf8");
    expect(src).toContain("G1 GATE");
    expect(src).toContain("process.exit(1)");
    expect(src).toContain("G1_STRIP_PROTECTED_NULLS !== true");
  });

  test("resurrect-ultimate.sh دارای دروازهٔ G3 (بیلد=HEAD) است", () => {
    const src = fs.readFileSync(path.join(REPO, "resurrect-ultimate.sh"), "utf8");
    expect(src).toContain("G3");
    expect(src).toContain("G1 GATE");
  });

  test("prod-watchdog.sh گیت G3 را پیش از هر اسپاون صدا می‌زند", () => {
    const src = fs.readFileSync(path.join(REPO, "scripts/prod-watchdog.sh"), "utf8");
    expect(src).toContain("build-head-gate.sh");
  });
});

describe("G3 — شبیه‌سازی بیلد کهنه (توقف، نه سرو)", () => {
  test("simulate-stale-build.sh: همهٔ سناریوها سبز", () => {
    const out = execSync("bash scripts/pn048/simulate-stale-build.sh", { cwd: REPO, encoding: "utf8" });
    expect(out).toContain("PASS=6 FAIL=0");
  });

  test("گیت زنده روی مخزن واقعی سبز است (بیلد = HEAD)", () => {
    const out = execSync("bash scripts/pn048/build-head-gate.sh", { cwd: REPO, encoding: "utf8" });
    expect(out).toContain("بیلد = HEAD");
  });
});
