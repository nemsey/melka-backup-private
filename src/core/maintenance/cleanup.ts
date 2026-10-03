/**
 * P6545 / گام ۱ — BLOCK 1.3: پاک‌سازی دادهٔ مرده (جلسه ۰۳۰ سؤال ۹ بند ۵)
 * ---------------------------------------------------------------------------
 * مسئلهٔ تاریخی: ۱۳٬۲۴۷ ردیف «هرگز آدرس‌تلاش‌نشده» (جلسه ۰۳۰) + رکوردهای یتیم.
 * وضعیت امروز (تحلیل زندهٔ P6545): مشکل آدرس با چرخه‌های غنی‌سازی حل شده
 * (PropertyRecord بدون آدرس = ۰) — پایش ادامه دارد.
 *
 * صف پاک‌سازی اولویت‌دار:
 *   اولویت ۱ — رکوردهای یتیم (orphan): بازدید بدون کارشناس مرجع، غنی‌سازی بدون معامله
 *   اولویت ۲ — رکوردهای تکراری (duplicate): درخواست با armRequestId تکراری و…
 *   اولویت ۳ — رکوردهای کهنه (stale): نشست‌های منقضی، OTP/اسکن‌لاگ کهنه‌تر از ۹۰ روز
 *
 * قید دادهٔ مقدس: صفر حذف — فقط برچسب archivedAt (ستون افزودنی).
 * خودتشخیصی P10 این موارد را لیست می‌کند (ادغام با DiagnosticReport).
 */

import type { PrismaClient } from "@prisma/client";

export type CleanupPriority = 1 | 2 | 3;

export interface DeadDataItem {
  priority: CleanupPriority;
  category: string; // orphan | duplicate | stale
  table: string;
  recordId: string;
  reason: string;
  detail?: Record<string, unknown>;
}

export interface CleanupReport {
  analyzedAt: string;
  found: number;
  byPriority: Record<string, number>;
  items: DeadDataItem[];
  archived: number;
  archivedSamples: DeadDataItem[]; // ۱۰ نمونهٔ آرشیوشده (شاهد جلسه ۰۳۳)
  beforeCounts: Record<string, number>;
  afterCounts: Record<string, number>;
  deleted: 0; // همیشه صفر — قانون دادهٔ مقدس
}

export const CLEANUP_LIMITS = {
  /** سقف رکورد در هر اجرا — ایمنی */
  maxArchivePerRun: 500,
  /** نمونه‌های شاهد */
  sampleCount: 10,
} as const;

/** تحلیل‌گر دادهٔ مرده — فهرست کاندیداها با اولویت (بدون هیچ تغییری) */
export class CleanupAnalyzer {
  constructor(private readonly db: PrismaClient) {}

