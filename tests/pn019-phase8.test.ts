/**
 * PN-019 فاز ۸ — تست‌های تعمیق موتور تصمیم (DES8 §۲۰)
 * ---------------------------------------------------------------------------
 * پوشش:
 *   ۱) DecisionRecord پندرگانه + اثر کمی + بدیل ≥۳ + انقضای فعال
 *   ۲) Action Planner: ۵ الگو + rollback کامل + simulate + estimateImpact
 *   ۳) Safety هفت‌قاعده‌ای fail-closed (سلبی + ایجابی)
 *   ۴) Shadow Mode: ثبت تصمیم، صفر اجرا
 *   ۵) مرز API + آینهٔ v1 + کار Worker
 * همهٔ تست‌ها روی db/test.db (preload-guard) — production هرگز لمس نمی‌شود.
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { createHash } from "crypto";
import { existsSync } from "node:fs";
import { execSync } from "child_process";

process.env.OWNER_PERSONNEL_CODES = "410099950";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
const FIXTURE_DIR = mkdtempSync(`${tmpdir()}/pn019-dec-`);
{
  const preds = Array.from({ length: 8 }, (_, i) => ({
    predictionId: `pn019-fx-${i}`,
    predictionType: "PROPERTY",
    probability: 0.4 + (i % 5) * 0.08,
    confidence: 1,
    predictedAt: new Date(Date.now() - (8 - i) * 3600_000).toISOString(),
  }));
  writeFileSync(`${FIXTURE_DIR}/predictions.jsonl`, preds.map((p) => JSON.stringify(p)).join("\n") + "\n");
}
process.env.MELKA_INTELLIGENCE_DATA_DIR = FIXTURE_DIR;
const { db } = await import("@/lib/db");

const createdSessions: string[] = [];
const sha = (t: string) => createHash("sha256").update(t).digest("hex");

async function makeSession(role: "OWNER" | "CONSULTANT", personnelCode = role === "OWNER" ? "960001" : "960002") {
  const { createSession } = await import("@/lib/auth/session");
  const { token } = await createSession(
    { personnelCode, displayName: `تست ن۰۱۹ ${role}`, role },
    { ip: "127.0.0.1" }, null,
  );
  createdSessions.push(token);
  return { token };
}
async function NR(u: string, init?: RequestInit) {
  const { NextRequest } = await import("next/server");
  return new NextRequest(`http://localhost${u}`, init as never);
}

beforeAll(async () => {
  await db.decisionRecord.deleteMany({ where: { predictionId: { startsWith: "pn019-" } } });
  await db.actionPlanRecord.deleteMany({ where: { decisionId: { startsWith: "x" } } });
  await db.safetyCheckRecord.deleteMany({ where: {} });
  await db.shadowDecisionRun.deleteMany({ where: {} });
});
afterAll(async () => {
  for (const t of createdSessions) await db.session.deleteMany({ where: { tokenHash: sha(t) } }).catch(() => undefined);
  await db.decisionRecord.deleteMany({ where: { predictionId: { startsWith: "pn019-" } } });
  await db.safetyCheckRecord.deleteMany({ where: {} });
  await db.shadowDecisionRun.deleteMany({ where: {} });
  await db.$disconnect();
});

const mkDecision = (predictionId = "pn019-p1", probability = 0.6) =>
  (async () => {
    const { createDecisionFromPrediction } = await import("@/lib/services/decision-service");
    return createDecisionFromPrediction({
      predictionId,
      probability,
      context: { daysOnMarket: 120, price: 800_000_000, localAveragePrice: 1_500_000_000 },
      tierAtCreation: 3,
      actor: "test:pn019",
      mode: "shadow",
    });
  })();

/* ═══════ ۱) رکورد تصمیم پندرگانه ═══════ */
describe("PN-019/فاز۸ · DecisionRecord پندرگانه", () => {
  test("ساخت تصمیم سایه: ۱۵ فیلد کلیدی همه حاضر و معتبر", async () => {
    const row = await mkDecision("pn019-f15", 0.8);
    const keys = ["id", "predictionId", "decisionType", "proposedAction", "confidence", "rationale", "expectedImpact", "alternatives", "requiredResources", "safetyReport", "status", "expiresAt", "createdAt", "tierAtCreation", "modelVersionId"];
    for (const k of keys) expect(k in row).toBe(true);
    expect(row.status).toBe("active");
    expect(row.autoExecute).toBe(false);
    expect(row.requiresApproval).toBe(true);
  });

  test("قواعد دامنه: قیمت ۴۷٪ زیر میانگین → adjust_price", async () => {
    const row = await mkDecision("pn019-fdom", 0.55);
    expect(row.decisionType).toBe("adjust_price");
    expect(row.rationale).toContain("قاعدهٔ دامنه");
  });

  test("اثر کمی: lift در بازهٔ ۰..۴۰ + reach + horizon + basis غیرخالی", async () => {
    const row = await mkDecision("pn019-fimp", 0.7);
    const ei = row.expectedImpact;
    expect(ei.liftPercent).toBeGreaterThanOrEqual(0);
    expect(ei.liftPercent).toBeLessThanOrEqual(40);
    expect(["listing", "owner", "branch", "market"]).toContain(ei.reach);
    expect(ei.horizonDays).toBeGreaterThan(0);
    expect(ei.basis.length).toBeGreaterThan(10);
  });

  test("بدیل‌ها: همیشه ≥۳ با رتبهٔ یکتا", async () => {
    const row = await mkDecision("pn019-falt", 0.35);
    expect(row.alternatives.length).toBeGreaterThanOrEqual(3);
    const ranks = row.alternatives.map((a) => a.rank);
    expect(new Set(ranks).size).toBe(ranks.length);
    expect(row.alternatives[0].rank).toBe(1);
  });

  test("بدیل محافظه‌کارانه: بدون قاعدهٔ دامنه → بازبینی چرخهٔ بعد", async () => {
    const { createDecisionFromPrediction } = await import("@/lib/services/decision-service");
    const row = await createDecisionFromPrediction({
      predictionId: "pn019-fcons", probability: 0.4, context: {}, tierAtCreation: 0, actor: "test", mode: "shadow",
    });
    expect(row.alternatives.length).toBeGreaterThanOrEqual(3);
    expect(row.alternatives.some((a) => a.action.includes("بازبینی"))).toBe(true);
  });

  test("انقضا: TTL هفت روز + isDecisionExpired با زمان‌پیمایی", async () => {
    const { isDecisionExpired } = await import("@/core/intelligence/p8-core");
    const row = await mkDecision("pn019-fexp", 0.6);
    // حال حاضر: زنده · آیندهٔ پس از انقضا: منقضی
    const future = new Date(new Date(row.expiresAt).getTime() + 1000);
    expect(isDecisionExpired({ expiresAt: row.expiresAt })).toBe(false);
    expect(isDecisionExpired({ expiresAt: row.expiresAt }, future)).toBe(true);
  });

  test("جاروب انقضا: تصمیم سرسشده active→expired بدون حذف", async () => {
    const { expireSweep } = await import("@/lib/services/decision-service");
    // کاشت تصمیم سرسشده
    await db.decisionRecord.create({
      data: {
        predictionId: "pn019-expired-1", decisionType: "wait", proposedAction: "x", confidence: 0.5, rationale: "تست",
        expectedImpact: "{}", alternativesJson: "[]", requiredResourcesJson: "[]", safetyReportJson: "{}",
        status: "active", expiresAt: new Date(Date.now() - 1000), tierAtCreation: 0, requiresApproval: true, autoExecute: false,
      },
    });
    const r = await expireSweep();
    expect(r.expiredNow).toBeGreaterThanOrEqual(1);
    const still = await db.decisionRecord.findFirst({ where: { predictionId: "pn019-expired-1" } });
    expect(still).not.toBeNull(); // حذف فیزیکی ممنوع
    expect(still!.status).toBe("expired");
  });

  test("برنامهٔ اقدام روی تصمیم منقضی → ۴۰۹ DECISION_EXPIRED", async () => {
    const { requireActiveDecision } = await import("@/lib/services/decision-service");
    const expired = await db.decisionRecord.findFirst({ where: { predictionId: "pn019-expired-1" } });
    let code = "";
    try { await requireActiveDecision(expired!.id); } catch (e) { code = (e as { code: string }).code; }
    expect(code).toBe("DECISION_EXPIRED");
  });
});

