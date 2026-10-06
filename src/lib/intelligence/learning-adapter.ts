/**
 * آداپتور یادگیری — PHASE 9 / بازسازی فازهای ۷-۸-۹
 * ------------------------------------------------------
 * پل بین مخازن واقعی پروژه (PolicyRepository / AgentFeedback) و درگاه‌های
 * تزریقی LearningEngine — تنها نقطهٔ مجاز نگاشت (لایه lib، گارد P3-06).
 */

import type { PrismaClient } from "@prisma/client";
import type {
  LearningFeedbackSource,
  LearningOutcomeSource,
  LearningPolicyPort,
  LearningEvaluationSummary,
} from "@/core/intelligence/learning/learning-engine";
import type { OutcomeLoopSummary } from "./outcome-loop";

/** دامنهٔ وزن سیاست که ارزیابی معاملات به آن مربوط است (ایجنت M1) */
export const LEARNING_DOMAIN = "VOLUME";

/** ساخت درگاه سیاست از مخزن واقعی (Prisma) */
export function policyPortFromDb(db: PrismaClient): LearningPolicyPort {
  return {
    findActive: async (tileId) => {
      const row = await db.agentPolicyVersion.findFirst({ where: { tileId, active: true }, orderBy: { version: "desc" } });
      if (!row) return null;
      return {
        content: row.content,
        version: row.version,
        activatedAt: row.activatedAt ? row.activatedAt.toISOString() : null,
      };
    },
    findLatest: async (tileId) => {
      const row = await db.agentPolicyVersion.findFirst({ where: { tileId }, orderBy: { version: "desc" } });
      return row ? { version: row.version } : null;
    },
    createVersion: async (input) =>
      db.agentPolicyVersion.create({
        data: {
          tileId: input.tileId,
          version: input.version,
          content: input.content,
          rationale: input.rationale,
          active: input.active,
          activatedAt: input.activatedAt,
        },
      }),
    activateVersion: async (tileId, version) => {
      await db.agentPolicyVersion.updateMany({ where: { tileId, active: true }, data: { active: false } });
      await db.agentPolicyVersion.update({ where: { tileId_version: { tileId, version } }, data: { active: true, activatedAt: new Date() } });
    },
  };
}

/** منبع بازخورد: شمار بازخوردهای ثبت‌شده پس از زمان فعال‌شدن سیاست */
export function feedbackSourceFromDb(db: PrismaClient): LearningFeedbackSource {
  return {
    countSince: async (tileId, sinceIso) => {
      const since = new Date(sinceIso);
      return db.agentFeedback.count({ where: { tileId, createdAt: { gt: since } } });
    },
  };
}

/** منبع پیامد: شمار پیامدهای حلقهٔ سرنوشت (خلاصهٔ زندهٔ مغز) */
export function outcomeSourceFromSummary(getSummary: () => OutcomeLoopSummary | null): LearningOutcomeSource {
  return {
    countSince: async () => {
      const s = getSummary();
      return s ? s.linked : 0;
    },
  };
}

/** خلاصهٔ ارزیابی برای جهت‌دهی وزن (LRN-002) — از گزارش زندهٔ مغز */
export function evaluationSummaryFromLoop(getSummary: () => OutcomeLoopSummary | null): (tileId: string) => Promise<LearningEvaluationSummary | null> {
  return async () => {
    const s = getSummary();
    if (!s) return null;
    return {
      verdict: s.evaluation.verdict,
      domain: LEARNING_DOMAIN,
      sampleSize: s.evaluation.sampleSize,
    };
  };
}
