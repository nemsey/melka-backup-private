/**
 * جستجوی کلیدواژه‌ای BM25 با فارسی — PHASE 5 / P5-03
 * ------------------------------------------------------
 * BM25 سبک بدون کتابخانه خارجی + نرمال‌سازی فارسی + نمایه معکوس در-حافظه.
 *
 * راهبرد «دو-شکل» (سند طراحی بند ۳-۵) — حل مسئله چسبیده/جدا:
 *  - شکل جدا: ZWNJ → فاصله؛ «ائل‌گلی» ⇔ [ائل، گلی]
 *  - شکل چسبیده: توکن مرکب = الحاق هر جفت توکن مجاور؛ «ولی عصر» ⇔ +ولیعصر
 *  نتیجه: پرسش «ولیعصر» سندِ «ولی عصر» را می‌یابد و برعکس؛ «ائل‌گلی» با
 *  «ائلگلی» و «ائل گلی» هم‌توکن می‌شود — دوطرفه.
 *  توکن‌های مرکب فقط در postings حضور دارند؛ طول سند (|D|) و avgdl فقط با
 *  توکن‌های اصلی محاسبه می‌شوند تا آمار BM25 واقعی بماند.
 *
 * نرمال‌سازی: ارقام فارسی/عربی → لاتین · ک/ی عربی → فارسی · حذف اعراب ·
 * حذف علائم سجاوندی · کوچک‌سازی لاتین · ZWNJ → فاصله.
 * پیشوندهای معمول (بر/می/نمی) «حفظ» می‌شوند — هیچ پیشوندی حذف نمی‌شود و
 * این سه در فهرست stopword نیستند (قاعده حفظ پیشوندها).
 *
 * فرمول: IDF(t) = ln(1 + (N − df + 0.5)/(df + 0.5)) — همیشه مثبت؛
 *  score(D,Q) = Σ_t IDF·(tf·(k1+1))/(tf + k1·(1 − b + b·|D|/avgdl))
 *
 * مرز: صفر Prisma / صفر @/lib/db / صفر شبکه / صفر React (ممیزی --strict).
 */

// ===================== نرمال‌سازی فارسی =====================

/** علائم سجاوندی و نمادهای جداکننده — به فاصله تبدیل می‌شوند */
const PUNCTUATION = "[.,;:!؟?()\\[\\]{}«»\"'\\-—–…/\\\\|*+=<>~`@#$%^&_؛،٫٬]";

/** نرمال‌سازی متن فارسی/لاتین برای توکن‌سازی BM25 */
export function normalizePersian(text: string): string {
  if (!text) return "";
  return text
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0)) // ارقام فارسی → لاتین
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660)) // ارقام عربی → لاتین
    .replace(/\u0643/g, "\u06a9") // ک عربی → ک فارسی
    .replace(/[\u064A\u0649]/g, "\u06CC") // ی عربی/الف مقصوره → ی فارسی
    .replace(/[\u064B-\u065F\u0670]/g, "") // اعراب و علامت‌های قرآنی — حذف
    .replace(/\u200c/g, " ") // ZWNJ → فاصله (شکل جدا)
    .toLowerCase()
    .replace(new RegExp(PUNCTUATION, "g"), " ");
}

/** فهرست محافظه‌کار stopword فارسی — بر/می/نمی عمداً حذف نیستند (قاعده حفظ پیشوندها) */
export const PERSIAN_STOPWORDS: readonly string[] = [
  "و", "در", "به", "از", "که", "این", "آن", "را", "با", "است", "بود", "برای", "تا", "یا",
];

const STOPWORDS = new Set(PERSIAN_STOPWORDS);

/** خروجی توکن‌سازی دو-شکل */
export interface DualTokens {
  /** توکن‌های اصلی (شکل جدا، بدون stopword) — ملاک طول سند */
  primary: string[];
  /** توکن‌های مرکب (الحاق جفت‌های مجاور از توکن‌های اصلی) — قابلیت تطبیق شکل چسبیده */
  compound: string[];
}

/**
 * توکن‌سازی دو-شکل — از متن نرمال‌شده: توکن‌های اصلی + توکن‌های مرکب.
 * توکن مرکب فقط بین دو توکن محتوایی مجاور ساخته می‌شود (پس از حذف stopword).
 */
