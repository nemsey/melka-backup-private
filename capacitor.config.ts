import type { CapacitorConfig } from "@capacitor/cli";

/**
 * پیکربندی Capacitor — داشبورد هوشمند ملک تبریز
 * راهنمای کامل: docs/BUILD-ANDROID.md
 *
 * نکته: برای حالت BFF کامل (مسیرهای /api)، پروژه وب را روی هاست امن مستقر کنید
 * و server.url را به آن آدرس تغییر دهید؛ appId را نیز پیش از انتشار استور
 * به شناسه رسمی (ir.melketabriz.dashboard) تغییر دهید.
 */
const config: CapacitorConfig = {
  appId: "ir.melketabriz.dashboard",
  appName: "داشبورد ملک تبریز",
  webDir: "public",
  server: {
    androidScheme: "https",
    // در صورت استقرار BFF روی هاست، فعال کنید:
    // url: "https://dashboard.melketabriz.ir",
    // cleartext: false,
  },
  android: {
    allowMixedContent: false,
    backgroundColor: "#15946a",
  },
};

export default config;
