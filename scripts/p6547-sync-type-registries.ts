#!/usr/bin/env bun
/**
 * p6547-sync-type-registries.ts — همگام‌سازی فهرست‌های مرجع انواع سامانه ARM
 * P6547/گام دوم: کشف زنده — building-types/list · property-types/list ·
 * trade-types/list · user-payment-methods/list · user-seriousness/list
 * سپس بک‌فیل نام‌ها برای ردیف‌های موجود (شناسه→نام از نقشه‌های تازه)
 */
import { PrismaClient } from "@prisma/client";
import { decryptSecret } from "../src/lib/auth/crypto";
import { syncTypeRegistries, loadTypeMaps } from "../src/lib/melk-api/type-registry";
import { writeFileSync } from "node:fs";

const db = new PrismaClient();

async function main() {
  const arm = await db.armConnection.findFirst({ where: { ownerKey: "master" } });
  const ARM_TOKEN = decryptSecret(arm?.tokenEnc ?? "") ?? "";
  if (!ARM_TOKEN) { console.log("NO ARM TOKEN"); process.exit(1); }

  const sync = await syncTypeRegistries(ARM_TOKEN);
  console.log("registries synced:", sync.synced, "| failed:", sync.failed.map((f) => `${f.kind}:${f.error.slice(0, 30)}`));

  const maps = await loadTypeMaps();
  const counts = Object.fromEntries(Object.entries(maps).map(([k, m]) => [k, m.size]));
  console.log("map sizes:", JSON.stringify(counts));

  // بک‌فیل نام‌ها برای ردیف‌های موجودِ فاقد نام (شناسه خام در فیلدهای نام؟ نه — شناسه ذخیره نشده؛
  // نام‌ها در sync بعدی ردیف‌ها پر می‌شوند. اما وضعیت فعلی را ثبت کن)
  const before = {
    trade: await db.requestRecord.count({ where: { tradeTypeName: { not: null } } }),
    property: await db.requestRecord.count({ where: { propertyTypeName: { not: null } } }),
    building: await db.requestRecord.count({ where: { buildingTypeName: { not: null } } }),
    total: await db.requestRecord.count(),
  };
  console.log("current name fill:", JSON.stringify(before));

  // نمونهٔ نقشه برای شاهد
  const sample = {
    tradeType: [maps.tradeType.get("614ed62da50555f0a54c1eca"), maps.tradeType.get("614ed63aa50555f0a54c1ed3")],
    buildingType: maps.buildingType.get("614edc35a50555f0a54c1f12"),
    propertyType: maps.propertyType.get("614ee704a50555f0a54c227d"),
    paymentMethod: maps.paymentMethod.get("61a39bf0f06329efdeacbbef"),
    seriousness: maps.seriousness.get("61a7536b0927675c45489a59"),
  };
  console.log("sample resolutions:", JSON.stringify(sample, null, 1));

  writeFileSync("download/p6547/type-registry-sync-proof.json", JSON.stringify({ ranAt: new Date().toISOString(), synced: sync.synced, failed: sync.failed, counts, sample, fill: before }, null, 2));
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
