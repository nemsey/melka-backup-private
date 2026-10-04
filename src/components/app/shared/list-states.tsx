"use client";

/**
 * ListStates — حالت‌های کامل فهرست‌ها (قانون ظاهر فاخر ۰۳۵-B — بخش ج/۴)
 * ----------------------------------------------------------------------
 * EmptyState / ErrorState / OfflineState — طراحی‌شده (نه متن خالی):
 * آیکون + عنوان + توضیح + کنش (پاک‌کردن فیلتر / تلاش دوباره / تازه‌سازی).
 */

import type { LucideIcon } from "lucide-react";
import { SearchX, CloudOff, TriangleAlert, RotateCw, FilterX } from "lucide-react";
import { Button } from "@/components/ui/button";

function StateShell({
  icon: Icon,
  title,
  description,
  action,
  tone,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void; icon?: LucideIcon };
  tone: "muted" | "warn" | "danger";
}) {
  const toneClass =
    tone === "warn"
      ? "border-amber-500/30 bg-amber-500/[0.07] text-amber-700 dark:text-amber-300"
      : tone === "danger"
        ? "border-rose-500/30 bg-rose-500/[0.07] text-rose-700 dark:text-rose-300"
        : "border-border bg-muted/40 text-muted-foreground";
  return (
    <div role="status" className="flex flex-col items-center justify-center gap-3 py-12 px-6 text-center">
      <div className={`size-16 rounded-2xl border flex items-center justify-center ${toneClass}`}>
        <Icon className="size-8" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-bold text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground leading-relaxed max-w-xs">{description}</p>
      </div>
      {action ? (
        <Button variant="outline" size="sm" className="gap-2" onClick={action.onClick}>
          {action.icon ? <action.icon className="size-4" aria-hidden /> : null}
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}

/** حالت خالی طراحی‌شده — با کنش پاک‌کردن فیلترها اگر فیلتری فعال است */
export function EmptyState({ hasFilters, onClearFilters }: { hasFilters?: boolean; onClearFilters?: () => void }) {
  return (
    <StateShell
      icon={SearchX}
      tone="muted"
      title="موردی یافت نشد"
      description={
        hasFilters
          ? "هیچ رکوردی با این فیلترها مطابقت ندارد. فیلترها را پاک کنید یا مقادیر را تغییر دهید."
          : "هنوز رکوردی در این فهرست ثبت نشده است. با اولین بروزرسانی داده‌ها اینجا ظاهر می‌شود."
      }
      action={hasFilters && onClearFilters ? { label: "پاک‌کردن فیلترها", onClick: onClearFilters, icon: FilterX } : undefined}
    />
  );
}

/** حالت خطای طراحی‌شده — با کنش تلاش دوباره */
export function ErrorState({ onRetry, detail }: { onRetry?: () => void; detail?: string }) {
  return (
    <StateShell
      icon={TriangleAlert}
      tone="danger"
      title="خطا در دریافت اطلاعات"
      description={detail ?? "اتصال به سرور برقرار نشد. اتصال شبکه را بررسی کنید و دوباره تلاش کنید."}
      action={onRetry ? { label: "تلاش دوباره", onClick: onRetry, icon: RotateCw } : undefined}
    />
  );
}

/** حالت آفلاین طراحی‌شده */
export function OfflineState({ onRetry }: { onRetry?: () => void }) {
  return (
    <StateShell
      icon={CloudOff}
      tone="warn"
      title="آفلاین هستید"
      description="اطلاعات فهرست نیازمند اتصال شبکه است. با بازگشت اتصال، دوباره تلاش کنید."
      action={onRetry ? { label: "تلاش دوباره", onClick: onRetry, icon: RotateCw } : undefined}
    />
  );
}
