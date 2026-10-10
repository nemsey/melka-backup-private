// PN-027 · ۵-ب — سه شاهد: remove-deps.json + remove-endpoints.json + archive-scripts.json
import fs from 'node:fs';
import { execSync } from 'node:child_process';

// ══ remove-deps.json ══
const depsRemoved = ['@dnd-kit/core','@dnd-kit/sortable','@dnd-kit/utilities','@hookform/resolvers','@mdxeditor/editor','@radix-ui/react-aspect-ratio','@radix-ui/react-context-menu','@radix-ui/react-hover-card','@radix-ui/react-menubar','@radix-ui/react-navigation-menu','@radix-ui/react-toggle-group','@reactuses/core','@tanstack/react-query','@tanstack/react-table','cmdk','date-fns','next-auth','next-intl','react-day-picker','react-markdown','react-resizable-panels','react-syntax-highlighter','sonner','uuid','vaul','zod'];
const depsOut = {
  phase: 'PN-027 · ۵-ب-۱ — حذف ۲۶ dependency زائد + ۴ کامپوننت shadcn',
  decision: 'جلسهٔ ۰۳۴ فرم ۵-ب — تأیید کامل پس از بیلد سبز',
  verificationBefore: 'راستی‌آزمایی مجدد رشته-ثابت (fixed-string) در src+tests: صفر import برای هر ۲۶ مورد — مثبت کاذب vaul (vault داخلی) رد شد',
  depsRemoved,
  componentsRemoved: ['src/components/ui/toggle.tsx', 'src/components/ui/form.tsx', 'src/components/ui/scroll-area.tsx', 'src/components/ui/chart.tsx'],
  countDeps: depsRemoved.length,
  corePreserved: 'next · react · react-dom · prisma · @prisma/client · recharts · zustand · next-themes · sharp — قید قرارداد ✓',
  newlyOrphaned: {
    note: 'سه پکیج با حذف ۴ کامپوننت يتیم شدند (خارج از فهرست مصوب ۲۶تایی — پیشنهاد جلسهٔ بعد):',
    items: ['react-hook-form (تنها مصرف‌کننده: form.tsx حذف‌شده)', '@radix-ui/react-toggle (تنها مصرف‌کننده: toggle.tsx حذف‌شده)', '@radix-ui/react-scroll-area (تنها مصرف‌کننده: scroll-area.tsx حذف‌شده)'],
  },
  buildGreen: {
    buildId: '3599bdb-20261010-0441',
    compiled: '✓ Compiled successfully در ۳۵٫۷ ثانیه',
    ramCap: 'NODE_OPTIONS=--max-old-space-size=3000 (آماده‌سازی ۵-پ-۸)',
    removedRoutesInManifest: 0,
  },
  testsAfterRemoval: '۲۴۹۶ pass / ۱ شکست یکتای پیش‌موجود (PN-014/D2 — پیش از آغاز PN-027)',
  packageJsonNow: { dependencies: 43 },
};

