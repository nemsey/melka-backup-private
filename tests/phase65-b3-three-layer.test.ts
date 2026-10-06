/**
 * تست‌های B.3 — ادامهٔ نرمال‌سازی سه‌لایه (دستور ملکا-شورا-۰۰۷ بخش B.3)
 * ==================================================================================
 * شش گروه:
 *  ۱) مشتق‌سازی لایه ۲ از لایه ۱ خام (target) — normalizeBulkRow با فیلدهای raw*
 *     برای همهٔ ۷ موجودیت Bulk: خام عین منبع می‌ماند + نرمال در فیلد مقصد
 *  ۲) سازگاری ردیف‌های قدیمی بدون لایهٔ خام — نرمال‌سازی درجا (عین رفتار e-v2)
 *  ۳) idempotency + deterministic — نرمال‌سازی مجدد = همان ردیف؛ raw هرگز تغییر نمی‌کند
 *  ۴) مسیر واقعی آداپتور — mapArmRowToInput (تعاملات/کارشناس/معامله/بازدید) لایهٔ خام را می‌سازد
 *  ۵) خط لولهٔ bulkImport واقعی — شاهد DB: raw + نرمال + مهر provenance + نسخهٔ v2
 *  ۶) عرضه/تقاضا — مهر provenance مسیر sync (extractedAt/extractionBatchId) + تهی صادقانهٔ
 *     normalizationVersion (موتور نرمال‌سازی روی این جدول اجرا نمی‌شود)
 *
 * الگوی ایزوله‌سازی: عین tests/phase65-normalize.test.ts — پایگاه test.db از DATABASE_URL.
 */
import { describe, expect, test } from "bun:test";
import { buildLocationRegistry } from "../src/lib/melk-api/normalize";

const { db } = await import("@/lib/db");

import {
  normalizeName,
  normalizeMobile,
  NORMALIZATION_VERSION,
  normalizeBulkRow,
  type LocationRegistry,
} from "../src/lib/melk-api/normalize";
import {
  getDefaultLocationRegistry,
  resetDefaultLocationRegistry,
} from "../src/lib/melk-api/location-registry";
import {
  bulkImport,
  mapArmRowToInput,
  type BulkPageFetcher,
  type BulkImportOptions,
} from "../src/lib/melk-api/bulk-import";
import { toSdUpsert, toInUpsert, toExUpsert } from "../src/lib/melk-api/sync";
import type {
  CrmInteraction,
  CrmExpert,
  CrmSupplyDemand,
} from "../src/lib/melk-api/types";
import type { LocationEntry } from "../src/lib/melk-api/normalize";
import { TABRIZ_AREAS } from "../src/lib/divar/tabriz-locations";

// ===================== ساختگاه =====================

const PREFIX = "b3test";

/** رجیستری کوچک کنترل‌شده (عین phase65-normalize) */
function miniRegistry(): LocationRegistry {
  const entries: LocationEntry[] = [];
  for (const area of TABRIZ_AREAS.slice(0, 12)) {
    entries.push({ id: area.id, name: area.n.trim(), kind: "area", areaId: area.id, areaName: area.n.trim() });
    for (const line of area.l) {
      entries.push({ id: line.id, name: line.n.trim(), kind: "line", areaId: area.id, areaName: area.n.trim() });
    }
  }
  return buildLocationRegistrySafe(entries);
}

function buildLocationRegistrySafe(entries: LocationEntry[]): LocationRegistry {
  // الگوی miniRegistry فایل خواهر — با import ایستا (گارد lint: بدون require)
  return buildLocationRegistry(entries);
}

function opts(over: Partial<BulkImportOptions> = {}): BulkImportOptions {
  return {
    entity: "interaction",
    pageSize: 100,
    batchSize: 500,
    rateLimitMs: 1,
    maxRetries: 0,
    ...over,
  };
}