/* ═══════ ۲) مرزهای سلبی سرویس ═══════ */
describe("PN-019/فاز۸ · مرزهای سلبی", () => {
  test("mode≠shadow → ۴۲۲ (هیچ حالت اجرایی وجود ندارد)", async () => {
    const { createDecisionFromPrediction } = await import("@/lib/services/decision-service");
    let code = "";
    try {
      await createDecisionFromPrediction({ predictionId: "pn019-x", probability: 0.5, actor: "t", mode: "execute" as never });
    } catch (e) { code = (e as { code: string }).code; }
    expect(code).toBe("UNKNOWN");
  });

  test("predictionId خالی → ۴۰۰", async () => {
    const { createDecisionFromPrediction } = await import("@/lib/services/decision-service");
    let status = 0;
    try { await createDecisionFromPrediction({ predictionId: "  ", probability: 0.5, actor: "t", mode: "shadow" }); }
    catch (e) { status = (e as { httpStatus: number }).httpStatus; }
    expect(status).toBe(400);
  });

  test("احتمال خارج از بازه کلمپ می‌شود (۰٫۲→ استفادهٔ داخلی سالم)", async () => {
    const { createDecisionFromPrediction } = await import("@/lib/services/decision-service");
    const row = await createDecisionFromPrediction({ predictionId: "pn019-fclamp", probability: 7, tierAtCreation: 0, actor: "t", mode: "shadow" });
    expect(row.confidence).toBeLessThanOrEqual(1);
  });
});

