/**
 * PrismaRequestRepository — پیاده‌سازی Prisma قرارداد RequestRepository
 * ------------------------------------------------------
 * کوئری‌ها عین روت‌های قبل از مهاجرت (بدون تغییر معنایی):
 *  • findById            ← db.requestRecord.findUnique({ where: { id } })
 *  • findByIdWithEventsDesc ← findUnique + include events (createdAt نزولی)
 *  • updateEventArmSync  ← db.requestEventRecord.update({ where: { id }, data })
 * P6.5-10: خواندن‌های کاتالوگ «درخواست‌های ملک تبریز» — فیلتر کد/کارشناس،
 * شمارش غنی‌سازی و برش ردیف‌های در انتظار (لایه ۲ تماس درخواست‌دهنده).
 */
import type { Prisma } from "@prisma/client";
import type {
  ArmRequestBulkRow,
  ArmRequestCatalogFilter,
  ArmRequestCatalogRow,
  EnrichmentCounts,
  PendingEnrichmentRow,
  RequestEventArmSyncInput,
  RequestRecordDTO,
  RequestRepository,
  RequestWithEventsDTO,
} from "../interfaces";
import { resolveClient, runBulkUpsert, type PrismaRepoDeps } from "./base";
import { requestNormColumns } from "@/lib/search-norm";
// P6525 — قانون یکسان‌سازی ورودی: منبع یگانهٔ نگاشت ارقام/حروف (رفع باگ ۴/۵)
import { normalizeFilterInput } from "@/lib/normalize-input";

/** P6525 — سقف اسکن فیلترهای نرمال‌شدهٔ JS (قانون فهرست: تمام ردیف‌ها؛ هم‌راستا با سقف ایمنی روت ۲۵٬۰۰۰) */
const LIST_SCAN_CAP = 25_000;

/** P6521/M2 — تجزیهٔ امن areaNamesJson («["ولیعصر","خاوران"]»)؛ ورودی خراب = آرایهٔ خالی */
function parseAreaNamesJson(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  } catch {
    return [];
  }
}

