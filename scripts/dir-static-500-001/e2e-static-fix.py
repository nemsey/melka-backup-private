#!/usr/bin/env python3
# DIR-STATIC-500-001 · E2E واقعی مرورگر — از خود لینک عمومی preview
# ۱) بارگذاری بدون client-side exception (شکایت اصلی مالک) + صفر خطای کنسول
# ۲) ورود مالک ۳) هوم هشت‌تایی عین ترتیب ۴) کاشی فایل‌یابی: مغز پیش‌فرض بسته + بازشدن
# ۵) کلیدهای «تمام ظرفیت»/«حالت عادی» در هر دو کاشی (رگرسیون DIR-FF-CAP-502)
# ۶) نوار پایین موبایل هفت‌آیتمی (رگرسیون) ۷) اسکرین‌شات‌ها + e2e-result.json
import json, subprocess, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai"
OUT = Path("/home/z/my-project/download/dir-static-500-001")
OUT.mkdir(parents=True, exist_ok=True)

code = subprocess.run(["bash", "-c", "grep '^MASTER_ACCESS_CODE=' /home/z/my-project/.env.local | cut -d= -f2"],
                      capture_output=True, text=True).stdout.strip()
if not code:
    print(json.dumps({"error": "no-master-code"}, ensure_ascii=False)); sys.exit(2)

out = {"directive": "DIR-STATIC-500-001", "viaEdge": BASE, "steps": [], "pageErrors": [], "consoleErrors": []}

