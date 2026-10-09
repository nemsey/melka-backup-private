/**
 * موتور ۱۴ — پادواقع (Counterfactual Engine) — PN-024 (فاز ۱۳-ب)
 * ---------------------------------------------------------------------------
 * «این آگهی مشخص، اگر قیمتش ۵٪ کمتر بود، احتمال معامله‌اش چه بود؟»
 *
 * سه‌گامی Pearl L3 (سند طراحی فصل ۳):
 *   ۱) Abduction — نویز فردیِ همین مشاهده: e = y_observed − Σβ·f_observed
 *   ۲) Action     — جراحی ساختاری: do(feature = value′)
 *   ۳) Prediction — بازمحاسبه با همان نویز فردی: y′ = Σβ·f′ + e
 *
 * تمایز ساختاری از L2 (موتور ۱۳): نویز فردی «e» بین دنیای واقعی و دنیای
 * خیالی ثابت می‌ماند — پاسخِ «این واحد»، نه «میانگین جمعیت».
 *
 * قیدهای مطلق:
 *   · موتور خالص — صفر وابستگی به DB/fetch/زمان سیستم (قانون ۱۰ سفارش)
 *   · گیت‌های اعتبار fail-loud — صفر سکوت (۵ کد خطا)
 *   · اطمینان = کمینهٔ اطمینان یال‌های مسیر مؤثر (کف گراف ۰٫۶)
 *   · خروجی احتمال در [۰٫۰۱ ، ۰٫۹۹] — قطعیت مطلق ادعا نمی‌شود
 *
 * قرارداد مقیاس (تصمیم مهندسی مستند — گزارش پایانی PN-024):
 *   گراف ۱۳-الف ضرایب همبستگی (استاندارد) ذخیره می‌کند؛ ویژگی‌های پیوسته
 *   باید z-score و باینری‌ها ۰/۱ به موتور داده شوند (سرویس استانداردسازی
 *   می‌کند — موتور خالص و مقیاس-خنثی می‌ماند). این با تفسیر PN-023-A
 *   سازگار است: do(hasImage += ۱) = +۰٫۲۹۳.
 */

import { OUTCOME_NODE, type CausalGraph } from "./causal-engine";

// ─────────────────────────────────────────────────────────────────────────
// قراردادها (سند طراحی فصل ۳.۱)
// ─────────────────────────────────────────────────────────────────────────

/** یک سناریوی پادواقعی: «این واحد مشاهده‌شده اگر X از a به b می‌رفت…» */
export interface CounterfactualQuery {
  /** شناسهٔ/روایت فارسی سناریو */
  scenario: string;
  /** ویژگی مداخله‌شده — باید گره گراف باشد */
  feature: string;
  /** مقدار مشاهده‌شدهٔ واقعی (مبنای abduction) */
  observedValue: number;
  /** مقدار دنیای خیالی */
  counterfactualValue: number;
  /** شاهد واحد: ویژگی‌های همین مشاهده + پیامد واقعی */
  evidence: {
    features: Readonly<Record<string, number>>;
    outcome: number;
  };
}

/** خروجی پادواقع — عین قرارداد سفارش PN-024 §۸.۲ */
export interface Counterfactual {
  scenario: string;
  /** پیامد دنیای واقعی (== evidence.outcome — sanity درونی) */
  baseline: number;
  /** پیامد دنیای خیالی (در [۰٫۰۱ ، ۰٫۹۹]) */
  counterfactual: number;
  /** اثر پادواقعی = counterfactual − baseline */
  delta: number;
  /** اطمینان: کمینهٔ یال‌های مسیر مؤثر */
  confidence: number;
  method: "Pearl-L3";
  /** روایت فارسی الزامی */
  reason: string;
}

/** خطای صریح موتور پادواقع — صفر سکوت */
export class CounterfactualEngineError extends Error {
  constructor(
    readonly code:
      | "CF_EMPTY_GRAPH"
      | "CF_NOT_DAG"
      | "CF_UNKNOWN_FEATURE"
      | "CF_EVIDENCE_MISMATCH"
      | "CF_SAME_VALUE",
    message: string,
  ) {
    super(message);
    this.name = "CounterfactualEngineError";
  }
}

// ─────────────────────────────────────────────────────────────────────────
// دامنهٔ مقادیر (سند طراحی فصل ۵.۴ — پاد از extrapolation)
// ─────────────────────────────────────────────────────────────────────────

/**
 * فقط ویژگی‌های باینری دامنهٔ خام دارند (۰/۱ — عین تفسیر ۱۳-الف).
 * ویژگی‌های پیوسته z-score هستند و دامنهٔ مستقیم ندارند — سقف خروجی
 * (clampProbability) خط نهایی دامنه است (پاد از extrapolation خاموش).
 */
