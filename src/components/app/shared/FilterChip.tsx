"use client";

/**
 * چیپ فیلتر یکدست — PN-009 مرحله B (زبان طراحی مشترک M1/M2/M3/M4)
 * ----------------------------------------------------------------
 * همهٔ فیلترهای چندانتخابی از همین پریمیتیو استفاده می‌کنند:
 *   · رنگ از رجیستری value-colors (منبع یگانه — قانون ۱۲ دستور)
 *   · حالت‌ها: عادی / هاور / فعال / فوکوس / غیرفعال در Light و Dark
 *   · فشرده: h-7 + text-[11px] (کاهش ارتفاع غیرضروری — بند ۶ دستور)
 *   · دسترس‌پذیری: aria-pressed + focus-visible ring (بند ۱۷ دستور)
 */

export interface FilterChipProps {
  label: string;
  active: boolean;
  onToggle: () => void;
  /** کلاس رنگ ملایم (حالت غیرفعال) — از رجیستری value-colors */
  softClass: string;
  /** کلاس رنگ پررنگ (حالت فعال) — از رجیستری value-colors */
  solidClass: string;
  /** راهنمای اشاره‌گر */
  title?: string;
  disabled?: boolean;
  id?: string;
}

export function FilterChip({ label, active, onToggle, softClass, solidClass, title, disabled, id }: FilterChipProps) {
  return (
    <button
      id={id}
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      title={title}
      disabled={disabled}
      className={`h-7 inline-flex items-center rounded-full border px-2.5 text-[11px] font-bold sec-motion focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:opacity-40 disabled:pointer-events-none ${
        active
          ? `${solidClass} ring-2 ring-offset-1 ring-offset-background ring-current`
          : `${softClass} opacity-80 hover:opacity-100`
      }`}
    >
      {active ? <span aria-hidden>✓ </span> : null}
      {label}
    </button>
  );
}
