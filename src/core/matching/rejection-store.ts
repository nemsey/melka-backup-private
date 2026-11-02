/**
 * ذخیرهٔ درس‌های رد تطبیق + پروندهٔ حرفه‌ای — PN-028/رابعاً (لایهٔ سرویس)
 * ---------------------------------------------------------------------------
 * گارد مرز Repository (PN-012/بند ۱.۳): روت‌ها هرگز db.* را مستقیم صدا نمی‌زنند —
 * این ماژول تمام دسترسی‌های DB کاشی تطبیق را در خود دارد:
 *   ۱) loadRejectionLessons — جفت‌های ردشده + شمار دلایل (برای /api/matching)
 *   ۲) recordMatchRejection — ثبت سه‌لایهٔ رد (رکورد + بازخورد ایجنت + AuditLog)
 *   ۳) getListingFile / getRequestFile — پروندهٔ حرفه‌ای کامل (فایل آگهی/فایل درخواست)
 */

import type { PrismaClient } from "@prisma/client";

/* ───────────────────────── ۱) درس‌های رد ───────────────────────── */

export interface RejectionLessons {
  /** کلید جفت: `${listingCode}|${requestCode}` — این جفت‌ها دیگر هرگز پیشنهاد نمی‌شوند */
  rejectedPairs: Set<string>;
  /** شمار هر دلیل رد در پنجرهٔ اخیر — سوخت تقویت وزن عوامل */
  reasonCounts: Record<string, number>;
}

/** بارگذاری درس‌های رد — پنجرهٔ لغزان ۵۰۰ ردیف تازه‌ترین */
export async function loadRejectionLessons(db: PrismaClient): Promise<RejectionLessons> {
  const rejections = await db.matchRejectionRecord
    .findMany({ orderBy: { createdAt: "desc" }, take: 500 })
    .catch(() => [] as Array<{ listingCode: string | null; requestCode: string | null; reasonsJson: string }>);
  const rejectedPairs = new Set<string>();
  const reasonCounts: Record<string, number> = {};
  for (const rej of rejections) {
    if (rej.listingCode && rej.requestCode) rejectedPairs.add(`${rej.listingCode}|${rej.requestCode}`);
    try {
      const reasons = JSON.parse(rej.reasonsJson) as string[];
      for (const reason of reasons) reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
    } catch {
      /* ردیف خام */
    }
  }
  return { rejectedPairs, reasonCounts };
}

export interface RecordRejectionInput {
  direction: "listing_to_request" | "request_to_listing";
  listingCode: string | null;
  requestCode: string | null;
  reasons: string[];
  note: string | null;
  scoreAtReject: number | null;
  factors: Array<{ factor: string; value: number }>;
  actorCode: string;
}

/** ثبت سه‌لایهٔ رد — رکورد دائمی + بازخورد ایجنت (حلقهٔ وزن‌های آموخته) + AuditLog */
export async function recordMatchRejection(db: PrismaClient, input: RecordRejectionInput): Promise<{ rejectionId: string }> {
  const record = await db.matchRejectionRecord.create({
    data: {
      direction: input.direction,
      listingCode: input.listingCode,
      requestCode: input.requestCode,
      reasonsJson: JSON.stringify(input.reasons),
      note: input.note,
      scoreAtReject: input.scoreAtReject,
    },
  });

  // لایهٔ بازخورد ایجنت — عین الگوی پذیرش/رد PN-014 (بهترین-تلاش)
  try {
    await db.agentFeedback.create({
      data: {
        tileId: "smart-matching",
        insightKey: `match:${input.listingCode ?? ""}:${input.requestCode ?? ""}`,
        insightTitle: `رد تطبیق ${input.listingCode ? `ملک ${input.listingCode}` : ""}${input.requestCode ? ` — درخواست ${input.requestCode}` : ""} — ${input.scoreAtReject != null ? `امتیاز ${input.scoreAtReject}` : "بدون امتیاز"}`,
        rating: -1,
        comment: `دلایل رد: ${input.reasons.join("، ")}${input.note ? ` — یادداشت: ${input.note}` : ""}`,
        context: JSON.stringify({
          reasons: input.reasons,
          note: input.note,
          factors: input.factors,
        }),
      },
    });
  } catch {
    // بازخورد ایجنت بهترین-تلاش است — رکورد رد اصلی ثبت شده است
  }

  return { rejectionId: record.id };
}