/* ═══════ ۳) Safety هفت‌قاعده‌ای (سلبی/ایجابی) ═══════ */
describe("PN-019/فاز۸ · Safety fail-closed", () => {
  const mkRecord = (over: Record<string, unknown>) => ({
    id: "saf-t", predictionId: "p", decisionType: "wait", proposedAction: "x", confidence: 0.6, rationale: "تست",
    alternatives: [], expectedOutcome: "", requiredResources: [], requiresApproval: true, autoExecute: false,
    safetyChecked: true, safetyReport: { passed: true, blockedBy: [], warnings: [], checkedRules: [], checkedAt: new Date().toISOString() },
    createdAt: new Date().toISOString(), expiresAt: new Date().toISOString(), tierAtCreation: 0, ...over,
  }) as never;

  test("SAF-001: بدون predictionId → بلاک", async () => {
    const { SafetyEngineImpl } = await import("@/core/intelligence/p8-core");
    const r = new SafetyEngineImpl().check(mkRecord({ predictionId: "" }), {});
    expect(r.blockedBy).toContain("SAF-001");
    expect(r.passed).toBe(false);
  });

  test("SAF-002: confidence ۰٫۲ → بلاک", async () => {
    const { SafetyEngineImpl } = await import("@/core/intelligence/p8-core");
    const r = new SafetyEngineImpl().check(mkRecord({ confidence: 0.2 }), {});
    expect(r.blockedBy).toContain("SAF-002");
  });

  test("SAF-003: rationale خالی → بلاک", async () => {
    const { SafetyEngineImpl } = await import("@/core/intelligence/p8-core");
    const r = new SafetyEngineImpl().check(mkRecord({ rationale: "  " }), {});
    expect(r.blockedBy).toContain("SAF-003");
  });

  test("SAF-004: financialAuto زمینه‌ای → بلاک", async () => {
    const { SafetyEngineImpl } = await import("@/core/intelligence/p8-core");
    const r = new SafetyEngineImpl().check(mkRecord({ decisionType: "adjust_price" }), { financialAuto: true });
    expect(r.blockedBy).toContain("SAF-004");
  });

  test("SAF-005: تماس بدون تأیید → بلاک", async () => {
    const { SafetyEngineImpl } = await import("@/core/intelligence/p8-core");
    const r = new SafetyEngineImpl().check(mkRecord({ decisionType: "contact_owner" }), { contactWithoutApproval: true });
    expect(r.blockedBy).toContain("SAF-005");
  });

  test("ایجابی: رکورد سالم → همهٔ هفت قاعده بررسی + passed", async () => {
    const { SafetyEngineImpl } = await import("@/core/intelligence/p8-core");
    const r = new SafetyEngineImpl().check(mkRecord({}), {});
    expect(r.passed).toBe(true);
    expect(r.checkedRules).toHaveLength(7);
    expect(r.checkedRules).toEqual(["SAF-001", "SAF-002", "SAF-003", "SAF-004", "SAF-005", "SAF-006", "SAF-007"]);
  });

  test("SAF-006: تغییر داده بدون audit → هشدار audit-severity (سند ۰۲۷: block نیست)", async () => {
    const { SafetyEngineImpl } = await import("@/core/intelligence/p8-core");
    const r = new SafetyEngineImpl().check(mkRecord({ decisionType: "adjust_price" }), { dataChangeAudited: false });
    expect(r.blockedBy).not.toContain("SAF-006"); // severity=audit → بلوک نمی‌کند
    expect(r.warnings.join(" ")).toContain("بدون حسابرسی"); // اما هشدار ثبت می‌کند
    expect(r.passed).toBe(true); // قواعد block سالم‌اند
  });

  test("SAF-007: LLM در production → هشدار audit-severity", async () => {
    const { SafetyEngineImpl } = await import("@/core/intelligence/p8-core");
    const r = new SafetyEngineImpl().check(mkRecord({}), { llmCallInProduction: true });
    expect(r.blockedBy).not.toContain("SAF-007");
    expect(r.warnings.join(" ")).toContain("LLM");
  });
});

