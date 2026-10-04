import { PrismaClient } from '@prisma/client'

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

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: resolvePrismaLogConfig(),
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
