/**
 * PHASE 9 (سند ۰۲۷ §۴.۴) — تست‌های ارزیابی سیاست + حاکمیت (≥ ۵۰ تست)
 * بخش ۱ Policy Evaluation (۲۰) · بخش ۲ Governance (۲۵) · بخش ۳ یکپارچگی (۵)
 */
import { describe, expect, test } from "bun:test";
import {
  GOVERNANCE_RULES,
  GovernanceEngineImpl,
  PolicyEvaluationEngineImpl,
  emptyGovernanceContext,
  type PolicySignal,
} from "../src/core/intelligence/p9-core";
import type { GovernanceContext } from "../src/core/intelligence/p9-core";

const signal = (over: Partial<PolicySignal> = {}): PolicySignal => ({
  policyId: "lp-m1-v1",
  policyType: "learning",
  outcomeSignals: ["positive", "positive", "positive", "neutral"],
  timeline: [
    { at: "2026-09-01", effectiveness: 0.7 },
    { at: "2026-09-15", effectiveness: 0.75 },
  ],
  audits: [
    { at: "2026-09-01", compliant: true },
    { at: "2026-09-15", compliant: true },
  ],
  costHours: 3,
  ...over,
});

const gctx = (over: Partial<GovernanceContext> = {}): GovernanceContext => ({ ...emptyGovernanceContext(), ...over });

/* ═══════════ بخش ۱ — Policy Evaluation (۲۰) ═══════════ */
describe("P9/بخش ۱ — Policy Evaluation Engine", () => {
  const pe = () => new PolicyEvaluationEngineImpl();

  test("۱-۱ اثربخشی: مثبت خالص", () => { expect(pe().computeEffectiveness(signal({ outcomeSignals: ["positive", "positive"] }))).toBe(1); });
  test("۱-۲ اثربخشی: منفی خالص", () => { expect(pe().computeEffectiveness(signal({ outcomeSignals: ["negative", "negative"] }))).toBe(-1); });
  test("۱-۳ اثربخشی: ترکیبی (۳ مثبت ۱ منفی از ۵)", () => {
    expect(pe().computeEffectiveness(signal({ outcomeSignals: ["positive", "positive", "positive", "negative", "neutral"] }))).toBe(0.4);
  });
  test("۱-۴ اثربخشی: بدون رویداد = صفر", () => { expect(pe().computeEffectiveness(signal({ outcomeSignals: [] }))).toBe(0); });
  test("۱-۵ پایداری: بدون نوسان = ۱", () => { expect(pe().computeStability(signal({ timeline: [{ at: "t", effectiveness: 0.5 }] }))).toBe(1); });
  test("۱-۶ پایداری: نوسان زیاد کمتر از ۱", () => {
    expect(pe().computeStability(signal({ timeline: [{ at: "t1", effectiveness: 0 }, { at: "t2", effectiveness: 1 }] }))).toBeLessThan(1);
  });
  test("۱-۷ پایداری: نوسان صفر = ۱", () => {
    expect(pe().computeStability(signal({ timeline: [{ at: "t1", effectiveness: 0.6 }, { at: "t2", effectiveness: 0.6 }] }))).toBe(1);
  });
  test("۱-۸ پایبندی: همهٔ بازرسی‌ها سازگار", () => { expect(pe().computeCompliance(signal({ audits: [{ at: "t", compliant: true }, { at: "t2", compliant: true }] }))).toBe(1); });
  test("۱-۹ پایبندی: نیمی سازگار", () => { expect(pe().computeCompliance(signal({ audits: [{ at: "t", compliant: true }, { at: "t2", compliant: false }] }))).toBe(0.5); });
  test("۱-۱۰ پایبندی: بدون بازرسی = صفر", () => { expect(pe().computeCompliance(signal({ audits: [] }))).toBe(0); });
  test("۱-۱۱ حکم keep: اثربخشی ≥۰٫۷ ∧ پایبندی ≥۰٫۹", () => { expect(pe().recommendVerdict(0.8, 0.95)).toBe("keep"); });
  test("۱-۱۲ حکم keep مرز دقیق (۰٫۷ و ۰٫۹)", () => { expect(pe().recommendVerdict(0.7, 0.9)).toBe("keep"); });
  test("۱-۱۳ حکم adjust: اثربخشی <۰٫۵", () => { expect(pe().recommendVerdict(0.4, 0.95)).toBe("adjust"); });
  test("۱-۱۴ حکم adjust: پایبندی <۰٫۷", () => { expect(pe().recommendVerdict(0.8, 0.6)).toBe("adjust"); });
  test("۱-۱۵ حکم retire: اثربخشی <۰٫۳", () => { expect(pe().recommendVerdict(0.2, 0.95)).toBe("retire"); });
  test("۱-۱۶ حکم retire بر adjust مقدم است", () => { expect(pe().recommendVerdict(0.2, 0.5)).toBe("retire"); });
  test("۱-۱۷ ناحیهٔ خاکستری: ۰٫۵-۰٫۷ با پایبندی خوب → adjust", () => { expect(pe().recommendVerdict(0.6, 0.95)).toBe("adjust"); });
  test("۱-۱۸ evaluatePolicy: گزارش کامل با rationale فارسی", () => {
    const r = pe().evaluatePolicy(signal(), { from: "2026-09-01", to: "2026-09-30" }, 3);
    expect(r.policyId).toBe("lp-m1-v1");
    expect(r.rationale.length).toBeGreaterThan(15);
    expect(r.metrics.costImpact).toBe(3);
    expect(r.tier).toBe(3);
  });
  test("۱-۱۹ evaluatePolicy با حکم adjust: پیشنهاد تغییر دارد", () => {
    const r = pe().evaluatePolicy(signal({ outcomeSignals: ["positive", "neutral"], audits: [{ at: "t", compliant: false }] }), { from: "", to: "" }, 3);
    expect(r.verdict).toBe("adjust");
    expect(r.recommendedChanges?.length).toBeGreaterThanOrEqual(1);
  });
  test("۱-۲۰ evaluatePolicy: زنجیرهٔ شاهد", () => {
    expect(pe().evaluatePolicy(signal(), { from: "", to: "" }, 2).evidenceChain.length).toBeGreaterThanOrEqual(1);
  });
});

