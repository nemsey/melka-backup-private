/**
 * ایجنت هوشمند کاشی «شاخص قیمت روز مناطق»
 * ------------------------------------------------------
 * تخصص: تحلیل شاخص قیمت‌های روز ملک تبریز به تفکیک منطقه —
 * سطح بازار، مقایسه مناطق، هشدار جهش قیمتی و پایش سلامت
 * قیمت‌گذاری (آگهی‌های منحرف از شاخص) — با یادگیری از بازخورد مدیر.
 */

import { db } from "@/lib/db";
import { BaseLearningAgent, type InsightCard } from "./base-agent";
import { getPriceIndexConfigs } from "@/lib/melk-api/sync";
import { computeAreaStats, detectJump, findDeviatingAds, overallIndex, type PriceSample } from "@/lib/melk-api/price-index";
import { faNumber, faPercent, faToman } from "@/lib/format";

/** برچسب فارسی دسته‌های آگهی بازار */
const CATEGORY_FA: Record<string, string> = {
  "apartment-sell": "آپارتمان (فروش)",
  "apartment-rent": "آپارتمان (اجاره)",
  "house-villa-sell": "خانه و ویلا (فروش)",
  "house-villa-rent": "خانه و ویلا (اجاره)",
  "office-sell": "اداری و تجاری (فروش)",
  "shop-sell": "مغازه (فروش)",
  "plot-old": "کلنگی",
};

export class PriceIndexAgent extends BaseLearningAgent {
  readonly tileId = "price-index";
  readonly name = "ایجنت تحلیل شاخص قیمت روز";
  readonly insightDomains = ["MARKET", "REGION", "TREND", "ALERT", "HEALTH"] as const;

