/**
 * بینایی کامل — گراف یکپارچه (PN-025 / فاز ۱۳-ج / ستون ۲)
 * ---------------------------------------------------------------------------
 * لایهٔ پرس‌وجوی یکپارچه روی چهار جزیرهٔ موجود (ملک/اشخاص/معاملات + علّی + زمانی):
 * داده کپی نمی‌شود — سرویس یال‌ها را از رکوردهای زنده می‌سازد و این هستهٔ خالص
 * پیمایش + وزن + گیت DAG + روایت فارسی را انجام می‌دهد.
 *
 * قانون DAG (قید سفارش — مرحلهٔ ۵): هر گراف خروجی باید DAG باشد؛
 * چرخه ⇒ خطای fail-loud (گیت ساخت در سرویس + گیت بارگذاری اینجا).
 *
 * خلوص لایهٔ هوش: هیچ وابستگی به DB و هیچ فراخوانی شبکه‌ای (گارد audit-intelligence-boundary).
 */

// ═══════════════ قرارداد نوع‌ها (عین سفارش — ستون ۲) ═══════════════

export type UnifiedNodeType = "property" | "person" | "transaction" | "causal" | "temporal";

export interface UnifiedGraphQuery {
  fromType: UnifiedNodeType;
  fromId: string;
  /** محدودکردن انواع یال — پیش‌فرض همه */
  pathTypes?: string[];
  /** عمق پیمایش — پیش‌فرض ۳ · سقف سخت ۵ */
  maxDepth?: number;
}

export interface GraphNode {
  type: UnifiedNodeType;
  id: string;          // شناسهٔ نرمال‌شده (مثلاً «property:34826» یا «person:احمدی»)
  label: string;       // برچسب فارسی برای روایت
}

/** انواع یال معنایی — نُه نوع (فصل ۲.۴ سند طراحی) */
export const EDGE_TYPES = [
  "OWNED_BY", "LISTED_BY", "REQUESTED_BY", "TRANSACTION_PARTY",
  "INTERACTED", "SIBLING_AREA", "CAUSES", "PRECEDES", "SAME_BRANCH",
] as const;
export type EdgeType = (typeof EDGE_TYPES)[number];

export interface GraphEdge {
  from: string;         // nodeId
  to: string;           // nodeId
  type: EdgeType;
  weight: number;       // 0..1 — معناداری یال
  label?: string;       // برچسب فارسی یال برای روایت
}

export interface GraphPath {
  nodes: GraphNode[];
  edges: GraphEdge[];
  weight: number;       // ترکیب وزن یال‌ها (میانگین هندسی)
}

export interface GraphVision {
  paths: GraphPath[];
  insights: string[];   // روایت فارسی — قالب‌های E_GRAPH_PATH و …
  confidence: number;   // 0..1
}

/** گراف درون‌حافظه‌ای — سرویس آن را از رکوردها می‌سازد و اینجا پیمایش می‌شود */
export interface InMemoryGraph {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];   // یک‌جهته — سرویس جهت را قطعی می‌کند
}

// ═══════════════ ثابت‌های پیمایش ═══════════════

export const DEFAULT_MAX_DEPTH = 3;
export const HARD_MAX_DEPTH = 5;
export const MAX_PATHS = 10;

/** وزن یال پایه بر اساس نوع (فصل ۲.۴ سند طراحی) */
export const EDGE_BASE_WEIGHT: Readonly<Record<EdgeType, number>> = {
  OWNED_BY: 0.9,
  LISTED_BY: 0.8,
  REQUESTED_BY: 0.8,
  TRANSACTION_PARTY: 0.9,
  INTERACTED: 0.5,
  SIBLING_AREA: 0.3,
  CAUSES: 0.75, // وزن نهایی با abs(coefficient) در سرویس بازنویسی می‌شود
  PRECEDES: 0.4,
  SAME_BRANCH: 0.4,
};

// ═══════════════ گیت DAG — Kahn (دو-گیت: ساخت در سرویس · بارگذاری اینجا) ═══════════════

/**
 * آیا گراف یال‌های داده‌شده DAG است؟ (Kahn — مستقل از موتور ۱۳ برای گارد)
 * چرخه یعنی خطای داده یا منطق — fail-loud.
 */
