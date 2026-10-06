/**
 * قراردادهای هستهٔ هوش ملکا — سند راهبردی یکپارچه ۰۲۷ (P7 تا P11)
 * ---------------------------------------------------------------------------
 * منبع قانون: مصوبهٔ شورای عالی ملکا «ملکا-شورا-۱۴۰۵-۰۲۷»
 * همهٔ نام‌ها و فیلدها عین سند هستند. دو قفل ابدی در سطح نوع اعمال می‌شود:
 *   قفل ۱ — autoExecute: false (صفر اجرای خودکار)
 *   قفل ۲ — requiresCouncilApproval: true (صفر ترمیم بدون تأیید شورا)
 */

/* ─────────────────────────── §۸.۱ شبکهٔ شواهد ─────────────────────────── */

export interface EvidenceLink {
  id: string;
  type: "file" | "query" | "screenshot" | "log" | "test" | "audit";
  /** مسیر فایل یا URL — هر ادعا حداقل یک شاهد الزامی دارد (قانون شاهد) */
  reference: string;
  /** md5 برای اثبات تغییر نکردن */
  hash?: string;
  capturedAt: string;
  description: string;
}

export function evidenceLink(
  type: EvidenceLink["type"],
  reference: string,
  description: string,
  hash?: string,
): EvidenceLink {
  return {
    id: `ev-${Math.random().toString(36).slice(2, 10)}`,
    type,
    reference,
    hash,
    capturedAt: new Date().toISOString(),
    description,
  };
}

/* ─────────────────────────── §۱.۴ نظام Tier ─────────────────────────── */

export type LearningTier = 0 | 1 | 2 | 3 | 4;

export interface TierProfile {
  tier: LearningTier;
  minOutcomes: number;
  minPeriods: number;
  label: string;
  capabilities: {
    shadowOnly: boolean;
    ownerPersonalization: boolean;
    categoryLearning: boolean;
    weightLearning: boolean;
    fullActivation: boolean;
    /** قفل ابدی: در هیچ Tier مجاز نیست */
    autoExecuteAllowed: false;
  };
}

export const TIER_PROFILES: Record<LearningTier, TierProfile> = {
  0: {
    tier: 0,
    minOutcomes: 0,
    minPeriods: 0,
    label: "سایه (Shadow)",
    capabilities: { shadowOnly: true, ownerPersonalization: false, categoryLearning: false, weightLearning: false, fullActivation: false, autoExecuteAllowed: false },
  },
  1: {
    tier: 1,
    minOutcomes: 10,
    minPeriods: 0,
    label: "شخصی‌سازی مالک",
    capabilities: { shadowOnly: false, ownerPersonalization: true, categoryLearning: false, weightLearning: false, fullActivation: false, autoExecuteAllowed: false },
  },
  2: {
    tier: 2,
    minOutcomes: 20,
    minPeriods: 0,
    label: "دسته‌بندی انواع ملک",
    capabilities: { shadowOnly: false, ownerPersonalization: true, categoryLearning: true, weightLearning: false, fullActivation: false, autoExecuteAllowed: false },
  },
  3: {
    tier: 3,
    minOutcomes: 50,
    minPeriods: 0,
    label: "یادگیری وزن‌ها",
    capabilities: { shadowOnly: false, ownerPersonalization: true, categoryLearning: true, weightLearning: true, fullActivation: false, autoExecuteAllowed: false },
  },
  4: {
    tier: 4,
    minOutcomes: 70,
    minPeriods: 3,
    label: "فعال‌سازی کامل (بدون auto)",
    capabilities: { shadowOnly: false, ownerPersonalization: true, categoryLearning: true, weightLearning: true, fullActivation: true, autoExecuteAllowed: false },
  },
};

/** محاسبهٔ صادقانهٔ Tier از دادهٔ واقعی: تعداد پیامد + تعداد دورهٔ متمایز */
export function computeTier(linkedOutcomes: number, distinctPeriods: number): LearningTier {
  if (linkedOutcomes >= 70 && distinctPeriods >= 3) return 4;
  if (linkedOutcomes >= 50) return 3;
  if (linkedOutcomes >= 20) return 2;
  if (linkedOutcomes >= 10) return 1;
  return 0;
}

export function tierProfile(tier: LearningTier): TierProfile {
  return TIER_PROFILES[tier];
}

/* ─────────────────────────── §۲ PHASE 7 ─────────────────────────── */

/**
 * P6545/گام۳ (BLOCK 3.5) — افزودنی: پیامد معامله برای مدل melka-transaction-v2.
 * افزودنی type-only؛ صفر تغییر در موتورها (BLOCK G-6).
 */
export type PredictionType = "listing_deal" | "request_match" | "expert_performance" | "transaction_success" | "match_accept";
export type OutcomeResolution = "success" | "failure" | "cancelled" | "pending";