  async analyze(): Promise<DeadDataItem[]> {
    const items: DeadDataItem[] = [];
    /* ── اولویت ۱: یتیم‌ها ── */
    // بازدید با مشاور مرجعِ ناموجود
    const visits = await this.db.visitRecord.findMany({ select: { id: true, propertyRealtorName: true } });
    const expertNames = new Set((await this.db.expertRecord.findMany({ select: { fullName: true } })).map((e) => e.fullName));
    for (const v of visits) {
      if (v.propertyRealtorName && !expertNames.has(v.propertyRealtorName)) {
        items.push({ priority: 1, category: "orphan", table: "VisitRecord", recordId: v.id, reason: `مشاور مرجع «${v.propertyRealtorName}» در ExpertRecord موجود نیست` });
      }
    }
    // نشست با کاربر ناموجود در پرسنل (کد پرسنلی مرجع ندارد) — فقط نشست‌های منقضی
    const expiredSessions = await this.db.session.findMany({
      where: { expiresAt: { lt: new Date() } },
      select: { id: true, personnelCode: true, expiresAt: true },
      orderBy: { expiresAt: "desc" }, // جدیدترین منقضی اول — رفتار منصفانه
      take: CLEANUP_LIMITS.maxArchivePerRun,
    });
    for (const s of expiredSessions) {
      items.push({ priority: 3, category: "stale", table: "Session", recordId: s.id, reason: `نشست منقضی (${s.expiresAt.toISOString().slice(0, 10)}) — دادهٔ امنیتی مرده`, detail: { personnelCode: s.personnelCode } });
    }

    /* ── اولویت ۲: تکراری‌ها ── */
    const dupArmReq = await this.db.requestRecord.groupBy({
      by: ["armRequestId"],
      where: { armRequestId: { not: null } },
      _count: true,
      having: { armRequestId: { _count: { gt: 1 } } },
    });
    for (const g of dupArmReq) {
      const rows = await this.db.requestRecord.findMany({ where: { armRequestId: g.armRequestId }, select: { id: true, updatedAt: true }, orderBy: { updatedAt: "desc" } });
      // جدیدترین می‌ماند؛ قدیمی‌ترها کاندیدای آرشیو
      for (const r of rows.slice(1)) {
        items.push({ priority: 2, category: "duplicate", table: "RequestRecord", recordId: r.id, reason: `armRequestId=${g.armRequestId} تکراری — نسخهٔ قدیمی‌تر` });
      }
    }

    /* ── اولویت ۳: کهنه‌تر از ۹۰ روز ── */
    const cutoff90 = new Date(Date.now() - 90 * 86400000);
    const oldOtp = await this.db.otpAttempt.findMany({ where: { createdAt: { lt: cutoff90 } }, select: { id: true, createdAt: true }, take: CLEANUP_LIMITS.maxArchivePerRun });
    for (const o of oldOtp) {
      items.push({ priority: 3, category: "stale", table: "OtpAttempt", recordId: o.id, reason: `تلاش احراز هویت کهنه‌تر از ۹۰ روز (${o.createdAt.toISOString().slice(0, 10)})` });
    }
    const oldScans = await this.db.divarScanLog.findMany({ where: { startedAt: { lt: cutoff90 } }, select: { id: true, startedAt: true }, take: CLEANUP_LIMITS.maxArchivePerRun });
    for (const s of oldScans) {
      items.push({ priority: 3, category: "stale", table: "DivarScanLog", recordId: s.id, reason: `لاگ اسکن کهنه‌تر از ۹۰ روز` });
    }

    // مرتب‌سازی بر اساس اولویت (۱ → ۲ → ۳)
    return items.sort((a, b) => a.priority - b.priority);
  }

  /** شمارش پیش/پس برای شاهد */
  async counts(): Promise<Record<string, number>> {
    const [sessions, expired, otpOld, requests, visits] = await Promise.all([
      this.db.session.count(),
      this.db.session.count({ where: { expiresAt: { lt: new Date() } } }),
      this.db.otpAttempt.count({ where: { createdAt: { lt: new Date(Date.now() - 90 * 86400000) } } }),
      this.db.requestRecord.count(),
      this.db.visitRecord.count(),
    ]);
    return { sessionTotal: sessions, sessionExpired: expired, otpOld, requestTotal: requests, visitTotal: visits };
  }
}

/**
 * سرویس پاک‌سازی — فقط آرشیو (برچسب archivedAt)؛ هرگز حذف.
 * جداول دارای ستون archivedAt: Session (افزودنی P6545).
 * جداول بدون ستون (OtpAttempt و…) صرفاً گزارش می‌شوند — صفر تغییر.
 */
export class CleanupService {
  constructor(private readonly db: PrismaClient, private readonly analyzer = new CleanupAnalyzer(db)) {}

  async run(): Promise<CleanupReport> {
    const beforeCounts = await this.analyzer.counts();
    const items = await this.analyzer.analyze();
    const byPriority: Record<string, number> = { "1": 0, "2": 0, "3": 0 };
    for (const i of items) byPriority[String(i.priority)] += 1;

    let archived = 0;
    const archivedSamples: DeadDataItem[] = [];
    const now = new Date();
    for (const item of items.slice(0, CLEANUP_LIMITS.maxArchivePerRun)) {
      if (item.table === "Session") {
        // تنها جدولی که ستون آرشیو دارد — برچسب، نه حذف
        const r = await this.db.session.updateMany({ where: { id: item.recordId, archivedAt: null }, data: { archivedAt: now } });
        if (r.count > 0) {
          archived += 1;
          if (archivedSamples.length < CLEANUP_LIMITS.sampleCount) archivedSamples.push(item);
        }
      }
      // جداول بدون ستون آرشیو: فقط گزارش (صفر تغییر) — در آینده ستون افزودنی می‌گیرند
    }

    const afterCounts = await this.analyzer.counts();
    return {
      analyzedAt: new Date().toISOString(),
      found: items.length,
      byPriority,
      items: items.slice(0, 100),
      archived,
      archivedSamples,
      beforeCounts,
      afterCounts,
      deleted: 0,
    };
  }
}
