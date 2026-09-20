/**
 * ماژول کاشی ادغامی «معاملات و قراردادهای ملک تبریز» — P6.5-11 (بند پ)
 * ------------------------------------------------------
 * ادغام سه کاشی قبلی (معاملات + قراردادها و اسناد + مالی و کمیسیون) در یک کاشی:
 *   · تب معاملات: فهرست معاملات با ستون‌های جدید (نام/موبایل مالک بعد از کد ملک،
 *     نام/موبایل درخواست‌دهنده بعد از کد درخواست، متن قرارداد، تجمیع حق‌السهم مشاوران)
 *   · تب قراردادها و اسناد: صورت وضعیت‌های ۹ مرحله‌ای + جزئیات + تاریخ‌ها
 *   · تب مالی و کمیسیون: محاسبه‌گر تعرفه اتحادیه + تجمیع حق‌السهم مشاوران و شعبه‌ها
 * همهٔ بخش‌ها شامل اطلاعات تمامی معاملات/قراردادها/اسناد/مالی «تمامی کارشناسان ملک تبریز».
 * ایجنت هوشمند: ۲۱ دامنهٔ بینش (الزام بند پ-۶: حداقل ۱۵) + بینش‌های مهاجرت‌یافتهٔ بازدیدها.
 * شناسه کاشی‌های قبلی در تنظیمات/حافظهٔ ایجنت‌ها ماندگار است (نکتهٔ ۲ — حفاظت داده).
 */

import { defineTile } from "@/core/tiles/tile-contract";
import { tileRegistry } from "@/core/tiles/tile-registry";
import { FileCheck2 } from "lucide-react";
import { TransactionsContractsPage } from "./TransactionsContractsPage";

export const transactionsContractsTile = defineTile({
  id: "transactions-contracts",
  version: "1.0.0",
  title: "معاملات و قراردادهای ملک تبریز",
  tagline: "معاملات، قراردادها و اسناد و مالی و کمیسیون تمامی کارشناسان ملک تبریز در یک کاشی واحد",
  description:
    "ادغام کامل سه بخش: گزارش تطابق معاملات (با نام و موبایل مالک و درخواست‌دهنده، متن قرارداد و تجمیع حق‌السهم مشاوران در فهرست) + صورت وضعیت‌های ۹ مرحله‌ای قراردادها و اسناد + محاسبه‌گر کمیسیون تعرفه اتحادیه و تجمیع حق‌السهم مشاوران و شعبه‌ها — شامل اطلاعات تمامی کارشناسان ملک تبریز با ایجنت هوشمند ۲۱ بینشی.",
  icon: FileCheck2,
  accent: "emerald",
  component: TransactionsContractsPage,
  order: 1,
  container: "management-dashboard",
  agent: {
    tileId: "transactions-contracts",
    insightDomains: [
      "VOLUME", "TREND", "COMPOSITION", "CONVERSION", "DOCUMENT", "ANOMALY",
      "FUNNEL", "BOTTLENECK", "STALLED", "REJECT",
      "TARIFF", "REVENUE", "SETTLEMENT", "BRANCH", "PIPELINE",
      "CONTACT_COVERAGE", "CONTRACT_TEXT", "SHARE_AGGREGATE",
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
      hint: "نمودار روند ماهانه (هجری شمسی) و ترکیب تطبیق در تب معاملات",
    },
    {
      key: "defaultStatus",
      label: "وضعیت پیش‌فرض فیلتر قراردادها",
      type: "select",
      defaultValue: "all",
      options: [
        { value: "all", label: "همه وضعیت‌ها" },
        { value: "rejected", label: "رد / فسخ‌شده‌ها" },
        { value: "waitingForFinance", label: "در انتظار تایید مالی" },
        { value: "waitingForDocument", label: "در انتظار تنظیم سند" },
      ],
      hint: "وضعیت پیش‌فرض نمایش لیست قراردادها هنگام ورود به تب قراردادها",
    },
    {
      key: "showFunnel",
      label: "نمایش نمودار قیفی قراردادها",
      type: "switch",
      defaultValue: true,
      hint: "نمودار قیف چرخه عمر قراردادها از پیش‌نویس تا تنظیم سند",
    },
  ],
});

tileRegistry.register(transactionsContractsTile);
