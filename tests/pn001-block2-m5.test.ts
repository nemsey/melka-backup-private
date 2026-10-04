/**
 * PN-001 — BLOCK 2.1 (گام پنجم) — تست‌های اطلاعات کامل گزینه‌های تطبیق M5
 * ---------------------------------------------------------------------------
 * الزام ن۰۰۱ (بخش ۲.۱، نکتهٔ الزامی گام پنجم):
 *   «وقتی کد آگهی داده می‌شود، گزینه‌های کد درخواست با اطلاعات کامل ارایه شوند — و بالعکس.
 *    یعنی هر گزینهٔ پیشنهادی شامل: کد، نام مالک، موبایل، منطقه، قیمت، تازگی.»
 *
 * شاهد ن۰۰۱: ۵ تطبیق واقعی + خروجی m5-matching.json در download/pn001/
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { PrismaClient } from "@prisma/client";
import { writeFileSync, mkdirSync } from "node:fs";
import { MatchingEngine } from "@/core/matching/matching-engine";

const real = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/custom.db" } } });

afterAll(async () => { await real.$disconnect(); });

/** یک آگهی منتشرشده که حداقل یک کاندیدای سخت‌گذر دارد */
async function findListingWithMatch(): Promise<{ propertyCode: string; first: Awaited<ReturnType<MatchingEngine["matchListingToRequests"]>> } | null> {
  const listings = await real.propertyRecord.findMany({
    where: { status: "منتشر شده", price: { not: null }, areaName: { not: null } },
    select: { propertyCode: true },
    orderBy: { syncedAt: "desc" },
    take: 60,
  });
  const engine = new MatchingEngine({ db: real, tier: 3 });
  for (const l of listings) {
    const r = await engine.matchListingToRequests(l.propertyCode);
    if (r.candidates.length > 0) return { propertyCode: l.propertyCode, first: r };
  }
  return null;
}

/** یک درخواست فعال که حداقل یک کاندیدای سخت‌گذر دارد */
async function findRequestWithMatch(): Promise<{ id: string; first: Awaited<ReturnType<MatchingEngine["matchRequestToListings"]>> } | null> {
  const requests = await real.requestRecord.findMany({
    where: { status: { in: ["سرنخ", "فرصت", "در انتظار تایید", "در انتظار معامله", "ready"] }, title: { contains: "خرید" } },
    select: { id: true },
    orderBy: { updatedAt: "desc" },
    take: 60,
  });
  const engine = new MatchingEngine({ db: real, tier: 3 });
  for (const r of requests) {
    const res = await engine.matchRequestToListings(r.id);
    if (res.candidates.length > 0) return { id: r.id, first: res };
  }
  return null;
}

