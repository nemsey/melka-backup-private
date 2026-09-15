/**
 * ایجنت هوشمند کاشی «درخواست ملک» — «ایجنت مدیریت مشتریان» (شاهکار)
 * ------------------------------------------------------
 * نقش و هدف اصلی: مدیریت مشتریان (Customer Management).
 * منبع سوپر-مغز: موتور buildCustomerManagement (پروفایل ۳۶۰ درجه + امتیاز سلامت +
 * چرخه عمر + اقدام بعدی + تطبیق درخواست↔آگهی).
 *
 * دامنه‌های بینش:
 *  COMMUNITY_MGMT — نمای کلی جامعه مشتریان درخواست‌ها
 *  CUST_HEALTH   — امتیاز سلامت مشتریان (ترکیب ۵ مؤلفه)
 *  LIFECYCLE_MGMT— چرخه عمر مشتری (جدید ← در تعامل ← جدی ← آماده معامله ← معامله‌شده/راکد)
 *  NEXT_ACTION   — اقدام بعدی هوشمند برای هر مشتری (شاهکار)
 *  MATCH         — تطبیق درخواست با آگهی‌های دفتر آگهی (شاهکار — عین «آگهی‌های پیشنهادی» آرم)
 *  CHURN         — هشدار ریزش مشتریان
 *  EVENT_MGMT    — تحلیل رویدادها (پیگیری‌ها)
 *  ARM_SYNC      — وضعیت ثبت گام‌به‌گام در سامانه آرم
 */

import { db } from "@/lib/db";
import { BaseLearningAgent, type InsightCard } from "./base-agent";
import { buildCustomerManagement, LIFECYCLE_FA } from "@/lib/request/customer-mgmt";

export class RequestAgent extends BaseLearningAgent {
  readonly tileId = "requests";
  readonly name = "ایجنت مدیریت مشتریان";
  readonly insightDomains = [
    "COMMUNITY_MGMT", "CUST_HEALTH", "LIFECYCLE_MGMT", "NEXT_ACTION", "MATCH", "CHURN", "EVENT_MGMT", "ARM_SYNC",
  ] as const;

