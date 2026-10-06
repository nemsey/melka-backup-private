/**
 * تست‌های PHASE 3 — P3-04: مهاجرت DivarAgent به BaseIntelligentAgent
 * ------------------------------------------------------
 * دومین ایجنت مهاجرت‌یافته (الگوی نمونه مرجع RequestAgent). اثبات می‌کند:
 *  ۱. زنجیره وراثت: DivarAgent ⇽ BaseIntelligentAgent ⇽ BaseLearningAgent
 *  ۲. تزریق موتور بدون اثر بر خروجی (سه حالت بایت‌به‌بایت یکسان)
 *  ۳. قرارداد عمومی و رجیستری بدون تغییر
 *  ۴. خروجی با داده stub: همان کلیدهای کارت همیشه
 *
 * اثبات کامل بایت‌به‌بایت روی داده واقعی: verify-p3-04-divar دو-درختی
 * (baseline worktree ⇔ فعلی) — شواهد: download/phase3-verification/
 * صفر وابستگی DB — همه انبارها stub درون-حافظه‌ای.
 */

import { describe, expect, test } from "bun:test";

import { DivarAgent, type DivarAgentDeps } from "@/core/agent/divar-agent";
import { BaseIntelligentAgent } from "@/core/intelligence/base-intelligent-agent";
import { createDefaultEngineDeps, PassthroughContextEngine, type EngineDeps } from "@/core/intelligence/engine-deps";
import { BaseLearningAgent } from "@/core/agent/base-agent";
import { getAgent } from "@/core/agent";
import type { AgentMemoryRepository, MarketRepository, OutcomeRepository, PolicyRepository } from "@/core/repositories";
import type { AgentFeedbackDTO, AgentFeedbackInput, AgentMemoryDTO, AgentPolicyVersionDTO, PolicyVersionInput } from "@/core/repositories";

// ===================== انبارهای stub درون-حافظه‌ای =====================

let seq = 0;
const fixedNow = () => new Date("2026-09-16T08:00:00.000Z");

class StubMemoryRepo implements AgentMemoryRepository {
  readonly memories: AgentMemoryDTO[] = [];
  readonly feedbacks: AgentFeedbackDTO[] = [];

  async append(tileId: string, kind: string, payloadJson: string): Promise<void> {
    this.memories.push({ id: `m-${seq++}`, tileId, kind, payload: payloadJson, createdAt: fixedNow() });
  }
  async listRecent(tileId: string, take: number): Promise<AgentMemoryDTO[]> {
    return this.memories.filter((m) => m.tileId === tileId).slice(-take).reverse();
  }
  async listFeedbacks(tileId: string, take: number): Promise<AgentFeedbackDTO[]> {
    return this.feedbacks.filter((f) => f.tileId === tileId).slice(-take).reverse();
  }
  async listAllFeedbacks(tileId: string): Promise<AgentFeedbackDTO[]> {
    return this.feedbacks.filter((f) => f.tileId === tileId);
  }
  async createFeedback(input: AgentFeedbackInput): Promise<void> {
    this.feedbacks.push({ id: `f-${seq++}`, createdAt: fixedNow(), ...input });
  }
  async countMemory(tileId: string): Promise<number> {
    return this.memories.filter((m) => m.tileId === tileId).length;
  }
  async countFeedback(tileId: string, positiveOnly?: boolean): Promise<number> {
    return this.feedbacks.filter((f) => f.tileId === tileId && (!positiveOnly || f.rating === 1)).length;
  }
}

class StubPolicyRepo implements PolicyRepository {
  readonly versions: AgentPolicyVersionDTO[] = [];

