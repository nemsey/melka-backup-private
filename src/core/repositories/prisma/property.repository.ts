/**
 * PrismaPropertyRecordRepository — پیاده‌سازی Prisma قرارداد PropertyRecordRepository
 * ------------------------------------------------------
 * P6.5-03: رجیستری آگهی‌های ARM (مدل جدید P6.5-02 §۲.۲) — نوشتار انبوه
 * با merge non-null بر کلید طبیعی propertyCode (@unique).
 * P6.5-10: خواندن‌های کاتالوگ «آگهی‌های ملک تبریز» — فیلتر کد/کارشناس،
 * شمارش غنی‌سازی و برش ردیف‌های در انتظار (لایه ۲ تماس مالک).
 */
import type { Prisma } from "@prisma/client";
import type {
  ArmListingCatalogFilter,
  ArmListingCatalogRow,
  EnrichmentCounts,
  PendingEnrichmentRow,
  PropertyBulkInput,
  PropertyRecordRepository,
} from "../interfaces";
import { resolveClient, runBulkUpsert, type PrismaRepoDeps } from "./base";

function toPropertyData(p: PropertyBulkInput): Record<string, unknown> {
  return {
    id: p.id,
    propertyCode: p.propertyCode,
    title: p.title ?? null,
    status: p.status ?? null,
    ownerCode: p.ownerCode ?? null,
    ownerName: p.ownerName ?? null,
    branchId: p.branchId ?? null,
    cityId: p.cityId ?? null,
    areaId: p.areaId ?? null,
    areaName: p.areaName ?? null,
    lineId: p.lineId ?? null,
    lineName: p.lineName ?? null,
    address: p.address ?? null,
    propertyTypeId: p.propertyTypeId ?? null,
    propertyTypeName: p.propertyTypeName ?? null,
    tradeTypeId: p.tradeTypeId ?? null,
    tradeTypeName: p.tradeTypeName ?? null,
    price: p.price ?? null,
    pricePerMeter: p.pricePerMeter ?? null,
    meterage: p.meterage ?? null,
    rooms: p.rooms ?? null,
    floor: p.floor ?? null,
    buildYear: p.buildYear ?? null,
    description: p.description ?? null,
    detailsJson: p.detailsJson ?? null,
    ownerMobile: p.ownerMobile ?? null,
    createdAt: p.createdAt ?? null,
    // P6.5-04-e-v2 — لایه ۱ حقیقت (Raw) + provenance — هرگز توسط نرمال‌سازی تغییر نمی‌کنند
    ...(p.rawPrice !== undefined ? { rawPrice: p.rawPrice } : {}),
    ...(p.rawPriceUnit !== undefined ? { rawPriceUnit: p.rawPriceUnit } : {}),
    ...(p.rawArea !== undefined ? { rawArea: p.rawArea } : {}),
    // B.3 (P6.5-04-v2) — لایه ۱ حقیقت: نام/موبایل مالک خام
    ...(p.rawOwnerName !== undefined ? { rawOwnerName: p.rawOwnerName } : {}),
    ...(p.rawOwnerMobile !== undefined ? { rawOwnerMobile: p.rawOwnerMobile } : {}),
    ...(p.rawSourceVersion !== undefined ? { rawSourceVersion: p.rawSourceVersion } : {}),
    ...(p.extractedAt !== undefined ? { extractedAt: p.extractedAt } : {}),
    ...(p.extractionBatchId !== undefined ? { extractionBatchId: p.extractionBatchId } : {}),
    ...(p.normalizationVersion !== undefined ? { normalizationVersion: p.normalizationVersion } : {}),
  };
}

export class PrismaPropertyRecordRepository implements PropertyRecordRepository {
  private readonly client;

  constructor(deps?: PrismaRepoDeps) {
    this.client = resolveClient(deps);
  }

  async countAll(): Promise<number> {
    return this.client.propertyRecord.count();
  }

