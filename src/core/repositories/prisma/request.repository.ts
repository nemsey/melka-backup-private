/**
 * PrismaRequestRepository — پیاده‌سازی Prisma قرارداد RequestRepository
 * ------------------------------------------------------
 * کوئری‌ها عین روت‌های قبل از مهاجرت (بدون تغییر معنایی):
 *  • findById            ← db.requestRecord.findUnique({ where: { id } })
 *  • findByIdWithEventsDesc ← findUnique + include events (createdAt نزولی)
 *  • updateEventArmSync  ← db.requestEventRecord.update({ where: { id }, data })
 */
import type { Prisma } from "@prisma/client";
import type { ArmRequestBulkRow, RequestEventArmSyncInput, RequestRecordDTO, RequestRepository, RequestWithEventsDTO } from "../interfaces";
import { resolveClient, runBulkUpsert, type PrismaRepoDeps } from "./base";

function toArmRequestData(r: ArmRequestBulkRow): Record<string, unknown> {
  return {
    id: r.id,
    source: "arm",
    customerName: r.customerName ?? null,
    customerMobile: r.customerMobile ?? null,
    status: r.status ?? "ready",
    requestCode: r.requestCode,
    actorCode: r.actorCode ?? "arm",
    ...(r.createdAt ? { createdAt: r.createdAt } : {}),
    // B.3 (P6.5-04-v2) — لایه ۱ حقیقت: نام/موبایل مشتری خام
    ...(r.rawCustomerName !== undefined ? { rawCustomerName: r.rawCustomerName } : {}),
    ...(r.rawCustomerMobile !== undefined ? { rawCustomerMobile: r.rawCustomerMobile } : {}),
    // P6.5-04-e-v2 — provenance سه‌لایه حقیقت
    ...(r.rawSourceVersion !== undefined ? { rawSourceVersion: r.rawSourceVersion } : {}),
    ...(r.extractedAt !== undefined ? { extractedAt: r.extractedAt } : {}),
    ...(r.extractionBatchId !== undefined ? { extractionBatchId: r.extractionBatchId } : {}),
    ...(r.normalizationVersion !== undefined ? { normalizationVersion: r.normalizationVersion } : {}),
  };
}

export class PrismaRequestRepository implements RequestRepository {
  private readonly client;

  constructor(deps?: PrismaRepoDeps) {
    this.client = resolveClient(deps);
  }

  async findById(id: string): Promise<RequestRecordDTO | null> {
    return this.client.requestRecord.findUnique({ where: { id } });
  }

  async findByIdWithEventsDesc(id: string): Promise<RequestWithEventsDTO | null> {
    return this.client.requestRecord.findUnique({
      where: { id },
      include: { events: { orderBy: { createdAt: "desc" } } },
    });
  }

  async updateEventArmSync(eventId: string, input: RequestEventArmSyncInput): Promise<void> {
    await this.client.requestEventRecord.update({
      where: { id: eventId },
      data: {
        armEventId: input.armEventId,
        armSyncedAt: input.armSyncedAt,
        armPropertyId: input.armPropertyId,
        armSyncJson: input.armSyncJson,
      },
    });
  }

  /**
   * P6.5-03 — درج/به‌روزرسانی انبوه درخواست‌های ARM (§۱.۲ طراحی):
   * source='arm' + کلید طبیعی requestCode (ستون افزودنی @unique).
   * merge non-null: actorCode/id/source هرگز با تهی بازنویسی نمی‌شوند؛
   * رکوردهای دستی موجود (source='manual') با این کلید تصادم نمی‌کنند (requestCode تهی).
   */
  async upsertArmBulk(rows: ArmRequestBulkRow[], opts: { sourceRunId: string }): Promise<{ created: number; updated: number; duplicates: number; errors: number }> {
    return runBulkUpsert({
      rows,
      toData: toArmRequestData,
      findExisting: (r) => this.client.requestRecord.findUnique({ where: { requestCode: r.requestCode } }) as Promise<Record<string, unknown> | null>,
      createRow: (data) => this.client.requestRecord.create({ data: data as Prisma.RequestRecordCreateInput }),
      updateRow: (data) => this.client.requestRecord.update({ where: { requestCode: data.requestCode as string }, data: data as Prisma.RequestRecordUpdateInput }),
      sourceRunId: opts.sourceRunId,
    });
  }
}
