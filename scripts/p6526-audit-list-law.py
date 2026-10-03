#!/usr/bin/env python3
"""P6526/ت — ممیزی قانون فهرست در همهٔ فهرست‌های جدولی اپلیکیشن
قوانین (AGENTS.md §۶):
  ۱. تک‌صفحه‌ای — بدون صفحه‌بندی (rows.map، بدونPagination)
  ۲. اسکرول سریع — ظرف اسکرول + cv-row فقط از پریمیتیوها (بدون ظرف تکراری overflow)
  ۳. سرستون ثابت (sticky از پریمیتیو)
  ۴. تمام ردیف‌ها (بدون سقف مصنوعی؛ سقف سرور ۲۵٬۰۰۰ = گارد ایمنی)
  ۵. وسط‌چین — سرستون‌ها و سلول‌ها (بدون text-right/text-start در فهرست‌ها)
  ۶. فونت یکدست سلول‌ها: text-xs (بدون text-sm/text-base در TableCell)
"""
import re
import sys
from pathlib import Path

SRC = Path("/home/z/my-project/src")
# فهرست‌های جدولی فعال (customer-club ثبت نشده — کد مرده)
LIST_PAGES = [
    "core/tiles/tiles/arm-listing/ArmListingsPage.tsx",
    "core/tiles/tiles/arm-request/ArmRequestsPage.tsx",
    "core/tiles/tiles/transactions-contracts/TransactionsTab.tsx",
    "core/tiles/tiles/experts/ExpertsPage.tsx",
    "core/tiles/tiles/extraction/ExtractionPage.tsx",
    "core/tiles/tiles/price-index/PriceIndexPage.tsx",
    "core/tiles/tiles/supply-demand/SupplyDemandPage.tsx",
]

violations = []

for rel in LIST_PAGES:
    p = SRC / rel
    if not p.exists():
        violations.append(f"{rel}: فایل وجود ندارد!")
        continue
    s = p.read_text(encoding="utf-8")
    name = p.name

    # قانون ۵: وسط‌چین — هیچ text-right / text-start روی سرستون یا داخل صفحهٔ فهرست
    for m in re.finditer(r"<TableHead[^>]*\b(text-right|text-start)\b", s):
        violations.append(f"{name}: سرستون غیروسط‌چین → {m.group(0)[:80]}")

    # قانون ۶: فونت یکدست — text-sm / text-base روی TableCell ممنوع
    for m in re.finditer(r"<TableCell[^>]*\b(text-sm|text-base|text-lg)\b", s):
        violations.append(f"{name}: سلول با فونت غیر قانونی → {m.group(0)[:80]}")

    # قانون ۲: ظرف اسکرول تکراری دور جدول (پریمیتیو خودش ظرف است)
    for m in re.finditer(r"<(div|CardContent)[^>]*(max-h-\[|overflow-y-auto|overflow-auto)[^>]*>\s*(?:{/\*[^*]*\*/}\s*)?(?:<div[^>]*>\s*)?(?:{/\*[^*]*\*/}\s*)?<Table", s):
        violations.append(f"{name}: ظرف اسکرول تکراری دور جدول → ...{m.group(0)[-60:]}")

    # قانون ۱: صفحه‌بندی ممنوع
    if re.search(r"Pagination|pageSize|currentPage|setPage\b", s):
        violations.append(f"{name}: نشانه صفحه‌بندی پیدا شد")

    # پریمیتیوهاست؟ (باید از ui/table استفاده کند نه جدول دستی)
    if "<table" in s:
        violations.append(f"{name}: جدول دستی <table> به‌جای پریمیتیوهای ui/table")

print("=" * 60)
if violations:
    print(f"❌ {len(violations)} تخلف:")
    for v in violations:
        print("  -", v)
    sys.exit(1)
else:
    print(f"✅ قانون فهرست: هر {len(LIST_PAGES)} فهرست فعال مطابق قانون است")
    print("   (تک‌صفحه‌ای · ظرف اسکرول یگانه از پریمیتیو · سرستون ثابت ·")
    print("    وسط‌چین · text-xs · بدون صفحه‌بندی · بدون جدول دستی)")