export function toArmRequestData(r: ArmRequestBulkRow): Record<string, unknown> {
  return {
    id: r.id,
    source: "arm",
    customerName: r.customerName ?? null,
    customerMobile: r.customerMobile ?? null,
    status: r.status ?? "ready",
    requestCode: r.requestCode,
    actorCode: r.actorCode ?? "arm",
    // P6.5-10 — نام کارشناس ثبت‌کننده و عنوان درخواست عین فهرست ARM
    ...(r.actorName !== undefined ? { actorName: r.actorName } : {}),
    ...(r.title !== undefined ? { title: r.title } : {}),
    ...(r.createdAt ? { createdAt: r.createdAt } : {}),
    // P6521/M2 — منطقه‌های منتخب درخواست (متن ساده) از جزئیات ARM
    ...(r.areaNames !== undefined && r.areaNames !== null && r.areaNames.length > 0
      ? { areaNamesJson: JSON.stringify(r.areaNames) }
      : {}),
    // P6547/گام دوم — محله‌های منتخب درخواست (line[] خود ردیف فهرست ARM)
    ...(r.lineNames !== undefined && r.lineNames !== null && r.lineNames.length > 0
      ? { lineNamesJson: JSON.stringify(r.lineNames) }
      : {}),
    // P6530/گام ۲ — دسته‌بندی درخواست + بازهٔ قیمت متقاضی از جزئیات ARM
    ...(r.tradeTypeName !== undefined ? { tradeTypeName: r.tradeTypeName } : {}),
    // P6546/گام دوم — نوع ملک + نوع ساختمان درخواستی از جزئیات ARM
    ...(r.propertyTypeName !== undefined ? { propertyTypeName: r.propertyTypeName } : {}),
    ...(r.buildingTypeName !== undefined ? { buildingTypeName: r.buildingTypeName } : {}),
    ...(r.priceFrom !== undefined && r.priceFrom !== null ? { priceFrom: r.priceFrom } : {}),
    ...(r.priceTo !== undefined && r.priceTo !== null ? { priceTo: r.priceTo } : {}),
    // P6547/گام دوم — روش پرداخت/جدیت/فوریت/لوکس/قابل معاوضه از خود ردیف فهرست ARM
    ...(r.paymentMethodName !== undefined && r.paymentMethodName !== null ? { userPaymentMethodName: r.paymentMethodName } : {}),
    ...(r.seriousnessName !== undefined && r.seriousnessName !== null ? { userSeriousityName: r.seriousnessName } : {}),
    ...(r.urgent !== undefined && r.urgent !== null ? { urgent: r.urgent } : {}),
    ...(r.luxury !== undefined && r.luxury !== null ? { luxury: r.luxury } : {}),
    ...(r.changeable !== undefined && r.changeable !== null ? { changeable: r.changeable } : {}),
    // B.3 (P6.5-04-v2) — لایه ۱ حقیقت: نام/موبایل مشتری خام
    ...(r.rawCustomerName !== undefined ? { rawCustomerName: r.rawCustomerName } : {}),
    ...(r.rawCustomerMobile !== undefined ? { rawCustomerMobile: r.rawCustomerMobile } : {}),
    // P6.5-04-e-v2 — provenance سه‌لایه حقیقت
    ...(r.rawSourceVersion !== undefined ? { rawSourceVersion: r.rawSourceVersion } : {}),
    ...(r.extractedAt !== undefined ? { extractedAt: r.extractedAt } : {}),
    ...(r.extractionBatchId !== undefined ? { extractionBatchId: r.extractionBatchId } : {}),
    ...(r.normalizationVersion !== undefined ? { normalizationVersion: r.normalizationVersion } : {}),
    // PN-002 گام ۲ — ستون‌های تازه از inputs خود ردیف فهرست ARM
    ...(r.spaceFrom !== undefined && r.spaceFrom !== null ? { spaceFrom: r.spaceFrom } : {}),
    ...(r.spaceTo !== undefined && r.spaceTo !== null ? { spaceTo: r.spaceTo } : {}),
    ...(r.roomsFrom !== undefined && r.roomsFrom !== null ? { roomsFrom: r.roomsFrom } : {}),
    ...(r.roomsTo !== undefined && r.roomsTo !== null ? { roomsTo: r.roomsTo } : {}),
    ...(r.floorFrom !== undefined && r.floorFrom !== null ? { floorFrom: r.floorFrom } : {}),
    ...(r.floorTo !== undefined && r.floorTo !== null ? { floorTo: r.floorTo } : {}),
    ...(r.buildYearFrom !== undefined && r.buildYearFrom !== null ? { buildYearFrom: r.buildYearFrom } : {}),
    ...(r.buildYearTo !== undefined && r.buildYearTo !== null ? { buildYearTo: r.buildYearTo } : {}),
    ...(r.sanadNames !== undefined && r.sanadNames !== null ? { sanadNames: r.sanadNames } : {}),
    ...(r.constructTypeNames !== undefined && r.constructTypeNames !== null ? { constructTypeNames: r.constructTypeNames } : {}),
    ...(r.sideNames !== undefined && r.sideNames !== null ? { sideNames: r.sideNames } : {}),
    ...(r.occasion !== undefined && r.occasion !== null ? { occasion: r.occasion } : {}),
    ...(r.deposit !== undefined && r.deposit !== null ? { deposit: r.deposit } : {}),
    ...(r.confirmSms !== undefined && r.confirmSms !== null ? { confirmSms: r.confirmSms } : {}),
    ...(r.notifyMe !== undefined && r.notifyMe !== null ? { notifyMe: r.notifyMe } : {}),
    ...(r.changeWithNames !== undefined && r.changeWithNames !== null ? { changeWithNames: r.changeWithNames } : {}),
    ...(r.armBranchTitle !== undefined && r.armBranchTitle !== null ? { armBranchTitle: r.armBranchTitle } : {}),
    ...(r.countryName !== undefined && r.countryName !== null ? { countryName: r.countryName } : {}),
    ...(r.stateName !== undefined && r.stateName !== null ? { stateName: r.stateName } : {}),
    ...(r.cityName !== undefined && r.cityName !== null ? { cityName: r.cityName } : {}),
    ...(r.platform !== undefined && r.platform !== null ? { platform: r.platform } : {}),
    ...(r.customerDescription !== undefined && r.customerDescription !== null ? { customerDescription: r.customerDescription } : {}),
    // PN-027 · ۵-پ-۱ — ستون‌های سایهٔ نرمال همیشه با هر نوشتن تازه می‌شوند
    ...requestNormColumns(r),
  };
}

export class PrismaRequestRepository implements RequestRepository {
  private readonly client;

  constructor(deps?: PrismaRepoDeps) {
    this.client = resolveClient(deps);
  }

  async findById(id: string): Promise<RequestRecordDTO | null> {
    return this.client.requestRecord.findUnique({ where: { id } });
  }

