# PN-042-C — گزارش شاهده (۲۰۲۶-۱۰-۲۰ · GLM)

## پاسخ چهارگانهٔ دستور شورا

1. **آیا push موفق بود؟ — ❌ خیر.** `! [rejected] main -> main (non-fast-forward)`.
   ریشه: بازنشانی پلتفرم، سندباکس را از چک‌پوینت `6bb3c8e` (خط A · بستهٔ بقا chainIndex=26 · ۱۰ اکتبر) بازسازی کرده بود، در حالی که آینهٔ GitHub در `e8d19627` (اسنپ‌شات بقای ۲۰۲-۱۰-۱۹T08:56Z · درخت `6743ab9a`) است. دو خط هیچ جد مشترکی ندارند. ۶ کامیت PN-042-B به‌صورت «آبجکت» با سندباکس گم شد، اما **کل محتوایشان** (درخت `6743ab9a`) در اسنپ‌شات `e8d19627` روی GitHub حاضر است. به‌جای آن، خط قدیم کامل (۱۵۵ کامیت) به‌عنوان شاخهٔ `wip-safety` روی GitHub آرشیو شد — صفر-اتلاف.
2. **آیا v2 روی GitHub است؟ — ❌ خیر، فقط v1.** مارکرها: `RESURRECTION v2`=۰ ❌ · `symlink`=۰ ❌ · `PropertyRecord`=۱ ✅ · `python3`=۱ ✅. سرآمد اسکریپتِ آینه صریحاً می‌گوید «مخزن خصوصی است» = عصر PN-042-A. اثبات تازگی (نه کش کهنه): sha256 فایل raw == sha256 بلاب origin/main = `ca644b5a8f3b4b438d1221871d6298c24949319ab8caada25bc58f45d47f8301`. فایل محلی هم در سندباکس بازنشانی‌شده وجود نداشت.
3. **آیا Branch Protection فعال شد؟ — ✅ بله (true/false/false).** `enforce_admins=true` · `allow_force_pushes=false` · `allow_deletions=false` · `required_linear_history=true`. توکن جدید admin=true و visibility=public راستی‌آزمایی شد.
4. **آیا Force Push رد شد؟ — ✅ بله، در هر دو تست.** تست A (`HEAD:main`): رد با **GH006** «Protected branch update failed — Cannot force-push». تست B (`HEAD~5:main`): رد با **GH013** «Repository rule violations — Cannot force-push» (الگوی grep دستور GH006/protected را نمی‌گرفت؛ رد شدن از لاگ اثبات شد).

## کشف‌های حیاتی (فراتر از ۶ گام — فقط گزارش، صفر اقدام)

- **توکن جدید فاقد اسکوپ `workflow` است** — دلیل دوم ردِ تست B. هر پوش آینده که `.github/workflows/*` را لمس کند رد می‌شود.
- **BP از این پس چرخهٔ اسنپ‌شات بقای force-push به main را هم می‌بندد.** سازوکار اسنپ‌شات (که main را با ریشهٔ بی‌تبار بازنویسی می‌کرد و تبار واقعی e8817dcb را در ۰۸:۵۶ رونویسی کرد) باید fast-forward شود یا به `survival/code` منتقل شود.
- **بیلد زنده = `6bb3c8e-20261019-1951`** (خط A · فاقد ۵۹۴ فایل PN-041-R). درختِ هم‌ترازشده `e8d19627` اکثر زیرساخت PN-042-A را دارد (resurrect v1 · reset-guard · auto-recovery · workflows سه‌گانه) اما `recover-all.sh` و `db-fortress-guard.sh` در آن نیستند → **بیلد+ری‌استارت از درخت + تکمیل از بسته‌های بقا لازم است (پیشنهاد PN-042-D)**.
- **بسته‌های بقا روی دیسک:** `upload/.survival/PN-045-20261018` (repo.bundle · «تاریخ کامل» · HEAD=bbf9c20) و `PN-046-20261019` (جدیدترین) — منبع بازیابی تبار واقعی و v2.
- **دیتابیس زنده دست‌نخورده:** ۲۷,۸۶۸ ردیف PropertyRecord · ۴۰۲MB · untracked (reset به آن دست نزد).
- **اسرار در آینهٔ عمومی: صفر** — فقط `.env.example` و `env.platform.json.example`.
- `scripts/recovery/reset-guard.sh` و `forbid-rollback.yml` و `github-shield-alert.yml` و `db-backup.yml` هم‌اکنون در درخت حاضرند.

## شاهدها (همه ۲۰۰ قابل دسترس در `download/pn042c/`)

`bp-put.json` · `bp-after.json` · `force-test-a.log` · `force-test-b.log` · `push-rejected.log` · `repo-info.json` · `branch-main-before-bp.json` · `resurrect-from-github.sh` (v1 عین آینه) · `SHA256SUMS`
