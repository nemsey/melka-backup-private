/**
 * /api/intelligence/status — GET
 * ---------------------------------------------------------------------------
 * وضعیت «مغز هوشمند و یادگیر ملکا» (فازهای ۷/۸/۹) — شفافیت کامل برای مالک:
 *  - فهرست ۱۱ موتور با وضعیت بدنه (همه با بدنه از فاز ۹)
 *  - حلقهٔ سرنوشت: تعداد پیش‌بینی/پیامد/پیوند روی دادهٔ واقعی ARM
 *  - ارزیابی صادقانه: Brier + کالیبراسیون + Lift نسبت به خط پایه + حکم
 *  - دیمن v2: زنده بودن، تعداد اجرا، آخرین اجرا
 *  - یادگیری: آخرین نسخهٔ سیاست ایجنت M1 و منطق آن
 *
 * نیازمند نشست معتبر (همان گارد سایر روت‌های تحلیلی).
 * داده همیشه از آخرین اجرای زندهٔ حلقه (یا اجرای در-جا در نخستین درخواست).
 */

import { catalogDaemonStatus } from "@/lib/melk-api/catalog-daemon";
import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { daemonHealth, ensureBrainStatus, getLearningSnapshot } from "@/lib/intelligence/daemon";
import { runIntelligenceCoreCycle } from "@/lib/intelligence/core-cycle";

export const dynamic = "force-dynamic";

