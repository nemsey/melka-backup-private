#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""P6525 ثانیاً — حذف کلیهٔ تست‌های سابق فیلتر سه فهرست (آگهی/درخواست/معاملات)
تست‌های غیر فیلتر (دسته‌بندی، ستون‌ها، داده، ایجنت، ساختار غیر فیلتری) دست‌نخورده می‌مانند.
"""

def remove_block(path, block, label):
    with open(path, encoding="utf-8") as f:
        src = f.read()
    if block not in src:
        print(f"  MISS [{label}] in {path}")
        return False
    src = src.replace(block, "", 1)
    with open(path, "w", encoding="utf-8") as f:
        f.write(src)
    print(f"  REMOVED [{label}] from {path}")
    return True

# ============ ۱) p6510-arm-catalog.test.ts ============
P = "tests/p6510-arm-catalog.test.ts"

# D1 — بلوک فیلتر کد + فیلتر نام کارشناس
remove_block(P, """
    // فیلتر کد (contains)
    const byCode = await repo.listArmCatalog({ code: `${T_PREFIX}-912` }, 100);
    expect(byCode.rows.length).toBe(1);
    expect(byCode.rows[0].ownerName /* کارشناس */).toBeNull(); // ownerName نمایشی = مالک؛ هنوز غنی نشده

    // فیلتر نام کارشناس (contains روی ownerName ستون دامنه)
    const byRealtor = await repo.listArmCatalog({ realtorName: "تست آلفا" }, 100);
    expect(byRealtor.rows.some((r) => r.propertyCode === `${T_PREFIX}-911`)).toBe(true);
    expect(byRealtor.rows.some((r) => r.propertyCode === `${T_PREFIX}-912`)).toBe(false);
""", "p6510/D1-filter-blocks")

# D2 — بلوک فیلتر نام کارشناس
remove_block(P, """
    const byRealtor = await repo.listArmCatalog({ realtorName: "مجتبی تستی" }, 100);
    expect(byRealtor.rows.length).toBe(1);
    expect(byRealtor.rows[0].requestCode).toBe(`${T_PREFIX}-512`);
""", "p6510/D2-filter-block")

# F2 — سطر فیلترهای برچسب‌دار (ادعای فیلتری؛ بقیهٔ F2 ساختاری می‌ماند)
remove_block(P, """      expect(src.includes('id="arm-'), `${name}: فیلترهای برچسب‌دار`).toBe(true);
""", "p6510/F2-filter-line")

# ============ ۲) p015-m3-v2-transactions.test.ts ============
P = "tests/p015-m3-v2-transactions.test.ts"

# F1 — تست نرمال‌سازی ارقام (فیلتر)
remove_block(P, """
  test("F1 — normalizeFaDigits ارقام فارسی/عربی → لاتین", async () => {
    const { normalizeFaDigits } = await import("@/lib/contract-classify");
    expect(normalizeFaDigits("۴۱۱۲۲")).toBe("41122");
    expect(normalizeFaDigits("٠١٢٣")).toBe("0123");
    expect(normalizeFaDigits("mix ۱۲a3")).toBe("mix 12a3");
  });
""", "p015/F1-normalize")

# D.۱ — مقادیر فیلتر ۵ گزینه
remove_block(P, """
  test("D.۱ — مقادیر فیلتر دقیقاً ۵ گزینه (۴ نوع + none)", async () => {
    const { CONTRACT_KIND_FILTER_VALUES, CONTRACT_KIND_FILTER_LABELS } = await import("@/lib/contract-classify");
    expect(CONTRACT_KIND_FILTER_VALUES).toHaveLength(5);
    expect(CONTRACT_KIND_FILTER_LABELS["none"]).toBe("بدون قرارداد ثبت‌شده");
    expect(CONTRACT_KIND_FILTER_LABELS["مبایعه‌نامه"]).toBe("مبایعه‌نامه");
  });
