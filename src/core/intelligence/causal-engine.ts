/**
 * موتور ۱۳ — علّیت (Causal Engine) — PN-023-A (فاز ۱۳-الف)
 * ---------------------------------------------------------------------------
 * از «همبستگی» به «علّیت» — سه‌سطحی Pearl (فقط L1 + L2 در این فاز):
 *   L1 (Association): همبستگی Pearson بر جفت‌های مرتب‌شده — گراف یال‌دار
 *   L2 (Intervention): اثر do(X += δ) بر outcome — جمع مسیرهای DAG (مدل خطی SCM)
 *   L3 (Counterfactual): فاز ۱۳-ب — خارج از دامنهٔ این فاز
 *
 * دو گیت حیاتی (قوانین ۷ و سفارش §۳.۲):
 *   ۱) DAG اجباری — اعتبارسنجی Kahn در ساخت، ذخیره و بارگذاری؛ cycle ⇒ خطای فوری
 *   ۲) کف اطمینان ۰٫۶ — یال ضعیف رد می‌شود (قابل‌گواهی، نه قابل‌حذف خاموش)
 *
 * قیدهای مطلق:
 *   · موتور خالص — صفر وابستگی به DB/فایل (ماندگاری: causal-graph-store)
 *   · ترتیب علّی پیشینی (فصل ۶.۳): یال فقط از «جلوتر» به «عقب‌تر» در featureOrder
 *   · سقف ایمن شمارش مسیر (۱۰۰۰) — سرریز = خطای صریح
 */

// ─────────────────────────────────────────────────────────────────────────
// قراردادها (فصل ۵)
// ─────────────────────────────────────────────────────────────────────────

/** یک مشاهده: ویژگی‌های عددی + پیامد */
export interface CausalDataPoint {
  features: Readonly<Record<string, number>>;
  outcome: number;
}

/** یال علّی — ضریب خطی SCM با پروونانس کامل */
export interface CausalEdge {
  from: string;
  to: string;
  /** −۱..+۱ — جهت و اندازهٔ اثر */
  coefficient: number;
  /** ۰..۱ — کف پذیرش ۰٫۶ */
  confidence: number;
  method: "L1" | "L2";
  evidence: string;
}

/** گراف علّی — DAG مهرخورده */
export interface CausalGraph {
  nodes: readonly string[];
  edges: readonly CausalEdge[];
  sampleSize: number;
  builtAt: string;
  dagVerified: boolean;
  /** ترتیب علّی پیشینی استفاده‌شده (فصل ۶.۳) — مستندسازی ضمانت DAG */
  featureOrder: readonly string[];
}

/** اثر مداخلهٔ L2 */
export interface CausalEffect {
  /** ویژگی مداخله‌شده */
  feature: string;
  /** مقدار تغییر (عین ورودی) */
  delta: number;
  /** گره هدف اثر — همیشه outcome در این فاز */
  target: string;
  /** اثر مستقیم (یال X→outcome اگر هست؛ وگرنه ۰) */
  directEffect: number;
  /** اثر کل = δ × Σ ضریب‌های مسیر */
  totalEffect: number;
  /** تعداد مسیر شمارش‌شده */
  paths: number;
  method: "L2";
  evidence: string;
}

/** خطای صریح موتور علّیت — صفر سکوت */
export class CausalEngineError extends Error {
  constructor(
    readonly code: "CAUSAL_CYCLE_DETECTED" | "CAUSAL_PATH_OVERFLOW" | "CAUSAL_UNKNOWN_FEATURE" | "CAUSAL_EMPTY_DATA",
    message: string,
  ) {
    super(message);
    this.name = "CausalEngineError";
  }
}

// ─────────────────────────────────────────────────────────────────────────
// ثابت‌ها و کمکی‌های خالص
// ─────────────────────────────────────────────────────────────────────────

