/**
 * PN-050 · دستور ۶ — تست‌های پذیرش قانون ادغام (سناریوهای B + C + تست ۵/۵)
 * ---------------------------------------------------------------------------
 * اجرا: bun test tests/pn050/merge-law.test.ts
 *
 * پنج تست پذیرش دستور ۳:
 *   ۱. null overwrite → رد (دادهٔ مقدس)
 *   ۲. enrichment جدید → قبول
 *   ۳. expert update (conf=0.90 از CRM_private) بر ARM (conf=0.95) → قبول
 *   ۴. expert update قدیمی (modifiedAt < lastSyncedAt) → رد
 *   ۵. تعارض بین منابع (هر دو enrichment) → confidence
 * به‌علاوه: mergeRecord (provenance + fieldChanges) و سناریوی C در سطح رکورد.
 */

import { describe, expect, test } from "bun:test";
import {
  CONFIDENCE,
  PROPERTY_FIELD_SPECS,
  SOURCE_CRM_PRIVATE,
  SOURCE_CRM_PUBLIC,
  mergeField,
  mergeRecord,
  normValue,
  parseFieldChanges,
  parseProvenanceMap,
  shouldAcceptExpertUpdate,
  valuesEqual,
} from "@/lib/merge";

const NOW = new Date("2026-10-28T10:00:00.000Z");
const EARLIER = new Date("2026-10-27T10:00:00.000Z");
const LATER = new Date("2026-10-29T10:00:00.000Z");

// مالکیت موبایل تست — اعداد ساختگی، نه PII واقعی (قانون ۱۰)
const ARM_MOBILE = "09121234567";
const EXPERT_MOBILE = "09127654321";

describe("PN-050 · دستور ۳ — قانون برتری به‌روزرسانی متخصص (۵/۵)", () => {
  test("۱. null overwrite → رد (قانون دادهٔ مقدس — null روی پر نمی‌نشیند)", () => {
    const res = mergeField({
      field: "ownerMobile",
      incoming: { value: null, source: SOURCE_CRM_PUBLIC, confidence: 0.75, modifiedAt: NOW },
      existing: { value: ARM_MOBILE, confidence: 0.95, lastSyncedValue: ARM_MOBILE, lastSyncedAt: EARLIER },
    });
    expect(res.accepted).toBe(false);
    expect(res.reason).toBe("sacred_null_guard");
    expect(res.value).toBe(ARM_MOBILE);
  });

  test("۱-ب. رشتهٔ خالی هم مثل null رد می‌شود (هم‌ارز G1)", () => {
    const res = mergeField({
      field: "ownerMobile",
      incoming: { value: "  ", source: SOURCE_CRM_PUBLIC, confidence: 0.75, modifiedAt: NOW },
      existing: { value: ARM_MOBILE, confidence: 0.95, lastSyncedValue: ARM_MOBILE, lastSyncedAt: EARLIER },
    });
    expect(res.accepted).toBe(false);
    expect(res.reason).toBe("sacred_null_guard");
  });

  test("۲. enrichment جدید (فیلد خالی + مقدار واقعی) → قبول", () => {
    const res = mergeField({
      field: "ownerMobile",
      incoming: { value: EXPERT_MOBILE, source: SOURCE_CRM_PUBLIC, confidence: 0.75, modifiedAt: NOW },
      existing: { value: null, confidence: 0, lastSyncedValue: null, lastSyncedAt: null },
    });
    expect(res.accepted).toBe(true);
    expect(res.kind).toBe("enrichment");
    expect(res.value).toBe(EXPERT_MOBILE);
  });

  test("۳. expert update (conf=0.90 · CRM_private) بر ARM (conf=0.95) → قبول اجباری", () => {
    const res = mergeField({
      field: "ownerMobile",
      incoming: { value: EXPERT_MOBILE, source: SOURCE_CRM_PRIVATE, confidence: 0.9, modifiedAt: NOW },
      existing: { value: ARM_MOBILE, confidence: 0.95, lastSyncedValue: ARM_MOBILE, lastSyncedAt: EARLIER },
    });
    expect(res.accepted).toBe(true);
    expect(res.kind).toBe("expert_override");
    expect(res.reason).toBe("expert_override");
    expect(res.value).toBe(EXPERT_MOBILE);
  });

  test("۴. expert update قدیمی (modifiedAt < lastSyncedAt) → رد", () => {
    const res = mergeField({
      field: "ownerMobile",
      incoming: { value: EXPERT_MOBILE, source: SOURCE_CRM_PRIVATE, confidence: 0.9, modifiedAt: EARLIER },
      existing: { value: ARM_MOBILE, confidence: 0.95, lastSyncedValue: ARM_MOBILE, lastSyncedAt: NOW },
    });
    expect(res.accepted).toBe(false);
    expect(res.reason).toBe("keep_existing");
    expect(res.value).toBe(ARM_MOBILE);
  });

  test("۵-الف. تعارض دو منبع غنی‌سازی → confidence بالاتر برنده", () => {
    const res = mergeField({
      field: "price",
      incoming: { value: 9_000_000_000, source: SOURCE_CRM_PUBLIC, confidence: 0.9, modifiedAt: NOW },
      existing: { value: 8_500_000_000, confidence: 0.75, lastSyncedValue: 8_500_000_000, lastSyncedAt: EARLIER },
    });
    expect(res.accepted).toBe(true);
    expect(res.reason).toBe("higher_confidence");
    expect(res.value).toBe(9_000_000_000);
  });

  test("۵-ب. تعارض دو منبع غنی‌سازی → confidence پایین‌تر رد", () => {
    const res = mergeField({
      field: "price",
      incoming: { value: 9_000_000_000, source: SOURCE_CRM_PUBLIC, confidence: 0.6, modifiedAt: NOW },
      existing: { value: 8_500_000_000, confidence: 0.75, lastSyncedValue: 8_500_000_000, lastSyncedAt: EARLIER },
    });
    expect(res.accepted).toBe(false);
    expect(res.reason).toBe("keep_existing");
    expect(res.value).toBe(8_500_000_000);
  });

  test("۵-ج. برابری اطمینان → جدیدترین برنده", () => {
    const res = mergeField({
      field: "price",
      incoming: { value: 9_000_000_000, source: SOURCE_CRM_PUBLIC, confidence: 0.75, modifiedAt: LATER },
      existing: { value: 8_500_000_000, confidence: 0.75, lastSyncedValue: 8_500_000_000, lastSyncedAt: NOW },
    });
    expect(res.accepted).toBe(true);
    expect(res.reason).toBe("newest");
  });

  test("۵-د. برابری اطمینان + دادهٔ کهنه → نگه‌داشت", () => {
    const res = mergeField({
      field: "price",
      incoming: { value: 9_000_000_000, source: SOURCE_CRM_PUBLIC, confidence: 0.75, modifiedAt: EARLIER },
      existing: { value: 8_500_000_000, confidence: 0.75, lastSyncedValue: 8_500_000_000, lastSyncedAt: NOW },
    });
    expect(res.accepted).toBe(false);
    expect(res.reason).toBe("keep_existing");
  });

  test("مقدار هم‌ارز فعلی → بی‌اثر (هیچ ردی در fieldChanges)", () => {
    const res = mergeField({
      field: "ownerMobile",
      incoming: { value: ARM_MOBILE, source: SOURCE_CRM_PRIVATE, confidence: 0.9, modifiedAt: LATER },
      existing: { value: ARM_MOBILE, confidence: 0.95, lastSyncedValue: ARM_MOBILE, lastSyncedAt: EARLIER },
    });
    expect(res.accepted).toBe(false);
    expect(res.reason).toBe("unchanged");
  });
});

