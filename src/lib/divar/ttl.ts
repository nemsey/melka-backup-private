/**
 * TTL فایل‌های فایل‌یابی — PN-059 (دستور مالک ۱۴۰۵/۰۸/۱۱ · رابع) → PN-084 (گارد گرسنگی)
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
 * PN-084 — گارد گرسنگی (قانون بقای داده): پیش‌فرض قانون مالک بر «جایگزینی با
 * موارد جدید» استوار است. وقتی اسکن موفق دیوار در پنجرهٔ TTL نبوده (قطعی،
 * خطا، غیبت)، پاک‌سازی = خالی‌شدن کاشی بدون جایگزین = نقض غرض قانون.
 * در آن حالت چرخهٔ TTL صرفاً صرف‌نظر می‌کند و شاهد ثبت می‌کند. با
 * MELK_DIVAR_TTL_GUARD=disabled قابل بازبسته‌شدن است.
 *
 * مستثنای مجاز قانون دادهٔ مقدس (الگوی relay-jobs): این حذف حکم صریح
 * مالک است + شاهد AuditLog بدون PII خام (قانون ۱۰ — فقط شمارنده).
 *
 * خاموشی کل TTL: MELK_DIVAR_FILE_TTL=disabled
 */

import { db } from "@/lib/db";

/** قاعدهٔ دستور مالک: سه روز */
export const DIVAR_FILE_TTL_DAYS = 3;

/** PN-084 — خاموشی گارد گرسنگی در لحظهٔ فراخوان خوانده می‌شود (تست‌پذیر) */
export function ttlStarvationGuardDisabled(): boolean {
  return process.env.MELK_DIVAR_TTL_GUARD === "disabled";
}

export interface DivarFileTtlResult {
  ok: boolean;
  deleted: number;
  remainingActive: number;
  scannedAt: string;
  /** PN-084 — چرخه به‌خاطر گرسنگی اسکن صرف‌نظر کرد (صفر حذف) */
  skipped?: "starvation-guard";
  /** PN-084 — زمان آخرین اسکن موفق دیوار (null = هرگز) */
  lastSuccessfulScanAt?: string | null;
}

/** اجرای یک چرخهٔ TTL — حذف فایل‌های بی‌اقدامِ بیش از سه روز (با گارد گرسنگی) */
export async function runDivarFileTtl(): Promise<DivarFileTtlResult> {
  const cutoff = new Date(Date.now() - DIVAR_FILE_TTL_DAYS * 24 * 60 * 60 * 1000);

  // PN-084 — گارد گرسنگی: اگر اسکن موفقی در پنجرهٔ TTL نبوده، جایگزینی ممکن نیست
  const lastScan = await db.divarScanLog
    .findFirst({ where: { error: null }, orderBy: { startedAt: "desc" }, select: { startedAt: true } })
    .catch(() => null);
  const lastScanAt = lastScan?.startedAt ?? null;
  const lastScanIso = lastScanAt ? new Date(lastScanAt).toISOString() : null;
  const scanIsFresh = lastScanAt != null && new Date(lastScanAt).getTime() >= cutoff.getTime();

  if (!ttlStarvationGuardDisabled() && !scanIsFresh) {
    const remainingActive = await db.divarAd.count({ where: { status: "active" } }).catch(() => 0);
    try {
      await db.auditLog.create({
        data: {
          action: "DIVAR_FILE_TTL_SKIPPED",
          actor: "worker-divar-file-ttl",
          operation: "NONE",
          entityType: "divar-ad",
          recordCount: 0,
          accessScope: "OWNER",
          tenantId: "melk-tabriz",
          detail: `rule=starvation-guard lastSuccessfulScan=${lastScanIso ?? "none"} remainingActive=${remainingActive} — حذف بدون جایگزین ممنوع (PN-084)`,
        },
      });
    } catch {
      /* شاهد هرگز چرخه را نمی‌شکند */
    }
    return {
      ok: true,
      deleted: 0,
      remainingActive,
      scannedAt: new Date().toISOString(),
      skipped: "starvation-guard",
      lastSuccessfulScanAt: lastScanIso,
    };
  }

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
    lastSuccessfulScanAt: lastScanIso,
  };
}