export const OUTCOME_NODE = "outcome";
const DEFAULT_CONFIDENCE_FLOOR = 0.6;
const DEFAULT_MIN_SAMPLES = 10;
/** سقف ایمن شمارش مسیر — سرریز = خطای صریح */
export const MAX_PATHS = 1000;
/** نمونهٔ مرجع برای اشباع اطمینان (N₀ — فصل ۶.۲) */
const CONFIDENCE_N0 = 30;

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** همبستگی Pearson روی جفت‌های کامل (رد سکوت‌آمیز NaN ⇒ null) */
export function pearson(xs: readonly number[], ys: readonly number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  const mx = xs.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const my = ys.slice(0, n).reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i]! - mx;
    const b = ys[i]! - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return null; // واریانس صفر — همبستگی تعریف‌نشده
  const r = num / Math.sqrt(dx * dy);
  if (!Number.isFinite(r)) return null;
  return Math.max(-1, Math.min(1, r));
}

/** اطمینان از آمارهٔ t و اندازهٔ نمونه — فصل ۶.۲ (اشباع نرم در n=۳۰) */
export function confidenceFromStats(r: number, n: number): number {
  const t = Math.abs(r) * Math.sqrt(Math.max(1, n - 2) / Math.max(1e-9, 1 - r * r));
  const tPart = 1 - Math.exp(-t / 3);
  const nPart = Math.sqrt(Math.min(n, CONFIDENCE_N0) / CONFIDENCE_N0);
  return clamp01(tPart * nPart);
}

// ─────────────────────────────────────────────────────────────────────────
// اعتبارسنجی DAG — الگوریتم Kahn (گیت حیاتی ۱ · قانون ۷)
// ─────────────────────────────────────────────────────────────────────────

/**
 * اعتبارسنجی DAG — cycle ⇒ پرتاب CAUSAL_CYCLE_DETECTED با یال‌های درگیر.
 * عمومی: هم برای ساخت گراف، هم ذخیره، هم بارگذاری (تست/گارد).
 */
