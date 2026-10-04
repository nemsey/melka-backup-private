/**
 * P6545 / گام ۱ — سازنده‌های سه گراف از دادهٔ واقعی ملکا
 * ---------------------------------------------------------------------------
 * buildPropertyGraph  — گراف ۱: هر ملک یک گره؛ یال‌های ملک↔منطقه/مالک/کارشناس
 * buildPeopleGraph    — گراف ۲: هر شخص یک گره؛ یال‌های مالکیت/تقاضا/معامله/کارگزاری
 * buildTransactionGraph — گراف ۳: هر معامله یک گره؛ یال‌های ملک/خریدار/فروشنده/کارشناس
 *
 * منابع واقعی: PropertyRecord (M1) + RequestRecord (M2) + TransactionRecord و
 * TransactionEnrichment (M3) + ExpertRecord (M4) + PmPersonnelRecord.
 * همهٔ نوشتن‌ها upsert با skipDuplicates — افزودنی؛ صفر حذف.
 */

import type { PrismaClient } from "@prisma/client";
import { GraphService, type GraphEdgeInput, type GraphNodeInput } from "./graph-service";

export interface GraphBuildReport {
  graph: string;
  nodesWritten: number;
  edgesWritten: number;
  sources: Record<string, number>;
  builtAt: string;
}

/* ───────────────────────── گراف ۱ — Property Graph ───────────────────────── */

export async function buildPropertyGraph(db: PrismaClient, service = new GraphService(db)): Promise<GraphBuildReport> {
  const sources: Record<string, number> = { properties: 0, areas: 0, owners: 0, experts: 0 };
  const nodes: GraphNodeInput[] = [];
  const edges: GraphEdgeInput[] = [];

  const props = await db.propertyRecord.findMany({
    select: {
      propertyCode: true, title: true, status: true, address: true, areaId: true, areaName: true,
      propertyTypeName: true, tradeTypeName: true, price: true, pricePerMeter: true, meterage: true,
      ownerCode: true, ownerName: true, ownerMobile: true, createdAt: true,
    },
  });
  sources.properties = props.length;

  const personRef = (p: { ownerMobile: string | null; ownerName: string | null }) =>
    (p.ownerMobile ? `mob:${p.ownerMobile}` : p.ownerName ? `name:${p.ownerName}` : null);

  for (const p of props) {
    nodes.push({
      nodeType: "property",
      refId: p.propertyCode,
      label: p.title ?? `${p.propertyTypeName ?? "ملک"} ${p.propertyCode}`,
      props: {
        address: p.address, area: p.areaName, propertyType: p.propertyTypeName,
        tradeType: p.tradeTypeName, price: p.price, pricePerMeter: p.pricePerMeter,
        meterage: p.meterage, status: p.status, ownerName: p.ownerName, createdAt: p.createdAt,
      },
    });
    if (p.areaName || p.areaId) {
      const areaRef = p.areaId ?? p.areaName!;
      nodes.push({ nodeType: "area", refId: areaRef, label: p.areaName ?? p.areaId, props: { name: p.areaName } });
      edges.push({ fromType: "property", fromRef: p.propertyCode, toType: "area", toRef: areaRef, edgeType: "located_in" });
      sources.areas += 1;
    }
    const owner = personRef(p);
    if (owner) {
      nodes.push({ nodeType: "person", refId: owner, label: p.ownerName ?? owner, props: { mobile: p.ownerMobile } });
      edges.push({ fromType: "property", fromRef: p.propertyCode, toType: "person", toRef: owner, edgeType: "owned_by" });
      sources.owners += 1;
    }
    if (p.ownerCode) {
      nodes.push({ nodeType: "expert", refId: p.ownerCode, label: p.ownerName ?? p.ownerCode, props: {} });
      edges.push({ fromType: "property", fromRef: p.propertyCode, toType: "expert", toRef: p.ownerCode, edgeType: "listed_by" });
      sources.experts += 1;
    }
  }

  const nodesWritten = await service.upsertNodes("property", nodes);
  const edgesWritten = await service.upsertEdges("property", edges);
  return { graph: "property", nodesWritten, edgesWritten, sources, builtAt: new Date().toISOString() };
}

/* ───────────────────────── گراف ۲ — People Graph ───────────────────────── */

