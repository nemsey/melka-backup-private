// PN-027 · ۵-ب-۳ — آرشیو امن اسکریپت‌های تاریخی (صفر حذف فیزیکی · git mv)
// الگو: عین PN-026 فاز ۳ + استثناهای ارجاع‌شدهٔ زنده
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = '/home/z/my-project';
const pattern = /\/(verify-p\d|p65\d\d|pn0\d\d|hotfix|dbg-|check-|analyze_)/;

// ۱) فهرست کامل کاندیدها
const all = execSync(`find ${ROOT}/scripts -type f \\( -name '*.ts' -o -name '*.py' -o -name '*.sh' -o -name '*.js' -o -name '*.mjs' \\) 2>/dev/null`, { maxBuffer: 1024 * 1024 * 64 }).toString().trim().split('\n').filter(Boolean);
const candidates = all.filter((f) => pattern.test(f));
console.log('کاندیدهای آرشیو (الگوی PN-026):', candidates.length);

// ۲) متن‌های مرجع زنده
const pkg = fs.readFileSync(`${ROOT}/package.json`, 'utf8');
const liveScripts = all.filter((f) => !pattern.test(f)); // اسکریپت‌های زنده (runtime, audit, mirror, ...)
const liveContent = liveScripts.map((f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } }).join('\n');
// محتوای src و tests و تنظیمات
const srcRefs = execSync(`grep -rn "scripts/" ${ROOT}/src --include='*.ts' --include='*.tsx' -l 2>/dev/null | head -50`).toString().trim().split('\n').filter(Boolean)
  .map((f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } }).join('\n');
const testRefs = execSync(`grep -rln "scripts/" ${ROOT}/tests --include='*.ts' 2>/dev/null | head -80`).toString().trim().split('\n').filter(Boolean)
  .map((f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } }).join('\n');
const ciSh = fs.readFileSync(`${ROOT}/scripts/ci.sh`, 'utf8');
const allLiveText = pkg + '\n' + liveContent + '\n' + srcRefs + '\n' + testRefs + '\n' + ciSh;

// ۳) تفکیک: آرشیو vs ماندن
const toArchive: string[] = [];
const toKeep: { f: string; reason: string }[] = [];
for (const f of candidates) {
  const rel = f.replace(ROOT + '/', '');
  if (pkg.includes(rel)) { toKeep.push({ f: rel, reason: 'ارجاع در package.json' }); continue; }
  // ارجاع در کد زنده (اسکریپت غیر-تاریخی · src · tests · ci)
  const base = path.basename(f);
  if (allLiveText.includes(rel) || (liveScripts.some(() => false))) { toKeep.push({ f: rel, reason: 'ارجاع در کد/اسکریپت زنده' }); continue; }
  if (allLiveText.includes(base) && new RegExp(`scripts/[^'"\\s]*${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(allLiveText)) {
    toKeep.push({ f: rel, reason: 'ارجاع نام-پایه در کد زنده' }); continue;
  }
  toArchive.push(f);
}
console.log('آرشیو:', toArchive.length, '· ماندن (ارجاع زنده):', toKeep.length);
for (const k of toKeep) console.log('  نگه‌داشت:', k.f, '—', k.reason);

fs.writeFileSync('/tmp/pn027-archive-list.json', JSON.stringify({ toArchive, toKeep }, null, 1));
console.log('✓ فهرست در /tmp/pn027-archive-list.json');
