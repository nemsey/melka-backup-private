/**
 * ایجنت هوشمند پایه (BaseIntelligentAgent) — PHASE 3 / اسکلت
 * ------------------------------------------------------
 * فرزند BaseLearningAgent با ۱۱ «جای موتور» (interface خالص).
 *
 * قواعد سازگاری عقب‌وار (سند طراحی بخش ۱):
 *  - هر متد BaseLearningAgent (renderInsights، submitFeedback، rollbackPolicy،
 *    learningStats و…) بدون هیچ تغییری در دسترس می‌ماند.
 *  - سازنده علاوه بر deps والد، engineDeps اختیاری می‌گیرد؛ بدون آن،
 *    همه موتورها به fallback رفتار والد برمی‌گردند.
 *  - BaseLearningAgent هرگز حذف یا تغییر نمی‌کند (قانون حفاظت فاز).
 *
 * ⚠️ اعلام صادقانه (قانون H): این کلاس در PHASE 3 «بدون منطق جدید» است —
 * هیچ مسیر خروجی‌ای موتورها را فراخوانی نمی‌کند. مصرف موتورها از PHASE 4
 * با پیاده‌سازی بدنه‌ها آغاز می‌شود. هیچ ادعای «هوشمند شدن» تا آن زمان معتبر نیست.
 */

import { BaseLearningAgent } from "@/core/agent/base-agent";
import type { AgentMemoryRepository, PolicyRepository } from "@/core/repositories";
import { createDefaultEngineDeps, type EngineDeps } from "./engine-deps";

/** گزینه‌های سازنده BaseIntelligentAgent */
export interface BaseIntelligentAgentOptions {
  /** شناسه ایجنت برای زمینه موتورها (اختیاری؛ tileId انتزاعی مرجع است) */
  agentId?: string;
  /** ظرف موتورهای تزریقی — نبود = fallback کامل به رفتار BaseLearningAgent */
  engines?: EngineDeps;
  /** وابستگی‌های انبار والد — سازگاری عقب‌وار */
  memory?: AgentMemoryRepository;
  policy?: PolicyRepository;
}

export abstract class BaseIntelligentAgent extends BaseLearningAgent {
  /** موتورهای تزریق‌شده — مصرف از PHASE 4؛ در PHASE 3 فقط ساخت‌پذیری/قابل-mock بودن */
  protected readonly engines: EngineDeps;

  /** شناسه اختیاری ایجنت — برای زمینه موتورها در فازهای بعد (عمومی و فقط-خواندنی: داده توصیفی) */
  readonly intelligentAgentId: string | null;

  constructor(options?: BaseIntelligentAgentOptions) {
    // سازگاری بایت‌به‌بایت: بدون گزینه‌های انبار، عیناً مانند super() امروزی
    super(
      options && (options.memory !== undefined || options.policy !== undefined)
        ? { memory: options.memory, policy: options.policy }
        : undefined,
    );
    this.intelligentAgentId = options?.agentId ?? null;
    this.engines = options?.engines ?? createDefaultEngineDeps();
  }

  /** نمای فقط-خواندنی موتورهای تزریق‌شده — برای تست و فازهای بعد */
  get injectedEngines(): Readonly<Partial<EngineDeps>> {
    return this.engines;
  }
}
