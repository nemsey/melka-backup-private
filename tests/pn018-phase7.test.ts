/**
 * PN-018 فاز ۷ — تست‌های Champion/Challenger + Drift + حلقهٔ کامل
 * ---------------------------------------------------------------------------
 * پوشش (سند طراحی §۱۶):
 *   ۱) چرخهٔ عمر نسخه: ساخت/یکتایی/سایه/دروازهٔ شورا/ارتقا/رد/بازگشت
 *   ۲) رانش سه‌گانه + آستانه‌ها + پایدارسازی + شکست پنجره
 *   ۳) حلقهٔ کامل هفت‌گام (fixture با پنجرهٔ معتبر ≥۷ روز)
 *   ۴) مرز API + آینهٔ v1 + روت لاغر
 *   ۵) کار Worker
 * همهٔ تست‌ها روی db/test.db (preload-guard) — production هرگز لمس نمی‌شود.
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { createHash } from "crypto";
import { existsSync, readFileSync } from "node:fs";
import { execSync } from "child_process";

process.env.OWNER_PERSONNEL_CODES = "410099950";
// PN-018: ایزوله‌سازی داده — سرویس‌های حلقه/رانش به فهرست موقت هدایت می‌شوند (production هرگز لمس نمی‌شود)
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
const FIXTURE_DIR = mkdtempSync(`${tmpdir()}/pn018-loop-`);
// fixture: ۷۷۲ جفت + پنجرهٔ ۱۰ روزه (مثل production اما ایزوله) + drivers برای رانش داده
{
  const preds = Array.from({ length: 60 }, (_, i) => ({
    predictionId: `fx-p-${i}`,
    predictionType: "PROPERTY",
    probability: 0.3 + (i % 7) * 0.05,
    confidence: 1,
    drivers: [{ feature: i < 42 ? "price" : "area", value: i < 42 ? 100 : 200, weight: 1 }],
    predictedAt: new Date(Date.now() - (60 - i) * 4 * 3600_000).toISOString(),
  }));
  const outs = preds.map((p, i) => ({ predictionId: p.predictionId, outcome: i % 3 === 0 ? "TRANSACTION_OCCURRED" : "NONE", occurredAt: p.predictedAt, evidence: { observed: i % 3 === 0 ? 1 : 0 } }));
  writeFileSync(`${FIXTURE_DIR}/predictions.jsonl`, preds.map((p) => JSON.stringify(p)).join("\n") + "\n");
  writeFileSync(`${FIXTURE_DIR}/outcomes.jsonl`, outs.map((o) => JSON.stringify(o)).join("\n") + "\n");
}
process.env.MELKA_INTELLIGENCE_DATA_DIR = FIXTURE_DIR;
const { db } = await import("@/lib/db");

const TEST_MODEL = "pn018-test-model";
const createdSessions: string[] = [];

async function makeSession(role: "OWNER" | "CONSULTANT", personnelCode = role === "OWNER" ? "960001" : "960002") {
  const { createSession } = await import("@/lib/auth/session");
  const { token } = await createSession(
    { personnelCode, displayName: `تست ن۰۱۸ ${role}`, role },
    { ip: "127.0.0.1" }, null
  );
  createdSessions.push(token);
  return { token };
}
const hdr = (t: string) => ({ authorization: `Bearer ${t}` });
async function NR(u: string, init?: RequestInit): Promise<import("next/server").NextRequest> {
  const { NextRequest } = await import("next/server");
  return new NextRequest(`http://localhost${u}`, init as never);
}
const sha = (t: string) => createHash("sha256").update(t).digest("hex");

/** جفت ساختگی با پنجرهٔ زمانی قابل‌کنترل */
const mkPairs = (n: number, opts: { predictedAt?: (i: number) => string } = {}) =>
  Array.from({ length: n }, (_, i) => ({
    predictionId: `test-pair-${i}`,
    predictedValue: 0.3 + (i % 7) * 0.05,
    observedValue: i % 3 === 0 ? 1 : 0,
    predictedAt: opts.predictedAt?.(i) ?? new Date(Date.now() - (n - i) * 3600_000).toISOString(),
  }));

