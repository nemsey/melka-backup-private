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

function toArmRequestData(r: ArmRequestBulkRow): Record<string, unknown> {
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
    // B.3 (P6.5-04-v2) — لایه ۱ حقیقت: نام/موبایل مشتری خام
    ...(r.rawCustomerName !== undefined ? { rawCustomerName: r.rawCustomerName } : {}),
    ...(r.rawCustomerMobile !== undefined ? { rawCustomerMobile: r.rawCustomerMobile } : {}),
    // P6.5-04-e-v2 — provenance سه‌لایه حقیقت
    ...(r.rawSourceVersion !== undefined ? { rawSourceVersion: r.rawSourceVersion } : {}),
    ...(r.extractedAt !== undefined ? { extractedAt: r.extractedAt } : {}),
    ...(r.extractionBatchId !== undefined ? { extractionBatchId: r.extractionBatchId } : {}),
    ...(r.normalizationVersion !== undefined ? { normalizationVersion: r.normalizationVersion } : {}),
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

  /** کاتالوگ تک‌صفحه‌ای درخواست‌های ARM — فیلتر کد/نام کارشناس؛ جدیدترین اول
   *
   * P6525 — قانون یکسان‌سازی (رفع باگ تاریخی ۴/۵ + هم‌ارزی ي/ی و ك/ک):
   * فیلترهای کد و نام کارشناس با نرمال‌سازی دوطرفه در JS اعمال می‌شوند
   * (نرمال هر دو سمت) ⇒ نتیجهٔ ارقام فارسی/عربی/لاتین و حروف همیشه یکسان است. */
  async listArmCatalog(
    filter: ArmRequestCatalogFilter,
    limit: number
  ): Promise<{ rows: ArmRequestCatalogRow[]; total: number }> {
    const where: Prisma.RequestRecordWhereInput = { source: "arm" };

    // P6525 — نرمال‌سازی ورودی فیلترهای کدی/متنی با منبع یگانه
    const codeNorm = normalizeFilterInput(filter.code);
    const realtorNorm = normalizeFilterInput(filter.realtorName);
    const needsJsFilter = codeNorm !== "" || realtorNorm !== "";
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
        extractedAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // P6525 — تطبیق نرمال‌شده: نتیجهٔ فارسی = لاتین = عربی (ارقام) و ي = ی، ك = ک (حروف)
    const matched = needsJsFilter
      ? records.filter((r) => {
          if (codeNorm !== "" && !normalizeFilterInput(r.requestCode).includes(codeNorm)) return false;
          if (realtorNorm !== "" && !normalizeFilterInput(r.actorName).includes(realtorNorm)) return false;
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
      enrichedAt: r.extractedAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
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

  /** برش ردیف‌های در انتظار غنی‌سازی — جدیدترین اول (بیشترین ارزش فوری) */
  async listPendingArmEnrichment(maxRows: number, rowIds?: string[]): Promise<PendingEnrichmentRow[]> {
    const where: Prisma.RequestRecordWhereInput =
      rowIds && rowIds.length > 0
        ? { source: "arm", id: { in: rowIds }, extractionBatchId: null }
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