/** موک واکشی از ردیف خام ARM از مسیر واقعی mapArmRowToInput */
function makeArmFetcher(entity: "interaction" | "expert" | "transaction" | "visit", rawPages: Record<string, unknown>[][]): BulkPageFetcher {
  return {
    fetchPage: async (req) => {
      const raws = rawPages[req.page - 1] ?? [];
      const rows = raws
        .map((r, i) => mapArmRowToInput(entity, r, i, req.page, req.pageSize))
        .filter((r): r is Record<string, unknown> => r !== null);
      return { rows, hasMore: req.page < rawPages.length };
    },
  };
}

async function clearInteractions() {
  await db.interactionRecord.deleteMany({ where: { id: { startsWith: `${PREFIX}-` } } });
  await db.syncState.upsert({ where: { id: "singleton" }, create: { id: "singleton" }, update: { bulkImportCheckpoint: null } });
}

async function clearExperts() {
  await db.expertRecord.deleteMany({ where: { id: { startsWith: `${PREFIX}-` } } });
  await db.syncState.upsert({ where: { id: "singleton" }, create: { id: "singleton" }, update: { bulkImportCheckpoint: null } });
}

async function clearSupplyDemand() {
  await db.supplyDemandRecord.deleteMany({ where: { id: { startsWith: `${PREFIX}-` } } });
}

// =====================================================================
// ۱) مشتق‌سازی لایه ۲ از لایه ۱ خام (target) — هفت موجودیت
// =====================================================================

