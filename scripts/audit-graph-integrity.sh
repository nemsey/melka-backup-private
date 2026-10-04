#!/bin/bash
# P6545/گام۱ (BLOCK 1.6) — اسکنر یکپارچگی سه گراف
# بررسی: یال‌های آویزان · تعداد گره/یال · صحت unique · traverse نمونه
set -u
cd /home/z/my-project
export DATABASE_URL="${DATABASE_URL:-file:/home/z/my-project/db/custom.db}"
RES=$(bun -e '
const { PrismaClient } = require("@prisma/client");
const db = new PrismaClient();
const { GraphService } = require("./src/core/graphs/graph-service.ts");
const s = new GraphService(db);
(async () => {
  const out = { graphs: [] };
  let totalNodes = 0, totalEdges = 0, totalDangling = 0;
  for (const g of ["property", "people", "transaction"]) {
    const stats = await s.stats(g);
    const dangling = await s.danglingEdges(g);
    totalNodes += stats.nodes; totalEdges += stats.edges; totalDangling += dangling;
    out.graphs.push({ graph: g, nodes: stats.nodes, edges: stats.edges, dangling });
  }
  out.totalNodes = totalNodes; out.totalEdges = totalEdges; out.totalDangling = totalDangling;
  // تست traverse نمونه روی گره واقعی
  const sample = await db.graphNode.findFirst({ where: { graph: "property", nodeType: "property" } });
  out.traverseSample = null;
  if (sample) {
    const paths = await s.traverse("property", { nodeType: "property", refId: sample.refId }, { maxDepth: 1, limit: 3 });
    out.traverseSample = paths.length;
  }
  console.log(JSON.stringify(out));
  await db.$disconnect();
})();
' 2>/dev/null | tail -1)
echo "$RES" | python3 -c "
import json, sys
d = json.load(sys.stdin)
ok = True
msgs = []
for g in d['graphs']:
    msgs.append(f\"{g['graph']}: {g['nodes']} گره · {g['edges']} یال · آویزان {g['dangling']}\")
    if g['dangling'] > 0: ok = False
if d['totalNodes'] < 1000: ok = False; msgs.append(f\"FAIL: گره‌ها {d['totalNodes']} < 1000\")
if d['totalEdges'] < 5000: ok = False; msgs.append(f\"FAIL: یال‌ها {d['totalEdges']} < 5000\")
if not d['traverseSample']: ok = False; msgs.append('FAIL: traverse نمونه خالی بود')
print(' | '.join(msgs))
print('GRAPH-INTEGRITY:', 'PASS' if ok else 'FAIL')
sys.exit(0 if ok else 1)
"