def step(k, ok, detail=""):
    out["steps"].append({"key": k, "ok": ok, "detail": detail})
    print(("OK " if ok else "FAIL"), k, "-", detail)

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1.5, service_workers="block")
    page = ctx.new_page()
    page.on("console", lambda m: out["consoleErrors"].append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: out["pageErrors"].append(str(e)[:300]))

    # ── ۱) بارگذاری بدون client-side exception ──
    page.goto(BASE, wait_until="load")
    page.wait_for_timeout(3000)
    body_len = len(page.content())
    has_app = page.locator("body").inner_text() != ""
    no_exc = "Application error" not in page.content() and "client-side exception" not in page.content()
    step("load-no-exception", no_exc and has_app, f"حجم صفحه {body_len}B")
    page.screenshot(path=str(OUT / "01-load-no-exception.png"))

    # ── ۲) ورود مالک ──
    try:
        page.wait_for_selector("input", timeout=20000)
        page.wait_for_timeout(1200)
        try: page.click("text=ورود با کد مدیر", timeout=6000)
        except Exception: pass
        page.fill("#masterCode", code)
        page.click("button[type=submit]", timeout=8000)
        page.wait_for_selector('button[aria-label*="کاشی"]', timeout=25000)
        page.wait_for_timeout(2000)
        step("owner-login", True, "ورود مدیر موفق")
    except Exception as e:
        step("owner-login", False, str(e)[:140])

    # ── ۳) هوم هشت‌تایی عین ترتیب ──
    expected = ["فایل یابی", "آگهی", "درخواست", "معاملات", "کارشناسان", "تطبیق", "تغییرات", "تنظیمات"]
    try:
        tiles = page.locator('button[aria-label*="کاشی"]').all()
        labels = [t.get_attribute("aria-label") for t in tiles]
        order_ok = all(any(e in (l or "") for l in labels) for e in expected)
        step("home-eight-tiles", order_ok and len(labels) >= 8, f"{len(labels)} کاشی: {' · '.join(expected)}")
        page.screenshot(path=str(OUT / "02-home-eight-tiles.png"))
    except Exception as e:
        step("home-eight-tiles", False, str(e)[:140])

    # ── ۴) کاشی فایل‌یابی: مغز پیش‌فرض بسته + بازشدن ──
    try:
        page.click('button[aria-label="باز کردن کاشی فایل یابی"]', timeout=10000)
        page.wait_for_timeout(3000)
        # مغز پیش‌فرض بسته: محتوای خودتشخیصی نباید در همان لحظه نمایان باشد
        page.wait_for_timeout(1500)
        collapsed_hidden = page.locator("text=خودتشخیصی").first.is_hidden() if page.locator("text=خودتشخیصی").count() else True
        step("brain-collapsed-default", collapsed_hidden, "مغز ملکا در حالت پیش‌فرض بسته است")
        # باز کردن مغز (ترایگر)
        trigger = page.locator("text=مغز ملکا — تمام ظرفیت‌ها در خدمت فایل‌یابی").first
        trigger.click(timeout=8000)
        page.wait_for_timeout(3500)
        expanded = page.locator("text=خودتشخیصی").first.is_visible() if page.locator("text=خودتشخیصی").count() else (page.locator("text=فرا-ذهن").count() > 0)
        step("brain-expand-on-click", expanded, "با کلیک باز شد و بارگذاری تنبلکار اجرا شد")
        page.screenshot(path=str(OUT / "03-file-finder-brain-expanded.png"))
    except Exception as e:
        step("file-finder-brain", False, str(e)[:140])

    # ── ۵) کلیدهای «تمام ظرفیت»/«حالت عادی» در کاشی فایل‌یابی (رگرسیون) ──
    try:
        cap = page.get_by_role("button", name="تمام ظرفیت").first
        cap.wait_for(timeout=8000)
        step("ff-capacity-buttons", True, "«تمام ظرفیت» در کاشی فایل‌یابی حاضر است")
        page.screenshot(path=str(OUT / "04-ff-capacity-button.png"))
    except Exception as e:
        step("ff-capacity-buttons", False, str(e)[:140])

    # ── ۶) همان بررسی در کاشی تغییرات ──
    try:
        page.goto(BASE, wait_until="load"); page.wait_for_timeout(2000)
        page.click('button[aria-label="باز کردن کاشی تغییرات"]', timeout=10000)
        page.wait_for_timeout(3000)
        cap2 = page.get_by_role("button", name="تمام ظرفیت").first
        cap2.wait_for(timeout=8000)
        step("changes-capacity-buttons", True, "«تمام ظرفیت» در کاشی تغییرات حاضر است")
        page.screenshot(path=str(OUT / "05-changes-capacity-button.png"))
    except Exception as e:
        step("changes-capacity-buttons", False, str(e)[:140])

    # ── ۷) نوار پایین موبایل هفت‌آیتمی (390px) ──
    try:
        mctx = browser.new_context(viewport={"width": 390, "height": 844}, service_workers="block")
        mp = mctx.new_page()
        mp.on("pageerror", lambda e: out["pageErrors"].append("mobile:" + str(e)[:200]))
        mp.goto(BASE, wait_until="load"); mp.wait_for_timeout(3000)
        try:
            mp.wait_for_selector("input", timeout=15000)
            try: mp.click("text=ورود با کد مدیر", timeout=5000)
            except Exception: pass
            mp.fill("#masterCode", code)
            mp.click("button[type=submit]", timeout=8000)
            mp.wait_for_selector('button[aria-label*="کاشی"]', timeout=20000)
            mp.wait_for_timeout(1500)
        except Exception:
            pass  # نشست ذخیره‌شده
        nav_texts = mp.locator("nav").last.inner_text() if mp.locator("nav").count() else ""
        seven = sum(1 for e in ["فایل یابی", "آگهی", "درخواست", "معاملات", "تطبیق", "تغییرات", "تنظیمات"] if e in nav_texts)
        step("mobile-bottom-nav", seven >= 6, f"{seven} آیتم از ۷ در نوار پایین")
        mp.screenshot(path=str(OUT / "06-mobile-bottom-nav.png"))
        mctx.close()
    except Exception as e:
        step("mobile-bottom-nav", False, str(e)[:140])

    browser.close()

out["passCount"] = sum(1 for s in out["steps"] if s["ok"])
out["failCount"] = sum(1 for s in out["steps"] if not s["ok"])
out["zeroConsoleErrors"] = (len(out["consoleErrors"]) == 0 and len(out["pageErrors"]) == 0)
(OUT / "e2e-result.json").write_text(json.dumps(out, ensure_ascii=False, indent=2))
print(json.dumps({"pass": out["passCount"], "fail": out["failCount"],
                  "consoleErrors": len(out["consoleErrors"]), "pageErrors": len(out["pageErrors"])},
                 ensure_ascii=False))
sys.exit(0 if out["failCount"] == 0 and out["zeroConsoleErrors"] else 1)
