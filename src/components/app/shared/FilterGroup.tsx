"use client";

import type { ReactNode } from "react";

/**
 * گروه فیلتر برچسب‌دار — PN-009 مرحله B (قانون ۶.۱ دستور: Grouping منطقی)
 * ----------------------------------------------------------------
 * فیلترهای طولانی به گروه‌های هم‌خانواده تقسیم می‌شوند تا در Desktop
 * ساختار منطقی داشته باشند و در Mobile پس از باز شدن آکاردئون، مرور
 * سریع ممکن باشد. عنوان گروه همیشه با متن (نه فقط رنگ) معلوم است (بند ۱۷).
 */

export interface FilterGroupProps {
  /** عنوان گروه — نمایش داده می‌شود و برای aria-label هم استفاده می‌شود */
  label: string;
  /** متن کمکی کنار عنوان (مثلاً «۳ حالت انتخاب شده») */
  hint?: ReactNode;
  /** اکشن ردیف عنوان (مثلاً دکمهٔ پاک کردن همین گروه) */
  action?: ReactNode;
  children: ReactNode;
  id?: string;
  className?: string;
}

export function FilterGroup({ label, hint, action, children, id, className }: FilterGroupProps) {
  return (
    <section className={`space-y-1.5 ${className ?? ""}`} aria-label={label} id={id}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-bold text-foreground/80">{label}</span>
        {hint ? <span className="text-[10px] text-muted-foreground">{hint}</span> : null}
        {action}
      </div>
      {children}
    </section>
  );
}
