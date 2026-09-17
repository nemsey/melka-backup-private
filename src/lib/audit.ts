/**
 * auditAccess — رد حسابرسی دسترسی داده (P6.5-02 / §۶.۲ طراحی PHASE-6.5)
 * ------------------------------------------------------
 * فراخوانی از Service/Repository پس از هر findWithScope و هر نوشتار Bulk.
 *
 * قرارداد (عین §۶.۲):
 *   auditAccess(session, operation, entityType, recordCount, detail?)
 *
 * اصول:
 *  ۱) AuditLog از امروز append-only است — این تابع فقط create صدا می‌زند (قاعده ۱۴).
 *  ۲) شکست نوشتن = خطای ثبت‌شده در logger ولی «سد» عملیات نیست (Availability)؛
 *     استثنای آینده: Bulk واقعی (P6.5-03+) که در آن شکست audit = توقف.
 *  ۳) پارامتر اختیاری deps.client برای تزریق کلاینت ایزوله تست (الگوی PrismaRepoDeps)
 *     — پیش‌فرض db تولید؛ رد حسابرسی همیشه در همان پایگاهِ دادهِ کوئری می‌نشیند.
 *  ۴) tenantId از default اسکیما ('melk-tabriz') می‌آید — تک‌منبع حقیقت تا PHASE 8+.
 *  ۵) action ثابت 'DATA_ACCESS' — فیلد action موجود برای سازگاری v1 حفظ شد؛
 *     تمایز خواندن/نوشتن با ستون جدید operation صریح می‌شود (§۶.۱).
 */
import type { PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { logEvent } from "@/lib/logger";

/** نوع عملیات دسترسی (§۶.۱) */
export type AuditOperation = "READ" | "WRITE" | "DELETE";

/** شکل ساختاری نشست برای حسابرسی — عین قرارداد §۶.۲ */
export interface AuditAccessSession {
  personnelCode: string;
  accessScope?: string | null;
  branchId?: string | null;
}

/**
 * ثبت رد حسابرسی دسترسی داده — غیرمسدودکننده.
 * @param session نشست درخواست‌کننده (کد پرسنلی + دامنه + شعبه)
 * @param operation READ | WRITE | DELETE
 * @param entityType transaction | customer | listing | request | visit | contract | property
 * @param recordCount تعداد رکوردهای درگیر این دسترسی
 * @param detail توضیح اختیاری (بدون داده حساس — پاکسازی در logger)
 * @param deps تزریق کلاینت اختیاری (تست ایزوله)
 */
export async function auditAccess(
  session: AuditAccessSession,
  operation: AuditOperation,
  entityType: string,
  recordCount: number,
  detail?: string,
  deps?: { client?: PrismaClient }
): Promise<void> {
  const client = deps?.client ?? db;
  try {
    await client.auditLog.create({
      data: {
        action: "DATA_ACCESS",
        actor: session.personnelCode,
        detail: detail ?? null,
        operation,
        entityType,
        recordCount,
        accessScope: session.accessScope ?? "OWNER",
        // tenantId: عمداً داده نمی‌شود — default اسکیما ('melk-tabriz') اعمال می‌شود (§۱۴)
      },
    });
  } catch (err) {
    // §۶.۲ — Availability: شکست audit سد عملیات نیست؛ فقط رویداد خطا در logger.
    logEvent({
      level: "warn",
      category: "system",
      operation: "audit-access",
      status: "fail",
      errorCode: "AUDIT_WRITE_FAIL",
      userId: session.personnelCode,
      detail: {
        entityType,
        operation,
        recordCount,
        reason: err instanceof Error ? err.message : String(err),
      },
    });
  }
}
