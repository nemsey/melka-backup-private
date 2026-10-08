/**
 * pn022-step1-diagnosis.test.ts — PN-022-A/مرحلهٔ۱: رفع ۹ هشدار diagnosis
 * =============================================================================
 * پوشش: شکاف همگن رانش (اولاً-۱) · ثبت brier قهرمان (اولاً-۲) · آشتی نقش نشست با
 * رجیستری کاربران (I7) · مکانیزم حکم امنیتی (I7) · بازکالیبراسیون بررسی‌ها (I3/I9)
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const FIXTURE_DIR = "/tmp/pn022-intel-fixture";
mkdirSync(FIXTURE_DIR, { recursive: true });
// اسنپ‌شات یک‌روزه (عین ویژگی تولید — همه در یک روز)
{
  const preds = Array.from({ length: 40 }, (_, i) => ({
    predictionId: `pn022-p-${i}`,
    predictionType: "PROPERTY",
    probability: 0.2 + (i % 8) * 0.06,
    confidence: 1,
    drivers: [{ feature: "price", value: i < 20 ? 100 : 210, weight: 1 }],
    predictedAt: "2026-10-05T10:00:00.000Z",
  }));
  // دو لایهٔ پیامد (عین تولید: معامله‌ها اول، تعیین‌تکلیف‌ها بعد)
  const traded = preds.slice(0, 20).map((p) => ({ predictionId: p.predictionId, outcome: "TRANSACTION_OCCURRED", occurredAt: "2026-10-05T10:00:00.000Z", evidence: { observed: 1 } }));
  const pending = preds.slice(20).map((p) => ({ predictionId: p.predictionId, outcome: "NONE", occurredAt: "2026-10-05T10:00:00.000Z", evidence: { observed: 0 } }));
  writeFileSync(`${FIXTURE_DIR}/predictions.jsonl`, preds.map((p) => JSON.stringify(p)).join("\n") + "\n");
  writeFileSync(`${FIXTURE_DIR}/outcomes.jsonl`, [...traded, ...pending].map((o) => JSON.stringify(o)).join("\n") + "\n");
}
process.env.MELKA_INTELLIGENCE_DATA_DIR = FIXTURE_DIR;
const { db } = await import("@/lib/db");

afterAll(async () => {
  await db.driftCheck.deleteMany({ where: { modelId: { startsWith: "pn022-" } } }).catch(() => undefined);
  await db.modelVersion.deleteMany({ where: { modelId: { startsWith: "pn022-" } } }).catch(() => undefined);
  await db.auditLog.deleteMany({ where: { actor: "pn022-test" } }).catch(() => undefined);
  await db.$disconnect();
  rmSync(FIXTURE_DIR, { recursive: true, force: true });
});

/* ═══════ ۱) شکاف همگن — اولاً-۱ (DIAG-MODEL-004) ═══════ */
describe("PN-022-A/مرحلهٔ۱ · شکاف همگن لایه‌ای (اولاً-۱)", () => {
  test("ه-۱) splitWindowsHomogeneous: توازن دقیق نرخ وقوع هر دو پنجره", async () => {
    const { splitWindowsHomogeneous } = await import("@/lib/services/drift-service");
    const pairs = Array.from({ length: 100 }, (_, i) => ({ predictionId: `x${i}`, predictedValue: 0.5, observedValue: i < 50 ? 1 : 0 }));
    const { baseline, recent } = splitWindowsHomogeneous(pairs);
    const rate = (xs: typeof baseline) => xs.reduce((a, p) => a + p.observedValue, 0) / xs.length;
    expect(Math.abs(rate(baseline) - rate(recent))).toBeLessThanOrEqual(1 / Math.max(baseline.length, recent.length) + 1e-9);
    expect(baseline.length + recent.length).toBe(100);
  });

  test("ه-۲) splitWindowsHomogeneous: تعیین‌پذیر — دو اجرا عین هم", async () => {
    const { splitWindowsHomogeneous } = await import("@/lib/services/drift-service");
    const pairs = Array.from({ length: 30 }, (_, i) => ({ predictionId: `d${i}`, predictedValue: 0.4, observedValue: i % 3 === 0 ? 1 : 0 }));
    const a = splitWindowsHomogeneous(pairs);
    const b = splitWindowsHomogeneous(pairs);
    expect(a.baseline.map((p) => p.predictionId)).toEqual(b.baseline.map((p) => p.predictionId));
    expect(a.recent.map((p) => p.predictionId)).toEqual(b.recent.map((p) => p.predictionId));
  });

  test("ه-۳) splitWindowsHomogeneous: ورودی کوچک (<۴) → پنجرهٔ اخیر خالی", async () => {
    const { splitWindowsHomogeneous } = await import("@/lib/services/drift-service");
    const r = splitWindowsHomogeneous([{ predictionId: "a", predictedValue: 0.5, observedValue: 1 }]);
    expect(r.recent).toHaveLength(0);
    expect(r.baseline).toHaveLength(1);
  });

  test("ه-۴) splitWindowsByTime: اسنپ‌شات یک‌روزه → homogeneous + مهر سازوکار", async () => {
    const { splitWindowsByTime } = await import("@/lib/services/drift-service");
    const outcomes = Array.from({ length: 12 }, (_, i) => ({
      predictionId: `s${i}`, occurredAt: "2026-10-05T10:00:00.000Z", evidence: { observed: i % 2 },
    }));
    const predictions = outcomes.map((o, i) => ({ predictionId: o.predictionId, probability: 0.3 + i * 0.03 }));
    const r = splitWindowsByTime(outcomes, predictions);
    expect(r.splitBy).toBe("homogeneous");
    expect(r.rationale).toContain("اسنپ‌شات");
  });

  test("ه-۵) رانش مفهوم کاذب دولایه با شکاف کهنه ۰٫۵ می‌داد — همگن ≈ ۰ می‌دهد", async () => {
    const { splitWindowsByTime, stableHash } = await import("@/lib/services/drift-service");
    // عین الگوی تولید: ۲۰ معامله سپس ۲۰ تعیین‌تکلیف — شکاف کهنه: خط پایه همه معامله، اخیر همه تعیین‌تکلیف = ۱.۰
    const outcomes = [
      ...Array.from({ length: 20 }, (_, i) => ({ predictionId: `t${i}`, occurredAt: "2026-10-05T10:00:00.000Z", evidence: { observed: 1 } })),
      ...Array.from({ length: 20 }, (_, i) => ({ predictionId: `n${i}`, occurredAt: "2026-10-05T10:00:00.000Z", evidence: { observed: 0 } })),
    ];
    const predictions = outcomes.map((o, i) => ({ predictionId: o.predictionId, probability: 0.5 }));
    const r = splitWindowsByTime(outcomes, predictions);
    const rate = (xs: typeof r.baseline) => xs.reduce((a, p) => a + p.observedValue, 0) / Math.max(1, xs.length);
    expect(Math.abs(rate(r.baseline) - rate(r.recent))).toBeLessThanOrEqual(1 / Math.max(r.baseline.length, r.recent.length) + 1e-9);
    expect(stableHash("pn022")).toBe(stableHash("pn022"));
    expect(stableHash("a")).not.toBe(stableHash("b"));
  });

  test("ه-۶) برش زمانی چندروزه همچنان کار می‌کند (regression PN-019)", async () => {
    const { splitWindowsByTime } = await import("@/lib/services/drift-service");
    const now = Date.now();
    const outcomes = [
      ...Array.from({ length: 6 }, (_, i) => ({ predictionId: `old${i}`, occurredAt: new Date(now - 60 * 86400000).toISOString(), evidence: { observed: 1 } })),
      ...Array.from({ length: 4 }, (_, i) => ({ predictionId: `new${i}`, occurredAt: new Date(now - 5 * 86400000).toISOString(), evidence: { observed: 0 } })),
    ];
    const predictions = outcomes.map((o) => ({ predictionId: o.predictionId, probability: 0.5 }));
    const r = splitWindowsByTime(outcomes, predictions, { recentDays: 30 });
    expect(r.splitBy).toBe("time");
    expect(r.recent).toHaveLength(4);
  });

  test("ه-۷) پنجرهٔ خالی در برش زمانی → عقب‌افت به homogeneous (نه file-order)", async () => {
    const { splitWindowsByTime } = await import("@/lib/services/drift-service");
    const now = Date.now();
    const outcomes = Array.from({ length: 8 }, (_, i) => ({ predictionId: `w${i}`, occurredAt: new Date(now - 100 * 86400000).toISOString(), evidence: { observed: i % 4 === 0 ? 1 : 0 } }));
    const predictions = outcomes.map((o) => ({ predictionId: o.predictionId, probability: 0.5 }));
    const r = splitWindowsByTime(outcomes, predictions, { recentDays: 30 });
    expect(r.splitBy).toBe("homogeneous");
  });

  test("ه-۸) runDriftDetection روی اسنپ‌شات فیکسچر: هر سه رانش زیر آستانهٔ retrain", async () => {
    const { runDriftDetection } = await import("@/lib/services/drift-service");
    const r = await runDriftDetection("pn022-snapshot-m");
    expect(r.reports).toHaveLength(3);
    for (const rep of r.reports) {
      expect(rep.magnitude).toBeLessThan(0.05);
    }
  });
});

