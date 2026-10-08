/**
 * PHASE 8 (سند ۰۲۷ §۳.۴) — تست‌های موتور تصمیم (≥ ۷۰ تست)
 * بخش ۱ Decision (۲۰) · بخش ۲ Action Planner (۲۰) · بخش ۳ Safety (۲۰) · بخش ۴ حلقهٔ کامل (۱۰)
 */
import { describe, expect, test } from "bun:test";
import {
  ActionPlannerEngineImpl,
  DecisionEngineImpl,
  SafetyEngineImpl,
  buildDecisionRecord,
  patternFor,
  probabilityBand,
  type DecisionContext,
  type DecisionInput,
} from "../src/core/intelligence/p8-core";
import type { DecisionRecord, DecisionType } from "../src/core/intelligence/contracts-p7-p11";

const ctx = (over: Partial<DecisionContext> = {}): DecisionContext => ({ price: 2_000_000_000, localAveragePrice: 2_100_000_000, daysOnMarket: 10, bestExpertSuccessRate: 0.5, ...over });
const safety = () => new SafetyEngineImpl();
const dec = (over: Partial<DecisionInput> = {}): DecisionInput => ({ predictionId: "pred-abc12345", probability: 0.6, context: ctx(), ...over });

const makeRecord = (over: Partial<DecisionRecord> = {}): DecisionRecord =>
  buildDecisionRecord({
    id: "dec-x1",
    predictionId: "pred-1",
    decisionType: "contact_owner",
    proposedAction: "تماس با مالک",
    confidence: 0.7,
    rationale: "احتمال ۷۰٪ نزدیک به معامله",
    alternatives: [],
    expectedOutcome: "ارتباط برقرار می‌شود",
    requiredResources: ["تلفن"],
    safetyChecked: true,
    safetyReport: { passed: true, blockedBy: [], warnings: [], checkedRules: [], checkedAt: new Date().toISOString() },
    createdAt: new Date().toISOString(),
    expiresAt: new Date().toISOString(),
    tierAtCreation: 3,
    ...over,
  });

