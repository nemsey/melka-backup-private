/**
 * PHASE 11 (سند ۰۲۷ §۶.۴) — تست‌های خودترمیمی کنترل‌شده (≥ ۵۰ تست)
 * بخش ۱ Proposal (۱۵) · بخش ۲ Approval (۱۵) · بخش ۳ Execution (۲۰)
 */
import { describe, expect, test } from "bun:test";
import {
  RepairApprovalGateImpl,
  RepairExecutorImpl,
  SelfRepairEngineImpl,
  repairActionFor,
} from "../src/core/intelligence/p11-core";
import { SelfDiagnosisEngineImpl, healthySnapshot, type SystemSnapshot } from "../src/core/intelligence/p10-core";
import type { DiagnosticReport, RepairProposal } from "../src/core/intelligence/contracts-p7-p11";

const snap = (over: Partial<SystemSnapshot> = {}): SystemSnapshot => ({ ...healthySnapshot(), ...over });
const diag = (over: Partial<SystemSnapshot> = {}): DiagnosticReport => new SelfDiagnosisEngineImpl().runFullDiagnosis(snap(over));

/* پیشنهاد واقعی از مشکل واقعی کالیبراسیون (شاهد loop-latest.json) */
const realDiagnosis = () => diag({ brierScore: 0.2255, worstCalibrationGap: 0.508, dataAgeHours: 30 });
const firstProposal = (): RepairProposal => new SelfRepairEngineImpl().proposeRepairs(realDiagnosis(), {}, 4)[0];

/* ═══════════ بخش ۱ — Proposal (۱۵) ═══════════ */
describe("P11/بخش ۱ — Self-Repair Engine (پیشنهاد)", () => {
  test("۱-۱ هر fail در P10 → یک پیشنهاد", () => {
    const proposals = new SelfRepairEngineImpl().proposeRepairs(realDiagnosis(), {}, 4);
    expect(proposals.length).toBeGreaterThanOrEqual(1);
  });
  test("۱-۲ پیشنهاد به بررسی مبدأ متصل است (sourceCheckId)", () => {
    expect(firstProposal().sourceCheckId).toMatch(/^DIAG-/);
  });
  test("۱-۳ قفل نوعی: requiresCouncilApproval=true", () => {
    expect(firstProposal().requiresCouncilApproval).toBe(true);
  });
  test("۱-۴ وضعیت اولیه: pending", () => {
    expect(firstProposal().status).toBe("pending");
  });
  test("۱-۵ هر پیشنهاد دلیل فارسی دارد", () => {
    expect(firstProposal().rationale.length).toBeGreaterThan(15);
  });
  test("۱-۶ هر پیشنهاد طرح بازگشت دارد", () => {
    expect(firstProposal().rollbackPlan.length).toBeGreaterThan(10);
  });
  test("۱-۷ هر پیشنهاد زنجیرهٔ شاهد از P10 دارد", () => {
    expect(firstProposal().evidenceChain.some((e) => e.reference.startsWith("diagnosis:"))).toBe(true);
  });
  test("۱-۸ اولویت: critical > high > medium", () => {
    const d = diag({ llmCallsInProduction: 1, worstCalibrationGap: 0.508 });
    const proposals = new SelfRepairEngineImpl().proposeRepairs(d, {}, 4);
    expect(proposals[0].severity).toBe("critical");
  });
  test("۱-۹ warn بدون تکرار → بدون پیشنهاد", () => {
    const d = diag({ brierScore: 0.2255 });
    const proposals = new SelfRepairEngineImpl().proposeRepairs(d, {}, 4);
    expect(proposals.length).toBe(0);
  });
  test("۱-۱۰ warn سه‌بار متوالی → پیشنهاد medium", () => {
    const d = diag({ brierScore: 0.2255 });
    const proposals = new SelfRepairEngineImpl().proposeRepairs(d, { "DIAG-MODEL-001": 3 }, 4);
    expect(proposals.length).toBe(1);
    expect(proposals[0].severity).toBe("medium");
  });
  test("۱-۱۱ هفت نوع action نگاشت درست", () => {
    expect(repairActionFor("DIAG-MODEL-002").type).toBe("recalibrate");
    expect(repairActionFor("DIAG-MODEL-001").type).toBe("retrain");
    expect(repairActionFor("DIAG-DATA-001").type).toBe("reindex");
    expect(repairActionFor("DIAG-GOV-001").type).toBe("prune_sessions");
    expect(repairActionFor("DIAG-DATA-005").type).toBe("restore_backup");
    expect(repairActionFor("DIAG-MODEL-005").type).toBe("update_threshold");
    expect(repairActionFor("DIAG-DATA-002").type).toBe("custom");
  });
  test("۱-۱۲ assessRisk: هر ۷ نوع ریسک دارند", () => {
    const e = new SelfRepairEngineImpl();
    for (const t of ["reindex", "recalibrate", "retrain", "prune_sessions", "restore_backup", "update_threshold", "custom"] as const) {
      expect(e.assessRisk(t).level).toBeDefined();
    }
  });
  test("۱-۱۳ restore_backup پرریسک‌ترین است", () => {
    expect(new SelfRepairEngineImpl().assessRisk("restore_backup").level).toBe("high");
  });
  test("۱-۱۴ reindex کم‌ریسک", () => {
    expect(new SelfRepairEngineImpl().assessRisk("reindex").level).toBe("low");
  });
  test("۱-۱۵ estimateImpact: زمان بازبینی برآورد می‌شود", () => {
    const e = new SelfRepairEngineImpl();
    const imp = e.estimateImpact({ type: "recalibrate", parameters: {}, estimatedDurationMinutes: 15 });
    expect(imp.minutesToVerify).toBe(25);
    expect(imp.expectedCheckPass).toBe(true);
  });
  test("۱-۱۶ retrain نیازمند Tier 3+", () => {
    const d = diag({ driftMagnitude: 0.15 });
    const proposals = new SelfRepairEngineImpl().proposeRepairs(d, {}, 4);
    expect(proposals[0].requiredTier).toBe(3);
  });
});

