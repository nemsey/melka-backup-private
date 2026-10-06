#!/usr/bin/env bash
# ============================================================================
# PN-008 BLOCK 4 بند ۴.۱ — اسکن ایستای گاردهای نقش همهٔ روت‌های API
# خروجی: download/pn008/roles-scan.json
# ============================================================================
set -uo pipefail
cd /home/z/my-project
OUT=download/pn008/roles-scan.json

python3 - <<'PYEOF'
import json, os, re, glob

routes = []
for path in sorted(glob.glob("src/app/api/**/route.ts", recursive=True)):
    src = open(path, encoding="utf-8").read()
    api = "/" + path.replace("src/app/api/", "").replace("/route.ts", "")
    if api.endswith("/[entity]"):
        api = api.replace("/[entity]", "/[entity: listings|requests|transactions|experts]")
    api = api.replace("[id]", "{id}").replace("[slug]", "{slug}")
    methods = re.findall(r"export async function (GET|POST|PUT|PATCH|DELETE)", src)
    guards = []
    if "requireRole(request" in src or "requireRole(req" in src:
        m = re.findall(r'requireRole\(\s*(?:request|req),\s*"([A-Z]+)"', src)
        guards = [f"requireRole:{'|'.join(m) if m else 'OWNER'}"]
    elif "requireSessionAsync" in src:
        guards = ["requireSessionAsync (هر نقش واردشده)"]
    elif re.search(r"extractBearer|validateSession", src):
        guards = ["بررسی دستی توکن"]
    else:
        guards = ["عمومی (بدون گارد)"]
    # ریسک: روت غیرعمومی بدون گارد نشست؟
    risk = ""
    if guards == ["عمومی (بدون گارد)"]:
        risk = "بررسی دستی لازم"
    routes.append({"route": api, "methods": methods, "guard": guards[0], "risk": risk or None})

json.dump({"task": "PN-008 BLOCK 4 — اسکن ایستای نقش‌ها", "at": __import__("datetime").datetime.now().isoformat(),
           "totalRoutes": len(routes), "routes": routes},
          open("download/pn008/roles-scan.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(f"routes: {len(routes)}")
from collections import Counter
c = Counter(r["guard"] for r in routes)
for k, v in c.most_common(): print(f"  {v:3d} × {k}")
PYEOF
echo "---خروجی: $OUT---"
