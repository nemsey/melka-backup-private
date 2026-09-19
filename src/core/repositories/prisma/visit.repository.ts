/**
 * PrismaVisitRepository — پیاده‌سازی Prisma قرارداد VisitRepository
 */
import type { Prisma } from "@prisma/client";
import type {
  VisitDTO,
  VisitListFilter,
  VisitRepository,
  VisitScopeQuery,
  VisitUpsertInput,
  ScopeFilter,
  ScopedVisitRepository,
} from "../interfaces";
import { personalScopeClause } from "../interfaces";
import { resolveClient, runBulkUpsert, type PrismaRepoDeps } from "./base";
import { auditAccess } from "@/lib/audit";

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
    // P6.5-04-e-v2 — provenance سه‌لایه حقیقت
    ...(v.rawSourceVersion !== undefined ? { rawSourceVersion: v.rawSourceVersion } : {}),
    ...(v.extractedAt !== undefined ? { extractedAt: v.extractedAt } : {}),
    ...(v.extractionBatchId !== undefined ? { extractionBatchId: v.extractionBatchId } : {}),
    ...(v.normalizationVersion !== undefined ? { normalizationVersion: v.normalizationVersion } : {}),
  } as Prisma.VisitRecordCreateInput;
}

export class PrismaVisitRepository implements ScopedVisitRepository {
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

  /** P6.5-03 — انبوه با merge non-null (§۲.۴) + محافظت sourceRunId (§۱.۹) */
  async upsertBulk(rows: VisitUpsertInput[], opts: { sourceRunId: string }): Promise<{ created: number; updated: number; duplicates: number; errors: number }> {
    return runBulkUpsert({
      rows,
      toData: (v) => toCreateData(v) as unknown as Record<string, unknown>,
      findExisting: (v) => this.client.visitRecord.findUnique({ where: { id: v.id } }) as Promise<Record<string, unknown> | null>,
      createRow: (data) => this.client.visitRecord.create({ data: data as Prisma.VisitRecordCreateInput }),
      updateRow: (data) => this.client.visitRecord.update({ where: { id: data.id as string }, data: data as Prisma.VisitRecordUpdateInput }),
      sourceRunId: opts.sourceRunId,
    });
  }

  /**
   * P6.5-02 (§۵.۲/§۵.۳) — فهرست Scope-دار بازدیدها.
   * ماتریس دامنه: VisitRecord = داده «شخصی» با ستون انتساب جدید ownerCode
   * (مشتق از checker در زمان Import) ⇒ CONSULTANT خودش · BRANCH شعبه · OWNER همه.
   * fail-closed (§۵.۶-۵): ردیف بدون انتساب (ownerCode/branchId تهی — تمام ردیف‌های
   * موجود تا پیش از Bulk) برای CONSULTANT/BRANCH نامرئی و فقط برای OWNER مرئی است.
   * فیلتر v1 (buildVisitWhere) با شرط دامنه ترکیب می‌شود. AuditLog هر فراخوانی (§۶.۲).
   * tenantId حمل می‌شود اما فیلتر فعال نیست — مصوبه §۱۴ شورا (PHASE 8+).
   */
  async findWithScope(query: VisitScopeQuery, scope: ScopeFilter): Promise<VisitDTO[]> {
    const clause = personalScopeClause(scope);
    if (clause.kind === "DENY_ALL") {
      await auditAccess(scope, "READ", "visit", 0, "deny-closed:no-personnel-code", { client: this.client });
      return [];
    }
    const where = buildVisitWhere(query.filter);
    if (clause.kind === "PERSONAL") where.ownerCode = clause.code;
    else if (clause.kind === "BRANCH") where.branchId = clause.branchId;
    const rows = await this.client.visitRecord.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...(query.take !== undefined ? { take: query.take } : {}),
    });
    await auditAccess(scope, "READ", "visit", rows.length, undefined, { client: this.client });
    return rows;
  }
}
