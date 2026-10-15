/**
 * موتور ۱۲ — توجه (Attention Engine) — PN-023-A (فاز ۱۳-الف)
 * ---------------------------------------------------------------------------
 * «با ۲۷٬۷۷۷ آگهی، کدام ۱۰ مورد ارزش فکر کردن دارند؟»
 *
 * چهار مؤلفهٔ امتیاز (سند طراحی فصل ۳-۴):
 *   تازگی (freshness)    — واپاشی نمایی بر سن رویداد (نیم‌عمر ۴۸h)
 *   اثر بالقوه (impact)  — ارزش مالی × احتمال، نرمال‌شده درون-دسته
 *   تطابق (alignment)    — هم‌پوشانی دامنه‌ها با اولویت مالک
 *   هزینهٔ توجه (cost)   — وارونهٔ هزینهٔ پردازش (ارزان = ۱)
 *
 * قیدهای مطلق:
 *   · موتور خالص — صفر وابستگی به DB/فایل/زمان سیستم (now تزریقی)
 *   · هر خروجی reason فارسی دارد (وعدهٔ سفارش: «۱۰ برتر با دلیل»)
 *   · غیبت فیلد = پیش‌فرض صادقانهٔ مستند (فصل ۴.۵) — نه صفرِ بی‌صدا
 *   · خطای صریح: وزن‌های ناسالم / itemId تکراری ⇒ پرتاب (صفر سکوت)
 */

// ─────────────────────────────────────────────────────────────────────────
// قراردادها (سند طراحی فصل ۳)
// ─────────────────────────────────────────────────────────────────────────

/** مورد قابل-توجه — نگاشت سبک از هر منبع (آگهی، هشدار، فرصت) */
export interface AttentionItem {
  /** شناسهٔ پایدار (کد ملک، شناسهٔ هشدار، …) */
  itemId: string;
  /** زمان رویداد/ثبت — ISO 8601؛ نامعلوم = کهنه-فرض (۰٫۱) */
  occurredAt?: string;
  /** اثر مالی بالقوه — مقیاس دلخواه؛ غیبت = ۰ (بدون ادعا) */
  impactValue?: number;
  /** احتمال وقوع/موفقیت ۰..۱؛ غیبت = ۰٫۵ (بی‌طرف) */
  probability?: number;
  /** دامنه‌ها/برچسب‌ها برای تطابق با اولویت مالک */
  domains?: readonly string[];
  /** هزینهٔ پردازش خام ۰..۱ (۱ = گران‌ترین)؛ غیبت = ۰٫۲ (کمی گران) */
  rawCost?: number;
}

/** اولویت مالک — سیاستِ توجه، جدا از محاسبه (فصل ۸.۳) */
export interface AttentionPriority {
  /** دامنه‌های موردعلاقه (AREA:…, TILE:…, ALERT:…) */
  domains: readonly string[];
  /** وزن تازگی — پیش‌فرض ۰٫۲۵ */
  weightFreshness?: number;
  /** وزن اثر — پیش‌فرض ۰٫۳۵ */
  weightImpact?: number;
  /** وزن تطابق — پیش‌فرض ۰٫۲۵ */
  weightAlignment?: number;
  /** وزن هزینه — پیش‌فرض ۰٫۱۵ */
  weightCost?: number;
  /** مرجع «اکنون» — تزریقی برای تست تعیین‌پذیر */
  now?: Date;
  /** نیم‌عمر تازگی (ساعت) — پیش‌فرض ۴۸ */
  freshnessHalfLifeHours?: number;
}

/** امتیاز نهایی با روایت — reason الزامی (قرارداد فصل ۳.۳) */
export interface AttentionScore {
  itemId: string;
  freshness: number;
  potentialImpact: number;
  alignment: number;
  costFactor: number;
  total: number;
  reason: string;
}

// ─────────────────────────────────────────────────────────────────────────
// پیش‌فرض‌های صادقانه (فصل ۴.۵)
// ─────────────────────────────────────────────────────────────────────────

const DEFAULTS = {
  weightFreshness: 0.25,
  weightImpact: 0.35,
  weightAlignment: 0.25,
  weightCost: 0.15,
  freshnessHalfLifeHours: 48,
  /** غیبت occurredAt — کهنه-فرض محافظه‌کارانه */
  unknownFreshness: 0.1,
  /** غیبت probability — بی‌طرف */
  neutralProbability: 0.5,
  /** غیبت rawCost — کمی گران */
  defaultRawCost: 0.2,
} as const;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** خطای صریح موتور توجه — صفر سکوت */
export class AttentionEngineError extends Error {
  constructor(readonly code: "ATTENTION_WEIGHTS" | "ATTENTION_DUPLICATE_ITEM", message: string) {
    super(message);
    this.name = "AttentionEngineError";
  }
}

// ─────────────────────────────────────────────────────────────────────────
// مؤلفه‌ها (فصل ۴)
// ─────────────────────────────────────────────────────────────────────────

/** واپاشی نمایی: ۲^(−سن‌ساعت / نیم‌عمر) — «امروز»=۱ · «دیروز»≈۰٫۷۱ */
export function computeFreshness(occurredAt: string | undefined, now: Date, halfLifeHours: number): number {
  if (!occurredAt) return DEFAULTS.unknownFreshness;
  const t = new Date(occurredAt).getTime();
  if (!Number.isFinite(t)) return DEFAULTS.unknownFreshness;
  const ageHours = Math.max(0, (now.getTime() - t) / 3_600_000);
  return clamp01(Math.pow(2, -ageHours / Math.max(0.001, halfLifeHours)));
}

