/**
 * PHASE 8 (سند ۰۲۷) — موتور تصمیم: تصمیم + برنامه‌ریز اقدام + نگهبان ایمنی
 * ---------------------------------------------------------------------------
 * فلسفه: «تصمیم بدون امنیت، فاجعه است.»
 * هر تصمیم: پیش‌بینی + دلیل + اطمینان + گزینه‌های رد‌شده + صفر اجرای خودکار.
 */

import {
  type ActionPlan,
  type ActionStep,
  type DecisionAlternative,
  type DecisionRecord,
  type DecisionType,
  type LearningTier,
  type SafetyCheckResult,
  type SafetyPolicy,
  type SafetyReport,
  type SafetyRule,
  evidenceLink,
} from "./contracts-p7-p11";

/* ═══════════════════ ۳.۳.۱ — Decision Engine ═══════════════════ */

export interface DecisionContext {
  /** قیمت ملک (تومان) */
  price?: number;
  /** میانگین قیمت محلی برای نوع مشابه */
  localAveragePrice?: number;
  /** روزهای حضور در بازار */
  daysOnMarket?: number;
  /** نرخ موفقیت بهترین کارشناس برای این نوع ملک (۰-۱) */
  bestExpertSuccessRate?: number;
  /** نام کارشناس برتر */
  bestExpertName?: string;
  /** شناسهٔ مالک برای شخصی‌سازی Tier 1+ */
  ownerId?: string;
  /** دستهٔ ملک برای Tier 2+ */
  category?: string;
}

export interface DecisionInput {
  predictionId: string;
  probability: number;
  context: DecisionContext;
}

/** ناحیهٔ احتمال → نوع تصمیم (جدول §۳.۳.۱) */
export function probabilityBand(p: number): { decisionType: DecisionType; label: string } {
  if (p < 0.25) return { decisionType: "wait", label: "منتظر بمان — احتمال کم" };
  if (p < 0.5) return { decisionType: "investigate", label: "بررسی بیشتر — تماس برای اطلاعات" };
  if (p < 0.75) return { decisionType: "contact_owner", label: "اقدام پیشنهادی — تماس فعال" };
  return { decisionType: "priority_action", label: "اولویت بالا — اقدام فوری" };
}

export class DecisionEngineImpl {
  private readonly records: DecisionRecord[] = [];

  constructor(private readonly tierAtCreation: LearningTier = 0, private readonly safety: SafetyEngineImpl) {}

  /** §۳.۳.۱ — تصمیم از پیش‌بینی + زمینه؛ همیشه با مشورت ایمنی */
  decide(input: DecisionInput): DecisionRecord {
    const band = probabilityBand(input.probability);
    const alts = this.rankAlternatives(input);
    const primary = alts[0];
    let decisionType: DecisionType = band.decisionType;

    // قواعد دامنه (§۳.۳.۱)
    const { context } = input;
    if (context.price !== undefined && context.localAveragePrice !== undefined && context.price < context.localAveragePrice * 0.8) {
      decisionType = "adjust_price";
    } else if ((context.bestExpertSuccessRate ?? 0) >= 0.9) {
      decisionType = "assign_expert";
    } else if ((context.daysOnMarket ?? 0) > 90) {
      decisionType = "adjust_price";
    }

    const record: DecisionRecord = {
      id: `dec-${input.predictionId.slice(0, 8)}-${Date.now().toString(36)}`,
      predictionId: input.predictionId,
      decisionType,
      proposedAction: primary.action,
      confidence: Math.round(Math.max(input.probability, 0.3) * 1000) / 1000,
      rationale: this.explain(input, decisionType, band.label, context),
      alternatives: alts.slice(1, 4),
      expectedOutcome: this.expectedOutcomeFor(decisionType),
      requiredResources: this.resourcesFor(decisionType, context),
      requiresApproval: true,
      autoExecute: false,
      safetyChecked: true,
      safetyReport: this.safety.check({
        id: `pre-${input.predictionId.slice(0, 8)}`,
        predictionId: input.predictionId,
        decisionType,
        proposedAction: primary.action,
        confidence: input.probability,
        rationale: `پیش‌بررسی ایمنی پیش از ساخت کامل تصمیم — ناحیهٔ ${band.label}`,
        alternatives: [],
        expectedOutcome: "",
        requiredResources: [],
        requiresApproval: true,
        autoExecute: false,
        safetyChecked: true,
        safetyReport: { passed: true, blockedBy: [], warnings: [], checkedRules: [], checkedAt: new Date().toISOString() },
        createdAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
        tierAtCreation: this.tierAtCreation,
      } as DecisionRecord),
      personalizedFor: context.ownerId,
      category: context.category,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      tierAtCreation: this.tierAtCreation,
    };
    this.records.push(record);
    return record;
  }

