/**
 * P6527 — پاسخ JSON فشرده (gzip) برای روت‌های سنگین فهرست‌ها
 * ----------------------------------------------------------
 * ریشه‌یابی «لینک preview در موبایل کار نمی‌کند» (بخش انتقال داده):
 * کاتالوگ M1 بدون فشرده‌سازی ۵٫۹ مگابایت و M2 حدود ۲٫۸ مگابایت JSON بود —
 * سرور توسعهٔ Next فشرده‌سازی نمیکند و Caddy پلتفرم نیز encode ندارد؛
 * نتیجه: باز شدن کاشی در اندروید روی دیتای موبایل چند ثانیه تا چند ده ثانیه
 * طول می‌کشید.
 *
 * این تابع وقتی کلاینت gzip میپذیرد (همهٔ مرورگرها) و بدنه از آستانه بزرگ‌تر
 * است، همان JSON را با content-encoding: gzip برمی‌گرداند (اندازهٔ M1 از
 * ~۵٫۹MB به ~۱MB می‌رسد). در غیر این صورت عین Response.json می‌ماند —
 * سازگار با تست‌ها (بدون accept-encoding = پاسخ ساده).
 */

import { gzip } from "node:zlib";
import { promisify } from "node:util";

const gzipAsync = promisify(gzip);

/** حداقل اندازهٔ بدنه برای فشرده‌سازی (بایت) — پاسخ‌های کوچک ساده می‌مانند */
const GZIP_MIN_BYTES = 64 * 1024;

export async function compressedJson(
  payload: unknown,
  acceptEncoding: string | null | undefined,
): Promise<Response> {
  const acceptsGzip = (acceptEncoding ?? "").toLowerCase().includes("gzip");
  if (!acceptsGzip) return Response.json(payload);

  const body = JSON.stringify(payload);
  if (body.length < GZIP_MIN_BYTES) return Response.json(payload);

  const gz = await gzipAsync(body, { level: 6 });
  return new Response(new Uint8Array(gz), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-encoding": "gzip",
      vary: "accept-encoding",
      "cache-control": "no-store, must-revalidate",
      "x-content-encoding-source": "app",
    },
  });
}
