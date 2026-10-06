/**
 * PrismaContractRepository — پیاده‌سازی Prisma قرارداد ContractRepository
 */
import type { Prisma } from "@prisma/client";
import type { ContractDTO, ContractRepository, ContractUpsertInput, AgencyLookupRow } from "../interfaces";
import { resolveClient, runBulkUpsert, type PrismaRepoDeps } from "./base";

function toCreateData(c: ContractUpsertInput): Prisma.ContractRecordCreateInput {
  return {
    id: c.id,
    status: c.status,
    contractHolo: c.contractHolo,
    propertyCode: c.propertyCode,
    requestCode: c.requestCode,
    contractType: c.contractType,
    creatorName: c.creatorName,
    createdAt: c.createdAt,
    contractDate: c.contractDate,
    documentDate: c.documentDate,
    deliveryDate: c.deliveryDate,
    propertyTitle: c.propertyTitle,
    propertyAddress: c.propertyAddress,
    buyerListJson: c.buyerListJson,
    sellerListJson: c.sellerListJson,
    realtorListJson: c.realtorListJson,
    canAddRealtor: c.canAddRealtor,
    // P6.5-12 — مبالغ مالی قرارداد
    ...(c.contractPrice !== undefined ? { contractPrice: c.contractPrice } : {}),
    ...(c.rawContractPrice !== undefined ? { rawContractPrice: c.rawContractPrice } : {}),
    ...(c.comisionOfContract !== undefined ? { comisionOfContract: c.comisionOfContract } : {}),
    ...(c.taxOfContract !== undefined ? { taxOfContract: c.taxOfContract } : {}),
    ...(c.businessId !== undefined ? { businessId: c.businessId } : {}),
    // P6.5-04-e-v2 — سه‌لایه حقیقت (خام + provenance)
    ...(c.rawDate !== undefined ? { rawDate: c.rawDate } : {}),
    // B.3 (P6.5-04-v2) — لایه ۱ حقیقت: نام ثبت‌کننده و عنوان ملک خام
    ...(c.rawCreatorName !== undefined ? { rawCreatorName: c.rawCreatorName } : {}),
    ...(c.rawPropertyTitle !== undefined ? { rawPropertyTitle: c.rawPropertyTitle } : {}),
    ...(c.rawSourceVersion !== undefined ? { rawSourceVersion: c.rawSourceVersion } : {}),
    ...(c.extractedAt !== undefined ? { extractedAt: c.extractedAt } : {}),
    ...(c.extractionBatchId !== undefined ? { extractionBatchId: c.extractionBatchId } : {}),
    ...(c.normalizationVersion !== undefined ? { normalizationVersion: c.normalizationVersion } : {}),
  } as Prisma.ContractRecordCreateInput;
}

export class PrismaContractRepository implements ContractRepository {
  private readonly client;

  constructor(deps?: PrismaRepoDeps) {
    this.client = resolveClient(deps);
  }

  async findAll(): Promise<ContractDTO[]> {
    return this.client.contractRecord.findMany();
  }

  async findAllOrderByCreatedAtDesc(): Promise<ContractDTO[]> {
    return this.client.contractRecord.findMany({ orderBy: { createdAt: "desc" } });
  }

  async countAll(): Promise<number> {
    return this.client.contractRecord.count();
  }

  /** P6.5-12 — کارگزاری‌های صادره (special-properties) — فقط خواندن برای فهرست معاملات */
  async listAgencyLookups(): Promise<AgencyLookupRow[]> {
    return this.client.specialPropertyRecord.findMany({
      select: {
        id: true,
        propertyCode: true,
        propertyId: true,
        realtorName: true,
        creatorName: true,
        payPercent: true,
        sellPrice: true,
        detailsJson: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async replaceAll(rows: ContractUpsertInput[]): Promise<number> {
    await this.client.$transaction([
      this.client.contractRecord.deleteMany({}),
      ...rows.map((c) => this.client.contractRecord.create({ data: toCreateData(c) })),
    ]);
    return rows.length;
  }

  async upsertBatch(rows: ContractUpsertInput[]): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;
    for (const c of rows) {
      const existing = await this.client.contractRecord.findUnique({ where: { id: c.id }, select: { id: true } });
      await this.client.contractRecord.upsert({
        where: { id: c.id },
        create: toCreateData(c),
        update: toCreateData(c),
      });
      if (existing) updated += 1;
      else created += 1;
    }
    return { created, updated };
  }

  async deleteAll(): Promise<void> {
    await this.client.contractRecord.deleteMany({});
  }

  /** P6.5-03 — انبوه با merge non-null (§۲.۴) + محافظت sourceRunId (§۱.۹) */
  async upsertBulk(rows: ContractUpsertInput[], opts: { sourceRunId: string }): Promise<{ created: number; updated: number; duplicates: number; errors: number }> {
    return runBulkUpsert({
      rows,
      toData: (c) => toCreateData(c) as unknown as Record<string, unknown>,
      findExisting: (c) => this.client.contractRecord.findUnique({ where: { id: c.id } }) as Promise<Record<string, unknown> | null>,
      createRow: (data) => this.client.contractRecord.create({ data: data as Prisma.ContractRecordCreateInput }),
      updateRow: (data) => this.client.contractRecord.update({ where: { id: data.id as string }, data: data as Prisma.ContractRecordUpdateInput }),
      sourceRunId: opts.sourceRunId,
    });
  }
}