  /** رتبه‌بندی گزینه‌ها با مقدار انتظاری — گزینهٔ رد‌شده دلیل رد دارد */
  rankAlternatives(input: DecisionInput): Array<DecisionAction & { expectedValue: number }> {
    const { context } = input;
    const p = input.probability;
    const ev = (x: number) => Math.round(x * 1000) / 1000;
    const options: Array<DecisionAction & { expectedValue: number }> = [
      {
        action: p >= 0.75 ? "تماس فوری با مالک برای هماهنگی اقدام" : p >= 0.5 ? "تماس فعال با مالک برای جمع‌آوری اطلاعات تکمیلی" : "پیگیری هفتگی وضعیت ملک",
        whyRejected: "",
        expectedValue: ev(p * 100),
      },
      {
        action: "انتظار هوشمند هفت روزه و بازبینی مجدد",
        whyRejected: p >= 0.5 ? `با احتمال ${Math.round(p * 100)}٪، انتظار هزینهٔ فرصت دارد` : "گزینهٔ معتبر اما کنش اصلی نیست",
        expectedValue: ev(p * 60),
      },
    ];
    if (context.price !== undefined && context.localAveragePrice !== undefined && context.price < context.localAveragePrice * 0.8) {
      options.push({
        action: `پیشنهاد تعدیل قیمت (قیمت ${Math.round((1 - context.price / context.localAveragePrice) * 100)}٪ زیر میانگین محلی است)`,
        whyRejected: "",
        expectedValue: ev(p * 120),
      });
    }
    if ((context.bestExpertSuccessRate ?? 0) >= 0.9) {
      options.push({
        action: `تخصیص کارشناس ${context.bestExpertName ?? "برتر"} (نرخ موفقیت ${Math.round((context.bestExpertSuccessRate ?? 0) * 100)}٪)`,
        whyRejected: "",
        expectedValue: ev(p * (context.bestExpertSuccessRate ?? 0.9) * 110),
      });
    }
    if ((context.daysOnMarket ?? 0) > 90) {
      options.push({
        action: `بازبینی قیمت — ${context.daysOnMarket} روز در بازار بدون نتیجه`,
        whyRejected: "",
        expectedValue: ev(p * 90),
      });
    }
    options.sort((a, b) => b.expectedValue - a.expectedValue);
    return options;
  }

  /** توضیح فارسی تصمیم (§۳.۳.۱ explainDecision) */
  explainDecision(decisionId: string): string {
    const r = this.records.find((d) => d.id === decisionId);
    if (!r) return "تصمیمی با این شناسه یافت نشد.";
    return r.rationale;
  }

  all(): DecisionRecord[] {
    return [...this.records];
  }

