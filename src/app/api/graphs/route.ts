/**
 * /api/graphs — GET + POST (P6545/گام۱ BLOCK 1.2)
 * ---------------------------------------------------------------------------
 * GET  — آمار سه گراف + پرس‌وجو (nodes/edges/traverse/findPath/neighbors)
 * POST — بازسازی سه گراف از دادهٔ واقعی (فقط OWNER — مجوز شورا برای عملیات نوشتاری)
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { requireRole } from "@/lib/auth/guard";
import { buildPeopleGraph, buildPropertyGraph, buildTransactionGraph, GraphService, type GraphName } from "@/core/graphs";

/** P6545 — db تنبل (الگوی P2-03: روت‌ها هرگز import مستقیم @/lib/db ندارند) */
async function getDb() {
  const mod = (await import("@/lib/db")) as { db: import("@prisma/client").PrismaClient };
  return mod.db;
}


export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const db = await getDb();
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const url = new URL(request.url);
  const graph = (url.searchParams.get("graph") ?? "") as GraphName;
  const op = url.searchParams.get("op") ?? "stats";

  try {
    const service = new GraphService(db);
    if (!graph) {
      // آمار هر سه گراف
      const [property, people, transaction] = await Promise.all([
        service.stats("property"),
        service.stats("people"),
        service.stats("transaction"),
      ]);
      return Response.json({
        ok: true,
        graphs: { property, people, transaction },
        totals: {
          nodes: property.nodes + people.nodes + transaction.nodes,
          edges: property.edges + people.edges + transaction.edges,
        },
        integrity: {
          danglingEdges: {
            property: await service.danglingEdges("property"),
            people: await service.danglingEdges("people"),
            transaction: await service.danglingEdges("transaction"),
          },
        },
      });
    }

    switch (op) {
      case "stats":
        return Response.json({ ok: true, stats: await service.stats(graph) });
      case "nodes": {
        const nodes = await service.nodes(graph, {
          nodeType: url.searchParams.get("nodeType") ?? undefined,
          refId: url.searchParams.get("refId") ?? undefined,
          search: url.searchParams.get("search") ?? undefined,
          limit: Number(url.searchParams.get("limit") ?? 50),
        });
        return Response.json({ ok: true, nodes });
      }
      case "edges": {
        const edges = await service.edges(graph, {
          edgeType: url.searchParams.get("edgeType") ?? undefined,
          fromRef: url.searchParams.get("fromRef") ?? undefined,
          toRef: url.searchParams.get("toRef") ?? undefined,
          limit: Number(url.searchParams.get("limit") ?? 50),
        });
        return Response.json({ ok: true, edges });
      }
      case "traverse": {
        const nodeType = url.searchParams.get("nodeType") ?? "property";
        const refId = url.searchParams.get("refId") ?? "";
        const paths = await service.traverse(graph, { nodeType, refId }, {
          maxDepth: Number(url.searchParams.get("maxDepth") ?? 2),
          limit: Number(url.searchParams.get("limit") ?? 20),
        });
        return Response.json({ ok: true, paths });
      }
      case "findPath": {
        const from = { nodeType: url.searchParams.get("fromType") ?? "", refId: url.searchParams.get("fromRef") ?? "" };
        const to = { nodeType: url.searchParams.get("toType") ?? "", refId: url.searchParams.get("toRef") ?? "" };
        const path = await service.findPath(graph, from, to, { maxDepth: Number(url.searchParams.get("maxDepth") ?? 3) });
        return Response.json({ ok: true, path });
      }
      case "neighbors": {
        const edges = await service.neighbors(graph, {
          nodeType: url.searchParams.get("nodeType") ?? "property",
          refId: url.searchParams.get("refId") ?? "",
        }, { edgeType: url.searchParams.get("edgeType") ?? undefined, limit: Number(url.searchParams.get("limit") ?? 50) });
        return Response.json({ ok: true, edges });
      }
      default:
        return Response.json({ ok: false, message: "عملیات نامعتبر — stats | nodes | edges | traverse | findPath | neighbors" }, { status: 400 });
    }
  } catch (e) {
    return Response.json({ ok: false, message: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const db = await getDb();
  // بازسازی گراف — عملیات نوشتاری سنگین: فقط OWNER
  const role = await requireRole(request, "OWNER", "POST /api/graphs");
  if (!(role as { ok?: boolean }).ok && role instanceof MelkApiError) return errorResponse(role);
  try {
    const service = new GraphService(db);
    const [property, people, transaction] = await Promise.all([
      buildPropertyGraph(db, service),
      buildPeopleGraph(db, service),
      buildTransactionGraph(db, service),
    ]);
    return Response.json({ ok: true, reports: [property, people, transaction] });
  } catch (e) {
    return Response.json({ ok: false, message: (e as Error).message }, { status: 500 });
  }
}
