/**
 * ایجنت هوشمند فایل‌یابی از دیوار — یادگیرنده اختصاصی این کاشی
 * ------------------------------------------------------
 * دامنه‌های بینش:
 *  SCAN      — پوشش و سلامت اسکن (زمان انتشار واقعی، منبع داده، نرخ فایل تازه، رد خودکار)
 *  PERSONAL  — عملکرد قانون مالک: رد کامل غیرشخصی‌ها + کیفیت تشخیص شخصی‌بودن
 *  PRICE     — کیفیت تشخیص زیرقیمت و آمار بازار محله‌ها
 *  OTHER     — سایر فاکتورهای فایل بهینه (شاهکار ایجنت)
 *  LOCATION  — دقت تطبیق مکان با منطقه‌بندی آرم
 *  LEARNING  — یادگیری از دلایل رد آگهی توسط کاربر (پیشگیری از تکرار اشتباه)
 */

import { db } from "@/lib/db";
import { BaseLearningAgent, type InsightCard } from "./base-agent";

export class DivarAgent extends BaseLearningAgent {
  readonly tileId = "file-finder";
  readonly name = "ایجنت فایل‌یابی دیوار";
  readonly insightDomains = ["SCAN", "PERSONAL", "PRICE", "OTHER", "LOCATION", "LEARNING"] as const;