/** ۱۱ موتور قراردادی — همه با بدنهٔ واقعی از فاز ۹ (پیش از آن: ۵ بدنه تا فاز ۶) */
export const ENGINES = [
  { id: "context", title: "زمینه (Context)", bodyPhase: "PHASE 4" },
  { id: "memory", title: "حافظه (Memory)", bodyPhase: "PHASE 4" },
  { id: "retrieval", title: "بازیابی (Retrieval)", bodyPhase: "PHASE 5" },
  { id: "feature", title: "ویژگی (Feature)", bodyPhase: "PHASE 6" },
  { id: "prediction", title: "پیش‌بینی (Prediction)", bodyPhase: "PHASE 6" },
  { id: "outcome", title: "پیامد (Outcome)", bodyPhase: "PHASE 7" },
  { id: "action-planner", title: "برنامه‌ریز اقدام (ActionPlanner)", bodyPhase: "PHASE 7" },
  { id: "safety", title: "ایمنی (Safety)", bodyPhase: "PHASE 7" },
  { id: "evaluation", title: "ارزیابی (Evaluation)", bodyPhase: "PHASE 8" },
  { id: "learning", title: "یادگیری (Learning)", bodyPhase: "PHASE 8" },
  { id: "decision", title: "تصمیم (Decision)", bodyPhase: "PHASE 8" },
] as const;

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  try {
    // دادهٔ مغز — تازه یا اجرای در-جا (قطعی و سریع؛ بدون وابستگی فایل)
    const summary = await ensureBrainStatus();

    // آخرین نسخهٔ سیاست ایجنت M1 (یادگیری حلقه‌بسته)
    const policy = await getLearningSnapshot();

    // سند ۰۲۷ — چرخهٔ بزرگ P7→P11 روی دادهٔ واقعی (صفر اجرای خودکار)
    // db در لایهٔ lib به‌صورت تنبل بارگذاری می‌شود (خلوص روت‌ها — گارد P2-03)
    const core = await runIntelligenceCoreCycle();

    return Response.json(
      {
        ok: true,
        engines: ENGINES.map((e) => ({ ...e, hasBody: true })),
        enginesWithBody: ENGINES.length,
        enginesTotal: ENGINES.length,
        coreCycle: {
          ranAt: core.ranAt,
          tier: core.tier,
          tierBasis: core.tierBasis,
          p7: {
            outcomesCollected: core.p7.outcomesCollected,
            coveragePercent: core.p7.coveragePercent,
            brier: core.p7.evaluation.metrics.brierScore,
            lift: core.p7.evaluation.metrics.lift,
            ece: core.p7.evaluation.metrics.ece,
            verdict: core.p7.evaluation.verdict,
            rationale: core.p7.evaluation.rationale,
            learning: { learned: core.p7.learning.learned, reason: core.p7.learning.reason, tier: core.p7.learning.tier },
            shadow: core.p7.shadow,
            drift: core.p7.drift,
            // P6545/گام۲ — فیلدهای افزودنی برای کاشی M8 (کالیبراسیون مصوب جلسه ۰۳۳ + هدف Tier-aware)
            calibration: core.p7.calibration ?? { applied: false, mapVersion: null, rawBrier: core.p7.evaluation.metrics.brierScore, calibratedBrier: core.p7.evaluation.metrics.brierScore, rawLift: core.p7.evaluation.metrics.lift, calibratedLift: core.p7.evaluation.metrics.lift },
            brierTarget: core.p7.brierTarget,
            evaluation: { metrics: { brierScore: core.p7.evaluation.metrics.brierScore, lift: core.p7.evaluation.metrics.lift, ece: core.p7.evaluation.metrics.ece }, verdict: core.p7.evaluation.verdict },
          },
          p8: {
            decisionsCount: core.p8.decisions.length,
            safetyAllPassed: core.p8.safetyAllPassed,
            blockedCount: core.p8.blockedCount,
            plansCount: core.p8.plansCount,
            sample: core.p8.decisions.slice(0, 3).map((d) => ({ decisionType: d.decisionType, proposedAction: d.proposedAction, confidence: d.confidence, autoExecute: d.autoExecute })),
          },
          p9: {
            policyEvaluations: core.p9.policyEvaluations.map((p) => ({ policyId: p.policyId, verdict: p.verdict, rationale: p.rationale })),
            governance: core.p9.governance,
          },
          p10: {
            systemHealth: core.p10.systemHealth,
            overallScore: core.p10.overallScore,
            problems: core.p10.realProblems,
            checksSummary: { pass: core.p10.checks.filter((c) => c.status === "pass").length, warn: core.p10.checks.filter((c) => c.status === "warn").length, fail: core.p10.checks.filter((c) => c.status === "fail").length },
            // P6545/گام۲ — فهرست کامل ۲۵ بررسی برای کاشی M8 (افزودنی)
            checks: core.p10.checks.map((c) => ({ id: c.id, name: c.name, status: c.status, details: c.details })),
          },
          p11: {
            pendingProposals: core.p11.proposals.map((p) => ({ id: p.id, sourceCheckId: p.sourceCheckId, severity: p.severity, action: p.proposedAction.type, rationale: p.rationale })),
            executedCount: core.p11.executedCount,
            gateReviews: core.p11.gateReviews,
            // P6545/گام۲ — نام مستعار برای کاشی M8 (افزودنی)
            proposals: core.p11.proposals.map((p) => ({ id: p.id, sourceCheckId: p.sourceCheckId, severity: p.severity, status: p.status, rationale: p.rationale })),
          },
        },
        outcomeLoop: {
          tileId: summary.tileId,
          predictions: summary.predictions,
          outcomes: { positive: summary.positiveOutcomes, negative: summary.negativeOutcomes, total: summary.positiveOutcomes + summary.negativeOutcomes },
          linked: summary.linked,
          ranAt: summary.ranAt,
          reproduction: summary.reproduction,
        },
        evaluation: summary.evaluation,
        daemon: daemonHealth(),
        // P6530/گام ۶ — دیمن پایدار اتصال و انتقال داده (کاتالوگ‌های ARM)
        catalogDaemon: catalogDaemonStatus(),
        learning: policy
          ? { latestVersion: policy.latestVersion, active: policy.active, rationale: policy.rationale, createdAt: policy.createdAt }
          : null,
        phases: { 7: "بازسازی سند ۰۲۷ — Outcome/Evaluation/Learning + Tier + Shadow + Drift", 8: "بازسازی سند ۰۲۷ — Decision/Planner/Safety (صفر auto_execute)", 9: "بازسازی سند ۰۲۷ — PolicyEval + Governance ۱۵ قاعده", 10: "خودتشخیصی ۲۵ بررسی — شناخت صادقانهٔ سیستم", 11: "خودترمیمی کنترل‌شده — پیشنهاد بدون اجرا (قفل شورا)" },
      },
      { headers: { "Cache-Control": "no-store, must-revalidate" } },
    );
  } catch (err) {
    return errorResponse(
      new MelkApiError("UNKNOWN", `خطا در وضعیت مغز هوشمند: ${(err as Error).message}`, 500, false),
    );
  }
}
