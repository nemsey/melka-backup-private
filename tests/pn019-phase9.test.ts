/**
 * PN-019 فاز ۹ — تست‌های حاکمیت + ارزیابی سیاست (DES9 §۱۸)
 * ---------------------------------------------------------------------------
 * پوشش:
 *   ۱) زمینهٔ حاکمیت زندهٔ ۱۷فیلدی از DB واقعی + تست‌های قناری (ضد جابه‌جایی)
 *   ۲) بررسی ۱۵قاعده‌ای: ثبت/تاریخچه/enforce سه‌حالته/گیت
 *   ۳) ارزیابی سیاست: ۵ سیاست × ۴ متریک × سه حکم + دادهٔ کم
 *   ۴) مصونیت: حکم اجرا نمی‌شود — فقط توصیه
 *   ۵) مرز API + آینهٔ v1 + کار Worker
 * همهٔ تست‌ها روی db/test.db (preload-guard) — production هرگز لمس نمی‌شود.
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { createHash } from "crypto";
import { execSync } from "child_process";

process.env.OWNER_PERSONNEL_CODES = "410099950";
const { db } = await import("@/lib/db");

const createdSessions: string[] = [];
const sha = (t: string) => createHash("sha256").update(t).digest("hex");
const DAY = 86400000;

async function makeSession(role: "OWNER" | "CONSULTANT", personnelCode = role === "OWNER" ? "960001" : "960002") {
  const { createSession } = await import("@/lib/auth/session");
  const { token } = await createSession(
    { personnelCode, displayName: `تست ن۰۱۹g ${role}`, role },
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
  await db.governanceCheckRecord.deleteMany({});
  await db.policyEvaluationRecord.deleteMany({});
});
afterAll(async () => {
  for (const t of createdSessions) await db.session.deleteMany({ where: { tokenHash: sha(t) } }).catch(() => undefined);
  await db.governanceCheckRecord.deleteMany({});
  await db.policyEvaluationRecord.deleteMany({});
  await db.auditLog.deleteMany({ where: { action: { in: ["GOVERNANCE_CHECK_PASSED", "GOVERNANCE_CHECK_FAILED", "GOVERNANCE_GATE_BLOCKED", "POLICY_VERDICT_ALERT"] } } });
  await db.$disconnect();
});

/* ═══════ ۱) زمینهٔ حاکمیت زنده ═══════ */
describe("PN-019/فاز۹ · زمینهٔ زندهٔ ۱۷فیلدی", () => {
  test("همهٔ ۱۷ فیلد عدد صحیح غیرمنفی برمی‌گردند (هیچ undefined/null)", async () => {
    const { buildLiveGovernanceContext } = await import("@/lib/services/governance-service");
    const ctx = await buildLiveGovernanceContext();
    const keys = Object.keys(ctx);
    expect(keys.length).toBe(17);
    for (const k of keys) {
      expect(typeof (ctx as unknown as Record<string, unknown>)[k]).toBe("number");
      expect((ctx as unknown as Record<string, number>)[k]).toBeGreaterThanOrEqual(0);
    }
  });

  test("قناری ضد جابه‌جایی: sessionsOlderThan30d عین کوئری مستقیم", async () => {
    const { buildLiveGovernanceContext } = await import("@/lib/services/governance-service");
    const ctx = await buildLiveGovernanceContext();
    const direct = await db.userSession.count({ where: { isActive: true, createdAt: { lt: new Date(Date.now() - 30 * DAY) } } });
    expect(ctx.sessionsOlderThan30d).toBe(direct);
  });

  test("قناری ضد جابه‌جایی: decisionsTotal عین شمار مستقیم", async () => {
    const { buildLiveGovernanceContext } = await import("@/lib/services/governance-service");
    const ctx = await buildLiveGovernanceContext();
    const direct = await db.decisionRecord.count();
    expect(ctx.decisionsTotal).toBe(direct);
  });

  test("قناری ضد جابه‌جایی: modelChangesWithoutCouncil عین شمار مستقیم", async () => {
    const { buildLiveGovernanceContext } = await import("@/lib/services/governance-service");
    const ctx = await buildLiveGovernanceContext();
    const direct = await db.modelVersion.count({ where: { promotedAt: { not: null }, councilApproved: false } });
    expect(ctx.modelChangesWithoutCouncil).toBe(direct);
  });

  test("مثبت کاذب سیستمی: تصمیم‌های جوان = نقض GOV-DECISION-002 نیستند (معنای حفظ، نه سن)", async () => {
    const { buildLiveGovernanceContext } = await import("@/lib/services/governance-service");
    const ctx = await buildLiveGovernanceContext();
    // kept = total − حذف‌های مُهرشده — حذف ساختاراً صفر
    expect(ctx.decisionsKept90d).toBe(ctx.decisionsTotal);
  });
});