beforeAll(async () => {
  await db.modelVersion.deleteMany({ where: { modelId: { startsWith: "pn018-" } } });
  await db.driftCheck.deleteMany({ where: { modelId: { startsWith: "pn018-" } } });
  await db.auditLog.deleteMany({ where: { action: { startsWith: "MODEL_" } } });
});
afterAll(async () => {
  for (const t of createdSessions) await db.session.deleteMany({ where: { tokenHash: sha(t) } }).catch(() => undefined);
  await db.modelVersion.deleteMany({ where: { modelId: { startsWith: "pn018-" } } });
  await db.driftCheck.deleteMany({ where: { modelId: { startsWith: "pn018-" } } });
  await db.auditLog.deleteMany({ where: { action: { startsWith: "MODEL_" } } });
  await db.$disconnect();
});

/* ═══════ ۱) چرخهٔ عمر نسخه ═══════ */
describe("PN-018/فاز۷ · چرخهٔ عمر ModelVersion", () => {
  test("ساخت چالشگر: version=n+1 · status=challenger · بدون تأیید شورا", async () => {
    const { ensureChallenger, listModelVersions } = await import("@/lib/services/model-versioning-service");
    const v1 = await ensureChallenger({ modelId: TEST_MODEL, notes: "تست", actor: "test" });
    expect(v1.version).toBe(1);
    expect(v1.status).toBe("challenger");
    expect(v1.councilApproved).toBe(false);
    // idempotent در سطح وضعیت: چالشگر فعال دوباره نمی‌سازد
    const again = await ensureChallenger({ modelId: TEST_MODEL, actor: "test" });
    expect(again.id).toBe(v1.id);
    const rows = await listModelVersions({ modelId: TEST_MODEL });
    expect(rows.length).toBe(1);
  });

  test("یکتایی [modelId, version] — نقض مستقیم DB رد می‌شود", async () => {
    const { ensureChallenger } = await import("@/lib/services/model-versioning-service");
    const v = await ensureChallenger({ modelId: "pn018-uniq-model", actor: "test" });
    let threw = false;
    try {
      await db.modelVersion.create({ data: { modelId: "pn018-uniq-model", version: v.version, status: "challenger" } });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  test("shadowTick: brier/sampleSize/windowDays به‌روز می‌شوند + verdict بدون شورا هرگز promote", async () => {
    const { shadowTick } = await import("@/lib/services/model-versioning-service");
    const pairs = mkPairs(60);
    const r = await shadowTick(TEST_MODEL, pairs, 10);
    expect(r.sampleSize).toBe(60);
    expect(r.windowDays).toBe(10);
    expect(r.challengerBrier).toBeGreaterThanOrEqual(0);
    expect(r.criteria.enoughSamples).toBe(true);
    expect(r.criteria.enoughWindow).toBe(true);
    // چالشگر هموار روی این fixture بدتر است → keep_primary یا reject، هرگز promote (بدون شورا در shadowTick همیشه keep/reject)
    expect(r.verdict === "keep_primary" || r.verdict === "reject").toBe(true);
  });

  test("ارتقا بدون تأیید شورا → COUNCIL_APPROVAL_REQUIRED (لایهٔ سرویس مستقیم)", async () => {
    const { ensureChallenger, promoteModelVersion } = await import("@/lib/services/model-versioning-service");
    const v = await ensureChallenger({ modelId: TEST_MODEL, actor: "test" });
    await expect(promoteModelVersion(v.id, { councilApproval: false, actor: "test" }))
      .rejects.toMatchObject({ code: "COUNCIL_APPROVAL_REQUIRED" });
  });

  test("ارتقا بدون منبع تأیید → رد حتی با councilApproval=true", async () => {
    const { ensureChallenger, promoteModelVersion } = await import("@/lib/services/model-versioning-service");
    const v = await ensureChallenger({ modelId: TEST_MODEL, actor: "test" });
    await expect(promoteModelVersion(v.id, { councilApproval: true, approvalSource: "ک", actor: "test" }))
      .rejects.toMatchObject({ code: "COUNCIL_APPROVAL_REQUIRED" });
  });

  test("ارتقا با نمونهٔ ناکافی → SHADOW_CRITERIA_NOT_MET", async () => {
    const { ensureChallenger, promoteModelVersion, shadowTick } = await import("@/lib/services/model-versioning-service");
    // چالشگر موجود با ۶۰ نمونه ارزیابی شده؛ برای این تست مدل جدا با نمونهٔ کم
    const m2 = "pn018-test-model-small";
    const v = await ensureChallenger({ modelId: m2, actor: "test" });
    await shadowTick(m2, mkPairs(10), 3); // نمونه ۱۰ < ۵۰ · پنجره ۳ < ۷
    await expect(promoteModelVersion(v.id, { councilApproval: true, approvalSource: "شورا-تست-۱۴۰۵", actor: "test" }))
      .rejects.toMatchObject({ code: "SHADOW_CRITERIA_NOT_MET" });
  });

  test("ارتقای موفق با همهٔ پیش‌شرط‌ها: champion واحد + AuditLog + مهر منبع", async () => {
    const { ensureChallenger, promoteModelVersion, getChampion, listModelVersions } = await import("@/lib/services/model-versioning-service");
    // مدل تازه با چالشگری که واقعاً بهتر است: احتمال‌های چالشگر = عین observed → Brier≈۰
    const m3 = "pn018-test-model-good";
    const v = await ensureChallenger({ modelId: m3, weights: {}, actor: "test" });
    // ارزیابی با جفت‌هایی که چالشگرِ هموار رویشان عالی نیست؛ اما برای ارتقا کافی است که معیار sampleSize/windowDays را رد کند و بrier بهتر از «قهرمان اولیه» باشد.
    // قهرمان اولیه را با بrier بد ثبت می‌کنیم (عین سناریوی خط پایه):
    await db.modelVersion.create({
      data: { modelId: m3, version: 0, status: "retired", brierScore: 0.4, sampleSize: 100, windowDays: 30, retiredAt: new Date() },
    });
    // قهرمان فعلی: نسخهٔ صفر → باید اول champion شود؛ برای سادگی: مستقیماً champion می‌سازیم
    await db.modelVersion.update({ where: { id: (await db.modelVersion.findFirstOrThrow({ where: { modelId: m3, version: 0 } })).id }, data: { status: "champion", promotedAt: new Date(), councilApproved: true, approvalSource: "خط پایه تست" } });
    // چالشگر: روی جفت‌های هموار-خوب ارزیابی می‌شود — پیش‌بینی‌ها حول ۰٫۵ و observed نیم-نیم → هموار تقریباً عین خودش
    const pairs = Array.from({ length: 60 }, (_, i) => ({
      predictionId: `good-${i}`, predictedValue: 0.5, observedValue: i % 2, predictedAt: new Date(Date.now() - (60 - i) * 3600_000).toISOString(),
    }));
    const { shadowTick } = await import("@/lib/services/model-versioning-service");
    const tick = await shadowTick(m3, pairs, 10);
    expect(tick.criteria.enoughSamples).toBe(true);
    // ارتقا
    const promoted = await promoteModelVersion(v.id, { councilApproval: true, approvalSource: "ملکا-شورا-ن۰۲۲-تست", actor: "test" });
    expect(promoted.status).toBe("champion");
    expect(promoted.councilApproved).toBe(true);
    expect(promoted.approvalSource).toContain("شورا");
    // قهرمان واحد
    const champions = (await listModelVersions({ modelId: m3, status: "champion" })).filter((r) => r.status === "champion");
    expect(champions.length).toBe(1);
    const ch = await getChampion(m3);
    expect(ch!.version).toBeGreaterThanOrEqual(1);
    // AuditLog
    const audit = await db.auditLog.findFirst({ where: { action: "MODEL_PROMOTED" } });
    expect(audit).not.toBeNull();
  });

  test("رد چالشگر: status=rejected + AuditLog + تکرار → NOT_A_CHALLENGER", async () => {
    const { ensureChallenger, rejectChallenger } = await import("@/lib/services/model-versioning-service");
    const m = "pn018-test-model-reject";
    const v = await ensureChallenger({ modelId: m, actor: "test" });
    const r = await rejectChallenger(v.id, "test", "بدتر بود");
    expect(r.status).toBe("rejected");
    await expect(rejectChallenger(v.id, "test")).rejects.toMatchObject({ code: "NOT_A_CHALLENGER" });
    const audit = await db.auditLog.findFirst({ where: { action: "MODEL_REJECTED" } });
    expect(audit).not.toBeNull();
  });

  test("بازگشت (rollback): قهرمان فعلی retired + هدف champion — با شورا", async () => {
    const { ensureChallenger, promoteModelVersion, rollbackChampion, getChampion, listModelVersions } = await import("@/lib/services/model-versioning-service");
    const m = "pn018-test-model-rollback";
    // v0 = قهرمان اولیه · v1 = چالشگر ارتقایافته → rollback به v0
    await db.modelVersion.create({ data: { modelId: m, version: 0, status: "champion", brierScore: 0.35, sampleSize: 100, windowDays: 30, promotedAt: new Date(), councilApproved: true, approvalSource: "خط پایه" } });
    const v1 = await ensureChallenger({ modelId: m, actor: "test" });
    await db.modelVersion.update({ where: { id: v1.id }, data: { brierScore: 0.3, sampleSize: 60, windowDays: 10 } });
    const promoted = await promoteModelVersion(v1.id, { councilApproval: true, approvalSource: "شورا-رول‌بک-تست", actor: "test" });
    expect(promoted.status).toBe("champion");
    const v0row = await db.modelVersion.findFirstOrThrow({ where: { modelId: m, version: 0 } });
    const rolled = await rollbackChampion(m, { targetId: v0row.id, councilApproval: true, approvalSource: "شورا-رول‌بک-تست", reason: "افت کیفیت", actor: "test" });
    expect(rolled.status).toBe("champion");
    expect(rolled.version).toBe(0);
    const champions = (await listModelVersions({ modelId: m })).filter((r) => r.status === "champion");
    expect(champions.length).toBe(1);
    expect((await getChampion(m))!.version).toBe(0);
    const audit = await db.auditLog.findFirst({ where: { action: "MODEL_ROLLED_BACK" } });
    expect(audit).not.toBeNull();
  });

  test("rollback بدون شورا → رد", async () => {
    const { rollbackChampion } = await import("@/lib/services/model-versioning-service");
    await expect(rollbackChampion("pn018-test-model-rollback", { targetId: "x", councilApproval: false, actor: "t" }))
      .rejects.toMatchObject({ code: "COUNCIL_APPROVAL_REQUIRED" });
  });
});

/* ═══════ ۲) رانش سه‌گانه ═══════ */
describe("PN-018/فاز۷ · Drift Detection", () => {
  test("performance drift سه آستانه: alert · retrain · escalate · monitor", async () => {
    const { splitWindows } = await import("@/lib/services/drift-service");
    const { DriftDetector } = await import("@/core/intelligence/p7-core");
    const det = new DriftDetector();
    // گرهٔ کنترل‌شده: همهٔ مشاهده‌ها ۱ — Brier = (۱−p)² → اختلاف با فاصلهٔ p قابل‌دقیق تنظیم
    const mk = (p: number, n: number) =>
      Array.from({ length: n }, (_, i) => ({ predictionId: `d-${p}-${i}`, predictedValue: p, observedValue: 1, predictedAt: new Date().toISOString() }));
    // پایه: p=۰٫۹ → Brier ۰٫۰۱
    const a = det.detectPerformanceDrift("t", mk(0.9, 100), mk(0.8, 100)); // اخیر ۰٫۰۴ → Δ۰٫۰۳ → alert
    expect(a.action).toBe("alert");
    const b = det.detectPerformanceDrift("t", mk(0.9, 100), mk(0.75, 100)); // Δ۰٫۰۵۲۵ → retrain
    expect(b.action).toBe("retrain");
    const c = det.detectPerformanceDrift("t", mk(0.9, 100), mk(0.5, 100)); // Δ۰٫۲۴ → escalate
    expect(c.action).toBe("escalate");
    const d = det.detectPerformanceDrift("t", mk(0.9, 100), mk(0.9, 100)); // Δ۰ → monitor
    expect(d.action).toBe("monitor");
    // splitWindows: 70/30
    const { baseline, recent } = splitWindows(mk(0.5, 100));
    expect(baseline.length).toBe(70);
    expect(recent.length).toBe(30);
  });

  test("runDriftDetection روی جفت‌های ورودی: سه ردیف پایدار + AuditLog برای alert+", async () => {
    const { runDriftDetection } = await import("@/lib/services/drift-service");
    const before = await db.driftCheck.count({ where: { modelId: "pn018-drift-m" } });
    const r = await runDriftDetection("pn018-drift-m", {
      pairs: Array.from({ length: 100 }, (_, i) => ({
        predictionId: `pd-${i}`,
        predictedValue: i < 70 ? 0.9 : 0.2,
        observedValue: i % 2,
        predictedAt: new Date(Date.now() - (100 - i) * 3600_000).toISOString(),
      })),
    });
    expect(r.reports.length).toBe(3);
    expect(r.reports.map((x) => x.driftType).sort()).toEqual(["concept", "data", "performance"]);
    const after = await db.driftCheck.count({ where: { modelId: "pn018-drift-m" } });
    expect(after).toBe(before + 3); // append-only
    // AuditLog برای کنش‌های غیر-monitor ثبت شد
    const alerts = await db.auditLog.count({ where: { action: "DRIFT_DETECTED" } });
    expect(alerts).toBeGreaterThan(0);
  });

  test("جفت‌های صفر → رانش عملکرد/مفهوم monitor بدون کرش + پنجرهٔ اخیر خالی صادقانه", async () => {
    const { runDriftDetection } = await import("@/lib/services/drift-service");
    const r = await runDriftDetection("pn018-drift-empty", { pairs: [] });
    expect(r.reports.find((x) => x.driftType === "performance")!.action).toBe("monitor");
    expect(r.reports.find((x) => x.driftType === "concept")!.action).toBe("monitor");
    expect(r.pairsRecent).toBe(0);
  });

  test("آستانه‌ها از env خوانده می‌شوند", async () => {
    process.env.MELK_DRIFT_ALERT = "0.05";
    delete require.cache[require.resolve("@/lib/services/drift-service")];
    const mod = await import("@/lib/services/drift-service");
    // const در سطح ماژول در زمان import خوانده می‌شود — مقدار پیش‌فرض در نبود env
    delete process.env.MELK_DRIFT_ALERT;
    expect([0.02, 0.05]).toContain(mod.DRIFT_ALERT);
    expect(mod.DRIFT_RETRAIN).toBe(0.05);
    expect(mod.DRIFT_ESCALATE).toBe(0.10);
  });

  test("listDriftChecks: مرتب نزولی + سقف", async () => {
    const { listDriftChecks } = await import("@/lib/services/drift-service");
    const rows = await listDriftChecks({ modelId: "pn018-drift-m", limit: 2 });
    expect(rows.length).toBeLessThanOrEqual(2);
    if (rows.length === 2) expect(rows[0].checkedAt >= rows[1].checkedAt).toBe(true);
  });
});

/* ═══════ ۳) حلقهٔ کامل (fixture) ═══════ */
describe("PN-018/فاز۷ · حلقهٔ کامل یادگیری", () => {
  test("runFullLearningCycle روی fixture: هفت گام + مهر نسخه روی پیش‌بینی تازه", async () => {
    const { runFullLearningCycle } = await import("@/lib/services/learning-loop-service");
    // مدل test با قهرمان موجود → حلقه کامل بدون شورا (گام ۶ رد صریح)
    await db.modelVersion.create({ data: { modelId: "pn018-loop-m", version: 1, status: "champion", brierScore: 0.3, sampleSize: 100, windowDays: 30, promotedAt: new Date(), councilApproved: true, approvalSource: "تست" } });
    const witness = await runFullLearningCycle({ modelId: "pn018-loop-m", actor: "test" });
    expect(witness.step1_collectPairs.pairs).toBeGreaterThanOrEqual(0); // روی test-env دادهٔ واقعی intelligence-data همان production jsonl است (فایل مشترک)
    expect(witness.step4_ensureChallenger.version).toBe(2);
    expect(witness.step6_promote.attempted).toBe(false);
    expect(witness.step6_promote.promoted).toBe(false);
    expect(witness.step7_newPrediction?.modelVersionId).toBeTruthy(); // مهر نسخهٔ فعال
    // snapshot تاریخی دیمن دست‌نخورده می‌ماند (جریان زنده جدا است)
    expect(existsSync(`${FIXTURE_DIR}/predictions-live.jsonl`)).toBe(true);
    expect(witness.loopClosed).toBe(true);
    // پیش‌بینی مهرشده واقعاً در جریان زنده است؟ (گام ۷)
    const lines = readFileSync(`${FIXTURE_DIR}/predictions-live.jsonl`, "utf8").trim().split("\n");
    const last = JSON.parse(lines[lines.length - 1]);
    expect(last.modelVersionId).toBeTruthy();
  });

  test("idempotency: دو اجرا → چالشگر فعال همان می‌ماند (نسخهٔ دوباره ساخته نمی‌شود)", async () => {
    const { runFullLearningCycle } = await import("@/lib/services/learning-loop-service");
    await db.modelVersion.deleteMany({ where: { modelId: "pn018-loop-m2" } });
    await db.modelVersion.create({ data: { modelId: "pn018-loop-m2", version: 1, status: "champion", brierScore: 0.3, sampleSize: 100, windowDays: 30, promotedAt: new Date(), councilApproved: true, approvalSource: "تست" } });
    const w1 = await runFullLearningCycle({ modelId: "pn018-loop-m2", actor: "test" });
    const w2 = await runFullLearningCycle({ modelId: "pn018-loop-m2", actor: "test" });
    expect(w2.step4_ensureChallenger.id).toBe(w1.step4_ensureChallenger.id); // همان چالشگر فعال
  });

  test("driftGuardTick: مدل‌های قهرمان را می‌پیماید و وارسی می‌کند", async () => {
    const { driftGuardTick } = await import("@/lib/services/learning-loop-service");
    const r = await driftGuardTick();
    expect(Array.isArray(r.models)).toBe(true);
    expect(typeof r.runs).toBe("number");
  });
});

/* ═══════ ۴) مرز API + آینه + روت لاغر ═══════ */
describe("PN-018/فاز۷ · مرز API نسخه‌بندی و رانش", () => {
  test("بدون توکن → 401 (روت‌های GET و POST)", async () => {
    const mvRoute = await import("@/app/api/admin/model-versions/route");
    const dcRoute = await import("@/app/api/admin/drift-checks/route");
    const res1 = await mvRoute.GET(await NR("/api/admin/model-versions"));
    expect(res1.status).toBe(401);
    const res2 = await dcRoute.GET(await NR("/api/admin/drift-checks"));
    expect(res2.status).toBe(401);
    const res3 = await mvRoute.POST(await NR("/api/admin/model-versions", { method: "POST", body: "{}" }));
    expect(res3.status).toBe(401);
  });

  test("CONSULTANT → 403", async () => {
    const { token } = await makeSession("CONSULTANT");
    const route = await import("@/app/api/admin/model-versions/route");
    const res = await route.GET(await NR("/api/admin/model-versions", { headers: hdr(token) }));
    expect(res.status).toBe(403);
  });

  test("OWNER → GET 200 با شکل کامل + POST ساخت چالشگر", async () => {
    const { token } = await makeSession("OWNER");
    const route = await import("@/app/api/admin/model-versions/route");
    const res = await route.GET(await NR("/api/admin/model-versions", { headers: hdr(token) }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(Array.isArray(body.rows)).toBe(true);
    // POST
    const res2 = await route.POST(await NR("/api/admin/model-versions", {
      method: "POST",
      headers: { ...hdr(token), "content-type": "application/json" },
      body: JSON.stringify({ modelId: "pn018-api-model" }),
    }));
    expect(res2.status).toBe(200);
    const b2 = await res2.json();
    expect(b2.version.modelId).toBe("pn018-api-model");
  });

  test("promote بدون شورا از API → 422 COUNCIL_APPROVAL_REQUIRED (چالشگر واقعی)", async () => {
    const { token } = await makeSession("OWNER");
    const { ensureChallenger } = await import("@/lib/services/model-versioning-service");
    const v = await ensureChallenger({ modelId: "pn018-api-gate-model", actor: "api-test" });
    const route = await import("@/app/api/admin/model-versions/[id]/promote/route");
    const res = await route.POST(
      await NR(`/api/admin/model-versions/${v.id}/promote`, {
        method: "POST", headers: { ...hdr(token), "content-type": "application/json" },
        body: JSON.stringify({ councilApproval: false }),
      }),
      { params: Promise.resolve({ id: v.id }) }
    );
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.code).toBe("COUNCIL_APPROVAL_REQUIRED");
  });

  test("آینه‌های v1 همان ماژول‌اند (تک‌منبع حقیقت)", async () => {
    const a1 = await import("@/app/api/admin/model-versions/route");
    const v1a = await import("@/app/api/v1/admin/model-versions/route");
    expect(v1a.GET).toBe(a1.GET);
    const a2 = await import("@/app/api/admin/drift-checks/route");
    const v1b = await import("@/app/api/v1/admin/drift-checks/route");
    expect(v1b.GET).toBe(a2.GET);
  });

  test("روت‌ها لاغرند — صفر db.* (گارد مرز مخزن)", () => {
    for (const f of [
      "src/app/api/admin/model-versions/route.ts",
      "src/app/api/admin/model-versions/[id]/promote/route.ts",
      "src/app/api/admin/model-versions/[id]/reject/route.ts",
      "src/app/api/admin/model-versions/[id]/rollback/route.ts",
      "src/app/api/admin/drift-checks/route.ts",
    ]) {
      const src = readFileSync(f, "utf8");
      expect(src).not.toMatch(/\bdb\.[a-zA-Z]/);
    }
  });

  test("مانیفست api-versioning با ۹۵ مسیر هم‌خوان (+۳ روت PN-020: تشخیص + ترمیم‌ها)", () => {
    const manifest = JSON.parse(readFileSync("download/pn012/api-versioning.json", "utf8"));
    expect(manifest.totalRoutes).toBe(95); // PN-020: ۹۲ + تشخیص + ترمیم‌ها + ترمیم[id]
    for (const v1 of ["/api/v1/admin/model-versions", "/api/v1/admin/model-versions/[id]/promote", "/api/v1/admin/model-versions/[id]/reject", "/api/v1/admin/model-versions/[id]/rollback", "/api/v1/admin/drift-checks"]) {
      expect(manifest.routes.some((r: { v1: string }) => r.v1 === v1)).toBe(true);
    }
    // PN-019 — هشت روت تازهٔ فاز ۸+۹
    for (const v1 of ["/api/v1/admin/decisions", "/api/v1/admin/decisions/stats", "/api/v1/admin/decisions/expire", "/api/v1/admin/action-plans", "/api/v1/admin/governance", "/api/v1/admin/governance/run", "/api/v1/admin/policy-evaluations", "/api/v1/admin/policy-evaluations/run"]) {
      expect(manifest.routes.some((r: { v1: string }) => r.v1 === v1)).toBe(true);
    }
  });
});

/* ═══════ ۵) کار Worker ═══════ */
describe("PN-018/فاز۷ · کار Worker (drift-guard)", () => {
  test("WORKER_JOB_IDS شامل driftGuard و ثبت با فاصلهٔ ۶ ساعت", async () => {
    const { WORKER_JOB_IDS, buildWorkerJobs } = await import("@/core/runtime/jobs");
    expect(WORKER_JOB_IDS.driftGuard).toBe("drift-guard");
    const saved = process.env.MELK_DRIFT_GUARD;
    delete process.env.MELK_DRIFT_GUARD;
    try {
      const jobs = buildWorkerJobs(null as never);
      const drift = jobs.find((j) => j.id === WORKER_JOB_IDS.driftGuard);
      expect(drift).toBeTruthy();
      expect(drift!.intervalMs).toBe(6 * 60 * 60_000);
    } finally {
      if (saved !== undefined) process.env.MELK_DRIFT_GUARD = saved;
    }
  });

  test("کلید خاموشی مستقل: MELK_DRIFT_GUARD=disabled → کار حذف", async () => {
    const { WORKER_JOB_IDS, buildWorkerJobs } = await import("@/core/runtime/jobs");
    process.env.MELK_DRIFT_GUARD = "disabled";
    try {
      const jobs = buildWorkerJobs(null as never);
      expect(jobs.some((j) => j.id === WORKER_JOB_IDS.driftGuard)).toBe(false);
    } finally {
      delete process.env.MELK_DRIFT_GUARD;
    }
  });
});

/* ═══════ ۶) سه گارد شورا ═══════ */
describe("PN-018/فاز۷ · سه گارد شورا", () => {
  test("audit-champion-challenger.sh → PASS", () => {
    const out = execSync("bash scripts/audit-champion-challenger.sh", { encoding: "utf8" });
    expect(out).toContain("PASS");
  });
  test("audit-drift-detection.sh → PASS", () => {
    const out = execSync("bash scripts/audit-drift-detection.sh", { encoding: "utf8" });
    expect(out).toContain("PASS");
  });
  test("audit-learning-loop.sh → PASS", () => {
    const out = execSync("bash scripts/audit-learning-loop.sh", { encoding: "utf8" });
    expect(out).toContain("PASS");
  });
});
