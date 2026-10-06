/**
 * تست‌های PHASE 3 — P3-03: مهاجرت RequestAgent به BaseIntelligentAgent
 * ------------------------------------------------------
 * نمونه مرجع نخست — اثبات می‌کند:
 *  ۱. زنجیره وراثت: RequestAgent ⇽ BaseIntelligentAgent ⇽ BaseLearningAgent
 *  ۲. تزریق موتور (پیش‌فرض = Placeholder زمینه؛ دلخواه = stub) بدون هیچ اثری بر خروجی
 *  ۳. خروجی renderInsights در سه حالت (بدون موتور / پیش‌فرض / ۱۱ موتور stub) بایت‌به‌بایت یکسان
 *  ۴. مسیر یادگیری ارث‌بری‌شده دست‌نخورده: بازخورد ≥۵ → نسخه سیاست ۲
 *  ۵. قرارداد عمومی (tileId/name/domains و رجیستری) بدون تغییر
 *
 * صفر وابستگی DB — انبارها stub درون-حافظه‌ای‌اند و buildCustomerManagement با
 * mock.module خنثی شده است. ⚠️ mock.module باید «پیش از» هر import از زنجیره
 * ایجنت اجرا شود — به همین دلیل همه import های ایجنت داینامیک هستند.
 */

import { describe, expect, test, mock } from "bun:test";

// ---------- خنثی‌سازی موتور مدیریت مشتری (پیش از بارگذاری زنجیره ایجنت) ----------
mock.module("@/lib/request/customer-mgmt", () => ({
  buildCustomerManagement: async () => null,
  LIFECYCLE_FA: {
    NEW: "جدید", ENGAGED: "در تعامل", SERIOUS: "جدی",
    READY_TO_DEAL: "آماده معامله", CONVERTED: "معامله‌شده", DORMANT: "راکد",
  },
}));

// ---------- بارگذاری زنجیره ایجنت پس از mock ----------
const { RequestAgent } = await import("@/core/agent/request-agent");
const { BaseIntelligentAgent } = await import("@/core/intelligence/base-intelligent-agent");
const { createDefaultEngineDeps, PassthroughContextEngine } = await import("@/core/intelligence/engine-deps");
const { BaseLearningAgent } = await import("@/core/agent/base-agent");
const { getAgent } = await import("@/core/agent");

import type { RequestAgentDeps } from "@/core/agent/request-agent";
import type { EngineDeps } from "@/core/intelligence/engine-deps";
import type { AgentMemoryRepository, CustomerRepository, PolicyRepository } from "@/core/repositories";
import type { AgentFeedbackDTO, AgentFeedbackInput, AgentMemoryDTO, AgentPolicyVersionDTO, PolicyVersionInput, RequestEventDTO, RequestRecordDTO, RequestRecordWithEventsDTO } from "@/core/repositories";

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
      id: `p-${seq++}`,
      tileId: input.tileId,
      version: input.version,
      content: input.content,
      rationale: input.rationale,
      active: input.active,
      createdAt: fixedNow(),
      activatedAt: input.activatedAt ?? null,
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

/** انبار مشتری stub — خالی (buildCustomerManagement جداگانه mock شده) */
class StubCustomerRepo implements CustomerRepository {
  async listRecentRequests(): Promise<RequestRecordDTO[]> {
    return [];
  }
  async listRecentEvents(): Promise<RequestEventDTO[]> {
    return [];
  }
  async findById(): Promise<RequestRecordDTO | null> {
    return null;
  }
  async findByIdWithEvents(): Promise<RequestRecordWithEventsDTO | null> {
    return null;
  }
  async updateEventArmSync(): Promise<void> {}
}

// ===================== سازنده مشترک حالت تست =====================

function freshAgent(engines?: EngineDeps): { agent: InstanceType<typeof RequestAgent>; memory: StubMemoryRepo; policy: StubPolicyRepo } {
  const memory = new StubMemoryRepo();
  const policy = new StubPolicyRepo();
  const deps: RequestAgentDeps = { memory, policy, customers: new StubCustomerRepo() };
  if (engines) deps.engines = engines;
  return { agent: new RequestAgent(deps), memory, policy };
}

/** ۱۱ موتور stub کامل — عین اسکریپت verify-p3-03 */
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

// ===================== ۱. زنجیره وراثت و قرارداد عمومی =====================

describe("P3-03 — RequestAgent: زنجیره وراثت و قرارداد", () => {
  test("فرزند BaseIntelligentAgent و BaseLearningAgent است", () => {
    const { agent } = freshAgent();
    expect(agent).toBeInstanceOf(RequestAgent);
    expect(agent).toBeInstanceOf(BaseIntelligentAgent);
    expect(agent).toBeInstanceOf(BaseLearningAgent);
  });

  test("قرارداد عمومی بدون تغییر: tileId/name/insightDomains", () => {
    const { agent } = freshAgent();
    expect(agent.tileId).toBe("requests");
    expect(agent.name).toBe("ایجنت مدیریت مشتریان");
    expect([...agent.insightDomains]).toEqual([
      "COMMUNITY_MGMT", "CUST_HEALTH", "LIFECYCLE_MGMT", "NEXT_ACTION", "MATCH", "CHURN", "EVENT_MGMT", "ARM_SYNC",
    ]);
  });

  test("رجیستری ایجنت‌ها نمونه «درخواست ملک» را برمی‌گرداند و از BaseIntelligentAgent است", () => {
    const registered = getAgent("requests");
    expect(registered).not.toBeNull();
    expect(registered).toBeInstanceOf(BaseIntelligentAgent);
    expect(registered).toBeInstanceOf(BaseLearningAgent);
  });

  test("agentId نمونه مرجع همیشه «requests» است (سیم‌کشی هویت در سازنده)", () => {
    expect(freshAgent().agent.intelligentAgentId).toBe("requests");
    const bare = new RequestAgent();
    expect(bare.intelligentAgentId).toBe("requests");
  });
});

