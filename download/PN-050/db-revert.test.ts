/**
 * PN-050 · دستور ۶ — تست‌های DB پایان‌به‌پایان (سناریوی B کامل + سناریوی C)
 * ---------------------------------------------------------------------------
 * اجرا: bun test tests/pn050/db-revert.test.ts  (نیاز: test:db:push با طرح PN-050)
 *
 * سناریوی B (گام‌های ۱ تا ۷ دستور ۶) — روی DB واقعی (تست):
 *   ۱. DB: ownerMobile = ARM (conf 0.95)
 *   ۲. کارشناس در CRM به EXPERT تغییر می‌دهد (سینک = upsertRecordWithMerge)
 *   ۳. sync
 *   ۴. انتظار: DB = EXPERT
 *   ۵. audit_log: expert_override
 *   ۶. بازگردانی از پنل (revertRecordField) → DB = ARM
 *   ۷. audit_log: manual_revert
 * به‌علاوه: مسیر P2002 (هم-کد با id متفاوت) + سناریوی C (null روی پر).
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

const NOW = new Date();
const EARLIER = new Date(Date.now() - 60_000);
// موبایل‌های ساختگی تست (قانون ۱۰ — صفر PII واقعی)
const ARM_MOBILE = "09121234567";
const EXPERT_MOBILE = "09127654321";

const PROP_ID = "pn050-b-71x1";
const PROP_CODE = "PN050-B-ME1";
const PROP_ID2 = "pn050-c-71x2";
const PROP_CODE2 = "PN050-C-ME2";
const DUP_OLD_ID = "pn050-dup-old";
const DUP_NEW_ID = "pn050-dup-new";
const DUP_CODE = "PN050-DUP-ME3";

beforeAll(async () => {
  const { db } = await import("@/lib/db");
  // پاک‌سازی بقایای اجراهای پیشین (سلامت ایزولاسیون تست)
  await db.propertyRecord.deleteMany({ where: { id: { in: [PROP_ID, PROP_ID2, DUP_OLD_ID] } } });
  await db.auditLog.deleteMany({ where: { action: { in: ["expert_override", "manual_revert"] }, detail: { contains: PROP_ID } } });
});

afterAll(async () => {
  const { db } = await import("@/lib/db");
  await db.propertyRecord.deleteMany({ where: { id: { in: [PROP_ID, PROP_ID2, DUP_OLD_ID] } } });
  await db.auditLog.deleteMany({ where: { detail: { in: [`id=${PROP_ID}`, `id=${PROP_ID2}`, `id=${DUP_OLD_ID}`] } } });
});

describe("PN-050 · سناریوی B — قانون متخصص + بازگردانی (DB واقعی)", () => {
  test("گام ۱-۵: ویرایش متخصص CRM → DB + audit expert_override", async () => {
    const { db } = await import("@/lib/db");
    const { upsertRecordWithMerge, SOURCE_CRM_PRIVATE } = await import("@/lib/merge");

    // گام ۱ — رکورد با موبایل ARM و provenance با conf 0.95
    await db.propertyRecord.create({
      data: {
        id: PROP_ID,
        propertyCode: PROP_CODE,
        tenantId: "melketun",
        ownerMobile: ARM_MOBILE,
        lastSyncedValue: JSON.stringify({
          ownerMobile: { value: ARM_MOBILE, source: "ARM", confidence: 0.95, at: EARLIER.toISOString() },
        }),
        lastSyncedAt: EARLIER,
        fieldChanges: JSON.stringify([]),
      },
    });

    // گام ۲-۳ — کارشناس در CRM خصوصی تغییر داد؛ سینک با قانون ادغام می‌نویسد
    const res = await upsertRecordWithMerge({
      entity: "property",
      runId: "pn050-test-b",
      modifiedAt: NOW,
      data: {
        id: PROP_ID,
        propertyCode: PROP_CODE,
        tenantId: "melketun",
        ownerMobile: EXPERT_MOBILE, // مقدار تازهٔ نمای خصوصی CRM
        title: "آپارتمان تست سناریوی B",
      },
    });

    expect(res.created).toBe(false);
    expect(res.expertFields).toContain("ownerMobile");

    // گام ۴ — DB = EXPERT (قانون ۰۵: متخصص با confidence پایین‌تر هم برنده)
    const row = await db.propertyRecord.findUnique({ where: { id: PROP_ID } });
    expect(row?.ownerMobile).toBe(EXPERT_MOBILE);

    // provenance + fieldChanges ثبت شد
    expect(row?.lastModifiedBy).toBe(SOURCE_CRM_PRIVATE);
    const changes = JSON.parse((row?.fieldChanges ?? "[]") as string) as { field: string; kind: string; from: unknown; to: unknown }[];
    expect(changes.some((c) => c.field === "ownerMobile" && c.kind === "expert_override" && c.to === EXPERT_MOBILE)).toBe(true);

    // گام ۵ — audit_log: expert_override (بدون PII خام — قانون ۱۰)
    const audit = await db.auditLog.findFirst({ where: { action: "expert_override", detail: { contains: `id=${PROP_ID}` } } });
    expect(audit).not.toBeNull();
    expect(audit?.detail).toContain("field=ownerMobile");
    expect(audit?.detail).not.toContain(EXPERT_MOBILE); // مقدار خام هرگز در audit نیست
  });

  test("گام ۶-۷: بازگردانی از پنل → DB = مقدار پیشین + audit manual_revert", async () => {
    const { db } = await import("@/lib/db");
    const { revertRecordField } = await import("@/lib/merge");

    const outcome = await revertRecordField({ entity: "property", id: PROP_ID, field: "ownerMobile", actor: "9999" });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.revertedTo).toBe(ARM_MOBILE); // مقدار پیش از ویرایش متخصص
    }

    // DB بازگشت به مقدار پیشین
    const row = await db.propertyRecord.findUnique({ where: { id: PROP_ID } });
    expect(row?.ownerMobile).toBe(ARM_MOBILE);
    expect(row?.lastModifiedBy).toBe("owner");

    // fieldChanges: مدخل manual_revert
    const changes = JSON.parse((row?.fieldChanges ?? "[]") as string) as { field: string; kind: string; from: unknown; to: unknown }[];
    const revertEntry = changes.find((c) => c.field === "ownerMobile" && c.kind === "manual_revert");
    expect(revertEntry?.from).toBe(EXPERT_MOBILE);
    expect(revertEntry?.to).toBe(ARM_MOBILE);

    // audit_log: manual_revert (بدون مقدار خام)
    const audit = await db.auditLog.findFirst({ where: { action: "manual_revert", detail: { contains: `id=${PROP_ID}` } } });
    expect(audit).not.toBeNull();
    expect(audit?.detail).toContain("field=ownerMobile");
    expect(audit?.detail).not.toContain(ARM_MOBILE);
  });

  test("بازگردانی دوباره = رد صادقانه (از پیش بازگردانی‌شده — بدون هدف)", async () => {
    const { revertRecordField } = await import("@/lib/merge");
    const outcome = await revertRecordField({ entity: "property", id: PROP_ID, field: "ownerMobile" });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe("no_target");
  });
});

describe("PN-050 · سناریوی C — دادهٔ مقدس در مسیر سینک (DB واقعی)", () => {
  test("enrichment با null روی فیلد پر → مقدار پر دست‌نخورده می‌ماند", async () => {
    const { db } = await import("@/lib/db");
    const { upsertRecordWithMerge } = await import("@/lib/merge");

    await db.propertyRecord.create({
      data: {
        id: PROP_ID2,
        propertyCode: PROP_CODE2,
        tenantId: "melketun",
        ownerMobile: EXPERT_MOBILE,
        lastSyncedValue: JSON.stringify({
          ownerMobile: { value: EXPERT_MOBILE, source: "CRM_private", confidence: 0.98, at: EARLIER.toISOString() },
        }),
        lastSyncedAt: EARLIER,
        fieldChanges: JSON.stringify([]),
      },
    });

    // نمای جدید CRM فیلد را ندارد (null) — enrichment خراب/ناقص
    await upsertRecordWithMerge({
      entity: "property",
      runId: "pn050-test-c",
      modifiedAt: NOW,
      data: {
        id: PROP_ID2,
        propertyCode: PROP_CODE2,
        tenantId: "melketun",
        ownerMobile: null,
        address: "تبریز، آدرس تازه", // ولی آدرس تازه آمد → افزودنی
      },
    });

    const row = await db.propertyRecord.findUnique({ where: { id: PROP_ID2 } });
    expect(row?.ownerMobile).toBe(EXPERT_MOBILE); // null روی پر ننشست (قانون ۰۴)
    expect(row?.address).toBe("تبریز، آدرس تازه"); // فیلد خالی پر شد (افزودنی)
    const changes = JSON.parse((row?.fieldChanges ?? "[]") as string) as { field: string }[];
    expect(changes.some((c) => c.field === "ownerMobile")).toBe(false); // هیچ ردی از تلاش null
  });
});

describe("PN-050 · مسیر P2002 — هم-کد با id متفاوت (سینک قدیمی نمای خصوصی)", () => {
  test("رکورد موجود با همان propertyCode بر اساس کد طبیعی ادغام می‌شود (id قدیمی حفظ)", async () => {
    const { db } = await import("@/lib/db");
    const { upsertRecordWithMerge } = await import("@/lib/merge");

    await db.propertyRecord.create({
      data: {
        id: DUP_OLD_ID, // id قدیمی از سینک نمای خصوصی PN-046
        propertyCode: DUP_CODE,
        tenantId: "melketun",
        title: "عنوان قدیمی",
        fieldChanges: JSON.stringify([]),
      },
    });

    const res = await upsertRecordWithMerge({
      entity: "property",
      runId: "pn050-test-dup",
      modifiedAt: NOW,
      data: {
        id: DUP_NEW_ID, // id تازهٔ vtiger — با کد یکسان
        propertyCode: DUP_CODE,
        tenantId: "melketun",
        title: "عنوان تازه از نمای عمومی",
        ownerMobile: EXPERT_MOBILE,
      },
    });

    expect(res.duplicateMerged).toBe(true);
    expect(res.created).toBe(false);

    // رکورد قدیمی زنده است و id آن همان است (قانون دادهٔ مقدس — id هرگز عوض نمی‌شود)
    const old = await db.propertyRecord.findUnique({ where: { id: DUP_OLD_ID } });
    expect(old).not.toBeNull();
    expect(old?.title).toBe("عنوان تازه از نمای عمومی");
    expect(old?.ownerMobile).toBe(EXPERT_MOBILE);
    // رکورد تازه‌ای با id جدید ساخته نشد
    const dup = await db.propertyRecord.findUnique({ where: { id: DUP_NEW_ID } });
    expect(dup).toBeNull();
  });
});

describe("PN-050 · مسیر create — provenance اولیه", () => {
  test("رکورد جدید با lastSyncedValue/lastSyncedAt/lastModifiedBy ساخته می‌شود", async () => {
    const { db } = await import("@/lib/db");
    const { upsertRecordWithMerge } = await import("@/lib/merge");
    const NEW_ID = "pn050-create-71x9";
    const NEW_CODE = "PN050-CREATE-ME9";
    await db.propertyRecord.deleteMany({ where: { id: NEW_ID } });

    const res = await upsertRecordWithMerge({
      entity: "property",
      runId: "pn050-test-create",
      modifiedAt: NOW,
      data: {
        id: NEW_ID,
        propertyCode: NEW_CODE,
        tenantId: "melketun",
        title: "آگهی تازه",
        ownerMobile: ARM_MOBILE,
      },
    });
    expect(res.created).toBe(true);

    const row = await db.propertyRecord.findUnique({ where: { id: NEW_ID } });
    expect(row?.ownerMobile).toBe(ARM_MOBILE);
    const prov = JSON.parse((row?.lastSyncedValue ?? "{}") as string) as Record<string, { source: string; value: unknown }>;
    expect(prov.ownerMobile.source).toBe("CRM_private");
    expect(prov.title.value).toBe("آگهی تازه");
    expect(row?.lastSyncedAt).not.toBeNull();
    expect(row?.fieldChanges).toBeNull(); // creation = بدون تغییر provenance

    await db.propertyRecord.deleteMany({ where: { id: NEW_ID } });
  });
});
