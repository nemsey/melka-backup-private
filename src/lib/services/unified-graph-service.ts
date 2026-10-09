/**
 * سرویس بینایی کامل — گراف یکپارچه (PN-025 / فاز ۱۳-ج / ستون ۲)
 * ---------------------------------------------------------------------------
 * یال‌ها و گره‌ها را از رکوردهای زندهٔ DB می‌سازد (کپی نمی‌کند — منبع واحد)
 * و هستهٔ خالص unified-graph را برای پیمایش صدا می‌زند.
 *
 * گیت DAG ساخت: هر یال تازه پیش از افزودن با isDag چرخه‌سنجی می‌شود —
 * یال چرخه‌ساز = skip با ثبت خطا (نه کرش — دادهٔ کثیف نباید سرویس را بکشد).
 */

import { db } from "@/lib/db";
import { loadGraph } from "@/lib/services/causal-graph-store";
import { matchTabrizBranch } from "@/lib/branches";
import {
  EDGE_BASE_WEIGHT,
  assertDag,
  nodeId,
  unifiedVision,
  type EdgeType,
  type GraphEdge,
  type GraphNode,
  type InMemoryGraph,
  type UnifiedGraphQuery,
  type GraphVision,
  type UnifiedNodeType,
} from "@/core/intelligence/unified-graph";

/** نرمال‌سازی نام اشخاص — trim + فشرده‌سازی فاصله (همان الگوی M3) */
function normalizePerson(name: string | null | undefined): string | null {
  if (!name) return null;
  const v = name.replace(/\s+/g, " ").trim();
  return v.length >= 2 ? v : null;
}

