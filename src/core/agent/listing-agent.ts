/**
 * ایجنت هوشمند کاشی «آگهی» — یادگیرنده اختصاصی این کاشی
 * ------------------------------------------------------
 * دامنه‌های بینش:
 *  REGISTRY    — سلامت ثبت فایل‌ها (دستی و خودکار دیوار) و رشد دفتر آگهی
 *  CRM         — وضعیت انتقال به سامانه آرم (گام‌به‌گام) و گلوگاه‌های ثبت
 *  INSTAGRAM   — انتشار محتوا در اینستاگرام (پست/رییلز) و سلامت اتصال
 *  COMPLETENESS— کامل‌بودن ۵ گامی فایل‌ها و گام‌های ناتمام پرتکرار
 *  SOURCE      — تحلیل منبع ثبت (مالک حضوری در برابر فایل‌های دیوار)
 *  LEARNING    — یادگیری از بازخوردها (پایه)
 */

import { db } from "@/lib/db";
import { BaseLearningAgent, type InsightCard } from "./base-agent";

export class ListingAgent extends BaseLearningAgent {
  readonly tileId = "listings";
  readonly name = "ایجنت آگهی";
  readonly insightDomains = ["REGISTRY", "CRM", "INSTAGRAM", "COMPLETENESS", "SOURCE"] as const;

