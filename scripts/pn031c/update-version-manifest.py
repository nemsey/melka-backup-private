#!/usr/bin/env python3
# PN-031-C — به‌روزرسانی مانیفست api-versioning.json (۱۰۶ → ۱۰۷: code-status)
# همان قرارداد PN-012: هر روت اصلی + آینهٔ v1 · سابقه در history
import json, os, datetime, glob

routes = []
for path in glob.glob("src/app/api/**/route.ts", recursive=True):
    rel = os.path.dirname(path).replace("src/app/api/", "").replace("src/app/api", "")
    if rel.startswith("v1/") or rel == "v1":
        continue
    if not rel:
        continue
    routes.append({"v1": f"/api/v1/{rel}", "original": f"/api/{rel}"})
routes.sort(key=lambda r: r["original"])

m = json.load(open("download/pn012/api-versioning.json"))
m["totalRoutes"] = len(routes)
m["routes"] = routes
m["generatedAt"] = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
m.setdefault("history", []).append({
    "at": m["generatedAt"],
    "change": "PN-031-C (شورا-ن۰۴۰): روت code-status (وضعیت کد راه‌اندازی بخشنده) + آینهٔ v1 — ۱۰۶ → ۱۰۷ روت",
})
json.dump(m, open("download/pn012/api-versioning.json", "w"), ensure_ascii=False, indent=2)
print(f"totalRoutes={len(routes)} · sample new: /api/admin/relay/code-status present =",
      any(r["original"] == "/api/admin/relay/code-status" for r in routes))
