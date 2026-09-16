/**
 * تست‌های P2-02-D — مهاجرت BaseLearningAgent به انبار داده
 * ------------------------------------------------------
 * قرارداد: BaseLearningAgent حذف نمی‌شود؛ فقط بدنه متدها به
 * AgentMemoryRepository + PolicyRepository مهاجرت کرده‌اند.
 * امضای عمومی و رفتار عین قبل است (گواهی: agent.test.ts بدون هیچ
 * تغییری سبز مانده است — صفر خط دیف).
 *
 * این‌جا مسیرهای سیمیِ جدید با انبار ساختگی حافظه‌ای (صفر DB) اثبات می‌شوند:
 *  ۱) خلوص import — نه @/lib/db، نه @prisma/client
 *  ۲) ensurePolicy: ساخت نسخه ۱ + ثبت POLICY_CHANGE
 *  ۳) listPolicyVersions / rollbackPolicy (خطای نسخه ناموجود)
 *  ۴) submitFeedback → createFeedback + FEEDBACK + شمارش
 *  ۵) reviewPolicyIfNeeded: آستانه ۵ / معناداری ۲ / نسخه جدید + فعال‌سازی اتمیک
 *  ۶) retrieveRelevant: شباهت کسینوسی روی داده انبار
 *  ۷) learningStats: شمارش‌ها و نرخ مثبت
 *  ۸) renderInsights: وزن سیاست + یادگیری + ثبت INTERACTION
 */

import { describe, expect, test } from "bun:test";
import { BaseLearningAgent, type InsightCard } from "@/core/agent/base-agent";
import type {
  AgentFeedbackDTO,
  AgentFeedbackInput,
  AgentMemoryDTO,
  AgentMemoryRepository,
  AgentPolicyVersionDTO,
  PolicyRepository,
  PolicyVersionInput,
} from "@/core/repositories";

// ===================== انبارهای ساختگی حافظه‌ای =====================

class StubMemoryRepo implements AgentMemoryRepository {
  appended: Array<{ tileId: string; kind: string; payloadJson: string }> = [];
  feedbacksCreated: AgentFeedbackInput[] = [];
  private feedbackRows: AgentFeedbackDTO[] = [];
  private memoryRows: AgentMemoryDTO[] = [];
  countCalls = 0;

  constructor(feedbackRows: AgentFeedbackDTO[] = [], memoryRows: AgentMemoryDTO[] = []) {
    this.feedbackRows = feedbackRows;
    this.memoryRows = memoryRows;
  }

  async append(tileId: string, kind: string, payloadJson: string): Promise<void> {
    this.appended.push({ tileId, kind, payloadJson });
  }
  async listRecent(tileId: string, take: number): Promise<AgentMemoryDTO[]> {
    return this.memoryRows.filter((m) => m.tileId === tileId).slice(0, take);
  }
  async listFeedbacks(tileId: string, take: number): Promise<AgentFeedbackDTO[]> {
    return this.feedbackRows.filter((f) => f.tileId === tileId).slice(0, take);
  }
  async listAllFeedbacks(tileId: string): Promise<AgentFeedbackDTO[]> {
    return this.feedbackRows.filter((f) => f.tileId === tileId);
  }
  async createFeedback(input: AgentFeedbackInput): Promise<void> {
    this.feedbacksCreated.push(input);
    this.feedbackRows.push({
      id: `FB-${this.feedbackRows.length}`,
      tileId: input.tileId,
      insightKey: input.insightKey,
      insightTitle: input.insightTitle,
      rating: input.rating,
      comment: input.comment,
      context: input.context,
      createdAt: new Date(),
    });
  }
  async countMemory(tileId: string): Promise<number> {
    this.countCalls++;
    return this.memoryRows.filter((m) => m.tileId === tileId).length + this.appended.filter((a) => a.tileId === tileId).length;
  }
  async countFeedback(tileId: string, positiveOnly?: boolean): Promise<number> {
    this.countCalls++;
    const rows = this.feedbackRows.filter((f) => f.tileId === tileId);
    return positiveOnly ? rows.filter((f) => f.rating === 1).length : rows.length;
  }
}

