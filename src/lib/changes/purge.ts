/**
 * purge.ts — کاشی «تغییرات» · پاکسازی کامل (DIR-CHANGES-TILE-002)
 * ---------------------------------------------------------------------------
 * «حذف کد» طبق دستور مالک: هر کدآگهی/کددرخواست اعلامی کاملاً حذف شود و
 * «هیچ اثری از آن کد حذف‌شده در سامانه‌ها باقی نماند و پاکسازی کامل انجام شود» —
 * مخصوصاً در پروفایل کارشناسان ثبت‌کننده.
 *
 * نقشهٔ کامل آثار محلی (برگرفته از پیمایش schema):
 *   کدآگهی: PropertyRecord (کاتالوگ M1) · ListingRecord (فایل آگهی) ·
 *     RequestEventRecord (رویدادهای مرتبط: propertyCode/armPropertyId) ·
 *     VisitRecord (بازدیدها) · SpecialPropertyRecord (کارگزاری‌ها) ·
 *     TransactionRecord (معاملات) · ContractRecord (قراردادها) ·
 *     MatchRejectionRecord (رد تطبیق) · OpportunityAlert (هشدار فرصت) ·
 *     GraphNode/GraphEdge (گراف هوشمند — گره ملک/آگهی و یال‌هایش)
 *   کددرخواست: RequestRecord (کاتالوگ M2 + رکورد) · RequestEventRecord (آینه + cascade) ·
 *     TransactionRecord · ContractRecord · MatchRejectionRecord · OpportunityAlert ·
 *     GraphNode/GraphEdge (گره request)
 *
 * قانون: پاکسازی محلی «بازگشت‌ناپذیر» است — فقط با تأیید صریح عملیات حذف از
 * مسیر executor فراخوانی می‌شود و شمارش هر جدول در گزارش گام ثبت می‌شود.
 */

import { db } from "@/lib/db";

export interface PurgeCounts {
  propertyCatalog: number;
  listingFiles: number;
  linkedEvents: number;
  visits: number;
  specialProperties: number;
  transactions: number;
  contracts: number;
  matchRejections: number;
  opportunityAlerts: number;
  graphNodes: number;
  graphEdges: number;
}

export interface RequestPurgeCounts extends Omit<PurgeCounts, "propertyCatalog" | "listingFiles" | "visits" | "specialProperties"> {
  requestRecords: number;
  requestEvents: number;
}

/** پاکسازی کامل همهٔ آثار محلی یک کدآگهی */
export async function purgeListingLocally(propertyCode: string, armPropertyId: string | null): Promise<PurgeCounts> {
  const code = propertyCode.trim();

  // ۱) رویدادهای مرتبط (تاریخچهٔ رویداد و بازخورد — با کد یا شناسهٔ آگهی)
  const linkedEvents = await db.requestEventRecord.deleteMany({
    where: { OR: [{ propertyCode: code }, ...(armPropertyId ? [{ armPropertyId }] : [])] },
  });

  // ۲) کارگزاری‌های صادره برای این آگهی
  const specialProperties = await db.specialPropertyRecord.deleteMany({
    where: { OR: [{ propertyCode: code }, ...(armPropertyId ? [{ propertyId: armPropertyId }] : [])] },
  });

  // ۳) بازدیدها
  const visits = await db.visitRecord.deleteMany({ where: { propertyCode: code } });

  // ۴) معاملات و قراردادها
  const transactions = await db.transactionRecord.deleteMany({ where: { propertyCode: code } });
  const contracts = await db.contractRecord.deleteMany({ where: { propertyCode: code } });

  // ۵) ردّهای تطبیق و هشدارهای فرصت
  const matchRejections = await db.matchRejectionRecord.deleteMany({ where: { listingCode: code } });
  const opportunityAlerts = await db.opportunityAlert.deleteMany({ where: { listingCode: code } });

  // ۶) گراف هوشمند — گره‌های این آگهی + همهٔ یال‌های متصل به آن
  const graphEdges = await db.graphEdge.deleteMany({
    where: {
      OR: [
        { fromType: "property", fromRef: code },
        { toType: "property", toRef: code },
      ],
    },
  });
  const graphNodes = await db.graphNode.deleteMany({
    where: {
      OR: [
        { nodeType: "property", refId: code },
        ...(armPropertyId ? [{ nodeType: "property", refId: armPropertyId }] : []),
      ],
    },
  });

  // ۷) فایل‌های آگهی محلی (فرم ۵ گامی — پیوند با ARM)
  const listingFiles = armPropertyId
    ? await db.listingRecord.deleteMany({ where: { armPropertyId } })
    : { count: 0 };

  // ۸) کاتالوگ M1 (آینهٔ فهرست آگهی‌های ARM — در آخر تا پیش‌شرط‌های بالا پاک شوند)
  const propertyCatalog = await db.propertyRecord.deleteMany({ where: { propertyCode: code } });

  return {
    propertyCatalog: propertyCatalog.count,
    listingFiles: listingFiles.count,
    linkedEvents: linkedEvents.count,
    visits: visits.count,
    specialProperties: specialProperties.count,
    transactions: transactions.count,
    contracts: contracts.count,
    matchRejections: matchRejections.count,
    opportunityAlerts: opportunityAlerts.count,
    graphNodes: graphNodes.count,
    graphEdges: graphEdges.count,
  };
}

