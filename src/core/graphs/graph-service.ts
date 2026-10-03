/**
 * P6545 / گام ۱ — BLOCK 1.2: سه گراف اصلی ملکا (جلسه ۰۰۷/۰۲۲/۰۳۰)
 * ---------------------------------------------------------------------------
 * گراف ۱ — Property Graph (گراف ملک): گره ملک + یال‌های ملک↔مالک/آگهی/معامله/منطقه
 * گراف ۲ — People Graph (گراف افراد): گره شخص/کارشناس + یال‌های مالکیت/معامله/تقاضا
 * گراف ۳ — Transaction Graph (گراف معاملات): گره معامله + یال‌های ملک/خریدار/فروشنده/کارشناس
 *
 * قرارداد (عین جلسه ۰۳۳): هر گراف nodes, edges, traverse, findPath, query
 * ذخیره: جداول generic گراف در دیتابیس (GraphNode / GraphEdge) — نه in-memory
 * قید قانون تثبیت: additive-only — صف حذف نمی‌شود، فقط deprecatedAt می‌خورد.
 */

import type { PrismaClient } from "@prisma/client";

export type GraphName = "property" | "people" | "transaction";

export type NodeType =
  | "property" // ملک (PropertyRecord — refId=propertyCode)
  | "area" // منطقه (refId=areaId یا نام منطقه)
  | "person" // شخص حقیقی (مالک/خریدار/فروشنده/مشتری — refId=موبایل نرمال یا نام)
  | "expert" // کارشناس (ExpertRecord — refId=personnelCode)
  | "customer" // مشتری رجیستری (CustomerRecord)
  | "transaction" // معامله (TransactionRecord — refId=id)
  | "request"; // درخواست (RequestRecord — refId=id)

export type EdgeType =
  | "located_in" // ملک ↔ منطقه
  | "owned_by" // ملک ↔ مالک
  | "listed_by" // ملک ↔ کارشناس ثبت‌کننده
  | "owns" // فرد ↔ ملک (روایت گراف افراد)
  | "requested" // فرد ↔ درخواست
  | "bought" // فرد ↔ معامله
  | "sold" // فرد ↔ معامله
  | "brokered_by" // معامله/ملک ↔ کارشناس
  | "involves_property" // معامله ↔ ملک
  | "involves_request"; // معامله ↔ درخواست

export interface GraphNodeInput {
  nodeType: NodeType;
  refId: string;
  label?: string | null;
  props?: Record<string, unknown>;
}

export interface GraphEdgeInput {
  fromType: NodeType;
  fromRef: string;
  toType: NodeType;
  toRef: string;
  edgeType: EdgeType;
  weight?: number;
  props?: Record<string, unknown>;
}

export interface NodeHandle {
  nodeType: NodeType | string;
  refId: string;
}

export interface TraverseOptions {
  maxDepth?: number;
  edgeTypes?: EdgeType[];
  direction?: "out" | "in" | "both";
  limit?: number;
}

export interface TraversePath {
  nodes: Array<{ nodeType: string; refId: string; label: string | null }>;
  edges: Array<{ edgeType: string; fromRef: string; toRef: string }>;
  depth: number;
}

export interface GraphStats {
  graph: GraphName;
  nodes: number;
  edges: number;
  byNodeType: Record<string, number>;
  byEdgeType: Record<string, number>;
}

/** منبع یگانهٔ serialize ویژگی‌ها */
export function serializeProps(props?: Record<string, unknown>): string | null {
  if (!props || Object.keys(props).length === 0) return null;
  return JSON.stringify(props);
}

/**
 * سرویس عمومی گراف — عملیات مشترک هر سه گراف روی جداول DB.
 * هر متد با نام گراف صدا زده می‌شود: nodes/edges/traverse/findPath/query.
 */
export class GraphService {
  constructor(private readonly db: PrismaClient) {}

  /* ───────────────────────── نوشتن (upsert افزودنی) ───────────────────────── */