// ===================== ۲. تزریق موتور =====================

describe("P3-03 — تزریق موتور", () => {
  test("بدون تزریق: موتور پیش‌فرض = Placeholder زمینه (بقیه غایب = fallback)", () => {
    const { agent } = freshAgent();
    expect(agent.injectedEngines.context).toBeInstanceOf(PassthroughContextEngine);
    const absent = (["memory", "retrieval", "feature", "prediction", "decision", "actionPlanner", "outcome", "evaluation", "learning", "safety"] as const).filter(
      (k) => agent.injectedEngines[k] !== undefined,
    );
    expect(absent).toEqual([]);
  });

  test("با تزریق: هر ۱۱ موتور stub دقیقاً همان نمونه‌های داده‌شده‌اند", () => {
    const engines = stubEngines();
    const { agent } = freshAgent(engines);
    expect(agent.injectedEngines).toBe(engines);
    for (const k of Object.keys(engines) as (keyof EngineDeps)[]) {
      expect(agent.injectedEngines[k]).toBe(engines[k]);
    }
  });

  test("createDefaultEngineDeps فقط ظرف خنثی زمینه می‌سازد", () => {
    const deps = createDefaultEngineDeps();
    expect(Object.keys(deps)).toEqual(["context"]);
  });
});

// ===================== ۳. خروجی بایت‌به‌بایت یکسان در سه حالت موتور =====================

describe("P3-03 — خروجی بایت‌به‌بایت یکسان (استراتژی Placeholder)", () => {
  async function capture(engines?: EngineDeps): Promise<string> {
    const state = freshAgent(engines);
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

  test("بدون داده → کارت «جامعه در حال شکل‌گیری» (مسیر خالی صحیح)", async () => {
    const { agent } = freshAgent();
    const rendered = await agent.renderInsights();
    expect(rendered.insights.length).toBeGreaterThan(0);
    expect(rendered.insights[0].key).toBe("community-empty");
    expect(rendered.insights[0].domain).toBe("COMMUNITY_MGMT");
    expect(rendered.policyVersion).toBe(1);
  });

  test("INTERACTION در حافظه ثبت شد (چرخه append-only والد فعال است)", async () => {
    const state = freshAgent();
    await state.agent.renderInsights();
    const kinds = state.memory.memories.map((m) => m.kind);
    expect(kinds).toContain("POLICY_CHANGE"); // ensurePolicy → نسخه ۱
    expect(kinds).toContain("INTERACTION"); // رندر
  });
});

// ===================== ۴. مسیر یادگیری ارث‌بری‌شده =====================

describe("P3-03 — مسیر یادگیری والد دست‌نخورده", () => {
  test("۵ بازخورد مثبت یک دامنه → خودکار نسخه ۲ با وزن ۱٫۷۵ و سپس clamp ۱٫۸ (آستانه‌های قدیمی)", async () => {
    const state = freshAgent();
    for (let i = 0; i < 5; i++) {
      await state.agent.submitFeedback({
        insightKey: "community-empty",
        insightTitle: "جامعه مشتریان در حال شکل‌گیری است",
        domain: "COMMUNITY_MGMT",
        rating: 1,
      });
    }
    // بازبینی خودکار روی بازخورد پنجم رخ داده است — نسخه ۲ فعال است
    const active = await state.agent.getActivePolicy();
    expect(active.version).toBe(2);
    expect(active.content.weights["COMMUNITY_MGMT"]).toBe(1.75); // 1 + 0.15×5 (امتیاز دامنه = جمع ۵ بازخورد مثبت)

    // بازبینی صریح بیشتر → نسخه ۳ با اشباع clamp (1.75 + 0.75 → 1.8)
    const review = await state.agent.reviewPolicyIfNeeded();
    expect(review.updated).toBe(true);
    expect(review.version).toBe(3);
    const active3 = await state.agent.getActivePolicy();
    expect(active3.version).toBe(3);
    expect(active3.content.weights["COMMUNITY_MGMT"]).toBe(1.8); // clampWeight
  });

  test("rollbackPolicy به نسخه ۱ برمی‌گرداند (ارث‌بری سالم)", async () => {
    const state = freshAgent();
    for (let i = 0; i < 5; i++) {
      await state.agent.submitFeedback({
        insightKey: "community-empty",
        insightTitle: "جامعه مشتریان در حال شکل‌گیری است",
        domain: "COMMUNITY_MGMT",
        rating: 1,
      });
    }
    await state.agent.reviewPolicyIfNeeded();
    const rolled = await state.agent.rollbackPolicy(1);
    expect(rolled.version).toBe(1);
    expect(rolled.active).toBe(true);
  });

  test("learningStats شمارش‌های صحیح از انبار stub", async () => {
    const state = freshAgent();
    await state.agent.renderInsights();
    const stats = await state.agent.learningStats();
    expect(stats.feedbackCount).toBe(0);
    expect(stats.policyVersions).toBe(1);
    expect(stats.activePolicyVersion).toBe(1);
    expect(stats.positiveRate).toBe(0);
  });
});
