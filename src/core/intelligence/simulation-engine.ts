/**
 * موتور ۱۵ — شبیه‌سازی (Simulation Engine) — PN-024 (فاز ۱۳-ب)
 * ---------------------------------------------------------------------------
 * «کدام اقدام برای این آگهی مؤثرتر است؟ — آزمون تصمیم پیش از اجرا»
 *
 * سه مدل (سند طراحی فصل ۴):
 *   ۱) مدل داده      — همان SCM گراف علّی (تک‌منبع حقیقت؛ مدل موازی نمی‌سازیم)
 *   ۲) مدل واکنش     — نگاشت اقدام به مداخلهٔ پادواقعی (CounterfactualEngine)
 *   ۳) مدل بازار     — فشار عرضه/تقاضا فقط Δ را تعدیل می‌کند (نه baseline را)
 *
 * 🔴 قانون ۱۱ سفارش — قفل auto_execute (ابدی):
 *   شبیه‌سازی فقط پیشنهاد است؛ صفر اجرای واقعی. نوع autoExecute در سطح
 *   TypeScript literal false است — تلاش برای true خطای کامپایل می‌دهد.
 *
 * قیدهای مطلق:
 *   · موتور خالص — صفر وابستگی به DB/fetch/زمان سیستم
 *   · بدون تولید عدد تصادفی — خوش‌تعریف و deterministic
 *   · سقف تعدیل بازار ۱٫۵× — پرهیز از حساسیت شدید
 *   · هر خروجی reason فارسی دارد (قانون روایت)
 */

import { CounterfactualEngine, type CounterfactualQuery } from "./counterfactual-engine";
import type { CausalGraph } from "./causal-engine";

// ─────────────────────────────────────────────────────────────────────────
// قراردادها (سند طراحی فصل ۴.۲)
// ─────────────────────────────────────────────────────────────────────────

/** اقدام پیشنهادی — هرگز اجرا نمی‌شود (قانون ۱۱) */
export interface SimAction {
  kind: "PRICE_CUT" | "ADD_IMAGE" | "REPOST" | "AGENT_CHANGE";
  /** پارامتر: درصد کاهش قیمت / تعداد عکس / … */
  magnitude: number;
  /** برچسب فارسی */
  label: string;
}

/** زمینهٔ شبیه‌سازی — وضعیت فعلی واحد و بازار
 *  مقیاس: ویژگی‌های پیوسته z-score · باینری ۰/۱ (قرارداد مقیاس موتور ۱۴) */
export interface SimContext {
  /** احتمال معاملهٔ وضع فعلی (از گراف) */
  currentProbability: number;
  /** z-score قیمت‌متر مشاهده‌شده */
  pricePerMeter: number;
  /** عکس فعلی (۰/۱) */
  imageCount: number;
  /** z-score بازدید مشاهده‌شده */
  viewCount: number;
  /** فشار بازار: عرضه/تقاضا — ۱ = متعادل */
  marketPressure: number;
  /** ویژگی‌های کامل شاهد (مقیاس موتور — برای L3) */
  features: Readonly<Record<string, number>>;
  /** جابه‌جایی z برای هر ۱٪ تغییر قیمت = μ/(100σ) — مبدل درصد→z (سرویس می‌دهد) */
  priceZPerPercent?: number;
  /** z-score میانهٔ بازدید بازار (برای REPOST — سرویس می‌دهد) */
  viewMedianZ?: number;
}

export interface SimulationResult {
  action: SimAction;
  /** احتمال معامله در دنیای شبیه‌سازی‌شده */
  simulatedProbability: number;
  /** Δ تعدیل‌شدهٔ بازار نسبت به وضع فعلی */
  delta: number;
  /** ریسک‌های مستند این اقدام */
  risks: string[];
  confidence: number;
  /** همیشه false — قفل auto_execute (قانون ۱۱ ابدی) */
  autoExecute: false;
  reason: string;
}

export interface ComparisonTable {
  baseline: { currentProbability: number; marketPressure: number };
  results: SimulationResult[];
  best: SimulationResult | null;
  recommendation: string;
}

// ─────────────────────────────────────────────────────────────────────────
// ثابت‌ها
// ─────────────────────────────────────────────────────────────────────────

