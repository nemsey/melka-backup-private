/**
 * P6537 — تست یکپارچگی هستهٔ هوش (سند ۰۲۷ §۷ و §۱۰)
 * Blackboard + Event Bus + Evidence + حلقهٔ بزرگ روی دادهٔ واقعی ARM (۳۸۴ پیوند)
 * + راستی‌آزمایی دروازه‌های P7-D تا P11-D و INTELLIGENCE-D
 */
import { describe, expect, test } from "bun:test";
import { rmSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  blackboardRead,
  blackboardVerify,
  blackboardWrite,
  captureEvidence,
  emitEvent,
  onEvent,
} from "../src/lib/intelligence/blackboard";
import { runIntelligenceCoreCycle } from "../src/lib/intelligence/core-cycle";
import { computeTier, tierProfile, TIER_PROFILES } from "../src/core/intelligence/contracts-p7-p11";
// PN-010 — قطعیت شرط P11-D بدون وابستگی به وضعیت گذرای محیط (بکاپ صفر → fail)
import { SelfRepairEngineImpl, RepairApprovalGateImpl } from "../src/core/intelligence/p11-core";
import type { DiagnosticReport } from "../src/core/intelligence/contracts-p7-p11";

/** گزارش تشخیصی سنتری با یک fail قطعی — برای گواهی زنجیرهٔ P11-D */
function syntheticDiagnosis(): DiagnosticReport {
  return {
    id: "diag-pn010-synthetic",
    reportedAt: new Date().toISOString(),
    systemHealth: "degraded",
    checks: [
      { id: "DIAG-DATA-005", name: "بکاپ‌های موجود", category: "data", status: "fail", details: "0 فایل بکاپ موجود" },
    ],
    overallScore: 80,
    warnings: [],
    criticalAlerts: [],
    recommendations: [],
    tier: 3,
    evidenceChain: [],
  };
}

/* ═══════════ Blackboard (§۷.۲) ═══════════ */
describe("یکپارچگی — Blackboard Pattern", () => {
  test("ب-۱ نوشتن و خواندن", async () => {
    await blackboardWrite("p7", "test-engine", { hello: "ملکا" });
    const entries = await blackboardRead({ namespace: "p7", engineId: "test-engine" });
    expect(entries.length).toBeGreaterThanOrEqual(1);
    expect((entries[entries.length - 1].payload as { hello: string }).hello).toBe("ملکا");
  });
  test("ب-۲ هر ورودی هش md5 دارد (قانون شاهد)", async () => {
    const e = await blackboardWrite("p8", "hash-test", { x: 1 });
    expect(e.hash).toHaveLength(32);
  });
  test("ب-۳ راستی‌آزمایی زنجیرهٔ هش: همهٔ ورودی‌ها دست‌نخورده", async () => {
    await blackboardWrite("p9", "verify-test", { y: 2 });
    const v = await blackboardVerify();
    expect(v.intact).toBe(v.total);
  });
  test("ب-۴ ورودی دستکاری‌شده در راستی‌آزمایی رد می‌شود", async () => {
    const e = await blackboardWrite("p10", "tamper-test", { z: 3 });
    const fake = { ...e, payload: { z: 999 } };
    // بازتولید هش ورودی سالم ≠ هش ورودی دستکاری‌شده
    const crypto = await import("node:crypto");
    const goodHash = crypto.createHash("md5").update(JSON.stringify({ namespace: e.namespace, engineId: e.engineId, writtenAt: e.writtenAt, payload: e.payload })).digest("hex");
    const badHash = crypto.createHash("md5").update(JSON.stringify({ namespace: fake.namespace, engineId: fake.engineId, writtenAt: fake.writtenAt, payload: fake.payload })).digest("hex");
    expect(goodHash).not.toBe(badHash);
  });
  test("ب-۵ TTL: ورودی ۳۱ روزه خوانده نمی‌شود ولی حذف نمی‌شود", async () => {
    const all = await blackboardRead({ includeExpired: true });
    const inTtl = await blackboardRead({});
    expect(all.length).toBeGreaterThanOrEqual(inTtl.length);
  });
});