/* ═══════ ۲) ثبت brier قهرمان — اولاً-۲ (DIAG-MODEL-002) ═══════ */
describe("PN-022-A/مرحلهٔ۱ · ثبت brierScore قهرمان (اولاً-۲)", () => {
  test("ب-۱) registerChampionBrier: ثبت موفق با AuditLog + بازگشت سطر تازه", async () => {
    const { registerChampionBrier, ensureChallenger } = await import("@/lib/services/model-versioning-service");
    // چالشگر می‌سازیم و ارتقا می‌دهیم تا قهرمانِ تستی داشته باشیم — ارتقا نیازمند شوراست؛
    // به‌جای آن مستقیم وضعیت champion ثبت می‌کنیم (مسیر ثبت اولیه — مجاز بر پایهٔ GOV-MODEL-002 PN-019)
    const ch = await db.modelVersion.create({ data: { modelId: "pn022-brier-m", version: 1, status: "champion" } });
    const row = await registerChampionBrier({
      modelId: "pn022-brier-m", brierScore: 0.2256, sampleSize: 772, windowDays: 1,
      source: "تست واحد PN-022-A", actor: "pn022-test",
    });
    expect(row.brierScore).toBe(0.2256);
    expect(row.sampleSize).toBe(772);
    const audit = await db.auditLog.findFirst({ where: { action: "MODEL_BRIER_REGISTERED", actor: "pn022-test" } });
    expect(audit).not.toBeNull();
    void ensureChallenger;
  });

  test("ب-۲) registerChampionBrier: Brier خارج بازهٔ ۰..۱ رد می‌شود", async () => {
    const { registerChampionBrier } = await import("@/lib/services/model-versioning-service");
    await expect(registerChampionBrier({ modelId: "pn022-brier-m", brierScore: 1.5, sampleSize: 10, windowDays: 1, source: "t", actor: "pn022-test" })).rejects.toThrow();
    await expect(registerChampionBrier({ modelId: "pn022-brier-m", brierScore: -0.1, sampleSize: 10, windowDays: 1, source: "t", actor: "pn022-test" })).rejects.toThrow();
  });

  test("ب-۳) registerChampionBrier: مدل بدون قهرمان → ۴۰۴ فارسی", async () => {
    const { registerChampionBrier } = await import("@/lib/services/model-versioning-service");
    await expect(registerChampionBrier({ modelId: "pn022-no-such-m", brierScore: 0.2, sampleSize: 5, windowDays: 1, source: "t", actor: "pn022-test" })).rejects.toThrow("قهرمانی");
  });

  test("ب-۴) بررسی DIAG-MODEL-002 پس از ثبت: قهرمان با Brier < ۰٫۳ پاس می‌شود", async () => {
    const { checkModel } = await import("@/lib/services/self-diagnosis-service") as unknown as { checkModel: () => Promise<Array<{ checkId: string; passed: boolean }>> };
    const checks = await checkModel();
    const brier = checks.find((c) => c.checkId === "DIAG-MODEL-002");
    expect(brier?.passed).toBe(true);
  });
});

