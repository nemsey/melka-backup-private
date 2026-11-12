/**
 * PN-084 — تست‌های مغز ملکا: پوشش کامل تطبیق + سیگنال‌های صادقانه + بقای فایل‌یابی
 * ---------------------------------------------------------------------------
 * دامنه:
 *   · توابع خالص تازهٔ موتور (پیش‌فیلتر SQL · حل متراژ ساختاری · تازگی تطبیقی · پروفایل سیگنال)
 *   · قرارداد پوشش (coverage/signalProfile) روی هر دو جهت موتور با دادهٔ تست
 *   · گارد گرسنگی TTL فایل‌یابی (قانون بقای داده)
 *   · صداقت مشوره (حذف شبیه‌سازی ساختگی) + شمارش واقعی تقاضای هم‌منطقه
 *   · سقف کاندیدا از env (پایان سقف خاموش ۳٬۰۰۰تایی)
 */
import { describe, expect, test } from "bun:test";
import {
  MatchingEngine,
  BASE_MATCH_WEIGHTS,
  listingTradeFilterFor,
  resolveRequestMeterage,
  freshnessFromQuantiles,
  buildSignalProfile,
} from "@/core/matching/matching-engine";
import { runDivarFileTtl, ttlStarvationGuardDisabled } from "@/lib/divar/ttl";
import { areaDemandFor } from "@/lib/services/decision-advisor-service";
import { decide } from "@/core/intelligence/decision-advisor";
import { candidateLimitFromEnv } from "@/app/api/matching/route";
import { db } from "@/lib/db";

describe("PN-084 · ۱ — پیش‌فیلتر SQL نوع معامله (آینهٔ امن dealTypeCompatible)", () => {
  test("نیت خرید → فقط فروش", () => {
    expect(listingTradeFilterFor("buy", null)).toEqual([{ tradeTypeName: { contains: "فروش" } }]);
  });
  test("نیت اجاره → رهن یا اجاره", () => {
    expect(listingTradeFilterFor("rent", null)).toEqual([{ tradeTypeName: { contains: "رهن" } }, { tradeTypeName: { contains: "اجاره" } }]);
  });
  test("بدون هیچ سیگنال → بدون فیلتر SQL (تصمیم با JS — عین dealTypeCompatible)", () => {
    expect(listingTradeFilterFor("unknown", null)).toBeNull();
  });
  test("سیگنال ساختاری درخواست → آینهٔ همان", () => {
    expect(listingTradeFilterFor("unknown", "خرید آپارتمان")).toEqual([{ tradeTypeName: { contains: "فروش" } }]);
    expect(listingTradeFilterFor("unknown", "رهن و اجاره")).toEqual([{ tradeTypeName: { contains: "رهن" } }, { tradeTypeName: { contains: "اجاره" } }]);
    expect(listingTradeFilterFor("unknown", "مشارکت در ساخت")).toEqual([{ tradeTypeName: { contains: "مشارکت" } }]);
  });
});

describe("PN-084 · ۲ — حل متراژ با اولویت دادهٔ ساختاری", () => {
  test("ستون spaceFrom/To مقدم بر inputsJson و عنوان", () => {
    const r = resolveRequestMeterage({
      spaceFrom: 70,
      spaceTo: 120,
      title: "خرید آپارتمان ۵۰ متری",
      inputsJson: JSON.stringify({ "متراژ از": "۹۰", "متراژ تا": "۱۰۰" }),
    });
    expect(r.source).toBe("structural");
    expect(r.meterageFrom).toBe(70);
    expect(r.meterageTo).toBe(120);
  });
  test("inputsJson وقتی ساختاری غایب است (رفتار PN-011)", () => {
    const r = resolveRequestMeterage({ inputsJson: JSON.stringify({ "متراژ از": "۹۰", "متراژ تا": "۱۰۰" }) });
    expect(r.source).toBe("inputs");
    expect(r.meterageFrom).toBe(90);
    expect(r.meterageTo).toBe(100);
  });
  test("حدس عنوان (رفتار قبل — پشتیبان)", () => {
    const r = resolveRequestMeterage({ title: "خرید آپارتمان ۷۰ الی ۹۰ متری" });
    expect(r.source).toBe("title");
    expect(r.meterageFrom).toBe(70);
    expect(r.meterageTo).toBe(90);
  });
  test("بدون هیچ سیگنال + صاف‌کردن ترتیب معکوس", () => {
    expect(resolveRequestMeterage({ title: "خرید خانه" }).source).toBe("none");
    const r = resolveRequestMeterage({ spaceFrom: 200, spaceTo: 100 });
    expect(r.meterageFrom).toBe(100);
    expect(r.meterageTo).toBe(200);
  });
});

