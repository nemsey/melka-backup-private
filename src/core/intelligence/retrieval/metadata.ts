/**
 * قرارداد و منطق متادیتای حافظه — PHASE 5 / P5-02
 * ------------------------------------------------------
 * برگِ کاملاً مستقل (صفر import از لایه هوشمندی) تا جهت وابستگی یک‌سویه بماند:
 *   memory-store → retrieval/metadata (ارزشی: applyMetadataFilter)
 *   retrieval/* → retrieval/metadata
 *
 * قرارداد کامل: docs/METADATA-CONTRACT.md
 *  - MemoryMetadata: متادیتای ساختاری هر حافظه (ذخیره در فیلد موجود metadata — صفر Migration)
 *  - MetadataFilter: فیلتر پیش‌از-جستجو
 *  - resolveMetadata: حل‌کننده با مقادیر پیش‌فرض برای رکوردهای قدیمی
 *    (tileId از بدنه رکورد — منبع حقیقت؛ eventTime=createdAt؛ confidence=importance=0.5؛ source="external")
 *
 * مرز: صفر Prisma / صفر @/lib/db / صفر شبکه / صفر React (ممیزی --strict).
 */

// ===================== انواع قرارداد =====================

/** منبع ثبت حافظه — چهار مقدار مجاز */
export type MemorySource = "user_feedback" | "insight_generated" | "outcome" | "external";

const VALID_SOURCES: readonly MemorySource[] = ["user_feedback", "insight_generated", "outcome", "external"];

/**
 * متادیتای ساختاری هر حافظه — قرارداد PHASE 5 (سند METADATA-CONTRACT بند ۲).
 * کلیدها داخل MemoryRecord.metadata با همین نام‌ها ذخیره می‌شوند.
 */
export interface MemoryMetadata {
  // ---------- شناسه‌ها ----------
  agentId?: string;
  /** فقط اطلاعاتی — منبع حقیقت همیشه record.tileId است (حل‌کننده آن را جایگزین می‌کند) */
  tileId?: string;
  domain?: string;

  // ---------- مکان ----------
  city?: string;
  area?: string;
  district?: string;

  // ---------- ملک ----------
  propertyType?: string;
  tradeType?: string;

  // ---------- زمان ----------
  /** ISO 8601 — زمان منطقی رویداد؛ حل‌شده: createdAt برای رکوردهای قدیمی */
  eventTime: string;

  // ---------- منبع ----------
  source: MemorySource;
  sourceRef?: string;

  // ---------- کیفیت ----------
  confidence: number; // 0..1 — حل‌شده: 0.5
  importance: number; // 0..1 — حل‌شده: 0.5

  // ---------- چند-کاربری (آینده — فعلاً همیشه undefined) ----------
  tenantId?: string;

  // ---------- اعتبار زمانی ----------
  validFrom?: string;
  validUntil?: string;
}

/**
 * فیلتر پیش‌از-جستجو — همه فیلدهای اختیاری؛ نبود = بدون محدودیت آن بعد.
 * تطبیق رشته‌ای پس از نرمال‌سازی فارسی (normalizeForMatch)؛ source دقیق و OR.
 */
export interface MetadataFilter {
  agentId?: string;
  tileId?: string;
  city?: string;
  area?: string;
  propertyType?: string;
  tradeType?: string;
  /** ISO — eventTime حل‌شده >= fromDate */
  fromDate?: string;
  /** ISO — eventTime حل‌شده <= toDate */
  toDate?: string;
  /** confidence حل‌شده >= minConfidence */
  minConfidence?: number;
  /** عضویت OR — آرایه خالی = بدون محدودیت */
  source?: string[];
}

/**
 * حداقل ساختار میزبان متادیتا — ساختاری (structural)، مستقل از MemoryRecord
 * تا این ماژول برگ بماند و جهت وابستگی معکوس نشود.
 */
export interface MetadataHost {
  tileId: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

// ===================== نرمال‌سازی تطبیق =====================

/**
 * نرمال‌سازی «برای مقایسه فیلتر» — ارقام فارسی/عربی → لاتین، ک/ی عربی → فارسی،
 * حذف ZWNJ و همه فاصله‌ها، کوچک‌سازی لاتین. نتیجه: «ائل‌گلی» ⇔ «ائلگلی» ⇔ «ائل گلی»
 * و «ولیعصر» ⇔ «ولی عصر» هم‌ارز می‌شوند — درست برای نام‌های مکان/دامنه/شناسه.
 * (جستجوی کلیدواژه‌ای BM25 نرمال‌سازی غنی‌تر خودش را دارد — این تابع فقط فیلتر است.)
 */
export function normalizeForMatch(value: string): string {
  if (!value) return "";
  return value
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0)) // ارقام فارسی → لاتین
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660)) // ارقام عربی → لاتین
    .replace(/\u0643/g, "\u06a9") // ک عربی → ک فارسی
    .replace(/[\u064A\u0649]/g, "\u06CC") // ی عربی/الف مقصوره → ی فارسی
    .replace(/[\u200B-\u200F\uFEFF]/g, "") // ZWNJ/ZWJ/جهت‌نماها — حذف
    .replace(/\s+/g, "") // همه فاصله‌ها — مقایسه نام‌ها حساس به فاصله نیست
    .toLowerCase();
}