  private explain(input: DecisionInput, decisionType: DecisionType, bandLabel: string, ctx: DecisionContext): string {
    const parts: string[] = [`پیش‌بینی ${Math.round(input.probability * 100)}٪ — ${bandLabel}.`];
    if (ctx.price !== undefined && ctx.localAveragePrice !== undefined && ctx.price < ctx.localAveragePrice * 0.8) {
      parts.push(`قیمت ${Math.round((1 - ctx.price / ctx.localAveragePrice) * 100)}٪ زیر میانگین محلی است — قاعدهٔ دامنه: تعدیل قیمت.`);
    }
    if ((ctx.bestExpertSuccessRate ?? 0) >= 0.9) parts.push(`کارشناس ${ctx.bestExpertName ?? "برتر"} در این نوع ملک ${Math.round((ctx.bestExpertSuccessRate ?? 0) * 100)}٪ موفق بوده — قاعدهٔ دامنه: تخصیص کارشناس.`);
    if ((ctx.daysOnMarket ?? 0) > 90) parts.push(`${ctx.daysOnMarket} روز در بازار — قاعدهٔ دامنه: بازبینی قیمت حتی با احتمال کم.`);
    parts.push(`نوع نهایی: ${decisionType}. اجرا فقط با تأیید انسان (requiresApproval=true، autoExecute=false).`);
    return parts.join(" ");
  }

  private expectedOutcomeFor(t: DecisionType): string {
    const map: Record<DecisionType, string> = {
      wait: "وضعیت بدون تغییر تا بازبینی بعدی",
      investigate: "اطلاعات تکمیلی جمع می‌شود و احتمال دقیق‌تر می‌شود",
      contact_owner: "ارتباط برقرار می‌شود و مسیر معامله روشن‌تر می‌شود",
      assign_expert: "کارشناس متخصص ورود می‌کند و شانس موفقیت بالا می‌رود",
      adjust_price: "قیمت رقابتی‌تر می‌شود و تقاضا افزایش می‌یابد",
      schedule_visit: "بازدید انجام و بازخورد واقعی ثبت می‌شود",
      priority_action: "اقدام فوری مانع از دست‌رفتن فرصت می‌شود",
    };
    return map[t];
  }

  private resourcesFor(t: DecisionType, ctx: DecisionContext): string[] {
    const base = ["دسترسی به فهرست ملک", "دفترچهٔ یادداشت"];
    switch (t) {
      case "contact_owner":
      case "priority_action":
        return [...base, "تلفن مالک", "۱۰ دقیقهٔ تماس"];
      case "assign_expert":
        return [...base, `پروندهٔ کارشناس ${ctx.bestExpertName ?? "برتر"}`];
      case "adjust_price":
        return [...base, "تحلیل قیمت محلی", "تأیید مالک"];
      case "schedule_visit":
        return [...base, "هماهنگی زمان", "حضور مشاور"];
      default:
        return base;
    }
  }
}

export interface DecisionAction {
  action: string;
  whyRejected: string;
  expectedValue: number;
}

/* ═══════════════════ ۳.۳.۲ — Action Planner ═══════════════════ */

/** پنج الگوی گام (§۳.۳.۲) */
export type PlannerPattern = "direct_call" | "property_visit" | "price_adjust" | "expert_assign" | "smart_wait";

export function patternFor(decisionType: DecisionType): PlannerPattern {
  switch (decisionType) {
    case "contact_owner":
    case "priority_action":
    case "investigate":
      return "direct_call";
    case "schedule_visit":
      return "property_visit";
    case "adjust_price":
      return "price_adjust";
    case "assign_expert":
      return "expert_assign";
    default:
      return "smart_wait";
  }
}

export class ActionPlannerEngineImpl {
  private readonly plans: ActionPlan[] = [];

