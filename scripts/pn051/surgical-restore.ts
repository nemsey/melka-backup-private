// ============================================================================
// PN-051 — مرمت جراحی پس از کشف باگ round-trip (شاهد زنده):
//   باگ: digitsOnly کدهای ME####/POT#### ملکتون را می‌بُرید → ایمپورت
//   ملکتون (۱) ۲,۴۴۷+۲,۴۹۸ رکورد تکراری ساخت و (۲) ۲,۵۶۸ آگهی + ۱,۴۰۶
//   درخواستِ تبریزِ هم‌رقم را با دادهٔ ملکتون بازنویسی کرد.
//   باگ اصلاح شد (قالب کامل حفظ می‌شود). این اسکریپت:
//     گام ۱) حذف رکوردهای زائد ساخته‌شده در پنجرهٔ شاهد (id=import-* · source=excel-import)
//     گام ۲) بازیابی فیلدهای نوشتنیِ ایمپورت برای قربانیان تبریز از بکاپ
//            pristine پیش از اجرا: backups/backup-2026-10-24T04-36-23-442.db
//   فقط فیلدهایی که ایمپورت می‌نویسد بازگردانده می‌شوند (ستون‌های نرمال/سایه
//   توسط پسوند Prisma خودکار تازه می‌شوند). صفر حذف دادهٔ سالم.
// اجرا: DATABASE_URL=file:...custom.db bun scripts/pn051/surgical-restore.ts
// ============================================================================
import { PrismaClient } from "@prisma/client";
import fs from "fs";

const LIVE_URL = "file:/home/z/my-project/db/custom.db";
const BACKUP_PATH = "/home/z/my-project/backups/backup-2026-10-24T04-36-23-442.db";
if (!fs.existsSync(BACKUP_PATH)) {
  console.error("BACKUP NOT FOUND:", BACKUP_PATH);
  process.exit(1);
}

// کلاینت زنده (با پسوند نرمال‌سازِ برنامه از src/lib/db)
const { db } = await import("@/lib/db");
// کلاینت فقط-خواندنی روی بکاپ pristine
const bak = new PrismaClient({ datasources: { db: { url: `file:${BACKUP_PATH}?mode=ro` } } });

// فیلدهایی که ایمپورت listings/requests می‌نویسد (عین crm-import.ts)
const LISTING_FIELDS = [
  "title", "ownerName", "rawOwnerName", "ownerMobile", "tradeTypeName", "propertyTypeName",
  "price", "depositPrice", "rentPrice", "pricePerMeter", "meterage", "rooms", "floor", "buildYear",
  "address", "stateName", "cityName", "areaName", "lineName", "viewCount", "imageCount",
  "addedToDivar", "addedToInsta", "isReposted", "status", "statusDate",
] as const;
const REQUEST_FIELDS = [
  "title", "actorName", "customerName", "customerMobile", "tradeTypeName", "propertyTypeName",
  "buildingTypeName", "priceFrom", "priceTo", "spaceFrom", "spaceTo", "roomsFrom", "roomsTo",
  "floorFrom", "floorTo", "buildYearFrom", "buildYearTo", "sanadNames", "constructTypeNames",
  "sideNames", "areaNamesJson", "lineNamesJson", "userPaymentMethodName", "userSeriousityName",
  "urgent", "luxury", "occasion", "changeWithNames", "status",
] as const;

const pick = (row: Record<string, unknown>, fields: readonly string[]) => {
  const out: Record<string, unknown> = {};
  for (const f of fields) out[f] = row[f] ?? null; // مقدار بکاپ — حتی null (بازگشت به حالت اصلی)
  return out;
};

