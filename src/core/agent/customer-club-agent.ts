/**
 * ایجنت هوشمند کاشی «باشگاه مشتریان»
 * ------------------------------------------------------
 * تخصص: تحلیل جامعه مشتریان ملک تبریز — تلفیق معاملات، قراردادها و
 * مشاوران: حجم جامعه، مشتریان تکراری (خریدار و فروشنده همزمان)،
 * رشد زمانی جامعه، ارزش وفادارسازی و شناخت عمیق مخاطب — با
 * یادگیری از بازخورد مدیر.
 */

import { db } from "@/lib/db";
import { BaseLearningAgent, type InsightCard } from "./base-agent";
import { buildCustomerClub, customerGrowthSeries, topCustomers, type CustomerAppearance } from "@/lib/melk-api/customer-club";
import { faNumber, faPercent, faMonthLabel } from "@/lib/format";

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export class CustomerClubAgent extends BaseLearningAgent {
  readonly tileId = "customer-club";
  readonly name = "ایجنت تحلیل باشگاه مشتریان";
  readonly insightDomains = ["COMMUNITY", "REPEAT", "GROWTH", "LOYALTY", "CATALOG"] as const;

  protected async computeRawInsights(): Promise<InsightCard[]> {
    const cards: InsightCard[] = [];

    // فهرست‌های مرجع (شخصیت/شغل/نقش/جدیت) — عمومی و زنده
    const refRows = await db.refListCache.findMany({
      where: { key: { in: ["user-characters", "user-jobs", "user-roles", "user-seriousness"] } },
    });
    const catalogCounts: Record<string, number> = {};
    for (const r of refRows) {
      const items = parseJson<{ name: string }[]>(r.dataJson, []);
      catalogCounts[r.key] = items.length;
    }
    const hasCatalog = Object.keys(catalogCounts).length > 0;
    if (hasCatalog) {
      cards.push({
        key: "club-catalog",
        domain: "CATALOG",
        title: "فهرست‌های مرجع مشتریان (زنده از سامانه ARM)",
        body: `چارچوب رسمی شناخت مشتری سامانه ملک تبریز: ${faNumber(catalogCounts["user-characters"] ?? 0)} شخصیت، ${faNumber(catalogCounts["user-jobs"] ?? 0)} شغل، ${faNumber(catalogCounts["user-roles"] ?? 0)} نقش و ${faNumber(catalogCounts["user-seriousness"] ?? 0)} سطح جدیت. با ثبت این ویژگی‌ها در پرونده مشتریان، امکان شخصی‌سازی خدمات و بخش‌بندی دقیق مخاطبان فراهم می‌شود.`,
        severity: "info",
        metrics: [
          { label: "شخصیت‌ها", value: faNumber(catalogCounts["user-characters"] ?? 0) },
          { label: "مشاغل", value: faNumber(catalogCounts["user-jobs"] ?? 0) },
          { label: "نقش‌ها", value: faNumber(catalogCounts["user-roles"] ?? 0) },
          { label: "سطوح جدیت", value: faNumber(catalogCounts["user-seriousness"] ?? 0) },
        ],
      });
    }

    // حضورهای واقعی
    const appearances: CustomerAppearance[] = [];
    const txs = await db.transactionRecord.findMany();
    for (const t of txs) {
      if (t.propertyCustomer) appearances.push({ name: t.propertyCustomer, role: "SELLER", date: t.contractDate.toISOString() });
      if (t.requestCustomer) appearances.push({ name: t.requestCustomer, role: "BUYER", date: t.contractDate.toISOString() });
    }
    const contracts = await db.contractRecord.findMany();
    for (const c of contracts) {
      const date = c.contractDate?.toISOString() ?? c.createdAt?.toISOString() ?? null;
      for (const b of parseJson<{ fullName: string; mobileNumber: string }[]>(c.buyerListJson, [])) {
        appearances.push({ name: b.fullName, role: "BUYER", date, mobile: b.mobileNumber });
      }
      for (const s of parseJson<{ fullName: string; mobileNumber: string }[]>(c.sellerListJson, [])) {
        appearances.push({ name: s.fullName, role: "SELLER", date, mobile: s.mobileNumber });
      }
    }
    const experts = await db.expertRecord.findMany();
    for (const e of experts) {
      appearances.push({ name: e.fullName, role: "EXPERT", date: e.createdAt.toISOString(), mobile: e.mobile });
    }

    if (appearances.length === 0) return cards;

    const members = buildCustomerClub(appearances);
    const total = members.length;
    const buyers = members.filter((m) => m.roles.includes("BUYER"));
    const sellers = members.filter((m) => m.roles.includes("SELLER"));
    const repeat = members.filter((m) => m.repeat);

    // ---- COMMUNITY: حجم جامعه ----
    cards.push({
      key: "club-community",
      domain: "COMMUNITY",
      title: "جامعه مشتریان ملک تبریز",
      body: `بر پایه معاملات و قراردادهای ثبت‌شده، ${faNumber(total)} شخصیت یکتا شناسایی شده است: ${faNumber(buyers.length)} خریدار، ${faNumber(sellers.length)} فروشنده و ${faNumber(experts.length)} مشاور حرفه‌ای. این جامعه، مخاطب مستقیم برنامه‌های بازاریابی و وفادارسازی است.`,
      severity: "info",
      metrics: [
        { label: "اعضای یکتا", value: faNumber(total) },
        { label: "خریداران", value: faNumber(buyers.length) },
        { label: "فروشندگان", value: faNumber(sellers.length) },
        { label: "مشاوران", value: faNumber(experts.length) },
      ],
    });

    // ---- REPEAT: مشتریان تکراری ----
    if (repeat.length > 0) {
      const topRepeat = topCustomers(repeat, 3);
      cards.push({
        key: "club-repeat",
        domain: "REPEAT",
        title: "مشتریان تکراری (خریدار و فروشنده همزمان)",
        body: `${faNumber(repeat.length)} نفر (${faPercent(Math.round((repeat.length / total) * 100))}) هم به‌عنوان خریدار و هم فروشنده در معاملات ظاهر شده‌اند — از جمله ${topRepeat.map((m) => `${m.name} (${faNumber(m.buyerCount + m.sellerCount)} حضور)`).join("، ")}. این گروه با اعتماد بالا، بهترین گزینه برای معرفی خدمات جدید و برنامه وفادارسازی است.`,
        severity: "positive",
        metrics: [
          { label: "مشتریان دوطرفه", value: faNumber(repeat.length) },
          { label: "سهم از جامعه", value: faPercent(Math.round((repeat.length / total) * 100)) },
        ],
      });
    }

    // ---- GROWTH: رشد زمانی ----
    const series = customerGrowthSeries(members);
    if (series.length >= 2) {
      const last = series[series.length - 1];
      const prev = series[series.length - 2];
      const growth = prev.count > 0 ? Math.round(((last.count - prev.count) / prev.count) * 100) : 100;
      cards.push({
        key: "club-growth",
        domain: "GROWTH",
        title: "رشد ماهانه جامعه مشتریان",
        body: `${faNumber(last.count)} مشتری جدید در ${faMonthLabel(last.key)} نسبت به ${faNumber(prev.count)} مورد در ${faMonthLabel(prev.key)} — ${growth >= 0 ? `رشد ${faPercent(growth)}` : `کاهش ${faPercent(Math.abs(growth))}`}. ${growth < -20 ? "کاهش معنادار ورود مشتریان جدید؛ فعال‌سازی کانال‌های جذب توصیه می‌شود." : "جمعیت در حال رشد است؛ حفظ کیفیت پاسخ‌گویی اهمیت دارد."}`,
        severity: growth <= -20 ? "warning" : growth >= 20 ? "positive" : "info",
        metrics: [
          { label: "مشتریان جدید ماه اخیر", value: faNumber(last.count) },
          { label: "رشد ماهانه", value: `${faNumber(growth)}٪` },
        ],
      });
    }

    // ---- LOYALTY: ارزش وفادارسازی ----
    const top = topCustomers(members, 5).filter((m) => m.buyerCount + m.sellerCount >= 2);
    if (top.length > 0) {
      cards.push({
        key: "club-loyalty",
        domain: "LOYALTY",
        title: "پرکارترین مشتریان — اولویت برنامه وفادارسازی",
        body: `پر تکرارترین اعضا: ${top.map((m) => `${m.name} (${faNumber(m.buyerCount + m.sellerCount)} حضور)`).join("، ")}. تماس دوره‌ای و پیشنهاد اختصاصی برای این گروه، بالاترین بازگشت سرمایه بازاریابی را دارد.`,
        severity: "info",
        metrics: top.slice(0, 3).map((m) => ({ label: m.name, value: `${faNumber(m.buyerCount + m.sellerCount)} حضور` })),
      });
    }

    return cards;
  }
}

export const customerClubAgent = new CustomerClubAgent();