/* ═══════ ۳) آشتی نقش نشست با رجیستری — I7 ═══════ */
describe("PN-022-A/مرحلهٔ۱ · آشتی نقش نشست با رجیستری کاربران (I7)", () => {
  const OWNER_CODE = "960077";
  test("ن-۱) کاربر رجیستری OWNER: ورود ARM با نقش CONSULTANT → نشست OWNER", async () => {
    await db.user.upsert({
      where: { personnelCode: OWNER_CODE },
      create: { personnelCode: OWNER_CODE, fullName: "تست آشتی نقش", role: "OWNER" },
      update: { role: "OWNER" },
    });
    const { createSession } = await import("@/lib/auth/session");
    const { token, context } = await createSession(
      { personnelCode: OWNER_CODE, displayName: "تست آشتی نقش", role: "CONSULTANT" }, // نقش حل‌شده از مسیر ARM (realtor)
      { ip: "127.0.0.1" }, null,
    );
    expect(context.role).toBe("OWNER"); // آشتی با رجیستری
    const sess = await db.session.findFirst({ where: { tokenHash: createHash("sha256").update(token).digest("hex") } });
    expect(sess?.role).toBe("OWNER");
    await db.session.deleteMany({ where: { personnelCode: OWNER_CODE } });
  });

  test("ن-۲) کاربر بدون رجیستری: نقش مسیر ورود معتبر می‌ماند", async () => {
    const { createSession } = await import("@/lib/auth/session");
    const { context } = await createSession(
      { personnelCode: "960088", displayName: "بدون رجیستری", role: "CONSULTANT" },
      { ip: "127.0.0.1" }, null,
    );
    expect(context.role).toBe("CONSULTANT");
    await db.session.deleteMany({ where: { personnelCode: "960088" } });
  });

  test("ن-۳) رجیستری با نقش غیر-OWNER نقش را ارتقا نمی‌دهد", async () => {
    await db.user.upsert({
      where: { personnelCode: "960099" },
      create: { personnelCode: "960099", fullName: "مشاور رجیستری", role: "EXPERT" },
      update: { role: "EXPERT" },
    });
    const { createSession } = await import("@/lib/auth/session");
    const { context } = await createSession(
      { personnelCode: "960099", displayName: "مشاور رجیستری", role: "CONSULTANT" },
      { ip: "127.0.0.1" }, null,
    );
    expect(context.role).toBe("CONSULTANT"); // EXPERT ≠ OWNER → ارتقا ممنوع
    await db.session.deleteMany({ where: { personnelCode: "960099" } });
  });
});

