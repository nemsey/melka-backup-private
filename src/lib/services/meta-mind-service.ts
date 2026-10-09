/**
 * سرویس فرا-ذهن — PN-024 (خواستهٔ ثانیاً مالک · جلسهٔ ۰۳۱)
 * ---------------------------------------------------------------------------
 * «اثر موتورهای ۱۲ تا ۱۵ در دو نقطه دیده شود: تنظیمات عمومی + کاشی M6»
 *
 * چهار موتور روی دادهٔ واقعی — همه فقط-خواندنی (صفر نوشتن):
 *   ۱۲ توجه        — ۱۰ آگهی برتر روز با دلیل (بودجهٔ DAILY)
 *   ۱۳ علّیت        — آمار گراف DAG + مداخلهٔ مرجع do(hasImage+=1) = +۰٫۲۹۳
 *   ۱۴ پادواقع      — دو سناریوی L3 کلیدی (کاهش قیمت ۵٪ و ۱۰٪)
 *   ۱۵ شبیه‌سازی    — جدول مقایسهٔ چهار اقدام استاندارد + توصیه
 *
 * مرز لایه (الگوی self-diagnosis-service / causal-graph-store):
 * این تنها نقطهٔ DB برای فرا-ذهن است — موتورها در core/intelligence خالص‌اند
 * (گارد audit-intelligence-boundary + audit-counterfactual-purity می‌گیرند).
 */

import { db } from "@/lib/db";
import { loadGraph } from "@/lib/services/causal-graph-store";
import { AttentionEngine, type AttentionItem, type AttentionScore } from "@/core/intelligence/attention-engine";
import { CausalEngine, OUTCOME_NODE, type CausalDataPoint, type CausalEffect, type CausalGraph } from "@/core/intelligence/causal-engine";
import { CounterfactualEngine, type Counterfactual } from "@/core/intelligence/counterfactual-engine";
import { SimulationEngine, type ComparisonTable, type SimAction } from "@/core/intelligence/simulation-engine";
import { ATTENTION_BUDGETS, clampBudget } from "@/core/intelligence/attention-budget";

/** ترتیب علّی پیشینی عین witnesses.ts فاز ۱۳-الف */
const FEATURE_ORDER = ["pricePerMeter", "meterage", "rooms", "buildYear", "hasImage", "viewCount", OUTCOME_NODE] as const;

/** چهار اقدام استاندارد مقایسه (سند طراحی فصل ۵.۱) */
const STANDARD_ACTIONS: readonly SimAction[] = [
  { kind: "PRICE_CUT", magnitude: 5, label: "کاهش ۵٪ قیمت" },
  { kind: "PRICE_CUT", magnitude: 10, label: "کاهش ۱۰٪ قیمت" },
  { kind: "ADD_IMAGE", magnitude: 1, label: "افزودن نخستین عکس" },
  { kind: "REPOST", magnitude: 1, label: "بازنشر (بازدید به میانهٔ بازار)" },
];

export interface MetaMindSnapshot {
  ranAt: string;
  engines: {
    attention: { alive: true; top: Array<Pick<AttentionScore, "itemId" | "total" | "reason">>; considered: number; budget: number; budgetLevel: string };
    causal: { alive: boolean; nodes: number; edges: number; sampleSize: number; dagVerified: boolean; refIntervention: CausalEffect | null };
    counterfactual: { alive: boolean; scenarios: Counterfactual[]; evidenceNote: string };
    simulation: { alive: boolean; comparison: ComparisonTable | null };
  };
  marketPressure: number;
  notes: string[];
}

/** فشار بازار: نسبت عرضهٔ فعال به تقاضای باز (مدل بازار فصل ۴.۵) */
async function marketPressure(): Promise<number> {
  const [supply, demand] = await Promise.all([db.propertyRecord.count(), db.requestRecord.count()]);
  if (demand <= 0) return 1;
  return Math.round((supply / demand) * 100) / 100;
}

/** موتور ۱۲ — توجه: ۱۰۰۰ آگهی تازه → بودجهٔ DAILY (عین mapping شاهد فاز ۱۳-الف) */
async function attentionTop(): Promise<MetaMindSnapshot["engines"]["attention"]> {
  const rows = await db.propertyRecord.findMany({
    orderBy: { updatedAt: "desc" },
    take: 1000,
    select: {
      propertyCode: true, updatedAt: true, createdAt: true, status: true,
      price: true, pricePerMeter: true, areaName: true, imageCount: true, viewCount: true, statusDate: true,
    },
  });
  const topAreas = await db.propertyRecord.groupBy({ by: ["areaName"], _count: true, orderBy: { _count: { propertyCode: "desc" } }, take: 3 });
  const priorityDomains = topAreas.filter((a) => a.areaName).map((a) => `AREA:${a.areaName}`);
  const items: AttentionItem[] = rows.map((r) => {
    const occurredAt = r.statusDate ?? r.updatedAt ?? r.createdAt;
    const impactValue = Math.max(0, r.price ?? r.pricePerMeter ?? 0) * (r.price ? 1 : 0.5);
    const probability = Math.min(0.95, Math.max(0.05, (r.viewCount ?? 0) / 200));
    const domains: string[] = [];
    if (r.areaName) domains.push(`AREA:${r.areaName}`);
    if ((r.imageCount ?? 0) > 0) domains.push("HAS_IMAGE");
    const rawCost = (r.imageCount ?? 0) === 0 ? 0.5 : r.price ? 0.1 : 0.3;
    return { itemId: r.propertyCode ?? "—", occurredAt: occurredAt.toISOString(), impactValue, probability, domains, rawCost };
  });
  const engine = new AttentionEngine({
    domains: priorityDomains,
    weightFreshness: 0.25, weightImpact: 0.35, weightAlignment: 0.25, weightCost: 0.15,
  });
  const budget = clampBudget(ATTENTION_BUDGETS.DAILY.maxItems, "DAILY");
  const top = engine.rank(items, budget);
  return {
    alive: true,
    top: top.map((s) => ({ itemId: s.itemId, total: Math.round(s.total * 100) / 100, reason: s.reason })),
    considered: rows.length,
    budget,
    budgetLevel: "DAILY",
  };
}