/* ═══════════ بخش ۲ — Approval (۱۵) ═══════════ */
describe("P11/بخش ۲ — Repair Approval Gate (دروازهٔ شورا)", () => {
  const gate = () => new RepairApprovalGateImpl();

  test("۲-۱ سه شرط بررسی می‌شوند", () => {
    const r = gate().reviewProposal(firstProposal(), true, 4);
    expect(r.conditions).toHaveProperty("realProblem");
    expect(r.conditions).toHaveProperty("safeSolution");
    expect(r.conditions).toHaveProperty("sufficientTier");
  });
  test("۲-۲ هر سه شرط برقرار → تأییدپذیر", () => {
    const r = gate().reviewProposal(firstProposal(), true, 4);
    expect(r.summary).toContain("برقرار");
  });
  test("۲-۳ شرط ۱: بدون شاهد P10 → رد", () => {
    const r = gate().reviewProposal(firstProposal(), false, 4);
    expect(r.conditions.realProblem).toBe(false);
    expect(r.summary).toContain("شاهد");
  });
  test("۲-۴ شرط ۲: راه‌حل پرریسک → رد", () => {
    const risky = { ...firstProposal(), riskAssessment: { level: "high" as const, probability: 0.5, impact: 0.9, mitigation: "—" } };
    const r = gate().reviewProposal(risky, true, 4);
    expect(r.conditions.safeSolution).toBe(false);
  });
  test("۲-۵ شرط ۳: Tier ناکافی → رد", () => {
    const r = gate().reviewProposal(firstProposal(), true, 1);
    expect(r.conditions.sufficientTier).toBe(false);
  });
  test("۲-۶ submitProposal: نتیجهٔ ساختاریافته", () => {
    const r = gate().submitProposal(firstProposal(), true, 4);
    expect(r.approved).toBe(true);
    expect(r.conditionsChecked.realProblem).toBe(true);
  });
  test("۲-۷ approve با مجوز کامل: موفق", () => {
    const r = gate().approve(firstProposal(), "شورا", true, 4);
    expect(r.approved).toBe(true);
    expect(r.by).toBe("شورا");
  });
  test("۲-۸ approve بدون شرط: خطا (قفل ۲)", () => {
    expect(() => gate().approve(firstProposal(), "شورا", false, 4)).toThrow();
  });
  test("۲-۹ approve با Tier کم: خطا", () => {
    expect(() => gate().approve(firstProposal(), "شورا", true, 1)).toThrow();
  });
  test("۲-۱۰ reject با دلیل: ثبت می‌شود", () => {
    const g = gate();
    const r = g.reject("rep-1", "راه‌حل گران‌تر از مشکل است");
    expect(r.rejected).toBe(true);
  });
  test("۲-۱۱ تصمیم ثبت و بازخوانی می‌شود", () => {
    const g = gate();
    g.approve(firstProposal(), "شورا", true, 4);
    expect(g.decisionOf(firstProposal().id)?.approved).toBe(true);
  });
  test("۲-۱۲ رد هم ثبت می‌شود", () => {
    const g = gate();
    g.reject("rep-2", "دلیل");
    expect(g.decisionOf("rep-2")?.approved).toBe(false);
  });
  test("۲-۱۳ پیشنهاد recalibrate در Tier 3 مجاز", () => {
    const g = gate();
    const p = firstProposal(); // recalibrate، requiredTier=3
    expect(g.reviewProposal(p, true, 3).conditions.sufficientTier).toBe(true);
  });
  test("۲-۱۴ پیشنهاد restore_backup پرریسک حتی با Tier 4 → safeSolution=false", () => {
    const d = diag({ backupFilesPresent: 0 });
    const proposals = new SelfRepairEngineImpl().proposeRepairs(d, {}, 4);
    const restore = proposals.find((p) => p.proposedAction.type === "restore_backup");
    expect(restore).toBeDefined();
    expect(gate().reviewProposal(restore!, true, 4).conditions.safeSolution).toBe(false);
  });
  test("۲-۱۵ خلاصهٔ بازبینی فارسی است", () => {
    expect(gate().reviewProposal(firstProposal(), true, 4).summary).toContain("شرط");
  });
});

