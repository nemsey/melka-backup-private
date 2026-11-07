# رویدادهای حاکمیتی ملکا (docs/EVENTS.md)

سند پیوست‌های رویدادهای کلیدی — مکمل بسته‌های بقا (EVENTS.md درون‌بسته‌ای) با نگاه گیت‌محور.

## ۱۴۰۵/۰۷/۲۸ — ۲۰۲۶-۱۰-۱۹ (جلسهٔ ۰۷۹ · شورا-ن۰۷۹)

### PN-042-A — تکمیل قفل گیت‌هاب + انتقال رازها + تست زنده

- **۰۸:۱۲** — قفل ورود: HEAD=d55b09a3 ✅ · آینه=HEAD ✅ · پیش‌شرط‌ها ۵/۵ ✅ (admin=true) · بکاپ VACUUM (md5 46858bf1… · integrity ok) · بستهٔ بقای ۴۶ (chainIndex=45 · ۳۳ قلم · ۵۶۹M) ساخته شد.
- **۰۸:۱۹** — Branch Protection: PUT → **۴۰۳ «Upgrade to GitHub Pro or make this repository public»** (پلن رایگان + مخزن خصوصی). Rulesets نیز ۴۰۳. → تصمیم با مالک (ارتقای پلن یا عمومی‌سازی). شاهد: bp-before.log · bp-put.log · rs-put.json.
- **۰۸:۲۲** — انتقال راز PN-043-A: مقادیر دو نسخه هم‌ارز (md5 مقادیر 25167d0a…) → کپی db→upload با md5 match (ab185525…) → حذف `db/.runtime/` (قانون ۸ برقرار). بکاپ برگشت‌پذیر: `upload/.data/runtime-backup-20261019-081203/`.
- **۰۸:۲۴** — پچ رستاخیز: بلوک Secret priority (۳ لایه · FATAL در فقدان) + استحکام .env.local + سربرگ احرازشده. گارد جدید `audit-runtime-secrets.sh` = ۳/۳ سبز.
- **کشف حیاتی** — مخزن **private**: raw بدون توکن = ۴۰۴ (۲۰۰ با توکن). یک‌خطی ناشناس دکترین هرگز کار نمی‌کرد — مانع live-test جلسهٔ ۰۷۰ همین بود، نه کش. کل زنجیره به فرم احرازشده اصلاح شد (گارد بند ۵ · dev-entry · Issue اکشن shield · سربرگ اسکریپت).
- **۰۸:۲۶/۰۸:۳۷** — دو-سبز: اجرای ۱ = ۲۷۷۹/۵۵ (آبشار «Engine is not yet connected» — نوسان محیطی Prisma در سوئیت کامل؛ تست‌ها در ایزوله سبز) · اجرای ۲ = **۲۹۱۴/۱** (تنها شکست = B-3ِ برگشته توسط reset-guard — پایین‌تر).
- **کشف عملیاتی** — گارد reset-guard (چرخهٔ Worker، تشخیص BUILD-STALE) در ۰۸:۳۳ `git reset --hard` زد و **پچ‌های بدون کامیت را بلعید** (اجرای ۲ شاهد زندهٔ آن است). درس مکتوب: پچ → بی‌درنگ کامیت + پوش. پچ‌ها بازاعمال و در ۲d0274ce پوش شدند.
- **۰۸:۴۴** — پوش ۲d0274ce (گارد audit-runtime-secrets + پچ رستاخیز + اصلاحات raw-احرازشده + تحمل‌سازی B-3).
- **۰۸:۴۶** — بازتولید بیلد در شل کامل: **سبز** (BUILD_ID=2d0274ce-20261019-0846) — شکست‌های «generate is not a function» مخصوص محیط اسپاون Worker است (باگ recover گارد: بدون prisma generate؛ سقوط امن).
- **۰۸:۴۹–۰۸:۵۱** — **LIVE CURL TEST زنده: ✅ RESURRECTION COMPLETE در ۸۹ ثانیه** — fetch واقعی از گیت‌هاب (sha remote=local) · دادهٔ مقدس صفر مداخله (۲۷٬۸۶۸) · Secret source اولویت ۱ · بیلد سبز · سرور روی 2d0274ce=HEAD. **BUILD_ID=HEAD برقرار — حلقهٔ BUILD-STALE گارد پایان یافت.**
- **۰۸:۵۱** — Worker تازه از بیلد جدید باز‌اسپاون شد (سوپروایزر، تایمر احیا).
- **۰۸:۵۶** — گاردها: audit-resurrect-ultimate **۳۴/۳۴** (با fetch احرازشده — فراتر از ادعای ۳۳/۳۳) · audit-runtime-secrets ۳/۳ · audit-boot-secrets · repository-boundary · intelligence-boundary · log-safety · disk-space همه سبز · reproducibility ۳ سبز/۲ هشدار/۱ قرمز (وضعیت مستند).

## ۱۴۰۵/۰۷/۲۸ — ۲۰۲۶-۱۰-۱۹ (جلسهٔ ۰۷۰ · PN-042)

- حذف سازوکارهای موازی · ساخت resurrect-ultimate.sh + start-prod.sh + forbid-rollback.yml + audit-resurrect-ultimate (۳۳ بند) · دو-سبز ۲۹۱۵/۰ (ادعا؛ شاهد لاگ روی دیسک یافت نشد — گزارش PN-042-A) · live-test ناتمام (مانع: ۴۰۴ raw خصوصی، آن‌گاه ناشناخته).

## ۱۴۰۵/۰۷/۲۷ — ۲۰۲۶-۱۰-۱۸ (PN-041/044/045)

- قلعهٔ داده (upload/.data) · بسته‌های بقا ۴۳/۴۴ · بازیابی واقعی PN-041-R پس از ریست ۰۳:۱۰ (۲۰۲۶-۱۰-۱۹) · دو-سبز ۲۹۰۱/۰ ×۲ (شاهد: upload/.runtime/tests-run*-tail.log).
