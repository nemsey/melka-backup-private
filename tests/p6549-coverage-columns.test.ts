/**
 * p6549-coverage-columns.test.ts — «هیچ ستونی بدون اطلاعات نباشد» (نکته ۲ دستور P6549)
 * الگو: اسکریپت حسابرسی (scripts/p6549/p6549-coverage-audit.ts) شاهد سطح-DB می‌سازد؛
 * این تست صحت شاهد را راستی‌آزمایی می‌کند (تست‌ها هرگز production را لمس نمی‌کنند — گارد preload).
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const evidence = JSON.parse(readFileSync("download/p6549/columns-coverage.json", "utf8"));

describe("شاهد پوشش ستون‌ها (سطح DB — کل جمعیت)", () => {
  test("چهار فهرست با جمعیت واقعی", () => {
    const tiles = evidence.lists.map((l: any) => l.tile);
    expect(tiles.length).toBe(4);
    expect(evidence.lists[0].total).toBeGreaterThan(14000); // M1
    expect(evidence.lists[1].total).toBeGreaterThan(13000); // M2
    expect(evidence.lists[2].total).toBeGreaterThanOrEqual(739); // M3
    expect(evidence.lists[3].total).toBeGreaterThanOrEqual(291); // M4
  });

  test("حکم نهایی: صفر ستون بدون داده", () => {
    expect(evidence.meta.verdict).toContain("PASS");
    expect(evidence.meta.columnsWithoutData.length).toBe(0);
    expect(evidence.meta.totalColumns).toBeGreaterThanOrEqual(50);
  });

  test("هر ستون هر فهرست > صفر رکورد پر", () => {
    for (const l of evidence.lists) {
      for (const c of l.columns) {
        expect(c.filled, `${l.tile} → ${c.col}`).toBeGreaterThan(0);
      }
    }
  });

  test("ستون‌های کلیدی: آستانه‌های معنادار", () => {
    const get = (tileIdx: number, col: string) => evidence.lists[tileIdx].columns.find((c: any) => c.col.includes(col));
    expect(get(0, "قیمت").pct).toBeGreaterThan(95);
    expect(get(0, "موبایل").pct).toBeGreaterThan(90);
    expect(get(1, "متقاضی — نام").pct).toBeGreaterThan(95);
    expect(get(1, "متقاضی — موبایل").filled).toBeGreaterThan(1200); // در حال رشد با دیمن
    expect(get(2, "قیمت").pct).toBeGreaterThan(95);
    expect(get(3, "آدرس").pct).toBeGreaterThan(95); // کشف endpoint تماس PM
  });

  test("سرعت APIهای فهرست (گام ۴) — همه زیر ۱ ثانیه", () => {
    for (const s of evidence.meta.apiSpeeds) {
      expect(s.status).toBe(200);
      expect(s.ms).toBeLessThan(1000);
    }
  });

  test("آدرس PM: کشف endpoint واقعی با پوشش ≥ ۹۵٪ پرسنل", () => {
    expect(evidence.meta.pm.withAddress).toBeGreaterThanOrEqual(135);
    expect(evidence.meta.pm.addressCoveragePct).toBeGreaterThan(95);
  });
});

describe("دیمون پایداری بروزرسانی (نکته ۳)", () => {
  test("برش تکمیل ستون‌های ناقص M2 در دیمن + round-robin", () => {
    const daemon = readFileSync("src/lib/melk-api/catalog-daemon.ts", "utf8");
    expect(daemon).toContain("COMPLETION_ROWS_PER_TICK");
    expect(daemon).toContain("customerMobile: null");
    expect(daemon).toContain("rowIds: incomplete.map");
    expect(daemon).toContain('updatedAt: "asc"');
  });
  test("غنی‌سازی هدفمند مستقل از pending (repo)", () => {
    const repo = readFileSync("src/core/repositories/prisma/request.repository.ts", "utf8");
    expect(repo).toContain('{ source: "arm", id: { in: rowIds } }');
  });
  test("endpoint آدرس پرسنل PM کشف و متصل شده (شاهکار endpoint)", () => {
    const endpoints = readFileSync("src/lib/melk-api/endpoints.ts", "utf8");
    expect(endpoints).toContain("realtorContactInfo");
    const enrich = readFileSync("src/lib/melk-api/expert-enrichment.ts", "utf8");
    expect(enrich).toContain("pmAddressById");
    const route = readFileSync("src/app/api/crm/experts/route.ts", "utf8");
    expect(route).toContain("r.address");
  });
  test("پوشش M4 در endpoint خود اپ: آدرس + شعبهٔ تفکیک‌شده", () => {
    const cov = readFileSync("src/app/api/coverage/route.ts", "utf8");
    expect(cov).toContain('"__branch"');
    expect(cov).toContain('key: "address"');
    expect(cov).toContain("contactInfo");
  });
});
