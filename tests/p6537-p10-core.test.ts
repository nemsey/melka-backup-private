/**
 * PHASE 10 (سند ۰۲۷ §۵.۵) — تست‌های خودتشخیصی (≥ ۵۰ تست)
 * بخش ۱ — ۲۵ بررسی (۲۵) · بخش ۲ — گزارش (۱۰) · بخش ۳ — خودکشفی (۱۵)
 */
import { describe, expect, test } from "bun:test";
import { SelfDiagnosisEngineImpl, healthySnapshot, type SystemSnapshot } from "../src/core/intelligence/p10-core";

const snap = (over: Partial<SystemSnapshot> = {}): SystemSnapshot => ({ ...healthySnapshot(), ...over });

/* ═══════════ بخش ۱ — ۲۵ بررسی اجباری ═══════════ */
describe("P10/بخش ۱ — ۲۵ بررسی با دادهٔ معلوم", () => {
  const e = () => new SelfDiagnosisEngineImpl();
  const all = (s: SystemSnapshot) => e().runAllChecks(s);

  test("۱-۱ دقیقاً ۲۵ بررسی", () => { expect(all(snap())).toHaveLength(25); });
  test("۱-۲ هفت بررسی داده", () => { expect(all(snap()).filter((c) => c.category === "data")).toHaveLength(7); });
  test("۱-۳ شش بررسی مدل", () => { expect(all(snap()).filter((c) => c.category === "model")).toHaveLength(6); });
  test("۱-۴ پنج بررسی موتور", () => { expect(all(snap()).filter((c) => c.category === "engine")).toHaveLength(5); });
  test("۱-۵ چهار بررسی امنیت", () => { expect(all(snap()).filter((c) => c.category === "security")).toHaveLength(4); });
  test("۱-۶ سه بررسی حاکمیت", () => { expect(all(snap()).filter((c) => c.category === "governance")).toHaveLength(3); });
  test("۱-۷_snapshot سالم: همه pass", () => { expect(all(snap()).every((c) => c.status === "pass")).toBe(true); });
  test("۱-۸ DIAG-DATA-001: رکورد یتیم → warn", () => { expect(all(snap({ orphanOutcomeRecords: 2 }))[0].status).toBe("warn"); });
  test("۱-۹ DIAG-DATA-001: یتیم زیاد → fail", () => { expect(all(snap({ orphanOutcomeRecords: 9 }))[0].status).toBe("fail"); });
  test("۱-۱۰ DIAG-DATA-002: پوشش ۸۵٪ → warn", () => { expect(all(snap({ columnCoveragePercent: 85 }))[1].status).toBe("warn"); });
  test("۱-۱۱ DIAG-DATA-002: پوشش ۷۰٪ → fail", () => { expect(all(snap({ columnCoveragePercent: 70 }))[1].status).toBe("fail"); });
  test("۱-۱۲ DIAG-DATA-003: دادهٔ کهنه ۳۰ ساعت → warn", () => { expect(all(snap({ dataAgeHours: 30 }))[2].status).toBe("warn"); });
  test("۱-۱۳ DIAG-DATA-003: دادهٔ کهنه ۷۲ ساعت → fail", () => { expect(all(snap({ dataAgeHours: 72 }))[2].status).toBe("fail"); });
  test("۱-۱۴ DIAG-DATA-004: حذف غیرمجاز → fail", () => { expect(all(snap({ illegalDeletions: 1 }))[3].status).toBe("fail"); });
  test("۱-۱۵ DIAG-DATA-005: بدون بکاپ → fail", () => { expect(all(snap({ backupFilesPresent: 0 }))[4].status).toBe("fail"); });
  test("۱-۱۶ DIAG-DATA-005: یک بکاپ → warn", () => { expect(all(snap({ backupFilesPresent: 1 }))[4].status).toBe("warn"); });
  test("۱-۱۷ DIAG-DATA-006: تناقض جداول → fail", () => { expect(all(snap({ crossTableConflicts: 12 }))[5].status).toBe("fail"); });
  test("۱-۱۸ DIAG-DATA-007: رشد انفجاری → warn", () => { expect(all(snap({ weeklyGrowthPercent: 60 }))[6].status).toBe("warn"); });
  test("۱-۱۹ DIAG-MODEL-001: Brier بالای هدف → warn و پیشنهاد ترمیم", () => {
    const c = all(snap({ brierScore: 0.2255 }))[7];
    expect(c.status).toBe("warn");
    expect(c.suggestion).toContain("شورا");
  });
  test("۱-۲۰ DIAG-MODEL-002: شکاف کالیبراسیون ۰٫۵ → fail + recalibrate", () => {
    const c = all(snap({ worstCalibrationGap: 0.5 }))[8];
    expect(c.status).toBe("fail");
    expect(c.suggestion).toContain("بازکالیبراسیون");
  });
  test("۱-۲۱ DIAG-MODEL-003: رانش شدید → fail", () => { expect(all(snap({ driftMagnitude: 0.15 }))[9].status).toBe("fail"); });
  test("۱-۲۲ DIAG-MODEL-004: overfitting → fail", () => { expect(all(snap({ overfitGap: 0.2 }))[10].status).toBe("fail"); });
  test("۱-۲۳ DIAG-MODEL-005: نسخهٔ ناهماهنگ → fail", () => { expect(all(snap({ activeModelVersionMatchesExpected: false }))[11].status).toBe("fail"); });
  test("۱-۲۴ DIAG-MODEL-006: سایه غیرفعال → warn", () => { expect(all(snap({ shadowEvaluationActive: false }))[12].status).toBe("warn"); });
  test("۱-۲۵ DIAG-ENGINE-001: موتور کم → warn / خیلی کم → fail", () => {
    expect(all(snap({ enginesAlive: 10 }))[13].status).toBe("warn");
    expect(all(snap({ enginesAlive: 8 }))[13].status).toBe("fail");
  });
  test("۱-۲۶ DIAG-ENGINE-002: تأخیر بالا → fail", () => { expect(all(snap({ maxEngineLatencyMs: 2500 }))[14].status).toBe("fail"); });
  test("۱-۲۷ DIAG-ENGINE-003: خطای متوالی → fail", () => { expect(all(snap({ consecutiveEngineErrors: 3 }))[15].status).toBe("fail"); });
  test("۱-۲۸ DIAG-ENGINE-004: Tier نامعتبر → fail", () => { expect(all(snap({ tierValid: false }))[16].status).toBe("fail"); });
  test("۱-۲۹ DIAG-ENGINE-005: چرخهٔ متوقف → fail", () => { expect(all(snap({ learningLoopActive: false }))[17].status).toBe("fail"); });
  test("۱-۳۰ DIAG-SEC-001: حسابرسی خاموش → fail", () => { expect(all(snap({ auditLogActive: false }))[18].status).toBe("fail"); });
  test("۱-۳۱ DIAG-SEC-002: دسترسی غیرمجاز → fail", () => { expect(all(snap({ unauthorizedAccess24h: 1 }))[19].status).toBe("fail"); });
  test("۱-۳۲ DIAG-SEC-003: LLM در production → fail", () => { expect(all(snap({ llmCallsInProduction: 1 }))[20].status).toBe("fail"); });
  test("۱-۳۳ DIAG-SEC-004: POST به مبدأ → fail", () => { expect(all(snap({ postsToOriginSystem: 1 }))[21].status).toBe("fail"); });
  test("۱-۳۴ DIAG-GOV-001: قواعد ناعمل → warn/fail", () => {
    expect(all(snap({ governanceRulesEnforced: 14 }))[22].status).toBe("warn");
    expect(all(snap({ governanceRulesEnforced: 10 }))[22].status).toBe("fail");
  });
  test("۱-۳۵ DIAG-GOV-002: نقض بحرانی → fail", () => { expect(all(snap({ criticalViolations: 1 }))[23].status).toBe("fail"); });
  test("۱-۳۶ DIAG-GOV-003: ارزیابی ۹۵ روز پیش → fail", () => { expect(all(snap({ lastPolicyEvaluationDaysAgo: 95 }))[24].status).toBe("fail"); });
  test("۱-۳۷ runCheck تکی با شناسه", () => {
    const c = e().runCheck("DIAG-MODEL-001", snap());
    expect(c?.id).toBe("DIAG-MODEL-001");
  });
  test("۱-۳۸ هر بررسی دارای نام و جزئیات", () => {
    for (const c of all(snap())) {
      expect(c.name.length).toBeGreaterThan(3);
      expect(c.details.length).toBeGreaterThan(3);
    }
  });
  test("۱-۳۹ شناسه‌ها یکتا", () => {
    const ids = all(snap()).map((c) => c.id);
    expect(new Set(ids).size).toBe(25);
  });
  test("۱-۴۰ الگوی شناسه بر اساس دسته", () => {
    for (const c of all(snap())) {
      const prefix = c.category === "data" ? "DIAG-DATA" : c.category === "model" ? "DIAG-MODEL" : c.category === "engine" ? "DIAG-ENGINE" : c.category === "security" ? "DIAG-SEC" : "DIAG-GOV";
      expect(c.id.startsWith(prefix)).toBe(true);
    }
  });
});