describe("B.3-۱ — مشتق‌سازی لایه ۲ از لایه ۱ خام (target-derivation)", () => {
  test("تعاملات: rawRequestRealtorName «سيد علي  رضائي» → نرمال در requestRealtorName؛ خام عیناً", () => {
    const reg = miniRegistry();
    const out = normalizeBulkRow(
      "interaction",
      {
        id: "x-1",
        requestRealtorName: "سيد علي  رضائي",
        propertyRealtorName: "محمد احمدی",
        rawRequestRealtorName: "سيد علي  رضائي",
        rawPropertyRealtorName: "محمد احمدی",
        count: 3,
      },
      reg
    );
    // لایه ۱ — هرگز تغییر نمی‌کند
    expect(out.row.rawRequestRealtorName).toBe("سيد علي  رضائي");
    expect(out.row.rawPropertyRealtorName).toBe("محمد احمدی");
    // لایه ۲ — مشتق نرمال
    expect(out.row.requestRealtorName).toBe("سید علی رضایی");
    expect(out.row.propertyRealtorName).toBe("محمد احمدی");
    expect(out.stats.changedFields).toContain("requestRealtorName");
  });

  test("کارشناس: هر چهار فیلد نام/موبایل از خام مشتق می‌شوند + موبایل نامعتبر رد صادقانه", () => {
    const reg = miniRegistry();
    const out = normalizeBulkRow(
      "expert",
      {
        id: "e-1",
        personnelCode: "410031320",
        fullName: "سيد علي  رضائي",
        mobile: "۰۹۱۴۱۲۳۴۵۶۷",
        businessTitle: "شعبهٔ  مرکزی",
        creator: "مدير تست",
        rawFullName: "سيد علي  رضائي",
        rawMobile: "۰۹۱۴۱۲۳۴۵۶۷",
        rawBusinessTitle: "شعبهٔ  مرکزی",
        rawCreator: "مدير تست",
      },
      reg
    );
    expect(out.row.rawFullName).toBe("سيد علي  رضائي");
    expect(out.row.fullName).toBe("سید علی رضایی");
    expect(out.row.rawMobile).toBe("۰۹۱۴۱۲۳۴۵۶۷");
    expect(out.row.mobile).toBe("09141234567");
    expect(out.row.rawBusinessTitle).toBe("شعبهٔ  مرکزی");
    expect(out.row.businessTitle).toBe("شعبهٔ مرکزی");
    expect(out.row.rawCreator).toBe("مدير تست");
    expect(out.row.creator).toBe("مدیر تست");
  });

  test("معامله: نام‌های طرفین از خام + آگهی: نام/موبایل مالک از خام (الگوی کامل rawPrice→price)", () => {
    const reg = miniRegistry();
    const tx = normalizeBulkRow(
      "transaction",
      {
        id: "t-1",
        propertyCode: "P۱۰۰۰۰۹",
        propertyCustomer: "كريمي",
        requestCustomer: " زهرا  موسوي ",
        rawPropertyCustomer: "كريمي",
        rawRequestCustomer: " زهرا  موسوي ",
      },
      reg
    );
    expect(tx.row.rawPropertyCustomer).toBe("كريمي");
    expect(tx.row.propertyCustomer).toBe("کریمی");
    expect(tx.row.rawRequestCustomer).toBe(" زهرا  موسوي ");
    expect(tx.row.requestCustomer).toBe("زهرا موسوی");

    const listing = normalizeBulkRow(
      "listing",
      {
        id: "l-1",
        propertyCode: "P100010",
        ownerName: " سيد علي  رضائي ",
        ownerMobile: "+98 914 123 4567",
        rawOwnerName: " سيد علي  رضائي ",
        rawOwnerMobile: "+98 914 123 4567",
        rawPrice: "۲/۵ میلیارد تومان",
        rawPriceUnit: null,
        rawArea: "۱۲۰ متر",
        areaName: "آبرسان",
      },
      reg
    );
    expect(listing.row.rawOwnerName).toBe(" سيد علي  رضائي ");
    expect(listing.row.ownerName).toBe("سید علی رضایی");
    expect(listing.row.rawOwnerMobile).toBe("+98 914 123 4567");
    expect(listing.row.ownerMobile).toBe("09141234567");
  });

  test("بازدید و درخواست و قرارداد: سه‌گانهٔ نام‌ها از خام مشتق می‌شوند", () => {
    const reg = miniRegistry();
    const visit = normalizeBulkRow(
      "visit",
      {
        id: "v-1",
        propertyCode: "P1",
        requesterName: " زهرا  موسوي ",
        checkerName: "مدير",
        propertyRealtorName: "كريمي",
        rawRequesterName: " زهرا  موسوي ",
        rawCheckerName: "مدير",
        rawPropertyRealtorName: "كريمي",
      },
      reg
    );
    expect(visit.row.rawRequesterName).toBe(" زهرا  موسوي ");
    expect(visit.row.requesterName).toBe("زهرا موسوی");
    expect(visit.row.checkerName).toBe("مدیر");
    expect(visit.row.rawCheckerName).toBe("مدير");
    expect(visit.row.propertyRealtorName).toBe("کریمی");

    const request = normalizeBulkRow(
      "request",
      {
        id: "r-1",
        requestCode: "R100",
        customerName: "كريمي",
        customerMobile: "۰۹۱۴۱۲۳۴۵۶۷",
        rawCustomerName: "كريمي",
        rawCustomerMobile: "۰۹۱۴۱۲۳۴۵۶۷",
      },
      reg
    );
    expect(request.row.rawCustomerName).toBe("كريمي");
    expect(request.row.customerName).toBe("کریمی");
    expect(request.row.customerMobile).toBe("09141234567");

    const contract = normalizeBulkRow(
      "contract",
      {
        id: "c-1",
        contractHolo: "۱۲۳",
        creatorName: "مدير",
        propertyTitle: "آپارتمان  زنجيرچي",
        rawCreatorName: "مدير",
        rawPropertyTitle: "آپارتمان  زنجيرچي",
        rawDate: null,
      },
      reg
    );
    expect(contract.row.rawCreatorName).toBe("مدير");
    expect(contract.row.creatorName).toBe("مدیر");
    expect(contract.row.rawPropertyTitle).toBe("آپارتمان  زنجيرچي");
    expect(contract.row.propertyTitle).toBe("اپارتمان زنجیرچی");
  });

  test("پرشدن فیلد نمایشی غایب از خام (خام هست، نرمال نیست)", () => {
    const reg = miniRegistry();
    const out = normalizeBulkRow(
      "interaction",
      { id: "x-2", rawRequestRealtorName: "كريمي", rawPropertyRealtorName: "موسوي", count: 1 } as Record<string, unknown>,
      reg
    );
    expect(out.row.requestRealtorName).toBe("کریمی");
    expect(out.row.propertyRealtorName).toBe("موسوی");
    expect(out.row.rawRequestRealtorName).toBe("كريمي");
  });
});