/** تطابق: |هم‌پوشانی| / کوچک‌ترین مجموعه — پوشش کامل مجموعهٔ کوچک‌تر = ۱ */
export function computeAlignment(itemDomains: readonly string[] | undefined, priorityDomains: readonly string[]): number {
  if (!itemDomains || itemDomains.length === 0 || priorityDomains.length === 0) return 0;
  const p = new Set(priorityDomains);
  let overlap = 0;
  for (const d of itemDomains) if (p.has(d)) overlap += 1;
  if (overlap === 0) return 0;
  return clamp01(overlap / Math.min(itemDomains.length, priorityDomains.length));
}

/** هزینهٔ توجه: وارونه — ارزان = ۱ */
export function computeCostFactor(rawCost: number | undefined): number {
  return clamp01(1 - clamp01(rawCost ?? DEFAULTS.defaultRawCost));
}

// ─────────────────────────────────────────────────────────────────────────
// موتور
// ─────────────────────────────────────────────────────────────────────────

export class AttentionEngine {
  private readonly priority: Required<Pick<AttentionPriority, "domains">> & AttentionPriority;
  private lastScores: AttentionScore[] = [];

  constructor(priority: AttentionPriority) {
    const wF = priority.weightFreshness ?? DEFAULTS.weightFreshness;
    const wI = priority.weightImpact ?? DEFAULTS.weightImpact;
    const wA = priority.weightAlignment ?? DEFAULTS.weightAlignment;
    const wC = priority.weightCost ?? DEFAULTS.weightCost;
    const sum = wF + wI + wA + wC;
    if (Math.abs(sum - 1) > 0.0001) {
      throw new AttentionEngineError(
        "ATTENTION_WEIGHTS",
        `مجموع وزن‌های توجه باید ۱ باشد (اکنون ${Math.round(sum * 10000) / 10000}) — وزن‌ها: تازگی ${wF} · اثر ${wI} · تطابق ${wA} · هزینه ${wC}.`,
      );
    }
    if (priority.domains === undefined) {
      throw new AttentionEngineError("ATTENTION_WEIGHTS", "فهرست دامنه‌های اولویت الزامی است (حتی خالی).");
    }
    this.priority = { ...priority, domains: [...priority.domains] };
  }

  /** امتیاز کامل همهٔ موارد — بدون برش بودجه (برای تحلیل/تست) */
  scoreAll(items: readonly AttentionItem[]): AttentionScore[] {
    // تکراری بودن itemId = خطای صریح (صفر سکوت)
    const seen = new Set<string>();
    for (const it of items) {
      if (seen.has(it.itemId)) {
        throw new AttentionEngineError("ATTENTION_DUPLICATE_ITEM", `itemId تکراری در ورودی توجه: «${it.itemId}» — هر مورد باید یکتا باشد.`);
      }
      seen.add(it.itemId);
    }
    const now = this.priority.now ?? new Date();
    const halfLife = this.priority.freshnessHalfLifeHours ?? DEFAULTS.freshnessHalfLifeHours;
    // اثر خام برای نرمال‌سازی بیشینهٔ دسته (فصل ۴.۲)
    const rawImpact = items.map((it) => (it.impactValue ?? 0) * clamp01(it.probability ?? DEFAULTS.neutralProbability));
    const maxRaw = Math.max(0, ...rawImpact, 0);
    return items.map((it, i) => {
      const freshness = computeFreshness(it.occurredAt, now, halfLife);
      const potentialImpact = maxRaw > 0 ? clamp01(rawImpact[i]! / maxRaw) : 0;
      const alignment = computeAlignment(it.domains, this.priority.domains);
      const costFactor = computeCostFactor(it.rawCost);
      const wF = this.priority.weightFreshness ?? DEFAULTS.weightFreshness;
      const wI = this.priority.weightImpact ?? DEFAULTS.weightImpact;
      const wA = this.priority.weightAlignment ?? DEFAULTS.weightAlignment;
      const wC = this.priority.weightCost ?? DEFAULTS.weightCost;
      const total = clamp01(wF * freshness + wI * potentialImpact + wA * alignment + wC * costFactor);
      const reason = `مورد ${it.itemId}: تازگی ${freshness.toFixed(2)}${it.occurredAt ? "" : " (زمان نامعلوم — کهنه-فرض)"} · اثر ${potentialImpact.toFixed(2)} · تطابق ${alignment.toFixed(2)} · هزینه ${costFactor.toFixed(2)} — امتیاز کل ${total.toFixed(2)}.`;
      return { itemId: it.itemId, freshness, potentialImpact, alignment, costFactor, total, reason };
    });
  }

  /** رتبه‌بندی نزولی + برش بودجه — بودجه ≤ ۰ = بی‌توجهی برنامه‌ریزی‌شده */
  rank(items: readonly AttentionItem[], budget: number): AttentionScore[] {
    const all = this.scoreAll(items);
    const sorted = [...all].sort((a, b) => b.total - a.total || (a.itemId < b.itemId ? -1 : 1));
    const ranked = sorted.map((s, i) => ({ ...s, reason: `${s.reason} — رتبهٔ ${i + 1} از ${items.length}.` }));
    this.lastScores = ranked;
    if (budget <= 0) return [];
    return ranked.slice(0, Math.floor(budget));
  }

  /** روایت کامل یک مورد — از آخرین rank (بازمحاسقه در نبودش) */
  explain(itemId: string, items?: readonly AttentionItem[]): string {
    const fromLast = this.lastScores.find((s) => s.itemId === itemId);
    if (fromLast) return fromLast.reason;
    if (items && items.length > 0) {
      const s = this.scoreAll(items).find((x) => x.itemId === itemId);
      if (s) return s.reason;
    }
    return `مورد ${itemId} در آخرین رتبه‌بندی توجه حاضر نیست — بدون امتیاز (خارج از ورودی یا زیر بودجه).`;
  }
}
