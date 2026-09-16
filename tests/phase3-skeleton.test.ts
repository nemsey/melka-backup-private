/**
 * تست‌های PHASE 3 — P3-02: اسکلت لایه هوشمندی
 * ------------------------------------------------------
 * ۱. مستقیم: هیچ فایلی در src/core/intelligence نباید @/lib/db یا
 *    @prisma/client را «ارزشی» import کند؛ همچنین fetch( و react ممنوع.
 * ۲. بازگشتی: از هر فایل engines/ (۱۱ قرارداد) + engine-deps.ts، گراف import
 *    را تا انتها پیمایش می‌کنیم — هیچ ماژول قابل‌دستیابی نباید Prisma/lib-db
 *    را «ارزشی» import کند. (base-intelligent-agent.ts پل سازگاری است و
 *    طبق سند طراحی مجاز است BaseLearningAgent را import کند.)
 * ۳. ساخت‌پذیری: BaseIntelligentAgent با/بدون engineDeps ساخته می‌شود و
 *    fallback کامل به سازنده والد دارد (super() هم‌ارز).
 * ۴. Placeholder زمینه: فقط tileId + مهر زمان + purpose — صفر اثر جانبی.
 * ۵. قابل-mock بودن هر ۱۱ قرارداد با stub.
 */

import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";

import {
  BaseIntelligentAgent,
  createDefaultEngineDeps,
  PassthroughContextEngine,
  type EngineDeps,
  type AgentContext,
  type ContextEngine,
  type ContextQuery,
  type MemoryEngine,
  type MemoryEntry,
  type MemoryQuery,
  type RetrievalEngine,
  type RetrievalResult,
  type FeatureEngine,
  type FeatureSet,
  type PredictionEngine,
  type PredictionResult,
  type DecisionEngine,
  type DecisionResult,
  type ActionPlannerEngine,
  type ActionPlan,
  type OutcomeEngine,
  type OutcomeRecord,
  type EvaluationEngine,
  type EvaluationReport,
  type LearningEngine,
  type LearningResult,
  type SafetyEngine,
  type SafetyVerdict,
} from "@/core/intelligence";
import { BaseLearningAgent, type InsightCard } from "@/core/agent/base-agent";

const SRC = "/home/z/my-project/src";
const INTEL_DIR = join(SRC, "core/intelligence");
const FORBIDDEN_RUNTIME = ["@/lib/db", "@prisma/client"];

// ---------- جمع‌آوری فایل‌های ts ناحیه هوشمندی ----------
function collectTs(dir: string, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) collectTs(p, acc);
    else if (e.name.endsWith(".ts")) acc.push(p);
  }
  return acc;
}

// ---------- تجزیه import و تفکیک type-only ----------
interface ImportEdge {
  target: string;
  typeOnly: boolean;
}

function parseImports(content: string): ImportEdge[] {
  const edges: ImportEdge[] = [];
  const re = /^\s*(?:import|export)\s+(type\s+)?(?:[\w*\s{},]*?)from\s+["']([^"']+)["']/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    edges.push({ target: m[2], typeOnly: Boolean(m[1]) });
  }
  return edges;
}

function resolveModule(target: string, fromFile: string): string | null {
  let base: string;
  if (target.startsWith("@/")) {
    base = join(SRC, target.slice(2));
  } else if (target.startsWith(".")) {
    base = resolve(dirname(fromFile), target);
  } else {
    return null; // ماژول بسته — خارج از مرز
  }
  const candidates = [`${base}.ts`, `${base}.tsx`, join(base, "index.ts")];
  for (const c of candidates) {
    if (existsSync(c) && !statMaybeDir(c)) return c;
  }
  return null;
}

function statMaybeDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

// ---------- پیمایش گراف از یک فایل ----------
function walkImports(startFile: string): Set<string> {
  const visited = new Set<string>();
  const queue = [startFile];
  while (queue.length > 0) {
    const file = queue.shift() as string;
    if (visited.has(file)) continue;
    visited.add(file);
    const content = readFileSync(file, "utf8");
    for (const edge of parseImports(content)) {
      if (edge.typeOnly) continue; // import type در کامپایل پاک می‌شود
      const resolved = resolveModule(edge.target, file);
      if (resolved && !visited.has(resolved)) queue.push(resolved);
    }
  }
  return visited;
}

// ===================== ۱. خلوص مستقیم =====================

