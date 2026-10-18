#!/usr/bin/env python3
"""p6514-shot.py — BLOCK E شاهدهای بصری کاشی M3 (ملکا-شورا-۱۴۰۵-۰۱۷)
ورود کد مستر → داشبورد مدیریتی → کاشی معاملات → اسکرین‌شات دسکتاپ + موبایل.
"""
import subprocess, time, os

BASE = "http://localhost:3000"
SHOT = "/home/z/my-project/download/p6514-m3"
os.makedirs(SHOT, exist_ok=True)

def ab(*args, timeout=150):
    r = subprocess.run(["agent-browser"] + list(args), capture_output=True, text=True, timeout=timeout)
    return (r.stdout or r.stderr).strip()

def shot(name, extra=()):
    print(name, "→", ab("screenshot", "--full", f"{SHOT}/{name}.png", *extra))

# ---- ۱) ورود مدیر ----
print(ab("open", BASE))
time.sleep(4)
snap = ab("snapshot", "--name", "auth")
# پیدا کردن ref دکمه «ورود با کد مدیر (مالک سامانه)»
import re
m = re.search(r'\[ref=(e\d+)\][^\n]*$', snap.split("ورود با کد مدیر")[0].rstrip().split("\n")[-1] + "]")
# ساده‌تر: خط دکمه را پیدا کن
ref = None
for line in snap.split("\n"):
    if "ورود با کد مدیر" in line and "button" in line:
        ref = re.search(r"\[ref=(e\d+)\]", line)
        if ref: ref = ref.group(1); break
print("toggle ref:", ref)
print(ab("click", f"@{ref}"))
time.sleep(1)
print(ab("fill", "#masterCode", "00000000"))
print(ab("click", 'button[type="submit"]'))
time.sleep(6)

# ---- ۲) صفحه خانه → داشبورد مدیریتی ----
snap = ab("snapshot", "--name", "home")
for line in snap.split("\n"):
    if "داشبورد مدیریتی" in line and "button" in line:
        ref = re.search(r"\[ref=(e\d+)\]", line)
        if ref:
            print(ab("click", f"@{ref.group(1)}"))
            break
time.sleep(4)
shot("01-mgmt-dashboard")

# ---- ۳) کاشی معاملات (M3) ----
snap = ab("snapshot", "--name", "mgmt")
for line in snap.split("\n"):
    if "معاملات ملک تبریز" in line and "button" in line:
        ref = re.search(r"\[ref=(e\d+)\]", line)
        if ref:
            print(ab("click", f"@{ref.group(1)}"))
            break
time.sleep(6)
shot("02-m3-transactions-top")
# اسکرول به فیلترها (باید فوراً بالای فهرست باشند)
print(ab("eval", "document.getElementById('m3-filters-card')?.scrollIntoView({block:'center'})"))
time.sleep(1)
shot("03-m3-filters-above-list")
# اسکرول به جدول — هدر ستون‌ها (تجمیع قبل از هولوگرام)
print(ab("eval", "document.querySelector('table')?.scrollIntoView({block:'start'})"))
time.sleep(1)
shot("04-m3-table-header-order")
# بینش ایجنت — اسکرول به بالا + AgentPanel
print(ab("eval", "window.scrollTo(0,0)"))
time.sleep(1)
shot("05-m3-insights-top")

print("DONE")