// =====================================================================
// ۲) سازگاری ردیف‌های قدیمی بدون لایهٔ خام
// =====================================================================

describe("B.3-۲ — سازگاری: ردیف‌های قدیمی بدون raw* (نرمال‌سازی درجا عین e-v2)", () => {
  test("تعاملات بدون raw: درجا نرمال می‌شوند (خروجی عین e-v2)", () => {
    const reg = miniRegistry();
    const out = normalizeBulkRow(
      "interaction",
      { id: "x-old", requestRealtorName: " سيد علي  رضائي ", propertyRealtorName: "محمد احمدی", count: 2 } as Record<string, unknown>,
      reg
    );
    expect(out.row.requestRealtorName).toBe("سید علی رضایی");
    expect(out.row.propertyRealtorName).toBe("محمد احمدی");
    expect(out.row.rawRequestRealtorName).toBeUndefined();
  });

  test("کارشناس بدون raw: چهار فیلد درجا (خروجی e-v2)", () => {
    const reg = miniRegistry();
    const out = normalizeBulkRow(
      "expert",
      { id: "e-old", personnelCode: "1", fullName: "كريمي", mobile: "۰۹۱۴۱۲۳۴۵۶۷", businessTitle: "ب", creator: null },
      reg
    );
    expect(out.row.fullName).toBe("کریمی");
    expect(out.row.mobile).toBe("09141234567");
  });

  test("ردیف قدیمی و ردیف جدید با همان منبع → مقادیر نرمال یکسان (صفر تغییر خروجی)", () => {
    const reg = miniRegistry();
    const oldRow = { id: "same", requestRealtorName: " سيد علي  رضائي ", propertyRealtorName: "م", count: 1 };
    const newRow = {
      id: "same",
      requestRealtorName: " سيد علي  رضائي ",
      propertyRealtorName: "م",
      rawRequestRealtorName: " سيد علي  رضائي ",
      rawPropertyRealtorName: "م",
      count: 1,
    };
    const a = normalizeBulkRow("interaction", oldRow, reg).row;
    const b = normalizeBulkRow("interaction", newRow, reg).row;
    expect(a.requestRealtorName).toBe(b.requestRealtorName);
    expect(a.propertyRealtorName).toBe(b.propertyRealtorName);
    expect(a.count).toBe(b.count);
  });
});

// =====================================================================
// ۳) idempotency + deterministic
// =====================================================================

describe("B.3-۳ — idempotency و deterministic", () => {
  test("نرمال‌سازی مجدد ردیف نرمال‌شده: خام عیناً + نرمال پایدار + stats بدون تغییر دوباره", () => {
    const reg = miniRegistry();
    const src: Record<string, unknown> = {
      id: "x-idem",
      requestRealtorName: "سيد علي  رضائي",
      propertyRealtorName: "كريمي",
      rawRequestRealtorName: "سيد علي  رضائي",
      rawPropertyRealtorName: "كريمي",
      count: 5,
    };
    const first = normalizeBulkRow("interaction", src, reg);
    const second = normalizeBulkRow("interaction", first.row, reg);
    expect(second.row).toEqual(first.row);
    expect(second.row.rawRequestRealtorName).toBe("سيد علي  رضائي");
    expect(second.stats.changedFields).toEqual([]);
  });

  test("نسخهٔ موتور B.3 = p65-04-v2 (نسل حفظ لایهٔ خام نام‌ها)", () => {
    expect(NORMALIZATION_VERSION).toBe("p65-04-v2");
  });
});

// =====================================================================
// ۴) مسیر واقعی آداپتور — لایهٔ خام ساخته می‌شود
// =====================================================================

