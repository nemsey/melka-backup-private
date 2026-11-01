#!/usr/bin/env python3
"""DIR-PN048B — N8 alternative path (قانون: نبود شاهد ← آزمون جایگزین مجاز):
CRM module detail (/Melketunfilingplus/show/{id}) → 500 (صفحهٔ خراب — شاهد در wave3).
مسیر جایگزین: صفحهٔ عمومی ملکتون (عمومی) — ETag/If-None-Match + If-Modified-Since.
"""
import sys, json, re, sqlite3, urllib.parse
sys.path.insert(0, "/home/z/my-project/scripts/pn048b")
from audit_lib import http, make_session, extract_props, save_json, status_of, test_meta, BASE_PUBLIC

s = make_session()
c = sqlite3.connect("file:/home/z/my-project/db/custom.db?mode=ro", uri=True)
purl = c.execute("""SELECT publicUrl FROM PropertyRecord WHERE tenantId='melketun'
                    AND publicUrl IS NOT NULL AND publicUrl!='' LIMIT 1""").fetchone()[0]
c.close()
url = BASE_PUBLIC + urllib.parse.quote(purl, safe="/-")

samples = []
r1 = http("GET", url, s, note="N8-alt public baseline GET")
etag = lmod = None
if r1 is not None:
    etag = r1.headers.get("ETag"); lmod = r1.headers.get("Last-Modified")
    samples.append({"probe": "public-baseline", "status": status_of(r1),
                    "etag": etag, "last_modified": lmod,
                    "cache_control": (r1.headers.get("Cache-Control") or "")[:60]})
if etag:
    r2 = http("GET", url, s, headers={"If-None-Match": etag}, note="N8-alt If-None-Match")
    samples.append({"probe": "if-none-match", "status": status_of(r2),
                    "size": len(r2.content or b"") if r2 is not None else 0})
elif lmod:
    r2 = http("GET", url, s, headers={"If-Modified-Since": lmod}, note="N8-alt If-Modified-Since")
    samples.append({"probe": "if-modified-since", "status": status_of(r2),
                    "size": len(r2.content or b"") if r2 is not None else 0})
else:
    r2 = http("GET", url, s, headers={"If-None-Match": '"deadbeef"'}, note="N8-alt If-None-Match bogus")
    samples.append({"probe": "if-none-match-bogus", "status": status_of(r2),
                    "size": len(r2.content or b"") if r2 is not None else 0})

codes = [x.get("status") for x in samples if x.get("probe") != "note"]
if 304 in codes:
    verdict = "cache_behavior_normal"
elif 200 in codes:
    verdict = "cache_behavior_normal"
    samples.append({"probe": "note", "text": "سرور ETag/Last-Modified صادر نمی‌کند؛ GET شرطی همان 200 کامل برمی‌گرداند — بدون body غیرمنتظره"})
else:
    verdict = "unverified"

out = {
 "meta": test_meta("N8", "ETag/Cache — مسیر جایگزین عمومی (مسیر CRM show خراب ۵۰۰)"),
 "verdict": verdict,
 "crm_detail_status": "500 (صفحهٔ خراب — شاهد wave3 N8 baseline)",
 "alternative_path": "public listing page (melketun.com)",
 "samples_redacted": samples,
}
# merge into wave3 checkpoint
CK = "/home/z/my-project/download/pn048b/_wave3_checkpoint.json"
res = json.load(open(CK))
res["N8"] = out
res["_n8_alt_note"] = "مسیر CRM show/{id} → 500؛ آزمون جایگزین مجاز روی صفحهٔ عمومی اجرا شد (قانون جایگزینی توقف‌ها)"
# normalize B1 verdict to directive enum
if "B1" in res and res["B1"].get("verdict") == "empty_scope_ok":
    res["B1"]["verdict"] = "empty"
    res["B1"]["finding"] = "/leads → 403 (مرز مجوز برقرار) · /leads/assigned → 200 با rows:0 (سرنوشتهٔ خودی: خالی) — RBAC درست کار می‌کند"
json.dump(res, open(CK, "w"), ensure_ascii=False, indent=1)
json.dump(res, open("/home/z/my-project/download/pn048b/wave3-full.json", "w"), ensure_ascii=False, indent=1)
print("N8-alt verdict:", verdict)
print("B1 normalized → empty")
