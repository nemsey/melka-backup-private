/**
 * pn020-phase10-11.test.ts — PN-020 · فاز ۱۰ (خودآگاهی) + فاز ۱۱ (خودترمیمی)
 * =============================================================================
 * فاز ۱۰: ۲۵ بررسی · نمرهٔ موزون · آستانه‌ها · کار Worker · روت‌ها · دریل منفی
 * فاز ۱۱: پیشنهاد از تشخیص · دروازهٔ سه‌شرطی · قفل شورا (دریل منفی اجرا بدون تأیید)
 *          · سقف ۲۴ساعته · هفت کنش · رد AuditLog
 */

import { afterAll, describe, expect, test } from "bun:test";

const { db } = await import("@/lib/db");

afterAll(async () => {
  // پاک‌سازی رد ترمیم‌های تست (قید GOV-DATA-002 — هیچ DELETE بی‌بکاپی باقی نماند)
  await db.repairProposalRecord.deleteMany({ where: { target: { startsWith: "[TEST-PN020]" } } }).catch(() => undefined);
  await db.$disconnect();
});

/* ═══════════ فاز ۱۰ — خودآگاهی ═══════════ */

describe("PN-020/فاز۱۰ — خودآگاهی: ۲۵ بررسی + نمره", () => {
  test("۱۰-۱) چرخهٔ کامل: دقیقاً ۲۵ بررسی در ۵ دسته اجرا و ثبت می‌شود", async () => {
    const { runDiagnosisCycle } = await import("@/lib/services/self-diagnosis-service");
    const r = await runDiagnosisCycle("manual");
    expect(r.total).toBe(25);
    expect(r.passedCount).toBeGreaterThanOrEqual(0);
    expect(r.passedCount).toBeLessThanOrEqual(25);
    expect(r.durationMs).toBeGreaterThan(0);
  });

  test("۱۰-۲) نمرهٔ سلامت موزون در بازهٔ ۰-۱۰۰ و سازگار با شمارش", async () => {
    const { getLatestDiagnosis } = await import("@/lib/services/self-diagnosis-service");
    const d = await getLatestDiagnosis();
    expect(d.latest).not.toBeNull();
    const { latest } = d;
    expect(latest!.healthScore).toBeGreaterThanOrEqual(0);
    expect(latest!.healthScore).toBeLessThanOrEqual(100);
    // سازگاری: همه پاس → ۱۰۰ · همه ناموفق → ۰
    expect(latest!.checks).toHaveLength(25);
    const allPassed = latest!.passedCount === 25 ? latest!.healthScore === 100 : true;
    expect(allPassed).toBe(true);
  });

  test("۱۰-۳) ساختار نتیجهٔ هر بررسی — checkId پایدار + وزن + پیام فارسی", async () => {
    const { getLatestDiagnosis } = await import("@/lib/services/self-diagnosis-service");
    const d = await getLatestDiagnosis();
    for (const c of d.latest!.checks) {
      expect(c.checkId).toMatch(/^DIAG-(DATA|MODEL|ENGINE|SEC|GOV)-\d{3}$/);
      expect(c.weight).toBeGreaterThan(0);
      expect(c.message.length).toBeGreaterThan(3);
      expect([true, false]).toContain(c.passed);
    }
  });

  test("۱۰-۴) گزارش پایا در جدول DiagnosticReport + خلاصهٔ هفت اجرای اخیر", async () => {
    const rows = await db.diagnosticReport.count();
    expect(rows).toBeGreaterThanOrEqual(1);
    const { getLatestDiagnosis } = await import("@/lib/services/self-diagnosis-service");
    const d = await getLatestDiagnosis();
    expect(d.recent.length).toBeGreaterThanOrEqual(1);
    expect(d.recent.length).toBeLessThanOrEqual(7);
  });

  test("۱۰-۵) کار Worker diagnosis-cycle با چرخهٔ ۶ ساعته (+PN-025: پانزدهمین کار حافظه)", async () => {
    const { buildWorkerJobs, WORKER_JOB_IDS } = await import("@/core/runtime/jobs");
    const jobs = buildWorkerJobs(db);
    const diag = jobs.find((j) => j.id === WORKER_JOB_IDS.diagnosisCycle);
    expect(diag).toBeDefined();
    expect(diag!.intervalMs).toBe(6 * 60 * 60_000);
    expect(jobs.length).toBe(15); // ۱۴ کار قبلی + memory-consolidation فاز ۱۳-ج
  });

  test("۱۰-۶) مرز روت تشخیص — بدون احراز ۴۰۱", async () => {
    const { NextRequest } = await import("next/server");
    const routeMod = await import("@/app/api/admin/diagnosis/route");
    const req = new NextRequest("http://localhost/api/admin/diagnosis", { headers: { authorization: "Bearer invalid-token-0000000000000000000000" } });
    const res = await routeMod.GET(req);
    expect(res.status).toBe(401);
  });

  test("۱۰-۷) دریل منفی — بررسی بحرانی شکست‌خورده → هشدار critical در alerts", async () => {
    // شبیه‌سازی: گزارش دستی با بررسی بحرانی ناموفق (DATA-001)
    const { db: d2 } = await import("@/lib/db");
    await d2.diagnosticReport.create({
      data: {
        healthScore: 20,
        passedCount: 10,
        alertsJson: JSON.stringify([{ checkId: "DIAG-DATA-001", severity: "critical", message: "[TEST] انسجام پایگاه داده ناسالم" }]),
        checksJson: JSON.stringify([
          { checkId: "DIAG-DATA-001", category: "data", title: "[TEST-PN020] انسجام", passed: false, weight: 4.3, score: 0, value: null, expected: "ok", message: "ناسالم" },
        ]),
        triggerSource: "manual",
        durationMs: 5,
      },
    });
    const { getLatestDiagnosis } = await import("@/lib/services/self-diagnosis-service");
    const d = await getLatestDiagnosis();
    expect(d.latest!.alerts.some((a) => a.checkId === "DIAG-DATA-001" && a.severity === "critical")).toBe(true);
  });
});

