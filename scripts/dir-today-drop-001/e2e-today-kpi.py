#!/usr/bin/env python3
# DIR-TODAY-DROP-001 · E2E واقعی مرورگر — از خود لینک عمومی preview
# ۱) بارگذاری بدون client-side exception + صفر خطای کنسول
# ۲) ورود مالک
# ۳) M1: KPI «آگهی امروز» + زیرنویس «از نیمه‌شب تهران» + عدد == شمارش DB از نیمه‌شب تهران
# ۴) M2: KPI «درخواست امروز» + همان راستی‌آزمایی عددی
# ۵) کارت بینش ایجنت M1: برچسب «آگهی امروز (از نیمه‌شب)»
# شواهد: download/dir-today-drop-001/ (اسکرین‌شات + e2e-result.json)
import json, sqlite3, subprocess, sys, time
from pathlib import Path
from datetime import datetime, timezone, timedelta
from playwright.sync_api import sync_playwright

BASE = "https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai"
OUT = Path("/home/z/my-project/download/dir-today-drop-001")
OUT.mkdir(parents=True, exist_ok=True)
TEH = timezone(timedelta(hours=3, minutes=30))

def db_today_counts():
    """شمارش DB با همان مرزِ صفحه: createdAt >= نیمه‌شب تهران امروز"""
    now = datetime.now(timezone.utc)
    midnight_teh = now.astimezone(TEH).replace(hour=0, minute=0, second=0, microsecond=0)
    boundary_ms = int(midnight_teh.timestamp() * 1000)
    con = sqlite3.connect("file:/home/z/my-project/db/custom.db?mode=ro", uri=True)
    p = con.execute("SELECT COUNT(*) FROM PropertyRecord WHERE tenantId='melk-tabriz' AND createdAt >= ?", (boundary_ms,)).fetchone()[0]
    r = con.execute("SELECT COUNT(*) FROM RequestRecord WHERE tenantId='melk-tabriz' AND createdAt >= ?", (boundary_ms,)).fetchone()[0]
    con.close()
    return p, r, boundary_ms

code = subprocess.run(["bash", "-c", "grep '^MASTER_ACCESS_CODE=' /home/z/my-project/.env.local | cut -d= -f2"],
                      capture_output=True, text=True).stdout.strip()
if not code:
    print(json.dumps({"error": "no-master-code"}, ensure_ascii=False)); sys.exit(2)

out = {"directive": "DIR-TODAY-DROP-001", "viaEdge": BASE, "steps": [], "pageErrors": [], "consoleErrors": []}

def step(k, ok, detail=""):
    out["steps"].append({"key": k, "ok": bool(ok), "detail": str(detail)})
    print(("OK " if ok else "FAIL"), k, "-", detail)

