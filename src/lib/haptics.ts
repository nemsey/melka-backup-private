/**
 * haptics.ts — بازخورد لرزشی (قانون ظاهر فاخر ۰۳۵-B — بخش ج/۱۰)
 * ------------------------------------------------------------
 * اگر API موجود نباشد (دسکتاپ/مرورگرهای بدون پشتیبانی) بی‌صدا هیچ‌کاری نمی‌کند.
 * الگوهای استاندارد: tap (کلیک) · success · error · warning
 */

type Pattern = "tap" | "light" | "success" | "error" | "warning";

const PATTERNS: Record<Pattern, number | number[]> = {
  tap: 8,
  light: 15,
  success: [12, 40, 18],
  error: [28, 40, 28],
  warning: [18, 30, 18],
};

export function haptic(pattern: Pattern = "tap"): void {
  try {
    if (typeof navigator === "undefined") return;
    const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
    if (typeof nav.vibrate !== "function") return;
    nav.vibrate(PATTERNS[pattern]);
  } catch {
    /* بی‌صدا — بازخورد لرزشی هرگز جریان اصلی را نمی‌شکند */
  }
}
