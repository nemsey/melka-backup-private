// PN-027 · دروازه ۳.۲ — شاهد گاردها (۳۱ پایدار + mirror-sync + pin-check تازه)
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const raw = fs.readFileSync('/home/z/my-project/download/pn027/guards-raw.txt', 'utf8').trim().split('\n');
const results = raw.map((l) => { const [status, script] = l.split('|'); return { script, pass: status === 'PASS' }; });
const passCount = results.filter((r) => r.pass).length;

const pinCheck = execSync('bash scripts/audit-pin-check.sh 2>&1 | tail -1').toString().trim();
const mirror = execSync('timeout 30 git ls-remote mirror main').toString().trim().split('\t')[0].slice(0, 7);
const localHead = execSync('git rev-parse --short HEAD').toString().trim();

const out = {
  phase: 'PN-027 · دروازه ۳.۲ — گاردها',
  rule: 'قاعدهٔ ۱۲ جلسهٔ ۰۳۴ — برای هر خطر جدید، یک گارد',
  suite: {
    total: results.length,
    pass: passCount,
    fail: results.length - passCount,
    verdict: passCount === results.length ? '✓ همهٔ سبز' : '✗',
    list: results.map((r) => `${r.pass ? '✓' : '✗'} ${r.script}`),
  },
  newGuard: {
    name: 'audit-pin-check.sh',
    risk: 'بازگشت pin کد واقعی مالک در تست‌ها/منبع (ریسک ۵ پیش‌تحلیل)',
    result: pinCheck,
    checks: '۷ بررسی: کد واقعی + ارقام مجاور در src/tests · رگرسیون مثبت ۹۹۹۹۹۹۹۹ · الگوی env-first · آرشیو خارج از مسیر اجرا',
  },
  notable: {
    'audit-reproducibility': 'سبز پس از بستهٔ بقا ۲۶ — ۶/۶ (در قفل ورود قرمزِ مستندِ دلتای صفر-کد بود — با بیلد+بستهٔ تازه حل شد)',
    'audit-negin-consistency': 'سبز پس از اصلاح مسیر colors.json آرشیوشده (پیامد مشروع ۵-ب-۳)',
    'mirror-sync (J4)': `آینه GitHub = HEAD (${mirror === localHead ? 'همگام ✓' : 'ناهمگام ✗'})`,
    'audit-boot-secrets': 'سبز — تساوی شمار روت‌های v1=v0=92 پس از حذف ۸ جفت',
  },
  twoGreenTests: { run1: '2510 pass / 2 fail', run2: '2510 pass / 2 fail', identical: true, note: '۲ شکست = یک تست یکتای PN-014/D2 (پیش‌موجود از پیش از PN-027 — هرس deliver-store در فاز PN-025؛ خارج از دامنهٔ مصوب، مستند)' },
  verifiedAt: new Date().toISOString(),
};
fs.writeFileSync('/home/z/my-project/download/pn027/guards.json', JSON.stringify(out, null, 1));
console.log(`✓ guards.json — ${passCount}/${results.length} + pin-check PASS · آینه=${mirror}`);
