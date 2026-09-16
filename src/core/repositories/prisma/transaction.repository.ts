/**
 * PrismaTransactionRepository — پیاده‌سازی Prisma قرارداد TransactionRepository
 * ------------------------------------------------------
 * ⚠️ نگاشت where/filter از پارامترهای خالص به Prisma WhereInput اینجا انجام
 * می‌شود — عین منطق قبلی روت crm/transactions (بدون تغییر معنایی).
 */
import type { Prisma } from "@prisma/client";
import type {
  TransactionDTO,
  TransactionListOptions,
  TransactionRepository,
  TransactionListFilter,
  TransactionListResult,
  TransactionUpsertInput,
} from "../interfaces";
import { resolveClient, type PrismaRepoDeps } from "./base";

/** ساخت Prisma WhereInput از فیلتر خالص — عین منطق روت قبلی */
export function buildTransactionWhere(filter?: TransactionListFilter): Prisma.TransactionRecordWhereInput {
  const where: Prisma.TransactionRecordWhereInput = {};
  if (!filter) return where;
  const { dateFrom, dateTo, propertyCode, requestCode, contractHolo, matchKind } = filter;
  if (dateFrom || dateTo) {
    where.contractDate = {
      ...(dateFrom ? { gte: new Date(`${dateFrom}T00:00:00`) } : {}),
      ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59.999`) } : {}),
    };
  }
  if (propertyCode) where.propertyCode = { contains: propertyCode };
  if (requestCode) where.requestCode = { contains: requestCode };
  if (contractHolo) where.contractHolo = { contains: contractHolo };
  if (matchKind === "event") {
    where.eventsCount = { gt: 0 };
  } else if (matchKind === "suggested") {
    where.suggestedPropertyCount = { gt: 0 };
  } else if (matchKind === "both") {
    const baseAnd: Prisma.TransactionRecordWhereInput[] = Array.isArray(where.AND) ? where.AND : [];
    where.AND = [...baseAnd, { eventsCount: { gt: 0 } }, { suggestedPropertyCount: { gt: 0 } }];
  }
  return where;
}

export class PrismaTransactionRepository implements TransactionRepository {
  private readonly client;

  constructor(deps?: PrismaRepoDeps) {
    this.client = resolveClient(deps);
  }

  async findAll(): Promise<TransactionDTO[]> {
    return this.client.transactionRecord.findMany();
  }

  async listWithSummary(options: TransactionListOptions): Promise<TransactionListResult> {
    const where = buildTransactionWhere(options.filter);
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;
    const sortBy = options.sortBy ?? "contractDate";
    const sortDir: Prisma.SortOrder = options.sortDir === "asc" ? "asc" : "desc";

    const [rows, total, totalCount, hasRequestEvent, hasSuggestedProperty, hasBoth, withHolo, withRequest] = await Promise.all([
      this.client.transactionRecord.findMany({
        where,
        orderBy: { [sortBy]: sortDir },
        take: limit,
        skip: offset,
      }),
      this.client.transactionRecord.count({ where }),
      this.client.transactionRecord.count({ where }),
      this.client.transactionRecord.count({ where: { ...where, eventsCount: { gt: 0 } } }),
      this.client.transactionRecord.count({ where: { ...where, suggestedPropertyCount: { gt: 0 } } }),
      this.client.transactionRecord.count({
        where: {
          ...where,
          AND: [...(Array.isArray(where.AND) ? where.AND : []), { eventsCount: { gt: 0 } }, { suggestedPropertyCount: { gt: 0 } }],
        },
      }),
      this.client.transactionRecord.count({ where: { ...where, contractHolo: { not: null } } }),
      this.client.transactionRecord.count({ where: { ...where, requestCode: { not: null } } }),
    ]);

    return {
      rows,
      total,
      summary: { totalCount, hasRequestEvent, hasSuggestedProperty, hasBoth, withHolo, withRequest },
    };
  }

  async countAll(): Promise<number> {
    return this.client.transactionRecord.count();
  }

  async replaceAll(rows: TransactionUpsertInput[]): Promise<number> {
    const result = await this.client.$transaction([
      this.client.transactionRecord.deleteMany({}),
      ...rows.map((t) =>
        this.client.transactionRecord.create({
          data: {
            id: t.id,
            contractDate: t.contractDate,
            propertyCode: t.propertyCode,
            propertyCustomer: t.propertyCustomer,
            requestCode: t.requestCode,
            requestCustomer: t.requestCustomer,
            contractHolo: t.contractHolo,
            suggestedPropertyCount: t.suggestedPropertyCount,
            eventsCount: t.eventsCount,
          },
        })
      ),
    ]);
    return rows.length;
  }

  async upsertBatch(rows: TransactionUpsertInput[]): Promise<{ created: number; updated: number }> {
    let created = 0;
    let updated = 0;
    for (const t of rows) {
      const existing = await this.client.transactionRecord.findUnique({ where: { id: t.id }, select: { id: true } });
      await this.client.transactionRecord.upsert({
        where: { id: t.id },
        create: {
          id: t.id,
          contractDate: t.contractDate,
          propertyCode: t.propertyCode,
          propertyCustomer: t.propertyCustomer,
          requestCode: t.requestCode,
          requestCustomer: t.requestCustomer,
          contractHolo: t.contractHolo,
          suggestedPropertyCount: t.suggestedPropertyCount,
          eventsCount: t.eventsCount,
        },
        update: {
          contractDate: t.contractDate,
          propertyCode: t.propertyCode,
          propertyCustomer: t.propertyCustomer,
          requestCode: t.requestCode,
          requestCustomer: t.requestCustomer,
          contractHolo: t.contractHolo,
          suggestedPropertyCount: t.suggestedPropertyCount,
          eventsCount: t.eventsCount,
        },
      });
      if (existing) updated += 1;
      else created += 1;
    }
    return { created, updated };
  }

  async deleteAll(): Promise<void> {
    await this.client.transactionRecord.deleteMany({});
  }
}
