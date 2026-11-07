/**
 * PN-044/فاز ۳.۴ — تست دستی sync ملکتون (یک بار، قبل از بیلد).
 * اجرا: bun scripts/pn044/sync-test.ts
 */
import { syncMelketun } from "../../src/lib/integrations/melketun/sync"
import { PrismaClient } from "@prisma/client"

async function main() {
  console.log("=== PN-044 Phase 3.4 — manual sync test ===")
  const result = await syncMelketun()
  console.log("sync result:", JSON.stringify(result, null, 2))

  // شمارش tenant ها پس از sync (طبق دستور ۳.۴)
  const db = new PrismaClient()
  try {
    const [tabrizP, melketunP] = await Promise.all([
      db.propertyRecord.count({ where: { tenantId: "melk-tabriz" } }),
      db.propertyRecord.count({ where: { tenantId: "melketun" } }),
    ])
    const [tabrizR, melketunR] = await Promise.all([
      db.requestRecord.count({ where: { tenantId: "melk-tabriz" } }),
      db.requestRecord.count({ where: { tenantId: "melketun" } }),
    ])
    console.log(`PropertyRecord: tabriz=${tabrizP} melketun=${melketunP}`)
    console.log(`RequestRecord:  tabriz=${tabrizR} melketun=${melketunR}`)
    if (tabrizP !== 27868 || tabrizR !== 25580) {
      console.log("❌ TABRIZ DATA CHANGED — STOP!")
      process.exit(1)
    }
    console.log("✅ tabriz data untouched (27868/25580) · melketun rows synced")
  } finally {
    await db.$disconnect()
  }
}

main().catch((e) => {
  console.error("FATAL:", e)
  process.exit(1)
})
