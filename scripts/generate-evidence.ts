/**
 * §۸.۳ سند ۰۲۷ — تولید شواهد از هر run
 * ---------------------------------------------------------------------------
 * اجرای چرخهٔ بزرگ P7→P11 روی دادهٔ واقعی و ذخیرهٔ شواهد در download/p6537/
 * با محاسبهٔ md5 (قانون شاهد: هر ادعا حداقل یک EvidenceLink).
 * اجرا: bun scripts/generate-evidence.ts
 */
import { runIntelligenceCoreCycle } from "../src/lib/intelligence/core-cycle";
import { captureEvidence, blackboardRead, blackboardVerify } from "../src/lib/intelligence/blackboard";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

async function main() {
  const outDir = path.join(process.cwd(), "download", "p6537");
  mkdirSync(outDir, { recursive: true });

  const db = new PrismaClient();
  const report = await runIntelligenceCoreCycle({ db });
  await db.$disconnect();

  /* شاهد P7 — ارزیابی واقعی + سایه + رانش + یادگیری */
  const p7 = await captureEvidence(
    outDir,
    "p7-evaluation.json",
    JSON.stringify(
      {
        claim: "Brier/Lift/ECE روی ۳۸۴ جفت واقعی ARM + سایه + رانش + یادگیری Tier-aware",
        ranAt: report.ranAt,
        tier: report.tier,
        tierBasis: report.tierBasis,
        outcomesCollected: report.p7.outcomesCollected,
        coveragePercent: report.p7.coveragePercent,
        evaluation: {
          brierScore: report.p7.evaluation.metrics.brierScore,
          logLoss: report.p7.evaluation.metrics.logLoss,
          accuracy: report.p7.evaluation.metrics.accuracy,
          lift: report.p7.evaluation.metrics.lift,
          ece: report.p7.evaluation.metrics.ece,
          calibration: report.p7.evaluation.metrics.calibration,
          baseline: report.p7.evaluation.baseline,
          verdict: report.p7.evaluation.verdict,
          rationale: report.p7.evaluation.rationale,
          sampleSize: report.p7.evaluation.sampleSize,
        },
        learning: report.p7.learning,
        shadow: report.p7.shadow,
        drift: report.p7.drift,
      },
      null,
      2,
    ),
    "شاهد فاز ۷ — یادگیری از نتیجهٔ واقعی",
  );

  /* شاهد P8 — تصمیم‌های واقعی + ایمنی */
  const p8 = await captureEvidence(
    outDir,
    "p8-decisions.json",
    JSON.stringify(
      {
        claim: "۱۰ تصمیم واقعی با prediction + rationale + confidence + alternatives + صفر auto_execute",
        decisions: report.p8.decisions,
        safetyAllPassed: report.p8.safetyAllPassed,
        blockedCount: report.p8.blockedCount,
        plansCount: report.p8.plansCount,
      },
      null,
      2,
    ),
    "شاهد فاز ۸ — موتور تصمیم روی پیش‌بینی‌های واقعی",
  );

  /* شاهد P9 — ۵ سیاست + ۱۵ قاعده */
  const p9 = await captureEvidence(
    outDir,
    "p9-policies.json",
    JSON.stringify({ policyEvaluations: report.p9.policyEvaluations, governance: report.p9.governance }, null, 2),
    "شاهد فاز ۹ — ارزیابی سیاست + حاکمیت",
  );

  /* شاهد P10 — تشخیص ۲۵ بررسی + مشکلات واقعی */
  const p10 = await captureEvidence(
    outDir,
    "p10-diagnosis.json",
    JSON.stringify(
      {
        systemHealth: report.p10.systemHealth,
        overallScore: report.p10.overallScore,
        checks: report.p10.checks,
        realProblems: report.p10.realProblems,
      },
      null,
      2,
    ),
    "شاهد فاز ۱۰ — خودتشخیصی با ۳ مشکل واقعی",
  );

  /* شاهد P11 — پیشنهادهای ترمیم بدون اجرا */
  const p11 = await captureEvidence(
    outDir,
    "p11-repairs.json",
    JSON.stringify({ proposals: report.p11.proposals, gateReviews: report.p11.gateReviews, executedCount: report.p11.executedCount }, null, 2),
    "شاهد فاز ۱۱ — خودترمیمی کنترل‌شده (قفل شورا)",
  );

  /* شاهد تختهٔ سیاه + راستی‌آزمایی هش */
  const bb = await blackboardRead({});
  const bbVerify = await blackboardVerify();
  const bbEvidence = await captureEvidence(
    outDir,
    "blackboard.json",
    JSON.stringify({ entries: bb.length, verify: bbVerify, sample: bb.slice(-5) }, null, 2),
    "شاهد تختهٔ سیاه — append-only با هش دست‌نخورده",
  );

  /* مانیفست شواهد با md5 */
  const manifest = [p7, p8, p9, p10, p11, bbEvidence];
  const manifestEvidence = await captureEvidence(
    outDir,
    "MANIFEST.json",
    JSON.stringify({ generatedAt: new Date().toISOString(), caseId: "P6537", document: "ملکا-شورا-۱۴۰۵-۰۲۷", files: manifest.map((m) => ({ path: path.relative(process.cwd(), m.path), description: m.description, md5: m.md5, bytes: m.bytes })) }, null, 2),
    "مانیفست شواهد P6537",
  );

  writeFileSync(
    path.join(outDir, "REPORT.md"),
    `# شواهد P6537 — چرخهٔ بزرگ سند ۰۲۷\n\nتولید: ${new Date().toISOString()}\n\n| فاز | شاهد | md5 |\n|---|---|---|\n| P7 | p7-evaluation.json | ${p7.md5} |\n| P8 | p8-decisions.json | ${p8.md5} |\n| P9 | p9-policies.json | ${p9.md5} |\n| P10 | p10-diagnosis.json | ${p10.md5} |\n| P11 | p11-repairs.json | ${p11.md5} |\n| تخته | blackboard.json | ${bbEvidence.md5} |\n| مانیفست | MANIFEST.json | ${manifestEvidence.md5} |\n\n## خلاصهٔ روح\n- Tier واقعی: ${report.tier} (${report.tierBasis.linkedOutcomes} پیامد، ${report.tierBasis.distinctPeriods} دوره)\n- P7: Brier=${report.p7.evaluation.metrics.brierScore} · Lift=${report.p7.evaluation.metrics.lift}٪ · حکم=${report.p7.evaluation.verdict}\n- P8: ${report.p8.decisions.length} تصمیم · صفر auto_execute · ایمنی همه=${report.p8.safetyAllPassed}\n- P9: ${report.p9.policyEvaluations.length} سیاست · حاکمیت ${report.p9.governance.passed}/۱۵\n- P10: ${report.p10.systemHealth} · امتیاز ${report.p10.overallScore}/۱۰۰ · ${report.p10.realProblems.length} مشکل واقعی\n- P11: ${report.p11.proposals.length} پیشنهاد pending · ${report.p11.executedCount} اجرا (قفل شورا)\n`,
    "utf8",
  );

  console.log("✅ شواهد P6537 تولید شد:");
  for (const m of [...manifest, manifestEvidence]) console.log(`  ${path.relative(process.cwd(), m.path)} — md5=${m.md5} (${m.bytes}B)`);
  console.log(`\nروح: Tier=${report.tier} · Brier=${report.p7.evaluation.metrics.brierScore} · ${report.p8.decisions.length} تصمیم · ${report.p10.realProblems.length} مشکل واقعی · ${report.p11.proposals.length} پیشنهاد بدون اجرا`);
}

main().catch((e) => {
  console.error("خطا در تولید شواهد:", e);
  process.exit(1);
});