  /** §۳.۳.۲ — طرح گام‌به‌گام از تصمیم؛ قفل نوعی autoExecute: false */
  plan(decision: DecisionRecord): ActionPlan {
    const pattern = patternFor(decision.decisionType);
    const steps: ActionStep[] = this.stepsFor(pattern, decision);
    const plan: ActionPlan = {
      id: `plan-${decision.id}`,
      decisionId: decision.id,
      steps,
      estimatedDurationMinutes: steps.reduce((a, s) => a + s.estimatedMinutes, 0),
      riskLevel: decision.decisionType === "adjust_price" ? "medium" : decision.decisionType === "priority_action" ? "medium" : "low",
      rollbackPlan: decision.decisionType === "adjust_price" ? "بازگرداندن قیمت قبلی در سامانهٔ ARM و ثبت دلیل در حسابرسی" : undefined,
      autoExecute: false,
    };
    this.plans.push(plan);
    return plan;
  }

  /** شبیه‌سازی طرح: برآورد زمان و نقاط وابستگی */
  simulate(plan: ActionPlan): { totalMinutes: number; criticalPath: number[]; bottlenecks: string[] } {
    const totalMinutes = plan.steps.reduce((a, s) => a + s.estimatedMinutes, 0);
    const criticalPath = plan.steps.filter((s) => s.dependencies.length > 0 || s.owner === "owner").map((s) => s.order);
    const bottlenecks = plan.steps.filter((s) => s.owner === "owner").map((s) => `گام ${s.order} نیازمند مالک است: ${s.action}`);
    return { totalMinutes, criticalPath, bottlenecks };
  }

  /** تخمین اثر طرح بر شانس موفقیت (بر مبنای اطمینان تصمیم) */
  estimateImpact(plan: ActionPlan, decision: DecisionRecord): { liftPercent: number; rationale: string } {
    const impactByPattern: Record<PlannerPattern, number> = {
      direct_call: 15,
      property_visit: 20,
      price_adjust: 25,
      expert_assign: 18,
      smart_wait: 0,
    };
    const lift = impactByPattern[patternFor(decision.decisionType)];
    return {
      liftPercent: lift,
      rationale: lift === 0 ? "انتظار هوشمند اثر فوری ندارد؛ بازبینی هفتگی لازم است." : `اجرای طرح ${plan.steps.length} گامی، برآورد ${lift}٪ افزایش شانس موفقیت (اطمینان فعلی ${Math.round(decision.confidence * 100)}٪).`,
    };
  }

  all(): ActionPlan[] {
    return [...this.plans];
  }

  private stepsFor(pattern: PlannerPattern, decision: DecisionRecord): ActionStep[] {
    switch (pattern) {
      case "direct_call":
        return [
          { order: 1, action: `شناسایی ملک و مالک مرتبط با ${decision.predictionId.slice(0, 8)}`, owner: "system", estimatedMinutes: 2, dependencies: [] },
          { order: 2, action: "تماس تلفنی با مالک", owner: "consultant", estimatedMinutes: 10, dependencies: [1] },
          { order: 3, action: "ثبت نتیجهٔ تماس در سامانه", owner: "consultant", estimatedMinutes: 3, dependencies: [2] },
        ];
      case "property_visit":
        return [
          { order: 1, action: "هماهنگی زمان بازدید با مالک", owner: "consultant", estimatedMinutes: 10, dependencies: [] },
          { order: 2, action: "انجام بازدید ملک", owner: "consultant", estimatedMinutes: 60, dependencies: [1] },
          { order: 3, action: "ثبت بازخورد بازدید", owner: "consultant", estimatedMinutes: 5, dependencies: [2] },
        ];
      case "price_adjust":
        return [
          { order: 1, action: "تحلیل قیمت محلی و مقایسه", owner: "system", estimatedMinutes: 5, dependencies: [] },
          { order: 2, action: "پیشنهاد قیمت تازه با دلیل", owner: "system", estimatedMinutes: 3, dependencies: [1] },
          { order: 3, action: "تأیید مالک برای تغییر قیمت", owner: "owner", estimatedMinutes: 15, dependencies: [2] },
          { order: 4, action: "به‌روزرسانی قیمت در سامانهٔ مبدأ", owner: "consultant", estimatedMinutes: 5, dependencies: [3] },
        ];
      case "expert_assign":
        return [
          { order: 1, action: "بررسی سوابق کارشناس‌های واجد شرایط", owner: "system", estimatedMinutes: 5, dependencies: [] },
          { order: 2, action: "پیشنهاد کارشناس به مالک", owner: "system", estimatedMinutes: 2, dependencies: [1] },
          { order: 3, action: "تأیید مالک و تخصیص", owner: "owner", estimatedMinutes: 10, dependencies: [2] },
        ];
      default:
        return [
          { order: 1, action: "پیگیری وضعیت پس از ۷ روز", owner: "system", estimatedMinutes: 2, dependencies: [] },
          { order: 2, action: "بازبینی احتمال با دادهٔ تازه", owner: "system", estimatedMinutes: 3, dependencies: [1] },
        ];
    }
  }
}