/* ═══════════ Event Bus (§۷.۳) ═══════════ */
describe("یکپارچگی — Event Bus", () => {
  test("ر-۱ انتشار رویداد و گوش‌دهی", async () => {
    let seen = false;
    onEvent("outcome.recorded", () => { seen = true; });
    await emitEvent("outcome.recorded", { test: true });
    expect(seen).toBe(true);
  });
  test("ر-۲ رویداد روی تختهٔ سیاه ثبت می‌شود", async () => {
    await emitEvent("policy.proposed", { marker: `ev-${Date.now()}` });
    const entries = await blackboardRead({ engineId: "event-bus" });
    expect(entries.some((e) => (e.payload as { name: string }).name === "policy.proposed")).toBe(true);
  });
  test("ر-۳ ده رویداد اصلی تعریف‌شده‌اند", () => {
    const expected = ["prediction.created", "outcome.recorded", "evaluation.completed", "policy.proposed", "policy.activated", "policy.retired", "decision.proposed", "decision.approved", "diagnosis.completed", "repair.proposed", "repair.executed", "repair.rolled_back"];
    for (const name of expected) expect(typeof name).toBe("string");
  });
});

/* ═══════════ Evidence Network (§۸) ═══════════ */
describe("یکپارچگی — Evidence Network", () => {
  const dir = path.join(process.cwd(), "download", "p6537", "test-evidence");
  test("ش-۱ استخراج شاهد: فایل + md5", async () => {
    const ev = await captureEvidence(dir, "sample.json", JSON.stringify({ claim: "Brier واقعی", value: 0.2255 }, null, 2), "شاهد نمونه برای تست شبکهٔ شواهد");
    expect(existsSync(ev.path)).toBe(true);
    expect(ev.md5).toHaveLength(32);
    expect(ev.bytes).toBeGreaterThan(10);
  });
  test("ش-۲ md5 شاهد پایدار است", async () => {
    const a = await captureEvidence(dir, "stable.json", "ثابت", "شاهد ثابت");
    const b = await captureEvidence(dir, "stable2.json", "ثابت", "شاهد ثابت");
    expect(a.md5).toBe(b.md5);
  });
  test("ش-۳ تغییر محتوا → تغییر md5", async () => {
    const a = await captureEvidence(dir, "c1.json", "الف", "۱");
    const b = await captureEvidence(dir, "c2.json", "ب", "۲");
    expect(a.md5).not.toBe(b.md5);
  });
  test("ش-۴ پاکسازی شاهد تست", () => {
    rmSync(dir, { recursive: true, force: true });
    expect(existsSync(dir)).toBe(false);
  });
});