/** پاکسازی کامل همهٔ آثار محلی یک کددرخواست (رکورد + cascade رویدادها) */
export async function purgeRequestLocally(requestCode: string): Promise<RequestPurgeCounts> {
  const code = requestCode.trim();

  // ۱) معاملات و قراردادها
  const transactions = await db.transactionRecord.deleteMany({ where: { requestCode: code } });
  const contracts = await db.contractRecord.deleteMany({ where: { requestCode: code } });

  // ۲) ردّهای تطبیق و هشدارهای فرصت
  const matchRejections = await db.matchRejectionRecord.deleteMany({ where: { requestCode: code } });

  // ۳) هشدارهای فرصت با شناسهٔ رکورد (OpportunityAlert.requestId = RequestRecord.id)
  const requestRecords = await db.requestRecord.findMany({ where: { requestCode: code }, select: { id: true } });
  let opportunityAlerts = { count: 0 };
  if (requestRecords.length > 0) {
    opportunityAlerts = await db.opportunityAlert.deleteMany({ where: { requestId: { in: requestRecords.map((r) => r.id) } } });
  }

  // ۴) گراف هوشمند — گره‌های این درخواست + یال‌هایش
  const graphEdges = await db.graphEdge.deleteMany({
    where: {
      OR: [
        { fromType: "request", fromRef: code },
        { toType: "request", toRef: code },
      ],
    },
  });
  const graphNodes = await db.graphNode.deleteMany({ where: { nodeType: "request", refId: code } });

  // ۵) رکوردهای درخواست (رویدادهای محلی با onDelete: Cascade خودکار حذف می‌شوند)
  const requestEventsCascade = await db.requestEventRecord.count({ where: { request: { requestCode: code } } });
  const deleted = await db.requestRecord.deleteMany({ where: { requestCode: code } });

  return {
    requestRecords: deleted.count,
    requestEvents: requestEventsCascade,
    linkedEvents: 0,
    transactions: transactions.count,
    contracts: contracts.count,
    matchRejections: matchRejections.count,
    opportunityAlerts: opportunityAlerts.count,
    graphNodes: graphNodes.count,
    graphEdges: graphEdges.count,
  };
}

/** شمارش آثار پیش از حذف — برای نمایش «چه چیزی پاک خواهد شد» به مالک */
export async function countListingTraces(propertyCode: string, armPropertyId: string | null): Promise<PurgeCounts> {
  const code = propertyCode.trim();
  const [propertyCatalog, listingFiles, linkedEvents, visits, specialProperties, transactions, contracts, matchRejections, opportunityAlerts, graphNodes, graphEdges] =
    await Promise.all([
      db.propertyRecord.count({ where: { propertyCode: code } }),
      armPropertyId ? db.listingRecord.count({ where: { armPropertyId } }) : Promise.resolve(0),
      db.requestEventRecord.count({ where: { OR: [{ propertyCode: code }, ...(armPropertyId ? [{ armPropertyId }] : [])] } }),
      db.visitRecord.count({ where: { propertyCode: code } }),
      db.specialPropertyRecord.count({ where: { OR: [{ propertyCode: code }, ...(armPropertyId ? [{ propertyId: armPropertyId }] : [])] } }),
      db.transactionRecord.count({ where: { propertyCode: code } }),
      db.contractRecord.count({ where: { propertyCode: code } }),
      db.matchRejectionRecord.count({ where: { listingCode: code } }),
      db.opportunityAlert.count({ where: { listingCode: code } }),
      db.graphNode.count({ where: { OR: [{ nodeType: "property", refId: code }, ...(armPropertyId ? [{ nodeType: "property", refId: armPropertyId }] : [])] } }),
      db.graphEdge.count({ where: { OR: [{ fromType: "property", fromRef: code }, { toType: "property", toRef: code }] } }),
    ]);
  return { propertyCatalog, listingFiles, linkedEvents, visits, specialProperties, transactions, contracts, matchRejections, opportunityAlerts, graphNodes, graphEdges };
}

/** شمارش آثار درخواست پیش از حذف */
export async function countRequestTraces(requestCode: string): Promise<RequestPurgeCounts & { armRequestId: string | null }> {
  const code = requestCode.trim();
  const rec = await db.requestRecord.findFirst({ where: { requestCode: code }, select: { id: true, armRequestId: true } });
  const [requestRecords, requestEvents, transactions, contracts, matchRejections, opportunityAlerts, graphNodes, graphEdges] = await Promise.all([
    db.requestRecord.count({ where: { requestCode: code } }),
    db.requestEventRecord.count({ where: { request: { requestCode: code } } }),
    db.transactionRecord.count({ where: { requestCode: code } }),
    db.contractRecord.count({ where: { requestCode: code } }),
    db.matchRejectionRecord.count({ where: { requestCode: code } }),
    rec ? db.opportunityAlert.count({ where: { requestId: rec.id } }) : Promise.resolve(0),
    db.graphNode.count({ where: { nodeType: "request", refId: code } }),
    db.graphEdge.count({ where: { OR: [{ fromType: "request", fromRef: code }, { toType: "request", toRef: code }] } }),
  ]);
  return {
    requestRecords,
    requestEvents,
    linkedEvents: 0,
    transactions,
    contracts,
    matchRejections,
    opportunityAlerts,
    graphNodes,
    graphEdges,
    armRequestId: rec?.armRequestId ?? null,
  };
}
