import { PrismaClient } from '@prisma/client'
import { requestNormColumns, propertyNormColumns } from './search-norm'

/**
 * پیکربندی لاگ Prisma — HOTFIX-06 (D1)
 * ------------------------------------------------------
 * `log: ['query']` دائمی در production ممنوع است: هر کوئری روی stdout
 * ثبت می‌شد (نویز، افشای داده در لاگ، بار I/O).
 *   توسعه:  ['warn', 'error'] — هشدارها دیده می‌شوند، کوئری‌ها نه
 *   تولید:  ['error']        — فقط خطاها
 */
export function resolvePrismaLogConfig(): Array<'query' | 'info' | 'warn' | 'error'> {
  return process.env.NODE_ENV === 'production' ? ['error'] : ['warn', 'error']
}

/**
 * PN-027 · ۵-پ-۱/۲ (جلسهٔ ۰۳۴) — پسوند ستون‌های سایهٔ نرمال
 * ---------------------------------------------------------------------------
 * فیلترهای متنی M1/M2 اکنون در سطح SQL روی ستون‌های نرمال اعمال می‌شوند؛
 * بنابراین «هر» نوشتن در RequestRecord/PropertyRecord باید ستون‌های نرمال را
 * تازه کند. این پسوند در لایهٔ کلاینت مرکزی اعمال می‌شود تا هیچ مسیر نوشتن
 * (ثبت دستی · درج انبوه CRM · همگام‌سازی کاتالوگ · بذر تست‌ها) جا نیفتد —
 * درس تست PN-002 §۳-۵ که بذر مستقیم بدون نرمال نوشت و فیلتر خالی برگرداند.
 *
 * قواعد:
 *   · create/createMany/upsert.create → محاسبهٔ کامل از دادهٔ حاضر
 *   · update/upsert.update → اگر فیلد منبعی نوشته می‌شود: یک findFirst برای
 *     ادغام با مقادیر موجود (نوشتن جزئی کم‌بسامد است — هزینهٔ یک خواندن ایندکس‌دار)
 *   · updateMany با دادهٔ جزئی نام‌محور → هشدار قابل مشاهده + پرش (تازگی در نوشتن بعدی)
 *   · $executeRaw* از پسوند رد می‌شود — بک‌فیل/اسکریپت‌های خام خودشان مسؤول‌اند
 */

type AnyRecord = Record<string, unknown>

const REQ_SOURCE_FIELDS = ['customerName', 'rawCustomerName', 'customerMobile', 'sanadNames', 'actorName'] as const
const PROP_SOURCE_FIELDS = ['ownerName', 'rawOwnerName', 'ownerMobile', 'address', 'areaName', 'lineName'] as const

function hasFields(data: AnyRecord | undefined, fields: readonly string[]): boolean {
  return !!data && fields.some((f) => f in data)
}
function hasAllFields(data: AnyRecord | undefined, fields: readonly string[]): boolean {
  return !!data && fields.every((f) => f in data)
}
function pickPresent(data: AnyRecord, fields: readonly string[]): AnyRecord {
  const out: AnyRecord = {}
  for (const f of fields) if (f in data) out[f] = data[f]
  return out
}

async function mergeRequestSources(base: PrismaClient, where: AnyRecord, upd: AnyRecord): Promise<AnyRecord> {
  try {
    const existing = (await base.requestRecord.findFirst({
      where: where as never,
      select: { customerName: true, rawCustomerName: true, customerMobile: true, sanadNames: true, actorName: true },
    })) as AnyRecord | null
    return { ...(existing ?? {}), ...pickPresent(upd, REQ_SOURCE_FIELDS) }
  } catch {
    return pickPresent(upd, REQ_SOURCE_FIELDS)
  }
}

async function mergePropertySources(base: PrismaClient, where: AnyRecord, upd: AnyRecord): Promise<AnyRecord> {
  try {
    const existing = (await base.propertyRecord.findFirst({
      where: where as never,
      select: { ownerName: true, rawOwnerName: true, ownerMobile: true, address: true, areaName: true, lineName: true },
    })) as AnyRecord | null
    return { ...(existing ?? {}), ...pickPresent(upd, PROP_SOURCE_FIELDS) }
  } catch {
    return pickPresent(upd, PROP_SOURCE_FIELDS)
  }
}

