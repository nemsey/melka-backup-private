"use client";

/**
 * usePullToRefresh — کشیدن برای تازه‌سازی (قانون ظاهر فاخر ۰۳۵-B — بخش ج/۸)
 * ---------------------------------------------------------------------
 * • فقط لمسی: وقتی اسکرول صفحه در صفر است و کاربر به پایین می‌کشد،
 *   نشانگر ظاهر می‌شود؛ پس از عبور از آستانه (۶۴px) با رهاکردن، تازه‌سازی اجرا می‌شود.
 * • احترام به prefers-reduced-motion (بدون فنر/انیمیشن).
 * • لرزش haptic در لحظهٔ فعال‌شدن.
 * استفاده: const { ptrRef, ptrPulling } = usePullToRefresh(() => reload());
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { haptic } from "@/lib/haptics";

const THRESHOLD = 64;
const MAX_PULL = 104;

export function usePullToRefresh(onRefresh: () => void | Promise<void>) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const armed = useRef(false);
  const refreshFn = useRef(onRefresh);
  refreshFn.current = onRefresh;

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const touchCapable = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    if (!touchCapable) return;

    const onStart = (e: TouchEvent) => {
      if (window.scrollY > 0 || refreshing) { startY.current = null; return; }
      startY.current = e.touches[0].clientY;
      armed.current = false;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current === null || refreshing) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0) { setPull(0); return; }
      // اگر صفحه خودش اسکرول می‌شود (محتوای قابل اسکرول) مزاحم نمی‌شویم
      if (window.scrollY > 0) { startY.current = null; setPull(0); return; }
      const eased = Math.min(MAX_PULL, dy * 0.5);
      setPull(eased);
      if (!armed.current && eased >= THRESHOLD) {
        armed.current = true;
        if (!reduce) haptic("light");
      }
    };
    const onEnd = async () => {
      if (startY.current === null) return;
      startY.current = null;
      if (armed.current && !refreshing) {
        armed.current = false;
        setRefreshing(true);
        setPull(THRESHOLD);
        try { await refreshFn.current(); } finally { setRefreshing(false); setPull(0); }
      } else {
        setPull(0);
      }
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
    };
  }, [refreshing]);

  const indicator = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = indicator.current;
    if (el) {
      el.style.setProperty("--ptr-pull", `${pull}px`);
      el.style.setProperty("--ptr-progress", String(Math.min(1, pull / THRESHOLD)));
      el.style.opacity = pull > 0 || refreshing ? "1" : "0";
    }
  }, [pull, refreshing]);

  const ptrRef = useCallback((node: HTMLDivElement | null) => { indicator.current = node; }, []);

  return { ptrRef, pull, refreshing, ready: pull >= THRESHOLD };
}

/** نشانگر بصاری PTR — رندر در بالای فهرست */
export function PtrIndicator({ innerRef, spinning }: { innerRef: (n: HTMLDivElement | null) => void; spinning: boolean }) {
  return (
    <div
      ref={innerRef}
      aria-hidden
      className="ptr-indicator pointer-events-none fixed top-14 inset-x-0 z-30 flex justify-center"
    >
      <div className="ptr-spinner size-9 rounded-full border-2 border-primary/25 border-t-primary bg-card shadow-md" />
      <span className="sr-only">{spinning ? "در حال تازه‌سازی" : "برای تازه‌سازی بکشید"}</span>
    </div>
  );
}