with sync_playwright() as p:
    browser = p.chromium.launch()
    ctx = browser.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1.5, service_workers="block")
    page = ctx.new_page()
    page.on("console", lambda m: out["consoleErrors"].append(m.text) if m.type == "error" else None)
    page.on("pageerror", lambda e: out["pageErrors"].append(str(e)[:300]))

    # ── ۱) بارگذاری ──
    page.goto(BASE, wait_until="load")
    page.wait_for_timeout(3000)
    no_exc = "Application error" not in page.content() and "client-side exception" not in page.content()
    step("load-no-exception", no_exc, "صفحه از لبه بار شد")
    page.screenshot(path=str(OUT / "01-load.png"))

    # ── ۲) ورود مالک (تا ۳ تلاش — ۵۰۲ گذرای دروازهٔ لبه) ──
    login_ok = False
    for attempt in range(3):
        try:
            page.goto(BASE, wait_until="load")
            page.wait_for_selector("input", timeout=20000)
            page.wait_for_timeout(1200)
            try: page.click("text=ورود با کد مدیر", timeout=6000)
            except Exception: pass
            page.fill("#masterCode", code)
            page.click("button[type=submit]", timeout=8000)
            page.wait_for_selector('button[aria-label*="کاشی"]', timeout=25000)
            page.wait_for_timeout(2000)
            login_ok = True
            break
        except Exception as e:
            if attempt == 2:
                step("owner-login", False, str(e)[:140])
            else:
                page.wait_for_timeout(8000)
    if login_ok:
        step("owner-login", True, "ورود مدیر موفق")

    def read_kpi(label_text, wait_ms=9000):
        """عدد و زیرنویس کارت KPI را بر اساس برچسب می‌خواند (ساختار KpiCard)"""
        import re
        label_p = page.locator("p", has_text=re.compile(f"^{label_text}$")).first
        card_div = label_p.locator("xpath=..")
        end = time.time() + wait_ms / 1000
        val = ""
        while time.time() < end:
            ps = card_div.locator("p")
            if ps.count() >= 2:
                val = ps.nth(1).inner_text().strip()
                if val and "animate-pulse" not in (ps.nth(1).get_attribute("class") or ""):
                    break
            page.wait_for_timeout(500)
        sub = ""
        ps = card_div.locator("p")
        if ps.count() >= 3:
            sub = ps.nth(2).inner_text().strip()
        return val, sub

    def fa_to_int(s):
        tbl = str.maketrans("۰۱۲۳۴۵۶۷۸۹٬,", "0123456789..")
        n = s.translate(tbl).replace("٬", "").replace(",", "").strip()
        return int(n) if n.isdigit() else None

    # ── ۳) M1: آگهی ──
    try:
        p_before, _, boundary = db_today_counts()
        page.click('button[aria-label="باز کردن کاشی آگهی"]', timeout=12000)
        page.wait_for_timeout(6000)  # بارگذاری فهرست سنگین
        val, sub = read_kpi("آگهی امروز")
        p_after, _, _ = db_today_counts()
        num_int = fa_to_int(val)
        ok_num = num_int is not None and p_before <= num_int <= p_after
        step("m1-kpi-today", ok_num, f"نمایش: {val} ({sub}) · DB: {p_before}←{p_after} (مرز نیمه‌شب)")
        step("m1-kpi-sub-label", "نیمه‌شب" in sub, f"زیرنویس: «{sub}»")
        page.screenshot(path=str(OUT / "02-m1-kpi-today.png"), full_page=False)
        # کارت بینش ایجنت — برچسب تازه
        try:
            page.click("text=نمایش بینش", timeout=6000)
            page.wait_for_timeout(2500)
            body = page.locator("body").inner_text()
            step("m1-agent-freshness-label", ("از نیمه‌شب" in body) and ("هفت روز گذشته" in body),
                 "برچسب‌های تازهٔ کارت تازگی حاضرند")
            page.screenshot(path=str(OUT / "03-m1-agent-insight.png"))
        except Exception as e:
            step("m1-agent-freshness-label", False, str(e)[:120])
        page.click('button[aria-label*="بازگشت"]', timeout=8000)
        page.wait_for_timeout(1200)
    except Exception as e:
        step("m1-kpi-today", False, str(e)[:160])

    # ── ۴) M2: درخواست ──
    try:
        _, r_before, _ = db_today_counts()
        page.click('button[aria-label="باز کردن کاشی درخواست"]', timeout=12000)
        page.wait_for_timeout(9000)
        val2, sub2 = read_kpi("درخواست امروز", wait_ms=20000)
        _, r_after, _ = db_today_counts()
        num2_int = fa_to_int(val2)
        ok2 = num2_int is not None and r_before <= num2_int <= r_after
        step("m2-kpi-today", ok2, f"نمایش: {val2} ({sub2}) · DB: {r_before}←{r_after}")
        step("m2-kpi-sub-label", "نیمه‌شب" in sub2, f"زیرنویس: «{sub2}»")
        page.screenshot(path=str(OUT / "04-m2-kpi-today.png"))
        page.click('button[aria-label*="بازگشت"]', timeout=8000)
    except Exception as e:
        step("m2-kpi-today", False, str(e)[:160])

    out["consoleErrorCount"] = len(out["consoleErrors"])
    out["pageErrorCount"] = len(out["pageErrors"])
    browser.close()

(OUT / "e2e-result.json").write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"steps_ok": sum(1 for s in out["steps"] if s["ok"]), "steps_total": len(out["steps"]),
                  "console_errors": len(out["consoleErrors"]), "page_errors": len(out["pageErrors"])}, ensure_ascii=False))
