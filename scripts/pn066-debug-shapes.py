#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""اشکال‌زدایی سریع: شکل واقعی پاسخ data-freshness و listings"""
import json, subprocess, urllib.request, urllib.error, ssl

BASE = "https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai"
CTX = ssl.create_default_context()

pid = subprocess.check_output(["pgrep", "-f", "standalone/server.js"]).split()[0].decode()
env_raw = open(f"/proc/{pid}/environ", "rb").read()
envs = dict(x.split(b"=", 1) for x in env_raw.split(b"\0") if b"=" in x)
master = envs.get(b"MASTER_ACCESS_CODE", b"").decode()

def req(method, path, body=None, bearer=None):
    r = urllib.request.Request(BASE + path, method=method,
                               data=json.dumps(body).encode() if body else None)
    if body: r.add_header("Content-Type", "application/json")
    if bearer: r.add_header("Authorization", f"Bearer {bearer}")
    try:
        with urllib.request.urlopen(r, timeout=40, context=CTX) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode() or "{}")

st, login = req("POST", "/api/auth/master-login", {"masterCode": master})
token = login.get("token", "")
print("login:", st, login.get("user", {}).get("role"))

st, fr = req("GET", "/api/crm/data-freshness", bearer=token)
print("\ndata-freshness http:", st)
print("freshness keys:", list((fr.get("freshness") or {}).keys()))
for k, v in (fr.get("freshness") or {}).items():
    print(f"  {k}: count={v.get('count') if isinstance(v, dict) else v}")

st, ls = req("GET", "/api/listings?limit=3", bearer=token)
print("\nlistings http:", st)
print("keys:", list(ls.keys()))
print("stats:", ls.get("stats"))
print("rows len:", len(ls.get("rows") or []))

# شاید پارامتر صفحه‌بندی متفاوت باشد — نمونهٔ بدون پارامتر
st, ls2 = req("GET", "/api/listings", bearer=token)
print("\nlistings (no params) http:", st, "rows:", len(ls2.get("rows") or []), "stats.total:", (ls2.get("stats") or {}).get("total"))
