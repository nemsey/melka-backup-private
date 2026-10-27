/**
 * pn038/refresh-lists.ts — فاز ۱.۵ (PN-038 · شورا-ن۰۶۳):
 * «اجرای مجدد سینک روی داده‌های تازه (بازگرداندن ۴ فهرست)»
 *
 * چهار فهرست (به روایت مالک «همهٔ فهرست‌ها»):
 *   ۱. آگهی‌های ARM (PropertyRecord)      — syncArmListingsCatalog
 *   ۲. درخواست‌های ARM (RequestRecord)     — syncArmRequestsCatalog
 *   ۳. معاملات/کارشناسان CRM               — syncFromArm (upsert افزودنی)
 *   ۴. فهرست‌های مرجع عمومی (enums و…)    — melk-public refresh
 *
 * اجرا روی DB زنده با توکن ARM ذخیره‌شده (راز با MELK_TOKEN_KEY).
 * شاهد: download/pn038/sync-log.json
 */

import { writeFileSync, mkdirSync } from "node:fs";

// env زنده (همان کاری که instrumentation انجام می‌دهد)
const envUrl = new URL("../../.env", import.meta.url);
const platUrl = new URL("../../env.platform.json", import.meta.url);
try {
  const raw = await Bun.file(envUrl).text();
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* .env اختیاری */ }
// env.platform.json — کلید مهر راز (همان منبع بیلد standalone)
try {
  const plat = JSON.parse(await Bun.file(platUrl).text()) as Record<string, string>;
  for (const [k, v] of Object.entries(plat)) {
    if (typeof v === "string" && !process.env[k]) process.env[k] = v;
  }
} catch { /* platform env اختیاری */ }

const { PrismaClient } = await import("@prisma/client");
const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL ?? "file:db/custom.db" } } });

const t0 = Date.now();
const log: Record<string, unknown> = {
  at: new Date().toISOString(),
  phase: "PN-038/1.5 — اجرای مجدد سینک روی دادهٔ تازه",
  mode: "incremental (upsert افزودنی — قانون دادهٔ مقدس)",
  steps: [] as Array<Record<string, unknown>>,
};

function step(name: string, detail: Record<string, unknown>): void {
  (log.steps as Array<Record<string, unknown>>).push({ name, ...detail, at: new Date().toISOString() });
  console.log(`[refresh] ${name}: ${JSON.stringify(detail).slice(0, 220)}`);
}

try {
  // شمارش پیش از سینک (شاهد قانون مقدس — هیچ ردیفی نباید کم شود)
  const before = {
    property: await db.propertyRecord.count(),
    request: await db.requestRecord.count(),
    transaction: await db.transactionRecord.count(),
    expert: await db.expertRecord.count(),
  };
  step("counts-before", before);

  // ── توکن ARM از اتصال ذخیره‌شده ──
  const conn = await db.armConnection.findFirst({
    where: { status: "connected", tokenEnc: { not: null } },
    orderBy: { updatedAt: "desc" },
    select: { personnelCode: true, tokenEnc: true, status: true, updatedAt: true },
  });
  step("arm-connection", { found: Boolean(conn), personnelCode: conn?.personnelCode, status: conn?.status, updatedAt: conn?.updatedAt });

  if (conn?.tokenEnc) {
    const { decryptSecret } = await import("@/lib/auth/crypto");
    const armToken = decryptSecret(conn.tokenEnc);
    step("arm-token", { decrypted: Boolean(armToken) });

    // ── ۱+۲: کاتالوگ آگهی/درخواست (upsert افزودنی) ──
    try {
      const { syncArmListingsCatalog } = await import("@/lib/melk-api/arm-catalog");
      const res = await syncArmListingsCatalog(armToken, { maxPages: 3 });
      step("arm-listings-sync", { ok: true, ...res });
    } catch (e) {
      step("arm-listings-sync", { ok: false, error: String((e as Error).message).slice(0, 160) });
    }
    try {
      const { syncArmRequestsCatalog } = await import("@/lib/melk-api/arm-catalog");
      const res = await syncArmRequestsCatalog(armToken, { maxPages: 3 });
      step("arm-requests-sync", { ok: true, ...res });
    } catch (e) {
      step("arm-requests-sync", { ok: false, error: String((e as Error).message).slice(0, 160) });
    }

    // ── ۴: فهرست‌های مرجع عمومی (کاتالوگ عمومی بدون توکن) ──
    try {
      const { syncMelkPublicCatalog } = await import("@/lib/melk-api/melk-public");
      const res = await syncMelkPublicCatalog();
      step("melk-public-reference", { ok: true, ...res });
    } catch (e) {
      step("melk-public-reference", { ok: false, error: String((e as Error).message).slice(0, 160) });
    }
  }

  // ── ۳: CRM معاملات/کارشناسان (همیشه تلاش — با نشست زنده اگر بود) ──
  const session = await db.session.findFirst({
    where: { revoked: false, expiresAt: { gt: new Date() }, armTokenEnc: { not: null } },
    orderBy: { createdAt: "desc" },
    select: { armTokenEnc: true, armRefreshTokenEnc: true },
  });
  step("live-session", { found: Boolean(session) });
  if (session?.armTokenEnc) {
    const { decryptSecret } = await import("@/lib/auth/crypto");
    try {
      const { syncWithRefresh } = await import("@/lib/melk-api/sync");
      const r = await syncWithRefresh(decryptSecret(session.armTokenEnc), session.armRefreshTokenEnc ? decryptSecret(session.armRefreshTokenEnc) : "");
      step("crm-sync", { ok: r.sync.ok, transactions: r.sync.transactions, experts: r.sync.experts, contracts: r.sync.contracts, error: r.sync.error ?? null });
    } catch (e) {
      step("crm-sync", { ok: false, error: String((e as Error).message).slice(0, 160) });
    }
  }

  // شمارش پس از سینک — قانون مقدس: هیچ شمارش نباید کم شود
  const after = {
    property: await db.propertyRecord.count(),
    request: await db.requestRecord.count(),
    transaction: await db.transactionRecord.count(),
    expert: await db.expertRecord.count(),
  };
  step("counts-after", after);
  const sacredVerdict = Object.keys(after).every((k) => (after as Record<string, number>)[k] >= (before as Record<string, number>)[k]);
  log.sacredDataLaw = { held: sacredVerdict, note: sacredVerdict ? "هیچ ردیفی کم نشد — قانون دادهٔ مقدس برقرار" : "⚠️ شمارش کم شد — بررسی" };
  log.durationMs = Date.now() - t0;
  log.ok = true;
} catch (e) {
  log.ok = false;
  log.error = String((e as Error).message).slice(0, 300);
  log.durationMs = Date.now() - t0;
} finally {
  await db.$disconnect();
  mkdirSync("download/pn038", { recursive: true });
  writeFileSync("download/pn038/sync-log.json", JSON.stringify(log, null, 2));
  console.log(`[refresh] شاهد: download/pn038/sync-log.json (${log.ok ? "OK" : "FAIL"} · ${log.durationMs}ms)`);
  process.exit(log.ok ? 0 : 1);
}