async function main() {
  const t0 = Date.now();
  const windowStart = new Date("2026-10-24T09:14:00.000Z"); // پیش از اولین ایمپورت شاهد
  const report = { deleted: {}, restored: {}, verify: {} };

  // ── گام ۱: حذف زباله‌های پنجرهٔ شاهد ──
  const delProps = await db.propertyRecord.deleteMany({
    where: { id: { startsWith: "import-" }, updatedAt: { gte: windowStart } },
  });
  const delReqs = await db.requestRecord.deleteMany({
    where: { source: "excel-import", updatedAt: { gte: windowStart } },
  });
  const delExps = await db.expertRecord.deleteMany({
    where: { id: { startsWith: "import-" }, createdAt: { gte: windowStart } },
  });
  report.deleted = { properties: delProps.count, requests: delReqs.count, experts: delExps.count };
  console.log("[restore] deleted garbage:", JSON.stringify(report.deleted));

  // ── گام ۲: شناسایی قربانیان تبریز (هم‌رقمِ ارقام کدهای ملکتون) ──
  const melkProps = await db.propertyRecord.findMany({ where: { tenantId: "melketun" }, select: { propertyCode: true } });
  const propDigits = [...new Set(melkProps.map((r) => r.propertyCode.replace(/\D/g, "")).filter(Boolean))];
  const propVictims = await db.propertyRecord.findMany({
    where: { tenantId: "melk-tabriz", propertyCode: { in: propDigits }, updatedAt: { gte: windowStart } },
    select: { id: true, propertyCode: true },
  });
  const melkReqs = await db.requestRecord.findMany({ where: { tenantId: "melketun" }, select: { requestCode: true } });
  const reqDigits = [...new Set(melkReqs.map((r) => (r.requestCode ?? "").replace(/\D/g, "")).filter(Boolean))];
  const reqVictims = await db.requestRecord.findMany({
    where: { tenantId: "melk-tabriz", requestCode: { in: reqDigits }, updatedAt: { gte: windowStart } },
    select: { id: true, requestCode: true },
  });
  console.log(`[restore] victims: properties=${propVictims.length} requests=${reqVictims.length}`);

  // ── گام ۳: بازیابی از بکاپ pristine ──
  let propRestored = 0, propMissingInBackup = 0;
  for (const v of propVictims) {
    const orig = await bak.propertyRecord.findUnique({ where: { id: v.id } }).catch(() => null);
    if (!orig) { propMissingInBackup++; continue; }
    await db.propertyRecord.update({
      where: { id: v.id },
      data: pick(orig as unknown as Record<string, unknown>, LISTING_FIELDS),
    }).catch((e: unknown) => console.warn("prop restore fail", v.propertyCode, e));
    propRestored++;
  }
  let reqRestored = 0, reqMissingInBackup = 0;
  for (const v of reqVictims) {
    const orig = await bak.requestRecord.findUnique({ where: { id: v.id } }).catch(() => null);
    if (!orig) { reqMissingInBackup++; continue; }
    await db.requestRecord.update({
      where: { id: v.id },
      data: pick(orig as unknown as Record<string, unknown>, REQUEST_FIELDS),
    }).catch((e: unknown) => console.warn("req restore fail", v.requestCode, e));
    reqRestored++;
  }
  report.restored = { properties: propRestored, requests: reqRestored, missingInBackup: { properties: propMissingInBackup, requests: reqMissingInBackup } };
  console.log("[restore] restored:", JSON.stringify(report.restored));

  // ── گام ۴: شاهد نهایی ──
  const me3043 = await db.propertyRecord.findUnique({ where: { propertyCode: "3043" } });
  const bak3043 = await bak.propertyRecord.findUnique({ where: { propertyCode: "3043" } });
  report.verify = {
    sample3043: {
      title: me3043?.title, backupTitle: bak3043?.title,
      ownerName: me3043?.ownerName, backupOwnerName: bak3043?.ownerName,
      meterage: me3043?.meterage, backupMeterage: bak3043?.meterage,
      match: me3043?.title === bak3043?.title && me3043?.ownerName === bak3043?.ownerName && me3043?.meterage === bak3043?.meterage,
    },
    counts: {
      props: await db.propertyRecord.count(),
      tabrizProps: await db.propertyRecord.count({ where: { tenantId: "melk-tabriz" } }),
      melketunProps: await db.propertyRecord.count({ where: { tenantId: "melketun" } }),
      reqs: await db.requestRecord.count(),
      tabrizReqs: await db.requestRecord.count({ where: { tenantId: "melk-tabriz" } }),
      melketunReqs: await db.requestRecord.count({ where: { tenantId: "melketun" } }),
      experts: await db.expertRecord.count(),
      leftoverImportProps: await db.propertyRecord.count({ where: { id: { startsWith: "import-" } } }),
      leftoverExcelReqs: await db.requestRecord.count({ where: { source: "excel-import" } }),
      leftoverImportExperts: await db.expertRecord.count({ where: { id: { startsWith: "import-" } } }),
    },
  };
  console.log("[restore] verify:", JSON.stringify(report.verify, null, 1));
  console.log(`[restore] done in ${Date.now() - t0}ms`);
  fs.writeFileSync("/home/z/my-project/scripts/pn051/logs/surgical-restore.json", JSON.stringify({ ...report, durationMs: Date.now() - t0 }, null, 1));
  await bak.$disconnect();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