/** شاهد معیار L3: میانگین معامله‌های واقعی — مقیاس موتور: پیوسته z-score · باینری ۰/۱
 *  (قرارداد مقیاس موتور ۱۴ — ضرایب گراف همبستگی‌اند؛ z-score اثر٪ را باورپذیر می‌کند) */
async function meanEvidence(): Promise<{ features: Record<string, number>; raw: Record<string, number>; sigma: Record<string, number>; priceZPerPercent: number; viewMedianZ: number; outcome: number; n: number } | null> {
  const txs = await db.transactionRecord.findMany({ take: 400, select: { propertyCode: true } });
  const codes = new Set(txs.map((t) => t.propertyCode).filter((c): c is string => Boolean(c) && c !== "—"));
  const listings = await db.propertyRecord.findMany({
    where: { propertyCode: { in: [...codes] } },
    select: { pricePerMeter: true, meterage: true, rooms: true, buildYear: true, imageCount: true, viewCount: true },
    take: 400,
  });
  if (listings.length < 10) return null;
  const CONTINUOUS = ["pricePerMeter", "meterage", "rooms", "buildYear", "viewCount"] as const;
  const acc: Record<string, number[]> = {};
  for (const l of listings) {
    const f: Record<string, number> = {
      pricePerMeter: Math.min(Number(l.pricePerMeter) || 0, 1e9),
      meterage: Math.min(Number(l.meterage) || 0, 5000),
      rooms: Math.min(Number(l.rooms) || 0, 30),
      buildYear: Math.max(0, Math.min(1500, Number(l.buildYear) || 0)),
      hasImage: (l.imageCount ?? 0) > 0 ? 1 : 0,
      viewCount: Math.min(Number(l.viewCount) || 0, 10000),
    };
    for (const [k, v] of Object.entries(f)) {
      acc[k] = acc[k] ?? [];
      acc[k].push(v);
    }
  }
  const raw: Record<string, number> = {};
  const sigma: Record<string, number> = {};
  const features: Record<string, number> = {};
  for (const [k, vs] of Object.entries(acc)) {
    const mu = vs.reduce((a, b) => a + b, 0) / vs.length;
    raw[k] = mu;
    if (k === "hasImage") {
      features[k] = mu; // باینری — امید ریاضی در [0,1]
      sigma[k] = 0.5;
    } else if ((CONTINUOUS as readonly string[]).includes(k)) {
      const sd = Math.sqrt(vs.reduce((a, b) => a + (b - mu) ** 2, 0) / Math.max(1, vs.length - 1));
      sigma[k] = sd > 1e-9 ? sd : 1; // صفر-واریانس ⇒ z تعریف‌نشده ⇒ مقیاس ۱
      features[k] = 0; // z(μ) = ۰ — شاهد معیار روی میانگین
    } else {
      features[k] = mu;
      sigma[k] = 1;
    }
  }
  const priceZPerPercent = sigma.pricePerMeter > 0 ? raw.pricePerMeter / (100 * sigma.pricePerMeter) : 0;
  const sortedViews = [...acc.viewCount ?? [0]].sort((a, b) => a - b);
  const medianViews = sortedViews.length > 0 ? sortedViews[Math.floor(sortedViews.length / 2)]! : 0;
  const viewMedianZ = (medianViews - raw.viewCount) / (sigma.viewCount || 1);
  return { features, raw, sigma, priceZPerPercent, viewMedianZ, outcome: 0.5, n: listings.length }; // outcome معیار: خنثی ۰٫۵
}