export function tokenizeDual(text: string): DualTokens {
  const normalized = normalizePersian(text);
  const primary = normalized
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
  const compound: string[] = [];
  for (let i = 0; i + 1 < primary.length; i++) compound.push(primary[i] + primary[i + 1]);
  return { primary, compound };
}

// ===================== BM25 =====================

export interface BM25Options {
  /** پارامتر اشباع فراوانی واژگانی — پیش‌فرض 1.5 */
  k1?: number;
  /** پارامتر نرمال‌سازی طول سند — پیش‌فرض 0.75 */
  b?: number;
}

export interface KeywordHit {
  id: string;
  score: number;
}

/**
 * جستجوی کلیدواژه‌ای BM25 با نمایه معکوس در-حافظه.
 *  - index/remove/clear — idempotent؛ index مجدد همان شناسه، قبلی را جایگزین می‌کند.
 *  - search — امتیاز نزولی؛ تساوی → ترتیب الفبایی شناسه (قطعی و تکرارپذیر).
 *  - پرسش هم دو-شکل توکنیزه می‌شود (primary + compound) — تطبیق دوطرفه چسبیده/جدا.
 */
export class KeywordSearch {
  private readonly k1: number;
  private readonly b: number;
  /** توکن → (شناسه سند → فراوانی واژگانی) */
  private readonly postings = new Map<string, Map<string, number>>();
  /** شناسه سند → طول سند (فقط توکن‌های اصلی) */
  private readonly docLength = new Map<string, number>();

  constructor(options?: BM25Options) {
    this.k1 = options?.k1 ?? 1.5;
    this.b = options?.b ?? 0.75;
  }

  /** نمایه‌سازی یک سند — idempotent (شناسه تکراری = جایگزینی) */
  index(id: string, text: string): void {
    this.remove(id);
    const { primary, compound } = tokenizeDual(text);
    this.docLength.set(id, primary.length);
    const freq = new Map<string, number>();
    const bump = (token: string) => freq.set(token, (freq.get(token) ?? 0) + 1);
    for (const t of primary) bump(t);
    for (const t of compound) bump(t); // فقط در postings — طول سند را کامل نمی‌کند
    for (const [token, tf] of freq) {
      let posting = this.postings.get(token);
      if (!posting) {
        posting = new Map();
        this.postings.set(token, posting);
      }
      posting.set(id, tf);
    }
  }

  /** جستجو — topK نتیجه امتیاز نزولی؛ پرسش بی‌توکن یا نمایه خالی → [] */
  search(query: string, topK: number): KeywordHit[] {
    const k = Math.max(0, Math.floor(topK));
    if (k === 0) return [];
    const N = this.docLength.size;
    if (N === 0) return [];
    const { primary, compound } = tokenizeDual(query);
    const qTokens = new Set<string>([...primary, ...compound]);
    if (qTokens.size === 0) return [];

    let totalLength = 0;
    for (const len of this.docLength.values()) totalLength += len;
    const avgdl = totalLength / N || 1;

    const scores = new Map<string, number>();
    for (const token of qTokens) {
      const posting = this.postings.get(token);
      if (!posting) continue;
      const df = posting.size;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      for (const [id, tf] of posting) {
        const dl = this.docLength.get(id) ?? 0;
        const denominator = tf + this.k1 * (1 - this.b + (this.b * dl) / avgdl);
        const contribution = idf * ((tf * (this.k1 + 1)) / denominator);
        scores.set(id, (scores.get(id) ?? 0) + contribution);
      }
    }

    return [...scores.entries()]
      .map(([id, score]) => ({ id, score }))
      .sort((x, y) => y.score - x.score || (x.id < y.id ? -1 : 1))
      .slice(0, k);
  }

  /** حذف سند از نمایه (موجود نبودن بی‌خطاست) */
  remove(id: string): void {
    if (!this.docLength.has(id)) return;
    this.docLength.delete(id);
    for (const [token, posting] of this.postings) {
      posting.delete(id);
      if (posting.size === 0) this.postings.delete(token);
    }
  }

  /** پاک‌سازی کامل نمایه */
  clear(): void {
    this.postings.clear();
    this.docLength.clear();
  }

  /** تعداد اسناد نمایه‌شده */
  get size(): number {
    return this.docLength.size;
  }
}
