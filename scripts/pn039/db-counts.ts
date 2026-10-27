// PN-039 · شمارش زندهٔ چهار فهرست (شاهد گام ۲)
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
async function main() {
  const out: Record<string, unknown> = {}
  out.PropertyRecord = await db.propertyRecord.count()
  out.RequestRecord = await db.requestRecord.count()
  out.TransactionRecord = await db.transactionRecord.count()
  out.ExpertRecord = await db.expertRecord.count()
  // تازه‌ترین رکورد هر فهرست — برای سنجش «بروزرسانی پس از اتصال رله»
  const lastProp = await db.propertyRecord.findFirst({ orderBy: { id: 'desc' }, select: { id: true } })
  const lastReq = await db.requestRecord.findFirst({ orderBy: { id: 'desc' }, select: { id: true } })
  out.lastPropertyId = lastProp?.id
  out.lastRequestId = lastReq?.id
  console.log(JSON.stringify(out, null, 2))
}
main().finally(() => db.$disconnect())