describe("PN-050 · shouldAcceptExpertUpdate — قاعدهٔ ب (شرط‌های چهارگانه)", () => {
  test("همهٔ شرط‌ها برقرار → true (پذیرش اجباری)", () => {
    expect(
      shouldAcceptExpertUpdate({
        field: "ownerMobile",
        incoming: { value: EXPERT_MOBILE, source: SOURCE_CRM_PRIVATE, confidence: 0.9 },
        lastSyncedValue: ARM_MOBILE,
        lastSyncedAt: EARLIER,
        modifiedAt: NOW,
      }),
    ).toBe(true);
  });

  test("مقدار null → false (متخصص به‌جز null همیشه برنده)", () => {
    expect(
      shouldAcceptExpertUpdate({
        field: "ownerMobile",
        incoming: { value: null, source: SOURCE_CRM_PRIVATE },
        lastSyncedValue: ARM_MOBILE,
        lastSyncedAt: EARLIER,
        modifiedAt: NOW,
      }),
    ).toBe(false);
  });

  test("منبع غیر خصوصی → false", () => {
    expect(
      shouldAcceptExpertUpdate({
        field: "price",
        incoming: { value: 123, source: SOURCE_CRM_PUBLIC },
        lastSyncedValue: 100,
        lastSyncedAt: EARLIER,
        modifiedAt: NOW,
      }),
    ).toBe(false);
  });

  test("مقدار = آخرین مقدار سینک‌شده (بدون تغییر) → false", () => {
    expect(
      shouldAcceptExpertUpdate({
        field: "ownerMobile",
        incoming: { value: ARM_MOBILE, source: SOURCE_CRM_PRIVATE },
        lastSyncedValue: ARM_MOBILE,
        lastSyncedAt: EARLIER,
        modifiedAt: NOW,
      }),
    ).toBe(false);
  });

  test("modifiedAt قدیمی‌تر از lastSyncedAt (شاهد کهنهٔ bootstrap) → false", () => {
    expect(
      shouldAcceptExpertUpdate({
        field: "ownerMobile",
        incoming: { value: EXPERT_MOBILE, source: SOURCE_CRM_PRIVATE },
        lastSyncedValue: ARM_MOBILE,
        lastSyncedAt: NOW,
        modifiedAt: EARLIER,
      }),
    ).toBe(false);
  });
});

