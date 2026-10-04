"use client";

/**
 * useTileData — هوک مشترک بارگذاری داده کاشی‌های گزارش CRM (P1-01)
 * ------------------------------------------------------
 * جایگزین بویلرپلیت تکراری ۸ صفحه (state + fetch + toast خطا + reload).
 *
 * قرارداد رفتاری (عین کد قبلی صفحات — بدون تغییر):
 *   • loading از true آغاز می‌شود؛ در پایان هر اجرا (موفق یا خطا) false می‌شود.
 *   • خطا → toast مخرب با errorTitle + description پیام خطا.
 *   • خطا → داده با errorValue تبدیل می‌شود (پیش‌فرض: دست‌نخورده می‌ماند —
 *     سبک قراردادها/مالی/شاخص/باشگاه؛ صفحات «ریست‌شونده» مثل معاملات/کارشناسان/
 *     عرضه‌وتقاضا/بازدیدها تبدیل اختصاصی می‌دهند تا rows خالی شود).
 *   • تغییر هویت fetcher (useCallback با وابستگی‌های فیلتر) → واکشی مجدد خودکار.
 *   • reload() → واکشی مجدد دستی (دکمه «بازخوانی»).
 *
 * ⚠️ الزام: fetcher حتماً با useCallback ساخته شود؛ در غیر این صورت هر رندر
 *    باعث واکشی مجدد می‌شود (همان ریسک الگوی دستی قبلی).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useToast } from "@/hooks/use-toast";
import { ApiClientError } from "@/lib/client/api";

export interface UseTileDataOptions<T> {
  /** عنوان toast هنگام خطا */
  errorTitle: string;
  /** تبدیل داده پس از خطا — پیش‌فرض: داده دست‌نخورده می‌ماند */
  errorValue?: (prev: T | null) => T | null;
}

export interface UseTileDataResult<T> {
  data: T | null;
  loading: boolean;
  reload: () => void;
  setData: Dispatch<SetStateAction<T | null>>;
}

export function useTileData<T>(fetcher: () => Promise<T>, opts: UseTileDataOptions<T>): UseTileDataResult<T> {
  const { toast } = useToast();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  // مراجع همیشه تازه — تابع run پایدار می‌ماند و fetcher جدید بدون بازسازی run اجرا می‌شود
  const fetcherRef = useRef(fetcher);
  const errorTitleRef = useRef(opts.errorTitle);
  const errorValueRef = useRef(opts.errorValue);
  const toastRef = useRef(toast);
  fetcherRef.current = fetcher;
  errorTitleRef.current = opts.errorTitle;
  errorValueRef.current = opts.errorValue;
  toastRef.current = toast;

  const run = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetcherRef.current();
      setData(res);
    } catch (err) {
      const e = err as ApiClientError;
      toastRef.current({ title: errorTitleRef.current, description: e.message, variant: "destructive" });
      const transform = errorValueRef.current;
      if (transform) setData((prev) => transform(prev));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void run();
  }, [run, tick, fetcher]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  return { data, loading, reload, setData };
}
