/**
 * قرارداد موتور تصمیم (DecisionEngine) — PHASE 3 / interface خالص
 * ------------------------------------------------------
 * مسئولیت: ترکیب سه منبع — پیش‌بینی (PredictionResult) + قواعد (سیاست فعال
 * و آستانه‌ها) + ایمنی (SafetyEngine) → یک تصمیم قابل‌توضیح با اولویت و
 * سطح اطمینان. جانشین معماری‌پذیرِ «وزن‌دهی بینش» امروزی.
 *
 * مرز (قوانین اجرایی):
 *  - بدون عارضه جانبی — خالص و بازتولیدپذیر.
 *  - هرگز خودش اقدام اجرا نمی‌کند (کار ActionPlanner است).
 *  - پیش از خروجی نهایی، SafetyEngine را برای برچسب requiredApproval مشورت می‌کند.
 *
 * نسخه قرارداد: 1.
 * فاز پیاده‌سازی بدنه: PHASE 6. در P3-03: fallback کامل به مرتب‌سازی
 * وزن سیاست امروزی (renderInsightsInner بدون تغییر).
 */

import type { AgentContext } from "./context";
import type { PredictionResult } from "./prediction";
import type { AgentPolicyContent } from "@/core/agent/policy";
import type { InsightSeverity } from "@/core/agent/base-agent";

export interface DecisionCandidate {
  key: string;
  domain: string;
  severity: InsightSeverity;
  prediction?: PredictionResult;
  metadata?: Record<string, unknown>;
}

export interface DecisionQuery {
  context: AgentContext;
  candidates: DecisionCandidate[];
  policy: AgentPolicyContent;
}

export interface RankedDecision {
  key: string;
  score: number;
  rationale: string;
  requiresApproval: boolean;
}

export interface DecisionResult {
  ranked: RankedDecision[];
  topKey: string;
  appliedRuleIds: string[];
}

export interface DecisionEngine {
  readonly contractVersion: 1;
  decide(query: DecisionQuery): Promise<DecisionResult>;
}
