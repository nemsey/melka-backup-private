#!/usr/bin/env python3
# DIR-CHANGES-TILE-002 · E2E واقعی مرورگر — کاشی «تغییرات» نسل ۲
# ۱) ورود ۲) کارت کاشی ۳) ساختار تازه: کدآگهی {تغییر،حذف} + کددرخواست {تغییر،حذف}
# ۴) خواندن وضعیت کدآگهی 57810 (زنده — فقط-خواندن: مالک + رویدادها + لنگر)
# ۵) خواندن وضعیت کد درخواست 55920 (زنده — تاریخچه با تاریخ شاهکار ۰۹۹)
# ۶) پیش‌نمایش آبشار در UI (بدون اعمال — محاسبهٔ سمت کلاینت با همان توابع سرور)
# ۷) تب حذف (نمایش آثار — بدون حذف واقعی) ۸) صفر خطای کنسول + اسکرین‌شات‌ها
import json, subprocess, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://localhost:3000"
OUT = Path("/home/z/my-project/download/dir-changes-tile-002")
OUT.mkdir(parents=True, exist_ok=True)

code = subprocess.run(["bash", "-c", "grep '^MASTER_ACCESS_CODE=' /home/z/my-project/.env.local | cut -d= -f2"],
                      capture_output=True, text=True).stdout.strip()
if not code:
    print(json.dumps({"error": "no-master-code"}, ensure_ascii=False)); sys.exit(2)

out = {"steps": [], "errors": [], "consoleErrors": []}

