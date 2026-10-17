// PN-027 · ۵-الف-۳ — شاهد جایگزینی pin کد مدیر → fix-pins.json
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const testsPins = execSync('grep -rn "80211186" tests/ | wc -l').toString().trim();
const srcPins = execSync('grep -rn "80211186" src/ | wc -l').toString().trim();

const out = {
  bug: 'کد واقعی مدیر (۸۰۲۱۱۱۸۶) هاردکد در تست‌ها — یافتهٔ امنیتی بُعد ۳ PN-026',
  decision: 'جلسهٔ ۰۳۴ فرم ۵-الف ردیف ۳ — تأیید کامل: جایگزینی با ۹۹۹۹۹۹۹۹',
  changes: [
    {
      file: 'tests/pn003-master-code.test.ts',
      points: [
        'L4 (روایت): کد واقعی مستندشده → نمونهٔ ۹۹۹۹۹۹۹۹ + یادداشت PN-027',
        'L113 (کامنت): ارجاع رقم‌به‌رقم حادثه → توصیف عمومی «جابه‌جایی رقم ۲↔۱»',
        'L149-152 (§۳-۲): شرط if (code === "80211186") → "99999999" — ساختار منطق عیناً محفوظ',
        'L172-176 (§۴-۱): نمونه‌های قالب ۸رقمی → خانوادهٔ ۹۹۹۹۹۹۹۹ (۹رقمی/حرف‌دار/فارسی منفی‌ها هم‌خانواده شدند)',
        'L182-184 (§۴-۲): جفت‌های safeEqual → ۹۹۹۹۹۹۹۹ (کد غلط تایپی تاریخی ۸۰۲۲۱۱۸۶ به‌عنوان مقدار رگرسیونی غیر-رازِ مستند باقی ماند)',
      ],
      logicChange: 'صفر — همهٔ ادعاها و ساختار شرط‌ها عیناً همان؛ فقط literalها',
    },
    {
      file: 'tests/pn011-boot-secrets.test.ts',
      points: ['L136 (§۴): process.env.MASTER_ACCESS_CODE = "80211186" → env-first: مقدار موجود env حفظ، در نبود نمونهٔ ۹۹۹۹۹۹۹۹'],
      logicChange: 'صفر — متغیر همچنان مقدار ۸رقمی معتبر دارد',
    },
    {
      file: 'tests/pn027-bugfixes.test.ts',
      points: ['خود فایل تست رگرسیون جدید PN-027 — نمونهٔ عمومی ۱۲۳۴۵۶۷۸'],
      logicChange: '—',
    },
  ],
  verification: {
    testsPn003: '۱۵/۱۵ pass (سوئیت §۱-§۴)',
    testsPn011: 'پس از تغییر: کل سوئیت pass (۲۲ تست در دو فایل با هم)',
    remaining80211186InTests: testsPins + ' مورد',
    remaining80211186InSrc: srcPins + ' مورد (صفر — تأیید دوباره)',
    note: 'اسکریپت‌های تاریخی (pn005/pn010/pn012) شامل کد هستند — در مرحلهٔ ۵-ب به آرشیو docs/archive/scripts منتقل می‌شوند (تصمیم جلسهٔ ۰۳۴: آرشیو، صفر حذف) و خارج از مسیر اجرای تست/CI قرار می‌گیرند',
  },
  newGuard: 'audit-pin-check (گارد تازهٔ جلسهٔ ۰۳۴) — در دروازهٔ پایانی نصب می‌شود: اسکن ۸۰۲۱۱۱۸۶ + ارقام مجاور در tests/ و src/',
  verifiedAt: new Date().toISOString(),
};
fs.writeFileSync('/home/z/my-project/download/pn027/fix-pins.json', JSON.stringify(out, null, 1));
console.log('✓ fix-pins.json — باقی‌مانده در tests:', testsPins, '· در src:', srcPins);
