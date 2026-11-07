#!/usr/bin/env python3
"""PN-043/فاز ۵ — update pn030-proxy-connection.test.ts E-3 home-order assertion."""

P = "tests/pn030-proxy-connection.test.ts"
with open(P, encoding="utf-8") as f:
    src = f.read()

old = '''    expect(tileRegistry.listChildren("management-dashboard", "OWNER")).toEqual([]);
    const ids = tileRegistry.listRoot("OWNER").map((t) => t.id);
    expect(ids).toEqual([
      "file-finder",           // ۱ فایل یابی
      "arm-listings",          // ۲ آگهی
      "arm-requests",          // ۳ درخواست
      "transactions-contracts", // ۴ معاملات
      "experts",               // ۵ کارشناسان
      "smart-matching",        // ۶ تطبیق
      "learning-tier",         // ۷ مغز
      "settings",              // ۸ تنظیمات
    ]);'''
new = '''    // PN-043/فاز ۲ (شورا-ن۰۸۷): M1-M4 درون ظرف tenant-dashboards — شش کاشی ریشه
    expect(tileRegistry.listChildren("tenant-dashboards", "OWNER").map((t) => t.id)).toEqual([
      "arm-listings", "arm-requests", "transactions-contracts", "experts",
    ]);
    const ids = tileRegistry.listRoot("OWNER").map((t) => t.id);
    expect(ids).toEqual([
      "file-finder",              // ۱ فایل یابی
      "smart-matching",           // ۲ تطبیق
      "learning-tier",            // ۳ مغز
      "settings",                 // ۴ تنظیمات
      "tenant-dashboard-tabriz",  // ۵ داشبورد ملک تبریز
      "tenant-dashboard-melketun", // ۶ داشبورد ملکتون
    ]);'''
assert old in src, "E-3 anchor not found"
src = src.replace(old, new, 1)

old2 = '''    expect(tileRegistry.get("smart-matching")!.order).toBe(6);
    expect(tileRegistry.get("learning-tier")!.order).toBe(7);
    expect(tileRegistry.get("settings")!.order).toBe(8);'''
new2 = '''    expect(tileRegistry.get("smart-matching")!.order).toBe(2); // PN-043: تطبیق دوم
    expect(tileRegistry.get("learning-tier")!.order).toBe(3);  // PN-043: مغز سوم
    expect(tileRegistry.get("settings")!.order).toBe(4);       // PN-043: تنظیمات چهارم'''
assert old2 in src, "E-3 orders anchor not found"
src = src.replace(old2, new2, 1)

with open(P, "w", encoding="utf-8") as f:
    f.write(src)
print("OK — pn030 E-3 updated")
