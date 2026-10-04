"use client";

/**
 * KpiCard — کارت شاخص آماری مشترک صفحات گزارش CRM (P1-01)
 * ------------------------------------------------------
 * استخراج‌شده از الگوی تکرارشده در ۸ صفحه CRM — بدون هیچ تغییر DOM.
 *
 * دو سبک ظرف آیکون (عین مارک‌آپ قبلی صفحات):
 *   • iconAs="div"  — سبک قدیمی معاملات/کارشناسان: پس‌زمینه روی div + رنگ روی خود آیکون
 *   • iconAs="span" — سبک آرایه‌ای (شش صفحه دیگر): tone کامل روی span، آیکون بی‌رنگ
 *
 * قرارداد مقدار:
 *   • value === undefined → اسکلتون تپنده (بارگذاری)
 *   • value (رشته یا عدد از پیش قالب‌بندی‌شده) → عین رندر قبلی
 */

import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export interface KpiCardProps {
  /** برچسب شاخص (خط خاکستری ریز) */
  label: string;
  /** مقدار نمایشی — undefined یعنی «در حال بارگذاری» (اسکلتون) */
  value?: string | number;
  icon: LucideIcon;
  /** کلاس‌های ظرف آیکون — سبک div: فقط پس‌زمینه (مثل «bg-primary/10»)؛ سبک span: tone کامل */
  iconWrapperClassName: string;
  /** کلاس رنگ خود آیکون — فقط سبک div (مثل «text-primary») */
  iconColorClassName?: string;
  /** عنصر ظرف آیکون — پیش‌فرض span */
  iconAs?: "div" | "span";
  /** کلاس اضافی Card (مثل «border-border/60») */
  cardClassName?: string;
  /** کلاس جایگزین خط مقدار (مثل «text-lg truncate») — پایه: «text-xl font-extrabold tabular-nums» */
  valueClassName?: string;
  /** کلاس جایگزین برچسب — پایه: «text-xs text-muted-foreground» */
  labelClassName?: string;
  /** زیرنویس ریز زیر مقدار (سبک شاخص قیمت) */
  sub?: string;
}

export function KpiCard({
  label,
  value,
  icon: Icon,
  iconWrapperClassName,
  iconColorClassName,
  iconAs = "span",
  cardClassName,
  valueClassName,
  labelClassName,
  sub,
}: KpiCardProps) {
  const wrapperClass =
    iconAs === "div"
      ? `w-10 h-10 rounded-xl ${iconWrapperClassName} flex items-center justify-center shrink-0`
      : `w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconWrapperClassName}`;
  const Wrapper = iconAs;
  return (
    <Card className={cardClassName}>
      <CardContent className="p-4 flex items-center gap-3">
        <Wrapper className={wrapperClass}>
          <Icon className={`w-5 h-5${iconColorClassName ? ` ${iconColorClassName}` : ""}`} aria-hidden />
        </Wrapper>
        <div className="min-w-0">
          <p className={labelClassName ?? "text-xs text-muted-foreground"}>{label}</p>
          <p className={valueClassName ?? "text-xl font-extrabold tabular-nums"}>
            {value === undefined ? (
              <span className="inline-block h-6 w-14 animate-pulse rounded-md bg-accent align-middle" aria-hidden />
            ) : (
              value
            )}
          </p>
          {value !== undefined && sub ? <p className="text-[10px] text-muted-foreground">{sub}</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}