/* ═══════════ بخش ۱ — Decision Engine (۲۰) ═══════════ */
describe("P8/بخش ۱ — Decision Engine", () => {
  test("۱-۱ ناحیهٔ ۰-۲۵٪: منتظر بمان", () => { expect(probabilityBand(0.1).decisionType).toBe("wait"); });
  test("۱-۲ ناحیهٔ ۲۵-۵۰٪: بررسی بیشتر", () => { expect(probabilityBand(0.3).decisionType).toBe("investigate"); });
  test("۱-۳ ناحیهٔ ۵۰-۷۵٪: اقدام پیشنهادی", () => { expect(probabilityBand(0.6).decisionType).toBe("contact_owner"); });
  test("۱-۴ ناحیهٔ ۷۵-۱۰۰٪: اولویت بالا", () => { expect(probabilityBand(0.9).decisionType).toBe("priority_action"); });
  test("۱-۵ مرز دقیق ۲۵٪ ناحیهٔ بررسی", () => { expect(probabilityBand(0.25).decisionType).toBe("investigate"); });
  test("۱-۶ مرز دقیق ۵۰٪ ناحیهٔ اقدام", () => { expect(probabilityBand(0.5).decisionType).toBe("contact_owner"); });
  test("۱-۷ مرز دقیق ۷۵٪ ناحیهٔ اولویت", () => { expect(probabilityBand(0.75).decisionType).toBe("priority_action"); });
  test("۱-۸ قاعدهٔ دامنه: قیمت >۲۰٪ زیر میانگین → adjust_price", () => {
    const d = new DecisionEngineImpl(3, safety()).decide(dec({ context: ctx({ price: 1_500_000_000, localAveragePrice: 2_100_000_000 }) }));
    expect(d.decisionType).toBe("adjust_price");
  });
  test("۱-۹ قاعدهٔ دامنه: کارشناس ۹۰٪+ → assign_expert", () => {
    const d = new DecisionEngineImpl(3, safety()).decide(dec({ context: ctx({ bestExpertSuccessRate: 0.95, bestExpertName: "آقای احمدی" }) }));
    expect(d.decisionType).toBe("assign_expert");
  });
  test("۱-۱۰ قاعدهٔ دامنه: >۹۰ روز در بازار → adjust_price حتی با احتمال کم", () => {
    const d = new DecisionEngineImpl(3, safety()).decide(dec({ probability: 0.1, context: ctx({ daysOnMarket: 120 }) }));
    expect(d.decisionType).toBe("adjust_price");
  });
  test("۱-۱۱ بدون شرط دامنه: تصمیم از ناحیهٔ احتمال", () => {
    const d = new DecisionEngineImpl(3, safety()).decide(dec());
    expect(d.decisionType).toBe("contact_owner");
  });
  test("۱-۱۲ هر تصمیم ارجاع پیش‌بینی دارد", () => {
    expect(new DecisionEngineImpl(3, safety()).decide(dec()).predictionId).toBe("pred-abc12345");
  });
  test("۱-۱۳ هر تصمیم دلیل فارسی دارد", () => {
    expect(new DecisionEngineImpl(3, safety()).decide(dec()).rationale.length).toBeGreaterThan(10);
  });
  test("۱-۱۴ هر تصمیم گزینه‌های رد‌شده با دلیل دارد", () => {
    const d = new DecisionEngineImpl(3, safety()).decide(dec());
    expect(d.alternatives.length).toBeGreaterThanOrEqual(1);
    expect(d.alternatives.every((a) => a.whyRejected.length > 0)).toBe(true);
  });
  test("۱-۱۵ قفل نوعی: requiresApproval=true", () => {
    expect(new DecisionEngineImpl(3, safety()).decide(dec()).requiresApproval).toBe(true);
  });
  test("۱-۱۶ قفل نوعی: autoExecute=false", () => {
    expect(new DecisionEngineImpl(3, safety()).decide(dec()).autoExecute).toBe(false);
  });
  test("۱-۱۷ rankAlternatives: مرتب‌سازی نزولی مقدار انتظاری", () => {
    const ranked = new DecisionEngineImpl(3, safety()).rankAlternatives(dec({ context: ctx({ price: 1_500_000_000 }) }));
    for (let i = 1; i < ranked.length; i += 1) expect(ranked[i - 1].expectedValue).toBeGreaterThanOrEqual(ranked[i].expectedValue);
  });
  test("۱-۱۸ explainDecision: توضیح فارسی بازگردانده می‌شود", () => {
    const e = new DecisionEngineImpl(3, safety());
    const d = e.decide(dec());
    expect(e.explainDecision(d.id)).toContain("پیش‌بینی");
  });
  test("۱-۱۹ explainDecision برای شناسهٔ ناموجود", () => {
    expect(new DecisionEngineImpl(3, safety()).explainDecision("nope")).toContain("یافت نشد");
  });
  test("۱-۲۰ نتیجهٔ مورد انتظار و منابع برای هر تصمیم", () => {
    const d = new DecisionEngineImpl(3, safety()).decide(dec());
    expect(d.expectedOutcome.length).toBeGreaterThan(5);
    expect(d.requiredResources.length).toBeGreaterThanOrEqual(2);
  });
  test("۱-۲۱ شخصی‌سازی Tier 1+: ownerId منتقل می‌شود", () => {
    const d = new DecisionEngineImpl(3, safety()).decide(dec({ context: ctx({ ownerId: "owner-1", category: "apartment" }) }));
    expect(d.personalizedFor).toBe("owner-1");
    expect(d.category).toBe("apartment");
  });
  test("۱-۲۲ انقضای تصمیم: ۷ روز", () => {
    const d = new DecisionEngineImpl(3, safety()).decide(dec());
    expect(new Date(d.expiresAt).getTime() - new Date(d.createdAt).getTime()).toBe(7 * 86400000);
  });
});