export async function buildPeopleGraph(db: PrismaClient, service = new GraphService(db)): Promise<GraphBuildReport> {
  const sources: Record<string, number> = { experts: 0, personnel: 0, owners: 0, requesters: 0, txParties: 0 };
  const nodes: GraphNodeInput[] = [];
  const edges: GraphEdgeInput[] = [];

  // کارشناسان (M4) + پرسنل PM
  const experts = await db.expertRecord.findMany({ select: { personnelCode: true, fullName: true, role: true, businessTitle: true, mobile: true, branchId: true } });
  for (const e of experts) {
    nodes.push({ nodeType: "expert", refId: e.personnelCode, label: e.fullName, props: { role: e.role, businessTitle: e.businessTitle, mobile: e.mobile, branch: e.branchId } });
  }
  sources.experts = experts.length;

  const personnel = await db.pmPersonnelRecord.findMany({ select: { code: true, fullName: true, businessTitle: true, mobileNumber: true } });
  for (const p of personnel) {
    if (!p.code) continue;
    // اگر همان کارشناس هست، فقط نقش PM را به ویژگی‌ها می‌افزاییم (کلید یکتا)
    nodes.push({ nodeType: "expert", refId: p.code, label: p.fullName ?? p.code, props: { businessTitle: p.businessTitle, mobile: p.mobileNumber, source: "pm" } });
  }
  sources.personnel = personnel.length;

  // مالکان آگهی‌ها (فرد ↔ ملک — مالکیت) + گره ملک به‌عنوان انتهای یال
  const props = await db.propertyRecord.findMany({ select: { propertyCode: true, ownerName: true, ownerMobile: true, ownerCode: true } });
  for (const p of props) {
    const ref = p.ownerMobile ? `mob:${p.ownerMobile}` : p.ownerName ? `name:${p.ownerName}` : null;
    if (!ref) continue;
    nodes.push({ nodeType: "person", refId: ref, label: p.ownerName ?? ref, props: { mobile: p.ownerMobile } });
    nodes.push({ nodeType: "property", refId: p.propertyCode, label: `ملک ${p.propertyCode}`, props: {} });
    edges.push({ fromType: "person", fromRef: ref, toType: "property", toRef: p.propertyCode, edgeType: "owns" });
    sources.owners += 1;
  }

  // درخواست‌دهندگان (فرد ↔ درخواست — تقاضا)
  const requests = await db.requestRecord.findMany({ select: { id: true, customerName: true, customerMobile: true, title: true, status: true, createdAt: true } });
  for (const r of requests) {
    const ref = r.customerMobile ? `mob:${r.customerMobile}` : `name:${r.customerName ?? r.id}`;
    nodes.push({ nodeType: "person", refId: ref, label: r.customerName ?? ref, props: { mobile: r.customerMobile } });
    nodes.push({ nodeType: "request", refId: r.id, label: r.title ?? `درخواست ${r.id.slice(-6)}`, props: { status: r.status, createdAt: r.createdAt } });
    edges.push({ fromType: "person", fromRef: ref, toType: "request", toRef: r.id, edgeType: "requested" });
    sources.requesters += 1;
  }

  // طرف‌های معامله (خریدار/فروشنده از غنی‌سازی M3)
  const enrichments = await db.transactionEnrichment.findMany({
    select: { txId: true, buyerListJson: true, sellerListJson: true, buyerName: true, sellerName: true },
  });
  for (const t of enrichments) {
    type Party = { fullName?: string; mobileNumber?: string };
    const buyers: Party[] = t.buyerListJson ? safeParse(t.buyerListJson) : t.buyerName ? [{ fullName: t.buyerName }] : [];
    const sellers: Party[] = t.sellerListJson ? safeParse(t.sellerListJson) : t.sellerName ? [{ fullName: t.sellerName }] : [];
    nodes.push({ nodeType: "transaction", refId: t.txId, label: `معامله ${t.txId.slice(-6)}`, props: {} });
    for (const b of buyers) {
      const ref = b.mobileNumber ? `mob:${b.mobileNumber}` : b.fullName ? `name:${b.fullName}` : null;
      if (!ref) continue;
      nodes.push({ nodeType: "person", refId: ref, label: b.fullName ?? ref, props: { mobile: b.mobileNumber } });
      edges.push({ fromType: "person", fromRef: ref, toType: "transaction", toRef: t.txId, edgeType: "bought" });
      sources.txParties += 1;
    }
    for (const sl of sellers) {
      const ref = sl.mobileNumber ? `mob:${sl.mobileNumber}` : sl.fullName ? `name:${sl.fullName}` : null;
      if (!ref) continue;
      nodes.push({ nodeType: "person", refId: ref, label: sl.fullName ?? ref, props: { mobile: sl.mobileNumber } });
      edges.push({ fromType: "person", fromRef: ref, toType: "transaction", toRef: t.txId, edgeType: "sold" });
      sources.txParties += 1;
    }
  }

  const nodesWritten = await service.upsertNodes("people", nodes);
  const edgesWritten = await service.upsertEdges("people", edges);
  return { graph: "people", nodesWritten, edgesWritten, sources, builtAt: new Date().toISOString() };
}

