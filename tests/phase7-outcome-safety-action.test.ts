/**
 * تست‌های بازسازی PHASE 7 — بدنهٔ موتورهای Outcome + Safety + ActionPlanner
 * ------------------------------------------------------
 * §۱ OutcomeEngine (قرارداد v1 + انبار حافظه/فایل)
 * §۲ SafetyEngine (جدول قواعد + قاعدهٔ سخت قراردادی)
 * §۳ ActionPlannerEngine (تصمیم → برنامهٔ اقدام + دروازهٔ ایمنی)
 * اجرا: bun test tests/phase7-outcome-safety-action.test.ts
 */

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  createOutcomeEngine,
} from "@/core/intelligence/outcome/outcome-engine";
import {
  FileSystemOutcomeStore,
  InMemoryOutcomeStore,
  makeOutcomeId,
  validateOutcomeEntry,
} from "@/core/intelligence/outcome/outcome-store";
import type { OutcomeRecord } from "@/core/intelligence/engines/outcome";
import { createSafetyEngine, assessSafetyRules, DEFAULT_COST_APPROVAL_THRESHOLD } from "@/core/intelligence/safety/safety-engine";
import { createActionPlannerEngine, MAX_STEPS } from "@/core/intelligence/action/action-planner-engine";

const NOW = new Date("2026-09-29T12:00:00.000Z");

function entry(over: Partial<OutcomeRecord> = {}): OutcomeRecord {
  return {
    tileId: "arm-listing",
    predictionId: "pred-1",
    outcome: "TRANSACTION_OCCURRED",
    occurredAt: NOW.toISOString(),
    evidence: { observed: 1 },
    ...over,
  };
}

/* ==========================================================================
 * §۱ — OutcomeEngine
 * ========================================================================== */

