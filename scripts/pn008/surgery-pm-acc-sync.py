#!/usr/bin/env python3
"""جراحی pm-acc-sync.ts — حذف کامل بخش‌های پرسنلی نسل قدیمی (انتقال به profile-store.ts)"""
import re

path = "/home/z/my-project/src/lib/melk-api/pm-acc-sync.ts"
src = open(path, encoding="utf-8").read()

# ۱) بخش «۱) رجیستری پرسنل PM» کامل (از سربرگ بخش تا سربرگ بخش ۲)
m = re.search(r"// =+\n// ۱\) رجیستری پرسنل PM.*?(?=// =+\n// ۲\) کارگزاری)", src, re.S)
assert m, "section 1 not found"
src = src.replace(m.group(0), "")

# ۲) تابع normMobile محلی (بی‌استفاده پس از حذف بخش ۱)
m = re.search(r"\nfunction normMobile\(m: unknown\): string \| null \{.*?\n\}\n", src, re.S)
assert m, "normMobile not found"
src = src.replace(m.group(0), "\n")

# ۳) findPmNameByCode (منتقل به profile-store.ts با نام findExpertNameByPersonnelCode)
m = re.search(r"\n/\*\* P6\.5-12 — نام پرسنل PM با کد پرسنلی.*?^/\*\* شناسهٔ کسب‌وکار", src, re.S | re.M)
assert m, "findPmNameByCode not found"
src = src.replace(m.group(0), "\n/** شناسهٔ کسب‌وکار")

# ۴) کل بخش P6546 (PmPersonnelInfoSyncResult + pick* + syncPmPersonnelInfo + pickHireDate + pickStr) تا انتهای فایل
m = re.search(r"\n// =+ P6546/گام چهارم — غنی‌سازی استخدام پرسنل PM =+\n.*$", src, re.S)
assert m, "P6546 section not found"
src = src.replace(m.group(0), "")

src = re.sub(r"\n{3,}", "\n\n", src) + "\n"
open(path, "w", encoding="utf-8").write(src)
print("OK — lines now:", src.count("\n"))
for bad in ["syncPmPersonnel", "PmPersonnelRow", "findPmNameByCode", "pickBranchTitle", "pickEmploymentInfo", "pickHireDate", "pickStr", "normMobile", "PmPersonnelInfoSyncResult", "pmPersonnelRecord"]:
    if bad in src:
        print("STILL PRESENT:", bad)
print("done")