/* ═══════ ۴) مکانیزم حکم امنیتی — I7/DIAG-SEC-002 ═══════ */
describe("PN-022-A/مرحلهٔ۱ · حکم امنیتی ACCESS_DENIED_ADJUDICATED", () => {
  // پاک‌سازی پیش از هر تست — ردهای آزمایشی این دو کد هرگز نباید به اجرای بعدی نشت کنند
  const cleanDenyActors = async () => {
    await db.auditLog.deleteMany({ where: { actor: { in: ["960011", "960012"] } } }).catch(() => undefined);
  };
  /** تختهٔ تمیز: همهٔ بازیگران پنجرهٔ رد، حکم تحلیل گرفته می‌کنند — آزمون تعیین‌پذیر
   * روی پایگاه مشترک تست با ۲۲۱ رد موروثی از سایر سوئیت‌ها (بدون این، رشتهٔ بازیگر دیگر قرمز می‌کند) */
  const adjudicateAllOpen = async () => {
    const recent = await db.auditLog.findMany({ where: { action: "ACCESS_DENIED" }, orderBy: { createdAt: "desc" }, take: 40, select: { actor: true } });
    const actors = [...new Set(recent.map((r) => r.actor).filter(Boolean))] as string[];
    for (const a of actors) {
      await db.auditLog.create({ data: { action: "ACCESS_DENIED_ADJUDICATED", actor: a, detail: "{\"verdict\":\"تختهٔ تمیز آزمون\"}" } });
    }
  };
  test("ح-۱) پنج رد متوالی تحلیل‌نشده → بررسی قرمز؛ پس از حکم → سبز", async () => {
    await cleanDenyActors();
    await adjudicateAllOpen();
    const { checkSecurity } = await import("@/lib/services/self-diagnosis-service") as unknown as { checkSecurity: () => Promise<Array<{ checkId: string; passed: boolean; value?: string | null }>> };
    const base = await checkSecurity();
    expect(base.find((c) => c.checkId === "DIAG-SEC-002")?.passed).toBe(true); // تختهٔ تمیز
    // ساخت ۵ رد متوالی از یک کد تستی
    const code = "960011";
    for (let i = 0; i < 5; i++) {
      await db.auditLog.create({ data: { action: "ACCESS_DENIED", actor: code, detail: "route=GET /api/admin/users; requiredRole=OWNER; actualRole=CONSULTANT" } });
    }
    const before = await checkSecurity();
    expect(before.find((c) => c.checkId === "DIAG-SEC-002")?.passed).toBe(false);
    // صدور حکم مستند
    await db.auditLog.create({ data: { action: "ACCESS_DENIED_ADJUDICATED", actor: code, detail: JSON.stringify({ verdict: "تحلیل تست", analyzedDenies: 5 }) } });
    const after = await checkSecurity();
    expect(after.find((c) => c.checkId === "DIAG-SEC-002")?.passed).toBe(true);
    await cleanDenyActors();
  });

  test("ح-۲) حکم فقط ردهای «پیش از» خود را می‌بندد — رد تازه = بازگشت قرمز", async () => {
    await cleanDenyActors();
    await adjudicateAllOpen();
    const { checkSecurity } = await import("@/lib/services/self-diagnosis-service") as unknown as { checkSecurity: () => Promise<Array<{ checkId: string; passed: boolean }>> };
    await db.auditLog.create({ data: { action: "ACCESS_DENIED", actor: "960012", detail: "route=GET /x" } });
    await db.auditLog.create({ data: { action: "ACCESS_DENIED_ADJUDICATED", actor: "960012", detail: "{}" } });
    let r = await checkSecurity();
    expect(r.find((c) => c.checkId === "DIAG-SEC-002")?.passed).toBe(true);
    // رد تازه پس از حکم
    for (let i = 0; i < 5; i++) {
      await db.auditLog.create({ data: { action: "ACCESS_DENIED", actor: "960012", detail: "route=GET /y" } });
    }
    r = await checkSecurity();
    expect(r.find((c) => c.checkId === "DIAG-SEC-002")?.passed).toBe(false);
    await cleanDenyActors();
  });
});