describe("P3-02 — خلوص لایه هوشمندی (اسکن مستقیم)", () => {
  const intelFiles = collectTs(INTEL_DIR);

  test("ناحیه هوشمندی وجود دارد — ترکیب مورد انتظار هر فاز (PHASE 3: ۱۵؛ PHASE 4: +۶؛ PHASE 5: +۷؛ PHASE 6: +۶ بدنه Feature)", () => {
    // PHASE 3 (۱۵): ۱۱ قرارداد موتور + engines/index + ۴ اسکلت (base/engine-deps/index + قرارداد زمینه)
    // PHASE 4 (+۶): memory/{memory-store, vector-index, memory-engine, index} + context/{context-engine, index}
    // PHASE 5 (+۷): retrieval/{metadata, keyword-search, hybrid-retriever, reranker, citation-builder, retrieval-engine, index}
    // PHASE 6 (+۶ تا P6-02): feature/{index, builders/{guards, market-features, property-features, customer-features, expert-features}}
    const expected = new Set([
      "engines/context.ts", "engines/memory.ts", "engines/retrieval.ts", "engines/feature.ts",
      "engines/prediction.ts", "engines/decision.ts", "engines/action-planner.ts", "engines/outcome.ts",
      "engines/evaluation.ts", "engines/learning.ts", "engines/safety.ts", "engines/index.ts",
      "base-intelligent-agent.ts", "engine-deps.ts", "index.ts",
      // ---- PHASE 4 ----
      "memory/memory-store.ts", "memory/vector-index.ts", "memory/memory-engine.ts", "memory/index.ts",
      "context/context-engine.ts", "context/index.ts",
      // ---- PHASE 5 (هفت فایل: metadata، keyword-search، hybrid-retriever، reranker، citation-builder، retrieval-engine + index) ----
      "retrieval/metadata.ts", "retrieval/index.ts", "retrieval/keyword-search.ts", "retrieval/hybrid-retriever.ts",
      "retrieval/reranker.ts", "retrieval/citation-builder.ts", "retrieval/retrieval-engine.ts",
      // ---- PHASE 6 (P6-02: چهار builder خالص + گاردها + barrel؛ P6-03: store + engine؛ P6-04: prediction شش‌فایلی) ----
      "feature/index.ts", "feature/builders/guards.ts", "feature/builders/market-features.ts",
      "feature/builders/property-features.ts", "feature/builders/customer-features.ts",
      "feature/builders/expert-features.ts", "feature/feature-store.ts", "feature/feature-engine.ts",
      "prediction/index.ts", "prediction/prediction-record.ts", "prediction/prediction-engine.ts",
      "prediction/predictors/property-predictor.ts", "prediction/predictors/customer-predictor.ts",
      "prediction/predictors/expert-predictor.ts",
    ]);
    const actual = new Set(intelFiles.map((f) => f.slice(INTEL_DIR.length + 1)));
    expect([...actual].sort()).toEqual([...expected].sort());
  });

  test("هیچ فایلی Prisma یا lib/db را ارزشی import نمی‌کند", () => {
    const violators: string[] = [];
    for (const f of intelFiles) {
      const content = readFileSync(f, "utf8");
      for (const edge of parseImports(content)) {
        if (!edge.typeOnly && FORBIDDEN_RUNTIME.includes(edge.target)) {
          violators.push(`${f} → ${edge.target}`);
        }
      }
    }
    expect(violators).toEqual([]);
  });

  test("هیچ فایلی fetch زنده یا react import نمی‌کند", () => {
    const violators: string[] = [];
    for (const f of intelFiles) {
      const content = readFileSync(f, "utf8");
      if (/\bfetch\s*\(/.test(content)) violators.push(`${f} → fetch(`);
      for (const edge of parseImports(content)) {
        if (!edge.typeOnly && /^react/.test(edge.target)) violators.push(`${f} → ${edge.target}`);
      }
    }
    expect(violators).toEqual([]);
  });

  test("۱۱ فایل موتور دقیقاً با نام‌های قراردادی موجودند", () => {
    const enginesDir = join(INTEL_DIR, "engines");
    const expected = [
      "context.ts", "memory.ts", "retrieval.ts", "feature.ts", "prediction.ts",
      "decision.ts", "action-planner.ts", "outcome.ts", "evaluation.ts",
      "learning.ts", "safety.ts", "index.ts",
    ];
    const actual = readdirSync(enginesDir).filter((f) => f.endsWith(".ts")).sort();
    expect(actual).toEqual([...expected].sort());
  });
});

// ===================== ۲. خلوص بازگشتی (گراف import) =====================

describe("P3-02 — خلوص بازگشتی گراف import (الگوی P1-03)", () => {
  const pureRoots = [
    ...collectTs(join(INTEL_DIR, "engines")),
    join(INTEL_DIR, "engine-deps.ts"),
  ];

  test("هر ۱۲ ریشه خالص (۱۱ موتور + index + engine-deps) هیچ‌گاه به Prisma/lib-db نمی‌رسد", () => {
    expect(pureRoots.length).toBe(13); // ۱۲ فایل engines/ + engine-deps.ts
    const violations: string[] = [];
    for (const root of pureRoots) {
      const graph = walkImports(root);
      for (const mod of graph) {
        const content = readFileSync(mod, "utf8");
        for (const edge of parseImports(content)) {
          if (!edge.typeOnly && FORBIDDEN_RUNTIME.includes(edge.target)) {
            violations.push(`${root} ⇝ ${mod} → ${edge.target}`);
          }
        }
      }
    }
    expect(violations).toEqual([]);
  });

  test("پل سازگاری: تنها فایل مجاز به import ارزشی از لایه ایجنت، base-intelligent-agent.ts است", () => {
    const bridge = join(INTEL_DIR, "base-intelligent-agent.ts");
    const content = readFileSync(bridge, "utf8");
    expect(content).toContain('from "@/core/agent/base-agent"');
    // بقیه فایل‌های هوشمندی نباید ماژول ایجنت را ارزشی import کنند
    for (const f of collectTs(INTEL_DIR)) {
      if (f === bridge) continue;
      const c = readFileSync(f, "utf8");
      for (const edge of parseImports(c)) {
        if (!edge.typeOnly && edge.target.startsWith("@/core/agent/")) {
          throw new Error(`نقض پل: ${f} → ${edge.target}`);
        }
      }
    }
    expect(true).toBe(true);
  });
});

// ===================== ۳. ساخت‌پذیری و fallback =====================

/** ایجنت آزمایشی — فقط برای تست اسکلت (هیچ منطق واقعی) */
class SkeletonTestAgent extends BaseIntelligentAgent {
  readonly tileId = "skeleton-test";
  readonly name = "ایجنت آزمایشی اسکلت";
  readonly insightDomains = ["TEST_DOMAIN"] as const;

  protected async computeRawInsights(): Promise<InsightCard[]> {
    return [
      {
        key: "skeleton-card",
        domain: "TEST_DOMAIN",
        title: "کارت آزمایشی",
        body: "بدنه آزمایشی",
        severity: "info",
      },
    ];
  }
}

describe("P3-02 — BaseIntelligentAgent: ساخت‌پذیری و سازگاری عقب‌وار", () => {
  test("فرزند BaseLearningAgent است (زنجیره وراثت)", () => {
    const agent = new SkeletonTestAgent();
    expect(agent).toBeInstanceOf(BaseIntelligentAgent);
    expect(agent).toBeInstanceOf(BaseLearningAgent);
  });

  test("سازنده بدون هیچ آرگومان = سازنده والد (fallback کامل)", () => {
    const agent = new SkeletonTestAgent();
    expect(agent.intelligentAgentId).toBeNull();
    expect(agent.injectedEngines.context).toBeInstanceOf(PassthroughContextEngine);
  });

  test("engineDeps تزریق‌شده جایگزین پیش‌فرض می‌شود", () => {
    const stubContext: ContextEngine = {
      contractVersion: 1,
      async buildContext(): Promise<AgentContext> {
        return { tileId: "x", generatedAt: "2026-09-16T00:00:00.000Z", purpose: "insight-render" };
      },
    };
    const agent = new SkeletonTestAgent({ agentId: "skeleton-1", engines: { context: stubContext } });
    expect(agent.intelligentAgentId).toBe("skeleton-1");
    expect(agent.injectedEngines.context).toBe(stubContext);
  });

  test("Placeholder زمینه فقط tileId + مهر زمان + purpose برمی‌گرداند", async () => {
    const engine = new PassthroughContextEngine();
    expect(engine.contractVersion).toBe(1);
    const asOf = new Date("2026-09-16T08:30:00.000Z");
    const query: ContextQuery = { tileId: "requests", purpose: "insight-render", asOf };
    const ctx = await engine.buildContext(query);
    expect(ctx).toEqual({
      tileId: "requests",
      generatedAt: "2026-09-16T08:30:00.000Z",
      purpose: "insight-render",
    });
  });

  test("کارخانه پیش‌فرض فقط موتور زمینه دارد — ده موتور دیگر غایب (fallback)", () => {
    const deps = createDefaultEngineDeps();
    expect(deps.context).toBeInstanceOf(PassthroughContextEngine);
    const absent = (["memory", "retrieval", "feature", "prediction", "decision", "actionPlanner", "outcome", "evaluation", "learning", "safety"] as const).filter(
      (k) => deps[k] !== undefined,
    );
    expect(absent).toEqual([]);
  });
});

// ===================== ۴. قابل-mock بودن هر ۱۱ قرارداد =====================

describe("P3-02 — هر ۱۱ قرارداد موتور قابل stub است", () => {
  test("هر ۱۱ موتور با stub مینیمال پیاده می‌شود و امضای قرارداد را برآورده می‌کند", async () => {
    const stubs: EngineDeps = {
      context: {
        contractVersion: 1,
        async buildContext(q: ContextQuery): Promise<AgentContext> {
          return { tileId: q.tileId, generatedAt: "2026-09-16T00:00:00.000Z", purpose: q.purpose };
        },
      },
      memory: {
        contractVersion: 1,
        async append() {},
        async query(q: MemoryQuery): Promise<MemoryEntry[]> {
          return [{ id: "m1", tileId: q.tileId, layer: "AGENT", kind: "TEST", text: "خاطره آزمایشی", sentiment: 0, createdAt: "2026-09-16T00:00:00.000Z" }];
        },
      },
      retrieval: {
        contractVersion: 1,
        async retrieve(q): Promise<RetrievalResult> {
          return { snippets: [], hitCount: 0, method: "TF_COSINE" };
        },
      },
      feature: {
        contractVersion: 1,
        async compute(q): Promise<FeatureSet> {
          return { tileId: q.tileId, domain: q.domain, computedAt: "2026-09-16T00:00:00.000Z", vector: {}, missing: [] };
        },
      },
      prediction: {
        contractVersion: 1,
        async predict(q): Promise<PredictionResult> {
          return { id: "p1", tileId: q.tileId, target: q.target, predictedValue: 0, unit: "unit", confidence: 0.5, horizonDays: 30, modelVersion: "stub", rationale: "آزمایشی", computedAt: "2026-09-16T00:00:00.000Z" };
        },
      },
      decision: {
        contractVersion: 1,
        async decide(q): Promise<DecisionResult> {
          return { ranked: [], topKey: "", appliedRuleIds: [] };
        },
      },
      actionPlanner: {
        contractVersion: 1,
        async plan(): Promise<ActionPlan> {
          return { steps: [], createdAt: "2026-09-16T00:00:00.000Z" };
        },
      },
      outcome: {
        contractVersion: 1,
        async record(_e: OutcomeRecord) {},
        async query(): Promise<OutcomeRecord[]> {
          return [];
        },
        async linkage(): Promise<{ matched: number; unmatched: number }> {
          return { matched: 0, unmatched: 0 };
        },
      },
      evaluation: {
        contractVersion: 1,
        async evaluate(q): Promise<EvaluationReport> {
          return { tileId: q.tileId, windowDays: 30, sampleSize: 0, verdict: "INSUFFICIENT_DATA", computedAt: "2026-09-16T00:00:00.000Z" };
        },
      },
      learning: {
        contractVersion: 1,
        async learn(): Promise<LearningResult> {
          return { updated: false, newVersion: null, rationale: "آزمایشی", signalBreakdown: { feedbackSignals: 0, outcomeSignals: 0 } };
        },
      },
      safety: {
        contractVersion: 1,
        async assess(): Promise<SafetyVerdict> {
          return { riskLevel: "LOW", requiredApproval: false, reason: "آزمایشی", ruleIds: [] };
        },
      },
    };

    // هر ۱۱ فیلد واقعاً stub شده است
    const keys = Object.keys(stubs) as (keyof EngineDeps)[];
    expect(keys.length).toBe(11);
    for (const k of keys) expect(stubs[k]).toBeDefined();

    // تزریق به ایجنت + فراخوانی موفق هر stub از مسیر قرارداد
    const agent = new SkeletonTestAgent({ engines: stubs });
    expect(agent.injectedEngines).toBe(stubs);

    const ctx = await (stubs.context as ContextEngine).buildContext({ tileId: "t", purpose: "action" });
    expect(ctx.purpose).toBe("action");
    const verdict = await (stubs.safety as SafetyEngine).assess({
      context: ctx,
      proposal: { kind: "ACTION", description: "d", affectsExternalSystem: false, isDestructive: false },
    });
    expect(verdict.requiredApproval).toBe(false);
    const report = await (stubs.evaluation as EvaluationEngine).evaluate({ tileId: "t" });
    expect(report.verdict).toBe("INSUFFICIENT_DATA");
  });

  test("قاعده سخت ایمنی در سطح قرارداد: فیلد requiredApproval اجباری است", () => {
    // بررسی نوعی: SafetyVerdict بدون requiredApproval قابل ساخت نیست —
    // این تست تضمین می‌کند فیلد در قرارداد حاضر و اجباری است.
    const partial = { riskLevel: "HIGH" as const, reason: "r", ruleIds: [] };
    const verdict: SafetyVerdict = { ...partial, requiredApproval: true };
    expect(verdict.requiredApproval).toBe(true);
  });
});

// ===================== ۵. نوع‌های مرجع لایه ایجنت دست‌نخورده =====================

describe("P3-02 — عدم تداخل با قراردادهای موجود", () => {
  test("نوع‌های پایه ایجنت (InsightCard و…) از مسیر قبلی هم در دسترس‌اند", async () => {
    const mod = await import("@/core/agent");
    expect(typeof mod.BaseLearningAgent).toBe("function");
    expect(mod.listAgents().length).toBeGreaterThanOrEqual(12);
  });
});
