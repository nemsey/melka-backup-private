// PN-027 · ۵-ب-۲ — بازبینی قلم‌به‌قلم ۸ endpoint کاندید حذف
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const candidates = [
  '/crm/branches',
  '/admin/drift-checks',
  '/admin/model-versions',
  '/admin/model-versions/[id]/rollback',
  '/admin/model-versions/[id]/reject',
  '/admin/model-versions/[id]/promote',
  '/runtime/metrics',
  '/melk-public/sync',
];

const grepCount = (pattern: string, dirs: string) => {
  try {
    return +execSync(`grep -rF ${JSON.stringify(pattern)} ${dirs} --include='*.ts' --include='*.tsx' --include='*.sh' --include='*.py' -l 2>/dev/null | grep -v "^src/app/api" | wc -l`).toString().trim();
  } catch { return 0; }
};
const grepFiles = (pattern: string, dirs: string) => {
  try {
    return execSync(`grep -rF ${JSON.stringify(pattern)} ${dirs} --include='*.ts' --include='*.tsx' --include='*.sh' --include='*.py' -l 2>/dev/null | grep -v "^src/app/api" | head -6`).toString().trim().split('\n').filter(Boolean);
  } catch { return [] as string[] };
};

for (const route of candidates) {
  const v0 = `src/app/api${route}`;
  const v1 = `src/app/api/v1${route}`;
  const hasV0 = fs.existsSync(v0);
  const hasV1 = fs.existsSync(v1);
  // مصرف‌کننده‌ها: در src (خارج از خود روت‌ها)، Worker، تست‌ها، گاردها، اسکریپت‌ها
  const urlV0 = `/api${route}`;
  const urlV1 = `/api/v1${route}`;
  const srcUse = grepFiles(urlV0, 'src/').filter((f) => !f.startsWith('src/app/api'));
  const testUse = [...grepFiles(urlV0, 'tests/'), ...grepFiles(urlV1, 'tests/')];
  const scriptUse = [...grepFiles(urlV0, 'scripts/'), ...grepFiles(urlV1, 'scripts/')];
  const guardUse = [...grepFiles(urlV0, 'scripts/audit-*.sh')];
  console.log(`\n══ ${route} ══`);
  console.log(`  روت v0: ${hasV0 ? 'موجود' : '✗'} · آینهٔ v1: ${hasV1 ? 'موجود' : '✗'}`);
  console.log(`  مصرف‌کننده در src/ (غیر روت): ${srcUse.length ? srcUse.join(' · ') : 'صفر'}`);
  console.log(`  مصرف‌کننده در tests/: ${testUse.length ? testUse.join(' · ') : 'صفر'}`);
  console.log(`  مصرف‌کننده در scripts/: ${scriptUse.length ? scriptUse.slice(0, 4).join(' · ') : 'صفر'}`);
}

console.log('\n══ مانیفست v1 ══');
const man = execSync('grep -rn "branches\\|drift-checks\\|model-versions\\|runtime/metrics\\|melk-public" scripts/pn012/generate-v1-aliases.ts download/pn025/lock-in.json 2>/dev/null | head -8').toString();
console.log(man || 'یافت نشد');
