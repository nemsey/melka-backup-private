import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* فایل Service Worker و HTML ریشه هرگز کش نشوند تا به‌روزرسانی‌ها بلافاصله اعمال شوند
     (لایه CDN دامنه عمومی، پاسخ‌ها را با کلید مسیر کش می‌کند) */
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/sw-v3.js",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },
  typescript: {
    // PHASE 1 / P1-04: تایپ‌چک کامل فعال — صفر خطای tsc در کل پروژه
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
};

export default nextConfig;
