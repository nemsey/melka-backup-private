/**
 * تست شب دوم — resolveTradedSummary (رفع نمایش خلاصهٔ صفر با شاهد recon-night2)
 * --------------------------------------------------------------------------------
 * شاهد زندهٔ ۱۴۰۵/۰۶/۲۹: traded-count-total با بازهٔ ISO درست هم برای حساب realtor
 * totalCount=0 برمی‌گرداند، در حالی که traded-count همان لحظه ۷۲۴ ردیف داده می‌دهد.
 * چهار سناریوی مستند در JSDoc تابع.
 */
import { describe, expect, test } from "bun:test";

import { resolveTradedSummary } from "../src/lib/melk-api/sync";
import type { CrmTransaction } from "../src/lib/melk-api/types";

function tx(id: string, events = 0, suggested = 0): CrmTransaction {
  return {
    id,
    contractDate: "2025-05-01T00:00:00.000Z",
    rawDate: "1404/02/11",
    rawPropertyCustomer: " سيد علي  رضائي ",
    rawRequestCustomer: null,
    propertyCode: `P${id}`,
    propertyCustomer: "سید علی رضایی",
    requestCode: null,
    requestCustomer: null,
    contractHolo: `H${id}`,
    // ساختار کامل نیازی نیست — resolveTradedSummary فقط از این دو فیلد می‌خواند
    eventsCount: events,
    suggestedPropertyCount: suggested,
  } as unknown as CrmTransaction;
}

describe("شب ۲ — resolveTradedSummary", () => {
  test("خلاصهٔ endpoint غیرصفر → عین خودش", () => {
    const s = { totalCount: 500, hasRequestEvent: 10, hasSuggestedProperty: 20, hasBoth: 5 };
    expect(resolveTradedSummary(s, [tx("a"), tx("b")])).toBe(s);
  });

  test("خلاصهٔ صفر + ردیف واقعی (سناریوی شب ۲: 0 در برابر 724) → محاسبه از ردیف‌ها", () => {
    const rows = [tx("a", 1, 0), tx("b", 0, 1), tx("c", 1, 1)];
    const out = resolveTradedSummary({ totalCount: 0, hasRequestEvent: 0, hasSuggestedProperty: 0, hasBoth: 0 }, rows);
    expect(out.totalCount).toBe(3);
    expect(out.hasRequestEvent).toBe(2);
    expect(out.hasSuggestedProperty).toBe(2);
    expect(out.hasBoth).toBe(1);
  });

  test("خلاصهٔ صفر + بدون ردیف → صفر صادقانهٔ endpoint حفظ می‌شود", () => {
    const s = { totalCount: 0, hasRequestEvent: 0, hasSuggestedProperty: 0, hasBoth: 0 };
    expect(resolveTradedSummary(s, [])).toBe(s);
  });

  test("خطای endpoint (null) → محاسبه از ردیف‌ها (عین رفتار قبلی)", () => {
    const out = resolveTradedSummary(null, [tx("a"), tx("b")]);
    expect(out.totalCount).toBe(2);
  });
});