/* ───────────────────────── گراف ۳ — Transaction Graph ───────────────────────── */

export async function buildTransactionGraph(db: PrismaClient, service = new GraphService(db)): Promise<GraphBuildReport> {
  const sources: Record<string, number> = { transactions: 0, propertyLinks: 0, requestLinks: 0, parties: 0, brokers: 0 };
  const nodes: GraphNodeInput[] = [];
  const edges: GraphEdgeInput[] = [];

  const txs = await db.transactionRecord.findMany({
    select: { id: true, contractDate: true, propertyCode: true, requestCode: true, ownerCode: true, propertyCustomer: true, requestCustomer: true },
  });
  const enrichments = await db.transactionEnrichment.findMany({
    select: { txId: true, contractType: true, contractPrice: true, buyerName: true, buyerMobile: true, sellerName: true, sellerMobile: true },
  });
  const enrichByTx = new Map(enrichments.map((e) => [e.txId, e]));

  for (const t of txs) {
    const e = enrichByTx.get(t.id);
    nodes.push({
      nodeType: "transaction",
      refId: t.id,
      label: `معامله ${t.id.slice(-6)}`,
      props: { contractDate: t.contractDate, contractType: e?.contractType, contractPrice: e?.contractPrice, propertyCode: t.propertyCode },
    });
    sources.transactions += 1;
    // معامله ↔ ملک
    if (t.propertyCode) {
      nodes.push({ nodeType: "property", refId: t.propertyCode, label: `ملک ${t.propertyCode}`, props: {} });
      edges.push({ fromType: "transaction", fromRef: t.id, toType: "property", toRef: t.propertyCode, edgeType: "involves_property" });
      sources.propertyLinks += 1;
    }
    // معامله ↔ درخواست (اگر از درخواست آمده)
    if (t.requestCode) {
      const req = await db.requestRecord.findFirst({ where: { requestCode: t.requestCode }, select: { id: true } });
      if (req) {
        nodes.push({ nodeType: "request", refId: req.id, label: `درخواست ${t.requestCode}`, props: { requestCode: t.requestCode } });
        edges.push({ fromType: "transaction", fromRef: t.id, toType: "request", toRef: req.id, edgeType: "involves_request" });
        sources.requestLinks += 1;
      }
    }
    // معامله ↔ خریدار / فروشنده (شخص)
    if (e?.buyerName || e?.buyerMobile) {
      const ref = e.buyerMobile ? `mob:${e.buyerMobile}` : `name:${e.buyerName}`;
      nodes.push({ nodeType: "person", refId: ref, label: e.buyerName ?? ref, props: { mobile: e.buyerMobile } });
      edges.push({ fromType: "transaction", fromRef: t.id, toType: "person", toRef: ref, edgeType: "bought" });
      sources.parties += 1;
    }
    if (e?.sellerName || e?.sellerMobile) {
      const ref = e.sellerMobile ? `mob:${e.sellerMobile}` : `name:${e.sellerName}`;
      nodes.push({ nodeType: "person", refId: ref, label: e.sellerName ?? ref, props: { mobile: e.sellerMobile } });
      edges.push({ fromType: "transaction", fromRef: t.id, toType: "person", toRef: ref, edgeType: "sold" });
      sources.parties += 1;
    }
    // معامله ↔ کارشناس (کارگزاری)
    if (t.ownerCode) {
      nodes.push({ nodeType: "expert", refId: t.ownerCode, label: t.ownerCode, props: {} });
      edges.push({ fromType: "transaction", fromRef: t.id, toType: "expert", toRef: t.ownerCode, edgeType: "brokered_by" });
      sources.brokers += 1;
    }
  }

  const nodesWritten = await service.upsertNodes("transaction", nodes);
  const edgesWritten = await service.upsertEdges("transaction", edges);
  return { graph: "transaction", nodesWritten, edgesWritten, sources, builtAt: new Date().toISOString() };
}

function safeParse(json: string): Array<{ fullName?: string; mobileNumber?: string }> {
  try {
    const v = JSON.parse(json);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