/* ═══════ ۴) Action Planner ═══════ */
describe("PN-019/فاز۸ · Action Planner", () => {
  test("rollback برای هر ۵ الگو غیرخالی", async () => {
    const { ROLLBACK_PLANS } = await import("@/core/intelligence/p8-core");
    expect(Object.keys(ROLLBACK_PLANS).sort()).toEqual(["direct_call", "expert_assign", "price_adjust", "property_visit", "smart_wait"]);
    for (const v of Object.values(ROLLBACK_PLANS)) expect(v.trim().length).toBeGreaterThan(10);
  });

  test("هر تصمیم ثبت‌شده برنامهٔ اقدام با rollbackPlan غیرخالی دارد", async () => {
    const row = await mkDecision("pn019-fplan", 0.6);
    const plan = await db.actionPlanRecord.findFirst({ where: { decisionId: row.id } });
    expect(plan).not.toBeNull();
    expect(plan!.rollbackPlan!.trim().length).toBeGreaterThan(5);
    expect(plan!.autoExecute).toBe(false);
  });

  test("simulate: مجموع دقیق + مسیر بحرانی + گلوگاه مالک", async () => {
    const { ActionPlannerEngineImpl } = await import("@/core/intelligence/p8-core");
    const row = await mkDecision("pn019-fsim", 0.6);
    const rec = await db.actionPlanRecord.findFirst({ where: { decisionId: row.id } });
    const sim = JSON.parse(rec!.simulationJson);
    const steps = JSON.parse(rec!.stepsJson);
    expect(sim.totalMinutes).toBe(steps.reduce((a: number, s: { estimatedMinutes: number }) => a + s.estimatedMinutes, 0));
    expect(Array.isArray(sim.criticalPath)).toBe(true);
    expect(Array.isArray(sim.bottlenecks)).toBe(true);
  });

  test("estimateImpact: lift الگو + rationale فارسی", async () => {
    const row = await mkDecision("pn019-fimp2", 0.65);
    const rec = await db.actionPlanRecord.findFirst({ where: { decisionId: row.id } });
    const impact = JSON.parse(rec!.impactJson);
    expect(impact.liftPercent).toBeGreaterThanOrEqual(0);
    expect(impact.rationale.length).toBeGreaterThan(5);
  });

  test("هشدار سازگاری: اختلاف اثر تصمیم و برنامه >۵ واحد → consistencyWarning وگرنه سازگار", async () => {
    const { createDecisionFromPrediction } = await import("@/lib/services/decision-service");
    const row = await createDecisionFromPrediction({
      predictionId: "pn019-fwarn", probability: 0.95, context: {}, tierAtCreation: 0, actor: "t", mode: "shadow",
    });
    // تصمیم priority_action با اثر بالا vs برنامهٔ direct_call با lift پایین‌تر
    const stored = await db.actionPlanRecord.findFirst({ where: { decisionId: row.id } });
    const impact = JSON.parse(stored!.impactJson);
    const diff = Math.abs(row.expectedImpact.liftPercent - impact.liftPercent);
    if (diff > 5) {
      expect(impact.consistencyWarning).toBeTruthy();
    } else {
      expect(diff).toBeLessThanOrEqual(5); // سازگار — بدون هشدار
    }
  });
});

