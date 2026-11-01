/**
 * pn038/learning-cycle.ts — فاز ۵ (PN-038 · شورا-ن۰۶۳):
 * «۵.۱ اجرای چرخهٔ یادگیری روی داده‌های تازه · ۵.۲ ارتقا به Tier ۴ در صورت Brier ≤ ۰٫۲۰»
 *
 * اجرای کامل حلقهٔ یادگیری روی دادهٔ واقعی زنده + داوری ارتقای Tier 4.
 * شاهدها: download/pn038/learning-cycle.json + download/pn038/tier4-activation.json
 */

import { writeFileSync, mkdirSync } from "node:fs";

// env زنده
for (const p of ["../../.env", "../../env.platform.json"]) {
  try {
    const url = new URL(p, import.meta.url);
    const raw = await Bun.file(url).text();
    if (p.endsWith(".json")) {
      const plat = JSON.parse(raw) as Record<string, string>;
      for (const [k, v] of Object.entries(plat)) if (typeof v === "string" && !process.env[k]) process.env[k] = v;
    } else {
      for (const line of raw.split("\n")) {
        const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch { /* اختیاری */ }
}

mkdirSync("download/pn038", { recursive: true });
const t0 = Date.now();

try {
  // ── ۵.۱: چرخهٔ یادگیری روی دادهٔ تازه ──
  const { runFullLearningCycle } = await import("@/lib/services/learning-loop-service");
  const witness = await runFullLearningCycle({ actor: "glm:pn038-phase5" });
  const brier = witness.step2_evaluateChampion?.brier ?? null;
  const tierNow = witness.step2_evaluateChampion?.tier ?? null;

  const cycleWitness = {
    at: new Date().toISOString(),
    phase: "PN-038/۵.۱ — چرخهٔ یادگیری روی دادهٔ تازه",
    actor: "glm:pn038-phase5",
    witness,
    summary: {
      pairs: witness.step1_collectPairs?.pairs ?? null,
      brier,
      tierFromRealData: tierNow,
      championVersion: witness.step2_evaluateChampion?.championVersion ?? null,
      durationMs: Date.now() - t0,
    },
    ok: true,
  };
  writeFileSync("download/pn038/learning-cycle.json", JSON.stringify(cycleWitness, null, 2));
  console.log(`[phase5] چرخهٔ یادگیری: pairs=${cycleWitness.summary.pairs} · Brier=${brier} · Tier=${tierNow} · ${cycleWitness.summary.durationMs}ms`);

  // ── ۵.۲: داوری ارتقای Tier ۴ (شرط: Brier ≤ ۰٫۲۰) ──
  const TIER4_BRIER_MAX = 0.20;
  const brierValue = typeof brier === "number" ? brier : null;
  const eligible = brierValue !== null && brierValue <= TIER4_BRIER_MAX;

  const tier4Witness = {
    at: new Date().toISOString(),
    phase: "PN-038/۵.۲ — داوری ارتقای Tier ۴",
    condition: { rule: "Brier ≤ ۰٫۲۰ (شورا-ن۰۶۳)", threshold: TIER4_BRIER_MAX, measured: brierValue },
    tierFromRealData: tierNow,
    decision: eligible ? "ACTIVATE" : "HOLD",
    decisionFa: eligible
      ? "شرط برقرار است — Tier ۴ فعال می‌شود"
      : "شرط برقرار نیست — Tier فعلی حفظ می‌شود (دکترین شورا: ارتقا فقط با شاهد کمّی)",
    note: eligible
      ? null
      : `Brier اندازه‌گیری‌شده ${brierValue} بالاتر از آستانهٔ ${TIER4_BRIER_MAX} است — ارتقای خودکار ممنوع (عین قانون قهرمان/چالشگر: بدون رأی شورا ارتقا نیست؛ این شاهد مستند جهت جلسهٔ بعدی شوراست)`,
    evidence: "download/pn038/learning-cycle.json",
    ok: true,
  };
  writeFileSync("download/pn038/tier4-activation.json", JSON.stringify(tier4Witness, null, 2));
  console.log(`[phase5] Tier 4 داوری: ${tier4Witness.decision} (Brier=${brierValue} · آستانه=${TIER4_BRIER_MAX})`);
  process.exit(0);
} catch (e) {
  const errWitness = {
    at: new Date().toISOString(),
    phase: "PN-038/فاز ۵",
    ok: false,
    error: String((e as Error).message).slice(0, 300),
  };
  writeFileSync("download/pn038/learning-cycle.json", JSON.stringify(errWitness, null, 2));
  console.error("[phase5] خطا:", errWitness.error);
  process.exit(1);
}