/* ═══════════ بخش ۳ — Execution (۲۰) ═══════════ */
describe("P11/بخش ۳ — Repair Executor (اجرا)", () => {
  const exec = () => new RepairExecutorImpl(new RepairApprovalGateImpl());
  const ok = (over: Record<string, unknown> = {}) => ({
    councilApproved: true,
    approvedBy: "شورا",
    diagnosisWitness: true,
    currentTier: 4 as const,
    outcomePositive: true,
    ...over,
  });

  test("۳-۱ اجرای مجاز: موفق", () => {
    const r = exec().execute(firstProposal(), ok());
    expect(r.executed).toBe(true);
    expect(r.rolledBack).toBeUndefined();
  });
  test("۳-۲ بدون تأیید شورا: مسدود (قفل ابدی)", () => {
    const r = exec().execute(firstProposal(), ok({ councilApproved: false }));
    expect(r.executed).toBe(false);
    expect(r.reason).toContain("شورا");
  });
  test("۳-۳ سقف نرخ: دومین ترمیم در ۲۴ ساعت مسدود", () => {
    const e = exec();
    e.execute(firstProposal(), ok());
    const r = e.execute(firstProposal(), ok());
    expect(r.executed).toBe(false);
    expect(r.reason).toContain("۲۴ ساعت");
  });
  test("۳-۴ بکاپ خودکار پیش از اجرا", () => {
    const e = exec();
    e.execute(firstProposal(), ok());
    expect(e.events.backups).toHaveLength(1);
    expect(e.events.backups[0].file).toContain("pre-repair-");
  });
  test("۳-۵ بکاپ دارای md5 است", () => {
    const e = exec();
    e.execute(firstProposal(), ok());
    expect(e.events.backups[0].md5).toContain("md5-");
  });
  test("۳-۶ نتیجهٔ منفی → rollback خودکار", () => {
    const r = exec().execute(firstProposal(), ok({ outcomePositive: false }));
    expect(r.rolledBack).toBe(true);
    expect(r.reason).toContain("rollback خودکار");
  });
  test("۳-۷ رویدادهای حسابرسی ترمیم کامل‌اند", () => {
    const e = exec();
    e.execute(firstProposal(), ok());
    const kinds = e.auditTrail().map((l) => l.action);
    expect(kinds).toContain("started");
    expect(kinds).toContain("completed");
  });
  test("۳-۸ هر رویداد حسابرسی before/after دارد", () => {
    const e = exec();
    e.execute(firstProposal(), ok());
    for (const log of e.auditTrail()) {
      expect(log.beforeState.length).toBeGreaterThan(0);
      expect(log.afterState.length).toBeGreaterThan(0);
    }
  });
  test("۳-۹ مسدودسازی بدون شورا هم در حسابرسی ثبت می‌شود", () => {
    const e = exec();
    e.execute(firstProposal(), ok({ councilApproved: false }));
    expect(e.auditTrail().some((l) => l.action === "rejected")).toBe(true);
  });
  test("۳-۱۰ rollback خودکار در حسابرسی: rolled_back", () => {
    const e = exec();
    e.execute(firstProposal(), ok({ outcomePositive: false }));
    expect(e.auditTrail().some((l) => l.action === "rolled_back")).toBe(true);
  });
  test("۳-۱۱ مجری با شاهد false حتی با تأیید شورا اجرا نمی‌کند", () => {
    const r = exec().execute(firstProposal(), ok({ diagnosisWitness: false }));
    expect(r.executed).toBe(false);
  });
  test("۳-۱۲ مجری با Tier ناکافی اجرا نمی‌کند", () => {
    const r = exec().execute(firstProposal(), ok({ currentTier: 1 }));
    expect(r.executed).toBe(false);
  });
  test("۳-۱۳ اجرا با راه‌حل پرریسک مسدود می‌شود", () => {
    const d = diag({ backupFilesPresent: 0 });
    const p = new SelfRepairEngineImpl().proposeRepairs(d, {}, 4).find((x) => x.proposedAction.type === "restore_backup")!;
    const r = exec().execute(p, ok());
    expect(r.executed).toBe(false);
    expect(r.reason).toContain("پرریسک");
  });
  test("۳-۱۴ rollback صریح با نقطهٔ بازگشت", () => {
    const e = exec();
    e.execute(firstProposal(), ok());
    const r = e.rollback(firstProposal(), "شورا");
    expect(r.rolledBack).toBe(true);
    expect(r.from).toContain("pre-repair-");
  });
  test("۳-۱۵ verifyOutcome از گزارش پس از ترمیم", () => {
    const e = exec();
    // PN-005: رفع نژاع زمانی — شناسهٔ پیشنهاد شامل Date.now() است؛
    // دو فراخوانی جداگانهٔ firstProposal() در میلی‌ثانیه‌های مختلف
    // شناسه‌های متفاوت می‌سازند و تست به‌صورت شانسی می‌شکست.
    // شیء واحد در هر دو مرحله (اجرا + بازبینی) استفاده می‌شود.
    const p = firstProposal();
    e.execute(p, ok());
    const post = diag(); // پس از ترمیم سالم
    const r = e.verifyOutcome(p.id, post);
    expect(r.verified).toBe(true);
  });
  test("۳-۱۶ شناسهٔ حسابرسی در هر نتیجه هست", () => {
    const r = exec().execute(firstProposal(), ok());
    expect(r.auditId).toMatch(/^ra-/);
  });
  test("۳-۱۷ زمان اجرا برای ترمیم retrain بیشتر است", () => {
    const d = diag({ driftMagnitude: 0.15 });
    const p = new SelfRepairEngineImpl().proposeRepairs(d, {}, 4)[0];
    expect(p.proposedAction.estimatedDurationMinutes).toBe(60);
  });
  test("۳-۱۸ اجرای دوم پس از ۲۴ ساعت مجاز", () => {
    const e = new RepairExecutorImpl(new RepairApprovalGateImpl());
    e.execute(firstProposal(), ok());
    // شبیه‌سازی گذشت ۲۵ ساعت
    (e as unknown as { lastExecutionAt: Date | null }).lastExecutionAt = new Date(Date.now() - 25 * 3600000);
    const r = e.execute(firstProposal(), ok());
    expect(r.executed).toBe(true);
  });
  test("۳-۱۹ صفر auto-execute: پیشنهاد pending می‌ماند تا تصمیم شورا", () => {
    const p = firstProposal();
    expect(p.status).toBe("pending");
    expect(p.requiresCouncilApproval).toBe(true);
  });
  test("۳-۲۰ مسیر کامل: P10 مشکل → P11 پیشنهاد → دروازه → اجرا → بازبینی", () => {
    const d = realDiagnosis();
    const se = new SelfRepairEngineImpl();
    const proposals = se.proposeRepairs(d, {}, 4);
    const gate = new RepairApprovalGateImpl();
    const p = proposals.find((x) => x.sourceCheckId === "DIAG-MODEL-002")!;
    const approval = gate.submitProposal(p, true, 4);
    const executor = new RepairExecutorImpl(gate);
    const result = executor.execute(p, ok({ councilApproved: approval.approved }));
    const post = diag(); // مدل بازکالیبره‌شده سالم است
    const verify = executor.verifyOutcome(p.id, post);
    expect(approval.approved).toBe(true);
    expect(result.executed).toBe(true);
    expect(verify.verified).toBe(true);
  });
});