  async findActive(tileId: string): Promise<AgentPolicyVersionDTO | null> {
    return this.versions.filter((v) => v.tileId === tileId && v.active)[0] ?? null;
  }
  async findLatest(tileId: string): Promise<AgentPolicyVersionDTO | null> {
    const rows = this.versions.filter((v) => v.tileId === tileId).sort((a, b) => b.version - a.version);
    return rows[0] ?? null;
  }
  async findByTileAndVersion(tileId: string, version: number): Promise<AgentPolicyVersionDTO | null> {
    return this.versions.find((v) => v.tileId === tileId && v.version === version) ?? null;
  }
  async listVersions(tileId: string): Promise<AgentPolicyVersionDTO[]> {
    return this.versions.filter((v) => v.tileId === tileId).sort((a, b) => b.version - a.version);
  }
  async createVersion(input: PolicyVersionInput): Promise<AgentPolicyVersionDTO> {
    const row: AgentPolicyVersionDTO = {
      id: `p-${seq++}`, tileId: input.tileId, version: input.version, content: input.content,
      rationale: input.rationale, active: input.active, createdAt: fixedNow(), activatedAt: input.activatedAt ?? null,
    };
    this.versions.push(row);
    return row;
  }
  async activateVersion(tileId: string, versionId: string, activatedAt: Date): Promise<void> {
    for (const v of this.versions) {
      if (v.tileId === tileId) v.active = v.id === versionId;
    }
    const target = this.versions.find((v) => v.id === versionId);
    if (target) target.activatedAt = activatedAt;
  }
  async countVersions(tileId: string): Promise<number> {
    return this.versions.filter((v) => v.tileId === tileId).length;
  }
}

/** انبار بازار خالی — پیاده‌سازی کامل قرارداد با داده تهی */
function emptyMarket(): MarketRepository {
  return {
    listSupplyDemand: async () => [],
    listSupplyDemandOrderByPropertyCountDesc: async () => [],
    countSupplyDemand: async () => 0,
    replaceSupplyDemand: async () => 0,
    upsertSupplyDemandBatch: async () => ({ created: 0, updated: 0 }),
    deleteAllSupplyDemand: async () => undefined,
    listActiveAdScores: async () => [],
    listAdsWithPrice: async () => [],
    listAdPrices: async () => [],
    listPriceSamples: async () => [],
    listAdsWithBucketCounts: async () => ({ rows: [], bucketCounts: { hunt: 0, follow: 0, review: 0 } }),
    findAdByToken: async () => null,
    setAdStatus: async () => undefined,
    deleteAdByToken: async () => undefined,
    listMarketPriceStats: async () => [],
    listRecentScanLogs: async () => [],
    getDivarSettings: async () => null,
    listRefListsByKeys: async () => [],
    findRefList: async () => null,
  };
}

/** انبار پیامد خالی */
function emptyOutcomes(): OutcomeRepository {
  return {
    listRecentLookups: async () => [],
    countLookups: async () => 0,
    createLookup: async () => {
      throw new Error("stub");
    },
    listRecentRejects: async () => [],
    createReject: async () => {
      throw new Error("stub");
    },
    createCommissionCalc: async () => {
      throw new Error("stub");
    },
  };
}

function freshDivar(engines?: EngineDeps): { agent: DivarAgent; memory: StubMemoryRepo } {
  const memory = new StubMemoryRepo();
  const deps: DivarAgentDeps = { market: emptyMarket(), outcomes: emptyOutcomes(), memory, policy: new StubPolicyRepo() };
  if (engines) deps.engines = engines;
  return { agent: new DivarAgent(deps), memory };
}

/** ۱۱ موتور stub کامل */
function stubEngines(): EngineDeps {
  return {
    context: { contractVersion: 1, async buildContext(q) { return { tileId: q.tileId, generatedAt: "2026-09-16T00:00:00.000Z", purpose: q.purpose }; } },
    memory: { contractVersion: 1, async append() {}, async query() { return []; } },
    retrieval: { contractVersion: 1, async retrieve() { return { snippets: [], hitCount: 0, method: "TF_COSINE" }; } },
    feature: { contractVersion: 1, async compute(q) { return { tileId: q.tileId, domain: q.domain, computedAt: "2026-09-16T00:00:00.000Z", vector: {}, missing: [] }; } },
    prediction: { contractVersion: 1, async predict(q) { return { id: "s", tileId: q.tileId, target: q.target, predictedValue: 0, unit: "u", confidence: 0.5, horizonDays: 30, modelVersion: "stub", rationale: "stub", computedAt: "2026-09-16T00:00:00.000Z" }; } },
    decision: { contractVersion: 1, async decide() { return { ranked: [], topKey: "", appliedRuleIds: [] }; } },
    actionPlanner: { contractVersion: 1, async plan() { return { steps: [], createdAt: "2026-09-16T00:00:00.000Z" }; } },
    outcome: { contractVersion: 1, async record() {}, async query() { return []; }, async linkage() { return { matched: 0, unmatched: 0 }; } },
    evaluation: { contractVersion: 1, async evaluate(q) { return { tileId: q.tileId, windowDays: 30, sampleSize: 0, verdict: "INSUFFICIENT_DATA", computedAt: "2026-09-16T00:00:00.000Z" }; } },
    learning: { contractVersion: 1, async learn() { return { updated: false, newVersion: null, rationale: "stub", signalBreakdown: { feedbackSignals: 0, outcomeSignals: 0 } }; } },
    safety: { contractVersion: 1, async assess() { return { riskLevel: "LOW", requiredApproval: false, reason: "stub", ruleIds: [] }; } },
  };
}

