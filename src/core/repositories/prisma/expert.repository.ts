/**
 * PrismaExpertRepository — پیاده‌سازی Prisma قرارداد ExpertRepository
 * ------------------------------------------------------
 * شامل غنی‌سازی «مجموع تعاملات هر مشاور» (groupBy عین روت crm/experts)
 * و فهرست تعاملات (روت crm/interactions).
 */
import type { Prisma } from "@prisma/client";
import type {
  ExpertDTO,
  ExpertDistinctFields,
  ExpertListFilter,
  ExpertRepository,
  ExpertUpsertInput,
  ExpertWithInteractionsDTO,
  InteractionDTO,
  InteractionUpsertInput,
} from "../interfaces";
import { resolveClient, type PrismaRepoDeps } from "./base";

function buildExpertWhere(filter?: ExpertListFilter): Prisma.ExpertRecordWhereInput {
  const where: Prisma.ExpertRecordWhereInput = {};
  if (!filter) return where;
  if (filter.fullName) where.fullName = { contains: filter.fullName };
  if (filter.mobile) where.mobile = { contains: filter.mobile };
  if (filter.personnelCode) where.personnelCode = { contains: filter.personnelCode };
  if (filter.role) where.role = { contains: filter.role };
  if (filter.businessTitle) where.businessTitle = { contains: filter.businessTitle };
  if (filter.creator) where.creator = { contains: filter.creator };
  if (filter.active === true || filter.active === false) where.active = filter.active;
  return where;
}

export class PrismaExpertRepository implements ExpertRepository {
  private readonly client;

  constructor(deps?: PrismaRepoDeps) {
    this.client = resolveClient(deps);
  }

  async findAll(): Promise<ExpertDTO[]> {
    return this.client.expertRecord.findMany();
  }

  async listWithInteractions(options: {
    filter?: ExpertListFilter;
    sortDir?: "asc" | "desc";
    limit?: number;
    offset?: number;
  }): Promise<{ rows: ExpertWithInteractionsDTO[]; total: number }> {
    const where = buildExpertWhere(options.filter);
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;

    const [rows, total] = await Promise.all([
      this.client.expertRecord.findMany({
        where,
        orderBy: { fullName: options.sortDir === "desc" ? "desc" : "asc" },
        take: limit,
        skip: offset,
      }),
      this.client.expertRecord.count({ where }),
    ]);

    // مجموع تعاملات هر مشاور — عین groupBy دوتایی روت قبلی
    const names = rows.map((r) => r.fullName);
    const [reqGrouped, propGrouped] = await Promise.all([
      this.client.interactionRecord.groupBy({
        by: ["requestRealtorName"],
        where: { requestRealtorName: { in: names } },
        _sum: { count: true },
      }),
      this.client.interactionRecord.groupBy({
        by: ["propertyRealtorName"],
        where: { propertyRealtorName: { in: names } },
        _sum: { count: true },
      }),
    ]);
    const reqMap = new Map<string, number>(reqGrouped.map((g): [string, number] => [g.requestRealtorName, g._sum.count ?? 0]));
    const propMap = new Map<string, number>(propGrouped.map((g): [string, number] => [g.propertyRealtorName, g._sum.count ?? 0]));

    const enriched: ExpertWithInteractionsDTO[] = rows.map((r) => {
      const asRequester = reqMap.get(r.fullName) ?? 0;
      const asPropertyRealtor = propMap.get(r.fullName) ?? 0;
      return {
        ...r,
        interactionTotal: asRequester + asPropertyRealtor,
      };
    });
    return { rows: enriched, total };
  }

  async distinctFilterFields(): Promise<ExpertDistinctFields> {
    const [roles, businesses, creators] = await Promise.all([
      this.client.expertRecord.findMany({ distinct: ["role"], select: { role: true } }),
      this.client.expertRecord.findMany({ distinct: ["businessTitle"], select: { businessTitle: true } }),
      this.client.expertRecord.findMany({ distinct: ["creator"], select: { creator: true } }),
    ]);
    return {
      roles: roles.map((r) => r.role),
      businesses: businesses.map((b) => b.businessTitle),
      creators: creators.map((c) => c.creator),
    };
  }

