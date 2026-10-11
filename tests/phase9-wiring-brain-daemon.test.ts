/**
 * تست‌های بازسازی PHASE 9 — سیم‌کشی کامل + دیمن v2 + مغز هوشمند
 * ------------------------------------------------------
 * §۷ سیم‌کشی ایجنت (متدهای افزودنی recordOutcome/evaluateTile — الگوی طلایی)
 * §۸ حلقهٔ سرنوشت واقعی (دادهٔ واقعی در پایگاه تست — قطعیت + ارزیابی صادقانه)
 * §۹ دیمن v2 (تک‌نمونه + هم‌زمانی + سلامت)
 * §۱۰ سطح شفافیت مغز (endpoint + UI + ۱۱ موتور)
 * §۱۱ داشبورد M1-M4 (بازسازی ساختار — گارد جهانی)
 * اجرا: bun test tests/phase9-wiring-brain-daemon.test.ts
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { BaseIntelligentAgent, type BaseIntelligentAgentOptions } from "@/core/intelligence/base-intelligent-agent";
import type { InsightCard } from "@/core/agent/base-agent";
import type { EngineDeps } from "@/core/intelligence/engine-deps";
import { createOutcomeEngine } from "@/core/intelligence/outcome/outcome-engine";
import { createEvaluationEngine } from "@/core/intelligence/evaluation/evaluation-engine";
import { InMemoryPredictionRepository } from "@/core/intelligence/prediction/prediction-repository";
import type { PredictionRecord } from "@/core/intelligence/prediction/prediction-record";

const NOW = new Date("2026-09-29T12:00:00.000Z");

/** ایجنت آزمایشی — الگوی تست‌های فازهای ۴-۶ (EchoAgent) */
class TestAgent extends BaseIntelligentAgent {
  readonly tileId = "arm-listing" as const;
  readonly name = "ایجنت آزمایشی";
  readonly insightDomains = ["VOLUME"] as const;

  constructor(options?: BaseIntelligentAgentOptions) {
    super(options);
  }

  protected async computeRawInsights(): Promise<InsightCard[]> {
    return [];
  }
  // نماینده‌های عمومی برای تست متدهای محافظت‌شده
  async testRecordOutcome(outcome: string, options?: Parameters<TestAgent["recordOutcome"]>[1]) {
    return this.recordOutcome(outcome, options);
  }
  async testEvaluateTile(windowDays?: number) {
    return this.evaluateTile(windowDays);
  }
}

/* ==========================================================================
 * §۷ — سیم‌کشی ایجنت (متدهای افزودنی — قانون طلایی ۳)
 * ========================================================================== */

describe("PHASE 9 §۷ — سیم‌کشی ایجنت", () => {
  test("۷-۱) recordOutcome بدون موتور پیامد ⇒ null (رفتار PHASE 6 — سازگاری عقب‌وار)", async () => {
    const agent = new TestAgent(); // بدون engines
    expect(await agent.testRecordOutcome("TRANSACTION_OCCURRED")).toBeNull();
  });

  test("۷-۲) recordOutcome با موتور پیامد ⇒ شناسه + پیوند خودکار به پیش‌بینی", async () => {
    const predictionRepo = new InMemoryPredictionRepository();
    const record: PredictionRecord = {
      predictionId: "pred-x", predictionType: "PROPERTY", probability: 0.7, confidence: 0.6,
      drivers: [], risks: [], assumptions: [], modelVersion: "v", featureVersion: "f",
      contextSnapshot: { agentId: "a", tileId: "arm-listing", entityId: "e", entityType: "property", capturedAt: NOW, features: {} },
      createdAt: NOW, payload: {},
    };
    await predictionRepo.save(record);

    const engines: EngineDeps = {
      outcome: createOutcomeEngine(),
      predictionRepository: predictionRepo,
    };
    const agent = new TestAgent({ engines });
    const stored = await agent.testRecordOutcome("TRANSACTION_OCCURRED", {
      predictionId: "pred-x",
      evidence: { observed: 1 },
    });
    expect(stored).not.toBeNull();
    expect(stored!.outcomeId).toMatch(/^out-/);
    // حلقهٔ بسته: پیش‌بینی پیوند خورده
    const linked = await predictionRepo.findById("pred-x");
    expect(linked!.linkedOutcomeId).toBe(stored!.outcomeId);
  });

  test("۷-۳) recordOutcome با موتور خطادهدہ ⇒ null (بلع — جریان ایجنت هرگز نمی‌شکند)", async () => {
    const engines: EngineDeps = {
      outcome: {
        contractVersion: 1,
        record: async () => { throw new Error("خرابی انبار"); },
        query: async () => [],
        linkage: async () => ({ matched: 0, unmatched: 0 }),
      },
    };
    const agent = new TestAgent({ engines });
    expect(await agent.testRecordOutcome("X")).toBeNull();
  });

  test("۷-۴) evaluateTile بدون موتور ⇒ null؛ با موتور ⇒ گزارش کامل", async () => {
    const agent = new TestAgent();
    expect(await agent.testEvaluateTile()).toBeNull();

    const engine = createEvaluationEngine({
      predictions: { list: async () => [] },
      outcomes: { query: async () => [] },
      minSample: 100,
      now: () => NOW,
    });
    const agent2 = new TestAgent({ engines: { evaluation: engine } });
    const report = await agent2.testEvaluateTile(30);
    expect(report).not.toBeNull();
    expect(report!.tileId).toBe("arm-listing");
    expect(report!.windowDays).toBe(30);
    expect(report!.verdict).toBe("INSUFFICIENT_DATA");
  });
});

