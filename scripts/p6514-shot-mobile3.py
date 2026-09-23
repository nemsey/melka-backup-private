#!/usr/bin/env python3
"""p6514 — نمای موبایل (بدون ری‌لانچ مرورگر — حفظ device emulation)"""
import subprocess, time, re
SHOT = "/home/z/my-project/download/p6514-m3"
def ab(*args, timeout=60):
    r = subprocess.run(["agent-browser"] + list(args), capture_output=True, text=True, timeout=timeout)
    return (r.stdout or r.stderr).strip()
print("width:", ab("eval", "window.innerWidth"))
time.sleep(2)
snap = ab("snapshot", "--name", "m-auth")
ref = None
for line in snap.split("\n"):
    if "ورود با کد مدیر" in line and "button" in line:
        m = re.search(r"\[ref=(e\d+)\]", line)
        if m: ref = m.group(1); break
if ref:
    print(ab("click", f"@{ref}"))
    time.sleep(1)
    print(ab("fill", "#masterCode", "41372895"))
    print(ab("click", 'button[type="submit"]'))
    time.sleep(6)
snap = ab("snapshot", "--name", "m-home")
for line in snap.split("\n"):
    if "داشبورد مدیریتی" in line and "button" in line:
        m = re.search(r"\[ref=(e\d+)\]", line)
        if m: print(ab("click", f"@{m.group(1)}")); break
time.sleep(4)
snap = ab("snapshot", "--name", "m-mgmt")
for line in snap.split("\n"):
    if "معاملات ملک تبریز" in line and "button" in line:
        m = re.search(r"\[ref=(e\d+)\]", line)
        if m: print(ab("click", f"@{m.group(1)}")); break
time.sleep(7)
print("06-mobile-top →", ab("screenshot", "--full", f"{SHOT}/06-mobile-top.png"))
print(ab("eval", "document.getElementById('m3-filters-card')?.scrollIntoView({block:'center'})"))
time.sleep(1)
print("07-mobile-filters →", ab("screenshot", "--full", f"{SHOT}/07-mobile-filters.png"))
# جمع‌کردن فیلترها با دکمه «بستن»
snap = ab("snapshot", "--name", "m-filters")
for line in snap.split("\n"):
    if ("بستن" in line or "باز کردن" in line) and "button" in line:
        m = re.search(r"\[ref=(e\d+)\]", line)
        if m:
            print("toggle found:", line.strip()[:60])
            print(ab("click", f"@{m.group(1)}"))
            time.sleep(1.5)
            print("08-mobile-filters-collapsed →", ab("screenshot", "--full", f"{SHOT}/08-mobile-filters-collapsed.png"))
            break
print("DONE")
