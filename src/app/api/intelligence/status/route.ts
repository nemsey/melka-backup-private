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

    return Response.json(
      {
        ok: true,
        engines: ENGINES.map((e) => ({ ...e, hasBody: true })),
        enginesWithBody: ENGINES.length,
        enginesTotal: ENGINES.length,
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
        phases: { 7: "پیاده‌سازی کامل (Outcome + Safety + ActionPlanner + حلقهٔ سرنوشت)", 8: "پیاده‌سازی کامل (Evaluation + Learning + Decision)", 9: "پیاده‌سازی کامل (سیم‌کشی ۱۱/۱۱ + دیمن v2 + شفافیت مغز)" },
      },
      { headers: { "Cache-Control": "no-store, must-revalidate" } },
    );
  } catch (err) {
    return errorResponse(
      new MelkApiError("UNKNOWN", `خطا در وضعیت مغز هوشمند: ${(err as Error).message}`, 500, false),
    );
  }
}
