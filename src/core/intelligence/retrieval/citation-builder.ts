/**
 * سازنده ارجاع (CitationBuilder) — PHASE 5 / P5-06
 * ------------------------------------------------------
 * هر بخش زمینه‌ای که از حافظه می‌آید، ارجاعی قابل‌ردیابی می‌گیرد:
 * شناسه حافظه + ایجنت + منبع + گزیده (۱۰۰ نویسه نخست) + امتیاز ارتباط
 * + مرزهای موقعیت [start, end) در متن زمینه نهایی.
 *
 * ورودی «ساختاری» است (CitableMemory) تا هم از RetrievedItem موتور ترکیبی
 * و هم از مسیر جایگزین retrieveSimilar حافظه (بدون متادیتا) قابل‌ساخت باشد —
 * ماژول فقط به metadata وابسته است (برگ نسبی، بدون چرخه).
 *
 * مرز: صفر Prisma / صفر @/lib/db / صفر شبکه / صفر React (ممیزی --strict).
 */

import { resolveMetadata, type MetadataHost } from "./metadata";

// ===================== انواع =====================

/** ارجاع به یک حافظه درون زمینه — مرزها [start, endExclusive) */
export interface Citation {
  memoryId: string;
  agentId: string;
  source: string;
  snippet: string;
  relevanceScore: number;
  positionInContext: [number, number];
}

/** حداقل ساختار قابل‌ارجاع‌شدن — RetrievedItem.record و مشابه‌های ساده هر دو برآورده می‌کنند */
export interface CitableMemory {
  id: string;
  text: string;
  score: number;
  metadata?: Record<string, unknown>;
}

/** طول گزیده ارجاع — ۱۰۰ نویسه نخست متن */
export const CITATION_SNIPPET_LENGTH = 100;

// ===================== سازنده ارجاع =====================

export class CitationBuilder {
  /** ساخت یک ارجاع — agentId نبود = "" ؛ source حل‌شده با اعتبارسنجی قرارداد (پیش‌فرض external) */
  build(memory: CitableMemory, start: number, end: number): Citation {
    const host: MetadataHost = { tileId: "", createdAt: "", metadata: memory.metadata };
    const meta = resolveMetadata(host);
    return {
      memoryId: memory.id,
      agentId: meta.agentId ?? "",
      source: meta.source,
      snippet: memory.text.slice(0, CITATION_SNIPPET_LENGTH),
      relevanceScore: memory.score,
      positionInContext: [start, end],
    };
  }

  /**
   * ساخت دسته‌ای از فهرست (حافظه، مرزها) — فقط بخش‌هایی که «کاملاً» داخل
   * متن نهایی می‌گنجند ارجاع می‌گیرند (بخش بریده‌شده توسط بودجه توکن حذف).
   */
  buildAll(entries: { memory: CitableMemory; start: number; end: number }[], contextLength: number): Citation[] {
    const out: Citation[] = [];
    for (const e of entries) {
      if (e.end > contextLength) continue; // کاملاً داخل متن نهایی نبود
      out.push(this.build(e.memory, e.start, e.end));
    }
    return out;
  }
}
