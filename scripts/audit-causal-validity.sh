#!/usr/bin/env bash
# ============================================================================
# PN-023-A — گارد audit-causal-validity.sh (گام ۵-ظ)
# اعتبار علّی زنده: DAG معتبر (Kahn روی DB) · همهٔ یال‌ها ≥ کف اطمینان ۰٫۶ ·
# ضریب در بازه · بدون خود-حلقه · دریل منفی چرخه رد می‌شود (خروج ≠ ۰)
# خروجی: download/pn023a/guards-causal-validity.json
# ============================================================================
set -uo pipefail
cd /home/z/my-project
OUT=download/pn023a/guards-causal-validity.json

python3 - "$OUT" <<'PYEOF'
import json, os, sqlite3, subprocess, sys

out_path = sys.argv[1]
os.makedirs(os.path.dirname(out_path), exist_ok=True)
violations = []
checks = []

con = sqlite3.connect("db/custom.db")
con.row_factory = sqlite3.Row
rows = con.execute("SELECT fromFeature, toFeature, coefficient, confidence, method FROM CausalEdgeRecord").fetchall()
con.close()

# ─── ۱) گیت کف اطمینان: همهٔ یال‌های پایدار ≥ ۰٫۶ ───
below = [f"{r['fromFeature']}→{r['toFeature']} ({r['confidence']})" for r in rows if r["confidence"] < 0.6]
if below:
    violations.append(f"{len(below)} یال زیر کف اطمینان ۰٫۶: {below[:5]}")
checks.append({"check": "کف اطمینان ۰٫۶ در DB", "edges": len(rows), "below": len(below), "ok": not below})

# ─── ۲) دامنهٔ ضریب −۱..+۱ و بدون خود-حلقه ───
bad_coef = [r["fromFeature"] for r in rows if not (-1.0 <= r["coefficient"] <= 1.0)]
selfloops = [r["fromFeature"] for r in rows if r["fromFeature"] == r["toFeature"]]
if bad_coef:
    violations.append(f"ضریب خارج بازهٔ −۱..+۱: {bad_coef[:5]}")
if selfloops:
    violations.append(f"خود-حلقه در DB: {selfloops[:5]}")
checks.append({"check": "دامنهٔ ضریب + بدون خود-حلقه", "ok": not bad_coef and not selfloops})

# ─── ۳) روش معتبر ───
bad_method = [f"{r['fromFeature']}→{r['toFeature']}" for r in rows if r["method"] not in ("L1", "L2")]
if bad_method:
    violations.append(f"روش نامعتبر: {bad_method[:5]}")
checks.append({"check": "روش L1/L2", "ok": not bad_method})

# ─── ۴) DAG روی یال‌های پایدار — Kahn مستقل (پیاده‌سازی دومی در گارد) ───
def kahn_cycles(nodes, edges):
    from collections import defaultdict, deque
    adj = defaultdict(list)
    indeg = {n: 0 for n in nodes}
    for a, b in edges:
        adj[a].append(b)
        indeg[b] = indeg.get(b, 0) + 1
    q = deque(n for n in nodes if indeg[n] == 0)
    seen = 0
    while q:
        u = q.popleft()
        seen += 1
        for v in adj[u]:
            indeg[v] -= 1
            if indeg[v] == 0:
                q.append(v)
    return len(nodes) - seen

if rows:
    nodes = sorted({r["fromFeature"] for r in rows} | {r["toFeature"] for r in rows})
    edges = [(r["fromFeature"], r["toFeature"]) for r in rows]
    cyc = kahn_cycles(nodes, edges)
    if cyc > 0:
        violations.append(f"گراف پایدار DB cycle دارد: {cyc} گره در حلقه")
    checks.append({"check": "DAG روی DB (Kahn مستقل)", "nodes": len(nodes), "edges": len(edges), "cyclicNodes": cyc, "ok": cyc == 0})
else:
    checks.append({"check": "DAG روی DB", "edges": 0, "ok": True, "note": "گراف خالی"})

# ─── ۵) دریل منفی: چرخه باید رد شود (خروج ≠ ۰ از موتور) ───
drill = subprocess.run(
    ["bun", "-e", 'const { assertDag } = await import("@/core/intelligence/causal-engine"); try { assertDag(["a","b"], [{from:"a",to:"b"},{from:"b",to:"a"}]); console.log("NOT_DETECTED"); } catch (e) { console.log("DETECTED:" + e.message.slice(0, 40)); }'],
    capture_output=True, text=True, timeout=90,
)
drill_ok = "DETECTED:" in drill.stdout
if not drill_ok:
    violations.append(f"دریل منفی چرخه شکست: خروجی={drill.stdout.strip()[:80]!r}")
checks.append({"check": "دریل منفی — چرخه رد می‌شود", "ok": drill_ok, "witness": drill.stdout.strip()[:80]})

# ─── ۶) دریل منفی دوم: یال زیر کف از سرویس ذخیره نمی‌شود ───
drill2 = subprocess.run(
    ["bun", "-e", 'const { saveGraph } = await import("@/lib/services/causal-graph-store"); const r = await saveGraph({ nodes:["negx","outcome"], edges:[{from:"negx",to:"outcome",coefficient:0.5,confidence:0.2,method:"L1",evidence:"دریل منفی"}], sampleSize:3, builtAt:new Date().toISOString(), dagVerified:true, featureOrder:[] }); console.log("SKIPPED=" + r.skipped + " SAVED=" + r.saved); const { db } = await import("@/lib/db"); await db.causalEdgeRecord.deleteMany({ where: { fromFeature: "negx" } }); await db.$disconnect();'],
    capture_output=True, text=True, timeout=90,
)
drill2_ok = "SKIPPED=1" in drill2.stdout and "SAVED=0" in drill2.stdout
if not drill2_ok:
    violations.append(f"دریل منفی کف اطمینان شکست: خروجی={drill2.stdout.strip()[:80]!r}")
checks.append({"check": "دریل منفی — یال زیر کف رد می‌شود", "ok": drill2_ok, "witness": drill2.stdout.strip()[:80]})

result = {
    "workOrder": "PN-023-A/مرحلهٔ۶ — گارد causal-validity (گام ۵-ظ)",
    "ranAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
    "checks": checks,
    "violations": violations,
    "verdict": "PASS" if not violations else "FAIL",
}
json.dump(result, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("PASS — اعتبار علّی: DAG + کف اطمینان + دو دریل منفی" if not violations else "FAIL:\n" + "\n".join("  ✗ " + v for v in violations))
sys.exit(0 if not violations else 1)
PYEOF
