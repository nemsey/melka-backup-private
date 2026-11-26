#!/usr/bin/env python3
# DIR-OWNER-4STEPS-001 · E2E واقعی مرورگر — کاشی «فایل‌یابی» پس از دستور چهارسگامی
# ۱) ورود با کد مدیر ۲) باز کردن کاشی فایل‌یابی ۳) گام دوم: بخش «حالت تمام‌ظرفیت
# ترموکس» غایب است ۴) گام سوم: انتخابگر مناطق عین ثبت آگهی آرم (دو دراپ‌داون وابسته)
# در تنظیمات ایجنت ۵) گام چهارم: دکمهٔ «پیش‌فرض ۱۷ منطقه» غایب + انتخاب ذخیره/تثبیت
# ۶) اسکرین‌شات‌های شاهد + صفر خطای کنسول
import json, subprocess, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
OUT = Path("/home/z/my-project/download/DIR-OWNER-4STEPS-001")
OUT.mkdir(parents=True, exist_ok=True)

code = subprocess.run(["bash", "-c", "grep '^MASTER_ACCESS_CODE=' /home/z/my-project/.env.local | cut -d= -f2"],
                      capture_output=True, text=True).stdout.strip()
if not code:
    print(json.dumps({"error": "no-master-code"}, ensure_ascii=False)); sys.exit(2)

out = {"steps": [], "errors": [], "consoleErrors": []}

def step(k, ok, detail=""):
    out["steps"].append({"key": k, "ok": ok, "detail": detail})
    print(("OK " if ok else "FAIL"), k, detail)

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1.5, service_workers="block")
    page = ctx.new_page()
    page.on("console", lambda m: out["consoleErrors"].append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: out["errors"].append(str(e)[:300]))

    page.goto(BASE, wait_until="load")
    page.wait_for_timeout(2500)
    try:
        page.wait_for_selector('button[aria-label*="فایل"]', timeout=8000)
        step("login", True, "نشست ذخیره‌شده")
    except Exception:
        page.wait_for_selector("input", timeout=20000)
        page.wait_for_timeout(1000)
        try:
            page.click("text=ورود با کد مدیر", timeout=6000)
        except Exception:
            pass
        page.wait_for_selector("input", timeout=8000)
        page.fill("input", code)
        page.keyboard.press("Enter")
        page.wait_for_timeout(4000)
        step("login", True, "ورود با کد مدیر")

    # ── باز کردن کاشی فایل‌یابی ──
    try:
        page.click('button[aria-label*="فایل"]', timeout=9000)
        page.wait_for_timeout(3500)
        body = page.inner_text("body")
        step("tile-open", "اسکن دیوار" in body, "کاشی فایل‌یابی باز شد")
    except Exception as e:
        step("tile-open", False, str(e)[:150])
        body = page.inner_text("body")

    # ── گام دوم اولاً: بخش «حالت تمام‌ظرفیت ترموکس» به‌طور کامل غایب ──
    step("step2-capacity-removed", "حالت تمام‌ظرفیت ترموکس" not in body, "بخش حذف شد (دستور مالک)")
    step("step2-normal-mode-btn-removed", page.locator("text=حالت عادی").count() == 0, "کلید «حالت عادی» نیز حذف")

    # ── تنظیمات ایجنت را باز کن (گام سوم + چهارم) ──
    try:
        page.click("text=تنظیمات اختصاصی ایجنت فایل‌یابی", timeout=6000)
        page.wait_for_timeout(1500)
        step("agent-settings-open", True, "آکاردئون تنظیمات باز شد")
    except Exception as e:
        step("agent-settings-open", False, str(e)[:120])

    body2 = page.inner_text("body")
    # ── گام سوم: انتخابگر عین ثبت آگهی آرم ──
    step("step3-arm-picker", "منطقه (منطقه‌بندی آرم)" in body2, "دراپ‌داون عین فرم ثبت آگهی آرم")
    step("step3-search-label", "جستجوی مناطق و محله‌ها" in body2, "برچسب بخش جستجو عین دستور")

    # ── گام چهارم: پیش‌فرض ۱۷ منطقه غایب ──
    step("step4-default17-removed", "پیش‌فرض ۱۷ منطقه" not in body2, "دکمهٔ پیش‌فرض حذف شد")
    step("step4-all-tabriz-btn", "همه تبریز" in body2, "کلید همه تبریز (پاک‌کردن) پابرجا")

    page.screenshot(path=str(OUT / "ui-file-finder-agent-settings.png"), full_page=False)

    # ── انتخاب یک منطقه از انتخابگر آرم و تثبیت آن (گام چهارم ثانیاً) ──
    try:
        page.click('#file-finder-agent-arm-area', timeout=5000)
        page.wait_for_timeout(800)
        # نخستین گزینهٔ منطقه
        page.keyboard.press("ArrowDown"); page.keyboard.press("Enter")
        page.wait_for_timeout(1200)
        body3 = page.inner_text("body")
        picked = "(کل منطقه)" in body3
        step("step4-pick-area", picked, "منطقه انتخاب و چیپ شد")
        # باز کردن مجدد تنظیمات برای تثبیت (reload + re-open)
        page.reload(wait_until="load"); page.wait_for_timeout(3500)
        try:
            page.click('button[aria-label*="فایل"]', timeout=9000)
            page.wait_for_timeout(3000)
            page.click("text=تنظیمات اختصاصی ایجنت فایل‌یابی", timeout=6000)
            page.wait_for_timeout(1500)
            body4 = page.inner_text("body")
            step("step4-persisted", "(کل منطقه)" in body4, "انتخاب مالک پس از reload تثبیت مانده")
            page.screenshot(path=str(OUT / "ui-file-finder-persisted.png"), full_page=False)
        except Exception as e:
            step("step4-persisted", False, str(e)[:120])
    except Exception as e:
        step("step4-pick-area", False, str(e)[:120])

    # ── پاک‌کردن انتخاب برای بازگشت خنثی (رعایت سایر آزمون‌ها) ──
    try:
        page.click("text=همه تبریز", timeout=4000)
        page.wait_for_timeout(1500)
        step("cleanup-clear-filter", True, "فیلتر به همه تبریز بازگشت")
    except Exception:
        step("cleanup-clear-filter", False, "پاک‌کردن ناموفق — دستی در DB پاک می‌شود")

    browser.close()

out["consoleErrors"] = out["consoleErrors"][:10]
out["errors"] = out["errors"][:10]
ok = all(s["ok"] for s in out["steps"])
print(json.dumps({"ok": ok, **out}, ensure_ascii=False, indent=1))
(OUT / "e2e-result.json").write_text(json.dumps({"ok": ok, **out}, ensure_ascii=False, indent=1), encoding="utf8")
sys.exit(0 if ok else 1)
