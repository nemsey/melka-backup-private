# -*- coding: utf-8 -*-
# جلسهٔ ۰۳۳ (ثانیاً/ب + ت) — M1: حذف ستون «آخرین فعالیت» + ترتیب ستون‌های جدید
import re

P = "src/core/tiles/tiles/arm-listing/ArmListingsPage.tsx"
s = open(P, encoding="utf-8").read()

# ─── ۱) سربرگ جدول — بازنویسی کامل با ترتیب جدید ───
old_header = """                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">ردیف</TableHead>
                    <TableHead className="min-w-20">کد آگهی</TableHead>
                    <TableHead className="min-w-28">کارشناس</TableHead>
                    <TableHead className="min-w-24">شعبه</TableHead>
                    <TableHead className="min-w-36">مالک</TableHead>
                    {/* P6546/گام پنجم-ت-۴ — ستون قیمت با نام «قیمت» و قالب ۹،۰۰۰،۰۰۰،۰۰۰ */}
                    <TableHead className="min-w-32">قیمت</TableHead>
                    <TableHead className="min-w-28">قیمت هر متر</TableHead>
                    <TableHead className="min-w-44">آدرس ملک</TableHead>
                    {/* P6546/گام یک — شش ستون غنی‌شده از ساختار ثبت آگهی ARM + سامانهٔ عمومی */}
                    <TableHead className="min-w-24">نوع ملک</TableHead>
                    <TableHead className="min-w-20">متراژ</TableHead>
                    <TableHead className="min-w-16">اتاق</TableHead>
                    <TableHead className="min-w-16">طبقه</TableHead>
                    <TableHead className="min-w-20">ساخت</TableHead>
                    <TableHead className="min-w-24">دسته‌بندی</TableHead>
                    <TableHead className="min-w-28">آخرین فعالیت</TableHead>
                    {/* PN-002 گام ۱ — ستون‌های تازه از خود ردیف فهرست ARM */}
                    <TableHead className="min-w-20">رهن / اجاره</TableHead>
                    <TableHead className="min-w-16">بازدید</TableHead>
                    {/* PN-020/گام اول-الف — ستون‌های «تصاویر» و «انتشار» و «آخرین وضعیت» به دستور مالک حذف شدند */}
                    <TableHead className="min-w-24">تاریخ وضعیت</TableHead>
                    <TableHead className="min-w-16">لینک</TableHead>
                  </TableRow>
                </TableHeader>"""

new_header = """                <TableHeader>
                  <TableRow>
                    {/* جلسهٔ ۰۳۳ (دستور مالک — ثانیاً/ت): ترتیب ستون‌ها + حذف «آخرین فعالیت» */}
                    <TableHead className="w-10">ردیف</TableHead>
                    <TableHead className="min-w-20">کد آگهی</TableHead>
                    <TableHead className="min-w-28">کارشناس</TableHead>
                    <TableHead className="min-w-24">شعبه</TableHead>
                    <TableHead className="min-w-24">نوع ملک</TableHead>
                    <TableHead className="min-w-24">دسته‌بندی</TableHead>
                    <TableHead className="min-w-36">مالک</TableHead>
                    {/* P6546/گام پنجم-ت-۴ — ستون قیمت با نام «قیمت» و قالب ۹،۰۰۰،۰۰۰،۰۰۰ */}
                    <TableHead className="min-w-32">قیمت</TableHead>
                    <TableHead className="min-w-28">قیمت هر متر</TableHead>
                    {/* PN-002 گام ۱ — ستون‌های تازه از خود ردیف فهرست ARM */}
                    <TableHead className="min-w-20">رهن / اجاره</TableHead>
                    <TableHead className="min-w-44">آدرس ملک</TableHead>
                    {/* P6546/گام یک — ستون‌های غنی‌شده از ساختار ثبت آگهی ARM + سامانهٔ عمومی */}
                    <TableHead className="min-w-20">متراژ</TableHead>
                    <TableHead className="min-w-16">اتاق</TableHead>
                    <TableHead className="min-w-16">طبقه</TableHead>
                    <TableHead className="min-w-20">ساخت</TableHead>
                    <TableHead className="min-w-16">بازدید</TableHead>
                    <TableHead className="min-w-16">لینک</TableHead>
                    {/* PN-020/گام اول-الف بند ۴ + جلسهٔ ۰۳۳ — تاریخ وضعیت، آخرین ستون فهرست */}
                    <TableHead className="min-w-24">تاریخ وضعیت</TableHead>
                  </TableRow>
                </TableHeader>"""

assert old_header in s, "header block not found"
s = s.replace(old_header, new_header)

