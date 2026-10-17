#!/usr/bin/env python3
# PN-014 — شواهد بصری کاشی تطبیق ارتقایافته (جست‌وجوی هوشمند + بندبندی + تحلیل)
import json, subprocess, sys
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
code = subprocess.run(["bash","-c","grep '^MASTER_ACCESS_CODE=' /home/z/my-project/.env.local | cut -d= -f2"],
                      capture_output=True, text=True).stdout.strip()
out = {"shots": [], "errors": []}

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width":390,"height":844}, is_mobile=True, has_touch=True,
        user_agent="Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36",
        device_scale_factor=2, service_workers="block")
    page = ctx.new_page()
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(BASE, wait_until="load")
    page.wait_for_selector("input", timeout=20000)
    page.wait_for_timeout(1500)
    try: page.click("text=ورود با کد مدیر", timeout=6000)
    except Exception: pass
    page.fill("#masterCode", code)
    page.click("button[type=submit]", timeout=8000)
    try:
        page.wait_for_selector("text=داشبورد مدیریتی", timeout=20000)
    except Exception:
        print(json.dumps({"error": "no-dashboard"}, ensure_ascii=False)); browser.close(); sys.exit(2)
    page.wait_for_timeout(2500)

    # ۱) داشبورد مدیریتی → کاشی تطبیق
    try:
        page.locator("button", has_text="داشبورد مدیریتی").last.click(timeout=10000)
        page.wait_for_timeout(1200)
        page.locator("button", has_text="تطبیق هوشمند").last.click(timeout=10000)
        page.wait_for_selector("text=تطبیق هوشمند ملک تبریز", timeout=15000)
        page.wait_for_timeout(1200)
        page.screenshot(path="download/pn014/screens/01-matching-tile-entry.png", full_page=False)
        out["shots"].append("01-matching-tile-entry.png")
    except Exception as e:
        out["errors"].append("entry: " + str(e)[:140])

    # ۲) جست‌وجوی هوشمند — یک منطقهٔ واقعی؛ نتایج پیشنهادی باید ظاهر شود
    try:
        # ابتدا در تب «آگهی ← درخواست» یک عبارت آزاد بزنیم (نه کد)
        page.fill("input[aria-label='جست‌وجوی هوشمند ملک']", "ولیعصر")
        page.wait_for_timeout(1400)  # debounce + سرور
        page.screenshot(path="download/pn014/screens/02-smart-search-suggestions.png", full_page=False)
        out["shots"].append("02-smart-search-suggestions.png")
    except Exception as e:
        out["errors"].append("search: " + str(e)[:140])

    # ۳) انتخاب نخستین نتیجهٔ پیشنهادی (کد واقعی) → اجرای تطبیق + بندبندی
    try:
        # نخستین ردیف فهرست نتایج جست‌وجو (role=listbox) — دکمهٔ «اجرا»
        rows = page.locator("[role=listbox] button")
        if rows.count() > 0:
            rows.first.click(timeout=8000)
        else:
            # جایگزین: کد مستقیم از دیتای زنده
            page.fill("input[aria-label='جست‌وجوی هوشمند ملک']", "")
            page.fill("input[aria-label='جست‌وجوی هوشمند ملک']", "59115")
            page.click("text=جستجوی تطبیق", timeout=8000)
        page.wait_for_timeout(3500)  # موتور تطبیق + غنی‌سازی
        page.screenshot(path="download/pn014/screens/03-match-results-buckets.png", full_page=True)
        out["shots"].append("03-match-results-buckets.png")
    except Exception as e:
        out["errors"].append("run: " + str(e)[:140])

    # ۴) جزئیات تحلیل — گفت‌وگوی تحلیل هوشمند امتیازدهی + پیش‌بینی رد
    try:
        page.click("text=جزئیات تحلیل", timeout=8000)
        page.wait_for_selector("text=تحلیل هوشمند امتیازدهی", timeout=12000)
        page.wait_for_timeout(900)
        page.screenshot(path="download/pn014/screens/04-details-analysis-top.png", full_page=False)
        # اسکرول به بخش پیش‌بینی رد
        page.locator("text=پیش‌بینی هوشمند دلایل احتمالی رد").scroll_into_view_if_needed(timeout=8000)
        page.wait_for_timeout(400)
        page.screenshot(path="download/pn014/screens/05-details-rejection-prediction.png", full_page=False)
        out["shots"].append("04-details-analysis-top.png")
        out["shots"].append("05-details-rejection-prediction.png")
    except Exception as e:
        out["errors"].append("details: " + str(e)[:140])

    # ۵) دسکتاپ — نمای کامل صفحه با کارت‌ها
    try:
        ctx2 = browser.new_context(viewport={"width":1440,"height":900}, service_workers="block")
        page2 = ctx2.new_page()
        page2.goto(BASE, wait_until="load")
        page2.wait_for_selector("input", timeout=20000)
        try: page2.click("text=ورود با کد مدیر", timeout=6000)
        except Exception: pass
        page2.fill("#masterCode", code)
        page2.click("button[type=submit]", timeout=8000)
        page2.wait_for_selector("text=داشبورد مدیریتی", timeout=20000)
        page2.wait_for_timeout(2000)
        page2.locator("button", has_text="داشبورد مدیریتی").last.click(timeout=10000)
        page2.wait_for_timeout(1000)
        page2.locator("button", has_text="تطبیق هوشمند").last.click(timeout=10000)
        page2.wait_for_selector("text=تطبیق هوشمند ملک تبریز", timeout=15000)
        page2.wait_for_timeout(1000)
        page2.screenshot(path="download/pn014/screens/06-matching-desktop.png", full_page=False)
        out["shots"].append("06-matching-desktop.png")
    except Exception as e:
        out["errors"].append("desktop: " + str(e)[:140])

    out["consoleErrors"] = len(errors)
    out["consoleSample"] = errors[:5]
    browser.close()

json.dump(out, open("download/pn014/screens/shots.json","w"), ensure_ascii=False, indent=1)
print(json.dumps(out, ensure_ascii=False))
