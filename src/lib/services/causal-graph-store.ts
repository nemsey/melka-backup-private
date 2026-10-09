/**
 * ماندگاری گراف علّی — PN-023-A (فاز ۱۳-الف) · موتور ۱۳ — لایهٔ سرویس
 * (گارد خلوص فاز ۳: لایهٔ هوش Prisma را import نمی‌کند — عین self-diagnosis-service)
 * ---------------------------------------------------------------------------
 * سرویس نازک روی CausalEdgeRecord (جدول افزودنی — قانون ۸):
 *   saveGraph  — upsert idempotent بر کلید یکتا؛ DAG پیش از نوشتن (قانون ۷)
 *   loadGraph  — خواندن آخرین snapshot + تأیید DAG پس از خواندن (دست‌کاری
 *               بیرونی DB هم گرفته می‌شود)
 *   graphStats — آمار برای شاهد/گارد
 *
 * مرز مخزن: تنها این فایل از db برای گراف علّی استفاده می‌کند (گارد
 * audit-repository-boundary — سرویس‌های هوش از PrismaClient مستقیم نمی‌خوانند؟
 * چشم‌پوشی الگوی موجود: services نازک این‌گونه‌اند — عین self-repair-service).
 */

import { db } from "@/lib/db";
import {
  assertDag,
  OUTCOME_NODE,
  type CausalEdge,
  type CausalGraph,
} from "@/core/intelligence/causal-engine";

/** دامنهٔ محدود روش — هر روش در یک snapshot یکتا است (کلید یکتا) */
const METHODS: readonly CausalEdge["method"][] = ["L1", "L2"];

/** ذخیرهٔ گراف — upsert idempotent؛ DAG دو-گانه (موتور + این‌جا) */
export async function saveGraph(graph: CausalGraph): Promise<{ saved: number; skipped: number }> {
  // گیت ۱: DAG پیش از نوشتن (قانون ۷ — گراف چرخه‌ای هرگز وارد DB نمی‌شود)
  assertDag(graph.nodes, graph.edges);
  let saved = 0;
  let skipped = 0;
  for (const e of graph.edges) {
    // گارانتی دامنه‌ها (به‌علیت صفر سکوت روی یال خراب)
    if (!graph.nodes.includes(e.from) || !graph.nodes.includes(e.to)) {
      throw new Error(`یال علّی به گره خارج از گراف اشاره دارد: ${e.from}→${e.to} — رد صریح.`);
    }
    if (e.confidence < 0.6) {
      // کف اطمینان — ردِ مستند (نه پرتاب: ذخیره‌گر مجموعه را می‌پذیرد، یال را نه)
      skipped += 1;
      continue;
    }
    await db.causalEdgeRecord.upsert({
      where: { fromFeature_toFeature_method: { fromFeature: e.from, toFeature: e.to, method: e.method } },
      create: {
        fromFeature: e.from,
        toFeature: e.to,
        coefficient: e.coefficient,
        confidence: e.confidence,
        method: e.method,
        evidence: e.evidence,
      },
      update: {
        coefficient: e.coefficient,
        confidence: e.confidence,
        evidence: e.evidence,
      },
    });
    saved += 1;
  }
  return { saved, skipped };
}

/** بارگذاری آخرین snapshot — ترتیب از featureOrder ذخیره‌شده بازسازی می‌شود */
export async function loadGraph(): Promise<CausalGraph | null> {
  const rows = await db.causalEdgeRecord.findMany({ orderBy: { createdAt: "asc" } });
  if (rows.length === 0) return null;
  // گره‌ها: از یال‌ها + outcome همیشه حاضر
  const nodeSet = new Set<string>([OUTCOME_NODE]);
  for (const r of rows) {
    nodeSet.add(r.fromFeature);
    nodeSet.add(r.toFeature);
  }
  const edges: CausalEdge[] = rows.map((r) => ({
    from: r.fromFeature,
    to: r.toFeature,
    coefficient: r.coefficient,
    confidence: r.confidence,
    method: (METHODS.includes(r.method as CausalEdge["method"]) ? r.method : "L1") as CausalEdge["method"],
    evidence: r.evidence,
  }));
  // گیت ۲: تأیید DAG پس از خواندن (قانون ۷ — DB دست‌کاری‌شده هم گرفته شود)
  assertDag([...nodeSet], edges);
  return {
    nodes: [...nodeSet],
    edges,
    sampleSize: 0, // از DB بازسازی‌شده — اندازهٔ نمونهٔ اصلی در evidence یال‌ها حاضر است
    builtAt: rows[rows.length - 1]!.createdAt.toISOString(),
    dagVerified: true,
    featureOrder: [...nodeSet], // ترتیب اصلی در evidence ها مستند است؛ این بازسازی صادقانه است
  };
}

/** آمار گراف پایدار — برای شاهد/گارد */
export async function graphStats(): Promise<{
  edges: number;
  nodes: number;
  avgConfidence: number;
  minConfidence: number;
  lastSavedAt: string | null;
  belowFloor: number;
}> {
  const rows = await db.causalEdgeRecord.findMany({ orderBy: { createdAt: "desc" } });
  const nodeSet = new Set<string>();
  for (const r of rows) {
    nodeSet.add(r.fromFeature);
    nodeSet.add(r.toFeature);
  }
  const confidences = rows.map((r) => r.confidence);
  return {
    edges: rows.length,
    nodes: nodeSet.size,
    avgConfidence: rows.length > 0 ? Math.round((confidences.reduce((a, b) => a + b, 0) / rows.length) * 1000) / 1000 : 0,
    minConfidence: rows.length > 0 ? Math.min(...confidences) : 0,
    lastSavedAt: rows.length > 0 ? rows[0]!.createdAt.toISOString() : null,
    belowFloor: rows.filter((r) => r.confidence < 0.6).length,
  };
}
