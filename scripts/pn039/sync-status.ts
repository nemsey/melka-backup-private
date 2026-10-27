// PN-039 · وضعیت ایستگاه‌های همگام‌سازی چهار فهرست (شاهد گام ۲)
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function main() {
  const out: Record<string, unknown> = {}

  // ۱) ایستگاه‌های همگام‌سازی
  try {
    const cps = await (db as unknown as { syncCheckpoint: { findMany: () => Promise<unknown[]> } }).syncCheckpoint.findMany()
    out.checkpoints = cps
  } catch (e) {
    out.checkpoints = 'ERR: ' + (e as Error).message.slice(0, 120)
  }

  // ۲) صف رله — سلامت
  try {
    const relay = (db as unknown as {
      relayQueue: { groupBy: (a: unknown) => Promise<Array<{ status: string; _count: { _all: number } }>> }
    }).relayQueue
    out.relayQueueByStatus = await relay.groupBy({ by: ['status'], _count: { _all: true } })
  } catch (e) {
    out.relayQueueByStatus = 'ERR: ' + (e as Error).message.slice(0, 120)
  }

  // ۳) تازه‌ترین داده: جدیدترین syncedAt ملک و createdAt درخواست
  out.lastPropertySyncedAt = (await db.propertyRecord.findFirst({ orderBy: { syncedAt: 'desc' }, select: { syncedAt: true } }))?.syncedAt
  out.lastPropertyStatusDate = (await db.propertyRecord.findFirst({ orderBy: { statusDate: 'desc' }, select: { statusDate: true } }))?.statusDate
  out.lastRequestCreatedAt = (await db.requestRecord.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true } }))?.createdAt
  out.lastRequestExtractedAt = (await db.requestRecord.findFirst({ orderBy: { extractedAt: 'desc' }, select: { extractedAt: true } }))?.extractedAt

  console.log(JSON.stringify(out, null, 2))
}
main().finally(() => db.$disconnect())