describe("PN-084 · ۳ — تازگی تطبیقی (صدک در corpus منتشرشده)", () => {
  const qs = [100, 200, 300, 400, 500];
  test("تازه‌ترین = ۱ · کهنه‌ترین = ۰٫۱ · میان‌بند پیوسته", () => {
    expect(freshnessFromQuantiles(600, qs)?.value).toBe(1);
    expect(freshnessFromQuantiles(50, qs)?.value).toBe(0.1);
    expect(freshnessFromQuantiles(250, qs)?.value).toBeCloseTo(0.46, 2);
  });
  test("بازگشت صادقانه null بدون corpus یا بدون زمان", () => {
    expect(freshnessFromQuantiles(250, null)).toBeNull();
    expect(freshnessFromQuantiles(null, qs)).toBeNull();
    expect(freshnessFromQuantiles(0, qs)).toBeNull();
  });
});

describe("PN-084 · ۴ — پروفایل سیگنال (کشف عوامل هموار)", () => {
  test("عامل با مقدار ثابت = flat · عامل متغیر = دارای min/max", () => {
    const scored = [
      { reasons: [
        { factor: "فاصله قیمت", value: 0.9, weight: 0.22, note: "x" },
        { factor: "نزدیکی جغرافیایی", value: 1, weight: 0.13, note: "y" },
      ] },
      { reasons: [
        { factor: "فاصله قیمت", value: 0.4, weight: 0.22, note: "x" },
        { factor: "نزدیکی جغرافیایی", value: 1, weight: 0.13, note: "y" },
      ] },
    ];
    const profile = buildSignalProfile(scored);
    const geo = profile.find((p) => p.factor === "نزدیکی جغرافیایی");
    const price = profile.find((p) => p.factor === "فاصله قیمت");
    expect(geo?.flat).toBe(true);
    expect(geo?.distinct).toBe(1);
    expect(price?.flat).toBe(false);
    expect(price?.min).toBe(0.4);
    expect(price?.max).toBe(0.9);
  });
  test("کاندیدای یگانه هرگز flat نیست (تفکیک بی‌معناست)", () => {
    const profile = buildSignalProfile([{ reasons: [{ factor: "فاصله قیمت", value: 1, weight: 0.22, note: "x" }] }]);
    expect(profile[0].flat).toBe(false);
  });
});

describe("PN-084 · ۵ — موتور روی دادهٔ تست: قرارداد پوشش صادقانه", () => {
  test("جهت آگهی→درخواست: coverage + signalProfile همیشه حاضر", async () => {
    const listing = await db.propertyRecord.findFirst({ where: { status: "منتشر شده" }, select: { propertyCode: true } });
    if (!listing) return; // دادهٔ تست بدون آگهی — صرف‌نظر صادقانه
    const engine = new MatchingEngine({ db, tier: 3, weights: BASE_MATCH_WEIGHTS, topN: 5 });
    const res = await engine.matchListingToRequests(listing.propertyCode);
    expect(res.coverage).toBeDefined();
    expect(res.coverage!.hardPassed).toBeGreaterThanOrEqual(res.candidates.length);
    expect(res.coverage!.hardPassed).toBeLessThanOrEqual(res.coverage!.evaluated);
    expect(res.coverage!.activeTotal).toBeGreaterThanOrEqual(0);
    expect(Array.isArray(res.signalProfile)).toBe(true);
  });
  test("جهت درخواست→آگهی: coverage + signalProfile همیشه حاضر", async () => {
    const req = await db.requestRecord.findFirst({ where: { status: { in: ["سرنخ", "ready", "فرصت"] } }, select: { requestCode: true, id: true } });
    if (!req) return;
    const engine = new MatchingEngine({ db, tier: 3, weights: BASE_MATCH_WEIGHTS, topN: 5 });
    const res = await engine.matchRequestToListings(req.requestCode ?? req.id);
    expect(res.coverage).toBeDefined();
    expect(res.coverage!.evaluated).toBeLessThanOrEqual(res.coverage!.activeTotal);
    expect(Array.isArray(res.signalProfile)).toBe(true);
  });
});