/** ساخت گراف درون‌حافظه‌ای از دادهٔ زنده — محدودهٔ معقول (سقف حفاظتی) */
export async function buildInMemoryGraph(opts?: { focusAreas?: string[] }): Promise<InMemoryGraph> {
  const nodes = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];

  // مجاورتی برای گیت DAG ساخت — آیا «to» از قبل به «from» می‌رسد؟ (رسیدنی‌بودن DFS)
  const reach: Map<string, Set<string>> = new Map();
  function canReach(from: string, to: string): boolean {
    if (from === to) return true;
    const seen = new Set<string>([from]);
    const stack = [from];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      for (const nxt of reach.get(cur) ?? []) {
        if (nxt === to) return true;
        if (!seen.has(nxt)) {
          seen.add(nxt);
          stack.push(nxt);
        }
      }
    }
    return false;
  }

  const addNode = (type: UnifiedNodeType, id: string, label: string) => {
    const key = nodeId(type, id);
    if (!nodes.has(key)) nodes.set(key, { type, id, label });
    return key;
  };
  const addEdge = (from: string, to: string, type: EdgeType, weight?: number, label?: string) => {
    if (from === to) return; // خودگرد ممنوع
    // گیت DAG ساخت (افزایشی — بدون کپی): یال چرخه‌ساز هرگز وارد نمی‌شود (قید سفارش)
    if (canReach(to, from)) return;
    if (!reach.has(from)) reach.set(from, new Set());
    reach.get(from)!.add(to);
    if (!reach.has(to)) reach.set(to, new Set());
    edges.push({ from, to, type, weight: weight ?? EDGE_BASE_WEIGHT[type], label });
  };

  // ═══ ۱) گراف ملک-اشخاص (از آگهی‌ها — ۸۰۰ تازه‌ترین) ═══
  // نکتهٔ نگاشت (property.repository): ownerName = کارشناس ثبت‌کننده · rawOwnerName = مالک واقعی
  const listings = await db.propertyRecord.findMany({
    orderBy: { updatedAt: "desc" },
    take: 800,
    select: { propertyCode: true, rawOwnerName: true, ownerName: true, areaName: true },
  });
  for (const l of listings) {
    if (!l.propertyCode) continue;
    const propKey = addNode("property", l.propertyCode, `ملک ${l.propertyCode}`);
    const owner = normalizePerson(l.rawOwnerName);
    if (owner) {
      const ownerKey = addNode("person", owner, `مالک ${owner}`);
      addEdge(propKey, ownerKey, "OWNED_BY");
    }
    const realtor = normalizePerson(l.ownerName);
    if (realtor) {
      const realtorKey = addNode("person", realtor, `کارشناس ${realtor}`);
      addEdge(propKey, realtorKey, "LISTED_BY");
    }
  }

  // ═══ ۲) گراف درخواست-متقاضی (از درخواست‌ها — ۴۰۰ تازه‌ترین) ═══
  const requests = await db.requestRecord.findMany({
    orderBy: { createdAt: "desc" },
    take: 400,
    select: { requestCode: true, customerName: true, areaNamesJson: true },
  });
  for (const r of requests) {
    if (!r.requestCode) continue;
    const reqKey = addNode("property", `REQ-${r.requestCode}`, `درخواست ${r.requestCode}`);
    const customer = normalizePerson(r.customerName);
    if (customer) {
      const custKey = addNode("person", customer, `متقاضی ${customer}`);
      addEdge(reqKey, custKey, "REQUESTED_BY");
    }
    // پیوند هم‌منطقه‌ای درخواست ↔ آگهی‌های همان منطقه
    let areas: string[] = [];
    try {
      const parsed = r.areaNamesJson ? (JSON.parse(r.areaNamesJson) as unknown) : [];
      if (Array.isArray(parsed)) areas = parsed.filter((x): x is string => typeof x === "string" && x.length > 0);
    } catch {
      areas = [];
    }
    if (areas.length > 0) {
      const areasSet = new Set(areas);
      let siblingCount = 0;
      for (const l of listings) {
        if (siblingCount >= 25) break; // سقف حفاظتی هر درخواست — ضد انفجار هم‌منطقه
        if (l.areaName && areasSet.has(l.areaName) && l.propertyCode) {
          const targetKey = nodeId("property", l.propertyCode);
          if (nodes.has(targetKey)) {
            addEdge(reqKey, targetKey, "SIBLING_AREA");
            siblingCount += 1;
          }
        }
      }
    }
  }

  // ═══ ۳) گراف معاملات (تا ۸۰۰ معامله — دو طرف + ملک) ═══
  const txs = await db.transactionRecord.findMany({
    take: 800,
    select: { id: true, propertyCode: true, propertyCustomer: true },
  });
  for (const t of txs) {
    const txKey = addNode("transaction", t.id.slice(0, 12), `معاملهٔ ${t.propertyCode ?? "—"}`);
    if (t.propertyCode) {
      const propKey = nodeId("property", t.propertyCode);
      if (nodes.has(propKey)) addEdge(txKey, propKey, "TRANSACTION_PARTY");
    }
    const buyer = normalizePerson(t.propertyCustomer);
    if (buyer) {
      const buyerKey = addNode("person", buyer, `خریدار ${buyer}`);
      addEdge(txKey, buyerKey, "TRANSACTION_PARTY");
    }
  }

  // ═══ ۴) هم‌شعبه‌ای کارشناسان (از رجیستری کارشناسان — نمونهٔ سبک) ═══
  const experts = await db.expertRecord.findMany({
    take: 200,
    where: { active: true },
    select: { fullName: true, businessTitle: true },
  }).catch(() => []);
  const byBranch = new Map<string, string[]>();
  for (const e of experts) {
    const name = normalizePerson(e.fullName);
    if (!name) continue;
    const branch = matchTabrizBranch(e.businessTitle) ?? (e.businessTitle ? e.businessTitle.replace(/\s+/g, " ").trim() : null);
    if (!branch) continue;
    const list = byBranch.get(branch) ?? [];
    list.push(name);
    byBranch.set(branch, list);
  }
  for (const [, names] of byBranch) {
    // هر کارشناس فقط با «نمایندهٔ اول» شعبه یال می‌خورد — ضد انفجار ترکیبیات
    const anchor = names[0]!;
    const anchorKey = nodeId("person", anchor);
    if (!nodes.has(anchorKey)) addNode("person", anchor, `کارشناس ${anchor}`);
    for (const other of names.slice(1, 8)) {
      const otherKey = nodeId("person", other);
      if (!nodes.has(otherKey)) addNode("person", other, `کارشناس ${other}`);
      addEdge(otherKey, anchorKey, "SAME_BRANCH");
    }
  }

  // ═══ ۵) گراف علّی (CausalEdgeRecord — موتور ۱۳) ═══
  const causalGraph = await loadGraph().catch(() => null);
  if (causalGraph) {
    for (const edge of causalGraph.edges) {
      const fromKey = addNode("causal", edge.from, `متغیر ${edge.from}`);
      const toKey = addNode("causal", edge.to, `متغیر ${edge.to}`);
      addEdge(fromKey, toKey, "CAUSES", Math.min(1, Math.abs(edge.coefficient) * (edge.confidence ?? 0.75) + 0.1));
    }
  }

  // گیت نهایی — گراف ساخته‌شده DAG است (قید سفارش؛ یال‌های چرخه‌دار حذف شدند)
  assertDag(edges);
  return { nodes, edges };
}

/**
 * بینایی یک‌پرسشی — ساخت گراف (میتواند متمرکز باشد) + پیمایش خالص.
 * برای بهینگی، گراف یک‌بار در هر فراخوانی ساخته می‌شود (مقیاس فعلی قابل قبول —
 * مسیر رشد: کش میان‌دور، فصل ۱۰ سند طراحی).
 */
export async function unifiedVisionQuery(query: UnifiedGraphQuery): Promise<GraphVision> {
  const graph = await buildInMemoryGraph();
  return unifiedVision(graph, query);
}
