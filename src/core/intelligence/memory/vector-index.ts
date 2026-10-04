/**
 * نمایه برداری حافظه (VectorIndex) — PHASE 4 / بدنه موتور حافظه
 * ------------------------------------------------------
 * جستجوی شباهت برداری برای موتور حافظه با «تعبیه قطعی آفلاین»:
 *  - تعبیه: hashing trick — توکن‌ization (فاصله/ZWNJ/نقطه‌گذاری) → هش FNV-1a
 *    → سطل → تجمع → نرمال L2. صفر شبکه، صفر وابستگی، کاملاً قطعی.
 *  - شباهت: کسینوسی روی بردارهای نرمال (ضرب داخلی)؛ بردار صفر → ۰ (بدون NaN).
 *  - قابل‌تعویض: تابع تعبیه تزریقی است — فازهای بعد می‌توانند تعبیه واقعی
 *    (مثلاً موتور تعبیه اختصاصی) را بدون تغییر این کلاس جایگزین کنند.
 *
 * مرز: صفر Prisma / صفر @/lib/db / صفر شبکه / صفر React.
 * توجه پیاده‌سازی: کسینوسِ مستقل از cosineSimilarity لایه ایجنت نگه داشته
 * می‌شود (قاعده پل ممیزی: لایه هوشمندی از لایه ایجنت import ارزشی نمی‌کند).
 */

// ===================== توکن‌سازی =====================

/**
 * توکن‌سازی متن — فارسی/لاتین. جداکننده‌ها: فاصله‌ها، ZWNJ (نیم‌فاصله)،
 * نقطه‌گذاری‌ها و ارقام جدا. حروف کوچک (لاتین)؛ ارقام فارسی به لاتین نرمال می‌شوند
 * تا «۳» و «3» هم‌توکن باشند.
 */
export function tokenizeText(text: string): string[] {
  if (!text) return [];
  const normalized = text
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0)) // ارقام فارسی → لاتین
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660)) // ارقام عربی → لاتین
    .toLowerCase();
  return normalized
    .split(/[\s\u200c.,;:!؟?()\[\]{}«»"'\-—–…\/\\|*+=<>~`@#$%^&_]+/)
    .filter((t) => t.length > 0);
}

// ===================== هش و تعبیه =====================

/** هش FNV-1a 32 بیتی — قطعی، سریع، بدون وابستگی */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export type EmbedFn = (text: string) => number[];

/**
 * تعبیه قطعی آفلاین با hashing trick — بردار dims-بعدی نرمال‌شده L2.
 * متن خالی/بی‌توکن → بردار صفر (نرمال نمی‌شود؛ شباهتش با هر چیز ۰ است).
 */
export function embedText(text: string, dims = 64): number[] {
  const vec = new Array<number>(dims).fill(0);
  const tokens = tokenizeText(text);
  if (tokens.length === 0) return vec;
  for (const token of tokens) {
    vec[fnv1a(token) % dims] += 1;
  }
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm === 0) return vec;
  return vec.map((v) => v / norm);
}

/** شباهت کسینوسی — بردارهای صفر → ۰ (مقایسه امن، بدون NaN) */
export function cosineSimilarity(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// ===================== نمایه برداری =====================

export interface VectorHit {
  id: string;
  score: number;
}

export interface VectorIndexOptions {
  /** تابع تعبیه تزریقی — پیش‌فرض: embedText با ۶۴ بعد */
  embed?: EmbedFn;
}

/**
 * نمایه برداری در حافظه — add/remove/search(topK).
 * مرتب‌سازی نزولی پایدار: تساوی امتیاز → ترتیب درج (قدیمی‌تر اول در بین برابرها).
 */
export class VectorIndex {
  private readonly entries: { id: string; embedding: number[] }[] = [];
  private readonly byId = new Map<string, number[]>();
  private readonly embedFn: EmbedFn;

  constructor(options: VectorIndexOptions = {}) {
    this.embedFn = options.embed ?? ((text: string) => embedText(text));
  }

  /** افزودن/جایگزینی بردار یک شناسه */
  add(id: string, embedding: number[]): void {
    if (this.byId.has(id)) {
      const existing = this.entries.find((e) => e.id === id);
      if (existing) existing.embedding = embedding;
    } else {
      this.entries.push({ id, embedding });
    }
    this.byId.set(id, embedding);
  }

  /** حذف شناسه از نمایه (موجود نبودن بی‌خطاست) */
  remove(id: string): void {
    const idx = this.entries.findIndex((e) => e.id === id);
    if (idx >= 0) this.entries.splice(idx, 1);
    this.byId.delete(id);
  }

  /** تعداد بردارهای نمایه‌شده */
  get size(): number {
    return this.entries.length;
  }

  /** جستجوی شباهت — topK نتیجه نزولی؛ پرسش بی‌توکن → همه امتیاز ۰ اما مرتب به ترتیب درج */
  search(query: number[], topK = 5): VectorHit[] {
    const k = Math.max(0, Math.floor(topK));
    if (k === 0) return [];
    return this.entries
      .map((e) => ({ id: e.id, score: cosineSimilarity(query, e.embedding) }))
      .sort((x, y) => y.score - x.score)
      .slice(0, k);
  }

  /** پاک‌سازی کامل نمایه */
  clear(): void {
    this.entries.length = 0;
    this.byId.clear();
  }

  /** دسترسی داخلی به تابع تعبیه تزریق‌شده — برای موتور حافظه */
  get embedder(): EmbedFn {
    return this.embedFn;
  }
}
