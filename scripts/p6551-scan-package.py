#!/usr/bin/env python3
"""p6551-scan-package.py — اسکن درون بستهٔ سورس (دفاع در عمق)
الگوها: کلید تستی توکن (عمومی-از-طراحی) · کدهای مدیر زنده/مرده · توکن گیت‌هاب
"""
import json, os, sys, tempfile, subprocess

env = json.load(open("env.platform.json"))
tk = str(env.get("MELK_TOKEN_KEY", ""))

with tempfile.TemporaryDirectory() as q:
    subprocess.run(["tar", "-xzf", "download/p6551/melka-source-v1.0-20261004.tar.gz", "-C", q], check=True)
    hits = []
    for root, _dirs, files in os.walk(q):
        for fn in files:
            p = os.path.join(root, fn)
            try:
                data = open(p, "rb").read()
            except OSError:
                continue
            tags = []
            if tk.encode() in data:
                tags.append("token-key(public-test)")
            if b"80211186" in data:
                tags.append("LIVE-MASTER-CODE")
            if b"41372895" in data:
                tags.append("dead-master-code")
            if b"ghp_" in data or b"github_pat_" in data:
                tags.append("github-token")
            if b"nemsey:" in data:
                tags.append("remote-cred")
            if tags:
                hits.append((os.path.relpath(p, q), tags))
    print("HITS inside package:")
    for h in hits:
        print("  ·", h)
    if not hits:
        print("  (none)")

    # env.platform.json داخل بسته — پالایش‌شده طبق P6550؟
    for root, _dirs, files in os.walk(q):
        for fn in files:
            if fn == "env.platform.json":
                p = os.path.join(root, fn)
                d = json.load(open(p))
                pkg_val = str(d.get("MELK_TOKEN_KEY", ""))
                print(f"package env.platform.json: MELK_TOKEN_KEY prefix={pkg_val[:4]}... same-as-live={pkg_val == tk}")
                mc = str(d.get("MASTER_ACCESS_CODE", ""))
                print(f"package env.platform.json: MASTER_ACCESS_CODE prefix={mc[:4]}... same-as-live={mc == str(env.get('MASTER_ACCESS_CODE'))}")
