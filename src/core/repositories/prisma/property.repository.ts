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
import { propertyNormColumns } from "@/lib/search-norm";
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
    // PN-002 گام ۱ — ستون‌های تازه از خود ردیف فهرست ARM
    ...(p.isRental !== undefined && p.isRental !== null ? { isRental: p.isRental } : {}),
    ...(p.depositPrice !== undefined && p.depositPrice !== null ? { depositPrice: p.depositPrice } : {}),
    ...(p.rentPrice !== undefined && p.rentPrice !== null ? { rentPrice: p.rentPrice } : {}),
    ...(p.viewCount !== undefined && p.viewCount !== null ? { viewCount: p.viewCount } : {}),
    ...(p.imageCount !== undefined && p.imageCount !== null ? { imageCount: p.imageCount } : {}),
    ...(p.addedToDivar !== undefined && p.addedToDivar !== null ? { addedToDivar: p.addedToDivar } : {}),
    ...(p.addedToInsta !== undefined && p.addedToInsta !== null ? { addedToInsta: p.addedToInsta } : {}),
    ...(p.isReposted !== undefined && p.isReposted !== null ? { isReposted: p.isReposted } : {}),
    ...(p.isTarget !== undefined && p.isTarget !== null ? { isTarget: p.isTarget } : {}),
    ...(p.armBranchTitle !== undefined && p.armBranchTitle !== null ? { armBranchTitle: p.armBranchTitle } : {}),
    ...(p.stateName !== undefined && p.stateName !== null ? { stateName: p.stateName } : {}),
    ...(p.cityName !== undefined && p.cityName !== null ? { cityName: p.cityName } : {}),
    ...(p.publicUrl !== undefined && p.publicUrl !== null ? { publicUrl: p.publicUrl } : {}),
    ...(p.statusDate !== undefined && p.statusDate !== null ? { statusDate: p.statusDate } : {}),
    // PN-027 · ۵-پ-۲ — ستون‌های سایهٔ نرمال همیشه با هر نوشتن تازه می‌شوند
    ...propertyNormColumns(p),
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
    // PN-044/فاز ۴ (شورا-ن۰۸۸) — جداسازی tenant: پیش‌فرض 'melk-tabriz' (تمام دادهٔ
    // فعلی همین است — صفر شکستن) ⇒ دادهٔ ملکتون هرگز به کاشی‌های تبریز نشت نمی‌کند.
    where.tenantId = filter.tenantId ?? "melk-tabriz";
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
    // ===================== PN-002 گام ۱ — فیلتر ستون‌های تازه (تمام ستون‌ها) =====================
    if (filter.rentalType === "rental") where.isRental = true;
    if (filter.rentalType === "sale") where.isRental = false;
    if (filter.viewCountFrom !== undefined || filter.viewCountTo !== undefined) {
      where.viewCount = {};
      if (filter.viewCountFrom !== undefined) where.viewCount.gte = filter.viewCountFrom;
      if (filter.viewCountTo !== undefined) where.viewCount.lte = filter.viewCountTo;
    }
    if (filter.meterageFrom !== undefined || filter.meterageTo !== undefined) {
      where.meterage = {};
      if (filter.meterageFrom !== undefined) where.meterage.gte = filter.meterageFrom;
      if (filter.meterageTo !== undefined) where.meterage.lte = filter.meterageTo;
    }
    if (filter.roomsFrom !== undefined || filter.roomsTo !== undefined) {
      where.rooms = {};
      if (filter.roomsFrom !== undefined) where.rooms.gte = filter.roomsFrom;
      if (filter.roomsTo !== undefined) where.rooms.lte = filter.roomsTo;
    }
    if (filter.addedToDivar !== undefined) where.addedToDivar = filter.addedToDivar;
    if (filter.addedToInsta !== undefined) where.addedToInsta = filter.addedToInsta;
    if (filter.propertyTypes && filter.propertyTypes.length > 0) where.propertyTypeName = { in: filter.propertyTypes };

    // P6525 — نرمال‌سازی ورودی فیلترهای کدی/متنی با منبع یگانه
    const codeNorm = normalizeFilterInput(filter.code);
    const realtorNorm = normalizeFilterInput(filter.realtorName);
    const ownerNorm = normalizeFilterInput(filter.ownerName);
    const addrNorm = normalizeFilterInput(filter.address);
    const lineNorm = normalizeFilterInput(filter.lineName);
    const stateNorm = normalizeFilterInput(filter.stateName);

    // PN-027 · ۵-پ-۲ — فیلترهای متنی سنگین روی ستون‌های سایهٔ نرمال در سطح SQL
    // (هم‌ارز عینی JS قدیم: مالک = rawOwnerName+موبایل · آدرس = آدرس+محله+خط با ␟)
    if (realtorNorm !== "") where.realtorNameNorm = { contains: realtorNorm };
    if (ownerNorm !== "") where.ownerSearchNorm = { contains: ownerNorm };
    if (addrNorm !== "") where.addressSearchNorm = { contains: addrNorm };

    // فیلترهای باقی‌مانده (کد · خط · استان) همچنان در JS — فقط این‌ها اسکن کامل می‌خواهند
    const needsJsFilter = codeNorm !== "" || lineNorm !== "" || stateNorm !== "";
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
        pricePerMeter: true,
        tradeTypeName: true,
        propertyTypeName: true,
        meterage: true,
        rooms: true,
        floor: true,
        buildYear: true,
        address: true,
        areaName: true,
        lineName: true,
        extractedAt: true,
        createdAt: true,
        updatedAt: true,
        // PN-002 گام ۱ — ستون‌های تازه
        isRental: true,
        depositPrice: true,
        rentPrice: true,
        viewCount: true,
        imageCount: true,
        addedToDivar: true,
        addedToInsta: true,
        isReposted: true,
        isTarget: true,
        armBranchTitle: true,
        stateName: true,
        cityName: true,
        publicUrl: true,
        statusDate: true,
        // PN-039 (گام ۴) — یادداشت مالک (فقط از مسیر PATCH مالک نوشته می‌شود)
        ownerNote: true,
      },
    });

    // P6525 — تطبیق نرمال‌شده: نتیجهٔ فارسی = لاتین = عربی (ارقام) و ي = ی، ك = ک (حروف)
    // P6530/گام ۱ — مالک: نام یا موبایل · آدرس: متن کامل یا منطقه
    // PN-027 · ۵-پ-۲ — کارشناس/مالک/آدرس اکنون در SQL روی ستون‌های نرمال اعمال می‌شود؛
    // اینجا فقط فیلترهای JS باقی‌مانده (کد · خط · استان)
    const matched = needsJsFilter
      ? records.filter((r) => {
          if (codeNorm !== "" && !normalizeFilterInput(r.propertyCode).includes(codeNorm)) return false;
          if (lineNorm !== "" && !normalizeFilterInput(r.lineName).includes(lineNorm)) return false;
          if (stateNorm !== "" && !normalizeFilterInput(r.stateName).includes(stateNorm)) return false;
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
      pricePerMeter: typeof r.pricePerMeter === "number" ? r.pricePerMeter : null,
      tradeTypeName: r.tradeTypeName,
      propertyTypeName: r.propertyTypeName,
      meterage: typeof r.meterage === "number" ? r.meterage : null,
      rooms: typeof r.rooms === "number" ? r.rooms : null,
      floor: typeof r.floor === "number" ? r.floor : null,
      buildYear: typeof r.buildYear === "number" ? r.buildYear : null,
      address: r.address,
      areaName: r.areaName,
      lineName: r.lineName,
      enrichedAt: r.extractedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      // PN-002 گام ۱ — ستون‌های تازه
      isRental: r.isRental,
      depositPrice: typeof r.depositPrice === "number" ? r.depositPrice : null,
      rentPrice: typeof r.rentPrice === "number" ? r.rentPrice : null,
      viewCount: typeof r.viewCount === "number" ? r.viewCount : null,
      imageCount: typeof r.imageCount === "number" ? r.imageCount : null,
      addedToDivar: r.addedToDivar,
      addedToInsta: r.addedToInsta,
      isReposted: r.isReposted,
      isTarget: r.isTarget,
      armBranchTitle: r.armBranchTitle,
      stateName: r.stateName,
      cityName: r.cityName,
      publicUrl: r.publicUrl,
      statusDate: r.statusDate,
      ownerNote: r.ownerNote ?? null,
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
        ? { id: { in: rowIds } }
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

  // ---- P6546/گام صفر — تشخیص کدهای غایب از سامانهٔ عمومی ----
  async findExistingCodes(codes: string[]): Promise<string[]> {
    if (codes.length === 0) return [];
    const uniq = [...new Set(codes)];
    const records = await this.client.propertyRecord.findMany({
      where: { propertyCode: { in: uniq } },
      select: { propertyCode: true },
    });
    return records.map((r) => r.propertyCode);
  }

  // ---- P6546/گام پنجم — به‌روزرسانی هدفمند (غنی‌سازی چند-منبعی) ----
  async updateCatalogFields(propertyCode: string, patch: Record<string, string | number | null>): Promise<void> {
    await this.client.propertyRecord.update({
      where: { propertyCode },
      data: patch as Prisma.PropertyRecordUpdateInput,
    });
  }

  /** PN-039 (گام ۴) — یادداشت مالک: تنها مسیر نوشتن این ستون — سینک ARM هرگز نمی‌نویسد */
  async updateOwnerNote(id: string, note: string | null): Promise<{ id: string; ownerNote: string | null }> {
    const row = await this.client.propertyRecord.update({
      where: { id },
      data: { ownerNote: note },
      select: { id: true, ownerNote: true },
    });
    return { id: row.id, ownerNote: row.ownerNote ?? null };
  }
}