/* ═══════════ بخش ۲ — گزارش ═══════════ */
describe("P10/بخش ۲ — گزارش تشخیص", () => {
  const e = () => new SelfDiagnosisEngineImpl();

  test("۲-۱ امتیاز سلامت: سالم = ۱۰۰", () => { expect(e().getHealthScore(e().runAllChecks(snap()))).toBe(100); });
  test("۲-۲ امتیاز: یک warn = ۹۸ (۲۵ بررسی)", () => {
    expect(e().getHealthScore(e().runAllChecks(snap({ orphanOutcomeRecords: 2 })))).toBe(98);
  });
  test("۲-۳ امتیاز: یک fail = ۹۶", () => {
    expect(e().getHealthScore(e().runAllChecks(snap({ illegalDeletions: 1 })))).toBe(96);
  });
  test("۲-۴ امتیاز با بدون بررسی = ۰", () => { expect(e().getHealthScore([])).toBe(0); });
  test("۲-۵ runFullDiagnosis سالم: healthy", () => { expect(e().runFullDiagnosis(snap()).systemHealth).toBe("healthy"); });
  test("۲-۶ فقط warn: degraded", () => { expect(e().runFullDiagnosis(snap({ brierScore: 0.2255 })).systemHealth).toBe("degraded"); });
  test("۲-۷ fail امنیتی: critical", () => { expect(e().runFullDiagnosis(snap({ llmCallsInProduction: 1 })).systemHealth).toBe("critical"); });
  test("۲-۸ fail حاکمیتی: critical", () => { expect(e().runFullDiagnosis(snap({ criticalViolations: 2 })).systemHealth).toBe("critical"); });
  test("۲-۹ warnings از warnها ساخته می‌شوند", () => {
    const r = e().runFullDiagnosis(snap({ orphanOutcomeRecords: 2, dataAgeHours: 30 }));
    expect(r.warnings).toHaveLength(2);
  });
  test("۲-۱۰ criticalAlerts بلافاصله گزارش می‌شوند (§۵.۳)", () => {
    const r = e().runFullDiagnosis(snap({ unauthorizedAccess24h: 1 }));
    expect(r.criticalAlerts.length).toBe(1);
    expect(r.criticalAlerts[0].reportedAt).toBeDefined();
  });
  test("۲-۱۱ reportCritical مستقل", () => {
    const a = e().reportCritical({ checkId: "DIAG-SEC-004", message: "POST شناسایی شد" });
    expect(a.checkId).toBe("DIAG-SEC-004");
    expect(a.id).toBeDefined();
  });
  test("۲-۱۲ توصیه‌ها برای هر بررسی غیر pass", () => {
    const r = e().runFullDiagnosis(snap({ brierScore: 0.2255, driftMagnitude: 0.06 }));
    expect(r.recommendations.length).toBe(2);
  });
  test("۲-۱۳ توصیه دارای دلیل است", () => {
    const r = e().runFullDiagnosis(snap({ brierScore: 0.2255 }));
    expect(r.recommendations[0].rationale).toContain("0.2255");
  });
  test("۲-۱۴ گزارش Tier را حمل می‌کند", () => { expect(e().runFullDiagnosis(snap({ tier: 3 })).tier).toBe(3); });
  test("۲-۱۵ زنجیرهٔ شاهد در گزارش", () => {
    expect(e().runFullDiagnosis(snap()).evidenceChain.length).toBeGreaterThanOrEqual(2);
  });
});

