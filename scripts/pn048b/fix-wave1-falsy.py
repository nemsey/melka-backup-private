#!/usr/bin/env python3
"""DIR-PN048B — correction: fix falsy-Response artifact bug in wave-1 results.
Witness = scripts/pn048b/audit-request-log.jsonl (law 15 — authoritative).
Corrects: A1 literal-path sample (404), A2 literal samples (404,404), B4 all (404×4) + verdict.
No new requests. Documented transparently in artifact 'corrections' field.
"""
import json, re

CKPT = "/home/z/my-project/download/pn048b/_wave1_checkpoint.json"
LOG = "/home/z/my-project/scripts/pn048b/audit-request-log.jsonl"

results = json.load(open(CKPT))
log = [json.loads(l) for l in open(LOG) if l.strip()]

def st_of(url_sub):
    hits = [e["status"] for e in log if url_sub in e["url"]]
    return hits[-1] if hits else None

corr = {"at": "2026-10-22T22:45:00Z",
        "reason": "requests.Response.__bool__ == `ok` → «if r else -1» خطا برای 404/500؛ اصلاح از روی لاگ (شاهد قانون ۱۵)",
        "fixed": []}

# A1 literal path
for s in results.get("A1", {}).get("samples_redacted", []):
    if s.get("path") == "/Potentials/{id}/edit" and s.get("status") == -1:
        real = st_of("/Potentials/13x402075/edit")
        s["status"] = real
        corr["fixed"].append({"test": "A1", "sample": s.get("code"), "status_-1_to": real})

# A2 literal paths
for s in results.get("A2", {}).get("samples_redacted", []):
    if s.get("path") and s.get("status") == -1:
        if "71x" in s.get("path", ""):
            real = st_of("/Melketunfilingplus/71x407051/edit")
        else:
            real = st_of("/Melketunfilingplus/edit/407051")
        s["status"] = real
        corr["fixed"].append({"test": "A2", "path": s.get("path"), "status_-1_to": real})

# B4 — full fix from log
b4 = results.get("B4", {})
if b4:
    mapping = {
        "crm?id=own": "/property/GetFromVTiger?id=407051",
        "crm?code=own": "/property/GetFromVTiger?code=",
        "crm?type=listing": "/property/GetFromVTiger?type=listing",
        "public?id=own": "melketun.com/property/GetFromVTiger",
    }
    for s in b4.get("samples_redacted", []):
        sub = mapping.get(s.get("probe"))
        real = st_of(sub) if sub else None
        if real is not None:
            s["status"] = real
            corr["fixed"].append({"test": "B4", "probe": s.get("probe"), "status_-1_to": real})
    # verdict recompute: all 404 → not_found
    b4["verdict"] = "not_found"
    b4["finding"] = "مسیر /property/GetFromVTiger روی هر دو هاست (CRM + عمومی) وجود ندارد (404) — یافته: endpoint منقضی/حذف‌شده"
    corr["fixed"].append({"test": "B4", "verdict": "permission_required → not_found"})

results["_corrections"] = corr
json.dump(results, open(CKPT, "w"), ensure_ascii=False, indent=1)
json.dump(results, open("/home/z/my-project/download/pn048b/wave1-full.json", "w"),
          ensure_ascii=False, indent=1)
print(json.dumps(corr, ensure_ascii=False, indent=1))