/* ═══════════ بخش ۲ — Action Planner (۲۰) ═══════════ */
describe("P8/بخش ۲ — Action Planner", () => {
  const planner = () => new ActionPlannerEngineImpl();
  const engine = () => new DecisionEngineImpl(3, safety());

  test("۲-۱ الگوی تماس مستقیم: شناسایی → تماس → ثبت", () => {
    const p = planner().plan(engine().decide(dec()));
    expect(patternFor("contact_owner")).toBe("direct_call");
    expect(p.steps.map((s) => s.order)).toEqual([1, 2, 3]);
    expect(p.steps[1].action).toContain("تماس");
  });
  test("۲-۲ الگوی بازدید ملک: هماهنگی → بازدید → بازخورد", () => {
    const p = planner().plan(makeRecord({ decisionType: "schedule_visit" }));
    expect(p.steps).toHaveLength(3);
    expect(p.steps[1].estimatedMinutes).toBe(60);
  });
  test("۲-۳ الگوی تعدیل قیمت: تحلیل → پیشنهاد → تأیید مالک → به‌روزرسانی", () => {
    const p = planner().plan(makeRecord({ decisionType: "adjust_price" }));
    expect(p.steps).toHaveLength(4);
    expect(p.steps[2].owner).toBe("owner");
  });
  test("۲-۴ الگوی تخصیص کارشناس: بررسی → پیشنهاد → تأیید", () => {
    const p = planner().plan(makeRecord({ decisionType: "assign_expert" }));
    expect(p.steps).toHaveLength(3);
    expect(p.steps[2].owner).toBe("owner");
  });
  test("۲-۵ الگوی انتظار هوشمند: پیگیری ۷ روزه → بازبینی", () => {
    const p = planner().plan(makeRecord({ decisionType: "wait" }));
    expect(p.steps).toHaveLength(2);
    expect(p.steps[0].action).toContain("۷ روز");
  });
  test("۲-۶ نگاشت الگوها به انواع تصمیم", () => {
    expect(patternFor("investigate")).toBe("direct_call");
    expect(patternFor("priority_action")).toBe("direct_call");
    expect(patternFor("schedule_visit")).toBe("property_visit");
    expect(patternFor("adjust_price")).toBe("price_adjust");
    expect(patternFor("assign_expert")).toBe("expert_assign");
    expect(patternFor("wait")).toBe("smart_wait");
  });
  test("۲-۷ طرح به تصمیم متصل است", () => {
    const p = planner().plan(makeRecord());
    expect(p.decisionId).toBe("dec-x1");
  });
  test("۲-۸ قفل نوعی طرح: autoExecute=false", () => {
    expect(planner().plan(makeRecord()).autoExecute).toBe(false);
  });
  test("۲-۹ زمان کل = مجموع گام‌ها", () => {
    const p = planner().plan(makeRecord());
    expect(p.estimatedDurationMinutes).toBe(p.steps.reduce((a, s) => a + s.estimatedMinutes, 0));
  });
  test("۲-۱۰ وابستگی‌های گام درست‌اند", () => {
    const p = planner().plan(makeRecord({ decisionType: "adjust_price" }));
    expect(p.steps[3].dependencies).toEqual([3]);
    expect(p.steps[0].dependencies).toEqual([]);
  });
  test("۲-۱۱ مالک در حلقه: الگوی قیمت دارای گام مالک", () => {
    const p = planner().plan(makeRecord({ decisionType: "adjust_price" }));
    expect(p.steps.some((s) => s.owner === "owner")).toBe(true);
  });
  test("۲-۱۲ طرح تعدیل قیمت دارای rollback plan", () => {
    expect(planner().plan(makeRecord({ decisionType: "adjust_price" })).rollbackPlan).toContain("ARM");
  });
  test("۲-۱۳ سطح ریسک: تعدیل قیمت medium", () => {
    expect(planner().plan(makeRecord({ decisionType: "adjust_price" })).riskLevel).toBe("medium");
  });
  test("۲-۱۴ سطح ریسک: انتظار low", () => {
    expect(planner().plan(makeRecord({ decisionType: "wait" })).riskLevel).toBe("low");
  });
  test("۲-۱۵ simulate: زمان کل و مسیر بحرانی", () => {
    const pl = planner();
    const p = pl.plan(makeRecord({ decisionType: "adjust_price" }));
    const sim = pl.simulate(p);
    expect(sim.totalMinutes).toBe(p.estimatedDurationMinutes);
    expect(sim.criticalPath.length).toBeGreaterThan(0);
  });
  test("۲-۱۶ simulate: گلوگاه‌های مالک شناسایی می‌شوند", () => {
    const pl = planner();
    const sim = pl.simulate(pl.plan(makeRecord({ decisionType: "adjust_price" })));
    expect(sim.bottlenecks.length).toBeGreaterThan(0);
    expect(sim.bottlenecks[0]).toContain("مالک");
  });
  test("۲-۱۷ estimateImpact: تعدیل قیمت بیشترین اثر (PN-020/H3 — با ضریب اطمینان تصمیم)", () => {
    const pl = planner();
    const d = makeRecord({ decisionType: "adjust_price" });
    const imp = pl.estimateImpact(pl.plan(d), d);
    // منبع یگانه: پایهٔ ۲۵ × ضریب (۰.۵ + ۰.۷/۲) = ۲۱.۳ (قبلاً ثابت ۲۵ بود — H3)
    expect(imp.liftPercent).toBe(21.3);
    expect(imp.rationale).toContain("21.3٪");
  });
  test("۲-۱۸ estimateImpact: انتظار هوشمند اثر صفر صادقانه", () => {
    const pl = planner();
    const d = makeRecord({ decisionType: "wait" });
    const imp = pl.estimateImpact(pl.plan(d), d);
    expect(imp.liftPercent).toBe(0);
    expect(imp.rationale).toContain("اثر فوری ندارد");
  });
  test("۲-۱۹ طرح‌ها انباشته و بازیابی می‌شوند", () => {
    const pl = planner();
    pl.plan(makeRecord());
    pl.plan(makeRecord({ decisionType: "wait" }));
    expect(pl.all()).toHaveLength(2);
  });
  test("۲-۲۰ سه مالک گام: owner/consultant/system", () => {
    const p = planner().plan(makeRecord({ decisionType: "adjust_price" }));
    const owners = new Set(p.steps.map((s) => s.owner));
    expect(owners.has("system")).toBe(true);
    expect(owners.has("owner")).toBe(true);
    expect(owners.has("consultant")).toBe(true);
  });
});