/** سقف تعدیل بازار — فشار دو برابر حداکثر اثر را ۱٫۵ برابر نمی‌کند (فصل ۴.۵) */
const MARKET_ADJUSTMENT_CAP = 1.5;
/** بازهٔ معتبر فشار بازار */
const PRESSURE_BOUNDS: [number, number] = [0.1, 10];

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function clampProbability(v: number): number {
  if (!Number.isFinite(v)) return 0.5;
  return clamp(v, 0.01, 0.99);
}

// ─────────────────────────────────────────────────────────────────────────
// موتور
// ─────────────────────────────────────────────────────────────────────────

export class SimulationEngine {
  private readonly cfEngine = new CounterfactualEngine();

  constructor(private readonly graph: CausalGraph) {}

  /** شبیه‌سازی یک اقدام — از طریق L3 + تعدیل بازار (فصل ۴) */
  simulate(action: SimAction, ctx: SimContext): SimulationResult {
    const pressure = clamp(ctx.marketPressure, PRESSURE_BOUNDS[0], PRESSURE_BOUNDS[1]);
    const mapping = this.mapAction(action, ctx);

    // AGENT_CHANGE: گراف فعلی مسیر علّی ندارد → ادعای صفر + دلیل صادقانه
    if (mapping === null) {
      return {
        action,
        simulatedProbability: clampProbability(ctx.currentProbability),
        delta: 0,
        risks: ["تغییر کارشناس اثر رفتاری خارج از مدل گراف فعلی دارد (اعتماد مشتری)"],
        confidence: 1,
        autoExecute: false,
        reason: `اقدام «${action.label}» در گراف علّی فعلی مسیری به احتمال معامله ندارد — مدل ادعایی نمی‌کند (صداقت ساختاری).`,
      };
    }

    // ADD_IMAGE وقتی عکس هست: اثر ۰→۱ است — delta=۰ صادقانه
    if (mapping.zeroEffect) {
      return {
        action,
        simulatedProbability: clampProbability(ctx.currentProbability),
        delta: 0,
        risks: mapping.risks,
        confidence: 1,
        autoExecute: false,
        reason: `اقدام «${action.label}» بی‌اثر است: اثر ثبت‌شدهٔ گراف برای تصویر انتقال ۰→۱ است و این واحد از قبل عکس دارد (${ctx.imageCount}).`,
      };
    }

    // ─── شبیه‌سازی از طریق L3 (مدل داده + مدل واکنش) ───
    const cf = this.cfEngine.query(this.graph, {
      scenario: mapping.scenario,
      feature: mapping.feature,
      observedValue: mapping.from,
      counterfactualValue: mapping.to,
      evidence: { features: ctx.features, outcome: ctx.currentProbability },
    });

    // ─── مدل بازار: تعدیل فقط delta (نه baseline) — سقف ۱٫۵× ───
    const rawAdj = pressure > 1 ? 1 / Math.sqrt(pressure) : Math.sqrt(1 / pressure);
    const adjustment = clamp(rawAdj, 1 / MARKET_ADJUSTMENT_CAP, MARKET_ADJUSTMENT_CAP);
    const deltaAdj = clamp(cf.delta * adjustment, -0.98, 0.98);
    const simulated = clampProbability(ctx.currentProbability + deltaAdj);

    const fmt = (v: number) => v.toFixed(3);
    const reason =
      `اقدام «${action.label}»: اثر پادواقعی ${cf.delta >= 0 ? "+" : ""}${fmt(cf.delta)} · تعدیل بازار ×${adjustment.toFixed(2)} ` +
      `(فشار ${pressure.toFixed(2)}) ⇒ Δ نهایی ${deltaAdj >= 0 ? "+" : ""}${fmt(deltaAdj)} — احتمال ${fmt(clampProbability(ctx.currentProbability))} → ${fmt(simulated)} · اطمینان ${cf.confidence.toFixed(2)}. ` +
      `پیشنهاد است؛ اجرا با مالک/شوراست (auto_execute=false ابدی).`;

    return {
      action,
      simulatedProbability: simulated,
      delta: deltaAdj,
      risks: mapping.risks,
      confidence: cf.confidence,
      autoExecute: false,
      reason,
    };
  }

