/**
 * ماژول کاشی «معاملات ملک تبریز» — P6.5-12
 * ------------------------------------------------------
 * تک‌نمای فهرست معاملات (دستور مرحلهٔ قبل + دستور ۱۴۰۵/۰۷/۰۱):
 *   · ستون‌ها: ردیف · تاریخ · کد ملک (مالک+موبایل تو در تو) · درخواست
 *     (درخواست‌دهنده+موبایل تو در تو) · نوع قرارداد · شماره هولوگرام ·
 *     مبلغ قرارداد (جداکنندهٔ «،») · فایل قرارداد (PDF تولیدی از دادهٔ واقعی) ·
 *     تجمیع حق‌السهم مشاوران با درصد هر مشاور
 *   · فیلترها بالای فهرست: تاریخ + کدها + هولوگرام + نام کارشناس + کد پرسنلی + نوع قرارداد
 *   · تب‌های «قراردادها و اسناد» و «مالی و کمیسیون» حذف شدند — دادهٔ آنها در پایگاه
 *     ماندگار است (نکتهٔ ۲ — حذف نما ≠ حذف داده)
 * شناسه کاشی (transactions-contracts) در تنظیمات/حافظهٔ ایجنت ماندگار است.
 */

import { defineTile } from "@/core/tiles/tile-contract";
// P6549/۰۳۵-B-ح: بارگذاری تنبل صفحهٔ کاشی (چانک اولیه سبک می‌شود)
import { lazyPage } from "@/core/tiles/lazy-page";
import { tileRegistry } from "@/core/tiles/tile-registry";
import { FileCheck2 } from "lucide-react";

export const transactionsContractsTile = defineTile({
  id: "transactions-contracts",
  version: "1.1.0",
  title: "معاملات", // PN-038/۲.۴ — نام کوتاه
  tagline: "M3 — فهرست معاملات تمامی کارشناسان ملک تبریز با فایل قرارداد، مبلغ و حق‌السهم مشاوران",
  description:
    "فهرست تک‌صفحه‌ای معاملات با ستون‌های کامل: کد ملک با نام و موبایل مالک، درخواست با نام و موبایل درخواست‌دهنده، نوع قرارداد، شماره هولوگرام، مبلغ قرارداد با جداکنندهٔ «،»، فایل قرارداد (سند PDF تولیدی از داده‌های واقعی سامانه‌های ملک تبریز) و تجمیع حق‌السهم مشاوران با درصد هر مشاور — شامل اطلاعات تمامی کارشناسان ملک تبریز با ایجنت هوشمند مولتی‌بینش.",
  icon: FileCheck2,
  accent: "m3",
  component: lazyPage(() => import("./TransactionsContractsPage")),
  order: 4, // M3 — ترتیب درون ظرف tenant-dashboards: معاملات سومِ داشبورد (PN-043/فاز ۲)
  container: "tenant-dashboards", // PN-043/فاز ۲ (شورا-ن۰۸۷): از هوم ریشه به داشبوردهای tenant — wrapper، نه تکرار
  agent: {
    tileId: "transactions-contracts",
    // P6526/پ — عین ایجنت واقعی (P6.5-14: INFO_COVERAGE جای CONTACT_COVERAGE نشست؛
    // TOP_EXPERTS تازه آمد؛ COMPOSITION/CONVERSION حذف شدند) — قرارداد کاشی ↔ ایجنت یکسان
    insightDomains: [
      "VOLUME", "TREND", "DOCUMENT", "ANOMALY", "TOP_EXPERTS", "INFO_COVERAGE",
      "FUNNEL", "BOTTLENECK", "STALLED", "REJECT",
      "TARIFF", "REVENUE", "SETTLEMENT", "BRANCH", "PIPELINE",
      "SHARE_AGGREGATE",
      "VISIT_VOLUME", "VISIT_TREND", "VISIT_STATUS",
    ],
    capabilities: ["memory", "feedback", "policy-versions", "rollback"],
  },
  settings: [
    {
      key: "sortBy",
      label: "مرتب‌سازی پیش‌فرض جدول معاملات",
      type: "select",
      defaultValue: "contractDate",
      options: [
        { value: "contractDate", label: "تاریخ معامله" },
        { value: "eventsCount", label: "تعداد رویداد" },
        { value: "suggestedPropertyCount", label: "تعداد آگهی پیشنهادی" },
      ],
      hint: "ترتیب پیش‌فرض نمایش ردیف‌های فهرست معاملات",
    },
    {
      key: "showCharts",
      label: "نمایش نمودارها",
      type: "switch",
      defaultValue: true,
      hint: "نمودار روند ماهانه (هجری شمسی) و ترکیب تطبیق در بالای فهرست معاملات",
    },
  ],
});

tileRegistry.register(transactionsContractsTile);
