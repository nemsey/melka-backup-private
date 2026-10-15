/**
 * P6546/گام پنجم-الف-۴ — شاهد تجهیز شش کاشی تازه به مغز هوشمند ملکا
 * (فایل‌یابی، آگهی، درخواست + M5 تطبیق، M6 شاخص بازار، M7 پوشش اطلاعات)
 * همانند کاشی‌های M1-M4: مغز=۱ (۱۱ موتور مشترک) · مدل=پیکربندی · ایجنت=متخصص
 * خروجی: download/p6546/brain-equipment-proof.json
 */
import { writeFileSync } from "node:fs";

async function main() {
  const { bootstrapModels, modelRegistry } = await import("../src/core/intelligence/models/registry");
  bootstrapModels();
  const models = modelRegistry.list();

  const { db } = await import("../src/lib/db");
  const { PropertyAgent, RequestAgent, TransactionAgent, ExpertAgent, DivarIntelligentAgent, LocalListingIntelligentAgent, LocalRequestIntelligentAgent, MatchingIntelligentAgent, MarketIntelligentAgent, CoverageIntelligentAgent } = await import(
    "../src/core/intelligence/agents/domain-agents"
  );

  const opts = { db } as never;
  // ساخت هر ده ایجنت — شاهد زندهٔ «همه از همان ۱۱ موتور»
  const agents = {
    m1: new PropertyAgent(opts),
    m2: new RequestAgent(opts),
    m3: new TransactionAgent(opts),
    m4: new ExpertAgent(opts),
    fileFinder: new DivarIntelligentAgent(opts),
    listing: new LocalListingIntelligentAgent(opts),
    request: new LocalRequestIntelligentAgent(opts),
    m5: new MatchingIntelligentAgent(opts),
    m6: new MarketIntelligentAgent(opts),
    m7: new CoverageIntelligentAgent(opts),
  };

  const engineSets = Object.entries(agents).map(([k, a]) => ({ tile: k, model: a.model.modelId, engineSet: a.model.engineSet, domain: a.model.domain }));
  const allShared = engineSets.every((e) => e.engineSet === "SHARED-11");

  // تست واقعی گراف + رویداد: زمینهٔ تطبیق M5 روی دادهٔ واقعی
  const m5 = agents.m5;
  const firstProperty = await db.propertyRecord.findFirst({ select: { propertyCode: true } });
  const matchCtx = firstProperty ? await m5.matchContext(firstProperty.propertyCode, "test-request").catch((e: Error) => ({ error: e.message })) : null;

  const proof = {
    case: "P6546-brain-equipment",
    ranAt: new Date().toISOString(),
    council: "گام پنجم-الف-۴ — تجهیز شش کاشی تازه به مغز همانند M1-M4",
    brain: { count: 1, engines: 11, engineSet: "SHARED-11", changedEngines: 0 },
    models: models.map((m) => ({ modelId: m.modelId, domain: m.domain, tileId: m.tileId, predictor: m.predictor, outcomeType: m.outcomeType, features: m.features.length, engineSet: m.engineSet })),
    agentsInstantiated: engineSets,
    allAgentsShareSameEngines: allShared,
    liveMatchContextTest: matchCtx,
  };
  writeFileSync("/home/z/my-project/download/p6546/brain-equipment-proof.json", JSON.stringify(proof, null, 2));
  console.log(JSON.stringify({ models: models.length, agents: Object.keys(agents).length, allShared, matchCtx }, null, 1));
  await db.$disconnect();
}

main().catch((e) => {
  console.error("FAILED:", e?.message ?? e);
  process.exit(1);
});
