/**
 * صادرات واحد موتورها — ۱۱ قرارداد خالص لایه هوشمندی (PHASE 3)
 * ------------------------------------------------------
 * همه نمادها فقط «نوع» (type/interface) هستند — هیچ پیاده‌سازی واقعی
 * در PHASE 3 وجود ندارد (قانون طلایی فاز). فازهای ۴ تا ۸ بدنه‌ها را
 * از همین قراردادها پر می‌کنند.
 */

export type {
  ContextPurpose,
  ContextQuery,
  AgentContext,
  ContextEngine,
} from "./context";

export type {
  MemoryLayer,
  MemoryQuery,
  MemoryAppend,
  MemoryEntry,
  MemoryEngine,
} from "./memory";

export type {
  RetrievalMethod,
  RetrievalQuery,
  RetrievalResult,
  RetrievalEngine,
} from "./retrieval";

export type {
  FeatureQuery,
  FeatureSet,
  FeatureEngine,
} from "./feature";

export type {
  PredictionQuery,
  PredictionResult,
  PredictionEngine,
} from "./prediction";

export type {
  DecisionCandidate,
  DecisionQuery,
  RankedDecision,
  DecisionResult,
  DecisionEngine,
} from "./decision";

export type {
  ActionRiskLevel,
  ActionPlanQuery,
  ActionStep,
  ActionPlan,
  ActionPlannerEngine,
} from "./action-planner";

export type {
  OutcomeRecord,
  OutcomeQuery,
  OutcomeLinkage,
  OutcomeEngine,
} from "./outcome";

export type {
  CalibrationBucket,
  EvaluationVerdict,
  EvaluationQuery,
  EvaluationReport,
  EvaluationEngine,
} from "./evaluation";

export type {
  LearningTrigger,
  LearningQuery,
  LearningResult,
  LearningEngine,
} from "./learning";

export type {
  SafetyProposalKind,
  SafetyRiskLevel,
  SafetyProposal,
  SafetyQuery,
  SafetyVerdict,
  SafetyEngine,
} from "./safety";