class StubPolicyRepo implements PolicyRepository {
  created: PolicyVersionInput[] = [];
  activations: Array<{ tileId: string; versionId: string; activatedAt: Date }> = [];
  private rows: AgentPolicyVersionDTO[] = [];

  constructor(rows: AgentPolicyVersionDTO[] = []) {
    this.rows = rows;
  }

  async findActive(tileId: string): Promise<AgentPolicyVersionDTO | null> {
    return this.rows.find((r) => r.tileId === tileId && r.active) ?? null;
  }
  async findLatest(tileId: string): Promise<AgentPolicyVersionDTO | null> {
    const rows = this.rows.filter((r) => r.tileId === tileId);
    return rows.length ? rows.reduce((a, b) => (b.version > a.version ? b : a)) : null;
  }
  async findByTileAndVersion(tileId: string, version: number): Promise<AgentPolicyVersionDTO | null> {
    return this.rows.find((r) => r.tileId === tileId && r.version === version) ?? null;
  }
  async listVersions(tileId: string): Promise<AgentPolicyVersionDTO[]> {
    return this.rows.filter((r) => r.tileId === tileId).sort((a, b) => b.version - a.version);
  }
  async createVersion(input: PolicyVersionInput): Promise<AgentPolicyVersionDTO> {
    const row: AgentPolicyVersionDTO = {
      id: `PV-${input.tileId}-${input.version}`,
      tileId: input.tileId,
      version: input.version,
      content: input.content,
      rationale: input.rationale,
      active: input.active,
      createdAt: new Date(),
      activatedAt: input.activatedAt,
    };
    this.rows.push(row);
    this.created.push(input);
    return row;
  }
  async activateVersion(tileId: string, versionId: string, activatedAt: Date): Promise<void> {
    this.activations.push({ tileId, versionId, activatedAt });
    // عین $transaction: همه فعال‌ها غیرفعال، هدف فعال
    for (const r of this.rows) {
      if (r.tileId === tileId && r.active) r.active = false;
    }
    const target = this.rows.find((r) => r.id === versionId);
    if (target) {
      target.active = true;
      target.activatedAt = activatedAt;
    }
  }
  async countVersions(tileId: string): Promise<number> {
    return this.rows.filter((r) => r.tileId === tileId).length;
  }
}

// ===================== ایجنت تست =====================

class StubAgent extends BaseLearningAgent {
  readonly tileId = "stub-agent-tile";
  readonly name = "ایجنت تست P2-02-D";
  readonly insightDomains = ["ALPHA", "BETA"] as const;
  constructor(deps?: { memory?: AgentMemoryRepository; policy?: PolicyRepository }) {
    super(deps);
  }
  protected async computeRawInsights(): Promise<InsightCard[]> {
    return [
      { key: "a", domain: "ALPHA", title: "بینش آلفا درباره بازار مسکن تبریز", body: "x", severity: "info" },
      { key: "b", domain: "BETA", title: "بینش بتا درباره کارشناسان", body: "y", severity: "warning" },
    ];
  }
}

const policyRow = (over: Partial<AgentPolicyVersionDTO> = {}): AgentPolicyVersionDTO => ({
  id: "PV-1",
  tileId: "stub-agent-tile",
  version: 1,
  content: JSON.stringify({ weights: { ALPHA: 1, BETA: 1 }, maxInsights: 6 }),
  rationale: "سیاست اولیه — بدون بازخورد کاربر؛ وزن برابر برای همه دسته‌ها.",
  active: true,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  activatedAt: new Date("2026-01-01T00:00:00Z"),
  ...over,
});