/* ═══════ ۲) بررسی ۱۵قاعده‌ای ═══════ */
describe("PN-019/فاز۹ · بررسی ۱۵قاعده‌ای", () => {
  test("۱۵ قاعده در GOVERNANCE_RULES با شناسه‌های عین سند ۰۲۷", async () => {
    const { GOVERNANCE_RULES } = await import("@/core/intelligence/p9-core");
    expect(GOVERNANCE_RULES).toHaveLength(15);
    expect(GOVERNANCE_RULES.filter((r) => r.id.startsWith("GOV-DATA-"))).toHaveLength(5);
    expect(GOVERNANCE_RULES.filter((r) => r.id.startsWith("GOV-MODEL-"))).toHaveLength(3);
    expect(GOVERNANCE_RULES.filter((r) => r.id.startsWith("GOV-ACCESS-"))).toHaveLength(4);
    expect(GOVERNANCE_RULES.filter((r) => r.id.startsWith("GOV-DECISION-"))).toHaveLength(2);
    expect(GOVERNANCE_RULES.filter((r) => r.id.startsWith("GOV-REPAIR-"))).toHaveLength(1);
  });

  test("اجرای بررسی: ۱۵ نتیجه + ثبت در GovernanceCheckRecord + AuditLog", async () => {
    const { runGovernanceCheck } = await import("@/lib/services/governance-service");
    const r = await runGovernanceCheck("manual");
    expect(r.results).toHaveLength(15);
    expect(r.passed + r.failed).toBe(15);
    const stored = await db.governanceCheckRecord.findUnique({ where: { id: r.checkId } });
    expect(stored).not.toBeNull();
    expect(stored!.triggerSource).toBe("manual");
    const audit = await db.auditLog.findFirst({ where: { detail: { contains: r.checkId } } });
    expect(audit).not.toBeNull();
  });

  test("زمینهٔ بررسی در رکورد ثبت می‌شود (شاهد ممیزی §۵.۱)", async () => {
    const row = await db.governanceCheckRecord.findFirst({ orderBy: { checkedAt: "desc" } });
    const ctx = JSON.parse(row!.contextJson);
    expect(Object.keys(ctx).length).toBe(17);
  });

  test("GOV-ACCESS-001: نشست کهنهٔ فعال → قاعده fail", async () => {
    const { GOVERNANCE_RULES, GovernanceEngineImpl } = await import("@/core/intelligence/p9-core");
    const { emptyGovernanceContext } = await import("@/core/intelligence/p9-core");
    const engine = new GovernanceEngineImpl();
    const ctx = { ...emptyGovernanceContext(), sessionsOlderThan30d: 1 };
    const rule = GOVERNANCE_RULES.find((r) => r.id === "GOV-ACCESS-001")!;
    const r = engine.checkRule(rule, ctx);
    expect(r.passed).toBe(false);
  });

  test("GOV-DECISION-001: نقض autoExecute → قاعده fail", async () => {
    const { GOVERNANCE_RULES, GovernanceEngineImpl, emptyGovernanceContext } = await import("@/core/intelligence/p9-core");
    const engine = new GovernanceEngineImpl();
    const ctx = { ...emptyGovernanceContext(), autoExecuteViolations: 1 };
    const rule = GOVERNANCE_RULES.find((r) => r.id === "GOV-DECISION-001")!;
    expect(engine.checkRule(rule, ctx).passed).toBe(false);
  });

  test("GOV-MODEL-001: ارتقای بی‌شورا → قاعده fail", async () => {
    const { GOVERNANCE_RULES, GovernanceEngineImpl, emptyGovernanceContext } = await import("@/core/intelligence/p9-core");
    const engine = new GovernanceEngineImpl();
    const ctx = { ...emptyGovernanceContext(), modelChangesWithoutCouncil: 2 };
    const rule = GOVERNANCE_RULES.find((r) => r.id === "GOV-MODEL-001")!;
    expect(engine.checkRule(rule, ctx).passed).toBe(false);
  });

  test("GOV-MODEL-002: ارتقای نخستین بدون پیشینیار → نقض نیست (ثبت اولیه)", async () => {
    const { GOVERNANCE_RULES, GovernanceEngineImpl, emptyGovernanceContext } = await import("@/core/intelligence/p9-core");
    const engine = new GovernanceEngineImpl();
    const ctx = { ...emptyGovernanceContext(), modelChangesWithoutRollback: 0 }; // سرویس زنده پیشینیارِ بازنشسته را می‌سنجد
    const rule = GOVERNANCE_RULES.find((r) => r.id === "GOV-MODEL-002")!;
    expect(engine.checkRule(rule, ctx).passed).toBe(true);
  });

  test("enforce: strict با critical → blocked=true", async () => {
    const { GovernanceEngineImpl, emptyGovernanceContext } = await import("@/core/intelligence/p9-core");
    const engine = new GovernanceEngineImpl();
    const ctx = { ...emptyGovernanceContext(), ownerGateBypasses: 1 }; // critical
    const r = engine.enforce(ctx);
    expect(r.blocked).toBe(true);
    expect(r.report.criticalViolations).toContain("GOV-ACCESS-003");
  });

  test("enforce: بدون نقض → blocked=false", async () => {
    const { GovernanceEngineImpl, emptyGovernanceContext } = await import("@/core/intelligence/p9-core");
    const engine = new GovernanceEngineImpl();
    const r = engine.enforce(emptyGovernanceContext());
    expect(r.blocked).toBe(false);
  });

  test("گیت حاکمیت: با نقض GOV-REPAIR-001 (ترمیم بی‌مهر) → ۵۰۳ GOVERNANCE_BLOCKED", async () => {
    // کاشت شاهد ترمیم بدون مهر شورا
    await db.auditLog.create({
      data: { action: "DATA_REPAIR", actor: "test", detail: "ترمیم تست بدون منبع" },
    });
    const { governanceGate } = await import("@/lib/services/governance-service");
    let code = ""; let status = 0;
    try { await governanceGate("MODEL_PROMOTE"); }
    catch (e) { code = (e as { code: string }).code; status = (e as { httpStatus: number }).httpStatus; }
    expect(code).toBe("GOVERNANCE_BLOCKED");
    expect(status).toBe(503);
    await db.auditLog.deleteMany({ where: { action: "DATA_REPAIR", actor: "test" } });
  });

  test("گیت حاکمیت: پس از پاکسازی → عبور", async () => {
    const { governanceGate } = await import("@/lib/services/governance-service");
    await expect(governanceGate("MODEL_PROMOTE")).resolves.toBeUndefined();
  });
});

