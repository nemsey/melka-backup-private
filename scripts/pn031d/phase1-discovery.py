#!/usr/bin/env python3
"""PN-031-D · فاز ۱ — کشف مسیرهای ارتباطی (سبک · فقط GET/TCP · بدون احراز · بدون POST)

دامنهٔ کار: میزبان‌های شناخته‌شدهٔ ملک تبریز (۴ میزبان × ۴ پورت)، زیردامنه‌های
نامزد (DNS)، مسیرهای مستندشدهٔ API (openapi/swagger/docs)، و well-knownهای OAuth/OIDC.
کنترل مثبت: cloudflare.com — تا «timeout» معنای «بلاک» بگیرد نه «شبکهٔ سندباکس خراب است».
خروجی: شاهدهای JSON در download/pn031d/
"""
import json
import os
import socket
import ssl
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from urllib.parse import urljoin

ROOT = "/home/z/my-project"
OUT = os.path.join(ROOT, "download", "pn031d")
os.makedirs(OUT, exist_ok=True)
TS = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
CTX = ssl.create_default_context()
CTX.timeout = 8.0

HOSTS = ["arus-api.melketabriz.ir", "pm-api.melketabriz.ir",
         "gap-api.melketabriz.ir", "www.melketabriz.ir"]
PORTS = [443, 8443, 80, 8080]
SUBS = ["api", "app", "m", "admin", "mobile", "developer", "docs",
        "sso", "login", "portal", "old", "backup"]
BASE_DOMAINS = ["melketabriz.ir", "melketabriz.com"]
DOCS_PATHS = ["/openapi.json", "/swagger.json", "/api/docs", "/api/openapi",
              "/api/v1/docs", "/api/swagger", "/api/explorer", "/api"]
WELL_KNOWN = ["/.well-known/oauth-authorization-server",
              "/.well-known/openid-configuration"]
KNOWN_LIVE = {
    "ARM (apm)": "https://arus-api.melketabriz.ir/api/apm/",
    "Public APU": "https://arus-api.melketabriz.ir/api/apu/",
    "PM": "https://pm-api.melketabriz.ir/api/",
    "GAP": "https://gap-api.melketabriz.ir/api/",
    "پروکسی خودی (Worker)": "https://melka-proxy.nemsey-ns.workers.dev",
}
CONTROLS = {"cloudflare.com": "https://cloudflare.com"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def tcp_probe(host: str, port: int, timeout: float = 3.0) -> dict:
    t0 = time.monotonic()
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return {"host": host, "port": port, "state": "open",
                    "latencyMs": round((time.monotonic() - t0) * 1000)}
    except socket.timeout:
        return {"host": host, "port": port, "state": "timeout", "latencyMs": None}
    except ConnectionRefusedError:
        return {"host": host, "port": port, "state": "refused", "latencyMs": None}
    except OSError as e:
        return {"host": host, "port": port, "state": f"error:{e.errno}", "latencyMs": None}


def dns_probe(name: str) -> dict:
    out = {"name": name, "ipv4": [], "ipv6": [], "error": None}
    try:
        out["ipv4"] = sorted({ai[4][0] for ai in socket.getaddrinfo(name, None, socket.AF_INET)})
    except socket.gaierror as e:
        out["error"] = "NXDOMAIN_or_resolver"
    try:
        out["ipv6"] = sorted({ai[4][0] for ai in socket.getaddrinfo(name, None, socket.AF_INET6)})
    except socket.gaierror:
        pass
    return out


def http_get(url: str, timeout: float = 8.0) -> dict:
    req = urllib.request.Request(url, method="GET",
                                 headers={"User-Agent": "melka-path-discovery/1.0"})
    t0 = time.monotonic()
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=CTX) as resp:
            body = resp.read(256)
            return {"url": url, "reachable": True, "httpStatus": resp.status,
                    "latencyMs": round((time.monotonic() - t0) * 1000),
                    "bodySnippet": body[:80].decode("utf-8", "replace")}
    except urllib.error.HTTPError as e:
        return {"url": url, "reachable": True, "httpStatus": e.code,
                "latencyMs": round((time.monotonic() - t0) * 1000), "bodySnippet": None}
    except Exception as e:
        kind = "timeout" if isinstance(e, (socket.timeout, TimeoutError)) else type(e).__name__
        return {"url": url, "reachable": False, "error": kind,
                "latencyMs": round((time.monotonic() - t0) * 1000)}


def dump(name: str, payload: dict) -> str:
    path = os.path.join(OUT, name)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    return path


