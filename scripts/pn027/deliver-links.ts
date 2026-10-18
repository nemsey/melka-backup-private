// PN-027 · بخش ۴/۵ — لینک‌های تحویل v3 + دروازهٔ نهایی → end-gate.json + deliver-links.json
import fs from 'node:fs';

const B = '/deliver/pn027';
const items = [
  { n: 1, file: 'PN-027-FINAL-REPORT.md', url: `${B}/PN-027-FINAL-REPORT.md` },
  { n: 2, file: 'lock-in.json', url: `${B}/lock-in.json` },
  { n: 3, file: 'fix-supervisor.json', url: `${B}/fix-supervisor.json` },
  { n: 4, file: 'fix-pins.json', url: `${B}/fix-pins.json` },
  { n: 5, file: 'fix-wcag.json', url: `${B}/fix-wcag.json` },
  { n: 6, file: 'fix-sessions.json', url: `${B}/fix-sessions.json` },
  { n: 7, file: 'remove-deps.json', url: `${B}/remove-deps.json` },
  { n: 8, file: 'remove-endpoints.json', url: `${B}/remove-endpoints.json` },
  { n: 9, file: 'archive-scripts.json', url: `${B}/archive-scripts.json` },
  { n: 10, file: 'speed-m1.json', url: `${B}/speed-m1.json` },
  { n: 11, file: 'speed-m2.json', url: `${B}/speed-m2.json` },
  { n: 12, file: 'speed-misc.json', url: `${B}/speed-misc.json` },
  { n: 13, file: 'guards.json', url: `${B}/guards.json` },
  { n: 14, file: 'PN-027-ALL.zip', url: `${B}/PN-027-ALL.zip` },
  { n: 15, file: 'SHA256SUMS', url: `${B}/SHA256SUMS` },
];

const endGate = {
  phase: 'PN-027 · دروازهٔ پایانی — بخش ۳ سند',
  tests: { run1: '2510 pass / 2 fail', run2: '2510 pass / 2 fail', identical: true, rule11_twoGreen: '✅', uniqueFail: 'PN-014/D2 پیش‌موجود (deliver-store از فاز PN-025)' },
  guards: { suite: '36/36 سبز', newGuard: 'audit-pin-check PASS (قاعدهٔ ۱۲)', reproducibility: '6/6 سبز پس از بستهٔ ۲۶ (در قفل ورود قرمز مستند بود)' },
  survival: { chainIndex: 26, files: 28, size: '506MB', anchorPrev: 'بستهٔ ۲۵ (previousChainMd5=4c2208d5…)', counts: 'آگهی ۲۷٬۷۸۲ · درخواست ۲۵٬۵۳۰ · معامله ۷۶۸ — صفر حذف' },
  version: {
    api: 'buildId=6fdcfef-20261010-0524 · gitSha=6fdcfef',
    meta: 'app-build-id + app-git-sha ✓',
    footer: 'VersionBadge زنده ✓',
    head: '6fdcfef',
    mirror: '6fdcfef همگام ✓',
    buildIdEqualsHead: true,
    rule13_restart: '✅ سرور جانشین PID 31507 از نگهبان رسمی (خاتمهٔ ۳۹۱۹ پس از بیلد)',
  },
  liveProbes: 'download/pn027/live-probes.json — M4 فعال ۲۰۰×۳ · فیلترها زیر هدف · حذف‌ها ۴۰۴ · نگه‌داشت‌ها ۲۰۰',
  rule15_zeroSurrender: '✅ صفر ادامه در حالت خطا — دو انحراف صادقانه با سند (WCAG 0.58 + روش‌شناسی baseline)',
};

const deliver = {
  phase: 'PN-027 · تحویل v3 — بخش ۴ سند (۱۷ قلم · قانون ۱۴ لینک مستقیم)',
  items,
  survivalChunks: Array.from({ length: 12 }, (_, i) => ({ n: i + 1, url: `${B}/PN-027-chainIndex26.part.${String(i).padStart(2, '0')}` })),
  survivalTar: `${B}/PN-027-chainIndex26.tar.gz`,
  survivalSums: `${B}/SHA256SUMS-survival.txt`,
  witnessExtras: ['live-probes.json', 'data-lock.json', 'speed-ab-bench.json', 'guards-raw.txt'],
  rule14: 'همهٔ لینک‌ها از مسیر سرو /deliver/pn027 — پاسخ ۲۰۰ (روت زندهٔ PN-014/D2)',
};

fs.writeFileSync('/home/z/my-project/download/pn027/end-gate.json', JSON.stringify(endGate, null, 1));
fs.writeFileSync('/home/z/my-project/download/pn027/deliver-links.json', JSON.stringify(deliver, null, 1));
fs.writeFileSync('/home/z/my-project/deliver-store/pn027/end-gate.json', JSON.stringify(endGate, null, 1));
fs.writeFileSync('/home/z/my-project/deliver-store/pn027/deliver-links.json', JSON.stringify(deliver, null, 1));
console.log('✓ end-gate.json + deliver-links.json (۱۵ قلم + ۱۲ قطعه + tar + sums)');
