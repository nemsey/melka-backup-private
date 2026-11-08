# CLI-REGISTRY.md — رجیستری رسمی ابزارهای دستی ملکا

> **PN-054 · دستور ۲**: این فایل «ریشهٔ بستار ارجاعی» است — هر اسکریپتی که
> نامش در این رجیستری بیاید **زنده** تلقی می‌شود و حسن فراژرف
> (`scripts/pn053/audit-deadcode.py`) آن را از حذف‌های آینده خارج می‌کند.
> قاعده: پیش از حذف هر اسکریپت، نامش را از این رجیستری حذف نکن مگر ابزارش
> واقعاً بازنشسته شده باشد.

آخرین بازنگری: ۱۴۰۵/۰۸/۱۷ (PN-054) — تعداد فایل‌های کد زنده در `scripts/`: **۱۱۲** (از ۲۴۲).

---

## ۱) زنجیرهٔ بوت و چرخهٔ حیات (خودکار — هرگز دستی اجرا نمی‌شوند)

| فایل | کارکرد |
|---|---|
| `start.sh` | بوت رسمی: گارد بازیابی → رازها → دیمن نگهبان |
| `scripts/start-prod.sh` | راه‌اندازی دیمن production (فراخوان resurrect گام ۶) |
| `scripts/start-prod-daemon.py` | double-fork یونیکس → دیمن مقاوم |
| `scripts/prod-watchdog.sh` | نگهبان: رازها/گیت‌ها/DB → socket-master |
| `scripts/pn054/socket-master.py` | نگهدار سوکت ۳۰۰۰ + فرزندان node + Blue/Green + مانیتور RAM |
| `scripts/pn054/listen-patch.cjs` | preload سرور: listen روی fd ارث‌برده + healthz |
| `scripts/runtime/worker.ts` | ورودی فرایند Worker (کارهای پس‌زمینه) |
| `scripts/resurrect-ultimate.sh` (ریشهٔ مخزن) | رستاخیز نهایی: کد از گیت‌هاب + UNION داده از لایه‌های پایدار |
| `scripts/p6549-recovery.sh` | بازیابی داده مقدس (لایهٔ sacred) — گارد آن در تست pn038 |

## ۲) دیپلوی و بیلد (خودکار + دستی)

| فایل | کارکرد |
|---|---|
| `scripts/pn054/deploy-zero-dt.sh` | **دیپلوی بدون قطعی** — گیت‌ها + Blue/Green (مسیر رسمی انتشار) |
| `scripts/pn054/test-zero-dt.sh` | تست E2E پذیرش بدون قطعی (بار + kill -15 + kill -9) |
| `scripts/build-with-parking.sh` | بیلد با پارک اتمی (PARK_ACTIVE) |
| `scripts/park-deliver.sh` | پارک/بازگشت دستی فروشگاه deliver (park/unpark/status) |
| `scripts/fingerprint.ts` | اثر انگشت بیلد (postbuild → .next) |
| `scripts/ci.sh` | اجرای همهٔ گاردهای ممیزی CI |
| `scripts/refresh-sync-tar.sh` | تازه‌سازی بستهٔ همگام‌سازی (sync-tar) |
| `scripts/pn054/trim-node-modules.sh` | هرس وابستگی‌های پلتفرمی بی‌استفاده (postinstall) + خانوادهٔ pg یتیم (درس ریست ۱۱-۰۸) |
| `scripts/pn054/find-orphans.py` | تشخیص بسته‌های یتیم node_modules (خارج از bun.lock) — تشخیص پس‌رفت حجم |
| `scripts/pn054/closure.sh` | تحلیل بستار ارجاعی (کدام اسکریپت زنده است) |
| `scripts/pn054/consolidate.sh` | پاکسازی کنترل‌شدهٔ اسکریپت‌های جلسه‌ای (تک‌بار) |

## ۳) ابزارهای عملیاتی دستی (ترمینال)