describe("PN-050 · mergeRecord — provenance + fieldChanges (دستور ۲ + ۳)", () => {
  test("سناریوی B (سطح رکورد): ویرایش متخصص → expert_override + fieldChanges + provenance", () => {
    const existing = {
      id: "71x100",
      propertyCode: "ME100",
      ownerMobile: ARM_MOBILE,
      title: "آپارتمان ۱۰۰ متری",
      lastSyncedValue: JSON.stringify({
        ownerMobile: { value: ARM_MOBILE, source: "ARM", confidence: 0.95, at: EARLIER.toISOString() },
        title: { value: "آپارتمان ۱۰۰ متری", source: SOURCE_CRM_PUBLIC, confidence: 0.75, at: EARLIER.toISOString() },
      }),
      lastSyncedAt: EARLIER,
      lastModifiedBy: "ARM",
      lastModifiedAt: EARLIER,
      fieldChanges: JSON.stringify([]),
    };
    const res = mergeRecord({
      entity: "property",
      incoming: {
        id: "71x100",
        propertyCode: "ME100",
        ownerMobile: EXPERT_MOBILE, // متخصص در CRM خصوصی تغییر داد
        title: "آپارتمان ۱۰۰ متری",
      },
      existing,
      modifiedAt: NOW,
      runId: "pn050-test-1",
    });

    expect(res.created).toBe(false);
    expect(res.expertFields).toEqual(["ownerMobile"]);
    expect(res.payload.ownerMobile).toBe(EXPERT_MOBILE);
    // فیلد رد/بدون تغییر در payload نیست (قانون ۱۴ — additive-only)
    expect("title" in res.payload).toBe(false);
    // provenance تازه برای فیلد پذیرفته‌شده
    const prov = parseProvenanceMap(res.payload.lastSyncedValue as string);
    expect(prov.ownerMobile.value).toBe(EXPERT_MOBILE);
    expect(prov.ownerMobile.source).toBe(SOURCE_CRM_PRIVATE);
    // fieldChanges: از مقدار کهنه به تازه
    const changes = parseFieldChanges(res.payload.fieldChanges as string);
    expect(changes).toHaveLength(1);
    expect(changes[0].kind).toBe("expert_override");
    expect(changes[0].from).toBe(ARM_MOBILE);
    expect(changes[0].to).toBe(EXPERT_MOBILE);
    expect(changes[0].runId).toBe("pn050-test-1");
    expect(res.payload.lastModifiedBy).toBe(SOURCE_CRM_PRIVATE);
  });

  test("سناریوی C (سطح رکورد): enrichment با null → فیلد پر دست‌نخورده و بدون رد", () => {
    const existing = {
      id: "71x200",
      propertyCode: "ME200",
      ownerMobile: EXPERT_MOBILE,
      lastSyncedValue: JSON.stringify({
        ownerMobile: { value: EXPERT_MOBILE, source: SOURCE_CRM_PRIVATE, confidence: 0.98, at: EARLIER.toISOString() },
      }),
      lastSyncedAt: EARLIER,
      fieldChanges: JSON.stringify([]),
    };
    const res = mergeRecord({
      entity: "property",
      incoming: {
        id: "71x200",
        propertyCode: "ME200",
        ownerMobile: null, // نمای جدید CRM فیلد غنی‌سازی ندارد (myFilings ناقص)
        address: "تبریز، خیابان نمونه", // ولی آدرس تازه دارد → پذیرش افزودنی
      },
      existing,
      modifiedAt: NOW,
      runId: "pn050-test-2",
    });

    expect("ownerMobile" in res.payload).toBe(false); // مقدار پر هرگز بازنویسی نشد
    expect(res.expertFields).not.toContain("ownerMobile");
    expect(res.payload.address).toBe("تبریز، خیابان نمونه"); // فیلد خالی پر شد
    const changes = parseFieldChanges(res.payload.fieldChanges as string);
    expect(changes.some((c) => c.field === "ownerMobile")).toBe(false);
    expect(changes.some((c) => c.field === "address")).toBe(true);
    // provenance فیلد محافظت‌شده حفظ شد
    const prov = parseProvenanceMap(res.payload.lastSyncedValue as string);
    expect(prov.ownerMobile.value).toBe(EXPERT_MOBILE);
  });

  test("مسیر create: payload کامل + provenance اولیه، بدون fieldChanges", () => {
    const res = mergeRecord({
      entity: "property",
      incoming: { id: "71x300", propertyCode: "ME300", ownerMobile: ARM_MOBILE, title: "زمین کلنگی" },
      existing: null,
      modifiedAt: NOW,
      runId: "pn050-test-3",
    });
    expect(res.created).toBe(true);
    expect(res.payload.ownerMobile).toBe(ARM_MOBILE);
    expect(res.changes).toHaveLength(0);
    expect(res.payload.fieldChanges).toBeUndefined();
    const prov = parseProvenanceMap(res.payload.lastSyncedValue as string);
    expect(prov.ownerMobile.source).toBe(SOURCE_CRM_PRIVATE);
    expect(prov.title.source).toBe(SOURCE_CRM_PUBLIC);
  });

  test("فیلد غایب در payload هرگز نوشته نمی‌شود (G2 — فیلد غنی‌سازی غایب ≠ پاک کردن)", () => {
    const existing = {
      id: "71x400",
      propertyCode: "ME400",
      address: "آدرس قدیمی",
      lastSyncedValue: JSON.stringify({ address: { value: "آدرس قدیمی", source: SOURCE_CRM_PRIVATE, confidence: 0.98, at: EARLIER.toISOString() } }),
      lastSyncedAt: EARLIER,
      fieldChanges: JSON.stringify([]),
    };
    const res = mergeRecord({
      entity: "property",
      incoming: { id: "71x400", propertyCode: "ME400", title: "فقط عنوان" }, // address غایب است
      existing,
      modifiedAt: NOW,
      runId: "pn050-test-4",
    });
    expect("address" in res.payload).toBe(false);
  });

  test("fieldChanges سقف ۱۰۰ مدخل دارد (آخرین‌ها می‌مانند)", () => {
    const old: { field: string; from: unknown; to: unknown; kind: "enrichment"; at: string }[] = [];
    for (let i = 0; i < 120; i++) {
      old.push({ field: "price", from: i, to: i + 1, kind: "enrichment", at: new Date(NOW.getTime() - (200 - i) * 1000).toISOString() });
    }
    const existing = {
      id: "71x500",
      propertyCode: "ME500",
      price: 999,
      lastSyncedValue: JSON.stringify({ price: { value: 999, source: SOURCE_CRM_PUBLIC, confidence: 0.75, at: EARLIER.toISOString() } }),
      lastSyncedAt: EARLIER,
      fieldChanges: JSON.stringify(old),
    };
    const res = mergeRecord({
      entity: "property",
      incoming: { id: "71x500", propertyCode: "ME500", price: 1000 },
      existing,
      modifiedAt: NOW,
      runId: "pn050-test-5",
    });
    const changes = parseFieldChanges(res.payload.fieldChanges as string);
    expect(changes.length).toBeLessThanOrEqual(100);
    expect(changes.length).toBe(100);
    expect(changes[changes.length - 1].to).toBe(1000); // جدیدترین حفظ شد
    expect(changes[0].from).toBe(old[21].from); // قدیمی‌ها بیرون ریخته‌اند
  });
});

