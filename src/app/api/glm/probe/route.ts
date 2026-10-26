/**
 * روت پروب GLM — POST /api/glm/probe (PN-038 · فاز ۳ · بند ۳.۱)
 * ---------------------------------------------------------------------------
 * POST { label?, target? } → اجرای پروب زنده + شاهد GlmProbe (OWNER-only)
 * GET ?limit= → فهرست پروب‌های اخیر (OWNER-only)
 * هدف پیش‌فرض: enums-persian (فهرست‌های مرجع عمومی ARM — دستور مالک).
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { audit } from "@/lib/auth/session";
import { GLM_PROBE_TARGETS, runGlmProbe, listRecentGlmProbes, type GlmProbeTarget } from "@/lib/glm/probe";

export async function POST(request: NextRequest) {
  const guard = await requireRole(request, "OWNER", "/api/glm/probe");
  if (guard instanceof MelkApiError) return errorResponse(guard);
  try {
    const body = (await request.json().catch(() => ({}))) as { label?: string; target?: string };
    const target = (
      body.target && (GLM_PROBE_TARGETS as readonly string[]).includes(body.target) ? body.target : "enums-persian"
    ) as GlmProbeTarget;
    const label = (body.label ?? `glm-probe-${target}`).slice(0, 80);
    const r = await runGlmProbe(label, target);
    await audit("GLM_PROBE_RUN", guard.ctx.personnelCode, `label=${label}; target=${target}; status=${r.status}; probe=${r.probeId}`).catch(() => undefined);
    return Response.json({ ok: true, probeId: r.probeId, status: r.status, result: r.result });
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "اجرای پروب GLM ناموفق بود.", 500, false));
  }
}

export async function GET(request: NextRequest) {
  const guard = await requireRole(request, "OWNER", "/api/glm/probe");
  if (guard instanceof MelkApiError) return errorResponse(guard);
  try {
    const limit = Number(new URL(request.url).searchParams.get("limit") ?? "10");
    const probes = await listRecentGlmProbes(Number.isFinite(limit) ? limit : 10);
    return Response.json({ ok: true, targets: GLM_PROBE_TARGETS, probes });
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "خواندن پروب‌ها ناموفق بود.", 500, false));
  }
}
