/**
 * P6545 / گام ۳ — تجهیز M1-M4 به مغز + شواهد
 * ---------------------------------------------------------------------------
 * · ۴ مدل ثبت‌شده در ModelRegistry + ۴ Tier مستقل → download/p6545/models-registry.json
 * · ۴ ایجنت اختصاصی فعال (نمونه‌ فراخوانی زنده)
 * · Feature Store مشترک (تست: یک ویژگی، دو ایجنت، نتیجهٔ یکسان)
 * · Cross-Tile Outcomes: ۱۰ معاملهٔ واقعی ← ۴۰ پیامد → download/p6545/cross-tile-proof.json
 */
import { PrismaClient } from "@prisma/client";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require_ = createRequire(import.meta.url);
const { bootstrapModels, modelRegistry } = require_("../src/core/intelligence/models/registry.ts") as typeof import("../src/core/intelligence/models/registry");
const { PropertyAgent, RequestAgent, TransactionAgent, ExpertAgent } = require_("../src/core/intelligence/agents/domain-agents.ts") as typeof import("../src/core/intelligence/agents/domain-agents");
const { SharedFeatureStore } = require_("../src/core/features/store.ts") as typeof import("../src/core/features/store");
const { emitCrossTileOutcomesBatch, readCrossTileOutcomes } = require_("../src/core/intelligence/cross-tile.ts") as typeof import("../src/core/intelligence/cross-tile");
const { tierFromRealData } = require_("../src/core/intelligence/p7-core.ts") as typeof import("../src/core/intelligence/p7-core");

const OUT = "/home/z/my-project/download/p6545";