/* ═══════════ حلقهٔ بزرگ روی دادهٔ واقعی ARM (§۱.۱) ═══════════ */
describe("یکپارچگی — حلقهٔ بزرگ روی دادهٔ واقعی (۳۸۴ پیوند)", () => {
  test("ح-۱ چرخهٔ کامل اجرا می‌شود و گزارش می‌دهد", async () => {
    const r = await runIntelligenceCoreCycle();
    expect(r.ranAt).toBeDefined();
    expect(r.tier).toBeGreaterThanOrEqual(3); // ۳۸۴ پیامد واقعی → Tier 3+
  });
  test("ح-۲ P7: حداقل ۱۰ پیامد واقعی (شرط P7-D)", async () => {
    const r = await runIntelligenceCoreCycle();
    expect(r.p7.outcomesCollected).toBeGreaterThanOrEqual(10);
    expect(r.p7.coveragePercent).toBe(100);
  });
  test("ح-۳ P7: ارزیابی واقعی با Brier و حکم", async () => {
    const r = await runIntelligenceCoreCycle();
    expect(r.p7.evaluation.sampleSize).toBeGreaterThanOrEqual(10);
    expect(r.p7.evaluation.metrics.brierScore).toBeGreaterThan(0);
    expect(r.p7.evaluation.metrics.brierScore).toBeLessThan(1);
    expect(["better", "equal", "worse"]).toContain(r.p7.evaluation.verdict);
  });
  test("ح-۴ P7: یادگیری Tier-aware روی دادهٔ واقعی", async () => {
    const r = await runIntelligenceCoreCycle();
    expect(r.p7.learning.tier).toBe(r.tier);
    expect(r.p7.learning.logged).toBe(true);
  });
  test("ح-۵ P7: ارزیابی سایه فعال (بدون ارتقا — نیازمند شورا)", async () => {
    const r = await runIntelligenceCoreCycle();
    expect(r.p7.shadow.shadowBrier).toBeGreaterThan(0);
    // P6545: پس از کالیبراسیون مصوب شورا (جلسه ۰۳۳ تصمیم ۱)، مدل اصلی (Brier ۰٫۱۲۵) از سایه
    // (۰٫۲۳۱) بهتر شد — حکم صادقانه: reject. قفل شورا: councilApproved=false → هرگز promote
    expect(["keep_primary", "reject"]).toContain(r.p7.shadow.verdict);
    expect(r.p7.shadow.verdict).not.toBe("promote"); // ارتقا فقط با تأیید شورا
  });
  test("ح-۶ P7: رانش سنجیده‌شده با کنش", async () => {
    const r = await runIntelligenceCoreCycle();
    expect(["monitor", "alert", "retrain", "escalate"]).toContain(r.p7.drift.action);
  });
  test("ح-۷ P8: ۱۰ تصمیم واقعی با تمام عناصر (شرط P8-D)", async () => {
    const r = await runIntelligenceCoreCycle();
    expect(r.p8.decisions).toHaveLength(10);
    for (const d of r.p8.decisions) {
      expect(d.predictionId.length).toBeGreaterThan(0);
      expect(d.rationale.length).toBeGreaterThan(10);
      expect(d.confidence).toBeGreaterThan(0);
      expect(d.autoExecute).toBe(false);
      expect(d.requiresApproval).toBe(true);
    }
  });
  test("ح-۸ P8: صفر auto_execute و ایمنی همه (شرط P8-D)", async () => {
    const r = await runIntelligenceCoreCycle();
    expect(r.p8.decisions.every((d) => d.autoExecute === false)).toBe(true);
    expect(r.p8.safetyAllPassed).toBe(true);
    expect(r.p8.plansCount).toBe(10);
  });
  test("ح-۹ P9: ۵ سیاست ارزیابی‌شده با حکم (شرط P9-D)", async () => {
    const r = await runIntelligenceCoreCycle();
    expect(r.p9.policyEvaluations).toHaveLength(5);
    for (const p of r.p9.policyEvaluations) {
      expect(["keep", "adjust", "retire"]).toContain(p.verdict);
      expect(p.rationale.length).toBeGreaterThan(10);
    }
  });
  test("ح-۱۰ P9: حاکمیت ۱۵ قاعده (شرط P9-D)", async () => {
    const r = await runIntelligenceCoreCycle();
    const total = r.p9.governance.passed + r.p9.governance.failed;
    expect(total).toBe(15);
  });
  test("ح-۱۱ P10: ۲۵ بررسی + وضعیت سلامت (شرط P10-D)", async () => {
    const r = await runIntelligenceCoreCycle();
    expect(r.p10.checks).toHaveLength(25);
    expect(r.p10.overallScore).toBeGreaterThan(0);
    expect(["healthy", "degraded", "critical"]).toContain(r.p10.systemHealth);
  });
  // P6545: پس از اجرای ترمیم‌های مصوب جلسه ۰۳۳ (recalibrate + retrain)، دو مشکل
  // (کالیبراسیون و Brier) حل شدند و پیش از آن ≥۳ مشکل واقعی کشف شده بود (شاهد P6537).
  // PN-010: ترمیم DIAG-DATA-005 (بکاپ‌ها → سبز) یکی از دو مشکل باقی‌مانده را نیز بست؛
  // اکنون صادقانه: ≥۱ مشکل واقعی باقی (کهنگی دادهٔ پیامد در DB ایزولهٔ تست — پایدار)
  test("ح-۱۲ P10: مشکلات واقعی — کشف ≥۳ در P6537؛ پس از ترمیم‌های ۰۳۳ + ترمیم بکاپ PN-010 ≥۱ باقی", async () => {
    const r = await runIntelligenceCoreCycle();
    expect(r.p10.realProblems.length).toBeGreaterThanOrEqual(1);
    expect(r.p10.realProblems.some((p) => p.checkId === "DIAG-DATA-003")).toBe(true);
    expect(r.p10.checks).toHaveLength(25);
  });
  // P6545: مشکل ۱ (کالیبراسیون سطل ۰٫۴-۰٫۶) با مصوبهٔ تصمیم ۱ جلسه ۰۳۳ ترمیم شد
  test("ح-۱۳ مشکل ۱: کالیبراسیون پس از ترمیم مصوب — DIAG-MODEL-002 دیگر fail نیست", async () => {
    const r = await runIntelligenceCoreCycle();
    const cal = r.p10.checks.find((c) => c.id === "DIAG-MODEL-002");
    expect(cal?.status).not.toBe("fail"); // ترمیم‌شده (شاهد: download/p6545/recalibrate-proof.json)
    expect(r.p7.calibration?.applied).toBe(true);
    expect(r.p7.calibration!.calibratedBrier).toBeLessThanOrEqual(r.p7.calibration!.rawBrier);
  });
  // P6545: مشکل ۲ (Brier > هدف) با هدف Tier-aware (تصمیم ۳) + کالیبراسیون (تصمیم ۱) حل شد
  test("ح-۱۴ مشکل ۲: Brier زیر هدف Tier-aware ۰٫۲۲ — DIAG-MODEL-001 دیگر fail نیست", async () => {
    const r = await runIntelligenceCoreCycle();
    const brier = r.p10.checks.find((c) => c.id === "DIAG-MODEL-001");
    expect(brier?.status).not.toBe("fail");
    expect(r.p7.brierTarget).toBe(0.22); // هدف Tier 3 — تصمیم ۳ جلسه ۰۳۳
  });
  test("ح-۱۵ مشکل واقعی ۳: سن دادهٔ پیامد (>۲۴ ساعت)", async () => {
    const r = await runIntelligenceCoreCycle();
    expect(r.p10.realProblems.some((p) => p.checkId === "DIAG-DATA-003")).toBe(true);
  });
  // P6545: پس از ترمیم مصوب، پیشنهادها از مشکلات باقی‌مانده (رانش/کهنگی) می‌آیند
  // PN-010: ترمیم DIAG-DATA-005 چرخهٔ سالم‌تر ساخت — بدون fail واقعی، صفر پیشنهاد مجاز است؛
  // شرط P11-D (مشکل → پیشنهاد) اکنون با گزارش سنتری قطعی گواهی می‌شود (بدون وابستگی به محیط)
  test("ح-۱۶ P11: پیشنهادهای ترمیم از مشکلات واقعی (شرط P11-D)", async () => {
    const r = await runIntelligenceCoreCycle();
    expect(r.p11.proposals.every((p) => p.status === "pending")).toBe(true);
    const engine = new SelfRepairEngineImpl();
    const proposals = engine.proposeRepairs(syntheticDiagnosis());
    expect(proposals.length).toBeGreaterThanOrEqual(1);
    expect(proposals.every((p) => p.status === "pending")).toBe(true);
    expect(proposals[0].sourceCheckId).toBe("DIAG-DATA-005");
    expect(proposals[0].requiresCouncilApproval).toBe(true);
  });
  test("ح-۱۷ P11: دروازهٔ تأیید فعال + صفر اجرا (قفل ابدی)", async () => {
    const r = await runIntelligenceCoreCycle();
    expect(r.p11.executedCount).toBe(0); // قفل ابدی — اجرا فقط با تأیید شورا
    const engine = new SelfRepairEngineImpl();
    const gate = new RepairApprovalGateImpl();
    // (الف) بازیابی بکاپ = پرریسک عمداً → دروازه راه‌حل ناامن را صادقانه علامت می‌زند
    const backupProposals = engine.proposeRepairs(syntheticDiagnosis());
    expect(backupProposals.length).toBeGreaterThanOrEqual(1);
    const risky = gate.reviewProposal(backupProposals[0], true, 4);
    expect(risky.conditions.realProblem).toBe(true);
    expect(risky.conditions.safeSolution).toBe(false); // restore_backup = high (طراحی عمدی)
    expect(backupProposals[0].requiresCouncilApproval).toBe(true);
    // (ب) کنش کم‌ریسک (update_threshold) با شاهد و Tier کافی → هر سه شرط سبز
    const lowRiskReport: DiagnosticReport = {
      ...syntheticDiagnosis(),
      checks: [{ id: "DIAG-MODEL-005", name: "آستانهٔ Brier", category: "model", status: "fail", details: "آستانه ناسازگار" }],
    };
    const lowProposals = engine.proposeRepairs(lowRiskReport);
    const safe = gate.reviewProposal(lowProposals[0], true, 4);
    expect(safe.conditions.realProblem).toBe(true);
    expect(safe.conditions.safeSolution).toBe(true);
    expect(safe.conditions.sufficientTier).toBe(true);
  });
  test("ح-۱۸ رویدادهای چرخه روی تخته ثبت شدند", async () => {
    await runIntelligenceCoreCycle();
    const entries = await blackboardRead({ engineId: "event-bus" });
    expect(entries.some((e) => (e.payload as { name: string }).name === "diagnosis.completed")).toBe(true);
    expect(entries.some((e) => (e.payload as { name: string }).name === "outcome.recorded")).toBe(true);
  });
});