def step(k, ok, detail=""):
    out["steps"].append({"key": k, "ok": ok, "detail": detail})
    print(("OK  " if ok else "FAIL"), k, "--", detail)

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1.5, service_workers="block")
    page = ctx.new_page()
    page.on("console", lambda m: out["consoleErrors"].append(m.text) if m.type == "error" else None)

    # ── ورود ──
    page.goto(BASE, wait_until="load")
    page.wait_for_timeout(2500)
    try:
        page.wait_for_selector('button[aria-label="باز کردن کاشی تغییرات"]', timeout=8000)
        step("login", True, "نشست ذخیره‌شده")
    except Exception:
        page.wait_for_selector("input", timeout=20000)
        page.wait_for_timeout(1000)
        try: page.click("text=ورود با کد مدیر", timeout=6000)
        except Exception: pass
        page.fill("#masterCode", code)
        page.click("button[type=submit]", timeout=8000)
        page.wait_for_selector('button[aria-label="باز کردن کاشی تغییرات"]', timeout=25000)
        page.wait_for_timeout(2000)
        step("login", True, "لاگین تازه")

    # ── ۱) کارت کاشی روی هوم ──
    try:
        card = page.locator('button[aria-label="باز کردن کاشی تغییرات"]').first
        card.wait_for(timeout=10000)
        step("home-card", True, "کارت کاشی «تغییرات» روی هوم")
        page.screenshot(path=str(OUT / "01-home-changes-card.png"))
        card.click(timeout=10000)
        page.wait_for_timeout(2500)
    except Exception as e:
        step("home-card", False, str(e)[:140])

    # ── ۲) ساختار تازه: دو بخش با تغییر/حذف ──
    try:
        page.wait_for_selector('div[data-tile-page="changes"]', timeout=10000)
        body = page.locator("body").inner_text()
        ok_struct = ("کدآگهی — تغییر · حذف" in body) and ("کددرخواست — تغییر · حذف" in body)
        old_gone = "ثبت جدید" not in body and "ثبت رویداد" not in body
        step("structure", ok_struct and old_gone,
             f"دو بخش تغییر/حذف {'✓' if ok_struct else '✗'} · حذف بخش‌های قدیمی (ثبت جدید/ثبت رویداد) {'✓' if old_gone else '✗'}")
        page.screenshot(path=str(OUT / "02-changes-page-v2.png"))
    except Exception as e:
        step("structure", False, str(e)[:140])

    # ── ۳) کدآگهی — خواندن وضعیت 57810 (زنده) ──
    try:
        # تب کدآگهی پیش‌فرض است — فرم تغییر
        page.wait_for_selector('input[placeholder="کدآگهی…"]', timeout=8000)
        page.fill('input[placeholder="کدآگهی…"]', "57810")
        page.click('button:has-text("خواندن وضعیت")', timeout=8000)
        page.wait_for_selector("text=زندهٔ ARM", timeout=120000)
        page.wait_for_timeout(1500)
        body = page.locator("body").inner_text()
        ok_anchor = "1405/06/02" in body and "18:45" in body  # لنگر ایجاد مشاور عین اسکرین‌شات مالک
        ok_owner = "هادی سیه رود" in body  # مالک فعلی آگهی 57810
        ok_events = "4 رویداد" in body  # تاریخچهٔ رویداد و بازخورد — عین اسکرین‌شات دوم مالک
        step("listing-lookup", ok_anchor and ok_owner and ok_events,
             f"لنگر ۱۴۰۵/۰۶/۰۲ ۱۸:۴۵ {'✓' if ok_anchor else '✗'} · مالک «هادی سیه رود» {'✓' if ok_owner else '✗'} · ۴ رویداد {'✓' if ok_events else '✗'}")
        page.screenshot(path=str(OUT / "03-listing-57810-lookup.png"))
    except Exception as e:
        step("listing-lookup", False, str(e)[:160])

    # ── ۴) پیش‌نمایش آبشار (مثال مالک: 1405/07/05) — بدون اعمال ──
    try:
        page.fill('input[placeholder="1405/07/05"]', "1405/07/05")
        page.wait_for_timeout(900)
        # پیش‌نمایش پایین صفحه است — اسکرول تا دیده شود
        try:
            page.locator("text=پیش‌نمایش آبشار").scroll_into_view_if_needed(timeout=4000)
        except Exception:
            pass
        page.wait_for_timeout(400)
        body = page.locator("body").inner_text()
        ok_delta = "+34 روز" in body
        ok_target = "18:45 | 1405/07/05" in body  # هدف = همان ساعت لنگر در تاریخ جدید
        ok_event_shift = "1405/09/26" in body  # نخستین رویداد (۱۴۰۵/۰۸/۲۲ ۱۵:۰۷) +۳۴ روز → ۱۴۰۵/۰۹/۲۶
        step("cascade-preview", ok_delta and ok_target and ok_event_shift,
             f"Δ +34 روز {'✓' if ok_delta else '✗'} · هدف 18:45|1405/07/05 {'✓' if ok_target else '✗'} · جابه‌جایی رویداد ← 1405/09/26 {'✓' if ok_event_shift else '✗'} (پیش‌نمایش — اعمال نشد)")
        page.screenshot(path=str(OUT / "04-cascade-preview.png"))
    except Exception as e:
        step("cascade-preview", False, str(e)[:160])

    # ── ۵) کددرخواست — خواندن وضعیت 55920 (زنده — تاریخ شاهکار ۰۹۹) ──
    try:
        page.click('button[role="tab"]:has-text("کددرخواست")', timeout=8000)
        page.wait_for_timeout(1200)
        page.wait_for_selector('input[placeholder="کد درخواست…"]', timeout=8000)
        page.fill('input[placeholder="کد درخواست…"]', "55920")
        page.click('button:has-text("خواندن وضعیت")', timeout=8000)
        page.wait_for_selector("text=زندهٔ ARM", timeout=120000)
        page.wait_for_timeout(1500)
        body = page.locator("body").inner_text()
        ok_hist = "ایجاد مشاور" in body and "17:30 | 1405/08/20" in body  # تاریخ شاهکار ۰۹۹ هنوز زنده
        step("request-lookup", ok_hist, f"تاریخچهٔ 55920 با تاریخ شاهکار ۱۷:۳۰|۱۴۰۵/۰۸/۲۰ {'✓' if ok_hist else '✗'}")
        page.screenshot(path=str(OUT / "05-request-55920-lookup.png"))
    except Exception as e:
        step("request-lookup", False, str(e)[:160])

    # ── ۶) تب حذف (نمایش آثار — بدون حذف) ──
    try:
        page.click('button[role="tab"]:has-text("حذف کد")', timeout=8000)
        page.wait_for_timeout(1000)
        page.wait_for_selector('input[placeholder="کد درخواست…"]', timeout=8000)
        page.fill('input[placeholder="کد درخواست…"]', "55920")
        page.click('button:has-text("بررسی آثار")', timeout=8000)
        page.wait_for_selector("text=اثر محلی قابل حذف", timeout=120000)
        page.wait_for_timeout(1000)
        body = page.locator("body").inner_text()
        ok_traces = "رکورد درخواست" in body
        step("delete-tab", ok_traces, f"نمایش آثار قابل حذف پیش از حذف {'✓' if ok_traces else '✗'} (حذف واقعی انجام نشد)")
        page.screenshot(path=str(OUT / "06-delete-preview.png"))
    except Exception as e:
        step("delete-tab", False, str(e)[:160])

    browser.close()

out["ok"] = all(s["ok"] for s in out["steps"]) and len(out["consoleErrors"]) == 0
out["consoleErrorCount"] = len(out["consoleErrors"])
(OUT / "e2e-result.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
print(json.dumps({"ok": out["ok"], "steps": len(out["steps"]), "consoleErrors": len(out["consoleErrors"])}, ensure_ascii=False))
sys.exit(0 if out["ok"] else 1)
