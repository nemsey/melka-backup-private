#!/usr/bin/env python3
"""PN-043/فاز ۵ — update pn017-sections.test.ts جایگاه ۸ assertion:
UI removed from settings (PN-043-F1) while the component file and data remain sacred."""

P = "tests/pn017-sections.test.ts"
with open(P, encoding="utf-8") as f:
    lines = f.readlines()

start = next(i for i, l in enumerate(lines) if "جایگاه ۸ = شاهکار «مدیریت کاربران ملک تبریز» و جایگاه ۹" in l)
end = next(i for i in range(start, len(lines)) if lines[i].rstrip() == "  });")

new_block = '''  test("PN-043-F1 — UI «مدیریت کاربران ملک تبریز» از تنظیمات حذف شد؛ جایگاه ۹ محفوظ (دادهٔ مقدس)", () => {
    // PN-043/فاز ۱ (شورا-ن۰۸۷): حذف نما نه حذف داده — رندر از SettingsPage برداشته شد
    expect(settings).not.toContain("<MelkTabrizUsersSection />");
    expect(settings).toContain("PN-043-F1"); // شاهد حذفِ مستند در سورس
    expect(settings).toContain("<PersonnelAccessSection />"); // جایگاه ۹ (دسترسی کارشناسان) محفوظ
    // کامپوننت نگه‌داری شده — گارد audit-stealth-users فایل را می‌خواند؛ داده در DB محفوظ (قانون ۶)
    expect(existsSync("src/core/tiles/tiles/settings/MelkTabrizUsersSection.tsx")).toBe(true);
  });
'''

lines[start:end + 1] = [new_block]
with open(P, "w", encoding="utf-8") as f:
    f.writelines(lines)
print(f"OK — pn017 block {start}..{end} updated")