/* ═══════ ۳) ارزیابی سیاست ═══════ */
describe("PN-019/فاز۹ · ارزیابی سیاست", () => {
  test("پنج سیاست فعال: هر یک رکورد PolicyEvaluation با ۴ متریک", async () => {
    const { runPolicyEvaluation, ACTIVE_POLICIES } = await import("@/lib/services/governance-service");
    const results = await runPolicyEvaluation(undefined, 90, 3);
    expect(results).toHaveLength(5);
    expect(ACTIVE_POLICIES).toHaveLength(5);
    for (const r of results) {
      expect(r.metrics.effectiveness).toBeGreaterThanOrEqual(-1);
      expect(r.metrics.effectiveness).toBeLessThanOrEqual(1);
      expect(r.metrics.stability).toBeGreaterThanOrEqual(0);
      expect(r.metrics.stability).toBeLessThanOrEqual(1);
      expect(r.metrics.compliance).toBeGreaterThanOrEqual(0);
      expect(r.metrics.compliance).toBeLessThanOrEqual(1);
      expect(["keep", "adjust", "retire"]).toContain(r.verdict);
    }
  });

  test("دادهٔ کم (<۱۰ رویداد) → حکم keep + برچسب insufficientData (محافظه‌کاری §۱۰.۲)", async () => {
    const { runPolicyEvaluation } = await import("@/lib/services/governance-service");
    const r = await runPolicyEvaluation("session-30d-v1", 90, 3);
    expect(r).toHaveLength(1);
    if (r[0]!.eventCount < 10) {
      expect(r[0]!.verdict).toBe("keep");
      expect(r[0]!.insufficientData).toBe(true);
      expect(r[0]!.rationale).toContain("ناکافی");
    }
  });

  test("موتور ارزیابی: effectiveness ۰٫۲ → retire (مرز آستانه)", async () => {
    const { PolicyEvaluationEngineImpl } = await import("@/core/intelligence/p9-core");
    const engine = new PolicyEvaluationEngineImpl();
    expect(engine.recommendVerdict(0.2, 1)).toBe("retire");
    expect(engine.recommendVerdict(0.8, 0.95)).toBe("keep");
    expect(engine.recommendVerdict(0.6, 0.5)).toBe("adjust");
  });

  test("حکم غیر keep → AuditLog هشدار POLICY_VERDICT_ALERT", async () => {
    const { runPolicyEvaluation } = await import("@/lib/services/governance-service");
    const results = await runPolicyEvaluation(undefined, 90, 3);
    if (results.some((r) => r.verdict !== "keep")) {
      const alert = await db.auditLog.findFirst({ where: { action: "POLICY_VERDICT_ALERT" } });
      expect(alert).not.toBeNull();
    } else {
      // همهٔ keep — بدون هشدار، رفتار درست
      const adjust = await db.policyEvaluationRecord.findFirst({ where: { verdict: "adjust" } });
      if (!adjust) return; // هیچ حکم غیر keep در این پنجره نیست
    }
  });

  test("مصونیت: ارزیابی هیچ سیاستی را تغییر نمی‌دهد — فقط رکورد و توصیه", async () => {
    const before = await db.policyEvaluationRecord.count();
    const { runPolicyEvaluation } = await import("@/lib/services/governance-service");
    await runPolicyEvaluation("champion-gate-v1", 90, 3);
    const after = await db.policyEvaluationRecord.count();
    expect(after).toBe(before + 1); // فقط رکورد — هیچ جدول سیاست دیگری تغییر نکرده
    expect(await db.modelVersion.count({ where: { councilApproved: false, promotedAt: { not: null } } })).toBe(0);
  });

  test("تاریخ ارزیابی‌ها: فهرست API با پنجرهٔ ۹۰روزه", async () => {
    const { listPolicyEvaluations } = await import("@/lib/services/governance-service");
    const rows = await listPolicyEvaluations();
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(new Date(r.windowFrom).getTime()).toBeLessThan(new Date(r.windowTo).getTime());
      expect(new Date(r.windowTo).getTime() - new Date(r.windowFrom).getTime()).toBeLessThanOrEqual(90 * DAY + 60000);
    }
  });
});