  /** مقایسهٔ چند اقدام — جدول مرتب + بهترین + توصیهٔ فارسی */
  compare(actions: readonly SimAction[], ctx: SimContext): ComparisonTable {
    const results = actions
      .map((a, i) => ({ r: this.simulate(a, ctx), i }))
      .sort((x, y) => y.r.delta - x.r.delta || x.i - y.i)
      .map((x) => x.r);
    const best = results.length > 0 && results[0]!.delta > 0 ? results[0]! : null;
    const recommendation = best
      ? `اقدام پیشنهادی اول: «${best.action.label}» (Δ=${best.delta >= 0 ? "+" : ""}${best.delta.toFixed(3)} · اطمینان ${best.confidence.toFixed(2)}) — تصمیم نهایی با مالک/شوراست.`
      : results.length === 0
        ? "هیچ اقدامی برای مقایسه داده نشد."
        : "هیچ اقدامی در این گراف اثر مثبت مستند ندارد — وضع فعلی را حفظ کنید یا گراف را غنی‌تر کنید.";
    return {
      baseline: { currentProbability: ctx.currentProbability, marketPressure: ctx.marketPressure },
      results,
      best,
      recommendation,
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // مدل واکنش — نگاشت اقدام به مداخله (فصل ۴.۴)
  // ─────────────────────────────────────────────────────────────────────

  private mapAction(
    action: SimAction,
    ctx: SimContext,
  ): { feature: string; from: number; to: number; scenario: string; risks: string[]; zeroEffect: boolean } | null {
    switch (action.kind) {
      case "PRICE_CUT": {
        const pct = clamp(action.magnitude, 0.5, 50);
        // مبدل درصد→z: هر ۱٪ قیمت = priceZPerPercent انحراف معیار (μ/100σ)
        const zShift = (ctx.priceZPerPercent ?? 0) * pct;
        const to = ctx.pricePerMeter - zShift;
        if (zShift === 0) {
          return {
            feature: "pricePerMeter",
            from: ctx.pricePerMeter,
            to: ctx.pricePerMeter,
            scenario: `کاهش ${pct}٪ قیمت`,
            risks: ["کاهش قیمت، ادراک ارزش را هم کاهش می‌دهد"],
            zeroEffect: true,
          };
        }
        return {
          feature: "pricePerMeter",
          from: ctx.pricePerMeter,
          to,
          scenario: `کاهش ${pct}٪ قیمت‌متر`,
          risks: [
            "کاهش قیمت، ادراک ارزش را هم کاهش می‌دهد (خریدار انتظار کاهش بیشتر می‌گیرد)",
            "اگر زیر نرخ منطقه برود، سیگنال «فوریت فروش» می‌دهد",
          ],
          zeroEffect: false,
        };
      }
      case "ADD_IMAGE": {
        if (ctx.imageCount > 0) {
          return {
            feature: "hasImage",
            from: 1,
            to: 1,
            scenario: "افزودن عکس",
            risks: ["عکس‌های اضافی بی‌کیفیت، اثر معکوس دارند"],
            zeroEffect: true,
          };
        }
        return {
          feature: "hasImage",
          from: 0,
          to: 1,
          scenario: "افزودن نخستین عکس",
          risks: ["عکس بی‌کیفیت اثر معکوس دارد"],
          zeroEffect: false,
        };
      }
      case "REPOST": {
        const to = Math.max(ctx.viewCount, ctx.viewMedianZ ?? ctx.viewCount);
        if (to === ctx.viewCount) {
          return {
            feature: "viewCount",
            from: ctx.viewCount,
            to: ctx.viewCount,
            scenario: "بازنشر",
            risks: ["تکرار بدون بهبود، اعتماد بازار را می‌فرساید"],
            zeroEffect: true,
          };
        }
        return {
          feature: "viewCount",
          from: ctx.viewCount,
          to,
          scenario: "بازنشر (بازدید به میانهٔ بازار)",
          risks: ["تکرار بدون بهبود واقعی، اعتماد بازار را می‌فرساید", "برچسب «بازنشر» در برخی پلتفرم‌ها رتبه را موقتاً بالا می‌برد و بعد می‌اندازد"],
          zeroEffect: false,
        };
      }
      case "AGENT_CHANGE":
        return null; // بدون یال علّی — صداقت ساختاری
    }
  }
}
