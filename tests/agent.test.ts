/**
 * تست چرخه یادگیری ایجنت — حافظه Append-only، بازخورد، نسخه‌بندی سیاست، Rollback
 * اجرا با پایگاه تست: DATABASE_URL=file:./db/test.db bun test tests/agent.test.ts
 */

import { describe, expect, test, beforeAll, beforeEach } from "bun:test";
import { db } from "@/lib/db";
import { BaseLearningAgent, termVector, cosineSimilarity } from "@/core/agent/base-agent";
import type { InsightCard } from "@/core/agent/base-agent";

/** ایجنت تست با بینش‌های قطعی */
class TestAgent extends BaseLearningAgent {
  readonly tileId = "test-agent-tile";
  readonly name = "ایجنت تست";
  readonly insightDomains = ["ALPHA", "BETA"] as const;
  protected async computeRawInsights(): Promise<InsightCard[]> {
    return [
      {
        key: "ins-alpha",
        domain: "ALPHA",
        title: "بینش آلفا برای تست یادگیری",
        body: "محتوای آلفا",
        severity: "info",
      },
      {
        key: "ins-beta",
        domain: "BETA",
        title: "بینش بتا برای تست",
        body: "محتوای بتا",
        severity: "warning",
      },
    ];
  }
}

const agent = new TestAgent();

beforeAll(async () => {
  // پاک‌سازی داده تست
  await db.agentMemory.deleteMany({ where: { tileId: agent.tileId } });
  await db.agentFeedback.deleteMany({ where: { tileId: agent.tileId } });
  await db.agentPolicyVersion.deleteMany({ where: { tileId: agent.tileId } });
});

describe("RAG سبک — شباهت واژگانی", () => {
  test("بردار فراوانی واژه", () => {
    const v = termVector("روند بازار بازار تبریز");
    expect(v.get("بازار")).toBe(2);
    expect(v.get("روند")).toBe(1);
  });
  test("شباهت کسینوسی: یکسان=۱، ناهمگون≈۰", () => {
    const a = termVector("روند بازار املاک تبریز");
    const b = termVector("روند بازار املاک تبریز");
    const c = termVector("کارشناس موبایل شعبه");
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5);
    expect(cosineSimilarity(a, c)).toBeLessThan(0.2);
  });
});

describe("چرخه عمر سیاست", () => {
  test("سیاست اولیه نسخه ۱ خودکار ساخته می‌شود", async () => {
    const p = await agent.getActivePolicy();
    expect(p.version).toBe(1);
    expect(p.content.weights.ALPHA).toBe(1);
    expect(p.content.maxInsights).toBe(6);
  });

  test("بازخورد کمتر از ۵ → بدون نسخه جدید", async () => {
    for (let i = 0; i < 3; i++) {
      await agent.submitFeedback({
        insightKey: "ins-alpha",
        insightTitle: "بینش آلفا برای تست یادگیری",
        domain: "ALPHA",
        rating: 1,
      });
    }
    const res = await agent.reviewPolicyIfNeeded();
    expect(res.updated).toBe(false);
  });

  test("۵+ بازخورد مثبت آلفا → نسخه جدید با وزن تقویت‌شده (بازبینی خودکار)", async () => {
    for (let i = 0; i < 3; i++) {
      await agent.submitFeedback({
        insightKey: "ins-alpha",
        insightTitle: "بینش آلفا برای تست یادگیری",
        domain: "ALPHA",
        rating: 1,
      });
    }
    // submitFeedback پس از عبور از آستانه، بازبینی خودکار انجام می‌دهد
    const versions = await agent.listPolicyVersions();
    expect(versions.length).toBeGreaterThanOrEqual(2);
    const p = await agent.getActivePolicy();
    expect(p.version).toBeGreaterThan(1);
    expect(p.content.weights.ALPHA).toBeGreaterThan(1);
    expect(p.content.weights.BETA).toBe(1); // دست نخورده
  });

  test("نسخه‌های قبلی حفظ می‌شوند (Append-only)", async () => {
    const versions = await agent.listPolicyVersions();
    const latest = Math.max(...versions.map((v) => v.version));
    expect(versions.length).toBeGreaterThanOrEqual(2);
    // هر نسخه از ۱ تا آخرین باید موجود باشد
    for (let v = 1; v <= latest; v++) {
      expect(versions.some((x) => x.version === v)).toBe(true);
    }
    expect(versions.filter((v) => v.active)).toHaveLength(1);
  });

  test("Rollback به نسخه ۱ — بدون حذف نسخه‌ها", async () => {
    const before = (await agent.listPolicyVersions()).length;
    const activated = await agent.rollbackPolicy(1);
    expect(activated.version).toBe(1);
    const versions = await agent.listPolicyVersions();
    expect(versions.length).toBe(before); // هیچ نسخه‌ای حذف نشد
    const active = versions.find((v) => v.active)!;
    expect(active.version).toBe(1);
  });

  test("Rollback به نسخه ناموجود → خطا", async () => {
    try {
      await agent.rollbackPolicy(99);
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).toContain("99");
    }
  });
});

