/**
 * قرارداد موتور حافظه (MemoryEngine) — PHASE 3 / interface خالص
 * ------------------------------------------------------
 * مسئولیت: لایه‌بندی حافظه (۶ لایه طبق معماری هدف ممیزی PHASE 0:
 * عامل/اپیزودیک/معنایی/رویه‌ای/نهادی/جهانی) به‌جای جریان امروز
 * «یک جدول همه‌کاره». خواندن/نوشتن رویدادها و بازخوردها با نسخه‌بندی.
 *
 * مرز (قوانین اجرایی):
 *  - فقط افزودنی (append-only) — هرگز به‌روزرسانی/حذف.
 *  - نگاشت به جدول AgentMemory موجود از طریق AgentMemoryRepository تزریقی.
 *  - بدون Migration — لایه در PHASE 3 فیلد منطقی است (نگاشت پیش‌فرض: همه → AGENT).
 *
 * نسخه قرارداد: 1.
 * فاز پیاده‌سازی بدنه: PHASE 4. در PHASE 3: fallback کامل به رفتار BaseLearningAgent.
 */

export type MemoryLayer =
  | "AGENT"
  | "EPISODIC"
  | "SEMANTIC"
  | "PROCEDURAL"
  | "INSTITUTIONAL"
  | "GLOBAL";

export interface MemoryQuery {
  tileId: string;
  layer?: MemoryLayer;
  kinds?: string[];
  /** ISO 8601 — فقط ورودی‌های پس از این زمان */
  since?: string;
  take?: number;
}

export interface MemoryAppend {
  tileId: string;
  layer: MemoryLayer;
  kind: string;
  payload: Record<string, unknown>;
}

export interface MemoryEntry {
  id: string;
  tileId: string;
  layer: MemoryLayer;
  kind: string;
  text: string;
  /** +1 مثبت | -1 منفی | 0 خنثی — همان قرارداد MemorySnippet امروزی */
  sentiment: number;
  createdAt: string;
}

export interface MemoryEngine {
  readonly contractVersion: 1;
  append(entry: MemoryAppend): Promise<void>;
  query(query: MemoryQuery): Promise<MemoryEntry[]>;
}
