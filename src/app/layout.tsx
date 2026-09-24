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
  title: "داشبورد هوشمند ملک تبریز",
  description:
    "لایه هوش تحلیلی و مدیریتی روی سامانه CRM ملک تبریز — داشبورد چندعامله با ایجنت‌های یادگیرنده برای معاملات و کارشناسان.",
  applicationName: "داشبورد ملک تبریز",
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon.svg",
    apple: "/icons/icon-192.png",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "app-build-id": buildWitness.buildId,
    "app-git-sha": buildWitness.gitSha,
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
