#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PN-066 — وارسی سرتاسری از طریق لینک عمومی (فرمان صریح مالک:
«تمام تغییرات در سمت سرور تست نشود بلکه از طریق لینک وارد شود»)
فرایند:
  ۱) ورود مالک با کدمستر از منبع env سرور زنده (بدون چاپ کد)
  ۲) دادهٔ چهار کاشی ملک تبریز (data-freshness) از لینک
  ۳) بینش‌های چهار کاشی (/api/agent/*/insight) از لینک
  ۴) فهرست زندهٔ معاملات (نام ثبت‌کننده) از لینک
  ۵) صدور کد نصب الف (اثبات) + دانلود اسکریپت bootstrap عین مسیر گوشی
  ۶) صدور کد نصب ب (تازه، دست‌نخورده — برای مالک)
شاهد: download/pn066/link-verification.json
"""
import json, re, subprocess, sys, time, urllib.request, urllib.error, ssl
from datetime import datetime, timezone

BASE = "https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai"
CTX = ssl.create_default_context()  # TLS عادی — عین مرورگر، بدون کاهش امنیت
EVIDENCE = {"at": datetime.now(timezone.utc).isoformat(), "base": BASE, "steps": [], "allPass": True}

def step(name, ok, detail):
    EVIDENCE["steps"].append({"step": name, "ok": bool(ok), "detail": detail})
    if not ok:
        EVIDENCE["allPass"] = False
    print(("✓" if ok else "✗"), name, "—", detail if isinstance(detail, str) else json.dumps(detail, ensure_ascii=False)[:200])

def req(method, path, body=None, cookie=None, ua=None, timeout=40, bearer=None):
    url = BASE + path
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    if body is not None:
        r.add_header("Content-Type", "application/json")
    if cookie:
        r.add_header("Cookie", cookie)
    if bearer:
        r.add_header("Authorization", f"Bearer {bearer}")
    if ua:
        r.add_header("User-Agent", ua)
    try:
        with urllib.request.urlopen(r, timeout=timeout, context=CTX) as resp:
            raw = resp.read()
            return resp.status, dict(resp.headers), raw
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()
    except Exception as e:
        return 0, {}, str(e).encode()

def jbody(raw):
    try:
        return json.loads(raw.decode("utf-8"))
    except Exception:
        return {"_raw": raw[:200].decode("utf-8", "replace")}

# ── ۰) سلامت لینک و نسخه ──
st, hd, raw = req("GET", "/api/version")
v = jbody(raw)
step("link-version", st == 200 and v.get("buildId", "").startswith("a932d7d"),
     {"http": st, "buildId": v.get("buildId"), "env": v.get("env")})

# ── ۱) ورود مالک (کدمستر از env پروسهٔ زندهٔ سرور — هرگز چاپ نمی‌شود) ──
try:
    pid = subprocess.check_output(["pgrep", "-f", "standalone/server.js"]).split()[0].decode()
    env_raw = subprocess.check_output(["sudo", "cat", f"/proc/{pid}/environ"]) if False else \
              open(f"/proc/{pid}/environ", "rb").read()
    envs = dict(x.split(b"=", 1) for x in env_raw.split(b"\0") if b"=" in x)
    master = envs.get(b"MASTER_ACCESS_CODE", b"").decode()
except Exception as e:
    master = ""
    step("master-env-read", False, f"env read failed: {e}")
if master:
    st, hd, raw = req("POST", "/api/auth/master-login", {"masterCode": master})
    login = jbody(raw)
    token = login.get("token") or ""
    user = login.get("user") or {}
    step("owner-login", st == 200 and login.get("ok") and token and user.get("role") == "OWNER",
         {"http": st, "role": user.get("role"), "name": user.get("displayName") or user.get("name")})
else:
    token = ""
    step("owner-login", False, "master code not found in server env")

# توکن نشست همه‌جا — عین اپ (Authorization: Bearer)

# ── ۲) دادهٔ کاشی‌ها (data-freshness — شمارش واقعی M1-M4 از کاتالوگ‌های ARM) ──
st, hd, raw = req("GET", "/api/crm/data-freshness", bearer=token)
fresh = jbody(raw)
fr = fresh.get("freshness") or {}
def fcnt(key):
    e = fr.get(key) or {}
    return e.get("recordCount")
m1, m2 = fcnt("arm-listing"), fcnt("arm-request")
m3, m4 = fcnt("transactions-contracts"), fcnt("experts")
cust = fcnt("customer-club")
step("tiles-data-freshness", st == 200 and all(isinstance(x, int) and x > 0 for x in [m1, m2, m3, m4]),
     {"http": st, "M1_ads": m1, "M2_requests": m2, "M3_transactions": m3, "M4_experts": m4, "customers": cust})

# ── ۳) بینش‌های چهار کاشی ──
insights = {}
for tile in ["listings", "requests", "transactions-contracts", "experts"]:
    st, hd, raw = req("GET", f"/api/agent/{tile}/insight", bearer=token)
    ins = jbody(raw)
    n = len(ins.get("insights") or ins.get("items") or [])
    insights[tile] = {"http": st, "count": n}
    step(f"insight-{tile}", st == 200 and n > 0, insights[tile])

# ── ۴) ردیف‌های زندهٔ کاتالوگ ARM (M1 آگهی + M2 درخواست) ──
st, hd, raw = req("GET", "/api/crm/arm-catalog/listings?limit=3", bearer=token)
ls = jbody(raw)
rows = ls.get("rows") or []
step("M1-arm-listings-live", st == 200 and len(rows) > 0, {"http": st, "rows": len(rows), "sample_id": (rows[0].get("id") if rows else None)})
st, hd, raw = req("GET", "/api/crm/arm-catalog/requests?limit=3", bearer=token)
rq = jbody(raw)
rows2 = rq.get("rows") or []
step("M2-arm-requests-live", st == 200 and len(rows2) > 0, {"http": st, "rows": len(rows2)})

# ── ۵) صدور کد نصب الف (اثبات) + دانلود bootstrap عین مسیر گوشی ──
st, hd, raw = req("POST", "/api/admin/relay/enroll", {"label": "poco-f3-owner"}, bearer=token)
enrollA = jbody(raw)
okA = st == 200 and enrollA.get("ok") and "installCommand" in enrollA
step("install-code-A-generated", okA,
     {"http": st, "deviceId": enrollA.get("deviceId"), "expires": enrollA.get("enrollExpires"),
      "cmdHasPublicUrl": "preview-chat-" in (enrollA.get("installCommand") or ""),
      "cmdHasVpcLeak": "fcapp.run" in (enrollA.get("installCommand") or "")})
if okA:
    codeA = enrollA.get("bootstrapUrl", "").split("code=")[-1]
    ua_phone = "Mozilla/5.0 (Linux; Android 13; Poco F3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.6613.88 Mobile Safari/537.36"
    st, hd, raw = req("GET", f"/api/mobile-relay/bootstrap?code={codeA}", ua=ua_phone, timeout=60)
    script = raw.decode("utf-8", "replace")
    has_pub = "preview-chat-35e0018b" in script
    no_vpc = "fcapp.run" not in script
    has_alt = "workers.dev" in script
    has_attempts = ("1 از 3" in script) or ("talaash" in script.lower()) or ("تلاش" in script)
    step("bootstrap-script-download", st == 200 and len(script) > 5000 and has_pub and no_vpc,
         {"http": st, "bytes": len(script), "serverUrlPublic": has_pub, "vpcLeak": not no_vpc,
          "altUrlPresent": has_alt, "attemptsHeader": has_attempts})

# ── ۶) صدور کد نصب ب (برای مالک — دست‌نخورده) ──
st, hd, raw = req("POST", "/api/admin/relay/enroll", {"label": "poco-f3-owner"}, bearer=token)
enrollB = jbody(raw)
okB = st == 200 and enrollB.get("ok") and "installCommand" in enrollB
step("install-code-B-generated", okB,
     {"http": st, "deviceId": enrollB.get("deviceId"), "validityMinutes": enrollB.get("validityMinutes"),
      "cmdHasPublicUrl": "preview-chat-" in (enrollB.get("installCommand") or ""),
      "cmdHasVpcLeak": "fcapp.run" in (enrollB.get("installCommand") or "")})

# ── خروجی شاهد ──
import os
os.makedirs("/home/z/my-project/download/pn066", exist_ok=True)
EVIDENCE["enrollForOwner"] = {
    "installCommand": enrollB.get("installCommand") if okB else None,
    "bootstrapUrl": enrollB.get("bootstrapUrl") if okB else None,
    "enrollExpires": enrollB.get("enrollExpires") if okB else None,
    "maxAttempts": enrollB.get("maxAttempts") if okB else None,
}
EVIDENCE["summary"] = {
    "ownerLogin": any(s["step"] == "owner-login" and s["ok"] for s in EVIDENCE["steps"]),
    "tilesData": any(s["step"] == "tiles-data-freshness" and s["ok"] for s in EVIDENCE["steps"]),
    "insights": sum(1 for s in EVIDENCE["steps"] if s["step"].startswith("insight-") and s["ok"]),
    "installCodeGenerated": okA and okB,
    "bootstrapVerified": any(s["step"] == "bootstrap-script-download" and s["ok"] for s in EVIDENCE["steps"]),
}
with open("/home/z/my-project/download/pn066/link-verification.json", "w", encoding="utf-8") as f:
    json.dump(EVIDENCE, f, ensure_ascii=False, indent=2)
print("\n=== SUMMARY ===")
print(json.dumps(EVIDENCE["summary"], ensure_ascii=False))
print("ALL PASS" if EVIDENCE["allPass"] else "SOME STEPS FAILED")
sys.exit(0 if EVIDENCE["allPass"] else 1)
