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
  ScopeFilter,
  ScopedTransactionRepository,
} from "../interfaces";
import { resolveClient, runBulkUpsert, type PrismaRepoDeps } from "./base";
import { auditAccess } from "@/lib/audit";

function toTxData(t: TransactionUpsertInput): Record<string, unknown> {
  return {
    id: t.id,
    contractDate: t.contractDate,
    propertyCode: t.propertyCode,
    propertyCustomer: t.propertyCustomer,
    requestCode: t.requestCode,
    requestCustomer: t.requestCustomer,
    contractHolo: t.contractHolo,
    suggestedPropertyCount: t.suggestedPropertyCount,
    eventsCount: t.eventsCount,
    // P6.5-04-e-v2 — سه‌لایه حقیقت (خام + provenance؛ تهی از مسیرهای v1 = حفظ مقدار موجود توسط merge)
    ...(t.rawDate !== undefined ? { rawDate: t.rawDate } : {}),
    // B.3 (P6.5-04-v2) — لایه ۱ حقیقت: نام‌های خام طرفین
    ...(t.rawPropertyCustomer !== undefined ? { rawPropertyCustomer: t.rawPropertyCustomer } : {}),
    ...(t.rawRequestCustomer !== undefined ? { rawRequestCustomer: t.rawRequestCustomer } : {}),
    ...(t.rawSourceVersion !== undefined ? { rawSourceVersion: t.rawSourceVersion } : {}),
    ...(t.extractedAt !== undefined ? { extractedAt: t.extractedAt } : {}),
    ...(t.extractionBatchId !== undefined ? { extractionBatchId: t.extractionBatchId } : {}),
    ...(t.normalizationVersion !== undefined ? { normalizationVersion: t.normalizationVersion } : {}),
  };
}

/** ساخت Prisma WhereInput از فیلتر خالص — عین منطق روت قبلی */
export function buildTransactionWhere(filter?: TransactionListFilter): Prisma.TransactionRecordWhereInput {
  const where: Prisma.TransactionRecordWhereInput = {};
  if (!filter) return where;
  // PN-044/فاز ۴ (شورا-ن۰۸۸) — جداسازی tenant: پیش‌فرض 'melk-tabriz' (تمام دادهٔ
  // فعلی همین است — صفر شکستن) ⇒ دادهٔ ملکتون هرگز به کاشی‌های تبریز نشت نمی‌کند.
  where.tenantId = filter.tenantId ?? "melk-tabriz";
  const { dateFrom, dateTo, propertyCode, requestCode, contractHolo, matchKind } = filter;
  if (dateFrom || dateTo) {
    // P6.5-15 (رفع F5 — ملکا-شورا-۱۴۰۵-۰۱۸) — مرز روز به وقت تهران (+03:30):
    // کاربر تهرانی «۱ آذر» را از ۰۰:۰۰ به وقت تهران انتظار دارد، نه UTC.
    where.contractDate = {
      ...(dateFrom ? { gte: new Date(`${dateFrom}T00:00:00+03:30`) } : {}),
      ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59.999+03:30`) } : {}),
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

export class PrismaTransactionRepository implements ScopedTransactionRepository {
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
        create: toTxData(t) as Prisma.TransactionRecordCreateInput,
        update: toTxData(t) as Prisma.TransactionRecordUpdateInput,
      });
      if (existing) updated += 1;
      else created += 1;
    }
    return { created, updated };
  }

  /** P6.5-03 — انبوه با merge non-null (§۲.۴) + محافظت sourceRunId (§۱.۹) */
  async upsertBulk(rows: TransactionUpsertInput[], opts: { sourceRunId: string }): Promise<{ created: number; updated: number; duplicates: number; errors: number }> {
    return runBulkUpsert({
      rows,
      toData: toTxData,
      findExisting: (t) => this.client.transactionRecord.findUnique({ where: { id: t.id } }) as Promise<Record<string, unknown> | null>,
      createRow: (data) => this.client.transactionRecord.create({ data: data as Prisma.TransactionRecordCreateInput }),
      updateRow: (data) => this.client.transactionRecord.update({ where: { id: data.id as string }, data: data as Prisma.TransactionRecordUpdateInput }),
      sourceRunId: opts.sourceRunId,
    });
  }

  async deleteAll(): Promise<void> {
    await this.client.transactionRecord.deleteMany({});
  }

  /** P6.5-14 (BLOCK C — ملکا-شورا-۱۴۰۵-۰۱۷) — غنی‌سازی معامله‌محور بر اساس txId */
  async findInfoEnrichmentsByTxIds(txIds: string[]): Promise<
    Array<{
      txId: string;
      contractType: string | null;
      contractPrice: number | null;
      buyerName: string | null;
      buyerMobile: string | null;
      sellerName: string | null;
      sellerMobile: string | null;
      realtorSharesJson: string | null;
      propertyTitle: string | null;
      propertyAddress: string | null;
      status: string | null;
      documentDate: Date | null;
      deliveryDate: Date | null;
      /** PN-020/گام اول-ج۱ — پاسخ خام + مبالغ مالی برای شرایط مالی قرارداد (تجزیه در لایهٔ نمایش) */
      rawInfoJson: string | null;
      comisionOfContract: number | null;
      taxOfContract: number | null;
    }>
  > {
    if (txIds.length === 0) return [];
    return this.client.transactionEnrichment.findMany({
      where: { txId: { in: txIds } },
      select: {
        txId: true, contractType: true, contractPrice: true, buyerName: true, buyerMobile: true,
        sellerName: true, sellerMobile: true, realtorSharesJson: true, propertyTitle: true,
        propertyAddress: true, status: true, documentDate: true, deliveryDate: true,
        // PN-020/گام اول-ج۱ — شرایط مالی قرارداد فی‌مابین طرفین
        rawInfoJson: true, comisionOfContract: true, taxOfContract: true,
      },
    });
  }

  /**
   * P6.5-02 (§۵.۲/§۵.۳) — فهرست Scope-دار معاملات.
   * ماتریس دامنه: TransactionRecord = داده «تجمیمی دپارتمان» ⇒ هیچ دامنه‌ای
   * ردیفی را حذف نمی‌کند (گزارش مدیریتی مشترک؛ پنهان‌کردن از مشاور = تغییر
   * رفتار قابل‌مشاهده). AuditLog هر دو حالت ثبت می‌شود (§۶.۲).
   * tenantId حمل می‌شود اما فیلتر فعال نیست — مصوبه §۱۴ شورا (PHASE 8+).
   */
  async findWithScope(options: TransactionListOptions, scope: ScopeFilter): Promise<TransactionDTO[]> {
    const where = buildTransactionWhere(options.filter);
    const sortBy = options.sortBy ?? "contractDate";
    const sortDir: Prisma.SortOrder = options.sortDir === "asc" ? "asc" : "desc";
    const rows = await this.client.transactionRecord.findMany({
      where,
      orderBy: { [sortBy]: sortDir },
      ...(options.limit !== undefined ? { take: options.limit } : {}),
      ...(options.offset !== undefined ? { skip: options.offset } : {}),
    });
    await auditAccess(scope, "READ", "transaction", rows.length, undefined, { client: this.client });
    return rows;
  }
}
