"use client";

/**
 * theme-transition.ts — تعویض نرم تم ۳۰۰ms (قانون ظاهر فاخر ۰۳۵-B — بخش ج-۲)
 * --------------------------------------------------------------------------
 * next-themes به‌صورت پیش‌فرض transition را هنگام تعویض خاموش می‌کند تا
 * «محو شدن همه‌چیز» رخ ندهد؛ ما فقط برای پنجرهٔ ۳۵۰ms کلاس theme-transition
 * روی <html> می‌گذاریم (قانون: انتقال نرم ۳۰۰ms) و سپس پاک می‌کنیم.
 */


export function switchThemeSoft(next: "light" | "dark" | "system", setTheme: (t: "light" | "dark" | "system") => void): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) {
    setTheme(next);
    return;
  }
  root.classList.add("theme-transition");
  setTheme(next);
  window.setTimeout(() => root.classList.remove("theme-transition"), 380);
}
