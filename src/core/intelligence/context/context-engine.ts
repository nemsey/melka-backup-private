/**
 * بدنه موتور زمینه (ContextEngineImpl) — PHASE 4
 * ------------------------------------------------------
 * پیاده‌سازی قرارداد ContextEngine نسخه ۱ (PHASE 3) + قابلیت افزودنی assemble.
 *
 * وفاداری به قرارداد (سند طراحی بند ۲ و ۳-۴):
 *  - buildContext خروجی «دقیقاً» سه فیلد {tileId, generatedAt, purpose} با همان
 *    قطعیت asOf Placeholder می‌دهد — هم‌ارزی شکل با PassthroughContextEngine؛
 *    تعویض موتور زمینه هرگز شکل خروجی قراردادی را عوض نمی‌کند.
 *  - assemble (افزودنی، خارج از قرارداد): مونتاژ «زمینه کاری» برای فازهای بعد —
 *    بازیابی حافظه مرتبط + سیگنال‌های زنده + برش تا بودجه توکن.
 *    در PHASE 4 هیچ مسیر خروجی آن را مصرف نمی‌کند (قانون طلایی ۳).
 *
 * مرز: صفر Prisma / صفر @/lib/db / صفر شبکه / صفر React.
 */

import type { AgentContext, ContextEngine, ContextPurpose, ContextQuery } from "../engines/context";
import type { MemoryEngine, MemoryEntry } from "../engines/memory";

// ===================== گزینه‌ها و انواع افزودنی =====================

export interface ContextEngineOptions {
  /** منبع حافظه تزریقی — نبود یا نبود قابلیت بازیابی = assemble فقط با سیگنال‌ها */
  memory?: ContextMemorySource;
  /** بودجه توکن زمینه کاری — پیش‌فرض ۲۰۴۸ */
  maxContextTokens?: number;
  /** تخمین نویسه به‌ازای هر توکن — پیش‌فرض ۴ */
  charsPerToken?: number;
  /** حداکثر خاطره بازیابی‌شده برای زمینه — پیش‌فرض ۱۰ */
  maxMemories?: number;
}

export interface AssembleOptions {
  /** متن پرسش/تمرکز زمینه — برای بازیابی حافظه مرتبط */
  text?: string;
  /** سیگنال‌های زنده — عیناً و بدون تغییر وارد زمینه می‌شوند */
  signals?: string[];
  /** حداکثر خاطره — پیش‌فرض گزینه موتور */
  topK?: number;
}

/** جداکننده استاندارد بخش‌های زمینه */
export const CONTEXT_SEPARATOR = "\n---\n";

/**
 * قرارداد قابلیت اختیاری «بازیابی شباهت» — جدای قرارداد پایه MemoryEngine.
 * موتور زمینه فقط با این قابلیت کار می‌کند؛ نبودِ آن = زمینه بدون حافظه.
 */
export interface ContextMemoryRetriever {
  retrieveSimilar(tileId: string, text: string, topK?: number): Promise<{ entry: MemoryEntry; score: number }[]>;
}

/** منبع حافظه موتور زمینه — قرارداد v1 + قابلیت اختیاری بازیابی شباهت */
export type ContextMemorySource = MemoryEngine & Partial<ContextMemoryRetriever>;

/** زمینه کاری مونتاژشده — سریال‌پذیر (JSON-safe) طبق قانون خروجی قرارداد */
export interface WorkingContext {
  /** زمینه قراردادی پایه — هم‌ارز buildContext با همان پرسش */
  base: AgentContext;
  /** خاطره‌های بازیابی‌شده مرتبط (به ترتیب نزولی شباهت) */
  memories: MemoryEntry[];
  /** سیگنال‌های زنده — عین ورودی */
  signals: string[];
  /** متن نهایی مونتاژشده — بریده‌شده تا بودجه توکن */
  contextText: string;
  /** تخمین توکن متن نهایی */
  tokenEstimate: number;
  /** بودجه توکن مؤثر */
  budgetTokens: number;
  /** آیا متن به‌دلیل بودجه بریده شد؟ */
  truncated: boolean;
}

/**
 * قرارداد قابلیت اختیاری «مونتاژ زمینه» — جدای قرارداد پایه ContextEngine.
 * مصرف‌کننده‌ای که فقط ContextEngine دارد، درباره این قابلیت چیزی نمی‌داند
 * (duck-typing در BaseIntelligentAgent.assembleContext).
 */
export interface ContextAssembler {
  assemble(query: ContextQuery, options?: AssembleOptions): Promise<WorkingContext>;
}

// ===================== موتور =====================

export class ContextEngineImpl implements ContextEngine, ContextAssembler {
  readonly contractVersion = 1 as const;

  private readonly memory?: ContextMemorySource;
  private readonly maxContextTokens: number;
  private readonly charsPerToken: number;
  private readonly maxMemories: number;

  constructor(options: ContextEngineOptions = {}) {
    this.memory = options.memory;
    this.maxContextTokens = options.maxContextTokens ?? 2048;
    this.charsPerToken = options.charsPerToken ?? 4;
    this.maxMemories = options.maxMemories ?? 10;
  }

  // ---------- متد قرارداد v1 — هم‌ارز شکل با Placeholder ----------

  async buildContext(query: ContextQuery): Promise<AgentContext> {
    const asOf = query.asOf ?? new Date();
    return {
      tileId: query.tileId,
      generatedAt: asOf.toISOString(),
      purpose: query.purpose,
    };
  }

  // ---------- قابلیت افزودنی: مونتاژ زمینه کاری ----------

  async assemble(query: ContextQuery, options: AssembleOptions = {}): Promise<WorkingContext> {
    const base = await this.buildContext(query);

    // ۱) بازیابی حافظه مرتبط — در صورت تزریق منبع دارای قابلیت بازیابی شباهت
    let memories: MemoryEntry[] = [];
    if (this.memory?.retrieveSimilar && options.text && options.text.trim().length > 0) {
      const similar = await this.memory.retrieveSimilar(query.tileId, options.text, options.topK ?? this.maxMemories);
      memories = similar.map((h) => h.entry);
    }

    // ۲) ادغام سیگنال‌های زنده — عیناً و بدون تغییر
    const signals = options.signals ? [...options.signals] : [];

    // ۳) مونتاژ و برش تا بودجه توکن (تخمین خطی: نویسه/۴)
    const parts = [...memories.map((m) => m.text), ...signals];
    const joined = parts.join(CONTEXT_SEPARATOR);
    const budgetTokens = this.maxContextTokens;
    const maxChars = budgetTokens * this.charsPerToken;
    const truncated = joined.length > maxChars;
    const contextText = truncated ? joined.slice(0, maxChars) : joined;

    return {
      base,
      memories,
      signals,
      contextText,
      tokenEstimate: Math.ceil(contextText.length / this.charsPerToken),
      budgetTokens,
      truncated,
    };
  }
}

// ===================== کارخانه =====================

/** کارخانه موتور زمینه — هم‌ارز new ContextEngineImpl(options) */
export function createContextEngine(options: ContextEngineOptions = {}): ContextEngineImpl {
  return new ContextEngineImpl(options);
}
