/**
 * مولد محتوای اینستاگرام از فایل آگهی — «کپی‌رایتر املاک» ایجنت آگهی
 * ------------------------------------------------------
 * از اطلاعات ۵ گامی فایل، محتوای آمادهٔ انتشار (پست یا رییلز) تولید می‌کند:
 *   - قلاب آغازین بر اساس لحن (رسمی/صمیمی/فوری)
 *   - بلوک مشخصات (نوع ملک، محله، متراژ، اتاق، طبقه، سال ساخت)
 *   - قیمت با قالب خوانای فارسی (میلیارد/میلیون تومان)
 *   - نکات برجسته (لوکس/فوری/زیر قیمت کارشناسی و…)
 *   - فراخوان اقدام + راه تماس
 *   - هشتگ‌های هدفمند (منطقه + نوع ملک + تبریز املاک)
 * کاربر پیش‌نویس را می‌بیند، ویرایش می‌کند و پس از تأیید منتشر می‌شود.
 */

import type { IgTone } from "./config";
import { toLatinDigits } from "@/lib/listing/types";

// ===================== ورودی/خروجی =====================

export interface ContentSource {
  /** نوع ملک — آپارتمان/خانه ویلایی/زمین… */
  propertyTypeName?: string | null;
  /** نوع معامله — فروش/رهن و اجاره… */
  tradeTypeName?: string | null;
  /** کاربری — مسکونی/تجاری… */
  buildingTypeName?: string | null;
  /** محله (خط آرم) */
  lineName?: string | null;
  /** منطقه */
  areaName?: string | null;
  /** فرم پویا: مساحت/اتاق/طبقه/سال ساخت/قیمت… */
  inputs?: Record<string, string>;
  /** قیمت نسبت به کارشناسی — برچسب فارسی */
  priceEvaluationLabel?: string | null;
  /** مطلوبیت */
  desirabilityLabel?: string | null;
  /** دلیل فروش */
  sellReasonLabel?: string | null;
  /** توضیحات مشاوران */
  description?: string | null;
  /** برچسب‌ها */
  isLuxury?: boolean;
  isUrgent?: boolean;
  isVacation?: boolean;
  /** تعداد تصاویر/ویدیوهای موجود */
  imageCount?: number;
  videoCount?: number;
}

export interface GeneratedContent {
  kind: "post" | "reel";
  tone: IgTone;
  caption: string;
  hashtags: string[];
  mediaHint: string;
  reason: string;
}

// ===================== قالب‌بندی قیمت فارسی =====================

/** قالب عدد با جداکننده ممی فارسی — بدون صفرهای اضافی */
function fmtNumber(n: number, maxDecimals: number): string {
  const text = String(Math.round(n * 10 ** maxDecimals) / 10 ** maxDecimals);
  const trimmed = text.replace(/\.?0+$/, (m) => (m.startsWith(".") ? "" : m));
  return trimmed.replace(".", "٫");
}

/** ۳۵۰۰۰۰۴۵۰۰ → «۳٫۵ میلیارد تومان» / «۴۵۰ میلیون تومان» / «۷۵ میلیون تومان» */
export function faPriceText(tomans: number): string {
  const fa = (n: number | string): string => String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
  if (tomans >= 1_000_000_000) {
    const b = tomans / 1_000_000_000;
    const text = fmtNumber(b, 2);
    return `${fa(text)} میلیارد تومان`;
  }
  if (tomans >= 1_000_000) {
    const m = tomans / 1_000_000;
    const text = fmtNumber(m, 1);
    return `${fa(text)} میلیون تومان`;
  }
  if (tomans >= 1000) {
    return `${fa(new Intl.NumberFormat("en-US").format(Math.round(tomans / 1000) * 1000))} تومان`;
  }
  return `${fa(tomans)} تومان`;
}