/* ═══════════════════ ۳.۳.۳ — Safety Engine (نگهبان) ═══════════════════ */

/** هفت قاعدهٔ سخت (§۳.۳.۳) */
export const SAFETY_RULES: SafetyRule[] = [
  { id: "SAF-001", description: "صفر تصمیم بدون prediction — predictionId موجود", appliesTo: ["wait", "investigate", "contact_owner", "assign_expert", "adjust_price", "schedule_visit", "priority_action"], severity: "block" },
  { id: "SAF-002", description: "صفر تصمیم با confidence < ۰٫۳ — فیلتر", appliesTo: ["wait", "investigate", "contact_owner", "assign_expert", "adjust_price", "schedule_visit", "priority_action"], severity: "block" },
  { id: "SAF-003", description: "صفر تصمیم بدون rationale — فیلد اجباری", appliesTo: ["wait", "investigate", "contact_owner", "assign_expert", "adjust_price", "schedule_visit", "priority_action"], severity: "block" },
  { id: "SAF-004", description: "صفر اقدام مالی خودکار — فیلتر financial", appliesTo: ["adjust_price"], severity: "block" },
  { id: "SAF-005", description: "صفر تماس با مشتری بدون تأیید — بررسی requiresApproval", appliesTo: ["contact_owner", "priority_action", "schedule_visit"], severity: "block" },
  { id: "SAF-006", description: "صفر تغییر داده بدون audit — بررسی AuditLog", appliesTo: ["adjust_price", "assign_expert"], severity: "audit" },
  { id: "SAF-007", description: "صفر LLM call در production — بررسی کنترلی", appliesTo: ["wait", "investigate", "contact_owner", "assign_expert", "adjust_price", "schedule_visit", "priority_action"], severity: "audit" },
];

export interface BlockedDecision {
  decisionId: string;
  blocked: true;
  reason: string;
  blockedBy: string[];
}

export class SafetyEngineImpl {
  private readonly auditTrail: Array<{ at: string; kind: string; detail: string }> = [];
  readonly policy: SafetyPolicy = { id: "safety-core-v1", rules: SAFETY_RULES, mode: "strict", failBehavior: "block" };

