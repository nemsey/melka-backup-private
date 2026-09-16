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
 *
 * PHASE 4 (سند طراحی PHASE-4-DESIGN بند ۳-۵): دو متد «افزودنی» برای مصرف
 * فازهای بعد — که در PHASE 4 توسط هیچ مسیر خروجی فراخوانی نمی‌شوند:
 *  - observe(): ثبت مشاهده در موتور حافظه تزریقی — fire-and-forget با بلع خطا.
 *  - assembleContext(): مونتاژ زمینه کاری از موتور زمینه دارای قابلیت assemble.
 * قانون طلایی ۳ حفظ می‌شود: نبودِ موتور ⇔ رفتار بایت‌به‌بایت PHASE 3.
 */

import { BaseLearningAgent } from "@/core/agent/base-agent";
import type { AgentMemoryRepository, PolicyRepository } from "@/core/repositories";
import { createDefaultEngineDeps, type EngineDeps } from "./engine-deps";
import type { ContextEngine, ContextPurpose } from "./engines/context";
import type { MemoryLayer } from "./engines/memory";
import type { AssembleOptions, ContextAssembler, WorkingContext } from "./context/context-engine";

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

  // ---------- PHASE 4: متدهای افزودنی (خارج از هر مسیر خروجی) ----------

  /**
   * ثبت مشاهده در موتور حافظه تزریقی — fire-and-forget:
   *  - بدون موتور حافظه: no-op بی‌صدعا (رفتار PHASE 3).
   *  - خطای درگاه: بی‌صدا بلعیده می‌شود — مشاهده هرگز نباید خروجی ایجنت را بشکند.
   *  - tileId مرجع: همین کاشی ایجنت (this.tileId از قرارداد والد).
   * ⚠️ در PHASE 4 هیچ مسیر خروجی این متد را صدا نمی‌زند (قانون طلایی ۳).
   */
  protected async observe(kind: string, payload: Record<string, unknown>, layer: MemoryLayer = "AGENT"): Promise<void> {
    const memory = this.engines.memory;
    if (!memory) return;
    try {
      await memory.append({ tileId: this.tileId, layer, kind, payload });
    } catch {
      // مشاهده نباید هرگز جریان اصلی را بشکند — عمداً بی‌صدا
    }
  }

  /**
   * مونتاژ زمینه کاری از موتور زمینه تزریقی — فقط اگر موتور «قابلیت assemble»
   * داشته باشد (قرارداد اختیاری ContextAssembler — duck-typing، بدون instanceof):
   *  - بدون موتور یا بدون قابلیت: null (رفتار PHASE 3).
   * ⚠️ در PHASE 4 هیچ مسیر خروجی این متد را صدا نمی‌زند (قانون طلایی ۳).
   */
  protected async assembleContext(
    purpose: ContextPurpose,
    options?: AssembleOptions,
  ): Promise<WorkingContext | null> {
    const engine = this.engines.context as (ContextEngine & Partial<ContextAssembler>) | undefined;
    if (!engine || typeof engine.assemble !== "function") return null;
    return engine.assemble({ tileId: this.tileId, purpose }, options);
  }
}