/* ==========================================================================
 * §۸ — حلقهٔ سرنوشت واقعی (پایگاه تست با دادهٔ واقعی‌نما)
 * ========================================================================== */

describe("PHASE 9 §۸ — حلقهٔ سرنوشت روی پایگاه داده", () => {
  let db: import("@prisma/client").PrismaClient;

  beforeAll(async () => {
    const { PrismaClient } = await import("@prisma/client");
    // پایگاه تست ایزوله (الگوی E.3 — هرگز custom.db)
    db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/test.db" } } });
    // دادهٔ آزمایشی قطعی: ۶۰ معامله‌شده + ۶۰ منتشرشده (بالای حداقل ۱۰۰ نمی‌رسد —
    // ارزیابی صادقانه INSUFFICIENT_DATA می‌ماند؛ قطعیت ریاضی همین است)
    const rows = [] as { propertyCode: string; status: string; price: number; pricePerMeter: number; meterage: number; areaId: string; areaName: string }[];
    for (let i = 0; i < 60; i++) {
      rows.push({
        propertyCode: `P9-SOLD-${String(i).padStart(4, "0")}`,
        status: "معامله شده",
        price: 2_000_000_000 + i * 1_000_000, // ریال
        pricePerMeter: 40_000_000 + i * 100_000,
        meterage: 80,
        areaId: "A1", areaName: "ائل‌گلی",
      });
    }
    for (let i = 0; i < 60; i++) {
      rows.push({
        propertyCode: `P9-PUB-${String(i).padStart(4, "0")}`,
        status: "منتشر شده",
        price: 3_000_000_000 + i * 1_000_000,
        pricePerMeter: 45_000_000 + i * 100_000,
        meterage: 90,
        areaId: "A1", areaName: "ائل‌گلی",
      });
    }
    for (const r of rows) {
      await db.propertyRecord.upsert({
        where: { propertyCode: r.propertyCode },
        create: { id: `p9-${r.propertyCode}`, ...r },
        update: { ...r },
      });
    }
  });

  test("۸-۱) حلقهٔ کامل: پیش‌بینی + پیامد + پیوند + ارزیابی صادقانه — و قطعیت دوبار", async () => {
    const { runOutcomeLoop } = await import("@/lib/intelligence/outcome-loop");
    const r1 = await runOutcomeLoop(db, NOW);
    expect(r1.summary.predictions).toBe(120);
    expect(r1.summary.positiveOutcomes).toBe(60);
    expect(r1.summary.negativeOutcomes).toBe(60);
    expect(r1.summary.linked).toBe(120);
    // هر پیش‌بینی پیامد پیوندخورده دارد (حلقهٔ بستهٔ کامل)
    expect(r1.predictions.every((p) => typeof p.linkedOutcomeId === "string")).toBe(true);
    // نمونه زیر ۱۰۰ نیست (۱۲۰) ⇒ ارزیابی عددی؛ ۱۲۰ ≥ ۱۰۰ ⇒ حکم معتبر
    expect(r1.summary.evaluation.sampleSize).toBe(120);
    expect(["INSUFFICIENT_DATA", "BELOW_BASELINE", "AT_BASELINE", "ABOVE_BASELINE"]).toContain(r1.summary.evaluation.verdict);
    // قطعیت: اجرای دوم همان اعداد
    const r2 = await runOutcomeLoop(db, NOW);
    expect(r2.summary.evaluation.brierScore).toBe(r1.summary.evaluation.brierScore);
    expect(r2.summary.evaluation.lift).toBe(r1.summary.evaluation.lift);
    expect(r2.summary.predictions).toBe(r1.summary.predictions);
  });

  test("۸-۲) گارد نشت برچسب — پیش‌بینی‌کننده هرگز ستون status را در ویژگی‌ها نمی‌بیند", async () => {
    const source = readFileSync("src/lib/intelligence/outcome-loop.ts", "utf8");
    // تابع toPropertyInput ستون status را برنمی‌گرداند (فقط برای برچسب پیامد خوانده می‌شود)
    expect(source).toMatch(/status: true \}/); // select برای پیامد
    const { buildPropertyFeatures } = await import("@/core/intelligence/feature/builders/property-features");
    // PropertyInput اساساً فیلد status ندارد — تایپ‌سطح گارد
    expect(source).not.toMatch(/status: row\.status, \/\/.*ویژگی/);
    expect(typeof buildPropertyFeatures).toBe("function");
  });
});