  protected async computeRawInsights(): Promise<InsightCard[]> {
    const cards: InsightCard[] = [];
    const [requests, summary] = await Promise.all([
      db.requestRecord.findMany({ orderBy: { updatedAt: "desc" }, take: 500 }).catch(() => []),
      buildCustomerManagement().catch(() => null),
    ]);

    const total = requests.length;
    const manual = requests.filter((r) => r.source === "manual").length;
    const auto = requests.filter((r) => r.source === "auto").length;
    const armRegistered = requests.filter((r) => Boolean(r.armRequestId)).length;

    // ===== دامنه COMMUNITY_MGMT — جامعه مشتریان =====
    if (!summary || summary.customers.length === 0) {
      cards.push({
        key: "community-empty",
        domain: "COMMUNITY_MGMT",
        title: "جامعه مشتریان در حال شکل‌گیری است",
        body:
          "نقش اصلی من «مدیریت مشتریان» است: به‌محض ثبت اولین درخواست (دستی برای مشتری حضوری، یا اتوماتیک با ثبت مستقیم در سامانه آرم)، برای هر مشتری پروفایل ۳۶۰ درجه می‌سازم — درخواست‌ها، رویدادها، آگهی‌هایی که مالکشان است، امتیاز سلامت، چرخه عمر و اقدام بعدی هوشمند. هر تعامل را با کلید «ثبت رویداد» مستند کنید تا حافظه من کامل شود.",
        severity: "info",
      });
    } else {
      const s = summary.stats;
      cards.push({
        key: "community-overview",
        domain: "COMMUNITY_MGMT",
        title: `جامعه مشتریان — ${s.totalCustomers} مشتری از ${total} درخواست`,
        body: `${manual} درخواست دستی (مشتری حضوری) و ${auto} درخواست اتوماتیک ثبت شده است. ${s.activeCustomers} مشتری فعال و ${s.dormantCustomers} مشتری راکد دارم؛ ${s.convertedCustomers} مشتری تا سطح معامله پیش رفته‌اند. میانگین امتیاز سلامت جامعه ${s.avgHealth}٪ است — قهرمانان بخش A (${s.segmentA} نفر) ارزش بیشترین زمان شما را دارند.`,
        severity: s.activeCustomers > 0 ? "positive" : "info",
        metrics: [
          { label: "مشتریان", value: String(s.totalCustomers) },
          { label: "فعال", value: String(s.activeCustomers) },
          { label: "راکد", value: String(s.dormantCustomers) },
          { label: "میانگین سلامت", value: `${s.avgHealth}٪` },
          { label: "بخش A", value: String(s.segmentA) },
          { label: "درخواست", value: String(total) },
        ],
      });
    }

    if (summary && summary.customers.length > 0) {
      const s = summary.stats;

      // ===== دامنه CUST_HEALTH — امتیاز سلامت =====
      const top = summary.customers.slice(0, 3);
      const weak = summary.customers.filter((c) => c.healthScore < 40);
      cards.push({
        key: "health-overview",
        domain: "CUST_HEALTH",
        title: `امتیاز سلامت مشتریان — میانگین ${s.avgHealth}٪`,
        body: `سلامت هر مشتری از ۵ مؤلفه ساخته می‌شود: تازگی تعامل (۳۵)، بسامد پیگیری (۲۵)، جدیت (۲۰)، آمادگی مالی (۱۰) و کامل‌بودن پرونده (۱۰). سلامت‌ترین مشتریان شما: ${top.map((c) => `«${c.name}» با ${c.healthScore}٪`).join("، ")}${weak.length > 0 ? `؛ ${weak.length} مشتری زیر ۴۰٪ دارند که نیاز به برنامه‌ریزی جدی دارند.` : "."}`,
        severity: s.avgHealth >= 60 ? "positive" : s.avgHealth >= 40 ? "info" : "warning",
        metrics: [
          { label: "میانگین", value: `${s.avgHealth}٪` },
          { label: "بخش A (۷۰+)", value: String(s.segmentA) },
          { label: "بخش B (۴۰-۶۹)", value: String(s.segmentB) },
          { label: "بخش C (<۴۰)", value: String(s.segmentC) },
        ],
      });

      // ===== دامنه LIFECYCLE_MGMT — چرخه عمر =====
      const sc = s.stageCounts;
      const dominant = (Object.entries(sc) as [keyof typeof sc, number][]).sort((a, b) => b[1] - a[1])[0];
      cards.push({
        key: "lifecycle",
        domain: "LIFECYCLE_MGMT",
        title: `چرخه عمر مشتریان — غالب: ${LIFECYCLE_FA[dominant[0]]} (${dominant[1]})`,
        body: `توزیع مراحل: ${Object.entries(sc).filter(([, n]) => n > 0).map(([k, n]) => `${LIFECYCLE_FA[k as keyof typeof LIFECYCLE_FA]} ${n}`).join("، ")}. مشتریان «آماده معامله» (${sc.READY_TO_DEAL}) با تطبیق قوی و جدیت بالا، نزدیک‌ترین افراد به درآمد شما هستند؛ «جدی»ها (${sc.SERIOUS}) با پیگیری منظم به این سطح می‌رسند و «راکد»ها (${sc.DORMANT}) نیاز به کمپین بازگشت دارند.`,
        severity: sc.READY_TO_DEAL > 0 ? "positive" : sc.DORMANT > s.totalCustomers / 3 ? "warning" : "info",
        metrics: [
          { label: "جدید", value: String(sc.NEW) },
          { label: "در تعامل", value: String(sc.ENGAGED) },
          { label: "جدی", value: String(sc.SERIOUS) },
          { label: "آماده معامله", value: String(sc.READY_TO_DEAL) },
          { label: "راکد", value: String(sc.DORMANT) },
        ],
      });

      // ===== دامنه NEXT_ACTION — اقدام بعدی (شاهکار) =====
      const urgent = summary.customers.flatMap((c) => c.nextActions.filter((a) => a.priority === 1).map((a) => ({ c, a })));
      cards.push({
        key: "next-action",
        domain: "NEXT_ACTION",
        title: urgent.length > 0 ? `${urgent.length} اقدام فوری در صف اقدام بعدی` : "اقدام بعدی — همه‌چیز در جریان است",
        body:
          urgent.length > 0
            ? `مهم‌ترین اقدام‌های امروز: ${urgent.slice(0, 3).map((x) => `«${x.c.name}»: ${x.a.title}`).join("؛ ")}. اقدام بعدی هر مشتری را از اولویت شرایطش استنتاج می‌کنم: بی‌تماسی، تطبیق موجود، ناقص‌بودن پرونده یا راکدشدن — و دقیقاً می‌گویم با کدام کلید (ثبت رویداد/ویرایش/ثبت در آرم) انجامش دهید.`
            : "هیچ اقدام فوری (اولویت ۱) در صف نیست — پیگیری نرم ادامه دارد و هر تماس/بازدید را با «ثبت رویداد» مستند کنید تا اولویت‌ها به‌روز بمانند.",
        severity: urgent.length > 0 ? "warning" : "positive",
        metrics: [
          { label: "اقدام فوری", value: String(urgent.length) },
          { label: "مشتریان با اقدام", value: String(summary.customers.filter((c) => c.nextActions.length > 0).length) },
        ],
      });

      // ===== دامنه MATCH — تطبیق درخواست↔آگهی (شاهکار) =====
      const allMatches = summary.customers.flatMap((c) => c.bestMatches);
      const strong = allMatches.filter((m) => m.score >= 70);
      cards.push({
        key: "match-engine",
        domain: "MATCH",
        title:
          allMatches.length === 0
            ? "موتور تطبیق درخواست↔آگهی آماده است"
            : `${allMatches.length} تطبیق فعال — ${strong.length} تطبیق قوی (۷۰٪+)`,
        body:
          allMatches.length === 0
            ? "موتور تطبیق من (عین «آگهی‌های پیشنهادی» سامانه آرم) هر درخواست را با آگهی‌های دفتر آگهی می‌سنجد: منطقه (۳۰)، نوع معامله (۲۰)، نوع ملک (۱۵)، بازه قیمت (۲۰) و بازه متراژ (۱۵). برای فعال‌شدن، درخواست‌ها را کامل کنید (بازه قیمت/متراژ مهم است) و آگهی‌های دفتر را ثبت نگه دارید."
            : `بهترین فرصت‌ها: ${strong.slice(0, 3).map((m) => `«${m.listingTitle}» با تطبیق ${m.score}٪ (${m.band})`).join("؛ ")}. هر تطبیق قوی + جدیت بالا = «آماده معامله» و پیشنهاد هماهنگی بازدید. تطبیق‌ها را در پنل «مدیریت مشتریان» با تفکیک کامل امتیاز ببینید.`,
        severity: strong.length > 0 ? "positive" : "info",
        metrics: [
          { label: "تطبیق فعال", value: String(allMatches.length) },
          { label: "قوی (۷۰+)", value: String(strong.length) },
          { label: "مشتریان با تطبیق", value: String(summary.customers.filter((c) => c.bestMatches.length > 0).length) },
        ],
      });

      // ===== دامنه CHURN — هشدار ریزش =====
      const overdue = summary.customers.filter((c) => (c.daysSinceInteraction ?? 999) > 14 && c.stage !== "CONVERTED");
      const highValue = overdue.filter((c) => c.healthScore >= 50 || c.segment === "A");
      cards.push({
        key: "churn-alert",
        domain: "CHURN",
        title: overdue.length > 0 ? `${overdue.length} مشتری بیش از ۱۴ روز بی‌تماس` : "هشدار ریزش — همه در تماس",
        body:
          overdue.length > 0
            ? `ریزش‌پذیرترین‌ها: ${overdue.slice(0, 3).map((c) => `«${c.name}» (${c.daysSinceInteraction} روز، سلامت ${c.healthScore}٪)`).join("، ")}${highValue.length > 0 ? ` — ${highValue.length} مورد از این‌ها ارزش بالا دارند و از دست دادنشان پرهزینه است.` : "."} برای هر مورد، امروز یک رویداد «تماس» ثبت کنید.`
            : "هیچ مشتری فعالی بیش از دو هفته بی‌تعامل نیست — ریتم پیگیری سالم است.",
        severity: overdue.length > 0 ? (highValue.length > 0 ? "critical" : "warning") : "positive",
        metrics: [
          { label: "بی‌تماس +۱۴ روز", value: String(overdue.length) },
          { label: "ارزش بالا", value: String(highValue.length) },
        ],
      });
    }

    // ===== دامنه EVENT_MGMT — رویدادها =====
    const events = await db.requestEventRecord.findMany({ orderBy: { createdAt: "desc" }, take: 500 }).catch(() => []);
    if (events.length > 0) {
      const weekAgo = Date.now() - 7 * 86400_000;
      const thisWeek = events.filter((e) => e.createdAt.getTime() >= weekAgo).length;
      const synced = events.filter((e) => Boolean(e.armEventId)).length;
      const typeCounts = new Map<string, number>();
      for (const e of events) typeCounts.set(e.eventTypeName, (typeCounts.get(e.eventTypeName) ?? 0) + 1);
      const topType = [...typeCounts.entries()].sort((a, b) => b[1] - a[1])[0];
      cards.push({
        key: "events-overview",
        domain: "EVENT_MGMT",
        title: `رویدادها — ${events.length} رویداد ثبت‌شده (${thisWeek} در هفتهٔ اخیر)`,
        body: `پرتکرارترین نوع: «${topType[0]}» با ${topType[1]} مورد. ${synced} رویداد با سامانه آرم همگام شده است. رویدادها حافظهٔ تعامل من هستند: امتیاز سلامت، چرخه عمر و اقدام بعدی هر مشتری مستقیماً از همین رویدادها تغذیه می‌شوند — هیچ تماس/بازدید/پیامی را بدون ثبت رویداد از دست ندهید.`,
        severity: thisWeek > 0 ? "positive" : "warning",
        metrics: [
          { label: "کل", value: String(events.length) },
          { label: "این هفته", value: String(thisWeek) },
          { label: "همگام آرم", value: String(synced) },
        ],
      });
    }

    // ===== دامنه ARM_SYNC — ثبت در سامانه آرم =====
    if (total > 0) {
      const failed = requests.filter((r) => {
        if (!r.armRegistrationJson) return false;
        try {
          return Boolean((JSON.parse(r.armRegistrationJson) as { failed?: boolean }).failed);
        } catch {
          return false;
        }
      }).length;
      const readyNotRegistered = requests.filter((r) => !r.armRequestId && r.status === "ready").length;
      cards.push({
        key: "arm-sync",
        domain: "ARM_SYNC",
        title: `ثبت در سامانه آرم — ${armRegistered} موفق${failed > 0 ? `، ${failed} ناموفق` : ""}${readyNotRegistered > 0 ? `، ${readyNotRegistered} آمادهٔ ثبت` : ""}`,
        body:
          failed > 0
            ? `${failed} ثبت با خطا روبه‌رو شده — گزارش گام‌به‌گام در دیالوگ «ثبت در سامانه ARM» موجود است؛ علت معمول، نبود توکن (ورود با کد پرسنلی + پیامک) یا قطعی موقت سامانه آرم است. ${readyNotRegistered > 0 ? `${readyNotRegistered} درخواست کامل در صف ثبت است.` : ""}`
            : `همهٔ ثبت‌ها موفق بوده‌اند. ${readyNotRegistered > 0 ? `${readyNotRegistered} درخواست کاملِ ثبت‌نشده در صف است — با کلید «ثبت در سامانه ARM»، ثبت گام‌به‌گام (جستجو/ایجاد مشتری ← شناسه‌ها ← ثبت نهایی عین کاربر عادی) انجام می‌شود.` : "درخواست تازه‌ای در صف ثبت نیست."}`,
        severity: failed > 0 ? "warning" : "positive",
        metrics: [
          { label: "ثبت‌شده در آرم", value: String(armRegistered) },
          { label: "ناموفق", value: String(failed) },
          { label: "آمادهٔ ثبت", value: String(readyNotRegistered) },
        ],
      });
    }

    return cards;
  }
}

export const requestAgent = new RequestAgent();