export function isDag(edges: readonly GraphEdge[]): boolean {
  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    adj.set(e.from, [...(adj.get(e.from) ?? []), e.to]);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
    if (!indeg.has(e.from)) indeg.set(e.from, indeg.get(e.from) ?? 0);
    if (!adj.has(e.to)) adj.set(e.to, []);
  }
  const queue = [...indeg.entries()].filter(([, d]) => d === 0).map(([n]) => n);
  let visited = 0;
  while (queue.length > 0) {
    const cur = queue.shift()!;
    visited += 1;
    for (const next of adj.get(cur) ?? []) {
      const d = (indeg.get(next) ?? 1) - 1;
      indeg.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  return visited === indeg.size;
}

/** گیت بارگذاری — چرخه ⇒ پرتاب (نه سکوت) */
export function assertDag(edges: readonly GraphEdge[]): void {
  if (!isDag(edges)) {
    throw new Error("[unified-graph] گراف یکپارچه چرخه دارد — رد کامل نتیجه (قانون DAG)");
  }
}

// ═══════════════ وزن مسیر ═══════════════

/** وزن مسیر = میانگین هندسی وزن یال‌ها — مسیر کوتاه و پروزن برنده */
export function pathWeight(edges: readonly GraphEdge[]): number {
  if (edges.length === 0) return 0;
  const logSum = edges.reduce((acc, e) => acc + Math.log(Math.max(1e-9, e.weight)), 0);
  return Math.round(Math.exp(logSum / edges.length) * 1e4) / 1e4;
}

// ═══════════════ پیمایش — BFS محدود‌به‌عمق با ضدچرخه درونی ═══════════════

/** شناسهٔ نرمال گره — «type:id» با trim و فشرده‌سازی فاصله */
export function nodeId(type: UnifiedNodeType, id: string): string {
  return `${type}:${id.replace(/\s+/g, " ").trim()}`;
}

/**
 * بینایی یکپارچه — پیمایش خالص روی گراف درون‌حافظه‌ای.
 *
 * الگو: BFS سطح‌به‌سطح با سقف عمق (clamp در [1, HARD_MAX_DEPTH]) و
 * ضدچرخه درونی (گره تکراری در مسیر جاری رد می‌شود). گره‌های «شخص» و «ملک»
 * پایانهٔ معنایی‌اند: رسیدن به آن‌ها = ثبت مسیر کامل.
 */
export function unifiedVision(graph: InMemoryGraph, query: UnifiedGraphQuery): GraphVision {
  const rootId = nodeId(query.fromType, query.fromId);
  const root = graph.nodes.get(rootId);
  if (!root) {
    return { paths: [], insights: ["شناسهٔ مورد نظر در گراف شناخته نشد — بدون هیچ مسیر"], confidence: 0 };
  }

  const maxDepth = Math.min(HARD_MAX_DEPTH, Math.max(1, query.maxDepth ?? DEFAULT_MAX_DEPTH));
  const allowedTypes = query.pathTypes && query.pathTypes.length > 0 ? new Set(query.pathTypes) : null;

  // مجاورتی یک‌جهته
  const adj = new Map<string, GraphEdge[]>();
  for (const e of graph.edges) {
    if (allowedTypes && !allowedTypes.has(e.type)) continue;
    adj.set(e.from, [...(adj.get(e.from) ?? []), e]);
  }

  interface FrontierItem { node: GraphNode; path: GraphPath; visited: Set<string> }
  const frontier: FrontierItem[] = [{ node: root, path: { nodes: [root], edges: [], weight: 1 }, visited: new Set([rootId]) }];
  const found: GraphPath[] = [];
  const seenGlobal = new Set<string>([rootId]);

  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth += 1) {
    const next: FrontierItem[] = [];
    for (const item of frontier) {
      for (const edge of adj.get(nodeId(item.node.type, item.node.id)) ?? []) {
        if (item.visited.has(edge.to)) continue; // ضدچرخه درونی
        const target = graph.nodes.get(edge.to);
        if (!target) continue;
        const newPath: GraphPath = {
          nodes: [...item.path.nodes, target],
          edges: [...item.path.edges, edge],
          weight: 0,
        };
        if (target.type === "person" || target.type === "property") {
          newPath.weight = pathWeight(newPath.edges);
          found.push(newPath); // پایانهٔ معنایی — مسیر کامل
        }
        if (!seenGlobal.has(edge.to)) {
          seenGlobal.add(edge.to);
          next.push({ node: target, path: newPath, visited: new Set([...item.visited, edge.to]) });
        }
      }
    }
    if (next.length === 0) break;
    frontier.length = 0;
    frontier.push(...next);
  }

  // top-K بر اساس وزن
  const paths = found.sort((a, b) => b.weight - a.weight).slice(0, MAX_PATHS);

  // گیت بارگذاری DAG — خروجی هرگز چرخه ندارد (قید سفارش)
  assertDag(paths.flatMap((p) => p.edges));

  // روایت فارسی — بدون LLM: قالب ثابت + متغیرها (فصل ۶)
  const insights = narratePaths(paths);
  const confidence = paths.length > 0 ? Math.min(1, Math.max(0, paths.reduce((a, p) => a + p.weight, 0) / paths.length)) : 0;

  return { paths, insights, confidence: Math.round(confidence * 1e4) / 1e4 };
}

// ═══════════════ روایت مسیرها — قالب‌های فارسی ثابت ═══════════════

/** برچسب فارسی انواع یال (شخص ثالث نباید کد انگلیسی ببیند) */
export const EDGE_LABELS_FA: Readonly<Record<EdgeType, string>> = {
  OWNED_BY: "مالکیت",
  LISTED_BY: "آگهی‌گذاری",
  REQUESTED_BY: "درخواست",
  TRANSACTION_PARTY: "معامله",
  INTERACTED: "بازدید/تماس",
  SIBLING_AREA: "هم‌منطقه",
  CAUSES: "علّت",
  PRECEDES: "پیش از",
  SAME_BRANCH: "هم‌شعبه",
};

function faDigits(n: number): string {
  return String(n).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

/** روایت یک مسیر — «{from} از مسیر {via} به {to} وصل است — وزن مسیر {weight}» */
export function narratePath(p: GraphPath): string {
  if (p.edges.length === 0) return "";
  const from = p.nodes[0]!.label;
  const to = p.nodes[p.nodes.length - 1]!.label;
  const via = p.edges.map((e) => EDGE_LABELS_FA[e.type]).join(" ← ");
  const weight = faDigits(Math.round(p.weight * 100));
  return `${from} از مسیر «${via}» به ${to} وصل است — وزن ارتباط ${weight} از ۱۰۰`;
}

function narratePaths(paths: readonly GraphPath[]): string[] {
  const insights = paths.map(narratePath).filter(Boolean);
  if (insights.length === 0) {
    return ["هیچ مسیر ارتباطی یافت نشد — این دو بستر هنوز به هم وصل نیستند"];
  }
  return insights;
}
