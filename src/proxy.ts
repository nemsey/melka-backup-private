/**
 * Proxy (جانشین Next 16 برای middleware) — خط لاگ آغاز هر فراخوانی /api/* (P2-05)
 * ------------------------------------------------------
 * برای هر درخواست API یک رویداد «route status=start» ثبت می‌شود
 * (پوشش کامل ورودی — شامل روت‌های عمومی مثل /api/health).
 *
 * PN-013/مرحلهٔ ۶ — Correlation ID سرتاسری:
 *   شناسهٔ ‎x-request-id‎ کلاینت (اگر فرستاده شده) خوانده، همان‌طور به روت
 *   پایین‌دستی هدایت و در پاسخ نیز برگردانده می‌شود ⇒ یک شناسه از UI تا
 *   لاگ/متریک. اگر کلاینت نفرستاده باشد، همین‌جا ساخته می‌شود.
 *
 * Next 16: قرارداد middleware منسوخ و با proxy جایگزین شده است؛
 * proxy در Node.js runtime اجرا می‌شود ⇒ process.stdout (خروجی Logger)
 * در دسترس است.
 *
 * محدودیت شفاف: proxy پاسخ نهایی handler پایین‌دستی را نمی‌بیند
 * (NextResponse.next() فوری برمی‌گردد) ⇒ ثبت «پایان + مدت» دقیق در همین
 * لایه ممکن نیست. راه‌حل: روت‌های دارای رویداد الزامی (احراز هویت/
 * همگام‌سازی/ایجنت/سلامت) با withRouteLog به‌طور کامل بسته‌بندی می‌شوند
 * (آغاز/پایان/مدت واقعی + همان شناسهٔ ورودی) و بقیه روت‌ها این خط آغاز
 * + رویدادهای دامنه‌ای را دارند.
 *
 * اصول: بدنه و متد درخواست دست‌نخورده؛ تنها هدر شناسه افزوده می‌شود.
 */

import { NextRequest, NextResponse } from "next/server";
import { logRoute, newLogId } from "@/lib/logger";

export default function proxy(request: NextRequest): NextResponse {
  // Correlation ID — از کلاینت یا تازه (PN-013 مرحلهٔ ۶)
  const requestId = request.headers.get("x-request-id") ?? newLogId();

  logRoute({
    method: request.method,
    path: request.nextUrl.pathname,
    status: "start",
    requestId,
  });

  // پاسخ همان شناسه را برمی‌گرداند (برای مسیرهای بدون withRouteLog)
  const response = NextResponse.next({
    request: {
      // همان شناسه به روت پایین‌دستی می‌رسد (withRouteLog آن را می‌خواند)
      headers: new Headers([
        ...Array.from(request.headers.entries()),
        ["x-request-id", requestId],
      ]),
    },
  });
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