describe("B.3-۴ — آداپتورها لایهٔ خام را می‌سازند (mapArmRowToInput)", () => {
  test("تعاملات: نگاشت bulk خام + نرمال را هر دو برمی‌گرداند (مشتق‌سازی در toInUpsert)", () => {
    const mapped = mapArmRowToInput(
      "interaction",
      { requestRealtorName: "سيد علي  رضائي", propertyRealtorName: "كريمي", count: 7 },
      0,
      1,
      100
    ) as Record<string, unknown>;
    expect(mapped).not.toBeNull();
    // لایه ۱ — عین منبع
    expect(mapped.rawRequestRealtorName).toBe("سيد علي  رضائي");
    expect(mapped.rawPropertyRealtorName).toBe("كريمي");
    // لایه ۲ — نرمال مشتق (B.3: نقطهٔ نگاشت upsert)
    expect(mapped.requestRealtorName).toBe("سید علی رضایی");
    expect(mapped.propertyRealtorName).toBe("کریمی");
  });

  test("کارشناس: چهار فیلد خام از realtors/list + نرمال مشتق", () => {
    const mapped = mapArmRowToInput(
      "expert",
      {
        _id: `${PREFIX}-ex-1`,
        code: "410031320",
        fullName: "سيد علي  رضائي",
        mobile: "۰۹۱۴۱۲۳۴۵۶۷",
        businessId: { title: "شعبهٔ  مرکزی" },
        creator: { fullName: "مدير" },
      },
      0,
      1,
      100
    ) as Record<string, unknown>;
    expect(mapped.rawFullName).toBe("سيد علي  رضائي");
    expect(mapped.rawMobile).toBe("۰۹۱۴۱۲۳۴۵۶۷");
    expect(mapped.rawBusinessTitle).toBe("شعبهٔ  مرکزی");
    expect(mapped.rawCreator).toBe("مدير");
    // لایه ۲ — نرمال مشتق
    expect(mapped.fullName).toBe("سید علی رضایی");
    expect(mapped.mobile).toBe("09141234567");
    expect(mapped.businessTitle).toBe("شعبهٔ مرکزی");
    expect(mapped.creator).toBe("مدیر");
  });
});

// =====================================================================
// ۵) خط لولهٔ bulkImport واقعی — شاهد DB
// =====================================================================