# ─── ۲) بدنهٔ جدول — تفکیک بلوک‌های سلول و چیدمان جدید ───
row_start = s.index("<TableRow key={r.id}>")
row_end = s.index("</TableRow>", row_start)
row_text = s[row_start:row_end]

lines = row_text.split("\n")
head = lines[0]  # <TableRow key={r.id}>

blocks = []      # لیست (comment_lines, cell_lines)
cur_comments = []
cur_cell = []
for ln in lines[1:]:
    stripped = ln.strip()
    if stripped.startswith("{/*") or stripped.startswith("//"):
        if cur_cell:
            # سلول قبلی تمام شده — بلوک تازه
            blocks.append((cur_comments, cur_cell))
            cur_comments, cur_cell = [], []
        cur_comments.append(ln)
    elif stripped.startswith("<TableCell"):
        cur_cell.append(ln)
    elif cur_cell:
        cur_cell.append(ln)
        if stripped == "</TableCell>":
            blocks.append((cur_comments, cur_cell))
            cur_comments, cur_cell = [], []
    else:
        # خطوط خالی یا میانی (بین کامنت‌ها) — به کامنت جاری بپیچ
        if stripped == "" and not cur_cell:
            continue
        cur_comments.append(ln)

assert not cur_cell and not cur_comments, f"leftover: {cur_comments} {cur_cell}"

# شناسایی هر بلوک با کلید یکتا
def block_key(cell_lines):
    body = "\n".join(cell_lines)
    probes = [
        ("rownum", "faNumber(i + 1)"),
        ("code", "r.propertyCode"),
        ("expert", "r.realtorName"),
        ("branch", "r.branch"),
        ("owner", "r.ownerName"),
        ("price", "r.price)"),
        ("ppm", "r.pricePerMeter"),
        ("address", "r.address"),
        ("ptype", "r.propertyTypeName"),
        ("meterage", "r.meterage"),
        ("rooms", "r.rooms"),
        ("floor", "r.floor"),
        ("build", "r.buildYear"),
        ("trade", "r.tradeTypeName"),
        ("activity", "r.createdAt"),
        ("deposit", "r.depositPrice"),
        ("views", "r.viewCount"),
        ("statusdate", "r.statusDate"),
        ("link", "r.publicUrl"),
    ]
    for key, probe in probes:
        if probe in body:
            # دقت: probe های کلی‌تر را از خاص‌تر جدا کن
            if key == "price" and "r.pricePerMeter" in body:
                continue
            if key == "build" and "r.buildingTypeName" in body:
                continue
            return key
    raise AssertionError("unknown cell block:\n" + body[:200])

by_key = {}
for comments, cell in blocks:
    k = block_key(cell)
    assert k not in by_key, f"duplicate {k}"
    by_key[k] = (comments, cell)

assert "activity" in by_key, "activity cell missing"

# شماره‌گذاری جدید (فارسی) به‌ترتیب ستون‌های تازه
NEW_ORDER = [
    ("rownum", "۱"),
    ("code", "۲"),
    ("expert", "۳"),
    ("branch", "۴"),
    ("ptype", "۵"),
    ("trade", "۶"),
    ("owner", "۷"),
    ("price", "۸"),
    ("ppm", "۸-ب"),
    ("deposit", "۹"),
    ("address", "۱۰"),
    ("meterage", "۱۰-ب"),
    ("rooms", "۱۰-پ"),
    ("floor", "۱۰-ت"),
    ("build", "۱۰-ث"),
    ("views", "۱۱"),
    ("link", "۱۲"),
    ("statusdate", "۱۳"),
]

def renumber(comment_lines, num):
    """نخستین شمارهٔ کامنت را با شمارهٔ تازه جایگزین می‌کند؛ بقیهٔ یادداشت‌ها می‌مانند."""
    out = []
    replaced = False
    for ln in comment_lines:
        if not replaced and ln.strip().startswith("{/*"):
            # الگوی «{/* X — ...» — X را با num عوض کن
            m = re.match(r"^(\s*\{\*/\s*)([^\s—–]+)(\s*[—–-]\s*)(.*)$", ln)
            if m:
                out.append(f"{m.group(1)}{num}{m.group(3)}{m.group(4)}")
                replaced = True
                continue
        out.append(ln)
    return out

parts = [head]
for key, num in NEW_ORDER:
    comments, cell = by_key[key]
    parts.append("\n".join(renumber(comments, num)))
    parts.append("\n".join(cell))

new_row = "\n".join(parts) + "\n"
s = s[:row_start] + new_row + s[row_end:]

open(P, "w", encoding="utf-8").write(s)
print("M1 table reordered: 18 columns, activity removed")
print("blocks found:", [block_key(c) for _, c in blocks])