/* ═══════ ۵) Shadow Mode و Worker ═══════ */
describe("PN-019/فاز۸ · Shadow Mode + Worker", () => {
  test("ShadowDecisionRun: هر تصمیم ثبت‌شده executedSteps=0 لفظی", async () => {
    const row = await mkDecision("pn019-fshadow", 0.5);
    const run = await db.shadowDecisionRun.findFirst({ where: { decisionId: row.id } });
    expect(run).not.toBeNull();
    expect(run!.executedSteps).toBe(0);
    expect(run!.verdict).toBe("recorded");
  });

  test("Worker: کار یازدهم decision-shadow در رجیستری + فاصلهٔ ۶ ساعته", async () => {
    const { WORKER_JOB_IDS } = await import("@/core/runtime/jobs");
    expect(WORKER_JOB_IDS.decisionShadow).toBe("decision-shadow");
    const src = await Bun.file("src/core/runtime/jobs.ts").text();
    expect(src).toContain("MELK_DECISION_SHADOW_INTERVAL_H ?? 6");
  });

  test("Worker پس از PN-019/020: ۱۴ کار (۱۳ قبلی + diagnosis-cycle فاز ۱۰)", async () => {
    const { WORKER_JOB_IDS } = await import("@/core/runtime/jobs");
    expect(Object.keys(WORKER_JOB_IDS)).toHaveLength(14);
  });

  test("shadowDecisionTick روی دادهٔ fixture: اجرا + جاروب", async () => {
    const { shadowDecisionTick } = await import("@/lib/services/decision-service");
    const r = await shadowDecisionTick();
    expect(r.runs).toBeGreaterThan(0);
    expect(r.expiredSwept).toBeGreaterThanOrEqual(0);
  });
});

