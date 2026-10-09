/**
 * PN-024 · مراحل ۸+۹ — شاهد موتورهای ۱۴ (پادواقع) و ۱۵ (شبیه‌سازی) روی دادهٔ واقعی
 * اجرا: DATABASE_URL=file:/home/z/my-project/db/custom.db bun scripts/pn024/engine-witness.ts
 */
import { writeFileSync } from "fs";
import { db } from "@/lib/db";
import { loadGraph } from "@/lib/services/causal-graph-store";
import { CausalEngine, OUTCOME_NODE, type CausalDataPoint } from "@/core/intelligence/causal-engine";
import { CounterfactualEngine } from "@/core/intelligence/counterfactual-engine";
import { SimulationEngine, type SimAction } from "@/core/intelligence/simulation-engine";

const FEATURE_ORDER = ["pricePerMeter", "meterage", "rooms", "buildYear", "hasImage", "viewCount", OUTCOME_NODE] as const;
const OUT = "/home/z/my-project/download/pn024";

async function main() {
  const now = new Date().toISOString();
  console.log("═══ PN-024 · موتورهای ۱۴+۱۵ روی دادهٔ واقعی ═══");

  // گراف از DB (ذخیره‌شدهٔ ۱۳-الف) یا بازسازی
  let graph = await loadGraph();
  let graphSource = "CausalEdgeRecord (ذخیرهٔ ۱۳-الف)";
  if (!graph || graph.edges.length === 0) {
    const txs = await db.transactionRecord.findMany({ select: { propertyCode: true } });
    const codes = new Set(txs.map((t) => t.propertyCode).filter((c): c is string => Boolean(c) && c !== "—"));
    const pos = await db.propertyRecord.findMany({
      where: { propertyCode: { in: [...codes] } },
      select: { pricePerMeter: true, meterage: true, rooms: true, buildYear: true, imageCount: true, viewCount: true },
      take: 800,
    });
    const data: CausalDataPoint[] = [];
    const push = (l: (typeof pos)[number], outcome: number) => {
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
    for (const l of pos) push(l, 1);
    const expired = await db.propertyRecord.findMany({
      where: { status: "منقضی شده", pricePerMeter: { gt: 0 } },
      take: Math.min(1500, Math.max(500, data.length * 2)),
      select: { pricePerMeter: true, meterage: true, rooms: true, buildYear: true, imageCount: true, viewCount: true },
    });
    for (const l of expired) push(l, 0);
    graph = new CausalEngine().buildGraph(data, FEATURE_ORDER);
    graphSource = `بازسازی در-جا از ${data.length} نقطهٔ واقعی`;
  }
  console.log(`  گراف: ${graph.nodes.length} گره · ${graph.edges.length} یال (${graphSource})`);

  // شاهد معیار: میانگین معامله‌های واقعی — مقیاس موتور (z-score پیوسته + باینری خام)
  const txs2 = await db.transactionRecord.findMany({ take: 400, select: { propertyCode: true } });
  const codes2 = new Set(txs2.map((t) => t.propertyCode).filter((c): c is string => Boolean(c) && c !== "—"));
  const lst = await db.propertyRecord.findMany({
    where: { propertyCode: { in: [...codes2] } },
    select: { pricePerMeter: true, meterage: true, rooms: true, buildYear: true, imageCount: true, viewCount: true },
    take: 400,
  });
  const CONTINUOUS = ["pricePerMeter", "meterage", "rooms", "buildYear", "viewCount"] as const;
  const acc: Record<string, number[]> = {};
  for (const l of lst) {
    const f = {
      pricePerMeter: Math.min(Number(l.pricePerMeter) || 0, 1e9),
      meterage: Math.min(Number(l.meterage) || 0, 5000),
      rooms: Math.min(Number(l.rooms) || 0, 30),
      buildYear: Math.max(0, Math.min(1500, Number(l.buildYear) || 0)),
      hasImage: (l.imageCount ?? 0) > 0 ? 1 : 0,
      viewCount: Math.min(Number(l.viewCount) || 0, 10000),
    };
    for (const [k, v] of Object.entries(f)) (acc[k] = acc[k] ?? []).push(v);
  }
  const rawFeatures: Record<string, number> = {};
  const sigma: Record<string, number> = {};
  const features: Record<string, number> = {};
  for (const [k, vs] of Object.entries(acc)) {
    const mu = vs.reduce((a, b) => a + b, 0) / vs.length;
    rawFeatures[k] = mu;
    if (k === "hasImage") {
      features[k] = mu;
      sigma[k] = 0.5;
    } else if ((CONTINUOUS as readonly string[]).includes(k)) {
      const sd = Math.sqrt(vs.reduce((a, b) => a + (b - mu) ** 2, 0) / Math.max(1, vs.length - 1));
      sigma[k] = sd > 1e-9 ? sd : 1;
      features[k] = 0; // z(μ)
    } else {
      features[k] = mu;
      sigma[k] = 1;
    }
  }
  const priceZPerPercent = sigma.pricePerMeter > 0 ? rawFeatures.pricePerMeter / (100 * sigma.pricePerMeter) : 0;
  const sortedViews = [...(acc.viewCount ?? [0])].sort((a, b) => a - b);
  const medianViews = sortedViews[Math.floor(sortedViews.length / 2)] ?? 0;
  const viewMedianZ = (medianViews - rawFeatures.viewCount) / (sigma.viewCount || 1);
  console.log(`  شاهد معیار: ${lst.length} معامله — ppm=${Math.round(rawFeatures.pricePerMeter).toLocaleString("en")} (σ=${Math.round(sigma.pricePerMeter).toLocaleString("en")}) · z/۱٪=${priceZPerPercent.toFixed(3)} · hasImage=${features.hasImage.toFixed(2)}`);

  // ─── موتور ۱۴: دو سناریوی کلیدی + توصیف (z-scale) ───
  const cfEngine = new CounterfactualEngine();
  const evidence = { features, outcome: 0.5 };
  const queries = [5, 10].map((pct) => ({
    scenario: `کاهش ${pct}٪ قیمت‌متر (شاهد معیار معامله‌ها)`,
    feature: "pricePerMeter",
    observedValue: 0, // z(μ)
    counterfactualValue: -pct * priceZPerPercent,
    evidence,
  }));
  const scenarios = cfEngine.rank(graph, queries);
  const gates = [
    ["CF_EMPTY_GRAPH", "گراف خالی رد می‌شود"],
    ["CF_NOT_DAG", "گراف بدون مهر DAG رد می‌شود"],
    ["CF_UNKNOWN_FEATURE", "ویژگی ناشناخته رد می‌شود"],
    ["CF_EVIDENCE_MISMATCH", "شاهد ناقص رد می‌شود"],
    ["CF_SAME_VALUE", "سناریوی بی‌اثر رد می‌شود"],
  ] as const;
  writeFileSync(`${OUT}/counterfactual-engine.json`, JSON.stringify({
    workOrder: "PN-024/مرحلهٔ ۸ — موتور ۱۴ پادواقع روی گراف واقعی",
    ranAt: now,
    graph: { source: graphSource, nodes: graph.nodes.length, edges: graph.edges.length, sampleSize: graph.sampleSize, dagVerified: graph.dagVerified, featureOrder: graph.featureOrder },
    evidence: { type: "میانگین معامله‌های واقعی غنی‌شده — z-score پیوسته + باینری خام", n: lst.length, features, rawFeatures, sigma, priceZPerPercent },
    threeStep: {
      abduction: "e = y_observed − Σβ·f (نویز فردی شاهد معیار)",
      action: "do(pricePerMeter: z(μ) → −5٪×μ/σ / −10٪×μ/σ)",
      prediction: "y′ = Σβ·f′ + e (همان نویز فردی)",
    },
    scenarios,
    gates: gates.map(([code, fa]) => ({ code, fa, failLoud: true })),
    purity: "صفر وابستگی DB/fetch در موتور — فقط type-import از causal-engine",
  }, null, 2));
  for (const s of scenarios) {
    console.log(`  L3 «${s.scenario}»: ${s.baseline.toFixed(3)} → ${s.counterfactual.toFixed(3)} (Δ=${s.delta >= 0 ? "+" : ""}${s.delta.toFixed(3)}) · conf ${s.confidence.toFixed(2)}`);
  }

  // ─── موتور ۱۵: چهار اقدام استاندارد ───
  const [supply, demand] = await Promise.all([db.propertyRecord.count(), db.requestRecord.count()]);
  const pressure = demand > 0 ? Math.round((supply / demand) * 100) / 100 : 1;
  const simEngine = new SimulationEngine(graph);
  const actions: SimAction[] = [
    { kind: "PRICE_CUT", magnitude: 5, label: "کاهش ۵٪ قیمت (عین مثال مالک جلسهٔ ۰۳۱)" },
    { kind: "PRICE_CUT", magnitude: 10, label: "کاهش ۱۰٪ قیمت" },
    { kind: "ADD_IMAGE", magnitude: 1, label: "افزودن نخستین عکس" },
    { kind: "REPOST", magnitude: 1, label: "بازنشر (بازدید به میانهٔ بازار)" },
    { kind: "AGENT_CHANGE", magnitude: 1, label: "تغییر کارشناس (صداقت ساختاری)" },
  ];
  const comparison = simEngine.compare(actions, {
    currentProbability: 0.5,
    pricePerMeter: features.pricePerMeter as number,
    imageCount: Math.round(features.hasImage ?? 0),
    viewCount: features.viewCount as number,
    marketPressure: pressure,
    features,
    priceZPerPercent,
    viewMedianZ,
  });
  writeFileSync(`${OUT}/simulation-engine.json`, JSON.stringify({
    workOrder: "PN-024/مرحلهٔ ۹ — موتور ۱۵ شبیه‌سازی روی گراف واقعی",
    ranAt: now,
    models: {
      data: "SCM گراف علّی (تک‌منبع حقیقت — مدل موازی نیست)",
      reaction: "نگاشت اقدام → مداخلهٔ L3 (CounterfactualEngine)",
      market: `فشار عرضه/تقاضا = ${pressure} (عرضه ${supply} / تقاضا ${demand}) — تعدیل فقط Δ با سقف ۱٫۵×`,
    },
    autoExecuteLock: "قانون ۱۱ ابدی — autoExecute: false در سطح نوع TypeScript literal",
    comparison,
  }, null, 2));
  for (const r of comparison.results) {
    console.log(`  SIM «${r.action.label}»: Δ=${r.delta >= 0 ? "+" : ""}${r.delta.toFixed(3)} → ${r.simulatedProbability.toFixed(3)} · conf ${r.confidence.toFixed(2)}`);
  }
  console.log(`  توصیه: ${comparison.recommendation}`);

  await db.$disconnect();
  console.log("✓ شاهدهای ۱۴ و ۱۵ نوشته شد");
}

main().catch((e) => { console.error("شکست:", e); process.exit(1); });
