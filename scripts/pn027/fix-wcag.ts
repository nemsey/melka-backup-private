// PN-027 · ۵-الف-۴ — شاهد WCAG → fix-wcag.json
import fs from 'node:fs';
import { readFileSync } from 'node:fs';

function oklchToSrgb(L: number, C: number, H: number): [number, number, number] {
  const h = (H * Math.PI) / 180;
  const a = C * Math.cos(h), b = C * Math.sin(h);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  const gam = (x: number) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(Math.max(x, 0), 1 / 2.4) - 0.055);
  return [gam(r), gam(g), gam(bl)].map((v) => Math.min(1, Math.max(0, v))) as [number, number, number];
}
function lum([r, g, b]: [number, number, number]): number {
  const lin = (x: number) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function con(c1: [number, number, number], c2: [number, number, number]): number {
  const l1 = lum(c1), l2 = lum(c2);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

const css = readFileSync('/home/z/my-project/src/app/globals.css', 'utf8');
const m = css.match(/\.dark\s*\{[^}]*?--destructive:\s*oklch\(([\d.]+)\s+([\d.]+)\s+([\d.]+)\)/s)!;
const now = oklchToSrgb(+m[1], +m[2], +m[3]);
const card = oklchToSrgb(0.275, 0.02, 205);
const eff60: [number, number, number] = [0, 1, 2].map((i) => 0.6 * now[i] + 0.4 * card[i]) as [number, number, number];
const rgb = (c: [number, number, number]) => `rgb(${c.map((v) => Math.round(v * 255)).join(',')})`;

const out = {
  bug: 'دکمهٔ قرمز (destructive) در تم تاریک — WCAG ۲٫۸۹ < ۴٫۵ (یافتهٔ بُعد ۱۲ PN-026 · اندازه‌گیری زندهٔ DOM)',
  element: 'دکمهٔ «ریست اتصال» واریانت destructive — MelkTabrizConnectionSection.tsx:317 (متن سفید روی rgb(255,100,103))',
  contract: {
    councilValue: 'oklch(0.62 0.19 25)',
    appliedValue: 'oklch(0.58 0.19 25)',
    deviation: 'صادقانه: مقدار پیشنهادی شورا (L=0.62) تنها ۳٫۹۹ می‌داد — زیر معیار پذیرش خود کارپوشه (WCAG ≥ ۴.۵). حداقل تیرگیِ لازم L=0.58 است: ۴٫۷۱ ✓. هدف اعلامی PN-026 هم «~۴٫۸+» بود. L=0.58 نزدیک‌ترین مقدار امن به هدف (۰٫۵۷ → ۴٫۹۱ اما متن-قرمز را زیر ۳٫۰ می‌برد).',
  },
  verification: {
    before: { token: 'oklch(0.704 0.191 22.22) ≈ rgb(255,100,103)', wcagFull: 2.89, verdict: '❌ AA fail' },
    after: {
      token: 'oklch(0.58 0.19 25) ≈ ' + rgb(now),
      wcagWhiteOnFull: +con([1, 1, 1], now).toFixed(2),
      wcagWhiteOnRenderedButton60: +con([1, 1, 1], eff60).toFixed(2),
      wcagGe45: con([1, 1, 1], now) >= 4.5 && con([1, 1, 1], eff60) >= 4.5,
    },
  },
  regressionGuard: 'tests/pn027-bugfixes.test.ts — دو تست پایدار: تمام‌شدت ≥ ۴.۵ و دکمهٔ رندرشدهٔ /60 ≥ ۴.۵ (محاسبهٔ زنده از globals.css — اگر کسی توکن را روشن کند تست قرمز می‌شود)',
  knownTradeoff: {
    note: 'متن-قرمز-به‌عنوان-رنگ (مثل پیام خطای coverage-table · هشدار data-source · آیتم خروج منوی سربرگ) در تم تاریک از ۵٫۱۱ به ۳٫۱۳ می‌رسد (AA بزرگ ۳٫۰ ✓ · AA عادی ۴٫۵ ✗). این توازن ذاتی توکن مشترک است — با مقدار پیشنهادی خود شورا (۰٫۶۲) هم ۳٫۶۹ می‌شد (باز هم زیر ۴٫۵).',
    recommendation: 'پیشنهاد جلسهٔ آینده: تفکیک --destructive (پس‌زمینه) از --destructive-text (متن) — نیازمند تغییر ۳ کامپوننت؛ خارج از دامنهٔ قرارداد یک‌خطی این باگ',
  },
  lightThemeUntouched: 'روشن ۰٫۵۷۷ (۴٫۷۷ ✓) — بدون تغییر',
  verifiedAt: new Date().toISOString(),
};
fs.writeFileSync('/home/z/my-project/download/pn027/fix-wcag.json', JSON.stringify(out, null, 1));
console.log('✓ fix-wcag.json — تمام‌شدت:', out.verification.after.wcagWhiteOnFull, '· دکمه:', out.verification.after.wcagWhiteOnRenderedButton60);
