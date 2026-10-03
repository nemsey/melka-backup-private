/**
 * ایجنت یادگیرنده پایه (Base Learning Agent)
 * ------------------------------------------------------
 * سازوکار واقعی یادگیری (نه وعده انتزاعی):
 * 1) حافظه ساخت‌یافته Append-only — تاریخچه تعامل/بازخورد هرگز بازنویسی نمی‌شود.
 * 2) بازیابی (RAG اختصاصی کاشی) — شباهت واژگانی TF بین بینش جدید و
 *    حافظه گذشته؛ بینش‌های مشابه بازخورد مثبت تقویت و منفی تضعیف می‌شوند.
 * 3) سیاست نسخه‌بندی‌شده — پس از انباشت بازخورد، وزن دسته‌ها به‌روزرسانی و
 *    به‌صورت «نسخه جدید» ثبت می‌شود؛ Rollback به هر نسخه ممکن است.
 */

import {
  getAgentMemoryRepository,
  getPolicyRepository,
  type AgentMemoryRepository,
  type PolicyRepository,
} from "@/core/repositories";
import { logAgentCall } from "@/lib/logger";
import type { AgentPolicyContent, AgentPolicyRecord } from "./policy";
import { clampWeight, defaultPolicy } from "./policy";

// ===================== قرارداد بینش =====================

export type InsightSeverity = "info" | "positive" | "warning" | "critical";

export interface InsightCard {
  key: string;
  /** دسته موضوعی — واحد یادگیری در سطح سیاست */
  domain: string;
  title: string;
  body: string;
  severity: InsightSeverity;
  metrics?: InsightMetric[];
}

/** سنجهٔ بینش — P6.5-14: نوار پیشرفت اختیاری برای معیارهای پوشش (A.۴) */
export interface InsightMetric {
  label: string;
  value: string;
  /** درصد ۰-۱۰۰ برای نمایش نوار پیشرفت رنگ‌بندی‌شده (سبز ≥۹۵ / زرد ۷۰-۹۵ / قرمز <۷۰) */
  progress?: number;
}

export interface RenderedInsight extends InsightCard {
  /** وزن نهایی پس از اعمال سیاست و بازیابی حافظه */
  finalWeight: number;
  /** یادگیری مؤثر بوده؟ */
  learned: boolean;
  /** توضیح منبع وزن — برای شفافیت تصمیم ایجنت */
  weightSource: string;
}

// ===================== RAG سبک — شباهت واژگانی =====================