const FEATURE_BOUNDS: Readonly<Record<string, [number, number]>> = {
  hasImage: [0, 1],
};

function clampFeature(name: string, v: number): number {
  const b = FEATURE_BOUNDS[name];
  if (!b) return v; // ویژگی پیوسته (z-score) یا ناشناخته — دست‌نخورده
  return Math.min(b[1], Math.max(b[0], v));
}

/** خروجی احتمال — هیچ‌وقت قطعیت مطلق ادعا نمی‌شود (سند طراحی فصل ۳.۶) */
function clampProbability(v: number): number {
  if (!Number.isFinite(v)) return 0.5;
  return Math.min(0.99, Math.max(0.01, v));
}

// ─────────────────────────────────────────────────────────────────────────
// موتور
// ─────────────────────────────────────────────────────────────────────────

export class CounterfactualEngine {
  /**
   * پرسش پادواقعی — سه‌گامی abduction/action/prediction روی SCM خطی گراف.
   * انتشار درونی: گره‌های میانی (والدِ والدِ … outcome) به ترتیب توپولوژیک
   * featureOrder بازمحاسبه می‌شوند تا اثر غیرمستقیم از مسیرهای زنجیره‌ای عبور کند.
   */
  query(graph: CausalGraph, q: CounterfactualQuery): Counterfactual {
    // ─── گیت‌ها (به ترتیب — صفر سکوت) ───
    if (!graph || graph.nodes.length === 0 || graph.edges.length === 0) {
      throw new CounterfactualEngineError("CF_EMPTY_GRAPH", "گراف علّی خالی است (بدون گره یا بدون یال) — پادواقع بدون مدل تعریف‌نشده است.");
    }
    if (!graph.dagVerified) {
      throw new CounterfactualEngineError("CF_NOT_DAG", "گراف مهر DAG ندارد — مدل ساختاری معتبر نیست.");
    }
    if (!graph.nodes.includes(q.feature)) {
      throw new CounterfactualEngineError("CF_UNKNOWN_FEATURE", `ویژگی «${q.feature}» گره گراف نیست — مداخلهٔ پادواقعی تعریف‌نشده.`);
    }
    if (!(q.feature in q.evidence.features)) {
      throw new CounterfactualEngineError("CF_EVIDENCE_MISMATCH", `شاهد واحد مقدار «${q.feature}» را ندارد — abduction ناممکن است.`);
    }
    if (q.counterfactualValue === q.observedValue) {
      throw new CounterfactualEngineError("CF_SAME_VALUE", `مقدار پادواقعی با مشاهده برابر است («${q.feature}»=${q.observedValue}) — سناریو باید مغایر واقع باشد.`);
    }

    // ─── ۱) Abduction — نویز فردی ───
    const yHat = this.predictOutcome(graph, q.evidence.features);
    const eIndividual = q.evidence.outcome - yHat;

    // ─── ۲) Action — دنیای خیالی + انتشار درونی به ترتیب توپولوژیک ───
    const featuresCf: Record<string, number> = { ...q.evidence.features };
    featuresCf[q.feature] = clampFeature(q.feature, q.counterfactualValue);
    this.propagate(graph, featuresCf, q.feature);

    // ─── ۳) Prediction — با همان نویز فردی ───
    const yCfRaw = this.predictOutcome(graph, featuresCf) + eIndividual;
    const yCf = clampProbability(yCfRaw);
    const baseline = clampProbability(q.evidence.outcome);
    const delta = Math.round((yCf - baseline) * 1e4) / 1e4;

    // ─── اطمینان: کمینهٔ یال‌های مسیر مؤثر feature → outcome ───
    const activeEdges = this.activePathEdges(graph, q.feature);
    const confidence = activeEdges.length === 0 ? 1 : Math.min(...activeEdges.map((ed) => ed.confidence));

    const fmt = (v: number) => v.toFixed(3);
    const reason =
      `سناریو «${q.scenario}»: با نویز فردی ${fmt(eIndividual)}، تغییر ${q.feature} از ${q.observedValue} به ${q.counterfactualValue} ` +
      `پیامد را از ${fmt(baseline)} به ${fmt(yCf)} جابه‌جا می‌کند (Δ=${delta >= 0 ? "+" : ""}${fmt(delta)}) ` +
      `با اطمینان ${confidence.toFixed(2)} از ${activeEdges.length} یال مؤثر — روش Pearl L3.`;

    return { scenario: q.scenario, baseline, counterfactual: yCf, delta, confidence, method: "Pearl-L3", reason };
  }