describe("PN-050 · نرمال‌سازی و برابری", () => {
  test("normValue: undefined/null/«» → null", () => {
    expect(normValue(undefined)).toBeNull();
    expect(normValue(null)).toBeNull();
    expect(normValue("  ")).toBeNull();
    expect(normValue(0)).toBe(0);
    expect(normValue("x")).toBe("x");
  });

  test("valuesEqual: تهی‌ها هم‌ارز؛ عدد/رشته دقیق", () => {
    expect(valuesEqual(null, undefined)).toBe(true);
    expect(valuesEqual("", "  ")).toBe(true);
    expect(valuesEqual(0, 0)).toBe(true);
    expect(valuesEqual("0912", "0913")).toBe(false);
  });

  test("مشخصه‌های فیلد: منابع خصوصی/عمومی با اعتبار تعریف‌شده", () => {
    expect(PROPERTY_FIELD_SPECS.ownerMobile.source).toBe(SOURCE_CRM_PRIVATE);
    expect(PROPERTY_FIELD_SPECS.ownerMobile.confidence).toBe(CONFIDENCE[SOURCE_CRM_PRIVATE]);
    expect(PROPERTY_FIELD_SPECS.title.source).toBe(SOURCE_CRM_PUBLIC);
    expect(CONFIDENCE[SOURCE_CRM_PRIVATE]).toBeLessThanOrEqual(1);
  });
});
