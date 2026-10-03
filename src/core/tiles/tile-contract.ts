import type { LucideIcon } from "lucide-react";

/**
 * قرارداد «کاشی» (Tile Contract)
 * ------------------------------------------------------
 * هر کاشی یک ماژول خودکفاست که این قرارداد را پیاده می‌کند.
 * افزودن کاشی جدید = افزودن یک ماژول که `defineTile()` را صدا می‌زند؛
 * هسته، رجیستری و بقیه کاشی‌ها بدون هیچ تغییری کار می‌کنند.
 * حذف/تعویض کاشی نیز فقط با حذف import آن ماژول انجام می‌شود.
 */

import type { ComponentType } from "react";

export type TileSettingType = "switch" | "select" | "number" | "text";

export interface TileSettingDefinition {
  key: string;
  label: string;
  type: TileSettingType;
  hint?: string;
  options?: { value: string; label: string }[];
  defaultValue: string | number | boolean;
  min?: number;
  max?: number;
}

/** ویژگی‌های صفحه کاشی که هسته به آن تزریق می‌کند */
export interface TilePageProps {
  /** مقادیر فعلی تنظیمات اختصاصی همین کاشی (نگهداری‌شده در فضای خود کاشی) */
  settings: Record<string, string | number | boolean>;
  /** اعمال تغییر تنظیمات اختصاصی */
  onSettingsChange: (patch: Record<string, string | number | boolean>) => void;
  /** نقش کاربر جاری */
  userRole: "OWNER" | "CONSULTANT";
  /** بازگشت به خانه داشبورد */
  onBack: () => void;
}

/** اتصال ایجنت هوشمند کاشی — null برای کاشی‌های بدون ایجنت (مثل تنظیمات) */
export interface TileAgentBinding {
  /** شناسه کاشی که ایجنت به آن متصل است (ایزوله‌سازی حافظه) */
  tileId: string;
  /** کلیدهای بینش که این ایجنت تولید می‌کند */
  insightDomains: readonly string[];
  /** نشان یادگیری فعال */
  capabilities: readonly ("memory" | "feedback" | "policy-versions" | "rollback")[];
}

export interface TileDefinition {
  /** شناسه یکتا و پایدار (برای ذخیره تنظیمات و ایزوله‌سازی ایجنت) */
  id: string;
  version: string;
  title: string;
  /** هدف کسب‌وکاری یک‌خطی */
  tagline: string;
  description: string;
  /** کامپوننت آیکون کاشی (lucide) */
  icon: LucideIcon;
  /** رنگ هویتی بخش — پالت ۱۳ بخش ملکا (گام صفر P6530 — قاعده ۱؛ SECTION_ACCENTS در TileCard) */
  accent:
    | "login" | "home" | "finder" | "melka-listing" | "melka-request" | "settings"
    | "mgmt" | "m1" | "m2" | "m3" | "m4" | "m5" | "m6" | "m7" | "m8" | "consultant" | "ai";
  /** کامپوننت صفحه داخلی کاشی */
  component: ComponentType<TilePageProps>;
  /** تعریف تنظیمات اختصاصی — در همان کاشی نگهداری می‌شود */
  settings: TileSettingDefinition[];
  /** اتصال ایجنت هوشمند */
  agent: TileAgentBinding | null;
  /** حداقل نقش لازم برای نمایش */
  minRole?: "OWNER";
  /** ترتیب پیش‌فرض نمایش */
  order: number;
  /** شناسه کاشی ظرف (در صورت تعیین، این کاشی در صفحه خانه مستقیم نمایش داده نمی‌شود
   *  و درون کاشی ظرف — مانند «داشبورد مدیریتی» — قرار می‌گیرد) */
  container?: string;
}

/** سازنده تعریف کاشی — اعتبارسنجی ساختاری انجام می‌دهد */
export function defineTile(def: TileDefinition): TileDefinition {
  if (!def.id || !/^[a-z][a-z0-9-]*$/.test(def.id)) {
    throw new Error(`شناسه کاشی نامعتبر است: ${def.id} (الگوی مجاز: حروف کوچک و خط تیره)`);
  }
  if (!def.title || !def.component) {
    throw new Error(`کاشی ${def.id} بدون عنوان یا کامپوننت است.`);
  }
  if (def.agent && def.agent.tileId !== def.id) {
    throw new Error(`اتصال ایجنت کاشی ${def.id} به کاشی دیگری (${def.agent.tileId}) اشاره می‌کند.`);
  }
  if (def.container === def.id) {
    throw new Error(`کاشی ${def.id} نمی‌تواند ظرف خودش باشد.`);
  }
  return def;
}
