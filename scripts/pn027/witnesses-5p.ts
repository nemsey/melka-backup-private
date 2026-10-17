// PN-027 · ۵-پ — سه شاهد سرعت: speed-m2.json + speed-m1.json + speed-misc.json
import fs from 'node:fs';

const ab = JSON.parse(fs.readFileSync('/home/z/my-project/download/pn027/speed-ab-bench.json', 'utf8'));

const byLabel = (arr: any[]) => Object.fromEntries(arr.map((x) => [x.label, x]));

const m2 = {
  phase: 'PN-027 · ۵-پ-۱ — فیلتر متنی M2 (سنگین‌ترین گلوگاه — جلسهٔ ۰۳۴)',
  target: 'P95 از ۲٬۹۵۵ms به < ۵۰۰ms',
  implementation: {
    schema: '۳ ستون سایهٔ نرمال افزودنی: customerNameNorm (نام␟موبایل) · sanadNamesNorm · actorNameNorm + ایندکس ×۳',
    migration: 'فقط-افزودنی — ALTER TABLE ADD COLUMN · بک‌فیل ۲۵٬۵۳۰ ردیف در ۱۰٫۸s · صفر تغییر دادهٔ اصلی',
    repository: 'فیلتر در سطح SQL (contains روی ستون نرمال) به‌جای واکشی ۲۵k ردیف + فیلتر JS',
    parity: 'جداکنندهٔ ␟ (U+001F — غیرقابل‌تولید از UI) هم‌ارزی دقیق «نام یا موبایل» را حفظ می‌کند · normalizeFilterInput منبع یگانه',
    writeCoverage: 'پسوند کوئری مرکزی در db.ts — همهٔ مسیرهای نوشتن (ثبت دستی · CRM · کاتالوگ · بذر تست) خودکار نرمال می‌نویسند',
  },
  rollback: 'قانون ۱۰ (جلسهٔ ۰۳۴): حذف ستون‌های نرمال + بازگردانی دو فایل مخزن از گیت — دادهٔ اصلی دست‌نخورده',
  results: byLabel(ab.M2),
  headline: { 'سند (کندترین)': 'P95 ۳٬۳۳۶ → ۱۵۹ms (−۹۵٪)', 'نام مشتری': 'P95 ۲٬۸۷۴ → ۱۸۰ms (−۹۴٪)', 'کارشناس': 'P95 ۲٬۷۶۳ → ۱۵۶ms (−۹۴٪)' },
  goalMet: 'هر سه فیلتر ≪ ۵۰۰ms ✓',
  tests: '۹ تست رگرسیون هم‌ارزی در tests/pn027-speed.test.ts + تست زندهٔ PN-002 §۳-۵ (بذر مستقیم → پسوند نرمال خودکار)',
  note: 'اندازه‌گیری سمت مخزن (۲۰ تکرار) — سطح HTTP پس از بیلد پایانی در دروازه اندازه‌گیری می‌شود',
};

const m1 = {
  phase: 'PN-027 · ۵-پ-۲ — فیلتر متنی M1 (زیرساخت مشترک M2)',
  target: 'P95 < ۵۰۰ms (پایه: ۱٬۲۵۳ms)',
  implementation: '۳ ستون: realtorNameNorm (ownerName) · ownerSearchNorm (rawOwnerName␟موبایل) · addressSearchNorm (آدرس␟محله␟خط) + ایندکس ×۳ · بک‌فیل ۲۷٬۷۸۲ ردیف در ۱۱٫۷s',
  results: byLabel(ab.M1),
  headline: { 'کارشناس': 'P95 ۹۶۴ → ۶۳ms (−۹۳٪)', 'آدرس/محله': 'P95 ۹۰۵ → ۳۸ms (−۹۶٪)', 'مالک/موبایل': 'P95 ۳۰ms' },
  goalMet: '≪ ۵۰۰ms ✓',
  tests: '۴ تست رگرسیون هم‌ارزی (سه‌ضلعی آدرس + مالک/موبایل + کارشناس)',
};