/* ═══════════ بخش ۲ — Governance (۲۵) ═══════════ */
describe("P9/بخش ۲ — Governance Engine (۱۵ قاعده)", () => {
  const ge = () => new GovernanceEngineImpl();

  test("۲-۱ دقیقاً ۱۵ قاعده", () => { expect(GOVERNANCE_RULES).toHaveLength(15); });
  test("۲-۲ پنج قاعدهٔ داده", () => { expect(GOVERNANCE_RULES.filter((r) => r.scope === "data")).toHaveLength(5); });
  test("۲-۳ سه قاعدهٔ مدل", () => { expect(GOVERNANCE_RULES.filter((r) => r.scope === "model")).toHaveLength(3); });
  test("۲-۴ چهار قاعدهٔ دسترسی", () => { expect(GOVERNANCE_RULES.filter((r) => r.scope === "access")).toHaveLength(4); });
  test("۲-۵ دو قاعدهٔ تصمیم", () => { expect(GOVERNANCE_RULES.filter((r) => r.scope === "decision")).toHaveLength(2); });
  test("۲-۶ یک قاعدهٔ ترمیم", () => { expect(GOVERNANCE_RULES.filter((r) => r.scope === "repair")).toHaveLength(1); });
  test("۲-۷ GOV-DATA-001: دسترسی بدون audit → نقض", () => {
    expect(ge().checkRule(GOVERNANCE_RULES[0], gctx({ personalDataAccessWithoutAudit: 2 })).passed).toBe(false);
  });
  test("۲-۸ GOV-DATA-002: حذف بدون شاهد بکاپ → نقض", () => {
    expect(ge().checkRule(GOVERNANCE_RULES[1], gctx({ deletionsWithoutBackupWitness: 1 })).passed).toBe(false);
  });
  test("۲-۹ GOV-DATA-003: تغییر در Raw → نقض", () => {
    expect(ge().checkRule(GOVERNANCE_RULES[2], gctx({ rawLayerMutations: 1 })).passed).toBe(false);
  });
  test("۲-۱۰ GOV-DATA-004: بازیابی ثبت‌نشده → نقض", () => {
    expect(ge().checkRule(GOVERNANCE_RULES[3], gctx({ backupRestoresTotal: 2, backupRestoresLogged: 1 })).passed).toBe(false);
  });
  test("۲-۱۱ GOV-DATA-004: بدون بازیابی → پاس", () => {
    expect(ge().checkRule(GOVERNANCE_RULES[3], gctx()).passed).toBe(true);
  });
  test("۲-۱۲ GOV-DATA-005: ConsultantScope fail-open → نقض", () => {
    expect(ge().checkRule(GOVERNANCE_RULES[4], gctx({ consultantScopeFailOpen: 1 })).passed).toBe(false);
  });
  test("۲-۱۳ GOV-MODEL-001: تغییر مدل بدون شورا → نقض", () => {
    expect(ge().checkRule(GOVERNANCE_RULES[5], gctx({ modelChangesWithoutCouncil: 1 })).passed).toBe(false);
  });
  test("۲-۱۴ GOV-MODEL-002: تغییر بدون rollback → نقض", () => {
    expect(ge().checkRule(GOVERNANCE_RULES[6], gctx({ modelChangesWithoutRollback: 1 })).passed).toBe(false);
  });
  test("۲-۱۵ GOV-MODEL-003: کمتر از ۲ نسخه → نقض", () => {
    expect(ge().checkRule(GOVERNANCE_RULES[7], gctx({ modelVersionsKept: 1 })).passed).toBe(false);
  });
  test("۲-۱۶ GOV-ACCESS-001: نشست ۳۰+ روزه → نقض", () => {
    expect(ge().checkRule(GOVERNANCE_RULES[8], gctx({ sessionsOlderThan30d: 3 })).passed).toBe(false);
  });
  test("۲-۱۷ GOV-ACCESS-002: ورود ثبت‌نشده → نقض", () => {
    expect(ge().checkRule(GOVERNANCE_RULES[9], gctx({ loginsNotAudited: 1 })).passed).toBe(false);
  });
  test("۲-۱۸ GOV-ACCESS-003: bypass مالک → نقض", () => {
    expect(ge().checkRule(GOVERNANCE_RULES[10], gctx({ ownerGateBypasses: 1 })).passed).toBe(false);
  });
  test("۲-۱۹ GOV-ACCESS-004: اشتراک توکن → نقض", () => {
    expect(ge().checkRule(GOVERNANCE_RULES[11], gctx({ tokenSharingIncidents: 1 })).passed).toBe(false);
  });
  test("۲-۲۰ GOV-DECISION-001: نقض auto_execute → نقض", () => {
    expect(ge().checkRule(GOVERNANCE_RULES[12], gctx({ autoExecuteViolations: 1 })).passed).toBe(false);
  });
  test("۲-۲۱ GOV-DECISION-002: تصمیم کمتر از ۹۰ روز → نقض", () => {
    expect(ge().checkRule(GOVERNANCE_RULES[13], gctx({ decisionsTotal: 10, decisionsKept90d: 8 })).passed).toBe(false);
  });
  test("۲-۲۲ GOV-REPAIR-001: ترمیم بدون شورا → نقض", () => {
    expect(ge().checkRule(GOVERNANCE_RULES[14], gctx({ repairsWithoutCouncilApproval: 1 })).passed).toBe(false);
  });
  test("۲-۲۳ checkAll با زمینهٔ پاک: ۱۵/۱۵ پاس", () => {
    const r = ge().checkAll(gctx());
    expect(r.passed).toBe(15);
    expect(r.failed).toBe(0);
  });
  test("۲-۲۴ checkAll با یک نقض بحرانی: در criticalViolations", () => {
    const r = ge().checkAll(gctx({ modelChangesWithoutCouncil: 1 }));
    expect(r.failed).toBe(1);
    expect(r.criticalViolations).toContain("GOV-MODEL-001");
  });
  test("۲-۲۵ enforce در حالت strict با نقض بحرانی: مسدود", () => {
    const r = ge().enforce(gctx({ autoExecuteViolations: 1 }));
    expect(r.blocked).toBe(true);
    expect(r.enforced).toBe(true);
  });
  test("۲-۲۶ enforce بدون نقض: مسدود نیست", () => {
    expect(ge().enforce(gctx()).blocked).toBe(false);
  });
  test("۲-۲۷ audit حاکمیت ثبت می‌شود", () => {
    const r = ge().audit("policy-review");
    expect(r.logged).toBe(true);
    expect(r.action).toBe("policy-review");
  });
});

