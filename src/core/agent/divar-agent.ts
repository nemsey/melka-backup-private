/**
 * ایجنت هوشمند فایل‌یابی از دیوار — یادگیرنده اختصاصی این کاشی
 * ------------------------------------------------------
 * دامنه‌های بینش:
 *  SCAN      — پوشش و سلامت اسکن (زمان انتشار واقعی، منبع داده، نرخ فایل تازه)
 *  PERSONAL  — عملکرد فیلتر شخصی‌بودن (درصد آگهی‌های شخصی شناسایی‌شده)
 *  PRICE     — کیفیت تشخیص زیرقیمت و آمار بازار محله‌ها
 *  LOCATION  — دقت تطبیق مکان با منطقه‌بندی آرم
 *  LEARNING  — یادگیری از دلایل رد آگهی توسط کاربر (پیشگیری از تکرار اشتباه)
 */

import { db } from "@/lib/db";
import { BaseLearningAgent, type InsightCard } from "./base-agent";

export class DivarAgent extends BaseLearningAgent {
  readonly tileId = "file-finder";
  readonly name = "ایجنت فایل‌یابی دیوار";
  readonly insightDomains = ["SCAN", "PERSONAL", "PRICE", "LOCATION", "LEARNING"] as const;

  protected async computeRawInsights(): Promise<InsightCard[]> {
    const cards: InsightCard[] = [];

    const [ads, scans, rejects, marketStats] = await Promise.all([
      db.divarAd.findMany({
        where: { status: "active" },
        select: { bucket: true, personalScore: true, totalScore: true, underpriceScore: true, locationScore: true, matchedLineName: true, category: true, publishedAt: true, pricePerMeter: true },
        take: 3000,
      }).catch(() => []),
      db.divarScanLog.findMany({ orderBy: { startedAt: "desc" }, take: 5 }).catch(() => []),
      db.divarRejectLog.findMany({ orderBy: { createdAt: "desc" }, take: 120 }).catch(() => []),
      db.marketPriceStat.findMany({ take: 500 }).catch(() => []),
    ]);

    // ===== دامنه SCAN — پوشش اسکن =====
    if (scans.length > 0) {
      const last = scans[0];
      const okRate = scans.filter((s) => !s.error).length / scans.length;
      cards.push({
        key: "scan-health",
        domain: "SCAN",
        title: `سلامت اسکن دیوار — ${last.error ? "نیازمند توجه" : "پایدار"}`,
        body: last.error
          ? `آخرین اسکن با خطا روبه‌رو شد: «${last.error.slice(0, 160)}». اتصال شبکه یا منبع داده (وب/کنار) را بررسی کنید.`
          : `آخرین اسکن موفق: ${last.scanned} آگهی بررسی، ${last.inWindow} درون بازه زمانی انتشار، ${last.newAds} فایل تازه در ${Math.round(last.durationMs / 100) / 10} ثانیه. نرخ موفقیت ۵ اسکن اخیر: ${Math.round(okRate * 100)}٪.`,
        severity: last.error ? "warning" : okRate >= 0.8 ? "positive" : "info",
        metrics: [
          { label: "منبع", value: last.source === "kenar" ? "کنار (رسمی)" : "وب عمومی دیوار" },
          { label: "فایل تازه", value: String(last.newAds) },
        ],
      });
    } else {
      cards.push({
        key: "scan-empty",
        domain: "SCAN",
        title: "هنوز اسکنی اجرا نشده است",
        body: "با دکمه «اسکن دیوار» در صفحه کاشی، نخستین جست‌وجوی آگهی‌های تبریز را اجرا کنید تا ایجنت داده کافی برای تحلیل بیابد. اسکن خودکار دوره‌ای نیز در تنظیمات ایجنت قابل فعال‌سازی است.",
        severity: "info",
      });
    }

    // ===== دامنه PERSONAL — عملکرد فیلتر شخصی =====
    if (ads.length > 0) {
      const personalAds = ads.filter((a) => (a.personalScore ?? 0) >= 60).length;
      const brokerish = ads.filter((a) => (a.personalScore ?? 0) < 35).length;
      const rate = Math.round((personalAds / ads.length) * 100);
      cards.push({
        key: "personal-filter",
        domain: "PERSONAL",
        title: `فیلتر شخصی‌بودن: ${rate}٪ آگهی‌های فعال شخصی تشخیص داده شد`,
        body:
          `از ${ads.length} فایل فعال، ${personalAds} آگهی با نشانه‌های قوی «مالک/بدون واسطه» و ${brokerish} آگهی با نشانه‌های مشاور املاک شناسایی شد. ` +
          (brokerish > ads.length * 0.5
            ? "بیش از نیمی از آگهی‌ها مشاور املاک‌اند — سیگنال خوبی برای تنظیم دقیق‌تر فیلترها یا افزودن واژگان جدید از طریق بازخورد."
            : "تعادل مناسبی برقرار است؛ آگهی‌های مشاور املاک در پنجره بررسی با امتیاز پایین قرار می‌گیرند."),
        severity: rate >= 40 ? "positive" : "info",
        metrics: [
          { label: "شخصی (۶۰+)", value: String(personalAds) },
          { label: "مشاورپذیر (<۳۵)", value: String(brokerish) },
        ],
      });
    }

    // ===== دامنه PRICE — بازار و زیرقیمت =====
    if (ads.length > 0) {
      const underpriced = ads.filter((a) => (a.underpriceScore ?? 0) >= 70).length;
      const noPrice = ads.filter((a) => a.pricePerMeter == null).length;
      const withLineStat = marketStats.filter((m) => m.scopeKey.startsWith("line:")).length;
      cards.push({
        key: "price-filter",
        domain: "PRICE",
        title: `زیرقیمت: ${underpriced} فایل تخفیف‌دار شناسایی شد`,
        body:
          `آمار قیمت ${withLineStat} محله از آگهی‌های ذخیره‌شده ساخته شده است. ` +
          (noPrice > 0 ? `${noPrice} آگهی قیمت هر متر قابل استخراج ندارد و در این فیلتر امتیاز نمی‌گیرد.` : "همه آگهی‌ها قیمت متر دارند.") +
          " با رشد نمونه‌های هر محله، دقت مقایسه قیمت افزایش می‌یابد.",
        severity: underpriced > 0 ? "positive" : "info",
        metrics: [
          { label: "زیرقیمت (۷۰+)", value: String(underpriced) },
          { label: "محله‌های آماردار", value: String(withLineStat) },
        ],
      });
    }

    // ===== دامنه LOCATION — دقت مکان =====
    if (ads.length > 0) {
      const located = ads.filter((a) => (a as { matchedLineName?: string | null }).matchedLineName).length;
      const strongMatch = ads.filter((a) => (a.locationScore ?? 0) >= 85).length;
      const rate = Math.round((located / ads.length) * 100);
      cards.push({
        key: "location-filter",
        domain: "LOCATION",
        title: `تطبیق مکان: ${rate}٪ آگهی‌ها به محله‌های آرم نگاشت شد`,
        body: `${located} از ${ads.length} فایل با منطقه/محله سامانه آرم تطبیق یافت (${strongMatch} مورد با تطبیق قوی متنی+مختصاتی). منطقه‌بندی عین سامانه آرم (۱۳۰ منطقه/۹۲۶ محله تبریز) مبنای این فیلتر است.`,
        severity: rate >= 60 ? "positive" : rate >= 30 ? "info" : "warning",
        metrics: [
          { label: "نگاشت‌شده", value: String(located) },
          { label: "تطبیق قوی", value: String(strongMatch) },
        ],
      });
    }

    // ===== دامنه LEARNING — یادگیری از ردها =====
    if (rejects.length > 0) {
      const reasonCount = new Map<string, number>();
      for (const r of rejects) {
        try {
          const reasons = JSON.parse(r.reasons) as string[];
          for (const reason of reasons) reasonCount.set(reason, (reasonCount.get(reason) ?? 0) + 1);
        } catch {
          // نادیده
        }
      }
      const top = [...reasonCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
      const reasonLabels: Record<string, string> = {
        broker: "آگهی مشاور املاک",
        "semi-personal": "شخصی‌بودن نامقطع",
        "no-price": "بی‌قیمت",
        overpriced: "گران‌تر از بازار",
        location: "مکان نامشخص/خارج",
        "not-underpriced": "بدون تخفیف",
        "already-sold": "فروخته/بی‌پاسخ",
        condition: "وضعیت/سند",
        other: "سایر",
      };
      cards.push({
        key: "reject-learning",
        domain: "LEARNING",
        title: `یادگیری از ${rejects.length} رد شما — الگوی دلایل شناسایی شد`,
        body:
          `شایع‌ترین دلایل رد: ${top.map(([k, v]) => `${reasonLabels[k] ?? k} (${v} بار)`).join("؛ ")}. ` +
          "ایجنت این الگو را در پیش‌بینی دلایل رد آگهی‌های بعدی به‌کار می‌گیرد تا آگهی‌های مشابهِ ردشده‌ها را با امتیاز شخصی/زیرقیمت تعدیل‌شده ارائه کند. آگهی‌های ردشده هرگز آرشیو نمی‌شوند — فقط سیگنال یادگیری می‌ماند.",
        severity: "info",
        metrics: top.map(([k, v]) => ({ label: reasonLabels[k] ?? k, value: String(v) })),
      });

      // آیا مشاوران همچنان به صف شکار می‌رسند؟
      const rejectedBroker = reasonCount.get("broker") ?? 0;
      if (rejectedBroker >= 3) {
        cards.push({
          key: "broker-leak",
          domain: "LEARNING",
          title: "هشدار: آگهی‌های مشاور املاک هنوز در فایل‌های شما می‌رسند",
          body: `${rejectedBroker} آگهی مشاور املاک رد شده‌اند. ایجنت واژگان جدید این آگهی‌ها را در حافظه دارد؛ با ثبت بازخورد روی بینش‌ها، وزن فیلتر شخصی‌بودن در سیاست تقویت می‌شود.`,
          severity: "warning",
        });
      }
    }

    return cards;
  }
}

/** نمونه یکتا */
export const divarAgent = new DivarAgent();