/* ═══════ ۵) بازکالیبراسیون بررسی‌ها — I3/I9 ═══════ */
describe("PN-022-A/مرحلهٔ۱ · بررسی‌های بازکالیبره", () => {
  test("ک-۱) DIAG-DATA-006: معیار پوشش غنی‌سازی منبع ≥ ۹۵٪ (نه یتیمی کاتالوگ)", async () => {
    const { checkData } = await import("@/lib/services/self-diagnosis-service") as unknown as { checkData: () => Promise<Array<{ checkId: string; passed: boolean; value?: string | null }>> };
    const checks = await checkData();
    const d6 = checks.find((c) => c.checkId === "DIAG-DATA-006");
    expect(d6).toBeDefined();
    expect(d6!.value).toContain("پوشش");
  });

  test("ک-۲) DIAG-DATA-004: DISK_PRUNE (خودشاهد) از شمارش حذف بی‌بکاپ مستثناست", async () => {
    const { checkData } = await import("@/lib/services/self-diagnosis-service") as unknown as { checkData: () => Promise<Array<{ checkId: string; passed: boolean }>> };
    await db.auditLog.create({ data: { action: "DISK_PRUNE", actor: "worker:disk-guard", operation: "DELETE", detail: "{}" } });
    const checks = await checkData();
    expect(checks.find((c) => c.checkId === "DIAG-DATA-004")?.passed).toBe(true);
  });

  test("ک-۳) GOV-DATA-002 در سرویس حاکمیت: DISK_PRUNE مستثنا (regression I9)", async () => {
    const svc = (await import("@/lib/services/governance-service")).buildLiveGovernanceContext;
    const ctx = await svc();
    expect(ctx).toBeDefined();
    const src = (await import("node:fs")).readFileSync("src/lib/services/governance-service.ts", "utf8");
    expect(src).toContain('action: { not: "DISK_PRUNE" }');
  });

  test("ک-۴) runBackupRotation: شاهد BACKUP_ROTATION در AuditLog ثبت می‌کند (ریشهٔ I9)", async () => {
    const { runBackupRotation } = await import("@/core/runtime/jobs");
    const r = await runBackupRotation(db, { keep: 3, backupsDir: "/tmp/pn022-backup-test" });
    expect(r.integrity).toBe("ok");
    const audit = await db.auditLog.findFirst({ where: { action: "BACKUP_ROTATION" }, orderBy: { createdAt: "desc" } });
    expect(audit).not.toBeNull();
    const detail = JSON.parse(audit!.detail ?? "{}");
    expect(detail.created).toContain("backup-");
    // پاک‌سازی فایل‌های تست
    const { rmSync } = await import("node:fs");
    try { rmSync("/tmp/pn022-backup-test", { recursive: true, force: true }); } catch { /* خالی */ }
  });
});