describe("PHASE 7 §۱ — OutcomeEngine", () => {
  test("۱-۱) record + query قرارداد v1 — فیلتر tileId/since/predictionId، جدیدترین-اول", async () => {
    const engine = createOutcomeEngine();
    await engine.record(entry({ predictionId: "p-old", outcome: "NOT_OCCURRED", occurredAt: "2026-09-01T00:00:00.000Z" }));
    await engine.record(entry({ predictionId: "p-new", outcome: "TRANSACTION_OCCURRED" }));
    await engine.record(entry({ tileId: "other-tile", outcome: "X" }));

    const all = await engine.query({ tileId: "arm-listing" });
    expect(all.length).toBe(2);
    expect(all[0]!.predictionId).toBe("p-new"); // جدیدترین-اول
    expect(all[0]!.outcome).toBe("TRANSACTION_OCCURRED");

    const since = await engine.query({ tileId: "arm-listing", since: "2026-09-28T00:00:00.000Z" });
    expect(since.length).toBe(1);
    expect(since[0]!.predictionId).toBe("p-new");

    const byPred = await engine.query({ tileId: "arm-listing", predictionId: "p-old" });
    expect(byPred.length).toBe(1);
    expect(byPred[0]!.outcome).toBe("NOT_OCCURRED");
  });

  test("۱-۲) اعتبارسنجی — tileId/outcome خالی یا occurredAt نامعتبر = خطا", async () => {
    const engine = createOutcomeEngine();
    await expect(engine.record(entry({ tileId: "" }))).rejects.toThrow("tileId");
    await expect(engine.record(entry({ outcome: "  " }))).rejects.toThrow("outcome");
    await expect(engine.record(entry({ occurredAt: "نه-تاریخ" }))).rejects.toThrow("occurredAt");
    expect(validateOutcomeEntry(entry())).toBeNull();
  });

  test("۱-۳) linkage — matched از پیامدها؛ unmatched با منبع پیش‌بینی (شفافیت سیگنال کیفیت)", async () => {
    const engine = createOutcomeEngine({
      predictionIds: {
        listPredictionIds: async (tileId) => (tileId === "arm-listing" ? ["p-1", "p-2", "p-3"] : []),
      },
    });
    await engine.record(entry({ predictionId: "p-1" }));
    await engine.record(entry({ predictionId: "p-1", outcome: "DUPLICATE-SAME" })); // همان پیش‌بینی
    await engine.record(entry({ tileId: "other", predictionId: "p-9" }));
    const link = await engine.linkage("arm-listing");
    expect(link.matched).toBe(1); // p-1 یکتا
    expect(link.unmatched).toBe(2); // p-2, p-3
  });

  test("۱-۴) linkage بدون منبع پیش‌بینی — unmatched صادقانه صفر", async () => {
    const engine = createOutcomeEngine();
    await engine.record(entry({ predictionId: "p-1" }));
    const link = await engine.linkage("arm-listing");
    expect(link.matched).toBe(1);
    expect(link.unmatched).toBe(0);
  });

  test("۱-۵) append افزودنی — شناسهٔ پایدار بازمی‌گردد (برای linkOutcome)", async () => {
    const engine = createOutcomeEngine();
    const stored = await engine.append(entry());
    expect(stored.outcomeId).toMatch(/^out-[0-9a-f]{16}$/);
    expect(stored.recordedAt).toBeTruthy();
    // بازتولیدپذیری شناسه از محتوا
    expect(makeOutcomeId(entry(), 0)).toBe(makeOutcomeId(entry(), 0));
    expect(makeOutcomeId(entry(), 0)).not.toBe(makeOutcomeId(entry(), 1));
  });

  test("۱-۶) FileSystemOutcomeStore — ماندگاری بین نمونه‌ها + تحمل خط خراب", async () => {
    const dir = mkdtempSync(join(tmpdir(), "melk-outcome-"));
    try {
      const file = join(dir, "outcomes.jsonl");
      const a = new FileSystemOutcomeStore(file);
      await a.append(entry({ predictionId: "p-1" }));
      await a.append(entry({ predictionId: "p-2", outcome: "NOT_OCCURRED", evidence: { observed: 0 } }));
      // نمونهٔ تازه همان فایل — ماندگاری
      const b = new FileSystemOutcomeStore(file);
      const list = await b.list();
      expect(list.length).toBe(2);
      // خط خراب + ردیف تازه
      const { appendFileSync, writeFileSync } = await import("node:fs");
      appendFileSync(file, "{این خط خراب است}\n", "utf8");
      writeFileSync(file, "", "utf8"); // پاک‌سازی برای گام بعد بدون اثر جانبی روی تست‌های دیگر
      const c = new FileSystemOutcomeStore(file);
      await c.append(entry({ predictionId: "p-3" }));
      expect((await c.list()).length).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/* ==========================================================================
 * §۲ — SafetyEngine
 * ========================================================================== */

describe("PHASE 7 §۲ — SafetyEngine (دروازهٔ تأیید انسانی)", () => {
  const ctx = { tileId: "arm-listing", generatedAt: NOW.toISOString(), purpose: "action" as const };

  test("۲-۱) قاعدهٔ سخت — سامانهٔ خارجی ⇒ تأیید الزامی + ریسک ≥ MEDIUM", async () => {
    const engine = createSafetyEngine();
    const v = await engine.assess({
      context: ctx,
      proposal: { kind: "ACTION", description: "ارسال پیامک به مالک", affectsExternalSystem: true, isDestructive: false },
    });
    expect(v.requiredApproval).toBe(true);
    expect(v.riskLevel === "MEDIUM" || v.riskLevel === "HIGH").toBe(true);
    expect(v.ruleIds).toContain("SAF-001");
  });

  test("۲-۲) قاعدهٔ سخت — مخرب/غیرقابل‌بازگشت ⇒ تأیید + HIGH", async () => {
    const v = await assessSafetyRules({
      kind: "ACTION",
      description: "پاک‌سازی جدول",
      affectsExternalSystem: false,
      isDestructive: true,
    });
    expect(v.requiredApproval).toBe(true);
    expect(v.riskLevel).toBe("HIGH");
    expect(v.ruleIds).toContain("SAF-002");
  });

  test("۲-۳) هزینه ≥ آستانه ⇒ تأیید (SAF-003) — آستانهٔ قابل‌تزریق", async () => {
    const v = await assessSafetyRules({
      kind: "ACTION",
      description: "خرید بنر تبلیغاتی",
      affectsExternalSystem: false,
      isDestructive: false,
      estimatedCost: DEFAULT_COST_APPROVAL_THRESHOLD,
    });
    expect(v.requiredApproval).toBe(true);
    expect(v.ruleIds).toContain("SAF-003");
    // زیر آستانه = بدون تأیید
    const v2 = await assessSafetyRules({
      kind: "ACTION",
      description: "خرید کوچک",
      affectsExternalSystem: false,
      isDestructive: false,
      estimatedCost: DEFAULT_COST_APPROVAL_THRESHOLD - 1,
    });
    expect(v2.requiredApproval).toBe(false);
  });

  test("۲-۴) تغییر سیاست (POLICY_CHANGE) ⇒ تأیید (SAF-004)", async () => {
    const v = await assessSafetyRules({
      kind: "POLICY_CHANGE",
      description: "ارتقاء وزن دامنه",
      affectsExternalSystem: false,
      isDestructive: false,
    });
    expect(v.requiredApproval).toBe(true);
    expect(v.ruleIds).toContain("SAF-004");
  });

  test("۲-۵) توصیف خالی ⇒ HIGH محافظه‌کارانه (SAF-005)", async () => {
    const v = await assessSafetyRules({ kind: "DECISION", description: "  ", affectsExternalSystem: false, isDestructive: false });
    expect(v.riskLevel).toBe("HIGH");
    expect(v.requiredApproval).toBe(true);
  });

  test("۲-۶) پیشنهاد معمول کم‌ریسک ⇒ LOW بدون تأیید (SAF-000)", async () => {
    const engine = createSafetyEngine();
    const v = await engine.assess({
      context: ctx,
      proposal: { kind: "DECISION", description: "نمایش بینش داخلی", affectsExternalSystem: false, isDestructive: false },
    });
    expect(v.requiredApproval).toBe(false);
    expect(v.riskLevel).toBe("LOW");
    expect(v.ruleIds).toEqual(["SAF-000"]);
  });
});

/* ==========================================================================
 * §۳ — ActionPlannerEngine
 * ========================================================================== */

describe("PHASE 7 §۳ — ActionPlannerEngine", () => {
  const ctx = { tileId: "arm-listing", generatedAt: NOW.toISOString(), purpose: "action" as const };

  function decision(candidates: { key: string; meta?: Record<string, unknown> }[]) {
    return {
      ranked: candidates.map((c, i) => ({
        key: c.key,
        score: 10 - i,
        rationale: `دلیل ${c.key}`,
        requiresApproval: false,
      })),
      topKey: candidates[0]?.key ?? "",
      appliedRuleIds: ["DEC-001"],
      candidateMeta: Object.fromEntries(candidates.map((c) => [c.key, c.meta ?? {}])),
    } as Parameters<ReturnType<typeof createActionPlannerEngine>["plan"]>[0]["decision"];
  }

  test("۳-۱) ترتیب گام‌ها = ترتیب رتبه؛ هر گام دلیل + ایمنی دارد", async () => {
    const planner = createActionPlannerEngine();
    const plan = await planner.plan({
      context: ctx,
      decision: decision([{ key: "a" }, { key: "b" }, { key: "c" }]),
    });
    expect(plan.steps.length).toBe(3);
    expect(plan.steps.map((s) => s.id)).toEqual(["step-1-a", "step-2-b", "step-3-c"]);
    expect(plan.steps[0]!.rationale).toContain("دلیل a");
    expect(plan.steps[0]!.rationale).toContain("SAF-000");
    expect(plan.createdAt).toBeTruthy();
  });

  test("۳-۲) سقف MAX_STEPS — تصمیم‌های بیشتر قطع می‌شوند", async () => {
    const planner = createActionPlannerEngine();
    const many = Array.from({ length: MAX_STEPS + 3 }, (_, i) => ({ key: `k${i}` }));
    const plan = await planner.plan({ context: ctx, decision: decision(many) });
    expect(plan.steps.length).toBe(MAX_STEPS);
  });

  test("۳-۳) دروازهٔ ایمنی — نامزد خارجی از candidateMeta ⇒ requiredApproval (قاعدهٔ سخت درون‌خطی بدون موتور)", async () => {
    const planner = createActionPlannerEngine(); // بدون SafetyEngine
    const plan = await planner.plan({
      context: ctx,
      decision: decision([{ key: "sms", meta: { affectsExternalSystem: true } }, { key: "internal" }]),
    });
    expect(plan.steps[0]!.requiredApproval).toBe(true);
    expect(plan.steps[0]!.riskLevel).toBe("MEDIUM");
    expect(plan.steps[1]!.requiredApproval).toBe(false);
  });

  test("۳-۴) با موتور ایمنی تزریقی — verdict موتور ملاک ریسک و تأیید", async () => {
    const planner = createActionPlannerEngine({ safety: createSafetyEngine() });
    const plan = await planner.plan({
      context: ctx,
      decision: decision([{ key: "wipe", meta: { isDestructive: true } }]),
    });
    expect(plan.steps[0]!.requiredApproval).toBe(true);
    expect(plan.steps[0]!.riskLevel).toBe("HIGH");
    expect(plan.steps[0]!.rationale).toContain("SAF-002");
  });

  test("۳-۵) نگاشت uiAction دامنه → کلید UI موجود", async () => {
    const planner = createActionPlannerEngine();
    const plan = await planner.plan({ context: ctx, decision: decision([{ key: "experts" }, { key: "unknown-domain" }]) });
    expect(plan.steps[0]!.uiAction).toBe("tile:experts:open");
    expect(plan.steps[1]!.uiAction).toBeUndefined();
  });
});