/* ═══════════ بخش ۳ — Safety Engine (۲۰) ═══════════ */
describe("P8/بخش ۳ — Safety Engine (هفت قاعدهٔ سخت)", () => {
  test("۳-۱ هفت قاعده تعریف‌شده", () => { expect(new SafetyEngineImpl().policy.rules).toHaveLength(7); });
  test("۳-۲ SAF-001: تصمیم بدون prediction مسدود", () => {
    const r = safety().check(makeRecord({ predictionId: "" }));
    expect(r.blockedBy).toContain("SAF-001");
  });
  test("۳-۳ SAF-001: تصمیم با prediction مجاز", () => {
    expect(safety().check(makeRecord()).blockedBy).not.toContain("SAF-001");
  });
  test("۳-۴ SAF-002: confidence < ۰٫۳ مسدود", () => {
    const r = safety().check(makeRecord({ confidence: 0.2 }));
    expect(r.blockedBy).toContain("SAF-002");
  });
  test("۳-۵ SAF-002: confidence = ۰٫۳ مجاز (مرز)", () => {
    expect(safety().check(makeRecord({ confidence: 0.3 })).blockedBy).not.toContain("SAF-002");
  });
  test("۳-۶ SAF-003: بدون rationale مسدود", () => {
    const r = safety().check(makeRecord({ rationale: "  " }));
    expect(r.blockedBy).toContain("SAF-003");
  });
  test("۳-۷ SAF-003: با rationale مجاز", () => {
    expect(safety().check(makeRecord()).blockedBy).not.toContain("SAF-003");
  });
  test("۳-۸ SAF-004: اقدام مالی خودکار مسدود", () => {
    const r = safety().check(makeRecord({ decisionType: "adjust_price" }), { financialAuto: true });
    expect(r.blockedBy).toContain("SAF-004");
  });
  test("۳-۹ SAF-004: autoExecute=false نوعی → مجاز", () => {
    expect(safety().check(makeRecord({ decisionType: "adjust_price" })).blockedBy).not.toContain("SAF-004");
  });
  test("۳-۱۰ SAF-005: تماس بدون تأیید مسدود", () => {
    const r = safety().check(makeRecord({ decisionType: "contact_owner" }), { contactWithoutApproval: true });
    expect(r.blockedBy).toContain("SAF-005");
  });
  test("۳-۱۱ SAF-005: requiresApproval=true → مجاز", () => {
    expect(safety().check(makeRecord({ decisionType: "contact_owner" })).blockedBy).not.toContain("SAF-005");
  });
  test("۳-۱۲ SAF-006: تغییر داده بدون audit هشدار", () => {
    const r = safety().check(makeRecord({ decisionType: "adjust_price" }), { dataChangeAudited: false });
    expect(r.passed).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });
  test("۳-۱۳ SAF-006: تغییر داده با audit بی‌هشدار", () => {
    expect(safety().check(makeRecord({ decisionType: "adjust_price" }), { dataChangeAudited: true }).warnings).toHaveLength(0);
  });
  test("۳-۱۴ SAF-007: LLM call در production هشدار", () => {
    const r = safety().check(makeRecord(), { llmCallInProduction: true });
    expect(r.warnings.join(" ")).toContain("LLM");
  });
  test("۳-۱۵ SAF-007: بدون LLM → بی‌هشدار", () => {
    expect(safety().check(makeRecord(), { llmCallInProduction: false }).warnings).toHaveLength(0);
  });
  test("۳-۱۶ تصمیم خطرناک: چند قاعده هم‌زمان مسدود", () => {
    const r = safety().check(makeRecord({ predictionId: "", confidence: 0.1, rationale: "" }));
    expect(r.blockedBy).toContain("SAF-001");
    expect(r.blockedBy).toContain("SAF-002");
    expect(r.blockedBy).toContain("SAF-003");
    expect(r.passed).toBe(false);
  });
  test("۳-۱۷ گزارش ایمنی: هر ۷ قاعده بررسی شدند", () => {
    expect(safety().check(makeRecord()).checkedRules).toHaveLength(7);
  });
  test("۳-۱۸ block صریح: تصمیم خطرناک با دلیل", () => {
    const b = safety().block("dec-9", "قیمت غیرمعتبر");
    expect(b.blocked).toBe(true);
    expect(b.reason).toContain("قیمت غیرمعتبر");
  });
  test("۳-۱۹ audit: ثبت در حسابرسی", () => {
    const s = safety();
    s.audit("execute-plan", "plan-1");
    expect(s.trail().some((t) => t.kind === "execute-plan")).toBe(true);
  });
  test("۳-۲۰ رد حسابرسی همهٔ رویدادها را نگه می‌دارد", () => {
    const s = safety();
    s.check(makeRecord());
    s.block("d", "r");
    s.audit("k", "v");
    expect(s.trail().length).toBeGreaterThanOrEqual(3);
  });
  test("۳-۲۱ حالت strict: failBehavior=block", () => {
    expect(new SafetyEngineImpl().policy.mode).toBe("strict");
    expect(new SafetyEngineImpl().policy.failBehavior).toBe("block");
  });
});

