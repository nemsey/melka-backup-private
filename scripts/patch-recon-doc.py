#!/usr/bin/env python3
"""patch-recon-doc.py — جایگزینی خط‌محور ۴ باقی‌ماندهٔ نتایج شب ۱ در ARM-PM-RECONNAISSANCE.md
(مقاوم در برابر ZWNJ — تطابق بر اساس پیشوند خط، نه رشتهٔ کامل)"""
import sys

PATH = "/home/z/my-project/docs/ARM-PM-RECONNAISSANCE.md"

REPLACEMENTS = [
    ("| rate limit صریح",
     "| rate limit صریح (Retry-After / X-RateLimit-*) | شب ۱: در ~۳۳ GET با فاصلهٔ ≥۱.۵s هیچ 429 یا هدر RateLimit دیده نشد؛ آستانهٔ واقعی 429: ⏳ (تست تدریجی در شب Bulk واقعی) | ✅ شب ۱ (در این سطح بار) / ⏳ آستانه |"),
    ("| داده تاریخی کامل",
     "| داده تاریخی کامل ۲۵ ساله؟ | مکانیزم بازه‌ای کار می‌کند. شب ۱: بازهٔ کامل ۱۳۷۵/۰۱/۰۱–۱۴۰۵/۰۶/۲۸ → 200 اما **totalCount=۰** — گزارش‌های معاملات برای حساب مالک خالی‌اند (per-realtor scope؛ businessId به کوئری/هدر هم باز نکرد)؛ عمق واقعی برای کارشناسان دارای معامله: ⏳ | ✅ مکانیزم / ⚠️ scope / ⏳ عمق |"),
    ("| زمان پاسخ صفحه معمول",
     "| زمان پاسخ صفحه معمول (page 1, limit 100) | شب ۱ (پیک صبح شنبه): **P50=263ms · P95=265ms** (۱۰ درخواست متوالی)؛ نمونه‌ها 237–2373ms؛ کندترین = visits (2373ms)؛ یک پنجرهٔ ~۲ دقیقه‌ای سیاه‌چالهٔ اتصال (timeout 30s) هم مشاهده شد — شب‌سنجهٔ واقعی همچنان ⏳ | ✅ شب ۱ (پیک) / ⏳ شب |"),
    ("| صفحه عمیق (page 50+)",
     "| صفحه عمیق (page 50+) | شب ۱: page=50/100 بدون بازهٔ تاریخ → 400 (قانون بازهٔ اجباری)؛ با بازه نیازمند تست مجدد ⏳ (ریسک شناخته‌شدهٔ offsetهای عمیق در mongoose-paginate) |"),
    ("| جستجو با فیلتر",
     "| جستجو با فیلتر | ✅ شب ۱: فیلتر بازهٔ تاریخ روی معاملات سبک و سریع (262–287ms) |"),
    ("| CDN / Load Balancer",
     "| CDN / Load Balancer؟ | nginx جلوی API دیده شده (صفحات خطا)؛ شب ۱: هدرهای پاسخ فقط `server` + `content-type` — بدون Via/X-Cache (لایهٔ CDN/LB قابل‌مشاهده نیست) | ✅ nginx / ✅ شب ۱ (هدرها) |"),
    ("| سرویس third-party",
     "| سرویس third-party؟ | در باندل رسمی امضای Sentry/Datadog مشاهده نشد؛ شب ۱: هدر third-party در پاسخ‌ها دیده نشد | ✅ مشاهده‌نبودن + شب ۱ |"),
    ("| CSP هدر",
     "| CSP هدر؟ | شب ۱: هدر CSP/CSP-Report-Only در پاسخ‌های API مشاهده نشد | ✅ شب ۱ |"),
]

with open(PATH, encoding="utf-8") as f:
    lines = f.readlines()

replaced = []
for i, line in enumerate(lines):
    for prefix, new in REPLACEMENTS:
        if line.startswith(prefix):
            if line.rstrip("\n") != new:
                lines[i] = new + "\n"
                replaced.append(prefix.strip())
            break

with open(PATH, "w", encoding="utf-8") as f:
    f.writelines(lines)

print(f"replaced {len(replaced)} lines:")
for r in replaced:
    print(" -", r)
if len(replaced) < 6:
    print("WARNING: some replacements missing", file=sys.stderr)
    sys.exit(1)