""", "p015/D.۱-values")

# بخش ۴ — کل describe فیلترها (۱۸ سناریو) — از describe تا describe بعدی
with open(P, encoding="utf-8") as f:
    src = f.read()
start_marker = 'describe("P6.5-15 M3v2 · بخش ۴ — فیلترها (۱۸ سناریو — جدول F.۲)", () => {'
end_marker = '// ===========================================================================\n// بخش ۵ — ترتیب ستون‌ها (BLOCK E — ساختاری عین معیار پذیرش)'
si = src.find(start_marker)
ei = src.find(end_marker)
assert si != -1 and ei != -1 and si < ei, "p015 section-4 anchors not found"
# کمی بالاتر از describe — کامنت جدول بخش ۴
cs = src.rfind("// بخش ۴", 0, si)
if cs == -1 or si - cs > 200:
    cs = si
src = src[:cs] + src[ei:]
with open(P, "w", encoding="utf-8") as f:
    f.write(src)
print("  REMOVED [p015/section-4-filters] (18 scenarios)")

# D.۱(UI) — فیلتر چیپ‌های نوع قرارداد
with open(P, encoding="utf-8") as f:
    src = f.read()
start_marker = '  test("D.۱(UI) — فیلتر نوع قرارداد ۵ گزینهٔ چندانتخابی + debounce + پاک‌کردن + پیام خالی", () => {'
ei_marker = '  test("B.۱(UI) — DOM: KPI ← نمودار/برترین‌ها ← شفافیت ← فیلترها ← فهرست", () => {'
si = src.find(start_marker)
ei = src.find(ei_marker)
assert si != -1 and ei != -1 and si < ei, "p015 D.۱(UI) anchors not found"
src = src[:si] + src[ei:]
with open(P, "w", encoding="utf-8") as f:
    f.write(src)
print("  REMOVED [p015/D.۱(UI)-chips]")

# بخش ۷ — رگرسیون فیلتر F2/F3
with open(P, encoding="utf-8") as f:
    src = f.read()
start_marker = 'describe("P6.5-15 M3v2 · بخش ۷ — رگرسیون باگ‌های F2/F3 (بدون وابستگی به دادهٔ seed)", () => {'
end_marker = '// ===========================================================================\n// بخش ۸ — ایجنت (بینش‌ها با منطق جلسه ۰۱۸)'
si = src.find(start_marker)
ei = src.find(end_marker)
assert si != -1 and ei != -1 and si < ei, "p015 section-7 anchors not found"
cs = src.rfind("// بخش ۷", 0, si)
if cs == -1 or si - cs > 200:
    cs = si
src = src[:cs] + src[ei:]
with open(P, "w", encoding="utf-8") as f:
    f.write(src)
print("  REMOVED [p015/section-7-filter-regressions]")

# F — روت فیلتر (ساختاری)
remove_block(P, """
  test("F — روت: نرمال‌سازی + classifyContract + چندگانه (ساختاری)", () => {
    const src = readFileSync(ROUTE_FILE, "utf8");
    expect(src).toContain("normalizeFilterText");
    expect(src).toContain('sp.getAll("contractType")');
    expect(src).toContain("classifyContract");
    expect(src).not.toContain('contractType === "مبایعه نامه"'); // شرط هاردکد قدیمی حذف شد
  });
""", "p015/F-route-filter")

# ============ ۳) p6521-stale-links-m1m2.test.ts ============
P = "tests/p6521-stale-links-m1m2.test.ts"

# ا۶ — تجزیهٔ پارامتر states (فیلتر)
remove_block(P, """
  test("ا۶) تجزیهٔ پارامتر states: کلیدهای معتبر می‌مانند، نامعتبرها بی‌صدا حذف می‌شوند", async () => {
    const { parseListingStateFilter } = await import("@/lib/listing-status");
    expect(parseListingStateFilter("published,traded")).toEqual(["published", "traded"]);
    expect(parseListingStateFilter("published,bogus")).toEqual(["published"]);
    expect(parseListingStateFilter("bogus-only")).toEqual([]);
    expect(parseListingStateFilter(null)).toEqual([]);
  });
""", "p6521/ا۶-parse-states")

# ب۱ — فیلتر وضعیت مخزن (کل تست فیلتری است)
with open(P, encoding="utf-8") as f:
    src = f.read()
start_marker = '  test("ب۱) فیلتر statuses: فقط ردیف‌های همان حالت‌ها برمی‌گردند", async () => {'
ei_marker = '  test("ب۲) توزیع وضعیت: groupBy خام → تجمیع canonical با ریاضی درست", async () => {'
si = src.find(start_marker)
ei = src.find(ei_marker)
assert si != -1 and ei != -1 and si < ei, "p6521 ب۱ anchors not found"
src = src[:si] + src[ei:]
with open(P, "w", encoding="utf-8") as f:
    f.write(src)
print("  REMOVED [p6521/ب۱-repo-statuses-filter]")

# ه۱ — پارامتر states روت (فیلتر)
remove_block(P, """
  test("ه۱) پارامتر states تجزیه و به مقادیر خام قانون‌مند ترجمه می‌شود", () => {
    expect(listingsRoute).toContain("parseListingStateFilter");
    expect(listingsRoute).toContain("listingStateRawValues");
  });
""", "p6521/ه۱-route-states")

# و۱ — چیپ‌های فیلتر UI (فیلتر)
remove_block(P, """
  test("و۱) فیلتر چندانتخابی: شش چیپ toggle با aria-pressed + اعمال خودکار", () => {
    expect(listingsPage).toContain('id="arm-listing-states-filter"');
    expect(listingsPage).toContain("aria-pressed");
    expect(listingsPage).toContain("toggleState");
  });
""", "p6521/و۱-ui-chips")

print("\nتمام تست‌های سابق فیلتر حذف شدند — آمادهٔ طراحی تست‌های جدید P6525")