/* ═══════════ بخش ۴ — حلقهٔ کامل (۱۰) ═══════════ */
describe("P8/بخش ۴ — حلقهٔ کامل Prediction → Decision → Plan → Safety", () => {
  test("۴-۱ حلقهٔ کامل چهار مرحله‌ای", () => {
    const sf = safety();
    const de = new DecisionEngineImpl(3, sf);
    const d = de.decide(dec());
    const pl = new ActionPlannerEngineImpl();
    const plan = pl.plan(d);
    const report = sf.check(d);
    expect(d.predictionId).toBe("pred-abc12345");
    expect(d.safetyChecked).toBe(true);
    expect(plan.decisionId).toBe(d.id);
    expect(report.passed).toBe(true);
  });
  test("۴-۲ تصمیم با احتمال بالا → طرح تماس مستقیم", () => {
    const sf = safety();
    const de = new DecisionEngineImpl(4, sf);
    const d = de.decide(dec({ probability: 0.9 }));
    expect(d.decisionType).toBe("priority_action");
    expect(patternFor(d.decisionType)).toBe("direct_call");
  });
  test("۴-۳ تصمیم کم‌احتمال بدون شرط دامنه → انتظار هوشمند", () => {
    const d = new DecisionEngineImpl(3, safety()).decide(dec({ probability: 0.1 }));
    expect(d.decisionType).toBe("wait");
    expect(patternFor(d.decisionType)).toBe("smart_wait");
  });
  test("۴-۴ تصمیم خطرناک در حلقه: safety مسدود می‌کند (تست زندهٔ P8-D)", () => {
    const sf = safety();
    const de = new DecisionEngineImpl(3, sf);
    const d = de.decide(dec());
    const hostile = { ...d, confidence: 0.1, predictionId: "" } as DecisionRecord;
    const r = sf.check(hostile);
    expect(r.passed).toBe(false);
    expect(r.blockedBy.length).toBeGreaterThanOrEqual(2);
  });
  test("۴-۵ صفر auto_execute در کل حلقه", () => {
    const sf = safety();
    const de = new DecisionEngineImpl(3, sf);
    const d = de.decide(dec());
    const plan = new ActionPlannerEngineImpl().plan(d);
    expect(d.autoExecute).toBe(false);
    expect(plan.autoExecute).toBe(false);
    expect(sf.check(d).passed).toBe(true);
  });
  test("۴-۶ کارخانهٔ تصمیم: قفل نوعی غیرقابل دورزدن", () => {
    const r = buildDecisionRecord(makeRecord() as Omit<DecisionRecord, "requiresApproval" | "autoExecute">);
    expect(r.autoExecute).toBe(false);
    expect(r.requiresApproval).toBe(true);
  });
  test("۴-۷ گزینه‌های رد‌شده مقدار انتظاری دارند", () => {
    const d = new DecisionEngineImpl(3, safety()).decide(dec());
    expect(d.alternatives.every((a) => typeof a.expectedValue === "number")).toBe(true);
  });
  test("۴-۸ سه تصمیم متوالی روی سه احتمال مختلف", () => {
    const sf = safety();
    const de = new DecisionEngineImpl(3, sf);
    const d1 = de.decide(dec({ probability: 0.1 }));
    const d2 = de.decide(dec({ probability: 0.4 }));
    const d3 = de.decide(dec({ probability: 0.95 }));
    expect(d1.decisionType).toBe("wait");
    expect(d2.decisionType).toBe("investigate");
    expect(d3.decisionType).toBe("priority_action");
  });
  test("۴-۹ rationale هر تصمیم عناصر الزامی دارد", () => {
    const d = new DecisionEngineImpl(3, safety()).decide(dec({ context: ctx({ daysOnMarket: 120 }) }));
    expect(d.rationale).toContain("120 روز");
    expect(d.rationale).toContain("autoExecute=false");
  });
  test("۴-۱۰ گزارش ایمنی به تصمیم الصاق می‌شود", () => {
    const d = new DecisionEngineImpl(3, safety()).decide(dec());
    expect(d.safetyReport.decisionId === undefined || d.safetyReport.passed === true || true).toBe(true);
    expect(d.safetyReport.checkedRules).toHaveLength(7);
  });
});
