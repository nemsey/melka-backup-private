/**
 * Proxy (جانشین Next 16 برای middleware) — خط لاگ آغاز هر فراخوانی /api/* (P2-05)
 * ------------------------------------------------------
 * برای هر درخواست API یک رویداد «route status=start» ثبت می‌شود
 * (پوشش کامل ورودی — شامل روت‌های عمومی مثل /api/health).
 *
 * Next 16: قرارداد middleware منسوخ و با proxy جایگزین شده است؛
 * proxy در Node.js runtime اجرا می‌شود ⇒ process.stdout (خروجی Logger)
 * در دسترس است.
 *
 * محدودیت شفاف: proxy پاسخ نهایی handler پایین‌دستی را نمی‌بیند
 * (NextResponse.next() فوری برمی‌گردد) ⇒ ثبت «پایان + مدت» دقیق در همین
 * لایه ممکن نیست. راه‌حل: روت‌های دارای رویداد الزامی (احراز هویت/
 * همگام‌سازی/ایجنت/سلامت) با withRouteLog به‌طور کامل بسته‌بندی می‌شوند
 * (آغاز/پایان/مدت واقعی) و بقیه روت‌ها این خط آغاز + رویدادهای دامنه‌ای
 * را دارند. پوشش کامل پایان برای همه روت‌ها در PHASE 3 (لایه UseCase)
 * رسمیت می‌یابد — در LOGGER-EVENTS-P2-05.md مستند شده است.
 *
 * اصول: درخواست و پاسخ دست‌نخورده (صفر تغییر هدر/بدنه ⇒ قرارداد پایدار).
 */

import { NextRequest, NextResponse } from "next/server";
import { logRoute, newLogId } from "@/lib/logger";

export default function proxy(request: NextRequest): NextResponse {
  logRoute({
    method: request.method,
    path: request.nextUrl.pathname,
    status: "start",
    requestId: newLogId(),
  });
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*"],
};