  protected async computeRawInsights(): Promise<InsightCard[]> {
    const cards: InsightCard[] = [];

    const [ads, scans, rejects, marketStats, settingsRow] = await Promise.all([
      db.divarAd.findMany({
        where: { status: "active" },
        select: { bucket: true, personalScore: true, totalScore: true, underpriceScore: true, otherScore: true, locationScore: true, matchedLineName: true, matchedAreaName: true, category: true, publishedAt: true, pricePerMeter: true, publisherType: true, publisherName: true },
        take: 3000,
      }).catch(() => []),
      db.divarScanLog.findMany({ orderBy: { startedAt: "desc" }, take: 5 }).catch(() => []),
      db.divarRejectLog.findMany({ orderBy: { createdAt: "desc" }, take: 120 }).catch(() => []),
      db.marketPriceStat.findMany({ take: 500 }).catch(() => []),
      db.divarSetting.findUnique({ where: { id: "singleton" } }).catch(() => null),
    ]);

    // وضعیت فیلتر مکان (۱۷ منطقة پیش‌فرض مالک یا انتخاب دلخواه)
    let locAreas = 0;
    let locLines = 0;
    try {
      const parsed = settingsRow ? (JSON.parse(settingsRow.dataJson) as { areaIds?: string[]; lineIds?: string[] }) : null;
      locAreas = parsed?.areaIds?.length ?? 0;
      locLines = parsed?.lineIds?.length ?? 0;
    } catch {
      // نادیده
    }
    const locFilterActive = locAreas > 0 || locLines > 0;

    // ===== دامنه SCAN — پوشش اسکن =====
    if (scans.length > 0) {
      const last = scans[0];
      const okRate = scans.filter((s) => !s.error).length / scans.length;
      const outOfArea = scans.reduce((s, x) => s + (x.outOfArea ?? 0), 0);
      const autoRejected = scans.reduce((s, x) => s + (x.autoRejected ?? 0), 0);
      cards.push({
        key: "scan-health",
        domain: "SCAN",
        title: `سلامت اسکن دیوار — ${last.error ? "نیازمند توجه" : "پایدار"}`,
        body: last.error
          ? `آخرین اسکن با خطا روبه‌رو شد: «${last.error.slice(0, 160)}». اتصال شبکه یا منبع داده (وب/کنار) را بررسی کنید.`
          : `آخرین اسکن موفق: ${last.scanned} آگهی بررسی، ${last.inWindow} درون بازه زمانی انتشار، ${last.newAds} فایل شخصی تازه در ${Math.round(last.durationMs / 100) / 10} ثانیه. نرخ موفقیت ۵ اسکن اخیر: ${Math.round(okRate * 100)}٪.`,
        severity: last.error ? "warning" : okRate >= 0.8 ? "positive" : "info",
        metrics: [
          { label: "منبع", value: last.source === "kenar" ? "کنار (رسمی)" : "وب عمومی دیوار" },
          { label: "فایل شخصی تازه", value: String(last.newAds) },
          ...(autoRejected > 0 ? [{ label: "رد خودکار غیرشخصی", value: String(autoRejected) }] : []),
          ...(locFilterActive ? [{ label: "ردِ خارج از محدوده", value: String(outOfArea) }] : []),
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

    // ===== دامنه PERSONAL — قانون مالک: رد کامل غیرشخصی‌ها + کیفیت تشخیص =====
    if (ads.length > 0) {
      const personalAds = ads.filter((a) => (a.personalScore ?? 0) >= 60).length;
      const labeled = ads.filter((a) => a.publisherType);
      const labeledPersonal = labeled.filter((a) => a.publisherType === "personal").length;
      const autoRejectRecent = scans.reduce((s, x) => s + (x.autoRejected ?? 0), 0);
      const topBrokers = new Map<string, number>();
      for (const a of labeled) {
        if (a.publisherType !== "personal" && a.publisherName) {
          topBrokers.set(a.publisherName, (topBrokers.get(a.publisherName) ?? 0) + 1);
        }
      }
      const topBroker = [...topBrokers.entries()].sort((x, y) => y[1] - x[1])[0];
      cards.push({
        key: "personal-filter",
        domain: "PERSONAL",
        title: `قانون مالک فعال: ${autoRejectRecent > 0 ? `${autoRejectRecent} فایل غیرشخصی در ۵ اسکن اخیر کامل رد شد` : "فایل‌های غیرشخصی هرگز ذخیره نمی‌شوند"}`,
        body:
          `از ${ads.length} فایل فعال، ${personalAds} فایل با نشانه‌های قوی «مالک/بدون واسطه» نگه داشته شده‌اند — فایل غیرشخصی (مشاور/دپارتمان املاک) به‌موجب قانون مالک در اسکن کامل رد می‌شود و هرگز امتیاز/دسته‌بندی نمی‌گیرد. ` +
          (labeled.length > 0
            ? `برچسب رسمی دیوار (زیر نقشه) برای ${labeled.length} فایل استخراج شده: ${labeledPersonal} شخصی — این برچسب قطعی‌ترین منبع تشخیص است. ` +
              (topBroker ? ` فعال‌ترین آگهی‌دهنده کسب‌وکاری دیده‌شده: «${topBroker[0]}» (${topBroker[1]} فایل پیش از رد).` : "")
            : "برچسب رسمی دیوار هنوز استخراج نشده — با نخستین اسکن پس از به‌روزرسانی، نوع آگهی‌دهنده هر فایل ثبت می‌شود."),
        severity: "positive",
        metrics: [
          { label: "فایل شخصی فعال", value: String(ads.length) },
          { label: "شخصی قوی (۶۰+)", value: String(personalAds) },
          ...(autoRejectRecent > 0 ? [{ label: "رد خودکار (۵ اسکن)", value: String(autoRejectRecent) }] : []),
          ...(labeled.length > 0 ? [{ label: "برچسب دیوار: شخصی", value: String(labeledPersonal) }] : []),
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

    // ===== دامنه OTHER — شاهکار ایجنت: سایر فاکتورهای فایل بهینه =====
    if (ads.length > 0) {
      const scored = ads.filter((a) => (a.otherScore ?? 0) > 0);
      const avg = scored.length ? Math.round(scored.reduce((s, a) => s + (a.otherScore ?? 0), 0) / scored.length) : 0;
      const strong = scored.filter((a) => (a.otherScore ?? 0) >= 70).length;
      const freshAds = ads.filter((a) => a.publishedAt && Date.now() - a.publishedAt.getTime() <= 6 * 3600_000).length;
      cards.push({
        key: "other-factors",
        domain: "OTHER",
        title: `سایر فاکتورهای بهینه (شاهکار ایجنت): میانگین ${avg}٪ — ${strong} فایل بهینه قوی`,
        body:
          "ایجنت هر فایل شخصی را از شش فاکتور نکته‌سنج می‌سنجد: فوریت و انگیزه فروش‌نده، تازگی انتشار (ساعات نخست = فرصت شکار)، تکمیل و شفافیت داده‌ها، کیفیت و اصالت محتوا (صداقت در عیب‌ها)، آمادگی معامله (سند تک‌برگ/ملک خالی) و دقت مکان. " +
          `${freshAds} فایل کمتر از ۶ ساعت از انتشارشان گذشته است — فرصت تماس پیش از رقبا. ` +
          (avg < 45
            ? "میانگین پایین نشان می‌دهد بیشتر فایل‌ها متعارف‌اند؛ آستانه شکار را با وزن این معیار هم‌وزن کنید."
            : "کیفیت کلی فایل‌های بهینه مطلوب است — وزن ۲۰ پیش‌فرض این معیار، فایل‌های بهینه را در پنجره شکار بالا می‌آورد."),
        severity: avg >= 60 ? "positive" : "info",
        metrics: [
          { label: "میانگین سایر فاکتورها", value: `${avg}٪` },
          { label: "بهینه قوی (۷۰+)", value: String(strong) },
          { label: "تازه (<۶ ساعت)", value: String(freshAds) },
        ],
      });
    }

    // ===== دامنه LOCATION — دقت مکان + فیلتر مناطق انتخابی =====
    if (ads.length > 0) {
      const located = ads.filter((a) => (a as { matchedLineName?: string | null }).matchedLineName).length;
      const strongMatch = ads.filter((a) => (a.locationScore ?? 0) >= 85).length;
      const rate = Math.round((located / ads.length) * 100);
      cards.push({
        key: "location-filter",
        domain: "LOCATION",
        title: locFilterActive
          ? `فیلتر مکان فعال: ${locAreas} منطقه و ${locLines} محله — ${rate}٪ آگهی‌های ذخیره‌شده نگاشت دقیق دارند`
          : `تطبیق مکان: ${rate}٪ آگهی‌ها به محله‌های آرم نگاشت شد`,
        body:
          `${located} از ${ads.length} فایل با منطقه/محله سامانه آرم تطبیق یافت (${strongMatch} مورد با تطبیق قوی متنی+مختصاتی). ` +
          (locFilterActive
            ? `فیلتر مکان بر اساس ${locAreas} منطقه انتخابی فعال است؛ آگهی‌های بیرون از انتخاب هرگز ذخیره نمی‌شوند و آمار بازار فقط روی مناطق هدف ساخته می‌شود. `
            : "فیلتر مکان خاموش است و کل تبریز ذخیره می‌شود؛ با انتخاب مناطق، جست‌وجو دقیقاً محدود می‌شود. ") +
          "منطقه‌بندی عین سامانه آرم (۱۳۰ منطقه/۹۲۶ محله تبریز) مبنای این فیلتر است.",
        severity: locFilterActive ? (rate >= 60 ? "positive" : rate >= 30 ? "info" : "warning") : "info",
        metrics: [
          { label: "نگاشت‌شده", value: String(located) },
          { label: "تطبیق قوی", value: String(strongMatch) },
          ...(locFilterActive ? [{ label: "مناطق انتخابی", value: String(locAreas) }] : []),
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