def main() -> int:
    summary = {"ok": True, "ts": TS, "generatedAt": now_iso(),
               "policy": "فقط GET/TCP · بدون POST · بدون احراز · کنترل مثبت همراه",
               "witnesses": {}}

    # ۰) کنترل مثبت — سلامت خروجی شبکهٔ سندباکس
    ctrl = {k: http_get(v) for k, v in CONTROLS.items()}
    summary["controls"] = ctrl
    egress_ok = all(r.get("reachable") for r in ctrl.values())

    # ۱.۱) اسکن پورت
    ports_res = []
    for h in HOSTS:
        for p in PORTS:
            ports_res.append(tcp_probe(h, p))
            time.sleep(0.15)
    opened = [r for r in ports_res if r["state"] == "open"]
    summary["witnesses"]["port-scan"] = dump("port-scan.json", {
        "ts": TS, "tool": "python socket TCP connect (معادل nc -zv)",
        "hosts": HOSTS, "ports": PORTS,
        "results": ports_res,
        "summary": {"probed": len(ports_res), "open": len(opened),
                    "timeoutOrRefused": len(ports_res) - len(opened),
                    "openList": [f"{r['host']}:{r['port']}" for r in opened]},
        "note": "زمان‌سنجی ۳ ثانیه؛ فاصلهٔ ۱۵۰ms بین هر اتصال برای ادب شبکه"})

    # ۱.۲) کشف زیردامنه (DNS passive)
    dns_res = []
    for base in BASE_DOMAINS:
        dns_res.append(dns_probe(base))
        for s in SUBS:
            dns_res.append(dns_probe(f"{s}.{base}"))
    resolved = [r for r in dns_res if r["ipv4"] or r["ipv6"]]
    all_ips = sorted({ip for r in resolved for ip in r["ipv4"]})
    summary["witnesses"]["subdomain-scan"] = dump("subdomain-scan.json", {
        "ts": TS, "method": "DNS A/AAAA (resolver سندباکس · بدون brute-force واژه‌نامه‌ای سنگین)",
        "candidates": [f"{s}.{b}" for b in BASE_DOMAINS for s in SUBS] + BASE_DOMAINS,
        "results": dns_res,
        "summary": {"queried": len(dns_res), "resolved": len(resolved),
                    "uniqueIpv4": all_ips,
                    "ipv6Any": any(r["ipv6"] for r in dns_res)}})

    # ۱.۳) مسیرهای مستند API + endpointهای شناخته‌شده
    docs_res = []
    for p in DOCS_PATHS:
        docs_res.append(http_get(urljoin("https://arus-api.melketabriz.ir", p)))
        time.sleep(0.15)
    reachable_docs = [r for r in docs_res if r["reachable"]]
    summary["witnesses"]["api-docs-scan"] = dump("api-docs-scan.json", {
        "ts": TS, "target": "arus-api.melketabriz.ir", "paths": DOCS_PATHS,
        "results": docs_res,
        "summary": {"probed": len(docs_res), "reachable": len(reachable_docs),
                    "reachableList": [f"{r['httpStatus']} {r['url']}" for r in reachable_docs]}})

    # ۱.۴) سازوکارهای ورود رسمی
    auth_res = {}
    for wk in WELL_KNOWN:
        auth_res[wk] = http_get(urljoin("https://arus-api.melketabriz.ir", wk))
        time.sleep(0.15)
    summary["witnesses"]["auth-mechanisms"] = dump("auth-mechanisms.json", {
        "ts": TS, "wellKnown": auth_res,
        "knownFromProject": {
            "mechanism": "کد پرسنلی + رمز یک‌بارمصرف پیامکی (OTP)",
            "usedBy": ["ARM (arus-api /api/apm)", "PM (pm-api)", "GAP (gap-api)"],
            "note": "سازوکار ورود رسمیِ سامانه‌ها از پیمایش پیشین پروژه مستند است؛ "
                    "خودِ URLها از این سرور در دسترس نیستند (بلاک جغرافیایی)."},
        "summary": {k: v.get("reachable") for k, v in auth_res.items()}})

    # ۱.۸) تست GET هر مسیر شناخته‌شده (بدون احراز — فقط وضعیت دسترسی)
    live_res = {k: http_get(v) for k, v in KNOWN_LIVE.items()}
    summary["witnesses"]["path-tests"] = dump("path-tests.json", {
        "ts": TS, "targets": KNOWN_LIVE, "results": live_res,
        "summary": {k: ("reachable" if r["reachable"] else r.get("error"))
                    for k, r in live_res.items()}})

    # ۱.۵) راهبرد نشست مرورگر — فقط طرح، بدون اجرا
    summary["witnesses"]["session-strategy"] = dump("session-strategy.json", {
        "ts": TS, "status": "طرح — بدون اجرا",
        "idea": "در صورت نیاز، مالک در مرورگر گوشی خودش (Poco F3 · شبکهٔ ایرانی) وارد "
                "سامانهٔ ملک تبریز می‌شود؛ نشست آن مرورگر فقط روی همان گوشی و فقط با "
                "رضایت مالک برای اتصال اپ ملکا استفاده می‌شود.",
        "constraints": ["حساب و نشست شخصی خود مالک است",
                        "هیچ دادهٔ کاربر دیگر درگیر نیست",
                        "اجرای آن مستند و با اعلام مالک انجام می‌شود"],
        "dependency": "فقط در صورتی که رلهٔ اپ (فاز ۲) مسیر ساده‌تری برای همان هدف فراهم نکند"})

    # ۱.۷) گزارش جمع‌بندی مسیرها
    working = [k for k, r in live_res.items() if r["reachable"] and k != "پروکسی خودی (Worker)"]
    paths_report = {
        "ts": TS, "title": "گزارش مسیرهای ارتباطی ملک تبریز — از سرور ملکا",
        "egressHealthy": egress_ok,
        "portScan": {"open": len(opened), "of": len(ports_res)},
        "dns": {"resolved": len(resolved), "uniqueIpv4": all_ips,
                "singleIpArchitecture": len(all_ips) == 1},
        "directHttpReachable": [k for k, r in live_res.items() if r["reachable"]],
        "conclusion": None,
        "realOptions": [
            "۱) رلهٔ گوشی مالک (Poco F3 · شبکهٔ ایرانی) — زیرساخت کامل از PN-031-C آماده",
            "۲) مجوز رسمی از ملک تبریز (سفیدلیست/رابط رسمی) — تمیزترین راه دائمی",
            "۳) سرور مجازی ایرانی به‌عنوان خروجی — همان قرارداد HMAC، بدون گوشی"]}
    summary["witnesses"]["paths-report"] = dump("paths-report.json", paths_report)

    print(json.dumps({"egressOk": egress_ok,
                      "portsOpen": len(opened), "dnsResolved": len(resolved),
                      "uniqueIpv4": all_ips,
                      "httpReachable": paths_report["directHttpReachable"]},
                     ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