  async listInteractions(filter: { realtor?: string }): Promise<{ rows: InteractionDTO[]; total: number }> {
    let where: Prisma.InteractionRecordWhereInput = {};
    if (filter.realtor) {
      where = {
        OR: [{ requestRealtorName: { contains: filter.realtor } }, { propertyRealtorName: { contains: filter.realtor } }],
      };
    }
    const [rows, total] = await Promise.all([
      this.client.interactionRecord.findMany({
        where,
        orderBy: { count: "desc" },
        take: 1000,
      }),
      this.client.interactionRecord.count({ where }),
    ]);
    return { rows, total };
  }

  async countAll(): Promise<number> {
    return this.client.expertRecord.count();
  }

  async replaceAll(rows: ExpertUpsertInput[]): Promise<number> {
    await this.client.$transaction([
      this.client.expertRecord.deleteMany({}),
      ...rows.map((e) =>
        this.client.expertRecord.create({
          data: {
            id: e.id,
            personnelCode: e.personnelCode,
            fullName: e.fullName,
            mobile: e.mobile,
            role: e.role,
            businessTitle: e.businessTitle,
            creator: e.creator,
            active: e.active,
            createdAt: e.createdAt,
          },
        })
      ),
    ]);
    return rows.length;
  }

  async upsertBatch(rows: ExpertUpsertInput[]): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;
    for (const e of rows) {
      // کلید طبیعی: personnelCode (کد پرسنلی سامانه ARM)
      const existing = await this.client.expertRecord.findUnique({ where: { personnelCode: e.personnelCode }, select: { id: true } });
      await this.client.expertRecord.upsert({
        where: { personnelCode: e.personnelCode },
        create: {
          id: e.id,
          personnelCode: e.personnelCode,
          fullName: e.fullName,
          mobile: e.mobile,
          role: e.role,
          businessTitle: e.businessTitle,
          creator: e.creator,
          active: e.active,
          createdAt: e.createdAt,
        },
        update: {
          fullName: e.fullName,
          mobile: e.mobile,
          role: e.role,
          businessTitle: e.businessTitle,
          creator: e.creator,
          active: e.active,
          createdAt: e.createdAt,
        },
      });
      if (existing) updated += 1;
      else created += 1;
    }
    return { created, updated };
  }

  async deleteAll(): Promise<void> {
    await this.client.expertRecord.deleteMany({});
  }

  /** جایگزینی تعاملات — فقط برای همگام‌سازی (درون تراکنش replaceAll شش‌جدولی) */
  async replaceInteractions(rows: InteractionUpsertInput[]): Promise<number> {
    await this.client.$transaction([
      this.client.interactionRecord.deleteMany({}),
      ...rows.map((i) =>
        this.client.interactionRecord.create({
          data: {
            id: i.id,
            requestRealtorName: i.requestRealtorName,
            propertyRealtorName: i.propertyRealtorName,
            count: i.count,
          },
        })
      ),
    ]);
    return rows.length;
  }

  async upsertInteractionsBatch(rows: InteractionUpsertInput[]): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;
    for (const i of rows) {
      const existing = await this.client.interactionRecord.findUnique({ where: { id: i.id }, select: { id: true } });
      await this.client.interactionRecord.upsert({
        where: { id: i.id },
        create: {
          id: i.id,
          requestRealtorName: i.requestRealtorName,
          propertyRealtorName: i.propertyRealtorName,
          count: i.count,
        },
        update: {
          requestRealtorName: i.requestRealtorName,
          propertyRealtorName: i.propertyRealtorName,
          count: i.count,
        },
      });
      if (existing) updated += 1;
      else created += 1;
    }
    return { created, updated };
  }

  async deleteAllInteractions(): Promise<void> {
    await this.client.interactionRecord.deleteMany({});
  }

  async countAllInteractions(): Promise<number> {
    return this.client.interactionRecord.count();
  }
}