const misc = {
  phase: 'PN-027 · ۵-پ-۳ تا ۵-پ-۹ — بهینه‌سازی‌های باقی‌مانده به‌ترتیب جلسهٔ ۰۳۴',
  items: [
    { id: '۵-پ-۳', name: 'کش شاخص بازار', implementation: 'TTL ۳۰ دقیقه در سرویس (getMarketIndex → computeMarketIndex) · شکل پاسخ عیناً حفظ · invalidate برای تست', target: 'پاسخ گرم < ۵۰ms (پایه: P50 ۷۹۳ms)', test: 'تست رگرسیون: گرم < ۵۰ms + generatedAt ثابت' },
    { id: '۵-پ-۴', name: 'پرچم enrich=0 پیش‌فرض + کش ۵ دقیقه', implementation: 'غنی‌سازی هدفمند جست‌وجوی کد فقط با enrich=1 صریح + کش ۵ دقیقه‌ای همان کد · daemon پس‌زمینه تازگی داده را حفظ می‌کند', target: 'جست‌وجوی محلی ~۷۰ms (پایه: ۲٬۰۴۹ms شبکه)', test: 'تست سورس: پیش‌فرض خاموش + TTL' },
    { id: '۵-پ-۵', name: 'پیش‌گرمایش هوش در بوت', implementation: 'instrumentation.ts — ensureBrainStatus معلق ۲۰s پس از بوت · بهترین-تلاش · موتورهای ۱-۱۶', target: 'سرد→گرم: ~۸۰۰ → ~۱۶۰ms از همان نخستین درخواست', log: 'operation=intelligence-prewarm با ms اندازه‌گیری' },
    { id: '۵-پ-۶', name: 'select سبک‌تر M2', implementation: 'select ردیف از قبل حداقلی بود (همهٔ ستون‌ها در ستون‌های نمایش مالک) — بهینه‌سازی واقعی: کش ۶۰ث تجمع‌های کمکی (count×2 + groupBy روی ۲۵٫۵k در هر درخواست)', honest: 'صادقانه: «select سبک‌تر» در معنای حذف ستون بی‌استفاده نبود — هیچ ستون بی‌استفاده نبود؛ کش تجمع‌ها بار هر درخواست را حذف کرد' },
    { id: '۵-پ-۷', name: 'React.lazy یازده کاشی', status: 'زیرساخت از قبل فعال (قانون ظاهر فاخر ۰۳۵-B — بخش ح): هر ۱۳/۱۳ کاشی lazyPage دارند', measurement: 'JS اولیه در دروازه با probe مرورگر اندازه‌گیری می‌شود (پایهٔ PN-026: ۲۸۱KB — هدف < ۲۸۰KB)', diskNote: 'چانک‌های ریشه: ۴۰۱KB خام / ~۱۱۷KB گیز — عمدتاً فریم‌ورک' },
    { id: '۵-پ-۸', name: 'سقف RAM بیلد ۳۰۰0MB', status: '✅ فعال — NODE_OPTIONS=--max-old-space-size=3000 در package.json build + هر دو بیلد PN-027 با آن اجرا شد', test: 'تست سورس در pn027-speed.test.ts' },
    { id: '۵-پ-۹', name: 'RAM تولید ۵۷۸MB', status: '⏸️ تعلیق جلسهٔ ۰۳۴ — نیازمند تحلیل جداگانه · اقدام صفر', observed: '۵۴۹MB در آخرین perf-budget (پایدار زیر سقف)' },
  ],
  twoGreen: 'تست کامل ×۲: ۲۵۱۰ pass / ۲ fail یکسان (هر دو = PN-014/D2 پیش‌موجودِ deliver-store — از پیش از PN-027؛ مستند)',
};

fs.writeFileSync('/home/z/my-project/download/pn027/speed-m2.json', JSON.stringify(m2, null, 1));
fs.writeFileSync('/home/z/my-project/download/pn027/speed-m1.json', JSON.stringify(m1, null, 1));
fs.writeFileSync('/home/z/my-project/download/pn027/speed-misc.json', JSON.stringify(misc, null, 1));
console.log('✓ سه شاهد سرعت نوشته شد');