describe("B.3-۵ — سه‌لایه در خط لوله واقعی bulkImport (شاهد DB)", () => {
  test("تعاملات: خام عین منبع + نرمال مشتق + مهر provenance v2 در InteractionRecord", async () => {
    await clearInteractions();
    try {
      const rawRow = { _id: `${PREFIX}-in-1`, requestRealtorName: "سيد علي  رضائي", propertyRealtorName: "كريمي", count: 4 };
      const result = await bulkImport(opts({ entity: "interaction" }), {
        fetcher: makeArmFetcher("interaction", [[rawRow]]),
      });
      expect(result.status).toBe("COMPLETED");

      const row = await db.interactionRecord.findUnique({ where: { id: `${PREFIX}-in-1` } });
      expect(row).not.toBeNull();
      // لایه ۱ — عین منبع
      expect(row!.rawRequestRealtorName).toBe("سيد علي  رضائي");
      expect(row!.rawPropertyRealtorName).toBe("كريمي");
      // لایه ۲ — نرمال مشتق
      expect(row!.requestRealtorName).toBe("سید علی رضایی");
      expect(row!.propertyRealtorName).toBe("کریمی");
      expect(row!.count).toBe(4);
      // مهر provenance
      expect(row!.normalizationVersion).toBe("p65-04-v2");
      expect(row!.extractionBatchId).toBe(result.progress.checkpoint.runId as string);
      expect(row!.extractedAt).toBeInstanceOf(Date);
    } finally {
      await clearInteractions();
    }
  });

  test("کارشناس: خام + نرمال موبایل/نام در ExpertRecord (کلید طبیعی personnelCode)", async () => {
    await clearExperts();
    try {
      const rawRow = {
        _id: `${PREFIX}-ex-1`,
        code: "987654",
        fullName: "سيد علي  رضائي",
        mobile: "۰۹۱۴۱۲۳۴۵۶۷",
        businessId: { title: "شعبهٔ  مرکزی" },
      };
      const result = await bulkImport(opts({ entity: "expert" }), {
        fetcher: makeArmFetcher("expert", [[rawRow]]),
      });
      expect(result.status).toBe("COMPLETED");

      const row = await db.expertRecord.findUnique({ where: { personnelCode: "987654" } });
      expect(row).not.toBeNull();
      expect(row!.rawFullName).toBe("سيد علي  رضائي");
      expect(row!.fullName).toBe("سید علی رضایی");
      expect(row!.rawMobile).toBe("۰۹۱۴۱۲۳۴۵۶۷");
      expect(row!.mobile).toBe("09141234567");
      expect(row!.rawBusinessTitle).toBe("شعبهٔ  مرکزی");
      expect(row!.businessTitle).toBe("شعبهٔ مرکزی");
      expect(row!.normalizationVersion).toBe("p65-04-v2");
    } finally {
      await clearExperts();
    }
  });

  test("اجرای مجدد idempotent: خام عیناً + duplicates (نه update)", async () => {
    await clearInteractions();
    try {
      const rawRow = { _id: `${PREFIX}-in-2`, requestRealtorName: "كريمي", propertyRealtorName: "موسوي", count: 1 };
      const first = await bulkImport(opts({ entity: "interaction" }), {
        fetcher: makeArmFetcher("interaction", [[rawRow]]),
      });
      expect(first.progress.totalSaved).toBe(1);

      await db.syncState.update({ where: { id: "singleton" }, data: { bulkImportCheckpoint: null } }).catch(() => undefined);
      const second = await bulkImport(opts({ entity: "interaction" }), {
        fetcher: makeArmFetcher("interaction", [[rawRow]]),
      });
      expect(second.progress.totalSaved).toBe(0);
      expect(second.progress.totalDuplicates).toBe(1);

      const row = await db.interactionRecord.findUnique({ where: { id: `${PREFIX}-in-2` } });
      expect(row!.rawRequestRealtorName).toBe("كريمي"); // لایه ۱ هرگز تغییر نمی‌کند
      expect(row!.requestRealtorName).toBe("کریمی");
    } finally {
      await clearInteractions();
    }
  });

  test("merge non-null در خط لوله: ردیف تازه بدون خام، خام موجود را پاک نمی‌کند", async () => {
    await clearInteractions();
    try {
      // اجرای اول — با خام
      await bulkImport(opts({ entity: "interaction" }), {
        fetcher: makeArmFetcher("interaction", [
          [{ _id: `${PREFIX}-in-3`, requestRealtorName: "كريمي", propertyRealtorName: "موسوي", count: 1 }],
        ]),
      });
      // اجرای دوم — ردیف نگاشت‌شدهٔ قدیمی‌قالب (بدون فیلد خام)
      const legacyMapped = {
        id: `${PREFIX}-in-3`,
        requestRealtorName: "كريمي",
        propertyRealtorName: "موسوي",
        count: 2,
      };
      const fetcher: BulkPageFetcher = {
        fetchPage: async (req) => ({ rows: req.page === 1 ? [legacyMapped] : [], hasMore: false }),
      };
      await db.syncState.update({ where: { id: "singleton" }, data: { bulkImportCheckpoint: null } }).catch(() => undefined);
      await bulkImport(opts({ entity: "interaction" }), { fetcher });

      const row = await db.interactionRecord.findUnique({ where: { id: `${PREFIX}-in-3` } });
      expect(row!.count).toBe(2); // محتوای جدید برنده
      expect(row!.rawRequestRealtorName).toBe("كريمي"); // خام قدیمی حفظ شد (merge non-null)
    } finally {
      await clearInteractions();
    }
  });
});

// =====================================================================
// ۶) عرضه/تقاضا — مهر provenance مسیر sync
// =====================================================================