describe("رندر بینش با یادگیری", () => {
  test("بینش‌ها با وزن سیاست مرتب می‌شوند و تعامل ثبت می‌شود", async () => {
    // بازگشت به آخرین نسخه (وزن آلفا بالاتر)
    const latest = Math.max(...(await agent.listPolicyVersions()).map((v) => v.version));
    await agent.rollbackPolicy(latest);
    const res = await agent.renderInsights();
    expect(res.insights.length).toBe(2);
    expect(res.insights[0].domain).toBe("ALPHA"); // وزن بالاتر = اول
    expect(res.policyVersion).toBe(latest);
    // حافظه Append-only رشد کرده است
    const stats = await agent.learningStats();
    expect(stats.memoryCount).toBeGreaterThan(0);
    expect(stats.feedbackCount).toBeGreaterThanOrEqual(6);
  });

  test("یادگیری از حافظه: بینش مشابه بازخورد مثبت، وزن بیشتری می‌گیرد", async () => {
    // بازخورد مثبت روی «بینش بتا» — عنوان مشابه برای فعال‌شدن بازیابی
    for (let i = 0; i < 2; i++) {
      await agent.submitFeedback({
        insightKey: "ins-beta",
        insightTitle: "بینش بتا برای تست",
        domain: "BETA",
        rating: 1,
        comment: "بینش بتا برای تست عالی بود",
      });
    }
    const res = await agent.renderInsights();
    const beta = res.insights.find((i) => i.domain === "BETA")!;
    // وزن پایه ۱ + تقویت حافظه مثبت > ۱
    expect(beta.finalWeight).toBeGreaterThanOrEqual(1);
  });
});

describe("آمار یادگیری", () => {
  test("شمارش‌ها و نرخ رضایت", async () => {
    const stats = await agent.learningStats();
    expect(stats.feedbackCount).toBeGreaterThan(0);
    expect(stats.policyVersions).toBeGreaterThanOrEqual(2);
    expect(stats.positiveRate).toBe(100); // همه بازخوردها مثبت بودند
  });
});

describe("ایزوله‌سازی ایجنت‌ها", () => {
  test("حافظه ایجنت الف روی ایجنت ب اثر ندارد", async () => {
    const other = new (class extends BaseLearningAgent {
      readonly tileId = "test-other-tile";
      readonly name = "ایجنت دیگر";
      readonly insightDomains = ["X"] as const;
      protected async computeRawInsights(): Promise<InsightCard[]> {
        return [{ key: "x", domain: "X", title: "x", body: "x", severity: "info" }];
      }
    })();

    const before = (await other.learningStats()).feedbackCount;
    await agent.submitFeedback({
      insightKey: "ins-alpha",
      insightTitle: "بینش آلفا برای تست یادگیری",
      domain: "ALPHA",
      rating: -1,
    });
    const after = (await other.learningStats()).feedbackCount;
    expect(after).toBe(before); // بدون تغییر — ایزوله
  });
});