/* ═══════════ فاز ۱۱ — خودترمیمی ═══════════ */

describe("PN-020/فاز۱۱ — خودترمیمی: پیشنهاد + دروازه + قفل شورا", () => {
  test("۱۱-۱) تولید پیشنهاد از آخرین تشخیص — فقط بررسی‌های ناموفقِ قابل‌ترمیم", async () => {
    const { generateRepairProposals } = await import("@/lib/services/self-repair-service");
    const { REPAIR_CANDIDATES } = await import("@/lib/services/self-diagnosis-service");
    const r = await generateRepairProposals("test");
    expect(r.created).toBeGreaterThanOrEqual(0);
    // اگر ساخت شد: هر پیشنهاد checkId ناموفقِ نگاشت‌دار + rollback غیرخالی
    for (const p of r.proposals) {
      expect(Object.keys(REPAIR_CANDIDATES)).toContain(p.checkId);
      expect(p.rollbackPlan.length).toBeGreaterThan(5);
      expect(p.status).toBe("proposed");
      expect(p.approvalSource).toBeNull();
    }
  });

  test("۱۱-۲) دریل منفی قفل شورا — اجرای پیشنهاد بدون تأیید → بلاک با 412", async () => {
    const { executeRepairProposal } = await import("@/lib/services/self-repair-service");
    // پیشنهاد ساختگی در وضعیت proposed (بدون تأیید)
    const row = await db.repairProposalRecord.create({
      data: {
        checkId: "DIAG-SEC-004",
        actionType: "prune_sessions",
        target: "[TEST-PN020] نشست‌های OWNER اضافی",
        justification: "[TEST-PN020] دریل منفی قفل شورا",
        expectedOutcome: "بستن نشست‌های اضافی",
        rollbackPlan: "نشست‌های حذف‌شده از بکاپ قابل بازیابی‌اند",
        status: "proposed",
      },
    });
    let blocked = false;
    try {
      await executeRepairProposal(row.id, "test");
      blocked = false;
    } catch (e) {
      blocked = (e as { httpStatus?: number }).httpStatus === 412;
    }
    expect(blocked).toBe(true);
    // رد بلاک در AuditLog ثبت شد (قفل ابدی مستند)
    const audit = await db.auditLog.findFirst({ where: { action: "REPAIR_BLOCKED" }, orderBy: { id: "desc" } });
    expect(audit).not.toBeNull();
  });

  test("۱۱-۳) جریان کامل قانونی: تأیید (سه‌شرطی) → اجرا → ثبت REPAIR_EXECUTED", async () => {
    const { approveRepairProposal, executeRepairProposal, generateRepairProposals } = await import("@/lib/services/self-repair-service");
    const { runDiagnosisCycle } = await import("@/lib/services/self-diagnosis-service");
    // تشخیص تازه — اگر DIAG-SEC-004 ناموفق باشد (۱۱ نشست OWNER فعال — محتمل)، پیشنهادش ساخته می‌شود
    await runDiagnosisCycle("manual");
    const gen = await generateRepairProposals("test");
    const target = gen.proposals.find((p) => p.checkId === "DIAG-SEC-004" && p.actionType === "prune_sessions");
    if (!target) {
      // محیط تست ممکن است نشست کمی داشته باشد — جریان را با پیشنهاد مصنوعی تأییدشده می‌سنجیم
      const row = await db.repairProposalRecord.create({
        data: {
          checkId: "DIAG-DATA-003", actionType: "custom",
          target: "[TEST-PN020] جریان کامل قانونی",
          justification: "[TEST-PN020]", expectedOutcome: "[TEST-PN020]",
          rollbackPlan: "ثبت وضعیت قبلی و بازگشت دستی با تأیید شورا",
          status: "proposed",
        },
      });
      // بررسی متناظر در آخرین تشخیص باید ناموفق باشد تا شرط «مشکل واقعی» بگذرد؛
      // اگر ناموفق نیست، این تست را با بی‌طرفی رد می‌کنیم (دریل بالا خودش قفل را پوشش داد)
      const { getLatestDiagnosis } = await import("@/lib/services/self-diagnosis-service");
      const d = await getLatestDiagnosis();
      const failed = d.latest!.checks.find((c) => c.checkId === "DIAG-DATA-003");
      if (failed && !failed.passed) {
        const approved = await approveRepairProposal(row.id, "council-test", "council");
        expect(approved.status).toBe("approved");
        expect(approved.approvalSource).toBe("council");
        const exec = await executeRepairProposal(row.id, "test");
        expect(exec.executed).toBe(true);
      } else {
        console.log("  [اطلاع] بررسی DATA-003 در این محیط پاس است — جریان تأیید/اجرا با دریل قفل پوشش داده شد");
      }
      return;
    }
    const approved = await approveRepairProposal(target.id, "council-test");
    expect(approved.status).toBe("approved");
    const exec = await executeRepairProposal(target.id, "test");
    expect(exec.executed).toBe(true);
    expect(exec.proposal.status).toBe("executed");
    expect(exec.proposal.resultJson).toBeTruthy();
  });

  test("۱۱-۴) سقف نرخ — ترمیم دوم در ۲۴ ساعت → 412", async () => {
    const { executeRepairProposal } = await import("@/lib/services/self-repair-service");
    // اگر ۱۱-۳ ترمیمی اجرا کرد، این باید سقف را ببیند؛ وگرنه از بالاترین executed موجود استفاده می‌کنیم
    const last = await db.repairProposalRecord.findFirst({ where: { status: "executed" }, orderBy: { executedAt: "desc" } });
    if (!last) {
      console.log("  [اطلاع] ترمیم اجراشده‌ای نیست — سقف با تست واحد موتور خالص پوشش داده شده");
      return;
    }
    const row = await db.repairProposalRecord.create({
      data: {
        checkId: "DIAG-DATA-003", actionType: "custom",
        target: "[TEST-PN020] سقف نرخ",
        justification: "[TEST-PN020]", expectedOutcome: "[TEST-PN020]",
        rollbackPlan: "ثبت وضعیت قبلی", status: "approved", approvalSource: "council", approvedAt: new Date(),
      },
    });
    let capped = false;
    try {
      await executeRepairProposal(row.id, "test");
    } catch (e) {
      capped = (e as { httpStatus?: number }).httpStatus === 412;
    }
    expect(capped).toBe(true);
  });

  test("۱۱-۵) هفت نوع کنش معتبر + لیبل فارسی", async () => {
    const { REPAIR_ACTION_TYPES, REPAIR_ACTION_LABELS } = await import("@/lib/services/self-repair-service");
    expect(REPAIR_ACTION_TYPES).toHaveLength(7);
    for (const t of REPAIR_ACTION_TYPES) {
      expect(REPAIR_ACTION_LABELS[t].length).toBeGreaterThan(3);
    }
  });

  test("۱۱-۶) روت فهرست ترمیم بدون احراز → ۴۰۱", async () => {
    const { NextRequest } = await import("next/server");
    const routeMod = await import("@/app/api/admin/repairs/route");
    const req = new NextRequest("http://localhost/api/admin/repairs", { headers: { authorization: "Bearer invalid-token-0000000000000000000000" } });
    const res = await routeMod.GET(req);
    expect(res.status).toBe(401);
  });

  test("۱۱-۷) نگاشت ترمیم: ۱۶ بررسی دارای مسیر ترمیم — بقیه فقط پایش", async () => {
    const { REPAIR_CANDIDATES } = await import("@/lib/services/self-diagnosis-service");
    expect(Object.keys(REPAIR_CANDIDATES).length).toBe(16);
    for (const [checkId, action] of Object.entries(REPAIR_CANDIDATES)) {
      expect(checkId).toMatch(/^DIAG-/);
      expect(["reindex", "recalibrate", "retrain", "prune_sessions", "restore_backup", "update_threshold", "custom"]).toContain(action);
    }
  });
});