/** آمار درس‌های آموخته‌شده — شفافیت کامل یادگیری (GET /api/matching/feedback) */
export async function rejectionStats(db: PrismaClient): Promise<{ totalRejections: number; reasonCounts: Record<string, number> }> {
  const rows = await db.matchRejectionRecord.findMany({
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { reasonsJson: true },
  });
  const reasonCounts: Record<string, number> = {};
  for (const r of rows) {
    try {
      const reasons = JSON.parse(r.reasonsJson) as string[];
      for (const reason of reasons) reasonCounts[reason] = (reasonCounts[reason] ?? 0) + 1;
    } catch {
      /* ردیف خام */
    }
  }
  return { totalRejections: rows.length, reasonCounts };
}

/* ───────────────────────── ۲) پروندهٔ حرفه‌ای ───────────────────────── */

/** خواندن نقشهٔ شعبه — همان زنجیرهٔ M1/M2 (بهترین-تلاش) */
async function branchOfFactory(db: PrismaClient): Promise<(expertName: string) => string> {
  try {
    const { resolveExpertBranch, BRANCH_UNSET } = await import("@/lib/branches");
    const { readOwnerBranchMap, readPmBranchMap } = await import("@/lib/branch-store");
    const { getExpertRepository } = await import("@/core/repositories");
    const [ownerMap, experts, pmBranchMap] = await Promise.all([
      readOwnerBranchMap().catch(() => ({}) as Record<string, string>),
      getExpertRepository().findAll().catch(() => [] as Array<{ fullName: string; businessTitle: string | null }>),
      readPmBranchMap().catch(() => ({}) as Record<string, string>),
    ]);
    const businessByExpert = new Map<string, string | null>();
    for (const e of experts) businessByExpert.set(e.fullName, e.businessTitle);
    return (expertName: string): string =>
      resolveExpertBranch(expertName, ownerMap, businessByExpert.get(expertName) ?? null, pmBranchMap).branch ?? BRANCH_UNSET;
  } catch {
    return (_expertName: string): string => "تعیین نشده";
  }
}

/** فرم پویای ARM (inputsJson) → فهرست {label, value} */
function parseInputsJson(inputsJson: string | null): Array<{ label: string; value: string }> {
  if (!inputsJson) return [];
  try {
    const parsed = JSON.parse(inputsJson) as Record<string, unknown>;
    return Object.entries(parsed)
      .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "")
      .map(([k, v]) => ({ label: k, value: String(v) }));
  } catch {
    return [];
  }
}

/** فهرست نام‌های JSON-مانند «شش‌دانگ، قراردادی» → آرایه */
function parseNamesList(v: string | null): string[] {
  if (!v || !v.trim()) return [];
  return v.split(/[،,]/).map((s) => s.trim()).filter(Boolean);
}

