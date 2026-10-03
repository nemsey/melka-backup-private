import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { getBuildWitness } from "@/lib/build-witness";
import "./globals.css";

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
      <body className="antialiased bg-background text-foreground min-h-screen">
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