/** قیمت کل فایل از فرم پویا (کلید «قیمت») */
export function extractPriceToman(inputs?: Record<string, string>): number | null {
  if (!inputs) return null;
  const raw = inputs["قیمت"] ?? inputs["قیمت کل"] ?? inputs["مبلغ"] ?? null;
  if (!raw) return null;
  const digits = toLatinDigits(String(raw)).replace(/[^\d.]/g, "");
  const n = Number(digits);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// ===================== قلاب‌های آغازین بر اساس لحن =====================

function buildHook(source: ContentSource, tone: IgTone): string {
  const property = source.propertyTypeName ?? "ملک";
  const line = source.lineName ?? "";
  const lineText = line ? `در ${line}` : "";
  const urgent = source.isUrgent;

  const faLine = line.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
  const lineTextFa = line ? `در ${faLine}` : "";
  if (tone === "urgent") {
    const urgentLead = urgent ? "⏰ فرصت محدود — فروش فوری!" : "🔥 فرصت کم‌نظیر!";
    return `${urgentLead}\n${property} ${lineTextFa} با شرایط استثنایی وارد بازار شد.`;
  }
  if (tone === "warm") {
    return `✨ یک ${property} ${lineTextFa} که ارزش دیدنش را دارد!\nبه مشخصاتش نگاه کنید:`;
  }
  return `${property} ${lineTextFa}${line ? " — " : ""}معرفی یک فایل ${source.tradeTypeName === "رهن و اجاره" ? "اجاره‌ای" : "فروشی"} از پورتفوی ما:`;
}

// ===================== بلوک مشخصات =====================

function buildSpecsBlock(source: ContentSource): string {
  const lines: string[] = [];
  const inputs = source.inputs ?? {};
  const fa = (s: string): string => s.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);

  if (source.buildingTypeName) lines.push(`🏠 کاربری: ${source.buildingTypeName}`);
  if (inputs["مساحت"]) lines.push(`📐 متراژ: ${fa(inputs["مساحت"])} متر`);
  if (inputs["اتاق"]) lines.push(`🛏 اتاق: ${fa(inputs["اتاق"])}`);
  if (inputs["طبقه"]) lines.push(`🏢 طبقه: ${fa(inputs["طبقه"])}`);
  if (inputs["سال ساخت"]) lines.push(`🏗 سال ساخت: ${fa(inputs["سال ساخت"])}`);
  if (source.areaName) lines.push(`📍 منطقه: ${fa(source.areaName)}`);
  if (source.lineName) lines.push(`🗺 محله: ${fa(source.lineName)}`);

  const price = extractPriceToman(inputs);
  if (price) {
    lines.push(`💰 قیمت: ${faPriceText(price)}`);
  }
  if (source.tradeTypeName === "رهن و اجاره" && inputs["ودیعه (رهن)"] && inputs["اجاره"]) {
    lines.push(`🔑 رهن: ${faPriceText(Number(toLatinDigits(inputs["ودیعه (رهن)"]).replace(/\D/g, "")) || 0)} / اجاره ماهانه: ${fa(inputs["اجاره"])} تومان`);
  }
  return lines.join("\n");
}

// ===================== نکات برجسته =====================

function buildHighlights(source: ContentSource): string[] {
  const highlights: string[] = [];
  if (source.isLuxury) highlights.push("🏆 فایل لوکس — کیفیت ساخت و امکانات درجه‌یک");
  if (source.isUrgent) highlights.push("⚡ فروش فوری — انگیزه بالا برای مذاکره");
  if (source.priceEvaluationLabel?.startsWith("زیر قیمت")) highlights.push("🎯 زیر قیمت کارشناسی — فرصت سرمایه‌گذاری");
  else if (source.priceEvaluationLabel === "قیمت کارشناسی") highlights.push("✅ قیمت منطبق با قیمت کارشناسی منطقه");
  if (source.desirabilityLabel && ["خوب", "عالی"].includes(source.desirabilityLabel)) {
    highlights.push(`💎 مطلوبیت فایل: ${source.desirabilityLabel}`);
  }
  if (source.sellReasonLabel && source.sellReasonLabel !== "—" && source.sellReasonLabel !== "سایر و یا عدم اطلاع") {
    highlights.push(`📌 دلیل فروش: ${source.sellReasonLabel}`);
  }
  return highlights;
}

// ===================== هشتگ‌ها =====================