  async upsertBulk(
    rows: PropertyBulkInput[],
    opts: { sourceRunId: string }
  ): Promise<{ created: number; updated: number; duplicates: number; errors: number }> {
    return runBulkUpsert({
      rows,
      toData: toPropertyData,
      findExisting: (p) =>
        this.client.propertyRecord.findUnique({ where: { propertyCode: p.propertyCode } }) as Promise<Record<string, unknown> | null>,
      createRow: (data) => this.client.propertyRecord.create({ data: data as Prisma.PropertyRecordCreateInput }),
      updateRow: (data) =>
        this.client.propertyRecord.update({ where: { propertyCode: data.propertyCode as string }, data: data as Prisma.PropertyRecordUpdateInput }),
      sourceRunId: opts.sourceRunId,
    });
  }

  // ===================== P6.5-10 — خواندن‌های کاتالوگ آگهی‌های ملک تبریز =====================

  /** کاتالوگ تک‌صفحه‌ای — فیلتر کدآگهی/نام کارشناس (contains)؛ جدیدترین فعالیت اول */
  async listArmCatalog(
    filter: ArmListingCatalogFilter,
    limit: number
  ): Promise<{ rows: ArmListingCatalogRow[]; total: number }> {
    const where: Prisma.PropertyRecordWhereInput = {};
    if (filter.code) where.propertyCode = { contains: filter.code };
    if (filter.realtorName) where.ownerName = { contains: filter.realtorName };

    const [records, total] = await Promise.all([
      this.client.propertyRecord.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "asc" }],
        take: limit,
        select: {
          id: true,
          propertyCode: true,
          title: true,
          status: true,
          ownerName: true,
          rawOwnerName: true,
          ownerMobile: true,
          address: true,
          areaName: true,
          lineName: true,
          extractedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.client.propertyRecord.count({ where }),
    ]);

    const rows: ArmListingCatalogRow[] = records.map((r) => ({
      id: r.id,
      propertyCode: r.propertyCode,
      title: r.title,
      status: r.status,
      realtorName: r.ownerName,
      ownerName: r.rawOwnerName,
      ownerMobile: r.ownerMobile,
      address: r.address,
      areaName: r.areaName,
      lineName: r.lineName,
      enrichedAt: r.extractedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
    return { rows, total };
  }

  /** شمارش غنی‌سازی — extractionBatchId تهی = در انتظار لایه ۲ */
  async countEnrichment(): Promise<EnrichmentCounts> {
    const [total, pending] = await Promise.all([
      this.client.propertyRecord.count(),
      this.client.propertyRecord.count({ where: { extractionBatchId: null } }),
    ]);
    return { total, pending, complete: total - pending };
  }

  /** برش ردیف‌های در انتظار غنی‌سازی — جدیدترین اول (بیشترین ارزش فوری) */
  async listPendingEnrichment(maxRows: number, rowIds?: string[]): Promise<PendingEnrichmentRow[]> {
    const where: Prisma.PropertyRecordWhereInput =
      rowIds && rowIds.length > 0
        ? { id: { in: rowIds }, extractionBatchId: null }
        : { extractionBatchId: null };
    const records = await this.client.propertyRecord.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: maxRows,
      select: { id: true, propertyCode: true },
    });
    return records.map((r) => ({ id: r.id, naturalKey: r.propertyCode }));
  }

  /** P6.5-11 (بند پ-۵) — تماس مالک ملک بر اساس کدآگهی‌ها (دسته‌ای)
   * فقط خواندن ستون‌های موجود: rawOwnerName (لایه ۱ حقیقت) + ownerMobile (نرمال‌شده) */
  async findOwnerContactsByCodes(
    propertyCodes: string[]
  ): Promise<Array<{ propertyCode: string; ownerName: string | null; ownerMobile: string | null }>> {
    if (propertyCodes.length === 0) return [];
    const codes = [...new Set(propertyCodes)];
    const records = await this.client.propertyRecord.findMany({
      where: { propertyCode: { in: codes } },
      select: { propertyCode: true, rawOwnerName: true, ownerMobile: true },
    });
    return records.map((r) => ({ propertyCode: r.propertyCode, ownerName: r.rawOwnerName, ownerMobile: r.ownerMobile }));
  }
}