  async findByIdWithEventsDesc(id: string): Promise<RequestWithEventsDTO | null> {
    return this.client.requestRecord.findUnique({
      where: { id },
      include: { events: { orderBy: { createdAt: "desc" } } },
    });
  }

  async updateEventArmSync(eventId: string, input: RequestEventArmSyncInput): Promise<void> {
    await this.client.requestEventRecord.update({
      where: { id: eventId },
      data: {
        armEventId: input.armEventId,
        armSyncedAt: input.armSyncedAt,
        armPropertyId: input.armPropertyId,
        armSyncJson: input.armSyncJson,
      },
    });
  }

  /**
   * P6.5-03 — درج/به‌روزرسانی انبوه درخواست‌های ARM (§۱.۲ طراحی):
   * source='arm' + کلید طبیعی requestCode (ستون افزودنی @unique).
   * merge non-null: actorCode/id/source هرگز با تهی بازنویسی نمی‌شوند؛
   * رکوردهای دستی موجود (source='manual') با این کلید تصادم نمی‌کنند (requestCode تهی).
   */
  async upsertArmBulk(rows: ArmRequestBulkRow[], opts: { sourceRunId: string }): Promise<{ created: number; updated: number; duplicates: number; errors: number }> {
    return runBulkUpsert({
      rows,
      toData: toArmRequestData,
      findExisting: (r) => this.client.requestRecord.findUnique({ where: { requestCode: r.requestCode } }) as Promise<Record<string, unknown> | null>,
      createRow: (data) => this.client.requestRecord.create({ data: data as Prisma.RequestRecordCreateInput }),
      updateRow: (data) => this.client.requestRecord.update({ where: { requestCode: data.requestCode as string }, data: data as Prisma.RequestRecordUpdateInput }),
      sourceRunId: opts.sourceRunId,
      // P6.5-10 — RequestRecord ستون syncedAt ندارد (کشف تست؛ رفع خطای Unknown argument)
      touchSyncedAt: false,
    });
  }

  // ===================== P6.5-10 — خواندن‌های کاتالوگ درخواست‌های ملک تبریز =====================