| فایل | کارکرد |
|---|---|
| `scripts/melka-debug.ts` | خط‌یابی CLI ملکا (وضعیت/لاگ/DB) |
| `scripts/fetch.sh` | fetch با retry (میزبانی ایرانی کند/ناپایدار) |
| `scripts/check-db-counts.ts` | شمار رکوردهای DB (بدون تداخل main) |
| `scripts/dev-secrets.ts` | راه جایگزین تعریف رازهای توسعه |
| `scripts/snapshot-db.ts` | اسنپ‌شات سازگار SQLite حتی حین نوشتن |
| `scripts/rotate-encryption-key.ts` | چرخش کلید رمزنگاری (SEC-2 · HOTFIX-01) |
| `scripts/log-rotate.sh` | چرخش لاگ (کار صف Worker — اجرای دستی برای اضطرار) |
| `scripts/mirror/mirror-cycle.sh` | چرخهٔ آینهٔ گیت (کار صف Worker) |
| `scripts/mirror/mirror-daemon.sh` | دیمن آینه (پشتیبان cycle) |
| `scripts/mirror/re-arm.sh` | بازمسلح‌کردن آینه پس از شکست |
| `scripts/mirror/build-snapshot.sh` | ساخت بستهٔ بقا (survival package) |
| `scripts/pn041/vacuum-copy.ts` | checkpoint + VACUUM INTO (کپی فشردهٔ DB) |
| `scripts/pn041/db-probe.ts` | داوری وضعیت فایل DB (سلامت/تعداد) |
| `scripts/pn078/drop-cache.sh` | خالی‌کردن کش دیسک (رفع فشار I/O) |
| `scripts/p6530/gen-palette.py` | مولد نظام رنگ ۱۳ بخش (مولد مرجع globals.css) |
| `scripts/resilient-test-runner.sh` | اجرای فایل‌به‌فایل تست‌ها با تحمل خطا |
| `scripts/regression-guard.sh` | گارد رگرسیون پیش از تحویل |
| `scripts/perf-budget.sh` | بودجهٔ کارایی بیلد |

## ۴) ممیزی‌های دستی (فراتر از مجموعهٔ CI)

| فایل | کارکرد |
|---|---|
| `scripts/audit-data-sacred.sh` | ممیزی داده مقدس + لنگرهای بازیابی |
| `scripts/audit-db-fortress.sh` | ممیزی قلعهٔ DB (ossfs) |
| `scripts/audit-resurrect-ultimate.sh` | راستی‌آزمایی خودِ اسکریپت رستاخیز |
| `scripts/audit-mobile-relay.sh` | ممیزی مسیرهای رلهٔ موبایل |
| `scripts/audit-melka-relay-apk.sh` | ممیزی APK رلهٔ ملکا |
| `scripts/audit-relay-matrix.sh` | ماتریس کامل مسیرهای رله |
| `scripts/audit-reproducibility.sh` | بازتولیدپذیری بیلد |
| `scripts/audit-roles.sh` | نقش‌ها و مجوزها |
| `scripts/audit-feature-visibility.sh` | دیدگاه ویژگی‌ها |
| `scripts/audit-graph-integrity.sh` | یکپارچگی گراف (P6545) |
| `scripts/audit-job-state.sh` | پایدارساز وضعیت کارها |
| `scripts/audit-opportunity-alerts.sh` | هشدار فرصت‌ها |
| `scripts/audit-phase0-revision.sh` | بازبینی فاز صفر |
| `scripts/audit-pin-check.sh` | وارسی pin وابستگی‌ها |
| `scripts/audit-scope-usage.ts` | گارد ساختاری دامنه (scope) |
| `scripts/audit-smart-update.sh` | بروزرسانی هوشمند |
| `scripts/pn048/sacred-integrity.sh` | یکپارچگی اسنپ‌شات‌های مقدس |
| `scripts/pn053/audit-deadcode.py` | حسن فراژرف: کد مرده — **این رجیستری را ریشه می‌گیرد** |

## ۵) کاوشگرهای مالک/شورا (PN-072)

| فایل | کارکرد |
|---|---|
| `scripts/pn072-counts-probe.sh` | شمارش total فهرست‌ها (در بیلد) |
| `scripts/pn072-excel-probe.sh` | آزمایش زندهٔ دانلود اکسل |
| `scripts/pn072-public-verify.sh` | راستی‌آزمایی عمومی از لینک preview |

## ۶) راستی‌آزمایی دیپلوی و لینک‌ها (قانون لینک)

| فایل | کارکرد |
|---|---|
| `scripts/verify-deploy-freshness.sh` | تازگی دیپلوی (بیلد = HEAD) |
| `scripts/verify-preview-version.sh` | سلامت لینک preview و نسخهٔ عمومی |

---

### قواعد نگهداری

1. **افزودن ابزار دستی تازه؟** یک ردیف به جدول مربوط اضافه کن — همین‌قدر کافی
   است تا از حذف‌های آینده مصون بماند.
2. **بازنشستن ابزار؟** اول از این رجیستری حذف کن، بعد فایل را پاک کن.
3. ابزارهای جلسه‌ای (شاهد/probe یک‌باره) به این رجیستری **تعلق ندارند** —
   پاکسازی PN-054 نشان داد ۱۴۱ فایل از این نوع در تاریخچهٔ گیت آرشیو شد.
