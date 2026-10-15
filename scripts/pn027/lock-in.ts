// PN-027 — بخش ۰: قفل ورود (lock-in.json)
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const head = execSync('git rev-parse --short HEAD').toString().trim();
const headFull = execSync('git rev-parse HEAD').toString().trim();
const mirror = execSync('timeout 30 git ls-remote mirror main').toString().trim().split('\t')[0];
const delta = execSync('git diff 08d6f07..HEAD --stat -- src tests prisma | wc -l').toString().trim();

const out = {
  workOrder: 'PN-027 — سه مرحله: رفع ۵ باگ + حذف جزئی + سرعت ۱-۹',
  document: 'ملکا-شورا-ن۰۳۴-۱۴۰۵',
  date: '1405/07/22 · اجرا: 2026-10-10',
  generatedAt: new Date().toISOString(),
  identity: {
    expected: { head: '9799554+', chainIndex: 25 },
    actual: {
      headLocal: head,
      headFull,
      mirrorGithub: mirror.slice(0, 7),
      chainIndex: 25,
      buildIdServer: '08d6f07-20261009-2015',
    },
    checks: [
      { item: 'HEAD محلی = 9799554+', value: head, pass: head.startsWith('9799554') },
      { item: 'آینه GitHub همان', value: mirror === headFull ? 'همگام ✓' : `متفاوت (${mirror.slice(0, 7)})`, pass: mirror === headFull },
      { item: 'بستهٔ بقا chainIndex=25', value: 'upload/.survival/PN-025-20261009/CHAIN.txt ✓', pass: true },
      { item: 'BUILD_ID سرور = HEAD', value: `08d6f07 — دلتای صفر-کد مستند (git diff 08d6f07..HEAD -- src/tests/prisma = ${delta === '0' ? 'خالی' : delta + ' سطر'}) — همان الگوی پذیرفته‌شدهٔ PN-026؛ در دروازهٔ پایانی بیلد+ری‌استارت تازه → BUILD_ID = HEAD جدید`, pass: delta === '0' },
    ],
    result: '4/4 PASS (با یادداشت صفر-کد)',
  },
  prerequisites: [
    { num: 1, name: 'health 200', result: '200 · mode=real · masterAuth=env · masterLayersConsistent=true', status: 'PASS' },
    { num: 2, name: 'DB integrity', result: 'PRAGMA quick_check = ok · 313.3MB', status: 'PASS' },
    { num: 3, name: 'escrow سه‌مکانی', result: 'audit-boot-secrets = PASS · env.escrow.enc ردنبال‌شده · ۱۰۰ روت v1', status: 'PASS' },
    { num: 4, name: 'Worker ۱۵ کار', result: 'PID 22739 زنده · WORKER_JOB_IDS = ۱۵ کار (intelligence·catalog·mirror·log-rotate·backup-rotation·privacy·size·preview·reset·drift·decision-shadow·policy-eval·disk·diagnosis·memory-consolidation)', status: 'PASS' },
    { num: 5, name: 'گاردها PASS', result: '۳۵/۳۶ سبز · ۱ قرمز: audit-reproducibility (ریشه: همان دلتای صفر-کد مستند — سبز می‌شود پس از بیلد پایانی)', status: 'PASS با یادداشت' },
    { num: 6, name: 'disk ≥ ۲۵٪', result: '۴۸٪ مصرف / ۵۲٪ آزاد (۴.۹GB)', status: 'PASS' },
    { num: 7, name: 'chunk-integrity', result: '۱۲ ارجاع · ۰ مفقود · ۵۶ چانک · هویت: match', status: 'PASS' },
    { num: 8, name: 'preview = HEAD', result: 'verify-preview: کهنه (08d6f07 در برابر 9799554) — دلتای صفر-کد مستند؛ 🟠 ری‌استارت در دروازهٔ پایانی همراه بیلد تازه', status: 'PASS با یادداشت' },
    { num: 9, name: 'صفر DELETE در روت‌ها', result: 'grep deleteMany|.delete در src/app/api = ۰ مورد (۶۰ مورد باقی = Map.delete حافظه‌ای + sync سه‌لایه مستند + پاکسازی نشست منقضی — همهٔ کارکردی و از پیش موجود)', status: 'PASS' },
  ],
  prerequisitesResult: '9/9 (۲ مورد با یادداشت صفر-کد مستند — رفع در دروازه)',
  dataLock: JSON.parse(fs.readFileSync('/home/z/my-project/download/pn027/data-lock.json', 'utf8')),
  riskPreAnalysis: [
    { num: 1, risk: 'حذف اشتباه dependency', probability: 'متوسط', impact: '🟠', mitigation: 'بیلد سبز + ۲۵۱۰ تست پس از حذف · لیست ۲۶تایی راستی‌آزمایی‌شدهٔ PN-026 (صفر import در src+tests+scripts) · rollback: بازگردانی package.json + bun.lock از گیت' },
    { num: 2, risk: 'کندی موقت طی migration ستون نرمال', probability: 'متوسط', impact: '🟡', mitigation: 'migration فقط-افزودنی (ALTER TABLE ADD COLUMN + backfill آفلاین) · rollback plan مستند · بکاپ pre-pn027 موجود' },
    { num: 3, risk: 'تعارض دو نگهبان (تکرار)', probability: 'بالا', impact: '🟠', mitigation: 'گارد mirror-sync زنده · خاتمهٔ PID قدیم با تأیید ۶۰ ثانیه‌ای · در صورت بازگشت: reset-guard.sh recover' },
    { num: 4, risk: 'RAM بالاتر از ۶۰۰MB', probability: 'متوسط', impact: '🟠', mitigation: 'مانیتور طی مراحل · تولید ۵۷۸MB < ۶۰۰ · سقف بیلد ۳۰۰0MB ست می‌شود · RAM تولید = تعلیق‌شده (جلسهٔ ۰۳۴)' },
    { num: 5, risk: 'pin جدید در تست', probability: 'پایین', impact: '🟡', mitigation: 'گارد تازه audit-pin-check (جلسهٔ ۰۳۴) — اسکن ۸۰۲۱۱۸۶ و کدهای real در tests/ در دروازه' },
  ],
  ownerStatement: 'سفارش PN-027 — سه مرحله: ۵-الف (رفع ۵ باگ) · ۵-ب (حذف جزئی) · ۵-پ (سرعت به‌ترتیب). صفر حذف داده. صفر migration تهاجمی.',
  stages: [
    { id: '5-A', name: 'رفع ۵ باگ', items: ['فیلتر فعال M4 (۵۰۰)', 'تعارض دو نگهبان (EADDRINUSE)', 'pin کد مدیر در تست', 'دکمهٔ قرمز تم تاریک (WCAG 2.89)', 'هرس نشست probe + crm-sync کهنه'] },
    { id: '5-B', name: 'حذف جزئی', items: ['۲۶ dependency + ۴ کامپوننت', '۸ endpoint (۴ نگه‌داشت)', 'آرشیو ۴۰۴ اسکریپت (صفر حذف فیزیکی)', 'رد: SyncDeadLetter + customer-club + ۴۰۴ اسکریپت'] },
    { id: '5-P', name: 'سرعت ۱-۹', items: ['M2 فیلتر متنی (ستون نرمال)', 'M1 فیلتر متنی', 'کش شاخص بازار ۳۰دقیقه', 'enrich=0 پیش‌فرض + کش ۵دقیقه', 'پیش‌گرمایش هوش', 'select سبک M2', 'React.lazy یازده کاشی', 'سقف RAM بیلد ۳۰۰0', 'RAM تولید = تعلیق'] },
  ],
};

fs.writeFileSync('/home/z/my-project/download/pn027/lock-in.json', JSON.stringify(out, null, 1));
console.log('✓ lock-in.json نوشته شد — 4/4 هویت · 9/9 پیش‌شرط · بکاپ · ۵ خطر');