// ===================== تست‌ها =====================

describe("P3-04 — DivarAgent: زنجیره وراثت و قرارداد", () => {
  test("فرزند BaseIntelligentAgent و BaseLearningAgent است", () => {
    const { agent } = freshDivar();
    expect(agent).toBeInstanceOf(DivarAgent);
    expect(agent).toBeInstanceOf(BaseIntelligentAgent);
    expect(agent).toBeInstanceOf(BaseLearningAgent);
  });

  test("قرارداد عمومی بدون تغییر: tileId/name/insightDomains + agentId سیم‌کشی‌شده", () => {
    const { agent } = freshDivar();
    expect(agent.tileId).toBe("file-finder");
    expect(agent.name).toBe("ایجنت فایل‌یابی دیوار");
    expect([...agent.insightDomains]).toEqual(["SCAN", "PERSONAL", "PRICE", "OTHER", "LOCATION", "LEARNING"]);
    expect(agent.intelligentAgentId).toBe("file-finder");
  });

  test("رجیستری ایجنت‌ها نمونه «فایل‌یابی» را برمی‌گرداند و از BaseIntelligentAgent است", () => {
    const registered = getAgent("file-finder");
    expect(registered).not.toBeNull();
    expect(registered).toBeInstanceOf(BaseIntelligentAgent);
    expect(registered).toBeInstanceOf(BaseLearningAgent);
  });
});

describe("P3-04 — تزریق موتور", () => {
  test("بدون تزریق: پیش‌فرض = Placeholder زمینه؛ ده موتور دیگر غایب (fallback)", () => {
    const { agent } = freshDivar();
    expect(agent.injectedEngines.context).toBeInstanceOf(PassthroughContextEngine);
    const absent = (["memory", "retrieval", "feature", "prediction", "decision", "actionPlanner", "outcome", "evaluation", "learning", "safety"] as const).filter(
      (k) => agent.injectedEngines[k] !== undefined,
    );
    expect(absent).toEqual([]);
  });

  test("با تزریق: هر ۱۱ موتور stub دقیقاً همان نمونه‌های داده‌شده‌اند", () => {
    const engines = stubEngines();
    const { agent } = freshDivar(engines);
    expect(agent.injectedEngines).toBe(engines);
  });
});

describe("P3-04 — خروجی بایت‌به‌بایت یکسان (استراتژی Placeholder)", () => {
  async function capture(engines?: EngineDeps): Promise<string> {
    const state = freshDivar(engines);
    const stats = await state.agent.learningStats();
    const rendered = await state.agent.renderInsights();
    return JSON.stringify({ stats, rendered }, null, 2);
  }

  test("بدون موتور ⇔ پیش‌فرض ⇔ ۱۱ موتور stub — هر سه یکسان", async () => {
    const none = await capture(undefined);
    const defaults = await capture(createDefaultEngineDeps());
    const stubs = await capture(stubEngines());
    expect(none).toBe(defaults);
    expect(none).toBe(stubs);
  });

  test("بدون داده → کارت «هنوز اسکنی اجرا نشده» (مسیر خالی صحیح)", async () => {
    const { agent } = freshDivar();
    const rendered = await agent.renderInsights();
    expect(rendered.insights.length).toBeGreaterThan(0);
    expect(rendered.insights[0].key).toBe("scan-empty");
    expect(rendered.insights[0].domain).toBe("SCAN");
    expect(rendered.policyVersion).toBe(1);
  });

  test("INTERACTION در حافظه ثبت شد (چرخه append-only والد فعال است)", async () => {
    const state = freshDivar();
    await state.agent.renderInsights();
    const kinds = state.memory.memories.map((m) => m.kind);
    expect(kinds).toContain("POLICY_CHANGE");
    expect(kinds).toContain("INTERACTION");
  });
});