// ===================== حل‌کننده متادیتا =====================

/** برش عدد به بازه [0,1] */
function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** رشته غیرخالی یا undefined */
function str(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim().length > 0) return value;
  return undefined;
}

/** عدد محدود بریده‌شده به [0,1] یا undefined */
function num01(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return undefined;
  return clamp01(n);
}

/**
 * حل متادیتای ساختاری از یک رکورد — با پیش‌فرض‌های خنثی برای رکوردهای قدیمی:
 * رکورد قدیمی نه ارتقا می‌یابد نه حذف می‌شود؛ فقط با فیلترهای صریح سخت‌گیرانه‌تر
 * (مثلاً minConfidence > 0.5 یا agentId مشخص) کنار گذاشته می‌شود.
 */
export function resolveMetadata(record: MetadataHost): MemoryMetadata {
  const raw: Record<string, unknown> = record.metadata ?? {};
  const eventTimeRaw = str(raw.eventTime);
  const eventTime =
    eventTimeRaw !== undefined && !Number.isNaN(Date.parse(eventTimeRaw)) ? eventTimeRaw : record.createdAt;
  const source =
    typeof raw.source === "string" && (VALID_SOURCES as readonly string[]).includes(raw.source)
      ? (raw.source as MemorySource)
      : "external";
  return {
    agentId: str(raw.agentId),
    tileId: record.tileId, // منبع حقیقت — همیشه از بدنه رکورد
    domain: str(raw.domain),
    city: str(raw.city),
    area: str(raw.area),
    district: str(raw.district),
    propertyType: str(raw.propertyType),
    tradeType: str(raw.tradeType),
    eventTime,
    source,
    sourceRef: str(raw.sourceRef),
    confidence: num01(raw.confidence) ?? 0.5,
    importance: num01(raw.importance) ?? 0.5,
    tenantId: str(raw.tenantId),
    validFrom: str(raw.validFrom),
    validUntil: str(raw.validUntil),
  };
}

// ===================== فیلتر =====================

/** تطبیق یک متادیتای حل‌شده با فیلتر — همه قیود موجود باید برقرار باشند (AND) */
export function matchesMetadataFilter(meta: MemoryMetadata, filter: MetadataFilter): boolean {
  if (filter.agentId !== undefined && normalizeForMatch(meta.agentId ?? "") !== normalizeForMatch(filter.agentId)) {
    return false;
  }
  if (filter.tileId !== undefined && normalizeForMatch(meta.tileId ?? "") !== normalizeForMatch(filter.tileId)) {
    return false;
  }
  if (filter.city !== undefined && normalizeForMatch(meta.city ?? "") !== normalizeForMatch(filter.city)) {
    return false;
  }
  if (filter.area !== undefined && normalizeForMatch(meta.area ?? "") !== normalizeForMatch(filter.area)) {
    return false;
  }
  if (
    filter.propertyType !== undefined &&
    normalizeForMatch(meta.propertyType ?? "") !== normalizeForMatch(filter.propertyType)
  ) {
    return false;
  }
  if (
    filter.tradeType !== undefined &&
    normalizeForMatch(meta.tradeType ?? "") !== normalizeForMatch(filter.tradeType)
  ) {
    return false;
  }
  const evMs = Date.parse(meta.eventTime);
  if (filter.fromDate !== undefined) {
    const fromMs = Date.parse(filter.fromDate);
    if (Number.isFinite(fromMs) && evMs < fromMs) return false;
  }
  if (filter.toDate !== undefined) {
    const toMs = Date.parse(filter.toDate);
    if (Number.isFinite(toMs) && evMs > toMs) return false;
  }
  if (
    filter.minConfidence !== undefined &&
    Number.isFinite(filter.minConfidence) &&
    meta.confidence < filter.minConfidence
  ) {
    return false;
  }
  if (filter.source !== undefined && filter.source.length > 0 && !filter.source.includes(meta.source)) {
    return false;
  }
  return true;
}

/**
 * اعمال فیلتر متادیتا روی فهرست رکوردها — خروجی: جدیدترین‌اول بر اساس eventTime
 * حل‌شده (سازگار با ترتیب createdAt-نزولی query موجود)، پایدار روی تساوی.
 */
export function applyMetadataFilter<T extends MetadataHost>(records: T[], filter: MetadataFilter): T[] {
  const kept: { record: T; evMs: number }[] = [];
  for (const record of records) {
    const meta = resolveMetadata(record);
    if (!matchesMetadataFilter(meta, filter)) continue;
    const parsed = Date.parse(meta.eventTime);
    kept.push({ record, evMs: Number.isNaN(parsed) ? 0 : parsed });
  }
  kept.sort((a, b) => b.evMs - a.evMs); // sort پایدار — تساوی: ترتیب ورود
  return kept.map((k) => k.record);
}