/* ═══════ ۶) قوانین ساختاری سه‌گانه — I10 ═══════ */
describe("PN-022-A/مرحلهٔ۱ · قوانین ساختاری BUILD-DISCIPLINE (درس ۶-۸)", () => {
  test("ق-۱) درس ششم: ری‌استارت پس از بیلد + چک BUILD_ID=HEAD مستند است", () => {
    const doc = readFileSync("docs/BUILD-DISCIPLINE.md", "utf8");
    expect(doc).toContain("درس ششم");
    expect(doc).toContain("پس از هر بیلد نهایی، سرور مکلف است ری‌استارت شود");
    expect(doc).toContain("BUILD_ID = HEAD");
  });

  test("ق-۲) درس هفتم: E2E واقعی برای همهٔ فرم‌های نوشتاری مستند است", () => {
    const doc = readFileSync("docs/BUILD-DISCIPLINE.md", "utf8");
    expect(doc).toContain("درس هفتم");
    expect(doc).toContain("هیچ فرم نوشتاری");
    expect(doc).toContain("کلیک مرورگر");
  });

  test("ق-۳) درس هشتم: قانون ساختاری Bidi (hex-verify) مستند است", () => {
    const doc = readFileSync("docs/BUILD-DISCIPLINE.md", "utf8");
    expect(doc).toContain("درس هشتم");
    expect(doc).toContain("hex-verify");
    expect(doc).toContain("هیچ‌گاه بر اساس خروجی نمایشی، سورس را خراب فرض نکن");
  });

  test("ق-۴) سند طراحی فاز ۱۲: ≥۶۰۰ خط و هر شش محور را پوشش می‌دهد", () => {
    const doc = readFileSync("docs/PHASE12-NATIONAL-SCALE-DESIGN.md", "utf8");
    const lines = doc.split("\n").length;
    expect(lines).toBeGreaterThanOrEqual(600);
    for (const kw of ["PostgreSQL", "Feature Factory", "چند-شهری", "Contract Test", "Offline", "checkpoint صفحه‌ای"]) {
      expect(doc).toContain(kw);
    }
  });
});
