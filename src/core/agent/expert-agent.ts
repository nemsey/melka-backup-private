/**
 * ایجنت هوشمند کاشی «کارشناسان»
 * ------------------------------------------------------
 * تخصص: رتبه‌بندی عملکرد کارشناسان، تشخیص افت فعالیت،
 * بخش‌بندی (top/mid/low) و شاخص تمرکز تیم — با یادگیری از بازخورد.
 */

import { db } from "@/lib/db";
import { BaseLearningAgent, type InsightCard } from "./base-agent";
import {
  concentrationIndex,
  droppedExperts,
  expertPerformance,
  expertStats,
  topByCount,
} from "./analyzers";
import { toman } from "./transaction-agent";

export class ExpertAgent extends BaseLearningAgent {
  readonly tileId = "experts";
  readonly name = "ایجنت تحلیل کارشناسان";
  readonly insightDomains = ["RANKING", "ACTIVITY", "SEGMENT", "RISK", "CAPACITY"] as const;

  protected async computeRawInsights(): Promise<InsightCard[]> {
    const [experts, txs] = await Promise.all([db.expertRecord.findMany(), db.transactionRecord.findMany()]);
    const cards: InsightCard[] = [];
    if (experts.length === 0) return cards;

    const perfs = expertPerformance(txs, experts);
    const stats = expertStats(txs);
    const activeExperts = experts.filter((e) => e.active);

    // ---- RANKING: رتبه‌بندی ----
    const top5 = topByCount(stats, 5);
    if (top5.length > 0) {
      cards.push({
        key: "ex-ranking",
        domain: "RANKING",
        title: "رتبه‌بندی عملکرد کارشناسان",
        body: `بر اساس تعداد معاملات، «${top5[0].expertName}» با ${top5[0].dealCount.toLocaleString("fa-IR")} معامله صدرنشین است. رتبه‌بندی کامل در جدول پایین همین کاشی قابل مشاهده است.`,
        severity: "info",
        metrics: top5.map((s, i) => ({
          label: `رتبه ${(i + 1).toLocaleString("fa-IR")}`,
          value: `${s.expertName} — ${s.dealCount.toLocaleString("fa-IR")} معامله (${toman(s.totalValue)})`,
        })),
      });
    }

    // ---- ACTIVITY: راکدها ----
    const inactiveWithHistory = perfs.filter((p) => p.dealCount > 0 && p.recentDeals === 0);
    const neverDealt = perfs.filter((p) => p.dealCount === 0);
    if (inactiveWithHistory.length > 0 || neverDealt.length > 0) {
      cards.push({
        key: "ex-activity",
        domain: "ACTIVITY",
        title: "کارشناسان بدون معامله در ۹۰ روز گذشته",
        body: `${inactiveWithHistory.length.toLocaleString("fa-IR")} کارشناس با سابقه‌ی معامله و ${neverDealt.length.toLocaleString("fa-IR")} کارشناس بدون هیچ معامله‌ای در ۹۰ روز اخیر شناسایی شدند. پیشنهاد: جلسه‌ی بازخورد فردی و تعیین هدف هفتگی برای بازگشت به چرخه فروش.`,
        severity: inactiveWithHistory.length > 0 ? "warning" : "info",
        metrics: [
          { label: "دارای سابقه، بدون فعالیت اخیر", value: inactiveWithHistory.length.toLocaleString("fa-IR") },
          { label: "بدون هیچ معامله", value: neverDealt.length.toLocaleString("fa-IR") },
        ],
      });
    }

    // ---- SEGMENT: بخش‌بندی ----
    const segCount = { top: 0, mid: 0, low: 0, inactive: 0 };
    for (const p of perfs) segCount[p.segment] += 1;
    cards.push({
      key: "ex-segment",
      domain: "SEGMENT",
      title: "بخش‌بندی تیم فروش",
      body: `تیم از ${segCount.top.toLocaleString("fa-IR")} کارشناس «پیشتاز»، ${segCount.mid.toLocaleString("fa-IR")} «پایدار»، ${segCount.low.toLocaleString("fa-IR")} «کم‌فعالیت» و ${segCount.inactive.toLocaleString("fa-IR")} «راکد» تشکیل شده است. تمرکز آموزش و انگیزش باید متفاوت برای هر بخش باشد.`,
      severity: "info",
      metrics: [
        { label: "پیشتاز", value: segCount.top.toLocaleString("fa-IR") },
        { label: "پایدار", value: segCount.mid.toLocaleString("fa-IR") },
        { label: "کم‌فعالیت", value: segCount.low.toLocaleString("fa-IR") },
        { label: "راکد", value: segCount.inactive.toLocaleString("fa-IR") },
      ],
    });

    // ---- RISK: افت شدید ----
    const dropped = droppedExperts(perfs);
    if (dropped.length > 0) {
      cards.push({
        key: "ex-risk",
        domain: "RISK",
        title: "هشدار افت عملکرد",
        body: `${dropped.length.toLocaleString("fa-IR")} کارشناس که پیش‌تر فعال بودند، فعالیت ۹۰ روزه‌شان به کمتر از یک‌سوم روند شخصی‌شان رسیده است: ${dropped.slice(0, 3).map((d) => d.fullName).join("، ")}${dropped.length > 3 ? " و…" : ""}. احتمال خروج یا فرسودگی شغلی — گفتگوی فردی توصیه می‌شود.`,
        severity: "critical",
        metrics: dropped.slice(0, 3).map((d) => ({ label: d.fullName, value: `آخرین معامله: ${d.lastDealAt ? new Date(d.lastDealAt).toLocaleDateString("fa-IR") : "—"}‎` })),
      });
    }

    // ---- CAPACITY: تمرکز ----
    const conc = concentrationIndex(stats, 5);
    cards.push({
      key: "ex-capacity",
      domain: "CAPACITY",
      title: "شاخص تمرکز درآمد",
      body: `۵ نفر برتر، ${conc.toLocaleString("fa-IR")}٪ از کل ارزش معاملات را ایجاد کرده‌اند. ${conc > 40 ? "وابستگی بالای درآمد به افراد محدود ریسک سازمانی است — توسعه‌ی تیم دوم توصیه می‌شود." : "توزیع درآمد در تیم متوازن است."}`,
      severity: conc > 40 ? "warning" : "positive",
      metrics: [
        { label: "سهم ۵ نفر برتر", value: `${conc.toLocaleString("fa-IR")}٪` },
        { label: "کارشناسان فعال", value: activeExperts.length.toLocaleString("fa-IR") },
      ],
    });

    return cards;
  }
}

export const expertAgent = new ExpertAgent();