  async upsertNodes(graph: GraphName, nodes: GraphNodeInput[], chunk = 500): Promise<number> {
    // SQLite از skipDuplicates پشتیبانی نمی‌کند — پالایش با کلیدهای موجود (افزودنی ایمن)
    const existing = new Set(
      (await this.db.graphNode.findMany({ where: { graph }, select: { nodeType: true, refId: true } }))
        .map((n) => `${n.nodeType}:${n.refId}`),
    );
    const seen = new Set<string>();
    const fresh = nodes.filter((n) => {
      const key = `${n.nodeType}:${n.refId}`;
      if (existing.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    let written = 0;
    for (let i = 0; i < fresh.length; i += chunk) {
      const slice = fresh.slice(i, i + chunk);
      await this.db.graphNode.createMany({
        data: slice.map((n) => ({
          graph,
          nodeType: n.nodeType,
          refId: n.refId,
          label: n.label ?? null,
          propsJson: serializeProps(n.props),
        })),
      });
      written += slice.length;
    }
    return written;
  }

  async upsertEdges(graph: GraphName, edges: GraphEdgeInput[], chunk = 500): Promise<number> {
    const existing = new Set(
      (await this.db.graphEdge.findMany({ where: { graph }, select: { fromType: true, fromRef: true, toType: true, toRef: true, edgeType: true } }))
        .map((e) => `${e.fromType}:${e.fromRef}>${e.toType}:${e.toRef}:${e.edgeType}`),
    );
    const seen = new Set<string>();
    const fresh = edges.filter((e) => {
      const key = `${e.fromType}:${e.fromRef}>${e.toType}:${e.toRef}:${e.edgeType}`;
      if (existing.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    let written = 0;
    for (let i = 0; i < fresh.length; i += chunk) {
      const slice = fresh.slice(i, i + chunk);
      await this.db.graphEdge.createMany({
        data: slice.map((e) => ({
          graph,
          fromType: e.fromType,
          fromRef: e.fromRef,
          toType: e.toType,
          toRef: e.toRef,
          edgeType: e.edgeType,
          weight: e.weight ?? 1,
          propsJson: serializeProps(e.props),
        })),
      });
      written += slice.length;
    }
    return written;
  }

  /* ───────────────────────── خواندن ───────────────────────── */

  async nodes(
    graph: GraphName,
    opts: { nodeType?: string; refId?: string; search?: string; limit?: number } = {},
  ) {
    const where: Record<string, unknown> = { graph };
    if (opts.nodeType) where.nodeType = opts.nodeType;
    if (opts.refId) where.refId = opts.refId;
    if (opts.search) where.label = { contains: opts.search };
    return this.db.graphNode.findMany({ where, take: opts.limit ?? 50, orderBy: { refId: "asc" } });
  }

  async edges(
    graph: GraphName,
    opts: { edgeType?: string; fromRef?: string; toRef?: string; limit?: number } = {},
  ) {
    const where: Record<string, unknown> = { graph };
    if (opts.edgeType) where.edgeType = opts.edgeType;
    if (opts.fromRef) where.fromRef = opts.fromRef;
    if (opts.toRef) where.toRef = opts.toRef;
    return this.db.graphEdge.findMany({ where, take: opts.limit ?? 50 });
  }

  async nodeCount(graph: GraphName, nodeType?: string): Promise<number> {
    return this.db.graphNode.count({ where: { graph, ...(nodeType ? { nodeType } : {}) } });
  }

  async edgeCount(graph: GraphName, edgeType?: string): Promise<number> {
    return this.db.graphEdge.count({ where: { graph, ...(edgeType ? { edgeType } : {}) } });
  }

  /* ───────────────────────── traverse (BFS) ───────────────────────── */

  /** پیمایش عرض-اول از یک گره — مسیرهای یافت‌شده با عمق محدود */
  async traverse(graph: GraphName, start: NodeHandle, opts: TraverseOptions = {}): Promise<TraversePath[]> {
    const maxDepth = Math.min(Math.max(opts.maxDepth ?? 2, 1), 4);
    const limit = Math.min(opts.limit ?? 20, 100);
    const edgeTypes = opts.edgeTypes;
    const direction = opts.direction ?? "both";

    const labelCache = new Map<string, string | null>();
    const labelOf = async (nodeType: string, refId: string): Promise<string | null> => {
      const key = `${nodeType}:${refId}`;
      if (!labelCache.has(key)) {
        const n = await this.db.graphNode.findFirst({ where: { graph, nodeType, refId }, select: { label: true } });
        labelCache.set(key, n?.label ?? null);
      }
      return labelCache.get(key) ?? null;
    };

    const results: TraversePath[] = [];
    const visited = new Set<string>([`${start.nodeType}:${start.refId}`]);
    let frontier: TraversePath[] = [
      { nodes: [{ nodeType: start.nodeType, refId: start.refId, label: await labelOf(start.nodeType, start.refId) }], edges: [], depth: 0 },
    ];

    for (let depth = 1; depth <= maxDepth && results.length < limit; depth++) {
      const next: TraversePath[] = [];
      for (const path of frontier) {
        if (results.length >= limit) break;
        const tail = path.nodes[path.nodes.length - 1];
        const where: Record<string, unknown> = { graph };
        if (edgeTypes?.length) where.edgeType = { in: edgeTypes };
        if (direction === "in") {
          where.toType = tail.nodeType;
          where.toRef = tail.refId;
        } else {
          where.OR = [
            { fromType: tail.nodeType, fromRef: tail.refId },
            { toType: tail.nodeType, toRef: tail.refId },
          ];
        }
        const outEdges = await this.db.graphEdge.findMany({ where, take: limit * 4 });
        for (const e of outEdges) {
          const forward = e.fromType === tail.nodeType && e.fromRef === tail.refId;
          const nextNode = forward
            ? { nodeType: e.toType, refId: e.toRef }
            : { nodeType: e.fromType, refId: e.fromRef };
          const key = `${nextNode.nodeType}:${nextNode.refId}`;
          if (visited.has(key)) continue; // بدون تکرار گره در یک مسیر
          visited.add(key);
          const extended: TraversePath = {
            nodes: [...path.nodes, { ...nextNode, label: await labelOf(nextNode.nodeType, nextNode.refId) }],
            edges: [...path.edges, { edgeType: e.edgeType, fromRef: e.fromRef, toRef: e.toRef }],
            depth,
          };
          results.push(extended);
          next.push(extended);
          if (results.length >= limit) break;
        }
      }
      frontier = next;
      if (frontier.length === 0) break;
    }
    return results;
  }

  /* ───────────────────────── findPath (کوتاه‌ترین مسیر BFS) ───────────────────────── */

  /** کوتاه‌ترین مسیر بین دو گره (BFS روی یال‌های دوطرفه) — null اگر در عمق مجاز نباشد */
  async findPath(
    graph: GraphName,
    from: NodeHandle,
    to: NodeHandle,
    opts: { maxDepth?: number } = {},
  ): Promise<TraversePath | null> {
    const maxDepth = Math.min(Math.max(opts.maxDepth ?? 3, 1), 4);
    const fromKey = `${from.nodeType}:${from.refId}`;
    const toKey = `${to.nodeType}:${to.refId}`;
    if (fromKey === toKey) return { nodes: [], edges: [], depth: 0 };

    const visited = new Set<string>([fromKey]);
    const queue: TraversePath[] = [
      { nodes: [{ nodeType: from.nodeType, refId: from.refId, label: null }], edges: [], depth: 0 },
    ];
    while (queue.length > 0) {
      const path = queue.shift()!;
      if (path.depth >= maxDepth) continue;
      const tail = path.nodes[path.nodes.length - 1];
      const outEdges = await this.db.graphEdge.findMany({
        where: {
          graph,
          OR: [
            { fromType: tail.nodeType, fromRef: tail.refId },
            { toType: tail.nodeType, toRef: tail.refId },
          ],
        },
        take: 200,
      });
      for (const e of outEdges) {
        const forward = e.fromType === tail.nodeType && e.fromRef === tail.refId;
        const nextNode = forward ? { nodeType: e.toType, refId: e.toRef } : { nodeType: e.fromType, refId: e.fromRef };
        const key = `${nextNode.nodeType}:${nextNode.refId}`;
        if (visited.has(key)) continue;
        const extended: TraversePath = {
          nodes: [...path.nodes, { ...nextNode, label: null }],
          edges: [...path.edges, { edgeType: e.edgeType, fromRef: e.fromRef, toRef: e.toRef }],
          depth: path.depth + 1,
        };
        if (key === toKey) return extended;
        visited.add(key);
        queue.push(extended);
      }
    }
    return null;
  }

  /* ───────────────────────── query ───────────────────────── */

  /** پرس‌وجوی ترکیبی: همسایه‌های یک گره بر اساس نوع یال/گره مقصد */
  async neighbors(
    graph: GraphName,
    node: NodeHandle,
    opts: { edgeType?: string; direction?: "out" | "in" | "both"; limit?: number } = {},
  ) {
    const direction = opts.direction ?? "both";
    const clauses: Record<string, unknown>[] = [];
    if (direction !== "in") clauses.push({ fromType: node.nodeType, fromRef: node.refId });
    if (direction !== "out") clauses.push({ toType: node.nodeType, toRef: node.refId });
    const where: Record<string, unknown> = { graph, OR: clauses };
    if (opts.edgeType) where.edgeType = opts.edgeType;
    return this.db.graphEdge.findMany({ where, take: opts.limit ?? 50 });
  }

  /** آمار گراف — شاهد ساخت */
  async stats(graph: GraphName): Promise<GraphStats> {
    const [nodes, edges] = await Promise.all([
      this.db.graphNode.groupBy({ by: ["nodeType"], where: { graph }, _count: true }),
      this.db.graphEdge.groupBy({ by: ["edgeType"], where: { graph }, _count: true }),
    ]);
    const byNodeType: Record<string, number> = {};
    let nodeTotal = 0;
    for (const n of nodes) {
      byNodeType[n.nodeType] = n._count;
      nodeTotal += n._count;
    }
    const byEdgeType: Record<string, number> = {};
    let edgeTotal = 0;
    for (const e of edges) {
      byEdgeType[e.edgeType] = e._count;
      edgeTotal += e._count;
    }
    return { graph, nodes: nodeTotal, edges: edgeTotal, byNodeType, byEdgeType };
  }

  /** یکپارچگی: یال‌های آویزان (سر یا ته بدون گره) — برای اسکنر audit-graph-integrity */
  async danglingEdges(graph: GraphName): Promise<number> {
    const edges = await this.db.graphEdge.findMany({ where: { graph }, select: { fromType: true, fromRef: true, toType: true, toRef: true } });
    const nodeKeys = new Set(
      (await this.db.graphNode.findMany({ where: { graph }, select: { nodeType: true, refId: true } })).map((n) => `${n.nodeType}:${n.refId}`),
    );
    let dangling = 0;
    for (const e of edges) {
      if (!nodeKeys.has(`${e.fromType}:${e.fromRef}`) || !nodeKeys.has(`${e.toType}:${e.toRef}`)) dangling += 1;
    }
    return dangling;
  }
}