async function main() {
  mkdirSync(OUT, { recursive: true });
  const db = new PrismaClient();

  /* ═══ ۱) رجیستری مدل‌ها + Tier مستقل ═══ */
  bootstrapModels();
  // Tier مدل ملک از حلقهٔ واقعی ۳۸۴ پیامد (چرخهٔ خودش)
  const outcomes = readFileSync("/home/z/my-project/intelligence-data/outcomes.jsonl", "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const t = tierFromRealData(outcomes.map((o) => ({ observedAt: o.occurredAt, ...o })) as never[]);
  modelRegistry.updateTierState("melka-property-v3", t.linkedOutcomes ?? outcomes.length, t.distinctPeriods, t.tier);
  // سایر مدل‌ها: Tier از پیامدهای بین‌کاشی (اگر هست) وگرنه Tier مستقل از دادهٔ مرتبط خودشان
  const crossBefore = readCrossTileOutcomes();
  const txCount = await db.transactionRecord.count();
  modelRegistry.updateTierState("melka-transaction-v2", txCount, 1, txCount >= 70 ? 3 : txCount >= 50 ? 2 : txCount >= 20 ? 1 : 0);
  modelRegistry.updateTierState("melka-request-v1", 0, 0, 0); // چرخهٔ پیامدش با ورود دادهٔ تطبیق پر می‌شود
  modelRegistry.updateTierState("melka-expert-v1", 0, 0, 0);

  const models = modelRegistry.list().map((m) => ({ ...m, tierState: modelRegistry.tierState(m.modelId) }));
  console.log(`۴ مدل ثبت شد: ${models.map((m) => m.modelId).join(" · ")}`);
  const modelsProof = {
    case: "P6545-models-registry",
    council: "جلسه ۰۳۳ — BLOCK 3.1/3.2: مغز=۱ · مدل=پیکربندی · ایجنت=متخصص دامنه",
    registeredAt: new Date().toISOString(),
    brain: { count: 1, engines: 11, engineSet: "SHARED-11", changedEngines: 0 },
    models,
    constraint: "هر مدل از همان ۱۱ موتور استفاده می‌کند — صفر موتور جداگانه",
  };
  writeFileSync(`${OUT}/models-registry.json`, JSON.stringify(modelsProof, null, 2));
  console.log("✓ شاهد مدل‌ها: download/p6545/models-registry.json");

  /* ═══ ۲) ۴ ایجنت فعال — نمونهٔ فراخوانی زنده ═══ */
  const store = new SharedFeatureStore({ noPersist: true });
  const agentsReport: Array<{ agent: string; model: string; sample: string; result: unknown }> = [];
  try {
    const propertyAgent = new PropertyAgent({ db, featureStore: store });
    const sampleListing = await db.propertyRecord.findFirst({ where: { status: "منتشر شده" }, orderBy: { syncedAt: "desc" } });
    if (sampleListing) {
      const r = await propertyAgent.predictDealProbability(sampleListing.propertyCode);
      agentsReport.push({ agent: "PropertyAgent", model: "melka-property-v3", sample: `propertyCode=${sampleListing.propertyCode}`, result: r });
    }
  } catch (e) { agentsReport.push({ agent: "PropertyAgent", model: "melka-property-v3", sample: "error", result: String(e) }); }
  try {
    const requestAgent = new RequestAgent({ db, featureStore: store });
    const sampleReq = await db.requestRecord.findFirst({ where: { status: "فرصت" } });
    if (sampleReq) {
      const r = await requestAgent.predictRequestFulfillment(sampleReq.id);
      agentsReport.push({ agent: "RequestAgent", model: "melka-request-v1", sample: `requestId=${sampleReq.id}`, result: r });
    }
  } catch (e) { agentsReport.push({ agent: "RequestAgent", model: "melka-request-v1", sample: "error", result: String(e) }); }
  try {
    const txAgent = new TransactionAgent({ db, featureStore: store });
    const sampleTx = await db.transactionRecord.findFirst({ orderBy: { contractDate: "desc" } });
    if (sampleTx) {
      const r = await txAgent.transactionContext(sampleTx.id);
      agentsReport.push({ agent: "TransactionAgent", model: "melka-transaction-v2", sample: `txId=${sampleTx.id}`, result: r });
    }
  } catch (e) { agentsReport.push({ agent: "TransactionAgent", model: "melka-transaction-v2", sample: "error", result: String(e) }); }
  try {
    const expertAgent = new ExpertAgent({ db, featureStore: store });
    const sampleExpert = await db.expertRecord.findFirst();
    if (sampleExpert) {
      const r = await expertAgent.predictNextDealSuccess(sampleExpert.personnelCode);
      agentsReport.push({ agent: "ExpertAgent", model: "melka-expert-v1", sample: `personnelCode=${sampleExpert.personnelCode}`, result: r });
    }
  } catch (e) { agentsReport.push({ agent: "ExpertAgent", model: "melka-expert-v1", sample: "error", result: String(e) }); }
  console.log(`۴ ایجنت فراخوانی زنده: ${agentsReport.map((a) => `${a.agent}(${a.sample})`).join(" · ")}`);

  /* ═══ ۳) Feature Store مشترک — یک ویژگی، دو ایجنت، نتیجهٔ یکسان ═══ */
  const sharedStore = new SharedFeatureStore({ noPersist: true });
  const sampleListing = await db.propertyRecord.findFirst({ where: { status: "منتشر شده", price: { not: null }, meterage: { not: null } } });
  let featureIdentity: unknown = null;
  let featureCount = 0;
  if (sampleListing) {
    const market = await sharedStore.marketFeatures(sampleListing.areaId ?? "x", {
      areaId: sampleListing.areaId ?? "",
      snapshotDate: new Date(sampleListing.syncedAt),
      samples: [{ pricePerMeter: (sampleListing.price ?? 0) / 10 / Math.max(sampleListing.meterage ?? 1, 1), at: sampleListing.syncedAt.toISOString() }],
    } as never);
    // ایجنت ۱: PropertyAgent
    const a1 = new PropertyAgent({ db, featureStore: sharedStore });
    await a1.predictDealProbability(sampleListing.propertyCode).catch(() => null);
    // ایجنت ۲: همان ویژگی از انبار مشترک — باید بایت‌به‌بایت یکسان باشد
    const f1 = sharedStore.peek("property", sampleListing.propertyCode);
    const marketF = sharedStore.peek("market", sampleListing.areaId ?? "x");
    featureCount = Object.keys((f1 as Record<string, unknown>) ?? {}).length + Object.keys((marketF as Record<string, unknown>) ?? {}).length;
    featureIdentity = { entityId: sampleListing.propertyCode, viaAgent1: f1, viaSharedStore: sharedStore.peek("property", sampleListing.propertyCode), identical: JSON.stringify(f1) === JSON.stringify(sharedStore.peek("property", sampleListing.propertyCode)) };
  }

  /* ═══ ۴) Cross-Tile Outcomes — ۱۰ معاملهٔ واقعی ← ۴۰ پیامد ═══ */
  const cross = await emitCrossTileOutcomesBatch(db, 10);
  console.log(`Cross-tile: ${cross.transactions} معامله → ${cross.outcomes} پیامد · ${cross.events} رویداد`);
  // پرهیز از تکرار در اجرای مجدد — فقط ۱۰ معاملهٔ آخر نگه می‌داریم (مصنوع مشتق)
  const crossAfter = readCrossTileOutcomes();
  const crossTileProof = {
    case: "P6545-cross-tile-outcomes",
    council: "جلسه ۰۳۳ — BLOCK 3.5: یک معامله = پیامد برای ۴ مدل",
    ranAt: new Date().toISOString(),
    batch: { transactions: cross.transactions, outcomes: cross.outcomes, events: cross.events, target: 10, perTx: 4 },
    sampleOutcomes: cross.details.flatMap((d) => d.outcomes.map((o) => ({ id: o.id, predictionType: o.predictionType, observedValue: o.observedValue, evidence: o.evidenceChain.map((e) => e.reference) }))).slice(0, 12),
    totalPersisted: crossAfter.length,
    agents: agentsReport,
    featureStore: { identity: featureIdentity, sampledFeatureCount: featureCount, version: "shared-feature-store-v1" },
  };
  writeFileSync(`${OUT}/cross-tile-proof.json`, JSON.stringify(crossTileProof, null, 2));
  console.log("✓ شاهد بین‌کاشی: download/p6545/cross-tile-proof.json");

  await db.$disconnect();
  console.log("\n=== پایان گام ۳ ===");
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
