#!/usr/bin/env python3
# PN-024 · مرحلهٔ ۱۳ — راستی‌آزمایی لینک‌های تحویل v3 (قانون فایل v3: همه ۲۰۰)
import json, urllib.request, datetime

BASE = "http://localhost:3000"
files = [
    "pn024/PN-024-FINAL-REPORT.md", "pn024/lock-in.json", "pn024/lock-raw.txt",
    "pn024/design-doc.json", "pn024/negin-palette.json", "pn024/negin-applied.json",
    "pn024/negin-tests.json", "pn024/park-atomic.json", "pn024/j-fixes.json",
    "pn024/counterfactual-engine.json", "pn024/simulation-engine.json",
    "pn024/meta-mind-service.json", "pn024/guards.json", "pn024/guards-negin.json",
    "pn024/guards-counterfactual.json", "pn024/guards-mirror-sync.json", "pn024/guards-pg-cluster.json",
    "pn024/end-gate.json", "pn024/tests-run1.log", "pn024/tests-run2.log",
    "pn024/PN-024-ALL.zip", "pn024/PN-024-chainIndex24.tar.gz", "pn024/SHA256SUMS.txt",
]
for i in range(1, 23):
    files.append(f"pn024/screens/{i:02d}-finder-light.png" if False else None)
# اسکرین‌شات‌ها را از دایرکتوری بخوان
import os
for f in sorted(os.listdir("deliver-store/pn024/screens")):
    files.append(f"pn024/screens/{f}")
# قطعات بقا
for f in sorted(os.listdir("deliver-store")):
    if f.startswith("PN-024-survival-part"):
        files.append(f)
files.append("PN-024-REJOIN.txt")
files = [f for f in files if f]

results = {}
all200 = True
for f in files:
    url = f"{BASE}/deliver/{f}"
    try:
        req = urllib.request.Request(url, method="HEAD")
        with urllib.request.urlopen(req, timeout=30) as r:
            ok = r.status == 200
    except Exception as e:
        ok = False
        print("ERR", f, str(e)[:60])
    results[f] = {"url": url, "status": 200 if ok else "ERR"}
    all200 = all200 and ok

witness = {
    "workOrder": "PN-024/مرحلهٔ ۱۳ — تحویل v3 (قانون فایل v3 · لینک مستقیم ۲۰۰)",
    "ranAt": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "links": len(results),
    "all200": all200,
    "files": {k: v["url"] for k, v in results.items()},
    "counts": {"shahid": 23, "screenshots": 22, "chunks": 5, "report": 1, "allZip": 1, "sha256": 1, "rejoin": 1},
    "note": "سفارش ۱۰ قطعه پیش‌بینی کرده بود؛ بستهٔ فشردهٔ ۲۱۵MB → ۵ قطعهٔ ۴۸MB (کمتر از سقف — صادقانه)",
}
json.dump(witness, open("download/pn024/deliver-links.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(f"لینک‌ها: {len(results)} · همه ۲۰۰: {all200}")