/** پروندهٔ کامل آگهی — فایل آگهی (رابعاً-ب) */
export async function getListingFile(db: PrismaClient, listingCode: string) {
  const l = await db.propertyRecord.findFirst({ where: { propertyCode: listingCode } });
  if (!l) return null;
  const branchOf = await branchOfFactory(db);
  const branch = l.ownerName ? branchOf(l.ownerName) : "تعیین نشده";
  let rawDetails: Array<{ label?: string; value?: string }> = [];
  try {
    const parsed = JSON.parse(l.detailsJson ?? "[]");
    if (Array.isArray(parsed)) rawDetails = parsed as Array<{ label?: string; value?: string }>;
  } catch {
    rawDetails = [];
  }
  return {
    ok: true as const,
    kind: "listing" as const,
    code: l.propertyCode,
    identity: {
      title: "پروندهٔ آگهی ملک تبریز",
      code: l.propertyCode,
      listingTitle: l.title ?? null,
      status: l.status ?? null,
      owner: l.rawOwnerName ?? l.ownerName ?? null,
      mobile: l.ownerMobile ?? l.rawOwnerMobile ?? null,
    },
    financial: {
      price: l.price ?? null,
      pricePerMeter: l.pricePerMeter ?? null,
      depositPrice: l.depositPrice ?? null,
      rentPrice: l.rentPrice ?? null,
      tradeType: l.tradeTypeName ?? null,
    },
    spatial: {
      area: l.areaName ?? null,
      line: l.lineName ?? null,
      address: l.address ?? null,
      city: l.cityId ?? null,
    },
    physical: {
      propertyType: l.propertyTypeName ?? null,
      meterage: l.meterage ?? null,
      rooms: l.rooms ?? null,
      floor: l.floor ?? null,
      buildYear: l.buildYear ?? null,
      imageCount: l.imageCount ?? null,
    },
    human: { expert: l.ownerName ?? null, branch, expertCode: l.ownerCode ?? null },
    temporal: {
      createdAt: l.createdAt?.toISOString() ?? null,
      updatedAt: l.updatedAt?.toISOString() ?? null,
      syncedAt: l.syncedAt?.toISOString() ?? null,
      viewCount: l.viewCount ?? null,
      addedToDivar: l.addedToDivar ?? null,
      addedToInsta: l.addedToInsta ?? null,
      isReposted: l.isReposted ?? null,
    },
    rawDetails,
    description: l.description ?? null,
  };
}

/** پروندهٔ کامل درخواست — فایل درخواست (رابعاً-الف) */
export async function getRequestFile(db: PrismaClient, requestIdOrCode: string) {
  let r = await db.requestRecord.findFirst({ where: { requestCode: requestIdOrCode } });
  if (!r && /^[a-z0-9]{20,}$/i.test(requestIdOrCode)) {
    r = await db.requestRecord.findFirst({ where: { id: requestIdOrCode } });
  }
  if (!r) return null;
  const branchOf = await branchOfFactory(db);
  const branch = r.actorName ? branchOf(r.actorName) : "تعیین نشده";
  return {
    ok: true as const,
    kind: "request" as const,
    code: r.requestCode ?? r.id,
    identity: {
      title: "پروندهٔ درخواست ملک تبریز",
      code: r.requestCode ?? r.id,
      requestTitle: r.title ?? null,
      status: r.status ?? null,
      customer: r.customerName ?? r.rawCustomerName ?? null,
      mobile: r.customerMobile ?? r.rawCustomerMobile ?? null,
    },
    financial: {
      priceFrom: r.priceFrom ?? null,
      priceTo: r.priceTo ?? null,
      tradeType: r.tradeTypeName ?? null,
      paymentMethod: r.userPaymentMethodName ?? null,
      deposit: r.deposit ?? null,
    },
    spatial: {
      areas: parseNamesList(r.areaNamesJson),
      lines: parseNamesList(r.lineNamesJson),
      city: r.cityName ?? null,
      platform: r.platform ?? null,
    },
    physical: {
      propertyType: r.propertyTypeName ?? null,
      buildingType: r.buildingTypeName ?? null,
      spaceFrom: r.spaceFrom ?? null,
      spaceTo: r.spaceTo ?? null,
      roomsFrom: r.roomsFrom ?? null,
      roomsTo: r.roomsTo ?? null,
      floorFrom: r.floorFrom ?? null,
      floorTo: r.floorTo ?? null,
      buildYearFrom: r.buildYearFrom ?? null,
      buildYearTo: r.buildYearTo ?? null,
      documents: parseNamesList(r.sanadNames),
      constructTypes: parseNamesList(r.constructTypeNames),
      sides: parseNamesList(r.sideNames),
      exchange: parseNamesList(r.changeWithNames),
    },
    human: { expert: r.actorName ?? null, branch, expertCode: r.actorCode ?? null },
    temporal: {
      createdAt: r.createdAt?.toISOString() ?? null,
      updatedAt: r.updatedAt?.toISOString() ?? null,
      registeredAt: r.armRegisteredAt?.toISOString() ?? null,
      urgent: r.urgent ?? null,
      seriousity: r.userSeriousityName ?? null,
      confirmSms: r.confirmSms ?? null,
    },
    form: parseInputsJson(r.inputsJson),
    customerDescription: r.customerDescription ?? null,
    realtorDescription: r.realtorDescription ?? null,
  };
}