/** §۲.۲.۱ — قرارداد OutcomeRecord */
export interface OutcomeRecord {
  id: string;
  predictionId: string;
  predictionType: PredictionType;
  predictedAt: string;
  predictedValue: number;
  observedAt: string;
  observedValue: number;
  timeWindowDays: number;
  resolution: OutcomeResolution;
  rawPayloadJson: string;
  evidenceChain: EvidenceLink[];
  tierAtObservation: LearningTier;
  tenantId?: string;
  extractionBatchId: string;
  extractedAt: string;
}

/** §۲.۲.۲ — قرارداد EvaluationReport */
export interface CalibrationBucket {
  bucket: string;
  predicted: number;
  observed: number;
  count: number;
}

export type EvaluationVerdict = "better" | "equal" | "worse";

export interface EvaluationReport {
  id: string;
  modelId: string;
  evaluatedAt: string;
  window: { from: string; to: string };
  sampleSize: number;
  metrics: {
    brierScore: number;
    logLoss: number;
    accuracy: number;
    calibration: CalibrationBucket[];
    lift: number;
    ece: number;
  };
  baseline: { modelId: string; brierScore: number };
  verdict: EvaluationVerdict;
  rationale: string;
  tier: LearningTier;
}

/** §۲.۲.۳ — قرارداد LearningPolicy */
export type LearningStrategy = "online" | "batch" | "hybrid";
export type LearningPolicyStatus = "proposed" | "active_for_owner" | "active_for_learning" | "active_full" | "retired";

export interface LearningPolicy {
  id: string;
  modelId: string;
  version: string;
  strategy: LearningStrategy;
  learningRate: number;
  updateWindowDays: number;
  minSamplesPerUpdate: number;
  driftThreshold: number;
  status: LearningPolicyStatus;
  requiresTier: LearningTier;
  approvedBy?: string;
  approvedAt?: string;
  activeFrom?: string;
  activeUntil?: string;
  evidenceChain: EvidenceLink[];
  rollbackTo?: string;
}

/** §۲.۲.۴ — قرارداد DriftReport */
export type DriftType = "data" | "concept" | "performance";
export type DriftAction = "monitor" | "retrain" | "alert" | "escalate";

export interface DriftReport {
  id: string;
  modelId: string;
  detectedAt: string;
  driftType: DriftType;
  magnitude: number;
  affectedFeatures: string[];
  baselineWindow: { from: string; to: string };
  recentWindow: { from: string; to: string };
  action: DriftAction;
  rationale: string;
  evidenceChain: EvidenceLink[];
}

/** §۲.۴ — Shadow Evaluation Framework */
export interface ShadowEvaluation {
  primaryModelId: string;
  shadowModelId: string;
  startedAt: string;
  minSamples: number;
  minWindowDays: number;
  currentReport?: EvaluationReport;
  verdict?: "promote" | "keep_primary" | "reject";
}

/* ─────────────────────────── §۳ PHASE 8 ─────────────────────────── */

export type DecisionType =
  | "wait"
  | "investigate"
  | "contact_owner"
  | "assign_expert"
  | "adjust_price"
  | "schedule_visit"
  | "priority_action";

export interface DecisionAlternative {
  action: string;
  whyRejected: string;
  expectedValue: number;
}

/** §۳.۲.۱ — قرارداد DecisionRecord (دو قفل نوعی) */
export interface DecisionRecord {
  id: string;
  predictionId: string;
  decisionType: DecisionType;
  proposedAction: string;
  confidence: number;
  rationale: string;
  alternatives: DecisionAlternative[];
  expectedOutcome: string;
  requiredResources: string[];
  requiresApproval: true;
  autoExecute: false;
  safetyChecked: boolean;
  safetyReport: SafetyReport;
  personalizedFor?: string;
  category?: string;
  learnedWeights?: Record<string, number>;
  createdAt: string;
  expiresAt: string;
  tierAtCreation: LearningTier;
}

export interface SafetyReport {
  decisionId?: string;
  passed: boolean;
  blockedBy: string[];
  warnings: string[];
  checkedRules: string[];
  checkedAt: string;
}

/** §۳.۲.۲ — قرارداد ActionPlan (قفل نوعی autoExecute: false) */
export interface ActionStep {
  order: number;
  action: string;
  owner: "owner" | "consultant" | "system";
  estimatedMinutes: number;
  dependencies: number[];
}

export interface ActionPlan {
  id: string;
  decisionId: string;
  steps: ActionStep[];
  estimatedDurationMinutes: number;
  riskLevel: "low" | "medium" | "high";
  rollbackPlan?: string;
  autoExecute: false;
}

/** §۳.۲.۳ — قرارداد SafetyPolicy */
export type SafetySeverity = "block" | "warn" | "audit";
export type SafetyMode = "strict" | "normal" | "audit";
export type SafetyFailBehavior = "block" | "warn" | "log";

