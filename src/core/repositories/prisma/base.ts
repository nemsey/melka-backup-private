/**
 * پایه مشترک پیاده‌سازی‌های Prisma — PHASE 2 (P2-01)
 * ------------------------------------------------------
 * اصول:
 *  ۱) تنها لایه‌ای که db (PrismaClient) را لمس می‌کند.
 *  ۲) نمونه PrismaClient تزریق‌پذیر است — تست‌ها پایگاه ایزوله
 *     (db/test-repository.db طبق E.3) تزریق می‌کنند؛ پیش‌فرض = db تولید.
 *  ۳) خواندن‌ها ردیف Prisma را عیناً برمی‌گردانند ( typing ساختاری با DTO) —
 *     بدون نگاشت runtime ⇒ خروجی JSON روت‌ها بایت‌به‌بایت یکسان می‌ماند.
 */
import { PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";

/** نوع سازنده با تزریق کلاینت اختیاری */
export interface PrismaRepoDeps {
  client?: PrismaClient;
}

/** کلاینت پیش‌فرض (تولید) یا تزریقی (تست) */
export function resolveClient(deps?: PrismaRepoDeps): PrismaClient {
  return deps?.client ?? db;
}
