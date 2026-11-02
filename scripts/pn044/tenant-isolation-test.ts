/**
 * PN-044/فاز ۴ — تست جداسازی tenant در سطح repo (پیش از بیلد).
 * اجرا: bun scripts/pn044/tenant-isolation-test.ts
 */
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()

async function main() {
  console.log("=== PN-044 Phase 4 — tenant isolation (repo-level) ===")
  const [tabP, mkP] = await Promise.all([
    db.propertyRecord.count({ where: { tenantId: "melk-tabriz" } }),
    db.propertyRecord.count({ where: { tenantId: "melketun" } }),
  ])
  const [tabR, mkR] = await Promise.all([
    db.requestRecord.count({ where: { tenantId: "melk-tabriz" } }),
    db.requestRecord.count({ where: { tenantId: "melketun" } }),
  ])
  const [tabT, mkT] = await Promise.all([
    db.transactionRecord.count({ where: { tenantId: "melk-tabriz" } }),
    db.transactionRecord.count({ where: { tenantId: "melketun" } }),
  ])
  const [tabE, mkE] = await Promise.all([
    db.expertRecord.count({ where: { tenantId: "melk-tabriz" } }),
    db.expertRecord.count({ where: { tenantId: "melketun" } }),
  ])
  console.log(`PropertyRecord:    tabriz=${tabP} · melketun=${mkP}  (期待 27868 / 49)`)
  console.log(`RequestRecord:     tabriz=${tabR} · melketun=${mkR}  (期待 25580 / 19)`)
  console.log(`TransactionRecord: tabriz=${tabT} · melketun=${mkT}  (期待 798 / 0)`)
  console.log(`ExpertRecord:      tabriz=${tabE} · melketun=${mkE}  (期待 296 / 0)`)

  const ok = tabP === 27868 && mkP === 49 && tabR === 25580 && mkR === 19 && tabT === 798 && mkT === 0 && tabE === 296 && mkE === 0
  console.log(ok ? "✅ TENANT ISOLATION PERFECT — tabriz untouched, melketun isolated" : "❌ MISMATCH — investigate")
  process.exit(ok ? 0 : 1)
}

main().catch((e) => {
  console.error("FATAL:", e)
  process.exit(1)
})
