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
 *
 * PHASE 5 (P5-07): سومین متد «افزودنی» با همان الگوی طلایی:
 *  - assembleCitations(): مونتاژ زمینه با ارجاع — فقط اگر موتور زمینه
 *    «قابلیت assembleWithCitations» داشته باشد (duck-typing)؛ وگرنه null.
 * قانون طلایی ۳ حفظ می‌شود: نبودِ موتور ⇔ رفتار بایت‌به‌بایت PHASE 3؛
 * هیچ مسیر خروجی هیچ‌یک از این متدها را صدا نمی‌زند (صفر مصرف اجباری).
 */

import { BaseLearningAgent } from "@/core/agent/base-agent";
import type { AgentMemoryRepository, PolicyRepository } from "@/core/repositories";
import { createDefaultEngineDeps, type EngineDeps } from "./engine-deps";
import type { ContextEngine, ContextPurpose } from "./engines/context";
import type { MemoryLayer } from "./engines/memory";
import type { PredictionEngine as PredictionEngineV1 } from "./engines/prediction";
import type { AssembleOptions, ContextAssembler, WorkingContext } from "./context/context-engine";
import type {
  AssembleWithCitationsOptions,
  ContextCitationAssembler,
} from "./context/context-engine";
import type { Citation } from "./retrieval/citation-builder";
import type { PredictionRecord, PredictOptions } from "./prediction/prediction-record";
import type { PredictionProducer } from "./prediction/prediction-engine";
import type { PredictionRepository } from "./prediction/prediction-repository";
import type { PropertyFeatureSet } from "./feature/builders/property-features";
import type { MarketFeatureSet } from "./feature/builders/market-features";
import type { CustomerFeatureSet } from "./feature/builders/customer-features";
import type { ExpertFeatureSet } from "./feature/builders/expert-features";

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

  // ---------- PHASE 5 (P5-07): متد افزودنی (خارج از هر مسیر خروجی) ----------

  /**
   * مونتاژ زمینه با ارجاع از موتور زمینه تزریقی — فقط اگر موتور «قابلیت
   * assembleWithCitations» داشته باشد (قرارداد اختیاری ContextCitationAssembler —
   * duck-typing، بدون instanceof):
   *  - بدون موتور یا بدون قابلیت: null (رفتار PHASE 4).
   *  - هدف: در PHASE 6-8 برای «چرا این بینش؟ — منبعش کدام حافظه بود؟».
   * ⚠️ در PHASE 5 هیچ مسیر خروجی این متد را صدا نمی‌زند (قانون طلایی ۳ —
   * صفر مصرف اجباری؛ الگوی P4-06).
   */
  protected async assembleCitations(
    purpose: ContextPurpose,
    options?: AssembleWithCitationsOptions,
  ): Promise<{ context: string; citations: Citation[] } | null> {
    const engine = this.engines.context as
      | (ContextEngine & Partial<ContextCitationAssembler>)
      | undefined;
    if (!engine || typeof engine.assembleWithCitations !== "function") return null;
    const wc = await engine.assembleWithCitations({ tileId: this.tileId, purpose }, options);
    return { context: wc.contextText, citations: wc.citations };
  }

  // ---------- PHASE 6 (P6-06): متد افزودنی چهارم (خارج از هر مسیر خروجی) ----------

  /**
   * پیش‌بینی از موتور پیش‌بینی تزریقی — فقط اگر موتور «قابلیت تولید»
   * داشته باشد (قرارداد اختیاری PredictionProducer — duck-typing):
   *  - بدون موتور یا بدون قابلیت: null (رفتار PHASE 5).
   *  - entityData بسته‌های قراردادی: {property, market} / {customer} /
   *    {expert} / {market} — دامنه MARKET در PHASE 6 predictor ندارد ⇔ null صادقانه.
   *  - محاسبه ⇔ ذخیره در engines.predictionRepository (اختیاری؛ خطای ذخیره
   *    بلعیده می‌شود) ⇔ بازگشت رکورد کامل.
   *  - خطای محاسبه ⇔ null — پیش‌بینی هرگز جریان ایجنت را نمی‌شکند
   *    (الگوی بلع observe در P4-06).
   * ⚠️ در PHASE 6 هیچ مسیر خروجی این متد را صدا نمی‌زند (قانون طلایی ۳ —
   * صفر مصرف اجباری؛ مصرف با تصمیم آگاهانه از PHASE 7-8).
   */
  protected async predict<T extends PredictionRecord>(
    predictionType: "PROPERTY" | "CUSTOMER" | "EXPERT" | "MARKET",
    entityId: string,
    entityData: unknown,
  ): Promise<T | null> {
    const engine = this.engines.prediction as (PredictionEngineV1 & Partial<PredictionProducer>) | undefined;
    if (!engine) return null;
    const context: PredictOptions = { agentId: this.intelligentAgentId ?? "", tileId: this.tileId, entityId };
    try {
      if (predictionType === "PROPERTY") {
        if (typeof engine.predictProperty !== "function") return null;
        const bundle = entityData as { property?: PropertyFeatureSet; market?: MarketFeatureSet };
        if (!bundle?.property || !bundle?.market) return null;
        const record = await engine.predictProperty(bundle.property, bundle.market, context);
        await this.persistPrediction(record);
        return record as T;
      }
      if (predictionType === "CUSTOMER") {
        if (typeof engine.predictCustomer !== "function") return null;
        const bundle = entityData as { customer?: CustomerFeatureSet };
        if (!bundle?.customer) return null;
        const record = await engine.predictCustomer(bundle.customer, context);
        await this.persistPrediction(record);
        return record as T;
      }
      if (predictionType === "EXPERT") {
        if (typeof engine.predictExpert !== "function") return null;
        const bundle = entityData as { expert?: ExpertFeatureSet };
        if (!bundle?.expert) return null;
        const record = await engine.predictExpert(bundle.expert, context);
        await this.persistPrediction(record);
        return record as T;
      }
      // MARKET — predictor در PHASE 6 وجود ندارد (دستور فقط سه predictor خواسته) ⇔ null صادقانه
      return null;
    } catch {
      // پیش‌بینی هرگز نباید جریان اصلی را بشکند — عمداً بی‌صدا
      return null;
    }
  }

  /** ذخیره اختیاری در انبار پیش‌بینی — خطا هرگز رکورد را نمی‌اندازد */
  private async persistPrediction(record: PredictionRecord): Promise<void> {
    const repo = this.engines.predictionRepository;
    if (!repo) return;
    try {
      await repo.save(record);
    } catch {
      // ذخیره اختیاری است — بلع
    }
  }
}