  /** کاتالوگ تک‌صفحه‌ای درخواست‌های ARM — P6530/گام ۲: فیلتر تمام ستون‌های فهرست؛ جدیدترین اول
   *
   * P6525 — قانون یکسان‌سازی (رفع باگ تاریخی ۴/۵ + هم‌ارزی ي/ی و ك/ک):
   * فیلترهای کد و نام کارشناس با نرمال‌سازی دوطرفه در JS اعمال می‌شوند
   * (نرمال هر دو سمت) ⇒ نتیجهٔ ارقام فارسی/عربی/لاتین و حروف همیشه یکسان است. */
  async listArmCatalog(
    filter: ArmRequestCatalogFilter,
    limit: number
  ): Promise<{ rows: ArmRequestCatalogRow[]; total: number }> {
    const where: Prisma.RequestRecordWhereInput = { source: "arm" };

    // P6530/گام ۲ — فیلترهای SQL: وضعیت (IN یا NOT IN برای «سایر») · دسته‌بندی · تاریخ · قیمت
    const statuses = filter.statuses ?? [];
    if (filter.statusesIncludesOther && (filter.statusesExcluded ?? []).length > 0) {
      // «سایر» = نقیض پنج‌گانهٔ اصلی — NOT IN با فهرست کامل مستثنی‌شده‌ها
      // (هرگز خالی NOT IN نمی‌شود؛ آرایهٔ خالی = بدون فیلتر — رفع باگ گام ۲)
      where.NOT = { status: { in: filter.statusesExcluded! } };
    } else if (statuses.length > 0) {
      where.status = { in: statuses };
    }
    if (filter.tradeTypes && filter.tradeTypes.length > 0) where.tradeTypeName = { in: filter.tradeTypes };
    if (filter.dateFrom || filter.dateTo) {
      where.createdAt = {};
      if (filter.dateFrom) where.createdAt.gte = new Date(filter.dateFrom);
      if (filter.dateTo) {
        const to = new Date(filter.dateTo);
        to.setHours(23, 59, 59, 999); // مرز روز فراگیر (عین الگوی M1/M3)
        where.createdAt.lte = to;
      }
    }
    // قیمت متقاضی — هم‌پوشانی بازه‌ها (ردیف [از۱،تا۱] با فیلتر [از۲،تا۲] اگر تا۱ ≥ از۲ و از۱ ≤ تا۲)
    // نکته: بدون Infinity (Prisma serial نمی‌کند) — بندها شرطی ساخته می‌شوند؛
    // ردیف بدون هیچ کران قیمتی با فیلتر قیمت تطبیق نمی‌خورد
    if (filter.priceFrom !== undefined || filter.priceTo !== undefined) {
      const f = filter.priceFrom;
      const t = filter.priceTo;
      const priceAnd: Prisma.RequestRecordWhereInput[] = [
        // ردیف باید دست‌کم یک کران قیمت داشته باشد
        { OR: [{ priceFrom: { not: null } }, { priceTo: { not: null } }] },
      ];
      // کران پایین ردیف با کران بالای فیلتر: priceFrom تهی یا ≤ t (فقط وقتی t تعریف شده)
      if (t !== undefined) {
        priceAnd.push({ OR: [{ priceFrom: null }, { priceFrom: { lte: t } }] });
      }
      // کران بالای ردیف با کران پایین فیلتر: priceTo تهی یا ≥ f (فقط وقتی f تعریف شده)
      if (f !== undefined) {
        priceAnd.push({ OR: [{ priceTo: null }, { priceTo: { gte: f } }] });
      }
      where.AND = priceAnd;
    }

    // ===================== PN-002 گام ۲ — فیلتر ستون‌های تازه (تمام ستون‌ها) =====================
    const extraAnd: Prisma.RequestRecordWhereInput[] = [];
    if (filter.spaceFrom !== undefined || filter.spaceTo !== undefined) {
      const spaceAnd: Prisma.RequestRecordWhereInput[] = [{ OR: [{ spaceFrom: { not: null } }, { spaceTo: { not: null } }] }];
      if (filter.spaceTo !== undefined) spaceAnd.push({ OR: [{ spaceFrom: null }, { spaceFrom: { lte: filter.spaceTo } }] });
      if (filter.spaceFrom !== undefined) spaceAnd.push({ OR: [{ spaceTo: null }, { spaceTo: { gte: filter.spaceFrom } }] });
      extraAnd.push(...spaceAnd);
    }
    if (filter.roomsFrom !== undefined || filter.roomsTo !== undefined) {
      where.roomsFrom = {};
      if (filter.roomsFrom !== undefined) where.roomsFrom.gte = filter.roomsFrom;
      if (filter.roomsTo !== undefined) where.roomsFrom.lte = filter.roomsTo;
    }
    if (filter.floorFrom !== undefined || filter.floorTo !== undefined) {
      where.floorFrom = {};
      if (filter.floorFrom !== undefined) where.floorFrom.gte = filter.floorFrom;
      if (filter.floorTo !== undefined) where.floorFrom.lte = filter.floorTo;
    }
    if (filter.buildYearFrom !== undefined || filter.buildYearTo !== undefined) {
      where.buildYearFrom = {};
      if (filter.buildYearFrom !== undefined) where.buildYearFrom.gte = filter.buildYearFrom;
      if (filter.buildYearTo !== undefined) where.buildYearFrom.lte = filter.buildYearTo;
    }
    if (filter.urgentOnly) where.urgent = true;
    if (filter.luxuryOnly) where.luxury = true;
    if (filter.occasionOnly) where.occasion = true;
    if (filter.propertyTypes && filter.propertyTypes.length > 0) where.propertyTypeName = { in: filter.propertyTypes };
    if (filter.buildingTypes && filter.buildingTypes.length > 0) where.buildingTypeName = { in: filter.buildingTypes };
    if (extraAnd.length > 0) where.AND = [...(Array.isArray(where.AND) ? where.AND : []), ...extraAnd];

    // P6525 — نرمال‌سازی ورودی فیلترهای کدی/متنی با منبع یگانه + P6530/گام ۲ (متقاضی/مناطق)
    const codeNorm = normalizeFilterInput(filter.code);
    const realtorNorm = normalizeFilterInput(filter.realtorName);
    const customerNorm = normalizeFilterInput(filter.customerName);
    const areaNorm = normalizeFilterInput(filter.areaName);
    const lineNorm = normalizeFilterInput(filter.lineName);
    const sanadNorm = normalizeFilterInput(filter.sanad);
    const constructNorm = normalizeFilterInput(filter.constructType);
    const sideNorm = normalizeFilterInput(filter.side);

    // PN-027 · ۵-پ-۱ — فیلترهای متنی سنگین روی ستون‌های سایهٔ نرمال در سطح SQL
    // (هم‌ارز عینی JS قدیم: نام+موبایل با ␟ ترکیب شده‌اند — تطبیق کاذب بین‌مرزی ناممکن)
    if (customerNorm !== "") where.customerNameNorm = { contains: customerNorm };
    if (sanadNorm !== "") where.sanadNamesNorm = { contains: sanadNorm };
    if (realtorNorm !== "") where.actorNameNorm = { contains: realtorNorm };

    // فیلترهای باقی‌مانده (JSON آرایه‌ای یا کد) همچنان در JS — فقط این‌ها اسکن کامل می‌خواهند
    const needsJsFilter = codeNorm !== "" || areaNorm !== "" || lineNorm !== "" || constructNorm !== "" || sideNorm !== "";
    const fetchTake = needsJsFilter ? LIST_SCAN_CAP : limit;

    const records = await this.client.requestRecord.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: fetchTake,
      select: {
        id: true,
        requestCode: true,
        title: true,
        status: true,
        actorName: true,
        customerName: true,
        rawCustomerName: true,
        customerMobile: true,
        areaNamesJson: true,
        lineNamesJson: true,
        tradeTypeName: true,
        userPaymentMethodName: true,
        userSeriousityName: true,
        urgent: true,
        luxury: true,
        changeable: true,
        propertyTypeName: true,
        buildingTypeName: true,
        priceFrom: true,
        priceTo: true,
        extractedAt: true,
        createdAt: true,
        updatedAt: true,
        // PN-002 گام ۲ — ستون‌های تازه
        spaceFrom: true,
        spaceTo: true,
        roomsFrom: true,
        roomsTo: true,
        floorFrom: true,
        floorTo: true,
        buildYearFrom: true,
        buildYearTo: true,
        sanadNames: true,
        constructTypeNames: true,
        sideNames: true,
        occasion: true,
        deposit: true,
        confirmSms: true,
        notifyMe: true,
        changeWithNames: true,
        armBranchTitle: true,
        stateName: true,
        cityName: true,
        platform: true,
        customerDescription: true,
      },
    });

    // P6525 — تطبیق نرمال‌شده: نتیجهٔ فارسی = لاتین = عربی (ارقام) و ي = ی، ك = ک (حروف)
    // P6530/گام ۲ — متقاضی: نام یا موبایل · مناطق: عضویت نام منطقه
    // PN-027 · ۵-پ-۱ — نام مشتری/سند/کارشناس اکنون در SQL روی ستون‌های نرمال اعمال می‌شود؛
    // اینجا فقط فیلترهای JS باقی‌مانده (کد · مناطق · خط · نوع ساخت · جهت)
    const matched = needsJsFilter
      ? records.filter((r) => {
          if (codeNorm !== "" && !normalizeFilterInput(r.requestCode).includes(codeNorm)) return false;
          if (areaNorm !== "") {
            const areas = parseAreaNamesJson(r.areaNamesJson).map((a) => normalizeFilterInput(a));
            if (!areas.some((a) => a.includes(areaNorm))) return false;
          }
          if (lineNorm !== "") {
            const lines = parseAreaNamesJson(r.lineNamesJson).map((a) => normalizeFilterInput(a));
            if (!lines.some((a) => a.includes(lineNorm))) return false;
          }
          if (constructNorm !== "" && !normalizeFilterInput(r.constructTypeNames).includes(constructNorm)) return false;
          if (sideNorm !== "" && !normalizeFilterInput(r.sideNames).includes(sideNorm)) return false;
          return true;
        })
      : records;

    const rows: ArmRequestCatalogRow[] = matched.slice(0, limit).map((r) => ({
      id: r.id,
      requestCode: r.requestCode ?? "",
      title: r.title,
      status: r.status,
      actorName: r.actorName,
      customerName: r.customerName ?? r.rawCustomerName,
      customerMobile: r.customerMobile,
      // P6521/M2 — منطقه‌های منتخب (متن ساده؛ تهی = هنوز از منبع تکمیل نشده)
      areaNames: parseAreaNamesJson(r.areaNamesJson),
      // P6547/گام دوم — محله‌های منتخب + پرداخت/جدیت/فوریت/لوکس/معاوضه از خود ردیف فهرست
      lineNames: parseAreaNamesJson(r.lineNamesJson),
      // P6530/گام ۲ — دسته‌بندی + بازهٔ قیمت متقاضی
      tradeTypeName: r.tradeTypeName,
      // P6546/گام دوم — نوع ملک + نوع ساختمان درخواستی
      propertyTypeName: r.propertyTypeName,
      buildingTypeName: r.buildingTypeName,
      priceFrom: r.priceFrom,
      priceTo: r.priceTo,
      paymentMethodName: r.userPaymentMethodName,
      seriousnessName: r.userSeriousityName,
      urgent: r.urgent,
      luxury: r.luxury,
      changeable: r.changeable,
      enrichedAt: r.extractedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      // PN-002 گام ۲ — ستون‌های تازه
      spaceFrom: r.spaceFrom,
      spaceTo: r.spaceTo,
      roomsFrom: r.roomsFrom,
      roomsTo: r.roomsTo,
      floorFrom: r.floorFrom,
      floorTo: r.floorTo,
      buildYearFrom: r.buildYearFrom,
      buildYearTo: r.buildYearTo,
      sanadNames: r.sanadNames,
      constructTypeNames: r.constructTypeNames,
      sideNames: r.sideNames,
      occasion: r.occasion,
      deposit: r.deposit,
      confirmSms: r.confirmSms,
      notifyMe: r.notifyMe,
      changeWithNames: r.changeWithNames,
      armBranchTitle: r.armBranchTitle,
      stateName: r.stateName,
      cityName: r.cityName,
      platform: r.platform,
      customerDescription: r.customerDescription,
    }));
    return { rows, total: matched.length };
  }

  /** شمارش غنی‌سازی درخواست‌های ARM — extractionBatchId تهی = در انتظار لایه ۲ */
  async countArmEnrichment(): Promise<EnrichmentCounts> {
    const whereArm: Prisma.RequestRecordWhereInput = { source: "arm" };
    const [total, pending] = await Promise.all([
      this.client.requestRecord.count({ where: whereArm }),
      this.client.requestRecord.count({ where: { source: "arm", extractionBatchId: null } }),
    ]);
    return { total, pending, complete: total - pending };
  }

  /** P6.5-11 (بند ب) — شمارش کل رکوردهای کاتالوگ ARM (source='arm') */
  async countArmSource(): Promise<number> {
    return this.client.requestRecord.count({ where: { source: "arm" } });
  }

  /** P6530/گام ۲ (بند ۳) — توزیع وضعیت‌های خام درخواست‌های ARM (status × count) برای بینش شش‌حالته */
  async statusBreakdownArm(): Promise<Array<{ status: string | null; count: number }>> {
    const grouped = await this.client.requestRecord.groupBy({
      by: ["status"],
      where: { source: "arm" },
      _count: { _all: true },
    });
    return grouped.map((g) => ({ status: g.status, count: g._count._all }));
  }

  /** برش ردیف‌های در انتظار غنی‌سازی — جدیدترین اول (بیشترین ارزش فوری) */
  async listPendingArmEnrichment(maxRows: number, rowIds?: string[]): Promise<PendingEnrichmentRow[]> {
    const where: Prisma.RequestRecordWhereInput =
      rowIds && rowIds.length > 0
        ? { source: "arm", id: { in: rowIds } } // P6549 — هدفمند: re-enrichment ستون‌های ناقص (بدون فیلتر pending)
        : { source: "arm", extractionBatchId: null };
    const records = await this.client.requestRecord.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      take: maxRows,
      select: { id: true, requestCode: true },
    });
    return records.map((r) => ({ id: r.id, naturalKey: r.requestCode ?? "" }));
  }

  /** P6.5-11 (بند پ-۵) — تماس درخواست‌دهنده بر اساس کددرخواست‌ها (دسته‌ای؛ source='arm')
   * فقط خواندن ستون‌های موجود — هیچ نوشتنی انجام نمی‌شود (قانون دادهٔ خام) */
  async findArmRequesterContactsByCodes(
    requestCodes: string[]
  ): Promise<Array<{ requestCode: string; customerName: string | null; customerMobile: string | null }>> {
    if (requestCodes.length === 0) return [];
    const codes = [...new Set(requestCodes)].filter((c) => c !== "");
    if (codes.length === 0) return [];
    const records = await this.client.requestRecord.findMany({
      where: { source: "arm", requestCode: { in: codes } },
      select: { requestCode: true, customerName: true, customerMobile: true },
    });
    return records
      .filter((r): r is { requestCode: string; customerName: string | null; customerMobile: string | null } => r.requestCode !== null)
      .map((r) => ({ requestCode: r.requestCode as string, customerName: r.customerName, customerMobile: r.customerMobile }));
  }
}