  protected async computeRawInsights(): Promise<InsightCard[]> {
    const cards: InsightCard[] = [];

    const [listings, postLogs] = await Promise.all([
      db.listingRecord.findMany({ orderBy: { createdAt: "desc" }, take: 500 }).catch(() => []),
      db.instagramPostLog.findMany({ orderBy: { createdAt: "desc" }, take: 200 }).catch(() => []),
    ]);

    const total = listings.length;
    const manual = listings.filter((l) => l.source === "manual").length;
    const fromDivar = listings.filter((l) => l.source === "divar").length;
    const crmTransferred = listings.filter((l) => l.crmTransferredAt).length;
    const instagramPublished = listings.filter((l) => l.instagramPublishedAt).length;

    // ===== دامنه REGISTRY — دفتر فایل آگهی =====
    if (total === 0) {
      cards.push({
        key: "registry-empty",
        domain: "REGISTRY",
        title: "دفتر آگهی در حال راه‌اندازی است",
        body:
          "هنوز فایلی ثبت نشده است. دو مسیر ثبت دارید: (۱) «ثبت دستی» برای مالکانی که حضوری درخواست ثبت دارند — با همان فرم ۵ گامی سامانه آرم؛ (۲) فایل‌های تأییدشده کاشی «فایل‌یابی» به‌صورت خودکار اینجا ثبت می‌شوند. هر فایل دو کلید انتقال دارد: «انتقال به CRM» برای ثبت در سامانه آرم و «انتقال به اینستاگرام» برای تولید و انتشار محتوا.",
        severity: "info",
      });
    } else {
      const last7 = listings.filter((l) => Date.now() - l.createdAt.getTime() < 7 * 86400_000).length;
      cards.push({
        key: "registry-health",
        domain: "REGISTRY",
        title: `دفتر آگهی — ${total} فایل ثبت‌شده (${last7} فایل در ۷ روز اخیر)`,
        body: `${manual} فایل دستی (مالک حضوری) و ${fromDivar} فایل خودکار از فایل‌یابی دیوار. ${crmTransferred} فایل به سامانه آرم منتقل شده و ${instagramPublished} فایل در اینستاگرام منتشر شده است. نسبت انتقال CRM ${total > 0 ? Math.round((crmTransferred / total) * 100) : 0}٪ است — فایل‌های کامل اما منتقل‌نشده را با کلید «انتقال به CRM» پیش ببرید.`,
        severity: crmTransferred / Math.max(total, 1) >= 0.5 ? "positive" : "info",
        metrics: [
          { label: "کل فایل‌ها", value: String(total) },
          { label: "دستی", value: String(manual) },
          { label: "از دیوار", value: String(fromDivar) },
          { label: "انتقال CRM", value: String(crmTransferred) },
          { label: "انتشار اینستاگرام", value: String(instagramPublished) },
        ],
      });
    }

    // ===== دامنه COMPLETENESS — کامل‌بودن ۵ گامی =====
    if (total > 0) {
      const stepLabels = ["اطلاعات مالک", "اطلاعات مکانی ملک", "اطلاعات معامله", "تصاویر و اسناد", "توضیحات مشاوران"];
      const incomplete = listings.filter((l) => l.status !== "archived" && (!l.customerName || !l.customerMobile || !l.areaId || !l.tradeTypeId || !l.priceEvaluation || !l.fileFinding || !l.userSeriousness));
      const gaps = new Map<string, number>();
      for (const l of listings) {
        if (!l.customerName || !l.customerMobile) gaps.set("گام ۱ مالک", (gaps.get("گام ۱ مالک") ?? 0) + 1);
        if (!l.areaId || !l.lineId || !l.address) gaps.set("گام ۲ مکان", (gaps.get("گام ۲ مکان") ?? 0) + 1);
        if (!l.tradeTypeId || !l.propertyTypeId || !l.buildingTypeId) gaps.set("گام ۳ معامله", (gaps.get("گام ۳ معامله") ?? 0) + 1);
        if (!l.imagesJson || l.imagesJson === "[]") gaps.set("گام ۴ رسانه", (gaps.get("گام ۴ رسانه") ?? 0) + 1);
        if (!l.priceEvaluation || !l.fileFinding || !l.userSeriousness) gaps.set("گام ۵ توضیحات", (gaps.get("گام ۵ توضیحات") ?? 0) + 1);
      }
      const topGap = [...gaps.entries()].sort((a, b) => b[1] - a[1])[0];
      cards.push({
        key: "completeness",
        domain: "COMPLETENESS",
        title: topGap
          ? `کامل‌بودن ۵ گامی — پرتکرارترین نقطهٔ کمبود: ${topGap[0]} (${topGap[1]} فایل)`
          : "کامل‌بودن ۵ گامی — همهٔ فایل‌ها کامل هستند",
        body:
          topGap
            ? `${incomplete.length} فایل هنوز کامل نیست. گام ناتمام پرتکرار «${topGap[0]}» است؛ فایل‌های دیوار معمولاً نام/موبایل مالک را ندارند چون این داده در دیوار عمومی نیست — پس از تماس با آگهی‌دهنده، از «جزییات ← تکمیل» وارد کنید. فایل کامل، پیش‌نیاز انتقال بی‌وقفه به CRM است.`
            : `هر ${total} فایل، هر ۵ گام (مالک، مکان، معامله، رسانه، توضیحات مشاوران) را کامل دارد — آمادهٔ انتقال به سامانه آرم و انتشار اینستاگرام.`,
        severity: incomplete.length === 0 ? "positive" : incomplete.length > total / 2 ? "warning" : "info",
        metrics: stepLabels.map((label, i) => ({ label, value: String(gaps.get(`گام ${i + 1} ${label.split(" ")[1] ?? ""}`) ?? 0) })),
      });
    }

    // ===== دامنه CRM — انتقال به سامانه آرم =====
    if (total > 0) {
      const failed = listings.filter((l) => {
        if (!l.crmTransferJson) return false;
        try {
          return Boolean((JSON.parse(l.crmTransferJson) as { failed?: boolean }).failed);
        } catch {
          return false;
        }
      }).length;
      const readyNotTransferred = listings.filter(
        (l) => !l.crmTransferredAt && l.customerName && l.customerMobile && l.areaId && l.tradeTypeId && l.priceEvaluation && l.fileFinding && l.userSeriousness
      ).length;
      cards.push({
        key: "crm-transfer",
        domain: "CRM",
        title: `انتقال به CRM — ${crmTransferred} موفق${failed > 0 ? `، ${failed} ناموفق` : ""}${readyNotTransferred > 0 ? `، ${readyNotTransferred} آمادهٔ انتقال` : ""}`,
        body:
          failed > 0
            ? `${failed} انتقال با خطا روبه‌رو شده — گزارش گام‌به‌گام هر انتقال در «جزییات فایل» موجود است؛ معمولاً علت، قطعی پایگاه دادهٔ آرم یا نبود توکن (ورود با کد پرسنلی + پیامک) است. ${readyNotTransferred} فایل کامل در صف انتقال است.`
            : `همهٔ انتقال‌ها موفق بوده‌اند. ${readyNotTransferred > 0 ? `${readyNotTransferred} فایل کاملِ منتقل‌نشده در صف انتقال است — با کلید «انتقال به CRM» ثبت گام‌به‌گام (جستجوی مالک ← ایجاد در صورت نبود ← ثبت آگهی) انجام می‌شود.` : "فایل تازه‌ای در صف انتقال نیست."}`,
        severity: failed > 0 ? "warning" : "positive",
        metrics: [
          { label: "موفق", value: String(crmTransferred) },
          { label: "ناموفق", value: String(failed) },
          { label: "آمادهٔ انتقال", value: String(readyNotTransferred) },
        ],
      });
    }

    // ===== دامنه INSTAGRAM — انتشار محتوا =====
    const publishedLogs = postLogs.filter((p) => p.status === "published");
    const failedLogs = postLogs.filter((p) => p.status === "failed");
    const igConn = await db.instagramConnection.findFirst().catch(() => null);
    if (!igConn || igConn.status !== "connected") {
      cards.push({
        key: "instagram-connection",
        domain: "INSTAGRAM",
        title: "اتصال اینستاگرام برقرار نیست",
        body: "برای انتشار خودکار محتوای فایل‌ها در اینستاگرام، حساب کسب‌وکار را از «تنظیمات عمومی ← اتصال به اینستاگرام» متصل کنید (توکن Graph API + شناسه حساب). پس از اتصال، چراغ نشانگر اینستاگرام در صفحه خانه سبز می‌شود و کلید «انتقال به اینستاگرام» هر فایل فعال می‌گردد.",
        severity: "warning",
      });
    } else if (postLogs.length === 0) {
      cards.push({
        key: "instagram-ready",
        domain: "INSTAGRAM",
        title: `اینستاگرام متصل است${igConn.username ? ` — «${igConn.username}»` : ""}؛ آمادهٔ نخستین انتشار`,
        body: "حساب اینستاگرام کسب‌وکار متصل است اما هنوز محتوایی منتشر نشده. روی هر فایل کامل، کلید «انتقال به اینستاگرام» را بزنید: از اطلاعات فایل، کپشن حرفه‌ای با مشخصات، قیمت و هشتگ‌های هدفمند تولید می‌شود؛ پس از بازبینی و تأیید شما منتشر می‌شود.",
        severity: "positive",
      });
    } else {
      const reels = publishedLogs.filter((p) => p.kind === "reel").length;
      cards.push({
        key: "instagram-activity",
        domain: "INSTAGRAM",
        title: `اینستاگرام — ${publishedLogs.length} انتشار موفق${reels > 0 ? ` (${reels} رییلز)` : ""}${failedLogs.length > 0 ? ` و ${failedLogs.length} ناموفق` : ""}`,
        body: `حساب «${igConn.username ?? "اینستاگرام"}» فعال است. مولد محتوا کپشن هر فایل را با لحن قابل انتخاب (رسمی/صمیمی/فوری) می‌سازد؛ ویدیوی فایل به رییلز و تصاویر به پست تبدیل می‌شود. ${failedLogs.length > 0 ? "انتشارهای ناموفق معمولاً به دلیل نشانی تصویر غیرعمومی یا محدودیت نرخ اینستاگرام است." : ""}`,
        severity: failedLogs.length > 0 ? "warning" : "positive",
        metrics: [
          { label: "منتشرشده", value: String(publishedLogs.length) },
          { label: "رییلز", value: String(reels) },
          { label: "ناموفق", value: String(failedLogs.length) },
        ],
      });
    }

    // ===== دامنه SOURCE — منبع ثبت =====
    if (total >= 3) {
      const divarShare = Math.round((fromDivar / total) * 100);
      cards.push({
        key: "source-mix",
        domain: "SOURCE",
        title: `منبع ثبت فایل‌ها — ${divarShare}٪ خودکار از فایل‌یابی دیوار`,
        body:
          divarShare >= 70
            ? `بیشتر فایل‌ها از مسیر خودکار دیوار می‌آیند (${fromDivar} از ${total}). این یعنی قیف فایل‌یابی به‌خوبی دفتر آگهی را تغذیه می‌کند؛ برای تعادل، ثبت دستی مالکان حضوری را نیز در نظر بگیرید — فایل‌های حضوری معمولاً جدیت بالاتری دارند.`
            : `ترکیب متعادلی دارید: ${manual} ثبت دستی حضوری و ${fromDivar} فایل خودکار دیوار. فایل‌های دستی را همان روز انتقال به CRM بزنید تا در قیف پایش سامانه آرم قرار بگیرند.`,
        severity: "info",
        metrics: [
          { label: "دستی (حضوری)", value: String(manual) },
          { label: "خودکار دیوار", value: String(fromDivar) },
        ],
      });
    }

    return cards;
  }
}

export const listingAgent = new ListingAgent();