/** بردار فراوانی واژه (Term Frequency) */
export function termVector(text: string): Map<string, number> {
  const vec = new Map<string, number>();
  const tokens = text
    .replace(/[\u200c]/g, " ")
    .split(/[\s،؛.!؟:()\[\]«»"']+/)
    .filter((w) => w.length > 1);
  for (const tok of tokens) vec.set(tok, (vec.get(tok) ?? 0) + 1);
  return vec;
}

/** شباهت کسینوسی دو بردار فراوانی */
export function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const v of a.values()) normA += v * v;
  for (const v of b.values()) normB += v * v;
  if (normA === 0 || normB === 0) return 0;
  for (const [k, v] of a) {
    const w = b.get(k);
    if (w) dot += v * w;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export interface MemorySnippet {
  id: string;
  text: string;
  sentiment: number; // +1 مثبت | -1 منفی | 0 خنثی
  createdAt: string;
}

// ===================== ایجنت پایه =====================

export abstract class BaseLearningAgent {
  abstract readonly tileId: string;
  abstract readonly name: string;
  abstract readonly insightDomains: readonly string[];

  /** محاسبه بینش‌های خام از داده — هر ایجنت تخصصی پیاده می‌کند */
  protected abstract computeRawInsights(): Promise<InsightCard[]>;

  // ---------- انبار داده (P2-02-D — تزریق‌پذیر برای تست، صفر DB مستقیم) ----------

  /** وابستگی‌های تزریق‌پذیر BaseLearningAgent — قرارداد سازنده تغییر نکرده است */
  private readonly memory: AgentMemoryRepository;
  private readonly policy: PolicyRepository;

  constructor(deps?: { memory?: AgentMemoryRepository; policy?: PolicyRepository }) {
    this.memory = deps?.memory ?? getAgentMemoryRepository();
    this.policy = deps?.policy ?? getPolicyRepository();
  }

  // ---------- سیاست ----------

  private async ensurePolicy(): Promise<AgentPolicyRecord> {
    const active = await this.policy.findActive(this.tileId);
    if (active) return this.toRecord(active);

    // نسخه ۱ — سیاست اولیه
    const created = await this.policy.createVersion({
      tileId: this.tileId,
      version: 1,
      content: JSON.stringify(defaultPolicy(this.insightDomains)),
      rationale: "سیاست اولیه — بدون بازخورد کاربر؛ وزن برابر برای همه دسته‌ها.",
      active: true,
      activatedAt: new Date(),
    });
    await this.appendMemory("POLICY_CHANGE", {
      event: "policy-created",
      version: 1,
      note: "سیاست اولیه ایجاد شد.",
    });
    return this.toRecord(created);
  }

  private toRecord(row: { id: string; tileId: string; version: number; content: string; rationale: string; active: boolean; createdAt: Date; activatedAt: Date | null }): AgentPolicyRecord {
    return {
      id: row.id,
      tileId: row.tileId,
      version: row.version,
      content: JSON.parse(row.content) as AgentPolicyContent,
      rationale: row.rationale,
      active: row.active,
      createdAt: row.createdAt.toISOString(),
      activatedAt: row.activatedAt?.toISOString() ?? null,
    };
  }

  async getActivePolicy(): Promise<AgentPolicyRecord> {
    return this.ensurePolicy();
  }

  async listPolicyVersions(): Promise<AgentPolicyRecord[]> {
    await this.ensurePolicy();
    const rows = await this.policy.listVersions(this.tileId);
    return rows.map((r) => this.toRecord(r));
  }

  /** بازگشت به نسخه قبلی سیاست — نسخه فعلی حذف نمی‌شود، فقط غیرفعال */
  async rollbackPolicy(targetVersion: number): Promise<AgentPolicyRecord> {
    const target = await this.policy.findByTileAndVersion(this.tileId, targetVersion);
    if (!target) throw new Error(`نسخه ${targetVersion} برای این ایجنت وجود ندارد.`);
    await this.policy.activateVersion(this.tileId, target.id, new Date());
    await this.appendMemory("POLICY_CHANGE", {
      event: "policy-rollback",
      fromVersion: "active",
      toVersion: targetVersion,
      note: `بازگشت سیاست به نسخه ${targetVersion}.`,
    });
    return this.toRecord(target);
  }

  // ---------- حافظه (Append-only) ----------

  protected async appendMemory(kind: string, payload: Record<string, unknown>): Promise<void> {
    await this.memory.append(this.tileId, kind, JSON.stringify({ ...payload, at: new Date().toISOString() }));
  }

  /** بازیابی قطعات حافظه مرتبط با یک پرسش (RAG اختصاصی کاشی) */
  async retrieveRelevant(query: string, k = 5): Promise<MemorySnippet[]> {
    const feedbacks = await this.memory.listFeedbacks(this.tileId, 200);
    const memories = await this.memory.listRecent(this.tileId, 200);

    const qVec = termVector(query);
    const pool: MemorySnippet[] = [
      ...feedbacks.map((f) => ({
        id: f.id,
        text: `${f.insightTitle} ${f.comment ?? ""}`,
        sentiment: f.rating,
        createdAt: f.createdAt.toISOString(),
      })),
      ...memories.map((m) => ({
        id: m.id,
        text: m.payload.slice(0, 400),
        sentiment: 0,
        createdAt: m.createdAt.toISOString(),
      })),
    ];

    return pool
      .map((s) => ({ s, sim: cosineSimilarity(qVec, termVector(s.text)) }))
      .filter((x) => x.sim > 0.05)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, k)
      .map((x) => x.s);
  }

  // ---------- بازخورد ----------

  async submitFeedback(input: {
    insightKey: string;
    insightTitle: string;
    domain: string;
    rating: 1 | -1;
    comment?: string;
    contextSnapshot?: Record<string, unknown>;
  }): Promise<{ totalFeedback: number }> {
    // P2-05 — رویداد الزامی فراخوانی ایجنت
    const __startedAt = Date.now();
    logAgentCall({ tileId: this.tileId, agentName: this.name, operation: "submit-feedback", status: "start" });
    try {
      const result = await this.submitFeedbackInner(input);
      logAgentCall({ tileId: this.tileId, agentName: this.name, operation: "submit-feedback", status: "ok", duration: Date.now() - __startedAt });
      return result;
    } catch (err) {
      logAgentCall({ tileId: this.tileId, agentName: this.name, operation: "submit-feedback", status: "fail", duration: Date.now() - __startedAt, errorCode: "AGENT_ERROR" });
      throw err;
    }
  }

  /** بدنه اصلی بازخورد (P2-05: از پوشش لاگ جدا شد — منطق عین قبل) */
  private async submitFeedbackInner(input: {
    insightKey: string;
    insightTitle: string;
    domain: string;
    rating: 1 | -1;
    comment?: string;
    contextSnapshot?: Record<string, unknown>;
  }): Promise<{ totalFeedback: number }> {
    // ثبت بازخورد — فقط افزودنی
    await this.memory.createFeedback({
      tileId: this.tileId,
      insightKey: input.insightKey,
      insightTitle: input.insightTitle,
      rating: input.rating,
      comment: input.comment ?? null,
      context: JSON.stringify({ domain: input.domain, ...(input.contextSnapshot ?? {}) }),
    });
    await this.appendMemory("FEEDBACK", {
      event: "feedback",
      insightKey: input.insightKey,
      domain: input.domain,
      rating: input.rating,
      comment: input.comment ?? null,
    });

    const totalFeedback = await this.memory.countFeedback(this.tileId);
    // بازبینی دوره‌ای سیاست
    await this.reviewPolicyIfNeeded();
    return { totalFeedback };
  }

  /**
   * بازبینی سیاست بر اساس تحلیل تجمیعی بازخوردها.
   * قاعده واقعی و نسخه‌بندی‌شده:
   *  - حداقل ۵ بازخورد ثبت شده باشد؛
   *  - برای هر دسته، امتیاز = مجموع (+1/-1)؛
   *  - وزن جدید = وزن فعلی + ۰٫۱۵ × امتیاز دسته (محدود به بازه ۰٫۳ تا ۱٫۸)؛
   *  - اگر مجموع تغییرات وزن معنادار نباشد، نسخه جدید ساخته نمی‌شود.
   */
  async reviewPolicyIfNeeded(): Promise<{ updated: boolean; version: number | null }> {
    const feedbacks = await this.memory.listAllFeedbacks(this.tileId);
    if (feedbacks.length < 5) return { updated: false, version: null };

    const domainScores = new Map<string, number>();
    for (const f of feedbacks) {
      try {
        const ctx = JSON.parse(f.context) as { domain?: string };
        if (ctx.domain) domainScores.set(ctx.domain, (domainScores.get(ctx.domain) ?? 0) + f.rating);
      } catch {
        // ساختار قدیمی — نادیده
      }
    }

    const policy = await this.getActivePolicy();
    const weights: Record<string, number> = { ...policy.content.weights };
    let meaningful = false;
    const changes: string[] = [];

    for (const [domain, score] of domainScores) {
      if (Math.abs(score) < 2) continue; // آستانه معناداری
      const current = weights[domain] ?? 1;
      const next = clampWeight(current + 0.15 * score);
      if (next !== current) {
        weights[domain] = next;
        meaningful = true;
        changes.push(`${domain}: ${current} → ${next} (${score > 0 ? "تقویت" : "تضعیف"} بر اساس ${Math.abs(score)} بازخورد)`);
      }
    }

    if (!meaningful) return { updated: false, version: null };

    const latest = await this.policy.findLatest(this.tileId);
    const nextVersion = (latest?.version ?? 1) + 1;

    const created = await this.policy.createVersion({
      tileId: this.tileId,
      version: nextVersion,
      content: JSON.stringify({ ...policy.content, weights } as AgentPolicyContent),
      rationale: `به‌روزرسانی از ${feedbacks.length} بازخورد: ${changes.join("؛ ")}`,
      active: false,
      activatedAt: null,
    });
    await this.policy.activateVersion(this.tileId, created.id, new Date());
    await this.appendMemory("POLICY_CHANGE", {
      event: "policy-updated",
      version: nextVersion,
      rationale: `به‌روزرسانی از ${feedbacks.length} بازخورد`,
      changes,
    });
    return { updated: true, version: nextVersion };
  }

  // ---------- رندر بینش (قلب ایجنت) ----------

  /**
   * چرخه کامل: محاسبه → اعمال سیاست فعال → تقویت/تضعیف با بازیابی حافظه →
   * مرتب‌سازی → ثبت تعامل در حافظه (Append-only).
   */
  async renderInsights(): Promise<{ insights: RenderedInsight[]; policyVersion: number; memoryHits: number }> {
    // P2-05 — رویداد الزامی فراخوانی ایجنت (مرکزی: همه ایجنت‌ها)
    const __startedAt = Date.now();
    logAgentCall({ tileId: this.tileId, agentName: this.name, operation: "render-insights", status: "start" });
    try {
      const result = await this.renderInsightsInner();
      logAgentCall({
        tileId: this.tileId,
        agentName: this.name,
        operation: "render-insights",
        status: "ok",
        duration: Date.now() - __startedAt,
        detail: { insightCount: result.insights.length, policyVersion: result.policyVersion },
      });
      return result;
    } catch (err) {
      logAgentCall({
        tileId: this.tileId,
        agentName: this.name,
        operation: "render-insights",
        status: "fail",
        duration: Date.now() - __startedAt,
        errorCode: (err as { code?: string })?.code ?? "AGENT_ERROR",
      });
      throw err;
    }
  }

  /** بدنه اصلی رندر (P2-05: از پوشش لاگ جدا شد — منطق عین قبل) */
  private async renderInsightsInner(): Promise<{ insights: RenderedInsight[]; policyVersion: number; memoryHits: number }> {
    const policy = await this.getActivePolicy();
    const raw = await this.computeRawInsights();

    const rendered: RenderedInsight[] = [];
    let memoryHits = 0;

    for (const card of raw) {
      const policyWeight = policy.content.weights[card.domain] ?? 1;
      // بازیابی حافظه مرتبط با عنوان بینش
      const related = await this.retrieveRelevant(`${card.title} ${card.domain}`, 3);
      let learningDelta = 0;
      for (const r of related) {
        const sim = cosineSimilarity(termVector(card.title), termVector(r.text));
        learningDelta += sim * r.sentiment * 0.4;
      }
      if (learningDelta !== 0) memoryHits += 1;

      const finalWeight = Math.round((policyWeight + learningDelta) * 100) / 100;
      rendered.push({
        ...card,
        finalWeight,
        learned: Math.abs(learningDelta) > 0.01,
        weightSource:
          Math.abs(learningDelta) > 0.01
            ? `سیاست نسخه ${policy.version} (وزن ${policyWeight}) + یادگیری از ${related.length} خاطره مرتبط (${learningDelta > 0 ? "تقویت" : "تضعیف"})`
            : `سیاست نسخه ${policy.version} (وزن ${policyWeight}) — بدون خاطره مرتبط`,
      });
    }

    rendered.sort((a, b) => b.finalWeight - a.finalWeight);
    const limited = rendered.slice(0, policy.content.maxInsights);

    // ثبت تعامل — Append-only
    await this.appendMemory("INTERACTION", {
      event: "insight-render",
      insightCount: limited.length,
      domains: limited.map((i) => i.domain),
      policyVersion: policy.version,
    });

    return { insights: limited, policyVersion: policy.version, memoryHits };
  }

  /** آمار یادگیری برای نمایش در UI کاشی */
  async learningStats(): Promise<{
    feedbackCount: number;
    memoryCount: number;
    policyVersions: number;
    activePolicyVersion: number;
    positiveRate: number;
  }> {
    const [feedbackCount, memoryCount, policyVersions, activePolicy, positives] = await Promise.all([
      this.memory.countFeedback(this.tileId),
      this.memory.countMemory(this.tileId),
      this.policy.countVersions(this.tileId),
      this.policy.findActive(this.tileId),
      this.memory.countFeedback(this.tileId, true),
    ]);
    return {
      feedbackCount,
      memoryCount,
      policyVersions,
      activePolicyVersion: activePolicy?.version ?? 1,
      positiveRate: feedbackCount > 0 ? Math.round((positives / feedbackCount) * 100) : 0,
    };
  }
}