export function assertDag(nodes: readonly string[], edges: readonly { from: string; to: string }[]): void {
  const present = new Set(nodes);
  for (const e of edges) {
    if (!present.has(e.from)) present.add(e.from);
    if (!present.has(e.to)) present.add(e.to);
  }
  const list = [...present];
  const idx = new Map(list.map((n, i) => [n, i] as const));
  const adj: number[][] = list.map(() => []);
  const indeg = list.map(() => 0);
  for (const e of edges) {
    const a = idx.get(e.from)!;
    const b = idx.get(e.to)!;
    if (a === b) {
      throw new CausalEngineError("CAUSAL_CYCLE_DETECTED", `گراف علّی خود-حلقه دارد: «${e.from}» → خودش — DAG نامعتبر است.`);
    }
    adj[a]!.push(b);
    indeg[b]! += 1;
  }
  // Kahn — صف گره‌های بی-ورودی
  const queue: number[] = [];
  indeg.forEach((d, i) => { if (d === 0) queue.push(i); });
  let processed = 0;
  const removed = [...queue];
  while (queue.length > 0) {
    const u = queue.shift()!;
    processed += 1;
    for (const v of adj[u]!) {
      indeg[v]! -= 1;
      if (indeg[v] === 0) {
        queue.push(v);
        removed.push(v);
      }
    }
  }
  if (processed !== list.length) {
    const cyclic = list.filter((_, i) => indeg[i]! > 0);
    throw new CausalEngineError(
      "CAUSAL_CYCLE_DETECTED",
      `گراف علّی cycle دارد (${cyclic.length} گره در حلقه: ${cyclic.slice(0, 5).join("، ")}${cyclic.length > 5 ? "…" : ""}) — Kahn ${processed}/${list.length} گره پردازش کرد. گراف علّی باید DAG باشد (قانون ۷).`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────
// موتور
// ─────────────────────────────────────────────────────────────────────────

export class CausalEngine {
  private readonly confidenceFloor: number;
  private readonly minSamples: number;

  constructor(opts: { confidenceFloor?: number; minSamples?: number } = {}) {
    this.confidenceFloor = opts.confidenceFloor ?? DEFAULT_CONFIDENCE_FLOOR;
    this.minSamples = opts.minSamples ?? DEFAULT_MIN_SAMPLES;
  }

  /**
   * L1 — ساخت گراف از دادهٔ مشاهده‌ای (فصل ۶.۲-۶.۳).
   * ترتیب علّی پیشینی: featureOrder صریح یا (غیبت ⇒) حروفی + outcome آخر.
   * گیت‌ها: کف اطمینان · Kahn DAG.
   */
  buildGraph(data: readonly CausalDataPoint[], featureOrder?: readonly string[]): CausalGraph {
    if (data.length === 0) {
      throw new CausalEngineError("CAUSAL_EMPTY_DATA", "دادهٔ مشاهده‌ای خالی است — گراف علّی بدون داده ساخته نمی‌شود.");
    }
    // فهرست ویژگی‌های مشترک (در همهٔ نقاط حاضر — جفت کامل)
    const featureSets = data.map((d) => new Set(Object.keys(d.features)));
    const common = [...featureSets[0]!].filter((f) => featureSets.every((s) => s.has(f))).sort();
    if (common.length === 0) {
      throw new CausalEngineError("CAUSAL_EMPTY_DATA", "هیچ ویژگی مشترکی در همهٔ نقاط داده حاضر نیست — همبستگی جفت-کامل ممکن نیست.");
    }
    // ترتیب علّی پیشینی (فصل ۶.۳) — outcome همیشه آخر
    const order = featureOrder && featureOrder.length > 0
      ? [...featureOrder.filter((f) => common.includes(f)), OUTCOME_NODE]
      : [...common, OUTCOME_NODE];
    // اطمینان از کامل بودن ترتیب
    for (const f of common) if (!order.includes(f)) order.push(f);
    if (!order.includes(OUTCOME_NODE)) order.push(OUTCOME_NODE);

    // ستون‌ها
    const col = (name: string): number[] => {
      if (name === OUTCOME_NODE) return data.map((d) => d.outcome);
      return data.map((d) => d.features[name] ?? Number.NaN);
    };
    const validPairs = (a: number[], b: number[]): { xs: number[]; ys: number[] } => {
      const xs: number[] = [];
      const ys: number[] = [];
      for (let i = 0; i < a.length; i++) {
        if (Number.isFinite(a[i]) && Number.isFinite(b[i])) {
          xs.push(a[i]!);
          ys.push(b[i]!);
        }
      }
      return { xs, ys };
    };

    const edges: CausalEdge[] = [];
    const featureCols = new Map(order.map((f) => [f, col(f)] as const));
    // یال فقط از جلوتر → عقب‌تر (ضمانت ساختاری) + Kahn در پایان (گیت دوم)
    for (let i = 0; i < order.length; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const from = order[i]!;
        const to = order[j]!;
        const a = featureCols.get(from)!;
        const b = featureCols.get(to)!;
        const { xs, ys } = validPairs(a, b);
        if (xs.length < this.minSamples) continue; // نمونهٔ ناکافی — بدون یال (نه یال ضعیف)
        const r = pearson(xs, ys);
        if (r === null || Math.abs(r) < 0.05) continue; // همبستگی بی‌معنا/صفر-واریانس
        const confidence = confidenceFromStats(r, xs.length);
        if (confidence < this.confidenceFloor) continue; // گیت کف اطمینان
        edges.push({
          from,
          to,
          coefficient: Math.round(r * 1000) / 1000,
          confidence: Math.round(confidence * 1000) / 1000,
          method: "L1",
          evidence: `Pearson r=${(Math.round(r * 1000) / 1000).toFixed(3)} روی n=${xs.length} جفت کامل — بررسی هم‌بستگی سطح L1 (ترتیب علّی پیشینی ${from}→${to}).`,
        });
      }
    }
    // گیت DAG — قانون ۷ (تضمین دوم؛ نظری ساختاری از ترتیب می‌آید)
    assertDag(order, edges);
    return {
      nodes: order,
      edges,
      sampleSize: data.length,
      builtAt: new Date().toISOString(),
      dagVerified: true,
      featureOrder: order,
    };
  }

  /**
   * L2 — اثر مداخله do(feature += δ) بر outcome (فصل ۶.۴).
   * totalEffect = δ × Σ_مسیرها (Π ضریب‌ها) — مدل خطی SCM با سقف مسیر.
   */
  intervene(graph: CausalGraph, action: { feature: string; delta: number }): CausalEffect {
    const { feature, delta } = action;
    if (!graph.nodes.includes(feature)) {
      throw new CausalEngineError("CAUSAL_UNKNOWN_FEATURE", `ویژگی «${feature}» در گراف حاضر نیست — گره‌ها: ${graph.nodes.slice(0, 6).join("، ")}…`);
    }
    // DAG بودن ورودی را هم می‌گیریم (عمومی — گراف دست-ساز ممکن است بیاید)
    assertDag(graph.nodes, graph.edges);
    // ساخت مجاورت (adjacency) برای پیمایش مسیرها
    const adj = new Map<string, Array<{ to: string; coefficient: number }>>();
    for (const e of graph.edges) {
      if (!adj.has(e.from)) adj.set(e.from, []);
      adj.get(e.from)!.push({ to: e.to, coefficient: e.coefficient });
    }
    // شمارش مسیر با DFS + سقف ایمن
    let paths = 0;
    let pathSum = 0;
    const stack: Array<{ node: string; product: number }> = [{ node: feature, product: 1 }];
    const visit = (node: string, product: number, depth: number): void => {
      if (depth > graph.nodes.length + 1) return; // عمق ایمن (DAG ⇒ عمق ≤ گره‌ها)
      if (node === OUTCOME_NODE) {
        paths += 1;
        pathSum += product;
        if (paths > MAX_PATHS) {
          throw new CausalEngineError("CAUSAL_PATH_OVERFLOW", `شمارش مسیر علّی از سقف ${MAX_PATHS} عبور کرد — گراف بیش‌ازحد متراکم است.`);
        }
        return;
      }
      for (const nxt of adj.get(node) ?? []) {
        visit(nxt.to, product * nxt.coefficient, depth + 1);
      }
    };
    // اجرا (DFS با صریح‌سازی — از feature به outcome)
    for (const nxt of adj.get(feature) ?? []) visit(nxt.to, nxt.coefficient, 1);
    if (paths > MAX_PATHS) {
      throw new CausalEngineError("CAUSAL_PATH_OVERFLOW", `شمارش مسیر علّی از سقف ${MAX_PATHS} عبور کرد.`);
    }
    const direct = graph.edges.find((e) => e.from === feature && e.to === OUTCOME_NODE);
    const directEffect = direct ? direct.coefficient * delta : 0;
    const totalEffect = Math.round(delta * pathSum * 10000) / 10000;
    return {
      feature,
      delta,
      target: OUTCOME_NODE,
      directEffect: Math.round(directEffect * 10000) / 10000,
      totalEffect,
      paths,
      method: "L2",
      evidence: `مداخلهٔ do(${feature} += ${delta}): اثر کل ${totalEffect >= 0 ? "+" : ""}${totalEffect} روی ${OUTCOME_NODE} از ${paths} مسیر (اثر مستقیم ${directEffect >= 0 ? "+" : ""}${directEffect}) — مدل خطی SCM، سطح L2 Pearl.`,
    };
  }

  /** علل یک اثر — یال‌های ورودی، مرتب نزولی بر |ضریب| (فصل ۶.۵) */
  findCause(graph: CausalGraph, effect: string): CausalEdge[] {
    assertDag(graph.nodes, graph.edges);
    return graph.edges
      .filter((e) => e.to === effect)
      .sort((a, b) => Math.abs(b.coefficient) - Math.abs(a.coefficient));
  }
}
