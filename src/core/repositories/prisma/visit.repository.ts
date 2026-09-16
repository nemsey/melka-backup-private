/**
 * PrismaVisitRepository — پیاده‌سازی Prisma قرارداد VisitRepository
 */
import type { Prisma } from "@prisma/client";
import type { VisitDTO, VisitListFilter, VisitRepository, VisitUpsertInput } from "../interfaces";
import { resolveClient, type PrismaRepoDeps } from "./base";

function buildVisitWhere(filter?: VisitListFilter): Prisma.VisitRecordWhereInput {
  const where: Prisma.VisitRecordWhereInput = {};
  if (!filter) return where;
  if (filter.propertyCode) where.propertyCode = { contains: filter.propertyCode };
  if (filter.requester) where.requesterName = { contains: filter.requester };
  if (filter.checker) where.checkerName = { contains: filter.checker };
  if (filter.status) where.status = { contains: filter.status };
  if (filter.dateFrom || filter.dateTo) {
    where.createdAt = {
      ...(filter.dateFrom ? { gte: new Date(`${filter.dateFrom}T00:00:00`) } : {}),
      ...(filter.dateTo ? { lte: new Date(`${filter.dateTo}T23:59:59.999`) } : {}),
    };
  }
  return where;
}

function toCreateData(v: VisitUpsertInput): Prisma.VisitRecordCreateInput {
  return {
    id: v.id,
    propertyCode: v.propertyCode,
    requesterName: v.requesterName,
    checkerName: v.checkerName,
    propertyRealtorName: v.propertyRealtorName,
    checkTime: v.checkTime,
    createdAt: v.createdAt,
    status: v.status,
  };
}

export class PrismaVisitRepository implements VisitRepository {
  private readonly client;

  constructor(deps?: PrismaRepoDeps) {
    this.client = resolveClient(deps);
  }

  async findAll(): Promise<VisitDTO[]> {
    return this.client.visitRecord.findMany();
  }

  async listWithSummary(
    filter: VisitListFilter,
    limit: number,
    offset: number
  ): Promise<{ rows: VisitDTO[]; total: number; summary: { totalCount: number; checkedCount: number; distinctPropertyCodes: number; distinctRequesters: number } }> {
    const where = buildVisitWhere(filter);

    const [rows, total, checkedCount, distinctCodes, distinctRequesters] = await Promise.all([
      this.client.visitRecord.findMany({ where, orderBy: { createdAt: "desc" }, take: limit, skip: offset }),
      this.client.visitRecord.count({ where }),
      this.client.visitRecord.count({ where: { ...where, checkTime: { not: null } } }),
      this.client.visitRecord.findMany({ where, select: { propertyCode: true } }).then((rs) => new Set(rs.map((r) => r.propertyCode)).size),
      this.client.visitRecord.findMany({ where, select: { requesterName: true } }).then((rs) => new Set(rs.map((r) => r.requesterName)).size),
    ]);

    return {
      rows,
      total,
      summary: {
        totalCount: total,
        checkedCount,
        distinctPropertyCodes: distinctCodes,
        distinctRequesters: distinctRequesters,
      },
    };
  }

  async countAll(): Promise<number> {
    return this.client.visitRecord.count();
  }

  async replaceAll(rows: VisitUpsertInput[]): Promise<number> {
    await this.client.$transaction([
      this.client.visitRecord.deleteMany({}),
      ...rows.map((v) => this.client.visitRecord.create({ data: toCreateData(v) })),
    ]);
    return rows.length;
  }

  async upsertBatch(rows: VisitUpsertInput[]): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;
    for (const v of rows) {
      const existing = await this.client.visitRecord.findUnique({ where: { id: v.id }, select: { id: true } });
      await this.client.visitRecord.upsert({
        where: { id: v.id },
        create: toCreateData(v),
        update: toCreateData(v),
      });
      if (existing) updated += 1;
      else created += 1;
    }
    return { created, updated };
  }

  async deleteAll(): Promise<void> {
    await this.client.visitRecord.deleteMany({});
  }
}
