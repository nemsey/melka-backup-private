/**
 * پیکربندی یکپارچه دیوار — وب عمومی + کنار (رسمی) + ورود پیامکی
 * همه نشانی‌ها با تست زنده واقعی تأیید شده‌اند.
 */

import { DEFAULT_LOCATION_AREA_IDS } from "./tabriz-locations";

function env(key: string, fallback: string): string {
  const v = process.env[key];
  return v && v.trim() ? v.trim() : fallback;
}

export const DIVAR_CONFIG = {
  /** نشانی وب‌سایت دیوار (پل به آگهی) */
  webBase: "https://divar.ir",
  /** API عمومی وب دیوار — بدون احراز هویت (تست‌شده) */
  webApiBase: env("DIVAR_WEB_API_BASE", "https://api.divar.ir"),
  /** API رسمی کنار دیوار — با کلید x-api-key */
  kenarApiBase: env("DIVAR_KENAR_API_BASE", "https://open-api.divar.ir"),
  /** نشانی پنل کنار (راهنمای اخذ کلید) */
  kenarPanelUrl: "https://divar.ir/kenar/",
  /** نشانی مستندات کنار */
  kenarDocsUrl: "https://kenar.divar.dev/",
  /** شناسه شهر تبریز در دیوار (تست‌شده — city_ids=["5"]) */
  tabrizCityId: "5",
  /** نام شهر برای نشانی‌های وب */
  tabrizCitySlug: "tabriz",
  /** مهلت هر درخواست (میلی‌ثانیه) */
  timeoutMs: Number(env("DIVAR_TIMEOUT_MS", "20000")),
  /** حداکثر تلاش مجدد */
  maxRetries: Number(env("DIVAR_MAX_RETRIES", "2")),
} as const;

/** دسته‌های املاک دیوار (فاز اول: همه املاک تبریز) */
export const DIVAR_REAL_ESTATE_CATEGORIES = [
  { value: "apartment-sell", label: "فروش آپارتمان" },
  { value: "house-villa-sell", label: "فروش خانه و ویلا" },
  { value: "plot-old", label: "کلنگی" },
  { value: "presell", label: "پیش‌فروش" },
  { value: "office-sell", label: "فروش اداری" },
  { value: "shop-sell", label: "فروش مغازه" },
  { value: "commercial-sell", label: "فروش تجاری" },
  { value: "industry-agriculture-business-sell", label: "فروش صنعتی/کشاورزی" },
  { value: "apartment-rent", label: "رهن و اجاره آپارتمان" },
  { value: "house-villa-rent", label: "رهن و اجاره خانه و ویلا" },
  { value: "office-rent", label: "رهن و اجاره اداری" },
  { value: "shop-rent", label: "رهن و اجاره مغازه" },
  { value: "commercial-rent", label: "رهن و اجاره تجاری" },
] as const;

export type DivarCategoryValue = (typeof DIVAR_REAL_ESTATE_CATEGORIES)[number]["value"];

/** بازه‌های فیلتر زمانی — بر «زمان واقعی انتشار آگهی» اعمال می‌شوند (نه ترتیب نردبان) */
export const DIVAR_TIME_WINDOWS = [
  { value: "12h", label: "۱۲ ساعت گذشته", hours: 12 },
  { value: "24h", label: "۲۴ ساعت گذشته (یک روز)", hours: 24 },
  { value: "3d", label: "۳ روز گذشته", hours: 72 },
  { value: "7d", label: "۷ روز گذشته (یک هفته)", hours: 168 },
] as const;

export type DivarTimeWindow = (typeof DIVAR_TIME_WINDOWS)[number]["value"];

export function timeWindowHours(v: string): number {
  return DIVAR_TIME_WINDOWS.find((w) => w.value === v)?.hours ?? 24;
}

/** پیش‌فرض‌های تنظیمات ایجنت فایل‌یابی (قابل تغییر از UI کاشی) */
export const DIVAR_DEFAULT_SETTINGS = {
  /** بازه زمانی پیش‌فرض اسکن */
  timeWindow: "24h" as DivarTimeWindow,
  /** دسته‌های فعال اسکن — پیش‌فرض همه فروش‌ها */
  categories: [
    "apartment-sell",
    "house-villa-sell",
    "plot-old",
    "presell",
    "office-sell",
    "shop-sell",
    "commercial-sell",
    "industry-agriculture-business-sell",
  ] as string[],
  /** وزن سه معیار (جمع = ۱۰۰) */
  weightPersonal: 50,
  weightUnderprice: 30,
  weightLocation: 20,
  /** آستانه‌های دسته‌بندی */
  huntThreshold: 70,
  followThreshold: 40,
  /** فاصله اسکن خودکار (دقیقه) — ۰ = خاموش */
  autoScanMinutes: 15,
  /** مناطق انتخابی فیلتر مکان (عین سامانه آرم) — پیش‌فرض: ۱۷ منطقه مالک؛ خالی = همه تبریز */
  areaIds: DEFAULT_LOCATION_AREA_IDS as string[],
  lineIds: [] as string[],
  /** حداکثر صفحه‌های اسکن در هر اجرا برای هر دسته */
  maxScanPages: 3,
  /** حداقل نمونه برای آمار قیمت محله */
  minMarketSample: 4,
  /** ضریب اطمینان وزن قیمت آرم در مرجع ترکیبی (۰ تا ۱) */
  armPriceWeight: 0.35,
} as const;

export type DivarSettings = {
  timeWindow: DivarTimeWindow;
  categories: string[];
  weightPersonal: number;
  weightUnderprice: number;
  weightLocation: number;
  huntThreshold: number;
  followThreshold: number;
  autoScanMinutes: number;
  areaIds: string[];
  lineIds: string[];
  maxScanPages: number;
  minMarketSample: number;
  armPriceWeight: number;
};

/** کلید رمزنگاری اعتبارنامه دیوار (هم‌زنجیره کلید نشست‌های ARM) */
export function divarSecretEnvKey(): string | undefined {
  return process.env.DIVAR_TOKEN_KEY || process.env.MELK_TOKEN_KEY || process.env.MASTER_ACCESS_CODE || "melk-tabriz-fallback-key";
}