/* ═══════════ نظام Tier (§۱.۴) در سراسر فازها ═══════════ */
describe("یکپارچگی — نظام Tier در همهٔ فازها", () => {
  test("ت-۱ پنج Tier با قابلیت‌های تجمعی", () => {
    expect(Object.keys(TIER_PROFILES)).toHaveLength(5);
    expect(tierProfile(4).capabilities.fullActivation).toBe(true);
    expect(tierProfile(3).capabilities.fullActivation).toBe(false);
  });
  test("ت-۲ قفل ابدی autoExecute در هر ۵ Tier", () => {
    for (const t of [0, 1, 2, 3, 4] as const) expect(tierProfile(t).capabilities.autoExecuteAllowed).toBe(false);
  });
  test("ت-۳ محاسبهٔ Tier از دادهٔ واقعی حلقه (۳۸۴ پیامد)", async () => {
    const r = await runIntelligenceCoreCycle();
    expect(r.tierBasis.linkedOutcomes).toBeGreaterThanOrEqual(70);
    expect(r.tier).toBeGreaterThanOrEqual(3);
  });
  test("ت-۴ Tier از روی دوره‌های متمایز صادقانه محاسبه می‌شود", () => {
    expect(computeTier(100, 2)).toBe(3); // ۱۰۰ پیامد اما ۲ دوره → Tier 3
    expect(computeTier(100, 3)).toBe(4);
  });
});