/** هشتگ‌سازی ایمن — حذف نویسه‌های غیرمجاز */
function safeTag(text: string): string {
  return text
    .replace(/[\s\u200c]+/g, "_")
    .replace(/[^\p{L}\p{N}_]/gu, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export function buildHashtags(source: ContentSource): string[] {
  const tags = new Set<string>();
  const city = "املاک_تبریز";
  tags.add(city);
  tags.add("ملک_تبریز");
  tags.add("خرید_خانه");
  tags.add("مشاور_املاک");

  if (source.lineName) tags.add(safeTag(`${source.lineName}_تبریز`));
  if (source.areaName) tags.add(safeTag(`منطقه_${source.areaName}`));
  if (source.propertyTypeName) tags.add(safeTag(source.propertyTypeName));
  if (source.tradeTypeName === "رهن و اجاره") {
    tags.add(safeTag("رهن_و_اجاره"));
    tags.add(safeTag("اجاره_خانه"));
  } else {
    tags.add(safeTag("خرید_آپارتمان"));
  }
  if (source.isLuxury) tags.add(safeTag("ملک_لوکس"));
  if (source.isUrgent) tags.add(safeTag("فروش_فوری"));

  return [...tags].filter((t) => t.length > 2 && t.length < 40).slice(0, 18);
}

// ===================== مولد اصلی =====================

/** فراخوان اقدام بر اساس لحن */
function buildCta(tone: IgTone, contactLine?: string): string {
  const contact = contactLine?.trim()
    ? `\n📞 جهت هماهنگی بازدید و کسب اطلاعات کامل: ${contactLine.trim()}`
    : "\n📞 جهت بازدید و اطلاعات کامل، دایرکت پیام دهید.";
  if (tone === "urgent") {
    return `⏳ این فایل معمولاً سریع از دست می‌رود؛ همین حالا تماس بگیرید.${contact}`;
  }
  if (tone === "warm") {
    return `👀 دوست دارید از نزدیک ببینید؟ همین‌جا دایرکت بدهید تا بازدید هماهنگ کنیم.${contact}`;
  }
  return `برای دریافت شناسنامه کامل فایل، هماهنگی بازدید و مشاوره تخصصی قیمت با ما در ارتباط باشید.${contact}`;
}

/**
 * تولید محتوای کامل (کپشن + هشتگ) از فایل آگهی
 * kind: reel وقتی ویدیو موجود است، وگرنه post
 */
export function generateInstagramContent(source: ContentSource, tone: IgTone = "professional", contactLine?: string): GeneratedContent {
  const kind: "post" | "reel" = (source.videoCount ?? 0) > 0 ? "reel" : "post";

  const hook = buildHook(source, tone);
  const specs = buildSpecsBlock(source);
  const highlights = buildHighlights(source);
  const cta = buildCta(tone, contactLine);
  const hashtags = buildHashtags(source);

  const sections: string[] = [hook];
  if (specs) sections.push(`📋 مشخصات فایل:\n${specs}`);
  if (highlights.length > 0) sections.push(`✨ نکات کلیدی:\n${highlights.map((h) => `▪ ${h}`).join("\n")}`);

  // گزیدهٔ توضیحات مشاوران (حداکثر دو جمله معنادار)
  const descTrim = (source.description ?? "").trim();
  if (descTrim.length > 10) {
    const firstSentences = descTrim
      .split(/[.۔!\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 12)
      .slice(0, 2)
      .join(". ");
    if (firstSentences) sections.push(`📝 ${firstSentences}${firstSentences.endsWith(".") ? "" : "."}`);
  }

  sections.push(cta);
  sections.push(hashtags.map((h) => `#${h}`).join(" "));

  const caption = sections.filter(Boolean).join("\n\n");

  return {
    kind,
    tone,
    caption,
    hashtags,
    mediaHint:
      kind === "reel"
        ? `ویدیوی فایل (${source.videoCount} ویدیو) به عنوان رییلز منتشر می‌شود؛ تصویر کاور از تصاویر فایل انتخاب می‌شود.`
        : source.imageCount && source.imageCount > 0
          ? `نخستین تصویر فایل (از ${source.imageCount} تصویر) به عنوان تصویر اصلی پست منتشر می‌شود.`
          : "فایل تصویر ندارد — نشانی تصویر را در دیالوگ انتشار وارد کنید.",
    reason:
      kind === "reel"
        ? "چون فایل ویدیو دارد، رییلز بهترین بازدید را می‌گیرد."
        : "فایل ویدیو ندارد؛ پست تصویری با کاور برتر بهترین انتخاب است.",
  };
}

/** بازتولید با لحن دیگر — کپشن همان ساختار، لحن تازه */
export function regenerateWithTone(source: ContentSource, tone: IgTone, contactLine?: string): GeneratedContent {
  return generateInstagramContent(source, tone, contactLine);
}
