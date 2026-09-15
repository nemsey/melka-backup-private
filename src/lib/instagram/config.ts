/**
 * پیکربندی اتصال اینستاگرام — Instagram Graph API (حساب کسب‌وکار)
 * ------------------------------------------------------
 * جریان رسمی: حساب اینستاگرام باید از نوع Business/Creator باشد و
 * به یک صفحه فیسبوک متصل شود؛ توکن دسترسی از پنل توسعه‌دهندگان فیسبوک
 * (System User / Graph API Explorer) صادر و اینجا ثبت می‌شود.
 */

/** نسخه Graph API */
export const IG_GRAPH_VERSION = "v21.0";

/** میزبان رسمی Instagram Graph API */
export const IG_GRAPH_BASE = "https://graph.instagram.com";

/** میزبان جایگزین (فیسبوک) — برای برخی اعتبارنامه‌ها */
export const IG_GRAPH_BASE_FB = "https://graph.facebook.com";

/** محدودیت‌های رسمی انتشار */
export const IG_LIMITS = {
  /** حداکثر تعداد تصاویر یک پست (کروسل) */
  maxImagesPerPost: 10,
  /** حداکثر ۹۰ ثانیه برای رییلز عمومی؛ محافظ کار‌آمد */
  maxReelDurationSec: 90,
  /** حداکثر طول کپشن */
  maxCaptionLength: 2200,
  /** حداکثر تعداد هشتگ توصیه‌شده */
  maxHashtags: 30,
} as const;

/** لحن‌های مولد محتوا */
export const IG_TONES = [
  { value: "professional", label: "رسمی و حرفه‌ای" },
  { value: "warm", label: "صمیمی و پرانرژی" },
  { value: "urgent", label: "فوری و فرصت‌محور" },
] as const;

export type IgTone = (typeof IG_TONES)[number]["value"];

/** راهنمای گام‌به‌گام اخذ توکن — در تنظیمات نمایش داده می‌شود */
export const IG_TOKEN_GUIDE_STEPS = [
  "حساب اینستاگرام باید از نوع «کسب‌وکار» یا «خالق» باشد؛ از تنظیمات خود اینستاگرام (Account type) بررسی/تغییر دهید.",
  "حساب اینستاگرام را به یک صفحه فیسبوک متصل کنید (Settings ← Business/Creator ← Connect Facebook Page).",
  "در پنل توسعه‌دهندگان فیسبوک (developers.facebook.com) یک اپ ساخته یا از Graph API Explorer استفاده کنید.",
  "مجوزهای instagram_basic و instagram_content_publish را به توکن بدهید.",
  "شناسه IG User ID خود را از مسیر graph.instagram.com/me?fields=username با همان توکن بگیرد (بخش «شناسه» همین فرم).",
  "توکن و شناسه را در همین بخش وارد و «ذخیره و آزمون» بزنید — چراغ اتصال اینستاگرام در صفحه خانه سبز می‌شود.",
] as const;

export interface InstagramSettings {
  /** پیش‌فرض لحن محتوا */
  defaultTone: IgTone;
  /** افزودن شماره تماس دفتر به کپشن */
  includeContactInCaption: boolean;
  /** شماره تماس/آیدی جهت تماس */
  contactLine: string;
}

export const IG_DEFAULT_SETTINGS: InstagramSettings = {
  defaultTone: "professional",
  includeContactInCaption: true,
  contactLine: "",
};