const feedbackRow = (over: Partial<AgentFeedbackDTO> = {}): AgentFeedbackDTO => ({
  id: "FB-1",
  tileId: "stub-agent-tile",
  insightKey: "a",
  insightTitle: "بینش آلفا درباره بازار مسکن تبریز",
  rating: 1,
  comment: null,
  context: JSON.stringify({ domain: "ALPHA" }),
  createdAt: new Date("2026-01-02T00:00:00Z"),
  ...over,
});

// =========================================================================
// ۱) خلوص import
// =========================================================================

describe("P2-02-D — خلوص import ایجنت پایه", () => {
  test("base-agent.ts نه @/lib/db import می‌کند نه @prisma/client", async () => {
    const source = await Bun.file(`${import.meta.dir}/../src/core/agent/base-agent.ts`).text();
    expect(/from\s+['"]@\/lib\/db['"]/.test(source)).toBe(false);
    expect(/from\s+['"]@prisma\/client['"]/.test(source)).toBe(false);
  });

  test("BaseLearningAgent همچنان بدون آرگومان سازنده قابل‌مشتق‌سازی است (قرارداد سازنده)", () => {
    // عین الگوی agent.test.ts — زیرکلاس بدون deps
    const a = new (class extends BaseLearningAgent {
      readonly tileId = "ctor-check";
      readonly name = "n";
      readonly insightDomains = ["X"] as const;
      protected async computeRawInsights(): Promise<InsightCard[]> {
        return [];
      }
    })();
    expect(a.tileId).toBe("ctor-check");
    expect(typeof a.renderInsights).toBe("function");
    expect(typeof a.submitFeedback).toBe("function");
    expect(typeof a.learningStats).toBe("function");
  });
});

// =========================================================================
// ۲) ensurePolicy — ساخت نسخه ۱
// =========================================================================

describe("P2-02-D — ensurePolicy از انبار", () => {
  test("نسخه فعال موجود → بدون ایجاد؛ رکورد با تاریخ ISO", async () => {
    const policy = new StubPolicyRepo([policyRow()]);
    const memory = new StubMemoryRepo();
    const agent = new StubAgent({ memory, policy });

    const p = await agent.getActivePolicy();
    expect(policy.created).toHaveLength(0); // هیچ نسخه‌ای ساخته نشد
    expect(p.version).toBe(1);
    expect(p.rationale).toContain("سیاست اولیه");
    expect(p.createdAt).toBe("2026-01-01T00:00:00.000Z"); // ISO عین toRecord قبلی
    expect(p.content.weights.ALPHA).toBe(1);
  });

  test("نسخه‌ای نیست → نسخه ۱ ساخته + POLICY_CHANGE ثبت", async () => {
    const policy = new StubPolicyRepo();
    const memory = new StubMemoryRepo();
    const agent = new StubAgent({ memory, policy });

    const p = await agent.getActivePolicy();
    expect(policy.created).toHaveLength(1);
    expect(policy.created[0].version).toBe(1);
    expect(policy.created[0].active).toBe(true);
    expect(policy.created[0].activatedAt).toBeInstanceOf(Date);
    expect(policy.created[0].content).toContain('"ALPHA"'); // وزن برابر همه دسته‌ها
    expect(p.version).toBe(1);

    const evt = memory.appended.find((a) => a.kind === "POLICY_CHANGE")!;
    expect(evt).toBeDefined();
    const payload = JSON.parse(evt.payloadJson);
    expect(payload.event).toBe("policy-created");
    expect(payload.version).toBe(1);
    expect(typeof payload.at).toBe("string"); // مهر زمانی ISO
  });
});

// =========================================================================
// ۳) نسخه‌ها و Rollback
// =========================================================================

describe("P2-02-D — listPolicyVersions و rollbackPolicy", () => {
  test("فهرست نسخه‌ها نزولی + ensurePolicy پیش‌فرض", async () => {
    const policy = new StubPolicyRepo([policyRow({ version: 2, active: false }), policyRow()]);
    const agent = new StubAgent({ memory: new StubMemoryRepo(), policy });

    const versions = await agent.listPolicyVersions();
    expect(versions.map((v) => v.version)).toEqual([2, 1]);
  });

  test("rollback: فعال‌سازی اتمیک از طریق انبار + ثبت خاطره + خروجی عین ردیف هدف", async () => {
    const policy = new StubPolicyRepo([policyRow(), policyRow({ id: "PV-2", version: 2, active: true })]);
    const memory = new StubMemoryRepo();
    const agent = new StubAgent({ memory, policy });

    const res = await agent.rollbackPolicy(1);
    expect(res.version).toBe(1);
    // فعال‌سازی اتمیک فقط با انبار سیاست
    expect(policy.activations).toHaveLength(1);
    expect(policy.activations[0].versionId).toBe("PV-1");
    expect(policy.activations[0].activatedAt).toBeInstanceOf(Date);
    // ردیف هدف در انبار فعال شده
    expect((await policy.findByTileAndVersion("stub-agent-tile", 1))?.active).toBe(true);
    expect((await policy.findByTileAndVersion("stub-agent-tile", 2))?.active).toBe(false);
    // خاطره POLICY_CHANGE
    const evt = JSON.parse(memory.appended.find((a) => a.kind === "POLICY_CHANGE")!.payloadJson);
    expect(evt.event).toBe("policy-rollback");
    expect(evt.toVersion).toBe(1);
  });

  test("rollback به نسخه ناموجود → خطا با شماره نسخه (عین پیام قبلی)", async () => {
    const policy = new StubPolicyRepo([policyRow()]);
    const agent = new StubAgent({ memory: new StubMemoryRepo(), policy });
    try {
      await agent.rollbackPolicy(99);
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).toContain("99");
    }
  });
});

// =========================================================================
// ۴) بازخورد
// =========================================================================

describe("P2-02-D — submitFeedback", () => {
  test("ثبت بازخورد + خاطره FEEDBACK + شمارش — زمینه در context JSON", async () => {
    const policy = new StubPolicyRepo([policyRow()]);
    const memory = new StubMemoryRepo();
    const agent = new StubAgent({ memory, policy });

    const res = await agent.submitFeedback({
      insightKey: "a",
      insightTitle: "بینش آلفا درباره بازار مسکن تبریز",
      domain: "ALPHA",
      rating: 1,
      comment: "عالی",
    });

    expect(memory.feedbacksCreated).toHaveLength(1);
    expect(memory.feedbacksCreated[0].tileId).toBe("stub-agent-tile");
    expect(memory.feedbacksCreated[0].comment).toBe("عالی");
    expect(JSON.parse(memory.feedbacksCreated[0].context).domain).toBe("ALPHA");
    expect(res.totalFeedback).toBe(1);

    const evt = JSON.parse(memory.appended.find((a) => a.kind === "FEEDBACK")!.payloadJson);
    expect(evt.event).toBe("feedback");
    expect(evt.rating).toBe(1);
  });

  test("بدون comment → null (نه undefined) در انبار", async () => {
    const policy = new StubPolicyRepo([policyRow()]);
    const memory = new StubMemoryRepo();
    const agent = new StubAgent({ memory, policy });
    await agent.submitFeedback({ insightKey: "b", insightTitle: "t", domain: "BETA", rating: -1 });
    expect(memory.feedbacksCreated[0].comment).toBeNull();
  });
});

// =========================================================================
// ۵) بازبینی سیاست
// =========================================================================

describe("P2-02-D — reviewPolicyIfNeeded", () => {
  test("کمتر از ۵ بازخورد → بدون نسخه جدید", async () => {
    const policy = new StubPolicyRepo([policyRow()]);
    const memory = new StubMemoryRepo([
      feedbackRow(), feedbackRow(), feedbackRow(), feedbackRow(),
    ]);
    const agent = new StubAgent({ memory, policy });

    const res = await agent.reviewPolicyIfNeeded();
    expect(res).toEqual({ updated: false, version: null });
    expect(policy.created).toHaveLength(0);
  });

  test("۵ بازخورد اما امتیاز همه دسته‌ها < ۲ → بدون نسخه جدید (آستانه معناداری)", async () => {
    const policy = new StubPolicyRepo([policyRow()]);
    const rows = [
      feedbackRow(),                                        // ALPHA +1
      feedbackRow({ rating: -1 }),                          // ALPHA −1 → خالص ۰
      feedbackRow({ context: JSON.stringify({ domain: "BETA" }) }),    // BETA +1
      feedbackRow({ rating: -1, context: JSON.stringify({ domain: "BETA" }) }), // BETA −1 → خالص ۰
      feedbackRow({ context: JSON.stringify({ domain: "GAMMA" }) }),   // GAMMA +1 < ۲
    ];
    const memory = new StubMemoryRepo(rows);
    const agent = new StubAgent({ memory, policy });

    const res = await agent.reviewPolicyIfNeeded();
    expect(res).toEqual({ updated: false, version: null });
    expect(policy.created).toHaveLength(0);
  });

  test("امتیاز معنادار → نسخه جدید + فعال‌سازی اتمیک + خاطره policy-updated", async () => {
    const policy = new StubPolicyRepo([policyRow()]);
    const rows = [
      feedbackRow(), feedbackRow(), feedbackRow(), feedbackRow(), feedbackRow(),
    ]; // ALPHA = +5
    const memory = new StubMemoryRepo(rows);
    const agent = new StubAgent({ memory, policy });

    const res = await agent.reviewPolicyIfNeeded();
    expect(res.updated).toBe(true);
    expect(res.version).toBe(2); // آخرین ۱ + ۱

    expect(policy.created).toHaveLength(1);
    expect(policy.created[0].version).toBe(2);
    expect(policy.created[0].active).toBe(false); // عین کد قبل: ابتدا غیرفعال ساخته می‌شود
    expect(policy.created[0].rationale).toContain("5 بازخورد"); // ارقام لاتین عین قالب قبلی
    const weights = JSON.parse(policy.created[0].content).weights;
    expect(weights.ALPHA).toBeCloseTo(1.75, 5); // 1 + 0.15×5 = 1.75 (درون بازه clamp)
    expect(weights.BETA).toBe(1);

    // فعال‌سازی اتمیک پس از ساخت
    expect(policy.activations).toHaveLength(1);
    expect(policy.activations[0].versionId).toBe("PV-stub-agent-tile-2");

    const evt = JSON.parse(memory.appended.find((a) => a.kind === "POLICY_CHANGE")!.payloadJson);
    expect(evt.event).toBe("policy-updated");
    expect(evt.version).toBe(2);
    expect(evt.changes[0]).toContain("ALPHA");
  });

  test("اشباع clamp: ۱۰ بازخورد مثبت → وزن حداکثر ۱٫۸ (نه ۲٫۵)", async () => {
    const policy = new StubPolicyRepo([policyRow()]);
    const rows = Array.from({ length: 10 }, () => feedbackRow()); // ALPHA = +10
    const memory = new StubMemoryRepo(rows);
    const agent = new StubAgent({ memory, policy });

    const res = await agent.reviewPolicyIfNeeded();
    expect(res.updated).toBe(true);
    const weights = JSON.parse(policy.created[0].content).weights;
    expect(weights.ALPHA).toBe(1.8); // clampWeight(1 + 1.5)
  });
});

// =========================================================================
// ۶) بازیابی حافظه (RAG)
// =========================================================================

describe("P2-02-D — retrieveRelevant از انبار", () => {
  test("بازخورد مشابه بازیابی می‌شود؛ ناهمگون فیلتر (آستانه ۰٫۰۵)", async () => {
    const policy = new StubPolicyRepo([policyRow()]);
    const memory = new StubMemoryRepo([
      feedbackRow({ comment: "بینش آلفا درباره بازار مسکن تبریز مفید بود" }),
      feedbackRow({ id: "FB-2", insightTitle: "کارشناس موبایل شعبه", comment: "بی‌ربط", context: JSON.stringify({ domain: "BETA" }) }),
    ]);
    const agent = new StubAgent({ memory, policy });

    const hits = await agent.retrieveRelevant("بازار مسکن تبریز", 5);
    expect(hits.length).toBeGreaterThanOrEqual(1);
    expect(hits[0].id).toBe("FB-1");
    expect(hits[0].sentiment).toBe(1);
  });

  test("قطعات حافظه با احساس خنثی هم در استخر هستند", async () => {
    const policy = new StubPolicyRepo([policyRow()]);
    const memory = new StubMemoryRepo(
      [],
      [
        {
          id: "M1",
          tileId: "stub-agent-tile",
          kind: "INTERACTION",
          payload: "بازار مسکن تبریز رشد داشت",
          createdAt: new Date(),
        },
      ]
    );
    const agent = new StubAgent({ memory, policy });
    const hits = await agent.retrieveRelevant("بازار مسکن تبریز", 5);
    expect(hits.some((h) => h.id === "M1" && h.sentiment === 0)).toBe(true);
  });
});

// =========================================================================
// ۷) آمار یادگیری
// =========================================================================

describe("P2-02-D — learningStats از انبار", () => {
  test("شمارش‌ها و نرخ مثبت (گرد شده)", async () => {
    const policy = new StubPolicyRepo([policyRow({ version: 3 }), policyRow({ id: "PV-2", version: 2, active: false }), policyRow({ id: "PV-0", version: 1, active: false })]);
    const memory = new StubMemoryRepo([
      feedbackRow(), feedbackRow(),
      feedbackRow({ rating: -1 }),
    ]);
    const agent = new StubAgent({ memory, policy });

    const stats = await agent.learningStats();
    expect(stats.feedbackCount).toBe(3);
    expect(stats.policyVersions).toBe(3);
    expect(stats.activePolicyVersion).toBe(3);
    expect(stats.positiveRate).toBe(67); // 2/3 = 66.67 → 67
  });
});

// =========================================================================
// ۸) رندر بینش — چرخه کامل با انبار ساختگی
// =========================================================================

describe("P2-02-D — renderInsights با انبار ساختگی", () => {
  test("مرتب‌سازی بر اساس وزن سیاست + ثبت INTERACTION + memoryHits", async () => {
    const policy = new StubPolicyRepo([
      policyRow({ content: JSON.stringify({ weights: { ALPHA: 1.5, BETA: 1 }, maxInsights: 6 }) }),
    ]);
    const memory = new StubMemoryRepo([
      feedbackRow({ comment: "بینش آلفا درباره بازار مسکن تبریز خوب بود" }),
    ]);
    const agent = new StubAgent({ memory, policy });

    const res = await agent.renderInsights();
    expect(res.policyVersion).toBe(1);
    expect(res.insights).toHaveLength(2);
    expect(res.insights[0].domain).toBe("ALPHA"); // وزن ۱٫۵ بالاتر
    expect(res.insights[0].finalWeight).toBeGreaterThanOrEqual(1.5);

    const evt = memory.appended.find((a) => a.kind === "INTERACTION");
    expect(evt).toBeDefined();
    const payload = JSON.parse(evt.payloadJson);
    expect(payload.event).toBe("insight-render");
    expect(payload.insightCount).toBe(2);
    expect(payload.policyVersion).toBe(1);
  });

  test("maxInsights سیاست رعایت می‌شود", async () => {
    const policy = new StubPolicyRepo([
      policyRow({ content: JSON.stringify({ weights: { ALPHA: 1, BETA: 1 }, maxInsights: 1 }) }),
    ]);
    const agent = new StubAgent({ memory: new StubMemoryRepo(), policy });
    const res = await agent.renderInsights();
    expect(res.insights).toHaveLength(1);
  });
});