  /** رتبه‌بندی سناریوها بر |Δ|×اطمینان — «اول چیزی که باید امتحان کنی» */
  rank(graph: CausalGraph, queries: readonly CounterfactualQuery[]): Counterfactual[] {
    const results = queries.map((q) => this.query(graph, q));
    return results
      .map((r, i) => ({ r, i }))
      .sort((a, b) => Math.abs(b.r.delta) * b.r.confidence - Math.abs(a.r.delta) * a.r.confidence || a.i - b.i)
      .map((x) => x.r);
  }

  // ─────────────────────────────────────────────────────────────────────
  // درونی‌های خالص
  // ─────────────────────────────────────────────────────────────────────

  /** پیش‌بینی خطی پیامد از ویژگی‌ها — فقط یال‌های واردشونده به outcome */
  private predictOutcome(graph: CausalGraph, features: Readonly<Record<string, number>>): number {
    let sum = 0;
    for (const e of graph.edges) {
      if (e.to === OUTCOME_NODE && e.from in features) {
        sum += e.coefficient * clampFeature(e.from, features[e.from] as number);
      }
    }
    return sum;
  }

  /**
   * انتشار درونی باحراست از پسماند (جوهرهٔ L3 — فصل ۳.۲-ب ویشه):
   *   f′(n) = f_obs(n) + [S′(n) − S_obs(n)]  که S(n) = Σβ·والدها
   * پسماند فردیِ هر گرهٔ میانی بین دنیای واقعی و خیالی ثابت می‌ماند
   * (نه بازنویسی خاموش)؛ زنجیره‌ها با پیمایش توپولوژیک featureOrder منتشر می‌شوند.
   */
  private propagate(graph: CausalGraph, features: Record<string, number>, changedFeature: string): void {
    const structure = (n: string, f: Record<string, number>): number => {
      let s = 0;
      for (const e of graph.edges) {
        if (e.to === n && e.from in f) s += e.coefficient * clampFeature(e.from, f[e.from] as number);
      }
      return s;
    };
    const order = graph.featureOrder.includes(changedFeature) ? graph.featureOrder : graph.nodes;
    // ۱) ساختارِ مشاهده‌شدهٔ همهٔ گره‌های میانی (پیش از هر تغییر)
    const obsStruct = new Map<string, number>();
    for (const n of order) {
      if (n === changedFeature || n === OUTCOME_NODE) continue;
      if (graph.edges.some((e) => e.to === n) && n in features) obsStruct.set(n, structure(n, features));
    }
    // ۲) پیمایش توپولوژیک: هر گره با والدینِ به‌روز + پسماند فردی خودش
    for (const n of order) {
      if (n === changedFeature || n === OUTCOME_NODE) continue;
      if (!(n in features) || !obsStruct.has(n)) continue;
      const sCf = structure(n, features);
      const sObs = obsStruct.get(n) as number;
      if (sCf !== sObs) features[n] = clampFeature(n, (features[n] as number) + (sCf - sObs));
    }
  }

  /** یال‌های روی مسیر(های) DAG از feature تا outcome (BFS رو به جلو) */
  private activePathEdges(graph: CausalGraph, feature: string) {
    const adj = new Map<string, typeof graph.edges[number][]>();
    for (const e of graph.edges) {
      const list = adj.get(e.from) ?? [];
      list.push(e);
      adj.set(e.from, list);
    }
    const active = new Set<typeof graph.edges[number]>();
    const visited = new Set<string>([feature]);
    const queue: string[] = [feature];
    while (queue.length > 0) {
      const cur = queue.shift() as string;
      for (const e of adj.get(cur) ?? []) {
        active.add(e);
        if (!visited.has(e.to)) {
          visited.add(e.to);
          queue.push(e.to);
        }
      }
    }
    // فقط یال‌هایی که outcome در زیردرخت‌شان است
    return [...active].filter((e) => this.reaches(graph, e.to, OUTCOME_NODE));
  }

  /** آیا از «از» به «تا» در گراف مسیر هست؟ */
  private reaches(graph: CausalGraph, from: string, to: string): boolean {
    if (from === to) return true;
    const adj = new Map<string, string[]>();
    for (const e of graph.edges) {
      const list = adj.get(e.from) ?? [];
      list.push(e.to);
      adj.set(e.from, list);
    }
    const seen = new Set<string>([from]);
    const queue: string[] = [from];
    while (queue.length > 0) {
      const cur = queue.shift() as string;
      if (cur === to) return true;
      for (const nxt of adj.get(cur) ?? []) {
        if (!seen.has(nxt)) {
          seen.add(nxt);
          queue.push(nxt);
        }
      }
    }
    return false;
  }
}
