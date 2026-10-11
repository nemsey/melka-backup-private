/**
 * PN-018 فاز ۷ — شاهد زنده: چرخهٔ Champion/Challenger + رانش + حلقهٔ کامل روی دادهٔ واقعی
 * اجرای مستقیم سرویس‌ها روی پایگاه production (اسکریپت شاهد — عین الگوی پنل‌های پیشین).
 *
 * سناریو (عین سند طراحی §۹ و دستور شورا مرحلهٔ ۳/۴/۵):
 *   الف) champion اولیه از وضعیت فعلی (بدون قهرمان → ساخت v1 به‌عنوان خط پایه، بدون ارتقا)
 *   ب) drift سه‌گانه روی ۷۷۲ جفت واقعی
 *   ج) حلقهٔ کامل هفت‌گام — گام ۶ (ارتقا) با تأیید صریح سند ۰۲۲ (بند مرحلهٔ ۳)
 *   د) آزمون منفی: تلاش ارتقا بدون شورا → رد
 */
import { PrismaClient } from "@prisma/client";
import { existsSync, writeFileSync } from "node:fs";

const db = new PrismaClient();
process.env.DATABASE_URL = "file:/home/z/my-project/db/custom.db";

async function main() {
  const out: Record<string, unknown> = {};

  // ═══ الف) خط پایه: نسخهٔ v1 به‌عنوان قهرمان اولیه (وضعیت امروز حلقه) ═══
  const modelId = "arm-listing-v0";
  const existing = await db.modelVersion.findFirst({ where: { modelId } });
  if (!existing) {
    await db.modelVersion.create({
      data: {
        modelId, version: 1, status: "champion",
        notes: "قهرمان اولیه — وضعیت حلقهٔ واقعی ARM تا پیش از PN-018 (بدون نسخه‌بندی پایدار)",
        councilApproved: true, approvalSource: "PN-018/مرحلهٔ ۳ — ثبت خط پایه (عدم-ارتقا)",
        promotedAt: new Date(),
      },
    });
    out.baselineSeeded = true;
  } else {
    out.baselineSeeded = false;
    out.baselineExisting = { id: existing.id, version: existing.version, status: existing.status };
  }
  const champion = await db.modelVersion.findFirst({ where: { modelId, status: "champion" } });
  out.championBefore = { version: champion!.version, id: champion!.id };

  // ═══ ب) رانش سه‌گانه روی دادهٔ واقعی ═══
  const { runDriftDetection, loadRealPairs, splitWindows, windowBriers } = await import("@/lib/services/drift-service");
  const pairs = await loadRealPairs();
  const { baseline, recent } = splitWindows(pairs);
  const briers = windowBriers(baseline, recent);
  const driftRun = await runDriftDetection(modelId);
  out.drift = {
    pairs: pairs.length,
    windowSplit: { baseline: baseline.length, recent: recent.length },
    windowBriers: briers,
    reports: driftRun.reports,
    note: "آستانه‌ها: alert≥0.02 · retrain≥0.05 · escalate≥0.10 (پیوست ج سند طراحی)",
  };

  // ═══ ج) حلقهٔ کامل هفت‌گام (گام ۶ با تأیید سند ۰۲۲) ═══
  const { runFullLearningCycle } = await import("@/lib/services/learning-loop-service");
  const fullLoop = await runFullLearningCycle({
    modelId,
    councilApproval: true,
    approvalSource: "ملکا-شورا-ن۰۲۲-۱۴۰۵ — بند مرحلهٔ ۳ (Champion/Challenger) — یک چرخهٔ کامل الزامی",
    actor: "pn018-witness-script",
  });
  out.fullLoop = fullLoop;

  // ═══ د) آزمون منفی: چالشگر تازه + ارتقا بدون شورا ═══
  const { ensureChallenger, promoteModelVersion } = await import("@/lib/services/model-versioning-service");
  let negativeTest: Record<string, unknown> = {};
  try {
    const challenger2 = await ensureChallenger({ modelId, notes: "آزمون منفی دروازهٔ شورا", actor: "pn018-witness-script" });
    await promoteModelVersion(challenger2.id, { councilApproval: false, actor: "pn018-witness-script" });
    negativeTest = { rejected: false, error: "دروازه کار نکرد — باگ!" };
  } catch (e) {
    negativeTest = { rejected: true, code: (e as { code?: string }).code, message: (e as Error).message.slice(0, 140) };
  }
  out.councilGateNegativeTest = negativeTest;

  // پاک‌سازی چالشگر آزمون منفی (اگر ساخته شد و رد نشد خود دروازه، آنجا reject می‌کنیم)
  const leftover = await db.modelVersion.findFirst({ where: { modelId, status: "challenger", notes: { contains: "آزمون منفی" } } });
  if (leftover) {
    await db.modelVersion.update({ where: { id: leftover.id }, data: { status: "rejected", retiredAt: new Date() } });
    out.negativeTestChallengerCleaned = true;
  }

  // وضعیت نهایی
  const versions = await db.modelVersion.findMany({ where: { modelId }, orderBy: { version: "asc" } });
  out.versionsAfter = versions.map((v) => ({
    version: v.version, status: v.status, brier: v.brierScore, sample: v.sampleSize,
    windowDays: v.windowDays, councilApproved: v.councilApproved, approvalSource: v.approvalSource?.slice(0, 60),
  }));
  const auditRows = await db.auditLog.findMany({
    where: { action: { in: ["MODEL_PROMOTED", "MODEL_CHALLENGER_CREATED", "MODEL_REJECTED", "MODEL_ROLLED_BACK", "DRIFT_DETECTED"] } },
    orderBy: { createdAt: "desc" }, take: 8,
  });
  out.auditTrail = auditRows.map((a) => ({ action: a.action, actor: a.actor, detail: (a.detail ?? "").slice(0, 100), at: a.createdAt.toISOString() }));
  const driftRows = await db.driftCheck.findMany({ where: { modelId }, orderBy: { checkedAt: "desc" }, take: 3 });
  out.driftRowsPersisted = driftRows.map((r) => ({ type: r.driftType, action: r.action, magnitude: r.magnitude, at: r.checkedAt.toISOString() }));

  out.generatedAt = new Date().toISOString();
  out.realData = { predictionsFile: existsSync("intelligence-data/predictions.jsonl"), pairsLoaded: pairs.length };

  writeFileSync("download/pn018/champion-challenger.json", JSON.stringify(out, null, 2), "utf8");
  const o = out as {
    championBefore: unknown;
    drift: { reports: unknown };
    fullLoop: {
      step1_collectPairs: unknown; step2_evaluateChampion: unknown; step4_ensureChallenger: unknown;
      step5_shadow: { verdict: string }; step6_promote: unknown; step7_newPrediction: unknown;
    };
    councilGateNegativeTest: unknown;
    versionsAfter: unknown;
  };
  console.log(JSON.stringify({
    championBefore: o.championBefore,
    drift: { reports: o.drift.reports },
    fullLoop: {
      step1: o.fullLoop.step1_collectPairs,
      step2: o.fullLoop.step2_evaluateChampion,
      step4: o.fullLoop.step4_ensureChallenger,
      step5: { verdict: o.fullLoop.step5_shadow.verdict },
      step6: o.fullLoop.step6_promote,
      step7: o.fullLoop.step7_newPrediction,
    },
    councilGateNegativeTest: o.councilGateNegativeTest,
    versionsAfter: o.versionsAfter,
  }, null, 2));
}

main().catch((e) => { console.error("FAIL:", e); process.exit(1); }).finally(() => db.$disconnect());
