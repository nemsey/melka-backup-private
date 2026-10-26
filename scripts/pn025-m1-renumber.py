# -*- coding: utf-8 -*-
# اصلاح شماره‌های کامنت سلول‌های M1 پس از بازچینی (ترتیب جدید جلسهٔ ۰۳۳)
import re

P = "src/core/tiles/tiles/arm-listing/ArmListingsPage.tsx"
s = open(P, encoding="utf-8").read()

row_start = s.index("<TableRow key={r.id}>")
row_end = s.index("</TableRow>", row_start)
row_text = s[row_start:row_end]

lines = row_text.split("\n")

# شماره‌های تازه به‌ترتیب ظهور سلول‌ها
NUMS = ["۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۸-ب", "۹", "۱۰", "۱۰-ب", "۱۰-پ", "۱۰-ت", "۱۰-ث", "۱۱", "۱۲", "۱۳"]

out = []
cell_idx = -1
in_cell = False
fixed_in_cell = False
for ln in lines:
    st = ln.strip()
    if st.startswith("<TableCell"):
        in_cell = True
        fixed_in_cell = False
        cell_idx += 1
        out.append(ln)
        continue
    if in_cell and not fixed_in_cell and st.startswith("{/*") and cell_idx < len(NUMS):
        m = re.match(r"^(\s*\{/\*\s*)(\S+)(\s*[—–-]\s*)(.*)$", ln)
        if m:
            out.append(f"{m.group(1)}{NUMS[cell_idx]}{m.group(3)}{m.group(4)}")
            fixed_in_cell = True
            continue
    out.append(ln)

new_row = "\n".join(out)
s = s[:row_start] + new_row + s[row_end:]
open(P, "w", encoding="utf-8").write(s)
print(f"renumbered {cell_idx + 1} cells")
