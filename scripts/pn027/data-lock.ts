// PN-027 — قفل داده: بکاپ VACUUM + MD5 + شمارش قبل
import { PrismaClient } from '@prisma/client';
import { execSync } from 'node:child_process';
import fs from 'node:fs';

const db = new PrismaClient();
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + 'Z';
const file = `/home/z/my-project/backups/pre-pn027-${ts.replace(/[-:]/g, '')}.db`;

async function main() {
  console.log('[1] VACUUM INTO →', file);
  await db.$queryRawUnsafe(`VACUUM INTO '${file}'`);
  const stat = fs.statSync(file);
  const md5 = execSync(`md5sum "${file}" | awk '{print $1}'`).toString().trim();

  console.log('[2] MD5:', md5, '· size:', (stat.size / 1024 / 1024).toFixed(1), 'MB');

  console.log('[3] شمارش قبل:');
  const counts: Record<string, number> = {};
  const tables = [
    ['PropertyRecord', 'آگهی'],
    ['RequestRecord', 'درخواست'],
    ['TransactionRecord', 'معامله'],
    ['GraphNode', 'گراف-گره'],
    ['GraphEdge', 'گراف-یال'],
    ['ExpertRecord', 'کارشناس'],
    ['User', 'کاربر'],
    ['Session', 'نشست'],
    ['AuditLog', 'حسابرسی'],
    ['AgentMemory', 'حافظه'],
    ['DecisionRecord', 'تصمیم'],
    ['OpportunityAlert', 'فرصت'],
    ['CrmSyncRun', 'crm-sync'],
    ['SyncDeadLetter', 'صف-مرده'],
  ] as const;
  for (const [t, label] of tables) {
    try {
      // @ts-expect-error dynamic model access
      counts[`${label}_${t}`] = await db[t].count();
    } catch {
      counts[`${label}_${t}`] = -1;
    }
  }
  const out = { file, md5, sizeBytes: stat.size, sizeMB: +(stat.size / 1048576).toFixed(1), countsBefore: counts, createdAt: new Date().toISOString() };
  fs.writeFileSync('/home/z/my-project/download/pn027/data-lock.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify(counts, null, 1));
  console.log('[✓] data-lock.json نوشته شد');
  await db.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
