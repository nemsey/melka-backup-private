#!/usr/bin/env python3
"""PN-043/فاز ۵ — update api-versioning.json manifest with the new melketun route.
Keeps the manifest in sync with reality (test ۴-و-۸: «با واقعیت هم‌خوان است»)."""
import json
from datetime import datetime, timezone

P = "download/pn012/api-versioning.json"
NEW = {"aliasOf": "/api/integrations/melketun", "v1": "/api/v1/integrations/melketun"}

with open(P, encoding="utf-8") as f:
    manifest = json.load(f)

routes = manifest["routes"]
if not any(r["v1"] == NEW["v1"] for r in routes):
    routes.append(NEW)
    # keep alphabetical order by v1 for readability
    routes.sort(key=lambda r: r["v1"])
    manifest["created"] = manifest.get("created", 0) + 1
    manifest["generatedAt"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")

manifest["totalRoutes"] = len(routes)
with open(P, "w", encoding="utf-8") as f:
    json.dump(manifest, f, ensure_ascii=False, indent=2)
    f.write("\n")

print(f"totalRoutes={manifest['totalRoutes']} created={manifest['created']}")
print(f"melketun registered: {NEW['v1']}")