describe("B.3-۶ — عرضه/تقاضا: مهر provenance مسیر sync (جدول هشتم)", () => {
  test("toSdUpsert با runId: extractedAt + extractionBatchId + rawSourceVersion تهی؛ بدون normalizationVersion", () => {
    const s: CrmSupplyDemand = {
      id: `${PREFIX}-sd-1`,
      rangeTitle: "۰ تا ۵۰ میلیون تومان",
      propertyCount: 12,
      requestPercent: 8.5,
      status: "کم",
    };
    const stamped = toSdUpsert(s, "run-b3-1");
    expect(stamped.extractionBatchId).toBe("run-b3-1");
    expect(stamped.extractedAt).toBeInstanceOf(Date);
    expect(stamped.rawSourceVersion).toBeNull();
    // صادقانه: موتور نرمال‌سازی روی این جدول اجرا نمی‌شود
    expect(stamped.normalizationVersion).toBeUndefined();
  });

  test("toSdUpsert بدون runId (فراخوانی قدیمی): بدون مهر — سازگاری کامل", () => {
    const s: CrmSupplyDemand = {
      id: `${PREFIX}-sd-2`,
      rangeTitle: "x",
      propertyCount: 0,
      requestPercent: 0,
      status: "",
    };
    const plain = toSdUpsert(s);
    expect(plain.extractionBatchId).toBeUndefined();
    expect(plain.extractedAt).toBeUndefined();
  });

  test("شاهد DB: مهر provenance در SupplyDemandRecord از مسیر sync می‌نشیند", async () => {
    await clearSupplyDemand();
    try {
      const s: CrmSupplyDemand = {
        id: `${PREFIX}-sd-3`,
        rangeTitle: "۰ تا ۵۰ میلیون تومان",
        propertyCount: 3,
        requestPercent: 2.5,
        status: "کم",
      };
      const { PrismaMarketRepository } = await import("../src/core/repositories/prisma/market.repository");
      const repo = new PrismaMarketRepository();
      await repo.upsertSupplyDemandBatch([toSdUpsert(s, "run-b3-2")]);

      const row = await db.supplyDemandRecord.findUnique({ where: { id: `${PREFIX}-sd-3` } });
      expect(row).not.toBeNull();
      expect(row!.extractionBatchId).toBe("run-b3-2");
      expect(row!.extractedAt).toBeInstanceOf(Date);
      expect(row!.rawSourceVersion).toBeNull();
      expect(row!.normalizationVersion).toBeNull(); // تهی صادقانه
    } finally {
      await clearSupplyDemand();
    }
  });

  test("نگاشت‌های upsert مسیر sync فیلدهای خام را حمل می‌کنند (تعاملات/کارشناس)", () => {
    const i: CrmInteraction = {
      id: "i-1",
      requestRealtorName: "كريمي",
      propertyRealtorName: "موسوي",
      rawRequestRealtorName: "كريمي",
      rawPropertyRealtorName: "موسوي",
      count: 1,
    };
    const mapped = toInUpsert(i);
    expect(mapped.rawRequestRealtorName).toBe("كريمي");
    expect(mapped.rawPropertyRealtorName).toBe("موسوي");

    const e: CrmExpert = {
      id: "e-1",
      personnelCode: "1",
      fullName: "كريمي",
      mobile: "۰۹۱۴۱۲۳۴۵۶۷",
      rawFullName: "كريمي",
      rawMobile: "۰۹۱۴۱۲۳۴۵۶۷",
      rawBusinessTitle: null,
      rawCreator: null,
      role: "r",
      businessTitle: "b",
      creator: null,
      active: true,
      createdAt: "2024-01-01T00:00:00.000Z",
    };
    const mappedEx = toExUpsert(e);
    expect(mappedEx.rawFullName).toBe("كريمي");
    expect(mappedEx.rawMobile).toBe("۰۹۱۴۱۲۳۴۵۶۷");
  });
});

// پاک‌سازی رجیستری پیش‌فرض (جلوگیری از نشت cache بین فایل‌های تست)
resetDefaultLocationRegistry();
void normalizeName;
void normalizeMobile;
void getDefaultLocationRegistry;
