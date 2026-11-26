"use client";

/**
 * AreaLineFilter — DIR-MULTI-AREA-001 · فیلتر چندانتخابی مناطق و محله‌ها (گام اول)
 * ---------------------------------------------------------------------------
 * DIR-OWNER-4STEPS-001 (گام سوم · دستور مالک ۱۴۰۵/۰۹/۰۵): «در فیلتر فهرست‌های
 * چهارگانه بخش جستجوی مناطق و محله‌ها دقیقاً همانند و منطبق با بخش مناطق در ثبت
 * آگهی جدید در سامانه ARM باشد» — این کامپوننت اکنون پوششی روی «ArmRegionPicker»
 * است (همان کامپوننت تنظیمات ایجنت فایل‌یابی): دو دراپ‌داون وابسته «منطقه ←
 * محله‌های همان منطقه» عین بخش مناطق ثبت آگهی آرم، با سبد انباشته و چیپ‌های
 * قابل حذف.
 *
 * · منبع گزینه‌ها عین رجیستری سامانه ARM ملک تبریز است (TABRIZ_AREAS:
 *   ۱۳۰ منطقه × ۹۲۶ محله با شناسه‌های رسمی آرم) — هیچ نامی خارج از رجیستری
 *   قابل انتخاب نیست ⇒ خروجی همیشه «منطبق بر سامانه مبدأ» است.
 * · قرارداد بیرونی حفظ شد (نام‌ها، نه شناسه‌ها): نام‌های آرم در دیتابیس محلی
 *   عین نام‌های رجیستری‌اند (هر دو از خود سامانه ARM) ⇒ تطبیق دقیق سمت سرور.
 * · نام تکراری محله بین مناطق فقط یک‌بار (چند شناسه به یک نام فرومی‌شکند).
 */

import { ArmRegionPicker, type ArmRegionSelection } from "./arm-region-picker";
import { TABRIZ_AREAS, ALL_LINES } from "@/lib/divar/tabriz-locations";

export interface AreaLineSelection {
  /** نام مناطق انتخابی (عین نام رسمی آرم) — هر منطقه یعنی همهٔ محله‌هایش */
  areas: string[];
  /** نام محله‌های انتخابی (عین نام رسمی آرم) */
  lines: string[];
}

interface AreaLineFilterProps {
  idPrefix: string;
  /** انتخاب جاری */
  selection: AreaLineSelection;
  /** تغییر انتخاب — همیشه آرایه‌های مرتب و بدون تکرار */
  onChange: (next: AreaLineSelection) => void;
}

/** نام → شناسه‌های رجیستری (نام محله ممکن است در چند منطقه تکرار باشد) */
const AREA_ID_BY_NAME = new Map(TABRIZ_AREAS.map((a) => [a.n, a.id] as const));
const AREA_NAME_BY_ID = new Map(TABRIZ_AREAS.map((a) => [a.id, a.n] as const));
const LINE_IDS_BY_NAME = new Map<string, string[]>();
for (const l of ALL_LINES) {
  const arr = LINE_IDS_BY_NAME.get(l.n) ?? [];
  arr.push(l.id);
  LINE_IDS_BY_NAME.set(l.n, arr);
}

export function AreaLineFilter({ idPrefix, selection, onChange }: AreaLineFilterProps) {
  /** نام‌ها → شناسه‌های رجیستری (ورودی سازگارِ قرارداد نامی قبلی) */
  const idSelection: ArmRegionSelection = {
    areaIds: selection.areas.flatMap((n) => {
      const id = AREA_ID_BY_NAME.get(n);
      return id ? [id] : [];
    }),
    lineIds: [...new Set(selection.lines.flatMap((n) => LINE_IDS_BY_NAME.get(n) ?? []))],
  };

  /** شناسه‌ها → نام‌ها (خروجی همان قرارداد نامی — بدون تکرار نام) */
  const fromIds = (next: ArmRegionSelection): AreaLineSelection => ({
    areas: next.areaIds.flatMap((id) => {
      const n = AREA_NAME_BY_ID.get(id);
      return n ? [n] : [];
    }),
    lines: [...new Set(next.lineIds.flatMap((id) => {
      const line = ALL_LINES.find((l) => l.id === id);
      return line ? [line.n] : [];
    }))],
  });

  return <ArmRegionPicker idPrefix={idPrefix} selection={idSelection} onChange={(next) => onChange(fromIds(next))} />;
}
