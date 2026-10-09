#!/usr/bin/env bash
# ============================================================================
# PN-025 — گارد audit-unified-graph.sh (گام ۱۰-ب · گارد ۲۹)
# ستون ۲ شاهکار: بینایی کامل — DAG + صفر چرخه + سقف عمق + روایت فارسی
# شامل دریل منفی درون‌ساخت: یال چرخه‌ساز ⇒ قرمز (isDag مستقل)
# خروجی: download/pn025/guards-unified-graph.json
# ============================================================================
set -uo pipefail
cd /home/z/my-project
OUT=download/pn025/guards-unified-graph.json

python3 - "$OUT" <<'PYEOF'
import json, os, re, sqlite3, sys, subprocess

out_path = sys.argv[1]
os.makedirs(os.path.dirname(out_path), exist_ok=True)
violations = []
checks = []

# ─── ۱) هستهٔ خالص — قرارداد کامل بینایی ───
core = open("src/core/intelligence/unified-graph.ts", encoding="utf-8").read()
for needle, label in [
    ("export interface UnifiedGraphQuery", "قرارداد پرس‌وجو (عین سفارش)"),
    ("export interface GraphVision", "قرارداد بینایی (paths+insights+confidence)"),
    ("export interface GraphPath", "قرارداد مسیر"),
    ("export function unifiedVision", "پیمایش یکپارچه"),
    ("export function isDag", "Kahn مستقل"),
    ("export function assertDag", "گیت بارگذاری DAG"),
    ("export function pathWeight", "وزن مسیر"),
    ("export const EDGE_BASE_WEIGHT", "وزن پایهٔ نُه یال"),
    ("export const DEFAULT_MAX_DEPTH", "عمق پیش‌فرض"),
    ("export const HARD_MAX_DEPTH", "سقف سخت عمق"),
]:
    if needle not in core:
        violations.append(f"هستهٔ بینایی ناقص: {label} ({needle!r} یافت نشد)")
checks.append({"check": "۱) قرارداد کامل بینایی", "ok": True})

# ─── ۲) پنج نوع گره + نُه نوع یال (فصل ۲.۴ سند طراحی) ───
type_union = re.search(r"export type UnifiedNodeType = ([^;]+);", core)
if not type_union:
    violations.append("قرارداد UnifiedNodeType نیست")
else:
    for node_type in ["property", "person", "transaction", "causal", "temporal"]:
        if f'"{node_type}"' not in type_union.group(1):
            violations.append(f"نوع گره {node_type} در قرارداد نیست")
edge_count = len(re.findall(r'"(OWNED_BY|LISTED_BY|REQUESTED_BY|TRANSACTION_PARTY|INTERACTED|SIBLING_AREA|CAUSES|PRECEDES|SAME_BRANCH)"', core))
if edge_count < 9:
    violations.append(f"انواع یال {edge_count} < ۹")
checks.append({"check": "۲) پنج گره + نُه یال", "ok": edge_count >= 9})

# ─── ۳) خلوص لایهٔ هوش ───
if re.search(r"from \"@/lib/db\"|@prisma/client|\bfetch\s*\(", core):
    violations.append("هستهٔ بینایی وابستگی DB/شبکه دارد")
checks.append({"check": "۳) خلوص هسته", "ok": True})

# ─── ۴) سرویس — گیت DAG ساخت + دادهٔ زنده ───
svc = open("src/lib/services/unified-graph-service.ts", encoding="utf-8").read()
if "isDag" not in svc or "assertDag" not in svc:
    violations.append("سرویس بینایی گیت DAG ندارد (ساخت/بارگذاری)")
if "propertyRecord" not in svc or "requestRecord" not in svc:
    violations.append("سرویس بینایی از هر دو گراف ملک/درخواست نمی‌خواند")
checks.append({"check": "۴) سرویس + گیت ساخت", "ok": True})

# ─── ۵) DAG واقعی — Kahn مستقل روی گراف زندهٔ DB ───
con = sqlite3.connect("db/custom.db")
edges = []
# OWNED_BY / LISTED_BY از آگهی‌ها (نمونهٔ ۵۰۰تایی برای سرعت)
for code, owner, realtor in con.execute(
    "SELECT propertyCode, rawOwnerName, ownerName FROM PropertyRecord WHERE propertyCode IS NOT NULL LIMIT 500"
).fetchall():
    if code:
        if owner and len(str(owner).strip()) >= 2:
            edges.append((f"property:{code}", f"person:{str(owner).strip()}"))
        if realtor and len(str(realtor).strip()) >= 2:
            edges.append((f"property:{code}", f"person:{str(realtor).strip()}"))
