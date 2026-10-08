/**
 * /api/admin/policy-evaluations/run — PN-019 فاز ۹: اجرای دستی چرخهٔ ارزیابی (فقط OWNER)
 * پنج سیاست × ۴ متریک + سه حکم — حکم فقط توصیه؛ اعمال نیازمند شوراست.
 */
import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { runPolicyEvaluation } from "@/lib/services/governance-service";

export async function POST(request: NextRequest) {
  const guard = await requireRole(request, "OWNER", "POST /api/admin/policy-evaluations/run");
  if (guard instanceof MelkApiError) return errorResponse(guard);
  let raw: unknown = null;
  try {
    raw = await request.json();
  } catch {
    raw = {};
  }
  const body = (raw ?? {}) as { policyId?: string; windowDays?: number };
  const results = await runPolicyEvaluation(
    body.policyId,
    Number(body.windowDays ?? 90),
  );
  return Response.json({ ok: true, results, note: "حکم‌ها فقط توصیه‌اند — اعمال نیازمند تأیید شوراست." });
}
