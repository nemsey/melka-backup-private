/**
 * PN-039 (شورا-ن۰۶۴ معادل — هشت گام فهرستها) — گاردهای ستونهای تازه
 * ---------------------------------------------------------------------------
 * گام ۲) پایان قحطی سینک درخواستها: اولویت رله requests/list + تناوب برش دیمن
 * گام ۳) ستون «تاریخ ثبت» M1 بعد از «تاریخ وضعیت»
 * گام ۴) ستون «یادداشت» مالک (آخرین ستون M1+M2 · PATCH /api/owner-notes)
 * گام ۵) ستون «وضعیت آگهی» M1 بعد از «دسته‌بندی»
 * گام ۶) فیلتر نوع ملک چیپی در هر دو فهرست
 * گام ۷) حذف ستون «نوع ساختمان» از M2
 * قانون دادهٔ مقدس: سینک ARM هرگز ownerNote را نمی‌نویسد
 */

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO = "/home/z/my-project";
const M1 = readFileSync(join(REPO, "src/core/tiles/tiles/arm-listing/ArmListingsPage.tsx"), "utf8");
const M2 = readFileSync(join(REPO, "src/core/tiles/tiles/arm-request/ArmRequestsPage.tsx"), "utf8");
const NOTE_ROUTE = readFileSync(join(REPO, "src/app/api/owner-notes/[entity]/[id]/route.ts"), "utf8");
const NOTE_CELL = readFileSync(join(REPO, "src/components/app/shared/OwnerNoteCell.tsx"), "utf8");
const PROP_REPO = readFileSync(join(REPO, "src/core/repositories/prisma/property.repository.ts"), "utf8");
const REQ_REPO = readFileSync(join(REPO, "src/core/repositories/prisma/request.repository.ts"), "utf8");
const SCHEMA = readFileSync(join(REPO, "prisma/schema.prisma"), "utf8");
const SCHEMA_PG = readFileSync(join(REPO, "prisma/schema.postgres.prisma"), "utf8");
const DAEMON = readFileSync(join(REPO, "src/lib/melk-api/catalog-daemon.ts"), "utf8");

// ═══════════════ گام ۲ — پایان قحطی سینک درخواستها ═══════════════

describe("PN-039 §الف — گام ۲: رفع راکدمان فهرست درخواست", () => {
  test("الف-۱) relayPriorityForUrl: صفحات requests/list اولویت ۱ می‌گیرند (پیش از موج آگهی/غنی‌سازی)", async () => {
    const { relayPriorityForUrl, RELAY_PRIORITY_CATALOG_REQUESTS, RELAY_PRIORITY_INTERACTIVE } = await import(
      "@/lib/melk-api/relay"
    );
    expect(RELAY_PRIORITY_CATALOG_REQUESTS).toBe(1);
    expect(relayPriorityForUrl("https://arus-api.melketabriz.ir/api/apm/requests/list?page=2&limit=500")).toBe(1);
    // OTP همچنان مقدم است (اولویت ۵) — تعاملی هرگز پشت سینک نمی‌ماند
    expect(relayPriorityForUrl("https://arus-api.melketabriz.ir/api/apm/authentication/otp")).toBe(RELAY_PRIORITY_INTERACTIVE);
    // آگهی‌ها و سایر مسیرها: پیش‌فرض ۰
    expect(relayPriorityForUrl("https://arus-api.melketabriz.ir/api/apm/properties/list?page=1")).toBe(0);
    expect(relayPriorityForUrl("https://arus-api.melketabriz.ir/api/apm/requests/detail/123")).toBe(0);
  });

  test("الف-۲) دیمن: تناوب برش‌ها — تیک فرد درخواست‌ها جلو می‌افتند", () => {
    expect(DAEMON).toContain("s.status.ticks % 2 === 1");
    expect(DAEMON).toContain("await runRequestsSlice();\n          await runListingsSlice();");
    expect(DAEMON).toContain("await runListingsSlice();\n          await runRequestsSlice();");
  });

  test("الف-۳) enqueueRelayRequest از relayPriorityForUrl تغذیه می‌کند (مسیر مرکزی)", () => {
    const relay = readFileSync(join(REPO, "src/lib/melk-api/relay.ts"), "utf8");
    expect(relay).toContain("priority: relayPriorityForUrl(url),");
  });
});

