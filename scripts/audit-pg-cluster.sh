#!/usr/bin/env bash
# ============================================================================
# PN-024 — گارد audit-pg-cluster.sh (گام ۵-ف) — J5
# خوشهٔ PostgreSQL تست: حجم > ۵۰۰MB ⇒ پاک‌سازی خودکار (بازسازی‌پذیر —
# pg-lifecycle با یک دستور از نو می‌سازد) + گواه
# (J5 جلسهٔ ۰۳۱: ۶۲۰MB خوشهٔ تست در حادثهٔ ENOSPC نقش داشت)
# خروجی: download/pn024/guards-pg-cluster.json
# ============================================================================
set -uo pipefail
cd /home/z/my-project
OUT=download/pn024/guards-pg-cluster.json

python3 - "$OUT" <<'PYEOF'
import json, os, shutil, subprocess, sys

out_path = sys.argv[1]
os.makedirs(os.path.dirname(out_path), exist_ok=True)

CLUSTER_CANDIDATES = [
    "/tmp/melka-pg-test",              # خوشهٔ embedded استاندارد (pg-lifecycle)
    "/home/z/my-project/.pg-test",     # مسیر ثانویه
    "/home/z/my-project/node_modules/.pg-cluster",
]
LIMIT_MB = 500
actions = []
violations = []
clusters = []

def du_mb(path):
    try:
        total = 0
        for root, _, files in os.walk(path):
            for f in files:
                try:
                    total += os.path.getsize(os.path.join(root, f))
                except OSError:
                    pass
        return round(total / (1024 * 1024), 1)
    except Exception:
        return -1

for c in CLUSTER_CANDIDATES:
    if not os.path.isdir(c):
        clusters.append({"path": c, "exists": False, "sizeMB": 0})
        continue
    size = du_mb(c)
    entry = {"path": c, "exists": True, "sizeMB": size, "limitMB": LIMIT_MB, "over": size > LIMIT_MB}
    if size > LIMIT_MB:
        # پاک‌سازی خودکار — بازسازی‌پذیر با pg-lifecycle (تست PG یک دستور فاصله دارد)
        shutil.rmtree(c, ignore_errors=True)
        entry["cleaned"] = True
        actions.append(f"خوشهٔ {c} ({size}MB > {LIMIT_MB}MB) حذف شد — بازسازی: bun scripts/pg-migrate/pg-lifecycle.ts start")
    else:
        entry["cleaned"] = False
    clusters.append(entry)

# هر خوشه‌ای که پس از پاک‌سازی هنوز هست و بزرگ = شکست (حذف ناموفق)
for e in clusters:
    if e.get("exists") and e.get("cleaned") and os.path.isdir(e["path"]) and du_mb(e["path"]) > LIMIT_MB:
        violations.append(f"پاک‌سازی {e['path']} ناموفق بود")

result = {
    "guard": "audit-pg-cluster",
    "workOrder": "PN-024/J5 — پاک‌سازی خودکار خوشهٔ PG تست > ۵۰۰MB (بازسازی‌پذیر)",
    "generatedAt": __import__("datetime").datetime.utcnow().isoformat() + "Z",
    "rationale": "خوشهٔ تست PG در حادثهٔ ENOSPC جلسهٔ قبل ۶۲۰MB اشغال می‌کرد — دادهٔ تست، بازسازی‌پذیر با pg-lifecycle است",
    "clusters": clusters,
    "actions": actions,
    "violations": violations,
    "pass": not violations,
}
json.dump(result, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(("PASS: خوشه‌های PG تست در سقف — " + "; ".join(actions)) if result["pass"] else "FAIL: " + "; ".join(violations))
sys.exit(0 if result["pass"] else 1)
PYEOF
