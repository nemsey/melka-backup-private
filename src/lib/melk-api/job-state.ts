/**
 * P6545 / گام ۱ — BLOCK 1.1: سرویس وضعیت کار پس‌زمینه (جلسه ۰۳۰ سؤال ۹)
 * ---------------------------------------------------------------------------
 * مسئله: پیشرفت کارهای پس‌زمینه فقط در حافظهٔ فرایند بود — با ری‌استارت سرور،
 * نمایش پیشرفت گم می‌شد (داده محفوظ بود ولی وضعیت نه).
 *
 * راه‌حل: جدول SyncJobState در دیتابیس + این سرویس برای خواندن/نوشتن.
 * الگوی الزامی جلسه ۰۳۳: jobId, lastCompletedPage, resumedFrom, updatedAt.
 *
 * اصل داده اول، سپس چک‌پوینت: lastCompletedPage فقط پس از نوشتن کامل صفحه
 * جلو می‌رود؛ resumedFrom = lastCompletedPage + 1 (هرگز شروع از صفر).
 */

import type { PrismaClient } from "@prisma/client";

export type SyncJobKind = "catalog" | "enrichment" | "sync";
export type SyncJobStatus = "idle" | "running" | "paused" | "done" | "failed";

export interface JobStateUpsertInput {
  jobId: string;
  jobKind: SyncJobKind;
  status?: SyncJobStatus;
  lastCompletedPage?: number;
  totalPages?: number;
  detail?: Record<string, unknown>;
}

export interface JobStateView {
  jobId: string;
  jobKind: string;
  status: string;
  lastCompletedPage: number;
  resumedFrom: number;
  totalPages: number;
  progressPercent: number;
  detail: Record<string, unknown> | null;
  updatedAt: string;
}

/** شناسه‌های کارهای شناخته‌شده (منبع یگانه) */
export const JOB_IDS = {
  catalogListings: "catalog-listings",
  catalogRequests: "catalog-requests",
  enrichListings: "catalog-enrich-listings",
  enrichRequests: "catalog-enrich-requests",
  mainSync: "main-sync",
} as const;

export class JobStateService {
  constructor(private readonly db: PrismaClient) {}

  /** نوشتن/به‌روزرسانی وضعیت کار — upsert امن در برابر هم‌پوشانی */
  async upsert(input: JobStateUpsertInput): Promise<JobStateView> {
    const lastCompletedPage = Math.max(0, input.lastCompletedPage ?? 0);
    const totalPages = Math.max(0, input.totalPages ?? 0);
    const progressPercent =
      totalPages > 0 ? Math.min(100, Math.round((lastCompletedPage / totalPages) * 1000) / 10) : 0;
    const row = await this.db.syncJobState.upsert({
      where: { jobId: input.jobId },
      create: {
        jobId: input.jobId,
        jobKind: input.jobKind,
        status: input.status ?? "running",
        lastCompletedPage,
        resumedFrom: lastCompletedPage + 1,
        totalPages,
        progressPercent,
        detailJson: input.detail ? JSON.stringify(input.detail) : null,
      },
      update: {
        jobKind: input.jobKind,
        ...(input.status ? { status: input.status } : {}),
        ...(input.lastCompletedPage !== undefined ? { lastCompletedPage } : {}),
        ...(input.totalPages !== undefined ? { totalPages } : {}),
        ...(input.lastCompletedPage !== undefined
          ? { resumedFrom: lastCompletedPage + 1, progressPercent }
          : {}),
        ...(input.detail ? { detailJson: JSON.stringify(input.detail) } : {}),
      },
    });
    return this.toView(row);
  }

  /** خواندن وضعیت یک کار — پس از ری‌استارت سرور همین منبع حقیقت است */
  async get(jobId: string): Promise<JobStateView | null> {
    const row = await this.db.syncJobState.findUnique({ where: { jobId } });
    return row ? this.toView(row) : null;
  }

  /** فهرست همهٔ کارها — برای UI تنظیمات عمومی */
  async list(): Promise<JobStateView[]> {
    const rows = await this.db.syncJobState.findMany({ orderBy: { jobId: "asc" } });
    return rows.map((r) => this.toView(r));
  }

  /**
   * نقطهٔ ازسرگیری: صفحه‌ای که کار باید از آن ادامه یابد.
   * اگر کار تازه است → ۱ (شروع)؛ اگر نیمه‌کاره → lastCompletedPage + 1 (ادامه).
   */
  async resumePoint(jobId: string, fallback = 1): Promise<number> {
    const state = await this.get(jobId);
    if (!state) return fallback;
    if (state.status === "done") return 1; // چرخهٔ تازه
    return Math.max(1, state.resumedFrom);
  }

  private toView(row: {
    jobId: string; jobKind: string; status: string; lastCompletedPage: number;
    resumedFrom: number; totalPages: number; progressPercent: number;
    detailJson: string | null; updatedAt: Date;
  }): JobStateView {
    let detail: Record<string, unknown> | null = null;
    if (row.detailJson) {
      try { detail = JSON.parse(row.detailJson); } catch { detail = null; }
    }
    return {
      jobId: row.jobId, jobKind: row.jobKind, status: row.status,
      lastCompletedPage: row.lastCompletedPage, resumedFrom: row.resumedFrom,
      totalPages: row.totalPages, progressPercent: row.progressPercent,
      detail, updatedAt: row.updatedAt.toISOString(),
    };
  }
}