// ═══════════════ گام ۳+۴+۵ — ستونهای تازه M1 ═══════════════

describe("PN-039 §ب — M1 فهرست آگهی: وضعیت آگهی · تاریخ ثبت · یادداشت", () => {
  test("ب-۱) وضعیت آگهی: نگاشت قانون ده‌حالته + رنگ رجیستری", () => {
    expect(M1).toContain("classifyListingStatus(r.status)");
    expect(M1).toContain("listingStateBadgeClass(k)");
    expect(M1).toContain('data-listing-status-cell={r.id}');
  });

  test("ب-۲) تاریخ ثبت M1: از createdAt با faDateTime (تاریخ دقیق ایجاد در سامانه)", () => {
    expect(M1).toContain('data-registered-at-cell={r.id}');
    expect(M1).toContain('{r.createdAt ? faDateTime(r.createdAt) : "—"}');
  });

  test("ب-۳) یادداشت M1: OwnerNoteCell با entity=property — آخرین سلول ردیف", () => {
    expect(M1).toContain('<OwnerNoteCell');
    // ترتیب: یادداشت بعد از تاریخ ثبت — آخرین TableCell پیش از بستن ردیف
    expect(M1).toMatch(/data-registered-at-cell=\{r\.id\}[\s\S]*?data-owner-note-column-cell=\{r\.id\}[\s\S]*?<\/TableRow>/);
  });

  test("ب-۴) interface ردیف M1 شامل ownerNote", () => {
    expect(M1).toContain("ownerNote: string | null;");
  });
});

// ═══════════════ گام ۴+۶ — یادداشت + چیپ نوع ملک M2 ═══════════════

describe("PN-039 §پ — M2 فهرست درخواست: یادداشت + نوع ملک چیپی", () => {
  test("پ-۱) یادداشت M2: OwnerNoteCell با entity=request — آخرین سلول ردیف", () => {
    expect(M2).toContain('<OwnerNoteCell');
    expect(M2).toContain('entity="request"');
    expect(M2).toMatch(/data-owner-note-column-cell=\{r\.id\}[\s\S]*?<\/TableRow>/);
  });

  test("پ-۲) interface ردیف M2 شامل ownerNote", () => {
    expect(M2).toContain("ownerNote: string | null;");
  });

  test("پ-۳) چیپ نوع ملک M2 با مقادیر وجه کاتالوگ", () => {
    expect(M2).toContain('id="arm-request-property-types-filter"');
    expect(M2).toContain("propertyTypeFacet.map");
  });
});

// ═══════════════ گام ۴ — مسیر PATCH یادداشت مالک ═══════════════

describe("PN-039 §ت — PATCH /api/owner-notes/[entity]/[id]", () => {
  test("ت-۱) گارد سه‌لایه: نشست + دسترسی کاشی + اعتبارسنجی نوع", () => {
    expect(NOTE_ROUTE).toContain("requireSessionAsync(request)");
    expect(NOTE_ROUTE).toContain("requireTileAccessFor(guard, tile)");
    expect(NOTE_ROUTE).toContain('typeof body.note !== "string"');
  });

  test("ت-۲) نگاشت موجودیت: property→arm-listings · request→arm-requests", () => {
    expect(NOTE_ROUTE).toContain('property: "arm-listings"');
    expect(NOTE_ROUTE).toContain('request: "arm-requests"');
  });

  test("ت-۳) صفر حذف + مرز مخزن (PN-012/۱.۳): نوشتن فقط از طریق updateOwnerNote مخزن — صفر db.* در روت", () => {
    expect(NOTE_ROUTE).toContain("updateOwnerNote");
    expect(NOTE_ROUTE).toContain("OWNER_NOTE_MAX = 2000");
    expect(NOTE_ROUTE).not.toContain(".deleteMany(");
    expect(NOTE_ROUTE).not.toMatch(/\bdb\.[a-zA-Z]/);
  });

  test("ت-۴) رکورد غایب = 404 (P2025)", () => {
    expect(NOTE_ROUTE).toContain('code === "P2025"');
  });

  test("ت-۵) سلول ویرایش: PATCH با بدنهٔ { note } + حالت ویرایش inline", () => {
    expect(NOTE_CELL).toContain('method: "PATCH"');
    expect(NOTE_CELL).toContain("body: { note: draft }");
    expect(NOTE_CELL).toContain('data-owner-note-editing={id}');
    expect(NOTE_CELL).toContain('data-owner-note-cell={id}');
  });
});