// ══ remove-endpoints.json ══
const endpointsOut = {
  phase: 'PN-027 · ۵-ب-۲ — ۱۲ endpoint بدون‌استفاده: ۴ نگه‌داشت + ۸ حذف (بازبینی قلم‌به‌قلم)',
  kept: [
    { route: '/crm/customer-club', reason: 'قانون دادهٔ مقدس — کاشی داده (تصمیم جلسهٔ ۰۳۴)' },
    { route: '/crm/finance', reason: 'دادهٔ ماندگار — تأیید نگه‌داشت شورا' },
    { route: '/crm/finance/commission', reason: 'دادهٔ ماندگار — تأیید نگه‌داشت شورا' },
    { route: '/gap/connection', reason: 'دستور جلسهٔ ۰۳۳ مالک: gapApi پابرجا' },
  ],
  removed: [
    { pair: '/api/crm/branches + /api/v1/crm/branches', review: 'گزینه‌های شعبه از filterOptions پاسخ فهرست‌ها ✓ · کتابخانهٔ branch-store در ۵ روت دیگر زنده (matching · export · arm-catalog×۲ · transactions) ✓ · صفر UI مصرف‌کننده · قابلیت ویرایش نقشهٔ شعبهٔ مالک (PUT/DELETE) با روت حذف می‌شود — مستند برای جلسهٔ آینده' },
    { pair: '/api/admin/drift-checks + v1', review: 'صفر مصرف‌کنندهٔ src/scripts · سرویس drift-detection در کتابخانه زنده و توسط drift-guard کاری Worker گارد می‌شود · تست مرز HTTP در pn018 بازنویسی شد' },
    { pair: '/api/admin/model-versions + v1', review: 'پنل قهرمان/چلنجر — صفر مصرف‌کننده · سرویس model-versioning-service زنده (ensureChallenger در تست مستند) · گارد audit-champion-challenger.sh کتابخانه‌سطح است ✓' },
    { pair: '/api/admin/model-versions/[id]/rollback + v1', review: 'همان خانواده — حذف جفتی' },
    { pair: '/api/admin/model-versions/[id]/reject + v1', review: 'همان خانواده — حذف جفتی' },
    { pair: '/api/admin/model-versions/[id]/promote + v1', review: 'همان خانواده — حذف جفتی' },
    { pair: '/api/runtime/metrics + v1', review: 'صفر مصرف‌کنندهٔ src · کتابخانهٔ metricsSnapshot در observability زنده · تست pn013 بازنویسی شد' },
    { pair: '/api/melk-public/sync + v1', review: 'صفر مصرف‌کننده — syncMelkPublicCatalog مستقیماً توسط catalog-daemon (Worker) کاشته می‌شود ✓ · تست p6530 اصلاح شد' },
  ],
  filesDeleted: 16,
  guardV1Equality: 'find: v0=92 = v1=92 — گارد audit-boot-secrets (تساوی شمار روت‌ها) سبز می‌ماند ✓',
  manifestUpdated: 'download/pn012/api-versioning.json: ۱۰۰ → ۹۲ روت + سابقهٔ PN-027 درج شد',
  testsUpdated: ['tests/pn016-crm-contracts.test.ts (فهرست قرارداد)', 'tests/pn018-phase7.test.ts (بلوک ۴ بازنویسی)', 'tests/pn013-observability.test.ts (بلوک مرحلهٔ ۶ بازنویسی)', 'tests/p6530-settings-order.test.ts (حذف خواندن فایل روت)'],
};

// ══ archive-scripts.json ══
const archived = JSON.parse(fs.readFileSync('/tmp/pn027-archived-final.json', 'utf8'));
const scriptsOut = {
  phase: 'PN-027 · ۵-ب-۳ — آرشیو اسکریپت‌های تاریخی (❌ رد حذف · ✅ آرشیو · صفر حذف فیزیکی)',
  decision: 'جلسهٔ ۰۳۴ فرم ۵-ب — آرشیو به docs/archive/scripts/',
  counts: {
    pn026Report: 404,
    matchingToday: 424,
    archived: archived.length,
    keptLiveRefs: 14,
    keptCurrentOrderTooling: 'scripts/pn026 (۱۳ فایل ابزار چک‌آپ اخیر) + scripts/pn027 (ابزار جاری)',
  },
  method: 'الگوی عین PN-026 فاز ۳ (verify-p\\d | p65\\d\\d | pn0\\d\\d | hotfix | dbg- | check- | analyze_) · جابه‌جایی با git mv (تاریخچهٔ کامل با git log --follow)',
  keptLiveRefs: [
    'pn006/dev-entry.sh (package.json scripts.dev)', 'pn012/escrow-manager.ts', 'pn005c/recovery-guard.sh',
    'verify-p2-03.ts', 'verify-p3-03.ts', 'pn006/perf-browser.py', 'pn001/db-counts.ts', 'pn006+pn007/baseline.ts', 'park-deliver ×۳', 'deliver.sh ×۴',
  ],
  infraUntouched: 'scripts/runtime (Worker زنده) · audit-*.sh (گاردها) · mirror/ · recovery/ · prod-watchdog.sh (در حال اجرا) · feature-factory/ · ci.sh · fingerprint.ts · log-rotate.sh',
  archiveLocation: 'docs/archive/scripts/ (ساختار درخت حفظ شد + README مستقل)',
  scriptsDirBefore: 563, scriptsDirAfter: '۱۵۵ مدخل (همهٔ ابزار زنده)',
};

fs.writeFileSync('download/pn027/remove-deps.json', JSON.stringify(depsOut, null, 1));
fs.writeFileSync('download/pn027/remove-endpoints.json', JSON.stringify(endpointsOut, null, 1));
fs.writeFileSync('download/pn027/archive-scripts.json', JSON.stringify(scriptsOut, null, 1));
console.log('✓ سه شاهد ۵-ب نوشته شد');
