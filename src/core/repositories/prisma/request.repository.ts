/**
 * PrismaRequestRepository — پیاده‌سازی Prisma قرارداد RequestRepository
 * ------------------------------------------------------
 * کوئری‌ها عین روت‌های قبل از مهاجرت (بدون تغییر معنایی):
 *  • findById            ← db.requestRecord.findUnique({ where: { id } })
 *  • findByIdWithEventsDesc ← findUnique + include events (createdAt نزولی)
 *  • updateEventArmSync  ← db.requestEventRecord.update({ where: { id }, data })
 * P6.5-10: خواندن‌های کاتالوگ «درخواست‌های ملک تبریز» — فیلتر کد/کارشناس،
 * شمارش غنی‌سازی و برش ردیف‌های در انتظار (لایه ۲ تماس درخواست‌دهنده).
 */
import type { Prisma } from "@prisma/client";
import type {
  ArmRequestBulkRow,
  ArmRequestCatalogFilter,
  ArmRequestCatalogRow,
  EnrichmentCounts,
  PendingEnrichmentRow,
  RequestEventArmSyncInput,
  RequestRecordDTO,
  RequestRepository,
  RequestWithEventsDTO,
} from "../interfaces";
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
    // P6.5-10 — نام کارشناس ثبت‌کننده و عنوان درخواست عین فهرست ARM
    ...(r.actorName !== undefined ? { actorName: r.actorName } : {}),
    ...(r.title !== undefined ? { title: r.title } : {}),
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
      // P6.5-10 — RequestRecord ستون syncedAt ندارد (کشف تست؛ رفع خطای Unknown argument)
      touchSyncedAt: false,
    });
  }

  // ===================== P6.5-10 — خواندن‌های کاتالوگ درخواست‌های ملک تبریز =====================

  /** کاتالوگ تک‌صفحه‌ای درخواست‌های ARM — فیلتر کد/نام کارشناس (contains)؛ جدیدترین اول */
  async listArmCatalog(
    filter: ArmRequestCatalogFilter,
    limit: number
  ): Promise<{ rows: ArmRequestCatalogRow[]; total: number }> {
    const where: Prisma.RequestRecordWhereInput = { source: "arm" };
    if (filter.code) where.requestCode = { contains: filter.code };
    if (filter.realtorName) where.actorName = { contains: filter.realtorName };

    const [records, total] = await Promise.all([
      this.client.requestRecord.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: limit,
        select: {
          id: true,
          requestCode: true,
          title: true,
          status: true,
          actorName: true,
          customerName: true,
          rawCustomerName: true,
          customerMobile: true,
          extractedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.client.requestRecord.count({ where }),
    ]);

    const rows: ArmRequestCatalogRow[] = records.map((r) => ({
      id: r.id,
      requestCode: r.requestCode ?? "",
      title: r.title,
      status: r.status,
      actorName: r.actorName,
      customerName: r.customerName ?? r.rawCustomerName,
      customerMobile: r.customerMobile,
      enrichedAt: r.extractedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
    return { rows, total };
  }

  /** شمارش غنی‌سازی درخواست‌های ARM — extractionBatchId تهی = در انتظار لایه ۲ */
  async countArmEnrichment(): Promise<EnrichmentCounts> {
    const whereArm: Prisma.RequestRecordWhereInput = { source: "arm" };
    const [total, pending] = await Promise.all([
      this.client.requestRecord.count({ where: whereArm }),
      this.client.requestRecord.count({ where: { source: "arm", extractionBatchId: null } }),
    ]);
    return { total, pending, complete: total - pending };
  }

  /** برش ردیف‌های در انتظار غنی‌سازی — جدیدترین اول (بیشترین ارزش فوری) */
  async listPendingArmEnrichment(maxRows: number, rowIds?: string[]): Promise<PendingEnrichmentRow[]> {
    const where: Prisma.RequestRecordWhereInput =
      rowIds && rowIds.length > 0
        ? { source: "arm", id: { in: rowIds }, extractionBatchId: null }
        : { source: "arm", extractionBatchId: null };
    const records = await this.client.requestRecord.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: maxRows,
      select: { id: true, requestCode: true },
    });
    return records.map((r) => ({ id: r.id, naturalKey: r.requestCode ?? "" }));
  }
}
