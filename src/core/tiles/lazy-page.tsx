"use client";

/**
 * lazy-page.tsx — بارگذاری تنبل صفحات کاشی (قانون ظاهر فاخر ۰۳۵-B — بخش ح: عملکرد ادراکی)
 * ---------------------------------------------------------------------------
 * مشکل: bootstrap همهٔ کاشی‌ها را import می‌کرد ⇒ چانک اولیهٔ ۱٫۳MB (LCP ۵s).
 * درمان: هر صفحهٔ کاشی React.lazy شود — فقط کاشیِ باز شده بارگذاری می‌شود؛
 * اسکلتون طراحی‌شده (نه اسپینر) حین بارگذاری (بخش ج/۴ + ح).
 */
import { lazy, Suspense, type ComponentType } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { TilePageProps } from "./tile-contract";

function TilePageSkeleton() {
  return (
    <div className="space-y-4" role="status" aria-label="در حال بارگذاری بخش">
      <Skeleton className="h-24 rounded-xl" />
      <Skeleton className="h-44 rounded-xl" />
      <Skeleton className="h-44 rounded-xl" />
      <span className="sr-only">در حال بارگذاری…</span>
    </div>
  );
}

export function lazyPage(load: () => Promise<{ default: ComponentType<TilePageProps> }>): ComponentType<TilePageProps> {
  const C = lazy(load);
  const W: ComponentType<TilePageProps> = (p) => (
    <Suspense fallback={<TilePageSkeleton />}>
      <C {...p} />
    </Suspense>
  );
  W.displayName = "LazyTilePage";
  return W;
}