// ═══════════════ قانون دادهٔ مقدس — سینک هرگز یادداشت را نمی‌نویسد ═══════════════

/** استخراج بدنهٔ یک متد از مخزن (از امضا تا متد بعدی) */
function methodBody(src: string, signature: string): string {
  const start = src.indexOf(signature);
  if (start === -1) return "";
  const next = src.slice(start + 1).search(/\n  (async |get |private |static )?[\w<]+\s*\w+\(/);
  return next === -1 ? src.slice(start) : src.slice(start, start + 1 + next);
}

describe("PN-039 §ث — قانون دادهٔ مقدس و ownerNote", () => {
  test("ث-۱) مخزن آگهی: SELECT+نقشه+updateOwnerNote (۸ رخداد) — مسیر upsertBulk دست‌نخورده", () => {
    // SELECT (۱) + نقشه (۲ در یک سطر) + متد مالک updateOwnerNote (۵) = ۸ — سینک upsertBulk صفر رخداد
    const count = (PROP_REPO.match(/ownerNote/g) ?? []).length;
    expect(count).toBe(8);
    // مسیر همگام‌سازی سینک هرگز ستون مالک را نمی‌نویسد (قانون دادهٔ مقدس)
    expect(methodBody(PROP_REPO, "async upsertBulk(")).not.toContain("ownerNote");
  });

  test("ث-۲) مخزن درخواست: SELECT+نقشه+updateOwnerNote (۸ رخداد) — مسیر upsertArmBulk دست‌نخورده", () => {
    const count = (REQ_REPO.match(/ownerNote/g) ?? []).length;
    expect(count).toBe(8);
    expect(methodBody(REQ_REPO, "async upsertArmBulk(")).not.toContain("ownerNote");
  });

  test("ث-۳) اسکیما و دوقلوی postgres هر دو ownerNote دارند (توازن)", () => {
    for (const schema of [SCHEMA, SCHEMA_PG]) {
      // دو مدل × (فیلد + کامنت‌ها) — حداقل ۲ رخداد فیلد
      expect((schema.match(/ownerNote\s+String\?/g) ?? []).length).toBe(2);
    }
  });
});

// ═══════════════ گام ۶ — فیلتر نوع ملک در لایهٔ API ═══════════════

describe("PN-039 §ج — فیلتر propertyType در هر دو مسیر API", () => {
  test("ج-۱) هر دو مسیر پارامتر تکرارپذیر propertyType را می‌خوانند و به مخزن می‌دهند", () => {
    const listingsRoute = readFileSync(join(REPO, "src/app/api/crm/arm-catalog/listings/route.ts"), "utf8");
    const requestsRoute = readFileSync(join(REPO, "src/app/api/crm/arm-catalog/requests/route.ts"), "utf8");
    for (const route of [listingsRoute, requestsRoute]) {
      expect(route).toContain('sp.getAll("propertyType")');
      expect(route).toMatch(/propertyTypes[^]*?undefined/);
    }
  });

  test("ج-۲) مخزن آگهی فیلتر propertyTypeName را در SQL اعمال می‌کند", () => {
    expect(PROP_REPO).toMatch(/where\.propertyTypeName\s*=\s*\{\s*in:/);
  });
});