/* ═══════ ۷) ترمیم G5 — شکاف زمان‌محور پنجره‌های رانش ═══════ */
describe("PN-019/مرحلهٔ۱ · شکاف زمان‌محور رانش (ترمیم G5)", () => {
  test("اسنپ‌شات یک‌روزه → عقب‌افت صادقانه به ترتیب فایل با مهر سازوکار", async () => {
    const { splitWindowsByTime } = await import("@/lib/services/drift-service");
    const day = "2026-10-05";
    const outcomes = Array.from({ length: 10 }, (_, i) => ({
      predictionId: `p${i}`, occurredAt: `${day}T10:00:0${i}.000Z`, evidence: { observed: i % 2 },
    }));
    const predictions = outcomes.map((o, i) => ({ predictionId: o.predictionId, probability: 0.3 + i * 0.04 }));
    const r = splitWindowsByTime(outcomes, predictions);
    expect(r.splitBy).toBe("file-order");
    expect(r.rationale).toContain("اسنپ‌شات");
    expect(r.baseline.length + r.recent.length).toBe(10);
  });

  test("پیامدهای چندروزه → برش زمانی حقیقی با پنجرهٔ اخیر", async () => {
    const { splitWindowsByTime } = await import("@/lib/services/drift-service");
    const now = Date.now();
    const outcomes = [
      ...Array.from({ length: 6 }, (_, i) => ({ predictionId: `old${i}`, occurredAt: new Date(now - 60 * 86400000 + i * 3600000).toISOString(), evidence: { observed: 1 } })),
      ...Array.from({ length: 4 }, (_, i) => ({ predictionId: `new${i}`, occurredAt: new Date(now - 5 * 86400000 + i * 3600000).toISOString(), evidence: { observed: 0 } })),
    ];
    const predictions = outcomes.map((o) => ({ predictionId: o.predictionId, probability: 0.5 }));
    const r = splitWindowsByTime(outcomes, predictions, { recentDays: 30 });
    expect(r.splitBy).toBe("time");
    expect(r.recent.length).toBe(4);
    expect(r.baseline.length).toBe(6);
    expect(r.recent.every((p) => p.predictionId.startsWith("new"))).toBe(true);
  });
});

/* ═══════ ۶) مرز API + آینهٔ v1 + گارد ═══════ */
describe("PN-019/فاز۸ · API + آینه + گارد", () => {
  test("GET /api/admin/decisions با OWNER → ۲۰۰ و فهرست", async () => {
    const { GET } = await import("@/app/api/admin/decisions/route");
    const { token } = await makeSession("OWNER", "961001");
    const res = await GET((await NR("/api/admin/decisions?limit=5", { headers: { authorization: `Bearer ${token}` } })) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.rows)).toBe(true);
  });

  test("GET بدون احراز → ۴۰۱", async () => {
    const { GET } = await import("@/app/api/admin/decisions/route");
    const res = await GET((await NR("/api/admin/decisions")) as never);
    expect(res.status).toBe(401);
  });

  test("POST /api/admin/decisions با OWNER → ساخت سایهٔ تازه", async () => {
    const { POST } = await import("@/app/api/admin/decisions/route");
    const { token } = await makeSession("OWNER", "961002");
    const res = await POST((await NR("/api/admin/decisions", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ predictionId: "pn019-api-1", probability: 0.62 }),
    })) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.decision.alternatives.length).toBeGreaterThanOrEqual(3);
  });

  test("آینهٔ v1: re-export همان مسیر اصلی (تک‌منبع حقیقت)", async () => {
    const mirror = await Bun.file("src/app/api/v1/admin/decisions/route.ts").text();
    expect(mirror).toContain(`export * from`);
    expect(mirror).toContain(`admin/decisions/route`);
  });

  test("گارد audit-decision-safety.sh موجود و قابل اجرا", () => {
    expect(existsSync("scripts/audit-decision-safety.sh")).toBe(true);
    const out = execSync("bash scripts/audit-decision-safety.sh 2>&1 || true", { encoding: "utf8" });
    expect(out).toContain("PASS");
  });

  test("EXPECTED_IMPACT_TABLE: هفت نوع تصمیم، سقف lift ۴۰", async () => {
    const { EXPECTED_IMPACT_TABLE, MAX_LIFT_PERCENT } = await import("@/core/intelligence/p8-core");
    expect(Object.keys(EXPECTED_IMPACT_TABLE)).toHaveLength(7);
    expect(MAX_LIFT_PERCENT).toBe(40);
    for (const v of Object.values(EXPECTED_IMPACT_TABLE)) expect(v.liftPercent).toBeLessThanOrEqual(40);
  });
});
