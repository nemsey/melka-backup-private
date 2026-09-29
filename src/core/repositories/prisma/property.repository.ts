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
// P6525 — قانون یکسان‌سازی ورودی: منبع یگانهٔ نگاشت ارقام/حروف (رفع باگ ۴/۵)
import { normalizeFilterInput } from "@/lib/normalize-input";

/** P6525 — سقف اسکن فیلترهای نرمال‌شدهٔ JS (قانون فهرست: تمام ردیف‌ها؛ هم‌راستا با سقف ایمنی روت ۲۵٬۰۰۰) */
const LIST_SCAN_CAP = 25_000;

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

  /** کاتالوگ تک‌صفحه‌ای — فیلتر کدآگهی/نام کارشناس (contains) + وضعیت‌های خام شش‌حالته (P6521/M1)؛ جدیدترین فعالیت اول
   *
   * P6525 — قانون یکسان‌سازی (رفع باگ تاریخی ۴/۵ + هم‌ارزی ي/ی و ك/ک):
   * فیلترهای کد و نام کارشناس به‌جای contains خام SQL، با نرمال‌سازی دوطرفه در JS
   * اعمال می‌شوند (نرمال هر دو سمت: ورودی و رکورد) ⇒ نتیجهٔ ارقام فارسی/عربی/لاتین
   * و حروف عربی/فارسی همیشه یکسان است. statuses در SQL می‌ماند (مقادیر خام دقیق). */
  async listArmCatalog(
    filter: ArmListingCatalogFilter,
    limit: number
  ): Promise<{ rows: ArmListingCatalogRow[]; total: number }> {
    const where: Prisma.PropertyRecordWhereInput = {};
    // P6521/M1 + P6530 — فیلتر وضعیت: مقادیر خام قانون‌مند (listingStateRawValues) — دقیق، بدون تخمین
    if (filter.statuses && filter.statuses.length > 0) where.status = { in: filter.statuses };
    // P6530/گام ۱ — دسته‌بندی (دقیق — مقادیر خام سامانه)
    if (filter.tradeTypes && filter.tradeTypes.length > 0) where.tradeTypeName = { in: filter.tradeTypes };
    // P6530/گام ۱ — قیمت ملک (تومان) و بازهٔ آخرین فعالیت در SQL (عدد/تاریخ — بدون نرمال‌سازی لازم)
    if (filter.priceFrom !== undefined || filter.priceTo !== undefined) {
      where.price = {};
      if (filter.priceFrom !== undefined) where.price.gte = filter.priceFrom;
      if (filter.priceTo !== undefined) where.price.lte = filter.priceTo;
    }
    if (filter.activityFrom || filter.activityTo) {
      where.createdAt = {};
      if (filter.activityFrom) where.createdAt.gte = new Date(filter.activityFrom);
      if (filter.activityTo) {
        // پایان روز شامل شود (مرز تاریخ تهران — عین الگوی M3)
        const to = new Date(filter.activityTo);
        to.setHours(23, 59, 59, 999);
        where.createdAt.lte = to;
      }
    }

    // P6525 — نرمال‌سازی ورودی فیلترهای کدی/متنی با منبع یگانه
    const codeNorm = normalizeFilterInput(filter.code);
    const realtorNorm = normalizeFilterInput(filter.realtorName);
    const ownerNorm = normalizeFilterInput(filter.ownerName);
    const addrNorm = normalizeFilterInput(filter.address);
    const needsJsFilter = codeNorm !== "" || realtorNorm !== "" || ownerNorm !== "" || addrNorm !== "";
    // با فیلتر JS، کل کاتالوگ اسکن می‌شود (قانون فهرست: تمام ردیف‌ها؛ سقف = گارد ایمنی سرور)
    const fetchTake = needsJsFilter ? LIST_SCAN_CAP : limit;

    const records = await this.client.propertyRecord.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: fetchTake,
      select: {
        id: true,
        propertyCode: true,
        title: true,
        status: true,
        ownerName: true,
        rawOwnerName: true,
        ownerMobile: true,
        price: true,
        tradeTypeName: true,
        address: true,
        areaName: true,
        lineName: true,
        extractedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // P6525 — تطبیق نرمال‌شده: نتیجهٔ فارسی = لاتین = عربی (ارقام) و ي = ی، ك = ک (حروف)
    // P6530/گام ۱ — مالک: نام یا موبایل · آدرس: متن کامل یا منطقه
    const matched = needsJsFilter
      ? records.filter((r) => {
          if (codeNorm !== "" && !normalizeFilterInput(r.propertyCode).includes(codeNorm)) return false;
          if (realtorNorm !== "" && !normalizeFilterInput(r.ownerName).includes(realtorNorm)) return false;
          if (ownerNorm !== "") {
            const name = normalizeFilterInput(r.rawOwnerName);
            const mobile = normalizeFilterInput(r.ownerMobile);
            if (!name.includes(ownerNorm) && !mobile.includes(ownerNorm)) return false;
          }
          if (addrNorm !== "") {
            const addr = normalizeFilterInput(r.address);
            const area = normalizeFilterInput(r.areaName);
            const line = normalizeFilterInput(r.lineName);
            if (!addr.includes(addrNorm) && !area.includes(addrNorm) && !line.includes(addrNorm)) return false;
          }
          return true;
        })
      : records;

    const rows: ArmListingCatalogRow[] = matched.slice(0, limit).map((r) => ({
      id: r.id,
      propertyCode: r.propertyCode,
      title: r.title,
      status: r.status,
      realtorName: r.ownerName,
      ownerName: r.rawOwnerName,
      ownerMobile: r.ownerMobile,
      price: typeof r.price === "number" ? r.price : null,
      tradeTypeName: r.tradeTypeName,
      address: r.address,
      areaName: r.areaName,
      lineName: r.lineName,
      enrichedAt: r.extractedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
    return { rows, total: matched.length };
  }

  /** P6521/M1 — توزیع وضعیت‌های خام برای بینش شش‌حالته (groupBy status) */
  async statusBreakdown(): Promise<Array<{ status: string | null; count: number }>> {
    const grouped = await this.client.propertyRecord.groupBy({
      by: ["status"],
      _count: { _all: true },
    });
    return grouped.map((g) => ({ status: g.status, count: g._count._all }));
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
