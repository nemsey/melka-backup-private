/**
 * PN-024 · ثانیاً — شاهد سرویس فرا-ذهن (دادهٔ زندهٔ هر دو نقطهٔ UI)
 * اجرا: DATABASE_URL=file:/home/z/my-project/db/custom.db bun scripts/pn024/metamind-witness.ts
 */
import { writeFileSync } from "fs";
import { metaMindSnapshot } from "@/lib/services/meta-mind-service";

async function main() {
  const t0 = Date.now();
  const snap = await metaMindSnapshot();
  const ms = Date.now() - t0;
  const out = "/home/z/my-project/download/pn024/meta-mind-service.json";
  writeFileSync(out, JSON.stringify({
    workOrder: "PN-024 ثانیاً — سرویس فرا-ذهن (موتورهای ۱۲-۱۵ روی دادهٔ واقعی — هر دو نقطهٔ UI)",
    generatedAt: new Date().toISOString(),
    durationMs: ms,
    snapshot: snap,
    uiPoints: ["تنظیمات عمومی → بخش «مغز هوشمند و یادگیر ملکا»", "کاشی M6 «مغز ملکا — یادگیری و Tier» → تب «فرا-ذهن»"],
  }, null, 2));
  console.log(`✓ سرویس فرا-ذهن — ${ms}ms`);
  console.log(`  توجه: ${snap.engines.attention.top.length} برتر از ${snap.engines.attention.considered} (برتر: ${snap.engines.attention.top[0]?.itemId} = ${snap.engines.attention.top[0]?.total})`);
  console.log(`  علّیت: زنده=${snap.engines.causal.alive} · ${snap.engines.causal.nodes} گره · ${snap.engines.causal.edges} یال · do(hasImage)=${snap.engines.causal.refIntervention?.totalEffect.toFixed(3)}`);
  console.log(`  پادواقع: ${snap.engines.counterfactual.scenarios.length} سناریو (${snap.engines.counterfactual.evidenceNote})`);
  console.log(`  شبیه‌سازی: زنده=${snap.engines.simulation.alive} · توصیه: ${snap.engines.simulation.comparison?.recommendation.slice(0, 80)}…`);
  if (snap.notes.length > 0) console.log(`  یادداشت‌ها: ${snap.notes.join(" · ")}`);
}

main().catch((e) => { console.error("شکست:", e); process.exit(1); });