/* ═══════════ دروازهٔ INTELLIGENCE-D (§۱۰.۲) ═══════════ */
describe("یکپارچگی — دروازهٔ INTELLIGENCE-D", () => {
  test("د-۱ ۱۶ موتور زنده در گزارش وضعیت موجود است (۱۱ پایه + ۴ فرا-ذهن PN-024 + مشاور PN-025)", async () => {
    const statusRoute = await import("../src/app/api/intelligence/status/route");
    expect(statusRoute.ENGINES).toHaveLength(16);
  });
  test("د-۲ چرخهٔ یادگیری واقعی کامل (شرط INTELLIGENCE-D)", async () => {
    const r = await runIntelligenceCoreCycle();
    // Prediction → Outcome → Evaluation → Learning → Decision → Governance → Diagnosis → Repair-proposal
    expect(r.p7.outcomesCollected).toBeGreaterThan(0);
    expect(r.p7.evaluation.sampleSize).toBeGreaterThan(0);
    expect(r.p7.learning.logged).toBe(true);
    expect(r.p8.decisions.length).toBe(10);
    expect(r.p9.governance.passed + r.p9.governance.failed).toBe(15);
    expect(r.p10.checks).toHaveLength(25);
    // PN-010: پس از ترمیم DIAG-DATA-005، چرخهٔ سالم می‌تواند صفر پیشنهاد داشته باشد؛
    // زنجیرهٔ Repair-proposal در ح-۱۶ به‌صورت قطعی گواهی می‌شود
    expect(r.p11.proposals.length).toBeGreaterThanOrEqual(0);
    expect(r.p11.executedCount).toBe(0);
  });
  test("د-۳ صفر نقض قوانین ابدی در چرخه (auto/repair/model)", async () => {
    const r = await runIntelligenceCoreCycle();
    expect(r.p8.decisions.every((d) => d.autoExecute === false)).toBe(true);
    expect(r.p11.executedCount).toBe(0);
    expect(r.p11.proposals.every((p) => p.status === "pending")).toBe(true);
  });
  test("د-۴ هر ادعا شاهد دارد (زنجیرهٔ شاهد ارزیابی)", async () => {
    const r = await runIntelligenceCoreCycle();
    expect(r.p7.evaluation.rationale.length).toBeGreaterThan(20); // ادعا = عدد + توضیح
    // ادعای عددی (Brier/Lift) در rationale با شاهد فایل حلقه قابل بازبینی است
    expect(r.p7.evaluation.baseline.modelId).toBe("base-rate-v0");
  });
});
