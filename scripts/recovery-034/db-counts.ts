// recovery-034 — شمارش رکوردهای DB (فقط-خواندنی) — طبق دستور ملکا-شورا-۱۴۰۵-۰۳۴ BLOCK 0.3
// استفاده: bun scripts/recovery-034/db-counts.ts <مسیر-db>
import { Database } from 'bun:sqlite'
import { copyFileSync } from 'node:fs'

const path = process.argv[2]
if (!path) {
  console.error('usage: bun db-counts.ts <db-path>')
  process.exit(1)
}

const tables = [
  'PropertyRecord',
  'ListingRecord',
  'RequestRecord',
  'TransactionRecord',
  'ExpertRecord',
  'ExpertProfile',
  'Session',
  'AuditLog',
]

let db: Database
try {
  db = new Database(path, { readonly: true })
} catch (e) {
  const tmp = '/home/z/my-project/scripts/recovery-034/scratch/tmp-count.db'
  copyFileSync(path, tmp)
  db = new Database(tmp, { readonly: true })
}

console.log(`# DB: ${path}`)
for (const t of tables) {
  try {
    const row = db.query(`SELECT COUNT(*) AS c FROM "${t}"`).get() as { c: number }
    console.log(`${t}: ${row.c}`)
  } catch (e: any) {
    console.log(`${t}: ERR ${String(e?.message || e).slice(0, 90)}`)
  }
}
db.close()
