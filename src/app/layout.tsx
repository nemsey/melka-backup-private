import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { getBuildWitness } from "@/lib/build-witness";
import "./globals.css";

/* ═══════════════════════════════════════════════════════════════════════════
 * PN-014/C2 — بهبود LCP: پیش‌بارگذاری فونت + CSS حیاتی درون‌خطی اسپلش بوت
 * ---------------------------------------------------------------------------
 * دو مانع آخرِ «نخستین رنگ» روی مسیر / برطرف می‌شود:
 *   ۱) فونت وزیرمتن با @font-face از دل CSS کشف می‌شد (زنجیرهٔ: دانلود CSS →
 *      پارس → کشف فونت → دانلود). preload فونت عربی ۴۰۰ (متن) و ۸۰۰ (تیتر
 *      LCP «ملکا») موازی با CSS آغاز می‌شود.
 *   ۲) تا رسیدن CSS بیرونی، صفحهٔ سفید می‌ماند. استایل درون‌خطیِ حیاتی زیر
 *      همان اسپلشِ سرورِ ازپیش‌رندرشده را بی‌درنگ رنگ می‌کند (مرجع انتخابگر:
 *      data-melka-boot روی MelkaApp — پایدار در برابر تغییر کلاس‌های Tailwind).
 * مقادیر رنگ عین متغیرهای تم روشنِ globals.css هستند (روشن = پیش‌فرض رسمی)؛
 * پس از رسیدن CSS کامل، Tailwind حکم را به‌طور کامل به دست می‌گیرد.
 * ═══════════════════════════════════════════════════════════════════════════ */
const CRITICAL_BOOT_CSS = `
html{background:oklch(.978 .005 190)}
[data-melka-boot]{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:oklch(.978 .005 190);font-family:Vazirmatn,system-ui,sans-serif}
[data-melka-boot] [role="status"]{display:flex;flex-direction:column;align-items:center;gap:12px}
[data-melka-boot] h1{margin:0;font-size:1.5rem;line-height:2rem;font-weight:800;color:oklch(.51 .095 194)}
[data-melka-boot] p{margin:0;font-size:14px;color:oklch(.5 .025 200)}
[data-melka-boot] p+p{font-size:12px;color:oklch(.5 .025 200/.8)}
[data-melka-boot] .melka-boot-logo{width:64px;height:64px;border-radius:16px;display:flex;align-items:center;justify-content:center;background:linear-gradient(135deg,#0d9488,#14b8a6,#06b6d4);box-shadow:0 20px 25px -5px oklch(.51 .095 194/.25)}
[data-melka-boot] .melka-boot-logo svg{width:32px;height:32px;color:#fff;animation:melka-critical-spin 1s linear infinite}
@keyframes melka-critical-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){[data-melka-boot] .melka-boot-logo svg{animation:none}}
`;

/* P6519 — شاهد نسخه در HTML خام: curl -s <لینک> | grep app-build-id
 * بدون لاگین و بدون اجرای JS قابل راستی‌آزمایی است (metadata سمت سرور رندر می‌شود).
 * در production مقادیر پخته‌شدهٔ همان بیلد؛ در dev مقدار زندهٔ dev-… */
const buildWitness = getBuildWitness();

export const metadata: Metadata = {
  // P6547/گام صفر-۲ — نام رسمی اپلیکیشن: «اکوسیستم هوشمند ملک ایران» · نام اختصاری: «ملکا»
  title: "اکوسیستم هوشمند ملک ایران (ملکا)",
  description:
    "اکوسیستم هوشمند ملک ایران — ملکا: لایه هوش تحلیلی و مدیریتی روی سامانه‌های ملک تبریز — داشبورد چندعامله با ایجنت‌های یادگیرنده برای معاملات و کارشناسان.",
  applicationName: "ملکا — اکوسیستم هوشمند ملک ایران",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon.svg",
    apple: "/icons/icon-192.png",
  },
  // P6525 — ثالثاً: نصب اپلیکیشن (PWA) روی لینک publish — متاتگ‌های iOS/Apple
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ملکا",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "app-build-id": buildWitness.buildId,
    "app-git-sha": buildWitness.gitSha,
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#007776" },
    { media: "(prefers-color-scheme: dark)", color: "#142122" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <head>
        {/* PN-014/C2 — پیش‌بارگذاری فونت‌های LCP: متن (۴۰۰) و تیتر «ملکا» (۸۰۰) —
            موازی با CSS، نه پس از کشف @font-face · crossorigin الزامی چون fetch فونت در حالت CORS است */}
        <link rel="preload" href="/fonts/Vazirmatn-arabic-400.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/Vazirmatn-arabic-800.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        {/* PN-014/C2 — CSS حیاتی درون‌خطی: رنگ نخست اسپلش بدون انتظار CSS بیرونی */}
        <style id="melka-critical-boot" dangerouslySetInnerHTML={{ __html: CRITICAL_BOOT_CSS }} />
      </head>
      <body className="antialiased bg-background text-foreground min-h-screen">
        {/* قانون ۰۳۵-B/ج-۲: روشن پیش‌فرض + احترام به prefers-color-scheme (گزینهٔ «سیستم») */}
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