/* ═══════════ بخش ۳ — خودکشفی مشکلات واقعی ═══════════ */
describe("P10/بخش ۳ — خودکشفی (کشف مشکلات واقعی، نه نمایشی)", () => {
  const e = () => new SelfDiagnosisEngineImpl();

  test("۳-۱ مشکل واقعی ۱: کالیبراسیون سطل ۰٫۴-۰٫۶ (مشاهدهٔ ۱٫۰ در برابر ۰٫۴۹)", () => {
    // شاهد واقعی از loop-latest.json: worstCalibrationGap = 1 - 0.492 = 0.508
    const r = e().runFullDiagnosis(snap({ worstCalibrationGap: 0.508 }));
    const c = r.checks.find((x) => x.id === "DIAG-MODEL-002");
    expect(c?.status).toBe("fail");
    expect(r.recommendations.some((rec) => rec.checkId === "DIAG-MODEL-002")).toBe(true);
  });
  test("۳-۲ مشکل واقعی ۲: Brier = ۰٫۲۲۵۵ > هدف ۰٫۲۰", () => {
    const r = e().runFullDiagnosis(snap({ brierScore: 0.2255 }));
    const c = r.checks.find((x) => x.id === "DIAG-MODEL-001");
    expect(c?.status).toBe("warn");
    expect(c?.suggestion).toBeDefined();
  });
  test("۳-۳ مشکل واقعی ۳: دادهٔ کهنه (>۲۴ ساعت بدون همگام‌سازی)", () => {
    const r = e().runFullDiagnosis(snap({ dataAgeHours: 30 }));
    expect(r.checks.find((x) => x.id === "DIAG-DATA-003")?.status).toBe("warn");
  });
  test("۳-۴ سه مشکل هم‌زمان: سلامت degraded و سه توصیه", () => {
    const real = snap({ brierScore: 0.2255, worstCalibrationGap: 0.508, dataAgeHours: 30 });
    const r = e().runFullDiagnosis(real);
    expect(r.systemHealth).toBe("degraded");
    expect(r.recommendations.length).toBeGreaterThanOrEqual(3);
  });
  test("۳-۵ مشکل کشف‌شده دلیل فارسی دارد", () => {
    const r = e().runFullDiagnosis(snap({ worstCalibrationGap: 0.508 }));
    expect(r.checks.find((x) => x.id === "DIAG-MODEL-002")?.details).toContain("0.508");
  });
  test("۳-۶ صفر پنهان‌کاری: هر fail در criticalAlerts دیده می‌شود", () => {
    const r = e().runFullDiagnosis(snap({ worstCalibrationGap: 0.508, illegalDeletions: 1 }));
    expect(r.criticalAlerts.length).toBe(2);
  });
  test("۳-۷ سناریوی بحرانی: همهٔ failهای امنیتی", () => {
    const r = e().runFullDiagnosis(snap({ auditLogActive: false, unauthorizedAccess24h: 3, llmCallsInProduction: 2, postsToOriginSystem: 1 }));
    expect(r.systemHealth).toBe("critical");
    expect(r.criticalAlerts.length).toBe(4);
  });
  test("۳-۸ سناریوی فاجعه: امتیاز <۵۰ و critical", () => {
    const catastrophic = snap({
      orphanOutcomeRecords: 10, columnCoveragePercent: 60, dataAgeHours: 72, illegalDeletions: 2,
      backupFilesPresent: 0, crossTableConflicts: 20, weeklyGrowthPercent: 70,
      brierScore: 0.4, worstCalibrationGap: 0.6, driftMagnitude: 0.2, overfitGap: 0.3,
      activeModelVersionMatchesExpected: false, shadowEvaluationActive: false,
      enginesAlive: 7, maxEngineLatencyMs: 3000, consecutiveEngineErrors: 5, tierValid: false, learningLoopActive: false,
      auditLogActive: false, unauthorizedAccess24h: 5, llmCallsInProduction: 3, postsToOriginSystem: 2,
      governanceRulesEnforced: 8, criticalViolations: 3, lastPolicyEvaluationDaysAgo: 95,
    });
    const r = e().runFullDiagnosis(catastrophic);
    expect(r.overallScore).toBeLessThan(50);
    expect(r.systemHealth).toBe("critical");
    expect(r.criticalAlerts.length).toBeGreaterThanOrEqual(20);
  });
  test("۳-۹ گزارش کامل شامل هر ۲۵ بررسی است", () => {
    expect(e().runFullDiagnosis(snap()).checks).toHaveLength(25);
  });
  test("۳-۱۰ snapshot واقعی حلقهٔ امروز: Tier 4 و Brier واقعی", () => {
    const real = snap({ brierScore: 0.2255, worstCalibrationGap: 0.508, tier: 4, enginesAlive: 11, enginesTotal: 11 });
    const r = e().runFullDiagnosis(real);
    expect(r.tier).toBe(4);
    expect(r.checks.find((c) => c.id === "DIAG-ENGINE-001")?.status).toBe("pass");
    expect(r.systemHealth).toBe("degraded");
  });
});
