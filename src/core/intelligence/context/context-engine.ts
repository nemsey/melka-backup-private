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
import { CitationBuilder, type Citation, type CitableMemory } from "../retrieval/citation-builder";
import type { RetrievedItem } from "../retrieval/hybrid-retriever";

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

// ===================== PHASE 5 (P5-06): ارجاع/اصل ردیابی =====================

/**
 * قابلیت اختیاری «بازیابی غنی برای زمینه» — آیتم کامل (متادیتا + امتیاز + منابع).
 * پیاده‌سازی طبیعی: آداپتوری روی HybridRetriever (+ Reranker). نبود = همان
 * قابلیت retrieveSimilar منبع حافظه (مسیر PHASE 4 — بدون متادیتا، پیش‌فرض‌های خنثی).
 */
export interface ContextItemRetriever {
  retrieveForContext(tileId: string, text: string, topK?: number): Promise<RetrievedItem[]>;
}

/** گزینه‌های مونتاژ با ارجاع — همان AssembleOptions + منبع غنی اختیاری */
export interface AssembleWithCitationsOptions extends AssembleOptions {
  /** منبع بازیابی غنی (آیتم کامل با متادیتا) — نبود: قابلیت retrieveSimilar حافظه */
  retriever?: ContextItemRetriever;
}

/**
 * قرارداد قابلیت اختیاری «مونتاژ زمینه با ارجاع» — جدای قرارداد پایه ContextEngine.
 * مصرف‌کننده (BaseIntelligentAgent.assembleCitations) با duck-typing بررسی می‌کند؛
 * نبودِ قابلیت = null (رفتار PHASE 4).
 */
export interface ContextCitationAssembler {
  assembleWithCitations(
    query: ContextQuery,
    options?: AssembleWithCitationsOptions,
  ): Promise<WorkingContextWithCitations>;
}

/**
 * زمینه کاری با ارجاع — «گسترش» WorkingContext از طریق وراثت (سند طراحی ۳-۲):
 * فیلدهای موجود دست‌نخورده و شکل خروجی assemble تغییر نمی‌کند؛ نوع جدید
 * فقط خروجی assembleWithCitations است (سازگاری عقب‌وار کامل).
 */
export interface WorkingContextWithCitations extends WorkingContext {
  /** ارجاع‌های بخش‌های حافظه‌ای — فقط بخش‌هایی که کامل داخل متن نهایی‌اند */
  citations: Citation[];
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
  // ---------- PHASE 5 (P5-06): قابلیت افزودنی — مونتاژ با ارجاع ----------

  /**
   * مونتاژ زمینه با ارجاع — همان الگوریتم assemble (ثابت‌ها و جداکننده مشترک)
   * به‌علاوه شمارش آفست بخش‌ها و ساخت Citation برای بخش‌های حافظه‌ای.
   * متد assemble موجود «دست‌نخورده» است — این متد مستقل است و خروجی assemble
   * را بازتولید می‌کند (شاهد: تست هم‌ارزی متن دو مسیر برای همان ورودی).
   */
  async assembleWithCitations(
    query: ContextQuery,
    options: AssembleWithCitationsOptions = {},
  ): Promise<WorkingContextWithCitations> {
    const base = await this.buildContext(query);
    const text = options.text !== undefined && options.text.trim().length > 0 ? options.text : undefined;

    // ۱) بازیابی — منبع غنی (آیتم کامل) یا قابلیت retrieveSimilar حافظه (PHASE 4)
    type ScoredPart = { text: string; score: number; citable: CitableMemory; entry: MemoryEntry };
    const scored: ScoredPart[] = [];
    if (text !== undefined && options.retriever) {
      const items = await options.retriever.retrieveForContext(query.tileId, text, options.topK ?? this.maxMemories);
      for (const item of items) {
        scored.push({
          text: item.record.text,
          score: item.score,
          citable: { id: item.record.id, text: item.record.text, score: item.score, metadata: item.record.metadata },
          entry: {
            id: item.record.id,
            tileId: item.record.tileId,
            layer: item.record.layer,
            kind: item.record.kind,
            text: item.record.text,
            sentiment: item.record.sentiment,
            createdAt: item.record.createdAt,
          },
        });
      }
    } else if (text !== undefined && this.memory?.retrieveSimilar) {
      const similar = await this.memory.retrieveSimilar(query.tileId, text, options.topK ?? this.maxMemories);
      for (const hit of similar) {
        scored.push({
          text: hit.entry.text,
          score: hit.score,
          citable: { id: hit.entry.id, text: hit.entry.text, score: hit.score }, // بدون متادیتا — پیش‌فرض خنثی
          entry: hit.entry,
        });
      }
    }

    // ۲) سیگنال‌های زنده — عیناً و بدون تغییر
    const signals = options.signals ? [...options.signals] : [];

    // ۳) مونتاژ با شمارش آفست + برش بودجه (همان ثابت‌های assemble)
    const budgetTokens = this.maxContextTokens;
    const maxChars = budgetTokens * this.charsPerToken;
    let contextText = "";
    const bounds: { start: number; end: number; memory?: CitableMemory }[] = [];
    const allParts: string[] = [...scored.map((s) => s.text), ...signals];
    for (let i = 0; i < allParts.length; i++) {
      if (i > 0) contextText += CONTEXT_SEPARATOR;
      const start = contextText.length;
      contextText += allParts[i];
      bounds.push({ start, end: contextText.length, memory: i < scored.length ? scored[i].citable : undefined });
    }
    const truncated = contextText.length > maxChars;
    const finalText = truncated ? contextText.slice(0, maxChars) : contextText;

    // ۴) ارجاع‌ها — فقط بخش‌های حافظه‌ای که کامل داخل متن نهایی‌اند
    const citationEntries = bounds
      .filter((b) => b.memory !== undefined)
      .map((b) => ({ memory: b.memory!, start: b.start, end: b.end }));
    const citations = new CitationBuilder().buildAll(citationEntries, finalText.length);

    return {
      base,
      memories: scored.map((s) => s.entry),
      signals,
      contextText: finalText,
      tokenEstimate: Math.ceil(finalText.length / this.charsPerToken),
      budgetTokens,
      truncated,
      citations,
    };
  }
}

// ===================== کارخانه =====================

/** کارخانه موتور زمینه — هم‌ارز new ContextEngineImpl(options) */
export function createContextEngine(options: ContextEngineOptions = {}): ContextEngineImpl {
  return new ContextEngineImpl(options);
}