describe("PN-001/B2.1 — گام پنجم: اطلاعات کامل گزینه‌های M5 (دادهٔ واقعی custom.db)", () => {
  let listingMatch: Awaited<ReturnType<typeof findListingWithMatch>>;
  let requestMatch: Awaited<ReturnType<typeof findRequestWithMatch>>;

  beforeAll(async () => {
    listingMatch = await findListingWithMatch();
    requestMatch = await findRequestWithMatch();
  });

  test("گ-۵-۱ شاهد پیش‌نیاز: تطبیق واقعی موجود است (آگهی→درخواست)", () => {
    expect(listingMatch).not.toBeNull();
    expect(listingMatch!.first.candidates.length).toBeGreaterThan(0);
  });

  test("گ-۵-۲ شاهد پیش‌نیاز: تطبیق واقعی موجود است (درخواست→آگهی)", () => {
    expect(requestMatch).not.toBeNull();
    expect(requestMatch!.first.candidates.length).toBeGreaterThan(0);
  });

  /* ── تب ۱: آگهی → درخواست — هر گزینهٔ درخواست با اطلاعات کامل ── */

  test("گ-۵-۳ هر گزینه info دارد", () => {
    for (const c of listingMatch!.first.candidates) expect(c.info).toBeDefined();
  });

  test("گ-۵-۴ info.code = کد درخواست واقعی", () => {
    for (const c of listingMatch!.first.candidates) {
      expect(c.info!.code).toBeTruthy();
      expect(typeof c.info!.code).toBe("string");
    }
  });

  test("گ-۵-۵ info.code با رکورد DB سازگار است (requestCode یا id)", async () => {
    for (const c of listingMatch!.first.candidates) {
      const row = await real.requestRecord.findFirst({
        where: { OR: [{ requestCode: c.info!.code }, { id: c.info!.code }] },
        select: { requestCode: true, id: true },
      });
      expect(row).not.toBeNull();
    }
  });

  test("گ-۵-۶ info.ownerName = نام مشتری DB", async () => {
    for (const c of listingMatch!.first.candidates) {
      const row = await real.requestRecord.findUnique({ where: { id: c.requestId }, select: { customerName: true } });
      expect(row).not.toBeNull();
      expect(c.info!.ownerName).toBe(row!.customerName);
    }
  });

  test("گ-۵-۷ info.mobile = موبایل مشتری DB", async () => {
    for (const c of listingMatch!.first.candidates) {
      const row = await real.requestRecord.findUnique({ where: { id: c.requestId }, select: { customerMobile: true } });
      expect(c.info!.mobile).toBe(row!.customerMobile);
    }
  });

  test("گ-۵-۸ info.region از مناطق درخواست DB می‌آید", async () => {
    for (const c of listingMatch!.first.candidates) {
      const row = await real.requestRecord.findUnique({ where: { id: c.requestId }, select: { areaNamesJson: true } });
      const areas: string[] = row?.areaNamesJson ? JSON.parse(row.areaNamesJson) : [];
      if (areas.length > 0) {
        expect(c.info!.region).toBeTruthy();
        for (const a of areas.slice(0, 3)) expect(c.info!.region!).toContain(a);
      }
    }
  });

  test("گ-۵-۹ info.priceFrom/priceTo = بازهٔ بودجهٔ DB", async () => {
    for (const c of listingMatch!.first.candidates) {
      const row = await real.requestRecord.findUnique({ where: { id: c.requestId }, select: { priceFrom: true, priceTo: true } });
      expect(c.info!.priceFrom).toBe(row!.priceFrom);
      expect(c.info!.priceTo).toBe(row!.priceTo);
    }
  });

  test("گ-۵-۱۰ info.lastSeenAt تاریخ ISO معتبر است", () => {
    for (const c of listingMatch!.first.candidates) {
      expect(c.info!.lastSeenAt).not.toBeNull();
      expect(!Number.isNaN(Date.parse(c.info!.lastSeenAt!))).toBe(true);
    }
  });

  test("گ-۵-۱۱ امتیاز و دلایل همچنان موجودند (رفتار قبلی دست‌نخورده)", () => {
    for (const c of listingMatch!.first.candidates) {
      expect(c.score).toBeGreaterThan(0);
      expect(Array.isArray(c.reasons)).toBe(true);
      expect(c.hardPassed).toBe(true);
    }
  });

  /* ── تب ۲: درخواست → آگهی — هر گزینهٔ آگهی با اطلاعات کامل ── */

  test("گ-۵-۱۲ هر گزینه info دارد (درخواست→آگهی)", () => {
    for (const c of requestMatch!.first.candidates) expect(c.info).toBeDefined();
  });

  test("گ-۵-۱۳ info.code = کد ملک واقعی DB", async () => {
    for (const c of requestMatch!.first.candidates) {
      const row = await real.propertyRecord.findUnique({ where: { propertyCode: c.info!.code }, select: { propertyCode: true } });
      expect(row).not.toBeNull();
    }
  });

  test("گ-۵-۱۴ info.ownerName = نام مالک DB", async () => {
    for (const c of requestMatch!.first.candidates) {
      const row = await real.propertyRecord.findUnique({ where: { propertyCode: c.info!.code }, select: { ownerName: true } });
      expect(c.info!.ownerName).toBe(row!.ownerName);
    }
  });

  test("گ-۵-۱۵ info.mobile = موبایل مالک DB", async () => {
    for (const c of requestMatch!.first.candidates) {
      const row = await real.propertyRecord.findUnique({ where: { propertyCode: c.info!.code }, select: { ownerMobile: true } });
      expect(c.info!.mobile).toBe(row!.ownerMobile);
    }
  });

  test("گ-۵-۱۶ info.region = منطقهٔ ملک DB", async () => {
    for (const c of requestMatch!.first.candidates) {
      const row = await real.propertyRecord.findUnique({ where: { propertyCode: c.info!.code }, select: { areaName: true } });
      expect(c.info!.region).toBe(row!.areaName);
    }
  });

  test("گ-۵-۱۷ info.priceFrom = info.priceTo = قیمت ملک DB", async () => {
    for (const c of requestMatch!.first.candidates) {
      const row = await real.propertyRecord.findUnique({ where: { propertyCode: c.info!.code }, select: { price: true } });
      expect(c.info!.priceFrom).toBe(row!.price);
      expect(c.info!.priceTo).toBe(row!.price);
    }
  });

  test("گ-۵-۱۸ info.lastSeenAt = syncedAt ملک DB", async () => {
    for (const c of requestMatch!.first.candidates) {
      const row = await real.propertyRecord.findUnique({ where: { propertyCode: c.info!.code }, select: { syncedAt: true } });
      expect(c.info!.lastSeenAt).toBe(row!.syncedAt.toISOString());
    }
  });

  /* ── شاهد ن۰۰۱: ۵ تطبیق واقعی + خروجی m5-matching.json ── */

  test("گ-۵-۱۹ شاهد ۵ تطبیق واقعی (آگهی→درخواست) + m5-matching.json", async () => {
    const engine = new MatchingEngine({ db: real, tier: 3 });
    const listings = await real.propertyRecord.findMany({
      where: { status: "منتشر شده", price: { not: null }, areaName: { not: null } },
      select: { propertyCode: true },
      orderBy: { syncedAt: "desc" },
      take: 80,
    });
    const matches: Array<{ listingCode: string; top: { code: string; score: number; ownerName: string | null; mobile: string | null; region: string | null; priceFrom: number | null; priceTo: number | null; freshness: string | null }[] }> = [];
    for (const l of listings) {
      if (matches.length >= 5) break;
      const r = await engine.matchListingToRequests(l.propertyCode);
      if (r.candidates.length > 0) {
        matches.push({
          listingCode: l.propertyCode,
          top: r.candidates.map((c) => ({
            code: c.info!.code, score: c.score, ownerName: c.info!.ownerName, mobile: c.info!.mobile,
            region: c.info!.region, priceFrom: c.info!.priceFrom, priceTo: c.info!.priceTo, freshness: c.info!.lastSeenAt,
          })),
        });
      }
    }
    expect(matches.length).toBeGreaterThanOrEqual(5);
    mkdirSync("/home/z/my-project/download/pn001", { recursive: true });
    writeFileSync(
      "/home/z/my-project/download/pn001/m5-matching.json",
      JSON.stringify({ case: "PN-001", block: "2.1", witness: "گام پنجم — اطلاعات کامل گزینه‌ها", generatedAt: new Date().toISOString(), realMatches: matches }, null, 2),
      "utf8",
    );
  });

  test("گ-۵-۲۰ شاهد ۵ تطبیق واقعی (درخواست→آگهی)", async () => {
    const engine = new MatchingEngine({ db: real, tier: 3 });
    const requests = await real.requestRecord.findMany({
      where: { status: { in: ["سرنخ", "فرصت", "در انتظار تایید", "در انتظار معامله", "ready"] }, title: { contains: "خرید" } },
      select: { id: true },
      orderBy: { updatedAt: "desc" },
      take: 80,
    });
    let matched = 0;
    for (const r of requests) {
      if (matched >= 5) break;
      const res = await engine.matchRequestToListings(r.id);
      for (const c of res.candidates) expect(c.info).toBeDefined();
      if (res.candidates.length > 0) matched += 1;
    }
    expect(matched).toBeGreaterThanOrEqual(5);
  });
});
