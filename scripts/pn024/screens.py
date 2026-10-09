#!/usr/bin/env python3
# PN-024 · مراحل ۴ — ۲۲ اسکرین‌شات هویت نگین (۱۱ کاشی × ۲ تم: روشن + تیره)
# الگوی PN-014: ورود با کد مدیر → پیمایش کاشی‌ها → اسکرین‌شات صفحه (negin-bar + data-negin)
import json, subprocess, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
OUT = Path("/home/z/my-project/download/pn024/screens")
OUT.mkdir(parents=True, exist_ok=True)

code = subprocess.run(["bash", "-c", "grep '^MASTER_ACCESS_CODE=' /home/z/my-project/.env.local | cut -d= -f2"],
                      capture_output=True, text=True).stdout.strip()
if not code:
    print(json.dumps({"error": "no-master-code"}, ensure_ascii=False)); sys.exit(2)

# ۱۱ کاشی — (دکمهٔ ورودی، نام فایل، آیا درون داشبورد مدیریتی است)
TILES = [
    ("فایل یابی ملکا",              "01-finder",    False),
    ("آگهی ملکا",                   "02-listing",   False),
    ("درخواست ملکا",                "03-request",   False),
    ("آگهی ملک تبریز",              "04-m1",        True),
    ("درخواست ملک تبریز",           "05-m2",        True),
    ("معاملات ملک تبریز",           "06-m3",        True),
    ("کارشناسان ملک تبریز",         "07-m4",        True),
    ("تطبیق هوشمند ملک تبریز",      "08-m5",        True),
    ("مغز ملکا — یادگیری و Tier",   "09-m6",        True),
    ("شاخص بازار ملک تبریز",        "10-m7",        True),
    ("پوشش اطلاعات ملک تبریز",      "11-m8",        True),
]

out = {"shots": [], "errors": [], "themes": {}}

def open_tile(page, title, in_dashboard):
    page.goto(BASE, wait_until="load")
    page.wait_for_timeout(1800)
    if in_dashboard:
        page.locator("button", has_text="داشبورد مدیریتی").last.click(timeout=15000)
        page.wait_for_timeout(1600)
    page.locator(f'button[aria-label*="{title}"]',).first.click(timeout=15000)
    page.wait_for_timeout(2200)  # دادهٔ کاشی بار شود

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1.5, service_workers="block")
    page = ctx.new_page()
    console_errors = []
    page.on("console", lambda m: console_errors.append(m.text) if m.type == "error" else None)

    # ── ورود ──
    page.goto(BASE, wait_until="load")
    page.wait_for_selector("input", timeout=20000)
    page.wait_for_timeout(1500)
    try: page.click("text=ورود با کد مدیر", timeout=6000)
    except Exception: pass
    page.fill("#masterCode", code)
    page.click("button[type=submit]", timeout=8000)
    page.wait_for_selector("text=داشبورد مدیریتی", timeout=25000)
    page.wait_for_timeout(2200)
    out["login"] = "ok"

    # ── تم روشن: ۱۱ اسکرین‌شات ──
    for title, name, in_dash in TILES:
        try:
            open_tile(page, title, in_dash)
            path = OUT / f"{name}-light.png"
            page.screenshot(path=str(path), full_page=False)
            out["shots"].append(f"screens/{name}-light.png")
        except Exception as e:
            out["errors"].append(f"light/{name}: {str(e)[:120]}")

    # ── تغییر تم به تیره ──
    page.goto(BASE, wait_until="load"); page.wait_for_timeout(1800)
    page.locator('button[aria-label="تاریک کردن تم"]').first.click(timeout=10000)
    page.wait_for_timeout(1500)
    html_class = page.evaluate("document.documentElement.className")
    out["themes"]["darkApplied"] = "dark" in html_class

    # ── تم تیره: ۱۱ اسکرین‌شات ──
    for title, name, in_dash in TILES:
        try:
            open_tile(page, title, in_dash)
            path = OUT / f"{name}-dark.png"
            page.screenshot(path=str(path), full_page=False)
            out["shots"].append(f"screens/{name}-dark.png")
        except Exception as e:
            out["errors"].append(f"dark/{name}: {str(e)[:120]}")

    out["consoleErrorCount"] = len(console_errors)
    out["consoleErrorSample"] = console_errors[:5]
    browser.close()

out["count"] = len(out["shots"])
out["expected"] = 22
out["allCaptured"] = len(out["shots"]) == 22
Path("/home/z/my-project/download/pn024/negin-screens-raw.json").write_text(
    json.dumps(out, ensure_ascii=False, indent=2))
print(f"شات‌ها: {out['count']}/22 · خطاها: {len(out['errors'])} · دارک: {out['themes'].get('darkApplied')}")
if out["errors"]:
    for e in out["errors"][:5]: print("  ✗", e)