/** هشدار ساخت‌یافته (قانون لاگ — فقط src/lib/logger مجاز است console بزند) */
async function warnNormStale(table: string): Promise<void> {
  try {
    const { logEvent } = await import('./logger')
    logEvent({
      level: 'warn',
      category: 'system',
      operation: 'search-norm-partial-update',
      status: 'ok',
      detail: { table, note: 'updateMany جزئی نام‌محور — ستون نرمال در نوشتن کامل بعدی تازه می‌شود' },
    })
  } catch {
    /* بهترین-تلاش */
  }
}

function createDbWithNormExtension(): PrismaClient {
  const base = new PrismaClient({ log: resolvePrismaLogConfig() })
  try {
    const extended = base.$extends({
      query: {
        requestRecord: {
          async create({ args, query }) {
            args.data = { ...(args.data as AnyRecord), ...requestNormColumns(args.data as AnyRecord) } as never
            return query(args)
          },
          async createMany({ args, query }) {
            if (Array.isArray(args.data)) {
              args.data = args.data.map((d) => ({ ...(d as AnyRecord), ...requestNormColumns(d as AnyRecord) })) as never
            } else {
              args.data = { ...(args.data as AnyRecord), ...requestNormColumns(args.data as AnyRecord) } as never
            }
            return query(args)
          },
          async upsert({ args, query }) {
            args.create = { ...(args.create as AnyRecord), ...requestNormColumns(args.create as AnyRecord) } as never
            const upd = args.update as AnyRecord
            if (hasFields(upd, REQ_SOURCE_FIELDS)) {
              args.update = { ...upd, ...requestNormColumns(await mergeRequestSources(base, args.where as AnyRecord, upd)) } as never
            }
            return query(args)
          },
          async update({ args, query }) {
            const upd = args.data as AnyRecord
            if (hasFields(upd, REQ_SOURCE_FIELDS)) {
              args.data = { ...upd, ...requestNormColumns(await mergeRequestSources(base, args.where as AnyRecord, upd)) } as never
            }
            return query(args)
          },
          async updateMany({ args, query }) {
            const upd = args.data as AnyRecord
            if (hasAllFields(upd, REQ_SOURCE_FIELDS)) {
              args.data = { ...upd, ...requestNormColumns(upd) } as never
            } else if (hasFields(upd, REQ_SOURCE_FIELDS)) {
              void warnNormStale("RequestRecord")
            }
            return query(args)
          },
        },
        propertyRecord: {
          async create({ args, query }) {
            args.data = { ...(args.data as AnyRecord), ...propertyNormColumns(args.data as AnyRecord) } as never
            return query(args)
          },
          async createMany({ args, query }) {
            if (Array.isArray(args.data)) {
              args.data = args.data.map((d) => ({ ...(d as AnyRecord), ...propertyNormColumns(d as AnyRecord) })) as never
            } else {
              args.data = { ...(args.data as AnyRecord), ...propertyNormColumns(args.data as AnyRecord) } as never
            }
            return query(args)
          },
          async upsert({ args, query }) {
            args.create = { ...(args.create as AnyRecord), ...propertyNormColumns(args.create as AnyRecord) } as never
            const upd = args.update as AnyRecord
            if (hasFields(upd, PROP_SOURCE_FIELDS)) {
              args.update = { ...upd, ...propertyNormColumns(await mergePropertySources(base, args.where as AnyRecord, upd)) } as never
            }
            return query(args)
          },
          async update({ args, query }) {
            const upd = args.data as AnyRecord
            if (hasFields(upd, PROP_SOURCE_FIELDS)) {
              args.data = { ...upd, ...propertyNormColumns(await mergePropertySources(base, args.where as AnyRecord, upd)) } as never
            }
            return query(args)
          },
          async updateMany({ args, query }) {
            const upd = args.data as AnyRecord
            if (hasAllFields(upd, PROP_SOURCE_FIELDS)) {
              args.data = { ...upd, ...propertyNormColumns(upd) } as never
            } else if (hasFields(upd, PROP_SOURCE_FIELDS)) {
              void warnNormStale("PropertyRecord")
            }
            return query(args)
          },
        },
      },
    })
    return extended as unknown as PrismaClient
  } catch (e) {
    void (async () => {
      try {
        const { logEvent } = await import('./logger')
        logEvent({ level: 'warn', category: 'system', operation: 'search-norm-init', status: 'fail', detail: { error: String(e) } })
      } catch {
        /* بهترین-تلاش */
      }
    })()
    return base
  }
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db = globalForPrisma.prisma ?? createDbWithNormExtension()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