export interface SafetyCheckResult {
  ruleId: string;
  passed: boolean;
  severity: SafetySeverity;
  message: string;
}

export interface SafetyRule {
  id: string;
  description: string;
  appliesTo: DecisionType[];
  severity: SafetySeverity;
}

export interface SafetyPolicy {
  id: string;
  rules: SafetyRule[];
  mode: SafetyMode;
  failBehavior: SafetyFailBehavior;
}

/* ─────────────────────────── §۴ PHASE 9 ─────────────────────────── */

/** §۴.۲.۱ — قرارداد PolicyEvaluation */
export type PolicyType = "learning" | "governance" | "safety" | "tier";
export type PolicyVerdict = "keep" | "adjust" | "retire";

export interface PolicyEvaluation {
  id: string;
  policyId: string;
  policyType: PolicyType;
  evaluatedAt: string;
  window: { from: string; to: string };
  metrics: {
    effectiveness: number;
    stability: number;
    compliance: number;
    costImpact: number;
    sideEffects: string[];
  };
  verdict: PolicyVerdict;
  rationale: string;
  recommendedChanges?: string[];
  tier: LearningTier;
  evidenceChain: EvidenceLink[];
}

/** §۴.۲.۲ — قرارداد GovernancePolicy */
export type GovernanceScope = "data" | "model" | "access" | "decision" | "repair";
export type GovernanceEnforcement = "strict" | "warn" | "audit-only";

export interface GovernanceCheckResult {
  ruleId: string;
  passed: boolean;
  severity: "critical" | "high" | "medium" | "low";
  details: string;
}

export interface GovernanceRule {
  id: string;
  scope: GovernanceScope;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
}

export interface GovernancePolicy {
  id: string;
  scope: GovernanceScope;
  rules: GovernanceRule[];
  enforcement: GovernanceEnforcement;
  updatedAt: string;
  updatedBy: string;
  evidenceChain: EvidenceLink[];
}

/* ─────────────────────────── §۵ PHASE 10 ─────────────────────────── */

export interface DiagnosticCheck {
  id: string;
  name: string;
  category: "data" | "model" | "engine" | "security" | "governance";
  status: "pass" | "warn" | "fail";
  details: string;
  metric?: number;
  threshold?: number;
  suggestion?: string;
}

export interface Warning {
  id: string;
  checkId: string;
  message: string;
}

export interface CriticalAlert {
  id: string;
  checkId: string;
  message: string;
  reportedAt: string;
}

export interface RecommendedAction {
  id: string;
  checkId: string;
  action: string;
  rationale: string;
}

/** §۵.۲.۱ — قرارداد DiagnosticReport */
export interface DiagnosticReport {
  id: string;
  reportedAt: string;
  systemHealth: "healthy" | "degraded" | "critical";
  checks: DiagnosticCheck[];
  overallScore: number;
  warnings: Warning[];
  criticalAlerts: CriticalAlert[];
  recommendations: RecommendedAction[];
  tier: LearningTier;
  evidenceChain: EvidenceLink[];
}

/* ─────────────────────────── §۶ PHASE 11 ─────────────────────────── */

export type RepairActionType =
  | "reindex"
  | "recalibrate"
  | "retrain"
  | "prune_sessions"
  | "restore_backup"
  | "update_threshold"
  | "custom";

export interface RepairAction {
  type: RepairActionType;
  parameters: Record<string, unknown>;
  estimatedDurationMinutes: number;
}

export interface RiskAssessment {
  level: "low" | "medium" | "high";
  probability: number;
  impact: number;
  mitigation: string;
}

export type RepairStatus = "pending" | "approved" | "rejected" | "executed" | "rolled_back";

/** §۶.۲.۱ — قرارداد RepairProposal (قفل نوعی شورا) */
export interface RepairProposal {
  id: string;
  detectedIssue: string;
  sourceCheckId: string;
  severity: "low" | "medium" | "high" | "critical";
  proposedAction: RepairAction;
  rationale: string;
  expectedImpact: string;
  riskAssessment: RiskAssessment;
  rollbackPlan: string;
  requiredTier: LearningTier;
  requiresCouncilApproval: true;
  proposedAt: string;
  status: RepairStatus;
  approvedBy?: string;
  approvedAt?: string;
  executedAt?: string;
  evidenceChain: EvidenceLink[];
}

/** §۶.۲.۲ — قرارداد RepairAuditLog */
export interface RepairAuditLog {
  id: string;
  proposalId: string;
  action: "proposed" | "approved" | "rejected" | "started" | "completed" | "failed" | "rolled_back";
  performedBy: string;
  performedAt: string;
  beforeState: string;
  afterState: string;
  outcome: string;
  evidenceChain: EvidenceLink[];
}

export interface ApprovalResult {
  proposalId: string;
  approved: boolean;
  reason: string;
  conditionsChecked: { realProblem: boolean; safeSolution: boolean; sufficientTier: boolean };
}
