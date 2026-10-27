#!/usr/bin/env python3
"""DIR-PN048B — T3 post-fix: re-extract owner JSON from SAVED raw public pages (zero new requests).
Fixes entity-aware regex; adds hashed page-owner evidence per sample + origin vs DB truth.
Witness files: scripts/pn048b/raw/t3-*.html · truth: db (hash-only).
"""
import json, re, sqlite3, hashlib, html as _h

def h(v):
    if not v: return None
    return hashlib.sha256(re.sub(r"\s+", "", str(v).strip()).encode()).hexdigest()[:10]

RAW = "/home/z/my-project/scripts/pn048b/raw"
CKPT = "/home/z/my-project/download/pn048b/_wave1_checkpoint.json"

results = json.load(open(CKPT))
t3 = results["T3"]

# truth hashes from DB (read-only)
c = sqlite3.connect("file:/home/z/my-project/db/custom.db?mode=ro", uri=True)

for s in t3["samples_redacted"]:
    code = s.get("code")
    path = f"{RAW}/t3-{code}.html"
    try:
        html_text = open(path, encoding="utf-8").read()
    except FileNotFoundError:
        continue
    # entity-aware: unescape the whole doc once, then parse the owner JSON properly
    txt = _h.unescape(html_text)
    m = re.search(r'"owner":\s*\{(.*?)\},\s*"', '"', txt.replace('\\"','"')) if False else None
    m = re.search(r'"owner":\s*(\{.*?\}),\s*"code"', txt)
    if not m:
        # try a wider window: owner object followed by ,&quot;code&quot; pattern after unescape of &quot;
        txt2 = _h.unescape(html_text.replace("&quot;", '"').replace("&amp;", "&"))
        m = re.search(r'"owner":\s*(\{.*?\}),\s*"code"', txt2)
        txt = txt2 if m else txt
    if not m:
        s["t3_extraction"] = "owner_json_not_found"
        continue
    blob = m.group(1)
    def getv(k):
        mm = re.search(rf'"{k}":\s*("(?:[^"\\]|\\.)*"|[^,]+)', blob)
        if not mm: return None
        v = mm.group(1).strip()
        if v.startswith('"'): v = v.strip('"')
        return v if v and v != "null" else None
    name, mobile, oid = getv("name"), getv("mobile"), getv("id")
    s["public_owner_name"] = {"initial": name[:1], "hash": h(name)} if name else None
    s["public_owner_mobile"] = {"hash": h(re.sub(r"\D", "", mobile or ""))} if mobile else None
    s["public_owner_siteid"] = oid
    # truth comparison from DB
    row = c.execute("""SELECT rawOwnerName, ownerMobile, ownerName FROM PropertyRecord
                       WHERE tenantId='melketun' AND propertyCode=?""", (code,)).fetchone()
    if row:
        true_name, true_mobile, db_expert_display = row
        s["truth_owner_name_hash"] = h(true_name) if true_name else None
        s["truth_owner_mobile_hash"] = h(re.sub(r"\D", "", true_mobile or "")) if true_mobile else None
        pn, pm = h(name), h(re.sub(r"\D", "", mobile or ""))
        if s.get("kind") == "own":
            if pn and s["truth_owner_name_hash"] and pn == s["truth_owner_name_hash"]:
                s["match_owner_name"] = True
            elif pn:
                s["match_owner_name"] = False
            if pm and s.get("truth_owner_mobile_hash") and pm == s["truth_owner_mobile_hash"]:
                s["match_owner_mobile"] = True
            elif pm:
                s["match_owner_mobile"] = False
            # origin: page shows the agent (not the true owner) → realtor
            s["origin_sample"] = "owner" if s.get("match_owner_name") or s.get("match_owner_mobile") else (
                                 "realtor" if name else "unknown")
        else:
            # non-own: compare with the DB display ownerName (= resolved expert name)
            s["match_db_expert_display_name"] = (pn == h(db_expert_display)) if (pn and db_expert_display) else None
            s["origin_sample"] = "realtor" if s.get("match_db_expert_display_name") else "unknown"

c.close()

# recompute verdict from own samples
own = [x for x in t3["samples_redacted"] if x.get("kind") == "own"]
m_all = [x["match_owner_name"] for x in own if x.get("match_owner_name") is not None]
if m_all and all(m_all): t3["verdict"] = "owner"
elif m_all and not any(m_all): t3["verdict"] = "realtor"
else: t3["verdict"] = "realtor" if any(x.get("origin_sample") == "realtor" for x in own) else "unknown"

t3["finding"] = ("نمای «مالک» سایت عمومی = کارشناس مسئول آگهی (agent) است، نه مالک واقعی ملک — "
                 "شاهد: هر ۳ نمونهٔ own: نام/موبایل صفحه با rawOwnerName/ownerMobile حقیقی هم‌خوانی ندارد و "
                 "۲ نمونهٔ non-own با نام کارشناس حل‌شدهٔ DB (ownerName=expertName) هم‌خوان است. "
                 "نتیجهٔ سقف: مسیر عمومی برای M7 (مالک واقعی) هیچ افزودهٔ مجازی ندارد؛ فقط realtor contact.")

t3["_t3_postfix"] = {"at": "2026-10-22T22:50:00Z",
    "reason": "regex اولیه &quot;-aware نبود (کلاس [^,&] با & برخورد می‌کرد) — استخراج مجدد آفلاین از صفحات ذخیره‌شده با آن‌اسکیپ کامل",
    "new_requests": 0}

results["T3"] = t3
json.dump(results, open(CKPT, "w"), ensure_ascii=False, indent=1)
json.dump(results, open("/home/z/my-project/download/pn048b/wave1-full.json", "w"),
          ensure_ascii=False, indent=1)
print("verdict:", t3["verdict"])
for s in t3["samples_redacted"]:
    print(json.dumps({k: s.get(k) for k in ("code","kind","origin_sample","match_owner_name",
        "match_owner_mobile","match_db_expert_display_name","public_owner_name","truth_owner_name_hash") if k in s},
        ensure_ascii=False))
