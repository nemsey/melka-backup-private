/**
 * PrismaPropertyRecordRepository — پیاده‌سازی Prisma قرارداد PropertyRecordRepository
 * ------------------------------------------------------
 * P6.5-03: رجیستری آگهی‌های ARM (مدل جدید P6.5-02 §۲.۲) — نوشتار انبوه
 * با merge non-null بر کلید طبیعی propertyCode (@unique).
 * خواندن‌های غنی (فیلتر منطقه/قیمت) در P6.5-05/08 به همین قرارداد افزوده می‌شوند.
 */
import type { Prisma } from "@prisma/client";
import type { PropertyBulkInput, PropertyRecordRepository } from "../interfaces";
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
}
