#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PN-028/خامساً-پ — جابه‌جایی سلول‌های بدنهٔ M2: سند/نوع ساخت/جهت قبل از فوریت"""
import io, re

P = "/home/z/my-project/src/core/tiles/tiles/arm-request/ArmRequestsPage.tsx"
s = io.open(P, encoding="utf-8").read()

# ۱) سه بلوک سلول سند/نوع ساخت/جهت را بیابیم (از «۱۵ — سند» تا پایان «۱۷ — جهت»)
m_sanad = s.find("/* ۱۵ — سند")
m_side_end = s.find("</TableCell>", s.find("/* ۱۷ — جهت"))
assert m_sanad > 0 and m_side_end > m_sanad, "blocks not found"
block_end = m_side_end + len("</TableCell>")
block = s[m_sanad:block_end]
assert "SideFileCell" in block and "constructTypeNames" in block and "sanadNames" in block, "wrong block"
s = s[:m_sanad] + s[block_end:]

# ۲) درج همان بلوک پیش از بلوک فوریت
anchor = "/* P6547/گام دوم — فوریت + جدیت"
i = s.find(anchor)
assert i > 0, "urgency anchor not found"
s = s[:i] + block + "\n                        " + s[i:]

# ۳) شماره‌گذاری کامنت‌ها را اصلاح کنیم (ترتیب منطقی تازه: ۱۰=سند، ۱۱=نوع ساخت، ۱۲=جهت، ۱۳=فوریت…)
ren = [
    ("/* ۱۵ — سند", "/* ۱۰ — سند"),
    ("/* ۱۶ — نوع ساخت", "/* ۱۱ — نوع ساخت"),
    ("/* ۱۷ — جهت", "/* ۱۲ — جهت"),
    ("/* ۱۱ — متراژ", "/* ۱۴ — متراژ"),
    ("/* ۱۲ — اتاق", "/* ۱۵ — اتاق"),
    ("/* ۱۳ — طبقه", "/* ۱۶ — طبقه"),
    ("/* ۱۴ — سال ساخت", "/* ۱۷ — سال ساخت"),
    ("/* ۱۸ — معاوضه", "/* ۱۸ — معاوضه"),
]
for a, b in ren:
    s = s.replace(a, b, 1)

io.open(P, "w", encoding="utf-8").write(s)
print("OK — M2 body cells reordered (سند/نوع ساخت/جهت قبل از فوریت)")