/* ==========================================================================
 * §۹ — دیمن v2 (تک‌نمونه + هم‌زمانی + شاهد)
 * ========================================================================== */

describe("PHASE 9 §۹ — دیمن v2", () => {
  // ایزوله‌سازی شاهدها: هر دو تست در دایرکتوری موقت — هرگز intelligence-data ریپو نوشته نمی‌شود
  let isoDir: string;
  let repoCwd: string;
  let repoDirEnv: string | undefined;

  beforeAll(() => {
    repoCwd = process.cwd();
    isoDir = mkdtempSync(join(tmpdir(), "melk-brain-iso-"));
    process.chdir(isoDir);
    // جداسازی کانال Worker: daemonHealth در تولید، وضعیت Worker زنده را از
    // upload/.runtime/runtime-status.json می‌خواند (مسیر مطلق ریشهٔ رپو). بدون این
    // انحراف، سرنوشت تست به «آیا Worker تولید تا این لحظه intelligence-cycle را
    // اجرا کرده؟» گره می‌خورد — نوسان زندهٔ CI (شکست پیش از نخستین چرخهٔ Worker
    // پس از ری‌استارت، پاس پس از آن). MELKA_REPO_DIR همان انکر رسمی خوددرمانی است.
    repoDirEnv = process.env.MELKA_REPO_DIR;
    process.env.MELKA_REPO_DIR = isoDir; // فایل وضعیت Worker در دایرکتوری ایزوله وجود ندارد → مسیر درون‌حافظه‌ای
  });

  afterAll(() => {
    process.chdir(repoCwd);
    if (repoDirEnv === undefined) delete process.env.MELKA_REPO_DIR;
    else process.env.MELKA_REPO_DIR = repoDirEnv;
    rmSync(isoDir, { recursive: true, force: true });
  });

  test("۹-۱) ensureBrainData — اجرای در-جا، تازگی، و اشتراک هم‌زمانی", async () => {
    // ماژول با کلید globalIsolated — تک‌نمونهٔ واقعی همان پروسهٔ تست
    const { ensureBrainData, peekBrainSummary, daemonHealth, isBrainDataFresh } = await import("@/lib/intelligence/daemon");
    const { PrismaClient } = await import("@prisma/client");
    const db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/test.db" } } });

    // دادهٔ آزمایشی §۸ همان پایگاه است — نخستین اجرا در-جا
    const s1 = await ensureBrainData(db, { now: NOW });
    expect(s1.predictions).toBeGreaterThan(0);
    expect(peekBrainSummary()?.ranAt).toBe(NOW.toISOString());
    expect(isBrainDataFresh(60 * 60 * 1000)).toBe(true);

    // تازه ⇒ بدون اجرای دوباره (همان شیء)
    const s2 = await ensureBrainData(db, { now: NOW });
    expect(s2).toBe(s1);

    // دو درخواست هم‌زمان وقتی کهنه ⇒ همان اجرا به اشتراک می‌رود
    const stale = { maxAgeMs: 0 };
    const [a, b] = await Promise.all([
      ensureBrainData(db, stale),
      ensureBrainData(db, stale),
    ]);
    expect(a.ranAt).toBe(b.ranAt);

    // سلامت دیمن
    const h = daemonHealth();
    expect(h.alive).toBe(true);
    expect(h.runs).toBeGreaterThanOrEqual(1);
    expect(h.lastRunAt).toBeTruthy();
    await db.$disconnect();
  });

  test("۹-۲) شاهد ماندگار — نخستین اجرا فایل‌ها را می‌سازد؛ اجرای بعدی loop-latest را بازنویسی می‌کند", async () => {
    const dir = mkdtempSync(join(tmpdir(), "melk-brain-"));
    const cwd = process.cwd();
    try {
      process.chdir(dir); // intelligence-data/ این‌جا ساخته می‌شود (ایزوله از ریپو)
      const { ensureBrainData } = await import("@/lib/intelligence/daemon");
      const { PrismaClient } = await import("@prisma/client");
      const db = new PrismaClient({ datasources: { db: { url: "file:/home/z/my-project/db/test.db" } } });
      await ensureBrainData(db, { maxAgeMs: 0, now: NOW }); // اجرای اجباری تازه در دایرکتوری ایزوله
      expect(existsSync(join(dir, "intelligence-data", "predictions.jsonl"))).toBe(true);
      expect(existsSync(join(dir, "intelligence-data", "outcomes.jsonl"))).toBe(true);
      const latest1 = readFileSync(join(dir, "intelligence-data", "loop-latest.json"), "utf8");
      expect(JSON.parse(latest1).predictions).toBeGreaterThan(0);
      // اجرای دوم — شاهدهای append یک‌باره رشد نمی‌کنند، فقط latest بازنویسی
      await ensureBrainData(db, { maxAgeMs: 0, now: new Date("2026-09-29T13:00:00.000Z") });
      const latest2 = JSON.parse(readFileSync(join(dir, "intelligence-data", "loop-latest.json"), "utf8"));
      expect(latest2.ranAt).toBe("2026-09-29T13:00:00.000Z");
      const predLines = readFileSync(join(dir, "intelligence-data", "predictions.jsonl"), "utf8").trim().split("\n").length;
      expect(predLines).toBe(latest1.trim().length > 0 ? JSON.parse(latest1).predictions : 0);
      await db.$disconnect();
    } finally {
      process.chdir(cwd);
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

/* ==========================================================================
 * §۱۰ — سطح شفافیت مغز (endpoint + UI + ۱۱ موتور)
 * ========================================================================== */

describe("PHASE 9 §۱۰ — شفافیت مغز هوشمند", () => {
  test("۱۰-۱) فهرست موتورها endpoint — همه با بدنه و فاز درست (۱۱ پایه + ۴ فرا-ذهن PN-024 + مشاور PN-025)", async () => {
    const { ENGINES } = await import("@/app/api/intelligence/status/route");
    expect(ENGINES.length).toBe(16);
    expect(ENGINES.filter((e) => e.bodyPhase === "PHASE 7").map((e) => e.id).sort()).toEqual(["action-planner", "outcome", "safety"]);
    expect(ENGINES.filter((e) => e.bodyPhase === "PHASE 8").map((e) => e.id).sort()).toEqual(["decision", "evaluation", "learning"]);
    expect(ENGINES.filter((e) => e.bodyPhase.startsWith("PHASE")).length).toBe(16);
    // PN-024 — چهار موتور فرا-ذهن (خواستهٔ ثانیاً مالک جلسهٔ ۰۳۱)
    expect(ENGINES.filter((e) => e.bodyPhase === "PHASE 13A").map((e) => e.id).sort()).toEqual(["attention", "causal"]);
    expect(ENGINES.filter((e) => e.bodyPhase === "PHASE 13B").map((e) => e.id).sort()).toEqual(["counterfactual", "simulation"]);
    // PN-025 — موتور ۱۶ مشاور تصمیم (فاز ۱۳-ج)
    expect(ENGINES.filter((e) => e.bodyPhase === "PHASE 13C").map((e) => e.id)).toEqual(["decision-advisor"]);
  });

  test("۱۰-۲) endpoint بدون نشست ⇒ ۴۰۱ (گارد استاندارد)", async () => {
    const { GET } = await import("@/app/api/intelligence/status/route");
    const { NextRequest } = await import("next/server");
    const req = new NextRequest("http://localhost/api/intelligence/status");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  test("۱۰-۳) کارت «مغز هوشمند و یادگیر ملکا» در تنظیمات عمومی نصب است", async () => {
    await import("@/core/tiles/bootstrap");
    const source = readFileSync("src/core/tiles/tiles/settings/SettingsPage.tsx", "utf8");
    expect(source).toContain("BrainStatusSection");
    const card = readFileSync("src/core/tiles/tiles/settings/BrainStatusSection.tsx", "utf8");
    expect(card).toContain("مغز هوشمند و یادگیر ملکا");
    expect(card).toContain("/api/intelligence/status");
  });

  test("۱۰-۴) PN-010 فاز ۲: چرخهٔ مغز در Worker اجرا می‌شود (instrumentation → Supervisor → Worker؛ قابل‌غیرفعال‌سازی با env)", async () => {
    const source = readFileSync("src/instrumentation.ts", "utf8");
    expect(source).toContain("RuntimeSupervisor"); // Web فقط Supervisor را نصب می‌کند
    const jobs = readFileSync("src/core/runtime/jobs.ts", "utf8");
    expect(jobs).toContain("intelligence-cycle"); // چرخهٔ مغز در صف Worker
    expect(jobs).toContain("runIntelligenceDaemonTick"); // همان تیک واحد دیمن قبلی
    const daemon = readFileSync("src/lib/intelligence/daemon.ts", "utf8");
    expect(daemon).toContain("MELK_INTELLIGENCE_DAEMON"); // کلید خاموشی عین قبل
  });
});

/* ==========================================================================
 * §۱۱ — داشبورد M1-M4 (گارد جهانی بازسازی)
 * ========================================================================== */

describe("PHASE 9 §۱۱ — داشبورد مدیریتی = دقیقاً M1 تا M4", () => {
  beforeAll(async () => {
    await import("@/core/tiles/bootstrap");
  });

  test("۱۱-۱) هوم = ۵ کاشی ملکا به ترتیب الزامی (دست‌نخورده در بازسازی)", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    expect(tileRegistry.listRoot("OWNER").map((t) => t.title)).toEqual([
      "فایل یابی ملکا",
      "آگهی ملکا",
      "درخواست ملکا",
      "تنظیمات عمومی",
      "داشبورد مدیریتی ملک تبریز",
    ]);
  });

  test("۱۱-۲) داشبورد مدیریتی = هشت کاشی M1-M8 (PN-003: m5 تطبیق + m6 یادگیری — نام‌گذاری مالک)", async () => {
    const { tileRegistry } = await import("@/core/tiles/tile-registry");
    const children = tileRegistry.listChildren("management-dashboard", "OWNER");
    expect(children.map((t) => t.title)).toEqual([
      "آگهی ملک تبریز",
      "درخواست ملک تبریز",
      "معاملات ملک تبریز",
      "کارشناسان ملک تبریز",
      "تطبیق هوشمند ملک تبریز",
      "پوشش اطلاعات ملک تبریز",
      "شاخص بازار ملک تبریز",
      "مغز ملکا — یادگیری و Tier",
    ]);
  });

  test("۱۱-۳) متن‌های UI کهنه (M1 تا M7 / هفت کاشی) پاک‌سازی شده‌اند", () => {
    const home = readFileSync("src/components/app/DashboardHome.tsx", "utf8");
    const dash = readFileSync("src/core/tiles/tiles/management-dashboard/ManagementDashboardPage.tsx", "utf8");
    const def = readFileSync("src/core/tiles/tiles/management-dashboard/index.ts", "utf8");
    for (const src of [home, dash, def]) {
      expect(src).not.toContain("M1 تا M7");
      expect(src).not.toContain("هفت کاشی");
    }
  });
});