/* ═══════════ بخش ۳ — یکپارچگی (۵) ═══════════ */
describe("P9/بخش ۳ — یکپارچگی ارزیابی ۵ سیاست واقعی", () => {
  test("۳-۱ پنج سیاست با پنج حکم متفاوت", () => {
    const pe = new PolicyEvaluationEngineImpl();
    const verdicts = [
      pe.evaluatePolicy(signal({ policyId: "lp-m1-v1", outcomeSignals: ["positive", "positive", "positive", "positive"] }), { from: "", to: "" }, 3).verdict, // keep
      pe.evaluatePolicy(signal({ policyId: "lp-m1-v0", outcomeSignals: ["negative", "negative", "negative"] }), { from: "", to: "" }, 3).verdict, // retire
      pe.evaluatePolicy(signal({ policyId: "gov-access", policyType: "governance", outcomeSignals: ["positive", "neutral"] }), { from: "", to: "" }, 3).verdict, // adjust
    ];
    expect(verdicts).toContain("keep");
    expect(verdicts).toContain("retire");
    expect(verdicts).toContain("adjust");
  });
  test("۳-۲ هر ارزیابی حکم + دلیل دارد", () => {
    const pe = new PolicyEvaluationEngineImpl();
    for (const pid of ["a", "b", "c", "d", "e"]) {
      const r = pe.evaluatePolicy(signal({ policyId: pid }), { from: "", to: "" }, 3);
      expect(["keep", "adjust", "retire"]).toContain(r.verdict);
      expect(r.rationale.length).toBeGreaterThan(10);
    }
  });
  test("۳-۳ حاکمیت + ارزیابی هم‌زمان: گزارش یکپارچه", () => {
    const ge = new GovernanceEngineImpl();
    const pe = new PolicyEvaluationEngineImpl();
    const gov = ge.checkAll(gctx());
    const pol = pe.evaluatePolicy(signal(), { from: "", to: "" }, 4);
    expect(gov.passed).toBe(15);
    expect(pol.verdict).toBeDefined();
  });
  test("۳-۴ سیاست حاکمیت خودش هم ارزیابی‌پذیر است", () => {
    const pe = new PolicyEvaluationEngineImpl();
    const r = pe.evaluatePolicy(signal({ policyId: "governance-core-v1", policyType: "governance" }), { from: "", to: "" }, 3);
    expect(r.policyType).toBe("governance");
  });
  test("۳-۵ سیاست Tier هم ارزیابی‌پذیر است", () => {
    const pe = new PolicyEvaluationEngineImpl();
    const r = pe.evaluatePolicy(signal({ policyId: "tier-policy-025", policyType: "tier" }), { from: "", to: "" }, 3);
    expect(r.policyType).toBe("tier");
  });
});
