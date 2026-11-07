/**
 * TTL فایل‌های فایل‌یابی — PN-059 (دستور مالک ۱۴۰۵/۰۸/۱۱ · رابع)
 * ---------------------------------------------------------------------------
 * «فایل‌های استخراج‌شده در کاشی فایل‌یابی (شکار + پیگیری + بررسی) چنانچه
 *  مالک اقدامی روی آن‌ها انجام نداد، به‌صورت خودکار بعد از سه روز حذف شود
 *  و موارد جدید جایگزین گردد.»
 *
 * قاعده:
 *   · دامنه: هر سه سطل — bucket in (hunt · follow · review)
 *   · «اقدام نکرده» = status='active' (نه registered، نه rejected —
 *     اقدام مالک مقدس است و هرگز حذف نمی‌شود)
 *   · «سه روز» = firstSeenAt < now − ۷۲h (از نخستین استخراج)
 *   · جایگزینی: اسکن بعدی دیوار توکن‌های تازه را با firstSeenAt تازه
 *     می‌آورد (موارد جدید به‌طور طبیعی جای خالی را پر می‌کنند)
 *
 * مستثنای مجاز قانون دادهٔ مقدس (الگوی relay-jobs): این حذف حکم صریح
 * مالک است + شاهد AuditLog بدون PII خام (قانون ۱۰ — فقط شمارنده).
 *
 * خاموشی: MELK_DIVAR_FILE_TTL=disabled
 */

import { db } from "@/lib/db";

/** قاعدهٔ دستور مالک: سه روز */
export const DIVAR_FILE_TTL_DAYS = 3;

export interface DivarFileTtlResult {
  ok: boolean;
  deleted: number;
  remainingActive: number;
  scannedAt: string;
}

/** اجرای یک چرخهٔ TTL — حذف فایل‌های بی‌اقدامِ بیش از سه روز */
export async function runDivarFileTtl(): Promise<DivarFileTtlResult> {
  const cutoff = new Date(Date.now() - DIVAR_FILE_TTL_DAYS * 24 * 60 * 60 * 1000);
  const deleted = await db.divarAd.deleteMany({
    where: {
      status: "active", // مالک اقدامی نکرده است
      firstSeenAt: { lt: cutoff },
    },
  });
  const remainingActive = await db.divarAd.count({ where: { status: "active" } });

  // شاهد حسابرسی — بدون PII خام (قانون ۱۰)
  try {
    await db.auditLog.create({
      data: {
        action: "DIVAR_FILE_TTL",
        actor: "worker-divar-file-ttl",
        operation: "DELETE",
        entityType: "divar-ad",
        recordCount: deleted.count,
        accessScope: "OWNER",
        tenantId: "melk-tabriz",
        detail: `rule=unactioned>3d buckets=hunt,follow,review deleted=${deleted.count} remainingActive=${remainingActive}`,
      },
    });
  } catch {
    /* شاهد هرگز چرخه را نمی‌شکند */
  }

  return {
    ok: true,
    deleted: deleted.count,
    remainingActive,
    scannedAt: new Date().toISOString(),
  };
}