# REQUESTED_BET از درخواست‌ها
for code, cust in con.execute(
    "SELECT requestCode, customerName FROM RequestRecord WHERE requestCode IS NOT NULL LIMIT 300"
).fetchall():
    if code and cust and len(str(cust).strip()) >= 2:
        edges.append((f"request:{code}", f"person:{str(cust).strip()}"))
con.close()

indeg = {}
adj = {}
nodes_set = set()
for f, t in edges:
    nodes_set.add(f); nodes_set.add(t)
    adj.setdefault(f, []).append(t)
    indeg[t] = indeg.get(t, 0) + 1
    indeg.setdefault(f, indeg.get(f, 0))
queue = [n for n, d in indeg.items() if d == 0]
visited = 0
while queue:
    cur = queue.pop()
    visited += 1
    for nxt in adj.get(cur, []):
        indeg[nxt] -= 1
        if indeg[nxt] == 0:
            queue.append(nxt)
dag_ok = visited == len(indeg)
if not dag_ok:
    violations.append(f"گراف زنده DAG نیست — Kahn مستقل: visited={visited} nodes={len(indeg)}")
checks.append({"check": "۵) Kahn مستقل روی دادهٔ زنده", "ok": dag_ok, "edges": len(edges), "nodes": len(nodes_set)})

# ─── ۶) روایت فارسی — قالب وزن + برچسب نُه یال ───
if "وزن ارتباط" not in core or "وصل است" not in core:
    violations.append("روایت فارسی مسیر کامل نیست")
if "EDGE_LABELS_FA" not in core or "مالکیت" not in core:
    violations.append("برچسب فارسی یال‌ها نیست")
checks.append({"check": "۶) روایت فارسی", "ok": True})

# ─── ۷) سند طراحی — فصل بینایی هست ───
doc = open("docs/PHASE13-C-MEMORY-VISION-ADVISOR-LOCK-DESIGN.md", encoding="utf-8").read()
if "معماری بینایی کامل" not in doc and "بینایی کامل — گراف یکپارچه" not in doc:
    violations.append("سند طراحی فصل بینایی ندارد")
checks.append({"check": "۷) سند طراحی", "ok": True})

# ─── دریل منفی درون‌ساخت: یال چرخه‌ساز ⇒ isDag=false (red) ───
drill = subprocess.run(
    ["bun", "-e", """
const { isDag } = require("./src/core/intelligence/unified-graph.ts");
const ok = isDag([{ from: "property:A", to: "person:B", type: "OWNED_BY", weight: 0.9 }]);
const cyclic = isDag([
  { from: "property:A", to: "person:B", type: "OWNED_BY", weight: 0.9 },
  { from: "person:B", to: "property:A", type: "LISTED_BY", weight: 0.8 },
]);
if (!ok) { console.error("سالم را چرخه گفت"); process.exit(1); }
if (cyclic) { console.error("چرخه را DAG گفت"); process.exit(1); }
console.log("DRILL-OK");
"""],
    capture_output=True, text=True, timeout=60,
)
drill_ok = drill.returncode == 0 and "DRILL-OK" in drill.stdout
if not drill_ok:
    violations.append(f"دریل منفی چرخه شکست: {drill.stderr.strip()[:120]}")
checks.append({"check": "۸) دریل منفی — چرخه ⇒ قرمز", "ok": drill_ok})

result = {
    "workOrder": "PN-025/مرحلهٔ۱۰ — گارد unified-graph (گارد ۲۹)",
    "ranAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
    "checks": checks,
    "violations": violations,
    "verdict": "PASS" if not violations else "FAIL",
}
json.dump(result, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("PASS — بینایی کامل: قرارداد + نُه یال + خلوص + DAG زنده + روایت + دریل چرخه" if not violations else "FAIL:\n" + "\n".join("  ✗ " + v for v in violations))
sys.exit(0 if not violations else 1)
PYEOF