  protected async computeRawInsights(): Promise<InsightCard[]> {
    const cards: InsightCard[] = [];

    // ۱) پیکربندی رسمی شاخص سامانه ARM
    const { indices, liveError } = await getPriceIndexConfigs();
    if (indices.length > 0) {
      const idx = indices[0];
      cards.push({
        key: "index-config",
        domain: "MARKET",
        title: "شاخص رسمی سامانه ملک تبریز",
        body: `شاخص «${idx.tradeType} / ${idx.buildingType} / ${idx.propertyType}» شهر ${idx.city} با پوشش ${faNumber(idx.areas.length)} منطقه تبریز ${idx.yearFrom && idx.yearTo ? `برای سال‌های ${faNumber(idx.yearFrom)} تا ${faNumber(idx.yearTo)}` : ""} از سامانه ARM استخراج شده است${idx.details.length > 0 ? ` — مشخصات فنی: ${idx.details.map((d) => `${d.label} ${d.value}`).join("، ")}` : ""}.`,
        severity: "info",
        metrics: [
          { label: "مناطق تحت پوشش", value: faNumber(idx.areas.length) },
          { label: "دسته", value: `${idx.tradeType} ${idx.propertyType}` },
        ],
      });
    } else if (liveError) {
      cards.push({
        key: "index-config-error",
        domain: "MARKET",
        title: "پیکربندی شاخص سامانه ARM در دسترس نیست",
        body: `دریافت شاخص رسمی موفق نبود: ${liveError} آمار منطقه‌ای بر پایه داده واقعی بازار (آگهی‌های زنده) همچنان محاسبه می‌شود.`,
        severity: "warning",
      });
    }

    // ۲) آمار واقعی بازار از آگهی‌های زنده
    const ads = await db.divarAd.findMany({
      where: { status: { in: ["active", "registered"] }, pricePerMeter: { gt: 0 } },
    });
    const samples: PriceSample[] = ads
      .filter((a) => (a.matchedLineName ?? a.matchedAreaName) != null)
      .map((a) => ({
        token: a.token,
        title: a.title,
        areaName: (a.matchedLineName ?? a.matchedAreaName ?? "").trim(),
        category: a.category,
        pricePerMeter: a.pricePerMeter ?? 0,
        totalScore: a.totalScore,
        publisherType: a.publisherType,
      }));

    if (samples.length === 0) return cards.length > 0 ? cards : [
      {
        key: "index-empty",
        domain: "MARKET",
        title: "نمونه بازار در انتظار اسکن",
        body: "برای محاسبه شاخص منطقه‌ای، آگهی‌های زنده بازار (با قیمت هر متر و منطقه تطبیق‌شده) لازم است. با اجرای اسکن در کاشی «فایل‌یابی از دیوار»، نمونه‌ها جمع‌آوری و شاخص به‌طور خودکار فعال می‌شود.",
        severity: "info",
      },
    ];

    const areaStats = computeAreaStats(samples);
    const overall = overallIndex(areaStats);

    // ---- MARKET: شاخص کل ----
    if (overall) {
      cards.push({
        key: "index-overall",
        domain: "MARKET",
        title: "شاخص کل بازار مسکن تبریز",
        body: `از ${faNumber(overall.totalSamples)} آگهی زنده در ${faNumber(overall.coveredAreas)} منطقه، شاخص کل (میانه وزنی قیمت هر متر) ${faToman(overall.medianPerMeter)} است. این عدد مرجع سریع قیمت‌گذاری در جلسات مذاکره است.`,
        severity: "info",
        metrics: [
          { label: "شاخص کل (هر متر)", value: faToman(overall.medianPerMeter) },
          { label: "نمونه فعال", value: faNumber(overall.totalSamples) },
          { label: "مناطق پوشش‌داده", value: faNumber(overall.coveredAreas) },
        ],
      });
    }

    // ---- REGION: مقایسه مناطق (فقط مناطق قابل‌اتکا — ≥ ۲ نمونه) ----
    const reliableStats = areaStats.filter((s) => s.reliable);
    if (reliableStats.length >= 2) {
      const sorted = [...reliableStats].sort((a, b) => b.medianPerMeter - a.medianPerMeter);
      const top = sorted[0];
      const bottom = sorted[sorted.length - 1];
      const ratio = bottom.medianPerMeter > 0 ? Math.round((top.medianPerMeter / bottom.medianPerMeter) * 10) / 10 : 0;
      cards.push({
        key: "index-region",
        domain: "REGION",
        title: "مقایسه مناطق: گران‌ترین و اقتصادی‌ترین",
        body: `گران‌ترین منطقه قابل‌اتکا «${top.areaName}» (${CATEGORY_FA[top.category] ?? top.category}) با شاخص ${faToman(top.medianPerMeter)} هر متر و اقتصادی‌ترین «${bottom.areaName}» با ${faToman(bottom.medianPerMeter)} است — فاصله ${faNumber(ratio)} برابری. ${ratio >= 2 ? "این شکاف معنادار برای هدف‌گذاری بازاری و مشاوره سرمایه‌گذاری ارزشمدار است." : "بازار در این محدوده همگن‌تر است."}`,
        severity: "info",
        metrics: [
          { label: "گران‌ترین", value: `${top.areaName} — ${faToman(top.medianPerMeter)}` },
          { label: "اقتصادی‌ترین", value: `${bottom.areaName} — ${faToman(bottom.medianPerMeter)}` },
        ],
      });
    }

    // ---- TREND / ALERT: جهش قیمتی از تاریخچه ----
    const history = await db.priceIndexHistory.findMany({ orderBy: { recordedAt: "desc" }, take: 400 });
    const historyRows = history.map((h) => ({
      areaName: h.areaName,
      category: h.category,
      medianPerMeter: h.medianPerMeter,
      recordedAt: h.recordedAt.toISOString(),
    }));
    const jumps = detectJump(historyRows, 15);
    if (jumps.length > 0) {
      cards.push({
        key: "index-jump",
        domain: "ALERT",
        title: "هشدار جهش شاخص مناطق",
        body: `${faNumber(jumps.length)} منطقه تغییر معنادار (≥ ${faPercent(15)}) نسبت به ثبت قبلی داشته‌اند: ${jumps
          .slice(0, 3)
          .map((j) => `${j.areaName} (${j.changePercent > 0 ? "افزایش" : "کاهش"} ${faPercent(Math.abs(j.changePercent))})`)
          .join("، ")}. پیش از مذاکره در این مناطق، بازبینی قیمت‌های مشابه توصیه می‌شود.`,
        severity: "warning",
        metrics: jumps.slice(0, 3).map((j) => ({ label: j.areaName, value: `${faPercent(j.changePercent)} نسبت به ثبت قبلی` })),
      });
    }

    // ---- HEALTH: پایش سلامت قیمت‌گذاری ----
    const deviations = findDeviatingAds(samples, areaStats, 30);
    if (deviations.length > 0) {
      const overpriced = deviations.filter((d) => d.deviationPercent > 0);
      cards.push({
        key: "index-health",
        domain: "HEALTH",
        title: "پایش سلامت قیمت‌گذاری — انحراف از شاخص",
        body: `${faNumber(deviations.length)} آگهی فاصله معنادار (≥ ${faPercent(30)}) از شاخص منطقه خود دارند — ${faNumber(overpriced.length)} مورد گران‌تر از شاخص و ${faNumber(deviations.length - overpriced.length)} مورد ارزان‌تر. موارد ارزان‌تر از شاخص، فرصت «زیر قیمت بازار» برای خریداران هستند و موارد گران‌تر به بازنگری قیمت نیاز دارند.`,
        severity: deviations.length >= 5 ? "warning" : "info",
        metrics: [
          { label: "آگهی منحرف", value: faNumber(deviations.length) },
          { label: "گران‌تر از شاخص", value: faNumber(overpriced.length) },
          { label: "ارزان‌تر از شاخص", value: faNumber(deviations.length - overpriced.length) },
        ],
      });
    }

    return cards;
  }
}

export const priceIndexAgent = new PriceIndexAgent();
