"use client";

/**
 * DataSourceInfo — شفافیت منبع داده صفحات گزارش CRM (P1-01)
 * ------------------------------------------------------
 * ادغام ۴ تعریف مستقل رابط + دو الگوی رندر تکراری در ۸ صفحه:
 *
 *   • DataSourceWarning — سبک معاملات/کارشناسان: کارت کهربایی «استخراج زنده در
 *     دسترس نیست» + خط ریز «آخرین استخراج موفق» (فقط وقتی کش فعال است).
 *   • DataSourceAlert  — سبک شش صفحه دیگر: Alert «منبع داده» با متن اختصاصی هر
 *     صفحه + خطای زنده یا پیام راهنمای ورود.
 */

import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, Database } from "lucide-react";
import { faJalaliShort } from "@/lib/format";

/** شکل استاندارد بلوک dataSource در پاسخ APIهای CRM — جایگزین ۴ تعریف تکراری */
export interface DataSourceInfo {
  real: boolean;
  cached: boolean;
  lastSuccessAt?: string | null;
  lastSyncedAt?: string | null;
  liveError?: string | null;
  syncAttempts?: number;
}

export interface DataSourceWarningProps {
  source: DataSourceInfo | null;
  /** پیام حالت کش‌شده (نمایش داده‌های آخرین استخراج موفق) */
  cachedText?: string;
  /** پیام حالت بدون هیچ داده استخراج‌شده */
  emptyText?: string;
}

/**
 * هشدار کهربایی قطع استخراج زنده + خط «آخرین استخراج موفق»
 * (عین مارک‌آپ قبلی TransactionsPage/ExpertsPage — بدون تغییر DOM)
 */
export function DataSourceWarning({
  source,
  cachedText = "در حال حاضر داده‌های کش‌شده از آخرین استخراج موفق نمایش داده می‌شود.",
  emptyText = "هنوز هیچ داده‌ای از سامانه ملک تبریز استخراج نشده است.",
}: DataSourceWarningProps) {
  if (!source) return null;
  return (
    <>
      {source.liveError ? (
        <Card className="border-amber-300/60 bg-amber-50/60 dark:bg-amber-950/30">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden />
            <div className="text-xs leading-relaxed space-y-1">
              <p className="font-bold">استخراج زنده از سامانه ملک تبریز در دسترس نیست</p>
              <p className="text-muted-foreground">
                {source.cached ? cachedText : emptyText} {source.liveError}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}
      {source.cached && !source.liveError ? (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Database className="w-3.5 h-3.5" aria-hidden />
          آخرین استخراج موفق از سامانه ملک تبریز: {source.lastSuccessAt ? faJalaliShort(source.lastSuccessAt) : "—"}
        </div>
      ) : null}
    </>
  );
}

export interface DataSourceAlertProps {
  /** شرط نمایش Alert (مثلاً «منبع زنده نیست») */
  show: boolean;
  /** خطای زنده — در صورت وجود، « آخرین خطا: …» نمایش داده می‌شود */
  error?: string | null;
  /** متن جایگزین وقتی خطا نیست — با یک فاصله آغازین به children می‌چسبد */
  fallback?: string;
  children?: ReactNode;
}

/**
 * Alert «منبع داده» — عین مارک‌آپ قبلی شش صفحه CRM (بدون تغییر DOM)
 */
export function DataSourceAlert({ show, error, fallback, children }: DataSourceAlertProps) {
  if (!show) return null;
  return (
    <Alert>
      <Database aria-hidden />
      <AlertTitle>منبع داده</AlertTitle>
      <AlertDescription>
        {children}
        {error ? ` آخرین خطا: ${error}` : fallback ? ` ${fallback}` : null}
      </AlertDescription>
    </Alert>
  );
}