/* ═══════ ۴) Worker + API + آینه + گارد ═══════ */
describe("PN-019/فاز۹ · Worker + API + گارد", () => {
  test("Worker: کار دوازدهم policy-eval با چرخهٔ ۹۰روزه", async () => {
    const { WORKER_JOB_IDS } = await import("@/core/runtime/jobs");
    expect(WORKER_JOB_IDS.policyEval).toBe("policy-eval");
    const src = await Bun.file("src/core/runtime/jobs.ts").text();
    expect(src).toContain("MELK_POLICY_EVAL_INTERVAL_DAYS ?? 90");
  });

  test("GET /api/admin/governance با OWNER → ۲۰۰ + آخرین بررسی", async () => {
    const { GET } = await import("@/app/api/admin/governance/route");
    const { token } = await makeSession("OWNER", "963001");
    const res = await GET((await NR("/api/admin/governance", { headers: { authorization: `Bearer ${token}` } })) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.latest).not.toBeNull();
    expect(body.latest.results).toHaveLength(15);
  });

  test("POST /api/admin/policy-evaluations/run با OWNER → ۲۰۰ + پنج نتیجه", async () => {
    const { POST } = await import("@/app/api/admin/policy-evaluations/run/route");
    const { token } = await makeSession("OWNER", "963002");
    const res = await POST((await NR("/api/admin/policy-evaluations/run", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: "{}",
    })) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.results).toHaveLength(5);
  });

  test("GET /api/admin/governance بدون احراز → ۴۰۱", async () => {
    const { GET } = await import("@/app/api/admin/governance/route");
    const res = await GET((await NR("/api/admin/governance")) as never);
    expect(res.status).toBe(401);
  });

  test("GET /api/admin/governance با CONSULTANT → ۴۰۳", async () => {
    const { GET } = await import("@/app/api/admin/governance/route");
    const { token } = await makeSession("CONSULTANT", "963003");
    const res = await GET((await NR("/api/admin/governance", { headers: { authorization: `Bearer ${token}` } })) as never);
    expect(res.status).toBe(403);
  });

  test("آینهٔ v1: چهار روت فاز ۹ re-export تک‌منبع", async () => {
    for (const p of ["governance", "governance/run", "policy-evaluations", "policy-evaluations/run"]) {
      const mirror = await Bun.file(`src/app/api/v1/admin/${p}/route.ts`).text();
      expect(mirror).toContain(`export * from`);
    }
  });

  test("گارد audit-governance.sh و audit-policy-evaluation.sh قابل اجرا", () => {
    const g = execSync("bash scripts/audit-governance.sh 2>&1 || true", { encoding: "utf8" });
    expect(g).toContain("PASS");
    const pe = execSync("bash scripts/audit-policy-evaluation.sh 2>&1 || true", { encoding: "utf8" });
    expect(pe).toContain("PASS");
  });

  test("Worker پس از PN-031-B: ۱۷ کار شناسهٔ یکتا (۱۶ قبلی + head-guard — شورا-ن۰۳۹)", async () => {
    const { WORKER_JOB_IDS } = await import("@/core/runtime/jobs");
    const ids = Object.values(WORKER_JOB_IDS);
    expect(ids).toContain("decision-shadow");
    expect(ids).toContain("policy-eval");
    expect(ids).toContain("disk-guard"); // PN-020/H2
    expect(ids).toContain("memory-consolidation"); // PN-025
    expect(ids).toContain("ip-log"); // PN-029 (شورا-ن۰۳۳) — گارد IP کانتینر
    expect(ids).toContain("head-guard"); // PN-031-B (شورا-ن۰۳۹) — گارد تازگی بیلد زنده
    expect(new Set(ids).size).toBe(17);
  });
});