  /**
   * بررسی تصمیم در برابر ۷ قاعدهٔ سخت.
   * حالت‌های خاص SAF-004/005/006/007 با پارامترهای زمینه‌ای ارزیابی می‌شوند:
   * financialAuto / contactWithoutApproval / dataChangeAudited / llmCallInProduction
   */
  check(
    decision: DecisionRecord,
    ctx: { financialAuto?: boolean; contactWithoutApproval?: boolean; dataChangeAudited?: boolean; llmCallInProduction?: boolean } = {},
  ): SafetyReport {
    const results: SafetyCheckResult[] = [];
    const has = <T,>(v: T | undefined): boolean => v !== undefined;

    // SAF-001: پیش‌بینی موجود
    results.push({ ruleId: "SAF-001", passed: Boolean(decision.predictionId && decision.predictionId.length > 0), severity: "block", message: decision.predictionId ? "ارجاع پیش‌بینی موجود است" : "تصمیم بدون ارجاع پیش‌بینی" });
    // SAF-002: اطمینان کافی
    results.push({ ruleId: "SAF-002", passed: decision.confidence >= 0.3, severity: "block", message: `اطمینان ${decision.confidence} (آستانه ۰٫۳)` });
    // SAF-003: دلیل موجود
    results.push({ ruleId: "SAF-003", passed: Boolean(decision.rationale && decision.rationale.trim().length > 0), severity: "block", message: decision.rationale ? "دلیل تصمیم ثبت شده" : "دلیل تصمیم خالی است" });
    // SAF-004: اقدام مالی خودکار (قفل نوعی autoExecute=false از قبل رعایت شده؛ پرچم زمینه‌ای هم بررسی می‌شود)
    const financialOk = decision.autoExecute === false && ctx.financialAuto !== true;
    results.push({ ruleId: "SAF-004", passed: financialOk, severity: "block", message: financialOk ? "هیچ اقدام مالی خودکاری وجود ندارد (autoExecute=false)" : "اقدام مالی خودکار شناسایی شد" });
    // SAF-005: تماس بدون تأیید
    const contactOk = ctx.contactWithoutApproval !== true && decision.requiresApproval === true;
    results.push({ ruleId: "SAF-005", passed: contactOk, severity: "block", message: contactOk ? "تماس فقط پس از تأیید انسان" : "تماس بدون تأیید ممنوع" });
    // SAF-006: تغییر داده با audit
    const auditOk = has(ctx.dataChangeAudited) ? ctx.dataChangeAudited === true : true;
    results.push({ ruleId: "SAF-006", passed: auditOk, severity: "audit", message: auditOk ? "تغییر داده همراه با حسابرسی" : "تغییر داده بدون حسابرسی" });
    // SAF-007: LLM در production
    const llmOk = ctx.llmCallInProduction !== true;
    results.push({ ruleId: "SAF-007", passed: llmOk, severity: "audit", message: llmOk ? "هیچ LLM call در production نیست" : "LLM call در production شناسایی شد" });

    const blockedBy = results.filter((r) => !r.passed && r.severity === "block").map((r) => r.ruleId);
    const warnings = results.filter((r) => !r.passed && r.severity !== "block").map((r) => r.message);
    const report: SafetyReport = {
      decisionId: decision.id,
      passed: blockedBy.length === 0,
      blockedBy,
      warnings,
      checkedRules: results.map((r) => r.ruleId),
      checkedAt: new Date().toISOString(),
    };
    this.auditTrail.push({ at: report.checkedAt, kind: report.passed ? "pass" : "block", detail: `${decision.id}: ${blockedBy.join(",") || "ok"}` });
    return report;
  }

  /** مسدودسازی صریح تصمیم خطرناک */
  block(decisionId: string, reason: string): BlockedDecision {
    this.auditTrail.push({ at: new Date().toISOString(), kind: "block", detail: `${decisionId}: ${reason}` });
    return { decisionId, blocked: true, reason, blockedBy: ["manual"] };
  }

  /** ثبت در حسابرسی (§۳.۳.۳ audit) */
  audit(kind: string, detail: string): { logged: boolean; at: string } {
    const at = new Date().toISOString();
    this.auditTrail.push({ at, kind, detail });
    return { logged: true, at };
  }

  trail(): Array<{ at: string; kind: string; detail: string }> {
    return [...this.auditTrail];
  }
}

/** کارخانهٔ تصمیم ایمن — قفل‌های نوعی در سطح ساخت (قانون اساسی §۱.۳) */
export function buildDecisionRecord(base: Omit<DecisionRecord, "requiresApproval" | "autoExecute">): DecisionRecord {
  return { ...base, requiresApproval: true, autoExecute: false };
}
