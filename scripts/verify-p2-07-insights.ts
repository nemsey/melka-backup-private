/**
 * P2-07 — دفع خروجی عددی بینش‌های همه ایجنت‌ها (برای مقایسه قبل/بعد)
 * ------------------------------------------------------
 * استفاده: DATABASE_URL=file:…test-repository.db bun scripts/verify-p2-07-insights.ts <out.json>
 *
 * در هر دو درخت (baseline و فعلی) اجرا می‌شود و خروجی JSON یکسانی باید بدهد:
 * برای هر ایجنت: renderInsights (بینش‌ها با وزن نهایی + نسخه سیاست + خاطره‌ها)
 * و learningStats. داده ورودی = کاشت قطعی seed-p2-07-regression.ts.
 */

const outPath = process.argv[2];
if (!outPath) {
  console.error("مسیر خروجی JSON بدهید: bun scripts/verify-p2-07-insights.ts <out.json>");
  process.exit(2);
}

const { listAgents, getAgent } = await import("../src/core/agent");
const { db } = await import("../src/lib/db");

const result: Record<string, unknown> = {};

for (const { tileId, name } of listAgents()) {
  const agent = getAgent(tileId);
  if (!agent) continue;
  // آمار «پیش از» رندر خوانده می‌شود — ثبت INTERACTION رندر روی مقایسه اثر نمی‌گذارد
  const stats = await agent.learningStats();
  const rendered = await agent.renderInsights();
  result[tileId] = {
    agentName: name,
    policyVersion: rendered.policyVersion,
    memoryHits: rendered.memoryHits,
    insights: rendered.insights.map((i) => ({
      key: i.key,
      domain: i.domain,
      title: i.title,
      body: i.body,
      severity: i.severity,
      metrics: i.metrics ?? null,
      finalWeight: i.finalWeight,
      learned: i.learned,
      weightSource: i.weightSource,
    })),
    stats,
  };
}

await Bun.write(outPath, JSON.stringify(result, null, 2));
const insightCount = Object.values(result).reduce<number>((a, r) => a + ((r as { insights: unknown[] }).insights.length), 0);
console.log(`دفع شد: ${outPath} — ${Object.keys(result).length} ایجنت، ${insightCount} بینش`);
await db.$disconnect();

export {};