/** گراف از DB + بازسازی اگر خالی (بازتولید عین شاهد ۱۳-الف از ۷۶۸ معامله + کنترل) */
async function ensureGraph(): Promise<CausalGraph | null> {
  const existing = await loadGraph();
  if (existing && existing.edges.length > 0) return existing;
  // بازسازی از دادهٔ واقعی (عین witnesses.ts)
  const txs = await db.transactionRecord.findMany({ select: { propertyCode: true } });
  const byCode = new Set(txs.map((t) => t.propertyCode).filter((c): c is string => Boolean(c) && c !== "—"));
  const posRows = await db.propertyRecord.findMany({
    where: { propertyCode: { in: [...byCode] } },
    select: { pricePerMeter: true, meterage: true, rooms: true, buildYear: true, imageCount: true, viewCount: true },
    take: 800,
  });
  const data: CausalDataPoint[] = [];
  const push = (l: (typeof posRows)[number], outcome: number) => {
    const ppm = Number(l.pricePerMeter) || 0;
    if (!Number.isFinite(ppm) || ppm <= 0) return;
    data.push({
      features: {
        pricePerMeter: Math.min(ppm, 1e9),
        meterage: Math.min(Number(l.meterage) || 0, 5000),
        rooms: Math.min(Number(l.rooms) || 0, 30),
        buildYear: Math.max(0, Math.min(1500, Number(l.buildYear) || 0)),
        hasImage: (l.imageCount ?? 0) > 0 ? 1 : 0,
        viewCount: Math.min(Number(l.viewCount) || 0, 10000),
      },
      outcome,
    });
  };
  for (const l of posRows) push(l, 1);
  const expired = await db.propertyRecord.findMany({
    where: { status: "منقضی شده", pricePerMeter: { gt: 0 } },
    take: Math.min(1500, Math.max(500, data.length * 2)),
    select: { pricePerMeter: true, meterage: true, rooms: true, buildYear: true, imageCount: true, viewCount: true },
  });
  for (const l of expired) push(l, 0);
  if (data.length < 50) return null;
  const engine = new CausalEngine();
  const graph = engine.buildGraph(data, FEATURE_ORDER);
  return graph;
}

/** اسنپ‌شات کامل فرا-ذهن — دادهٔ هر دو نقطهٔ UI (تنظیمات + M6) */
export async function metaMindSnapshot(): Promise<MetaMindSnapshot> {
  const notes: string[] = [];
  const now = new Date().toISOString();

  // ۱۲ توجه (مستقل از گراف — همیشه زنده)
  const attention = await attentionTop().catch((e) => {
    notes.push(`توجه: ${e instanceof Error ? e.message : "خطا"}`);
    return { alive: true as const, top: [], considered: 0, budget: 10, budgetLevel: "DAILY" };
  });

  // گراف علّی
  const graph = await ensureGraph().catch(() => null);
  if (!graph) notes.push("گراف علّی هنوز ساخته نشده — علّیت/پادواقع/شبیه‌سازی تا اجرای شاهد خاموش‌اند.");

  const causalEngine = new CausalEngine();
  const refIntervention = graph?.nodes.includes("hasImage")
    ? causalEngine.intervene(graph, { feature: "hasImage", delta: 1 })
    : null;

  // ۱۴ پادواقع — دو سناریوی کلیدی روی شاهد معیار (z-scale + باینری خام)
  let cfScenarios: Counterfactual[] = [];
  const evidence = await meanEvidence().catch(() => null);
  if (graph && evidence) {
    const cfEngine = new CounterfactualEngine();
    const ev = { features: evidence.features, outcome: evidence.outcome };
    const zPct = evidence.priceZPerPercent;
    const queries = [5, 10].map((pct) => ({
      scenario: `کاهش ${pct}٪ قیمت (شاهد معیار)`,
      feature: "pricePerMeter",
      observedValue: 0, // z(μ)
      counterfactualValue: -pct * zPct,
      evidence: ev,
    }));
    cfScenarios = cfEngine.rank(graph, queries);
  } else if (graph) {
    notes.push("شاهد معیار معامله‌ها کافی نیست — سناریوهای L3 خاموش‌اند.");
  }

  // ۱۵ شبیه‌سازی — مقایسهٔ چهار اقدام استاندارد
  let comparison: ComparisonTable | null = null;
  if (graph && evidence) {
    const pressure = await marketPressure();
    const simEngine = new SimulationEngine(graph);
    comparison = simEngine.compare(STANDARD_ACTIONS, {
      currentProbability: evidence.outcome,
      pricePerMeter: evidence.features.pricePerMeter as number,
      imageCount: Math.round(evidence.features.hasImage ?? 0),
      viewCount: evidence.features.viewCount as number,
      marketPressure: pressure,
      features: evidence.features,
      priceZPerPercent: evidence.priceZPerPercent,
      viewMedianZ: evidence.viewMedianZ,
    });
  }

  return {
    ranAt: now,
    engines: {
      attention,
      causal: {
        alive: Boolean(graph),
        nodes: graph?.nodes.length ?? 0,
        edges: graph?.edges.length ?? 0,
        sampleSize: graph?.sampleSize ?? 0,
        dagVerified: graph?.dagVerified ?? false,
        refIntervention,
      },
      counterfactual: {
        alive: cfScenarios.length > 0,
        scenarios: cfScenarios,
        evidenceNote: evidence ? `میانگین ${evidence.n} معاملهٔ واقعی غنی‌شده` : "شاهد کافی نیست",
      },
      simulation: { alive: comparison !== null, comparison },
    },
    marketPressure: await marketPressure(),
    notes,
  };
}