describe("PN-084 · ۶ — گارد گرسنگی TTL فایل‌یابی (قانون بقای داده)", () => {
  test("قرارداد نتیجه: همیشه ok + remainingActive سازگار؛ در حالت گرسنگی صفر حذف", async () => {
    const before = await db.divarAd.count({ where: { status: "active" } });
    const res = await runDivarFileTtl();
    expect(res.ok).toBe(true);
    const after = await db.divarAd.count({ where: { status: "active" } });
    expect(res.remainingActive).toBe(after);
    if (res.skipped === "starvation-guard") {
      expect(res.deleted).toBe(0);
      expect(after).toBe(before); // حذف بدون جایگزین ممنوع — داده مقدس
    } else {
      expect(res.deleted).toBeGreaterThanOrEqual(0);
    }
  });
  test("پرچم خاموشی گارد در لحظهٔ فراخوان خوانده می‌شود", () => {
    const before = ttlStarvationGuardDisabled();
    process.env.MELK_DIVAR_TTL_GUARD = "disabled";
    expect(ttlStarvationGuardDisabled()).toBe(true);
    delete process.env.MELK_DIVAR_TTL_GUARD;
    expect(ttlStarvationGuardDisabled()).toBe(before);
  });
});

describe("PN-084 · ۷ — تقاضای هم‌منطقه: شمارش واقعی بدون سقف", () => {
  test("منطقهٔ ناموجود = صفر صادقانه", async () => {
    const res = await areaDemandFor("منطقهٔ-نمونه-pn084-غیرموجود");
    expect(res.requestCount).toBe(0);
  });
  test("منطقهٔ واقعی دادهٔ تست = شمارش مثبت (اگر داده هست)", async () => {
    const anyArea = await db.requestRecord.findFirst({
      where: { status: "سرنخ", areaNamesJson: { not: null } },
      select: { areaNamesJson: true },
    });
    if (!anyArea?.areaNamesJson) return;
    const area = (JSON.parse(anyArea.areaNamesJson)[0] ?? "") as string;
    if (area.length < 2) return;
    const res = await areaDemandFor(area);
    expect(res.requestCount).toBeGreaterThan(0);
  });
});

describe("PN-084 · ۸ — صداقت مشوره (موتور ۱۶ بدون شبیه‌سازی ساختگی)", () => {
  test("simulation غایب → مشوره سالم، بدون شاهد ساختگی، بدون اجرای خودکار", () => {
    const advice = decide({
      contextId: "TEST-PN084",
      contextKind: "property",
      contextLabel: "ملک آزمون",
      attention: { score: 0.6, reason: "بازدید ثبت‌شده" },
      causal: null,
      counterfactual: [],
      simulation: null,
      memory: null,
      vision: null,
      daysSinceLastContact: null,
      nowIso: "2026-11-12T00:00:00.000Z",
    });
    expect(advice.autoExecute).toBe(false);
    expect(advice.requiresApproval).toBe(true);
    expect(advice.basedOn.simulation).toBeUndefined();
    expect(advice.alternatives.length).toBeGreaterThanOrEqual(3);
  });
});

describe("PN-084 · ۹ — سقف کاندیدا از env (پایان سقف خاموش ۳٬۰۰۰تایی)", () => {
  test("پیش‌فرض ۱۲٬۰۰۰ · کلمپ ۳٬۰۰۰..۳۰٬۰۰۰ · عدد نامعتبر → پیش‌فرض", () => {
    const saved = process.env.MELK_MATCH_CANDIDATE_LIMIT;
    delete process.env.MELK_MATCH_CANDIDATE_LIMIT;
    expect(candidateLimitFromEnv()).toBe(12000);
    process.env.MELK_MATCH_CANDIDATE_LIMIT = "500";
    expect(candidateLimitFromEnv()).toBe(3000);
    process.env.MELK_MATCH_CANDIDATE_LIMIT = "999999";
    expect(candidateLimitFromEnv()).toBe(30000);
    process.env.MELK_MATCH_CANDIDATE_LIMIT = "24000";
    expect(candidateLimitFromEnv()).toBe(24000);
    process.env.MELK_MATCH_CANDIDATE_LIMIT = "not-a-number";
    expect(candidateLimitFromEnv()).toBe(12000);
    if (saved === undefined) delete process.env.MELK_MATCH_CANDIDATE_LIMIT;
    else process.env.MELK_MATCH_CANDIDATE_LIMIT = saved;
  });
});
