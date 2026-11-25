/**
 * GET /api/admin/relay/stealth — DIR-SUPER-STRUCT-001 (بخش ج · ۴ — حالت مخفی‌کاری)
 * POST /api/admin/relay/stealth (نیازمند مالک) — { enabled, ratePerMin?, jitterPct? }
 * ---------------------------------------------------------------------------
 * «ملکا می‌تواند سرعت درخواست‌های ترموکس را کنترل کند تا ترافیک شبیه به رفتار
 * یک کاربر انسانی باشد (مثلاً هر ۳ ثانیه یک درخواست)»:
 *   · پروفایل در upload/.runtime/relay-stealth.json می‌نشیند (عین الگوی پرچم‌های force)
 *   · در پاسخ هر poll به رله می‌رسد (فیلد stealth) — اسکریپت نسل Q نرخ ARM را
 *     به ratePerMin (پیش‌فرض ۲۰/دقیقه ≈ هر ۳ث) با جیتار درصدی محدود می‌کند.
 *   · در حالت تمام‌ظرفیت (کاشی تغییرات) مخفی‌کاری تسلیم می‌شود — ظرفیت مقدم است.
 *   · نسل‌های قدیمی فیلد را بی‌صدا نادیده می‌گیرند (سازگاری عقبه کامل).
 */

import { NextRequest } from "next/server";
import { errorResponse, requireRole, requireSessionAsync } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";
import { readRelayStealthProfile, writeRelayStealthProfile } from "@/lib/melk-api/relay";
import { audit } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);
  return Response.json({ ok: true, profile: readRelayStealthProfile() }, { headers: { "cache-control": "no-store" } });
}

export async function POST(request: NextRequest) {
  const guard = await requireRole(request, "OWNER", "/api/admin/relay/stealth");
  if (guard instanceof MelkApiError) return errorResponse(guard);
  try {
    const body = (await request.json()) as { enabled?: unknown; ratePerMin?: unknown; jitterPct?: unknown };
    const patch: { enabled?: boolean; ratePerMin?: number; jitterPct?: number } = {};
    if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
    if (body.ratePerMin != null && Number.isFinite(Number(body.ratePerMin))) patch.ratePerMin = Number(body.ratePerMin);
    if (body.jitterPct != null && Number.isFinite(Number(body.jitterPct))) patch.jitterPct = Number(body.jitterPct);
    const profile = writeRelayStealthProfile(patch);
    await audit(
      "RELAY_STEALTH_PROFILE",
      "owner",
      JSON.stringify({ enabled: profile.enabled, ratePerMin: profile.ratePerMin, jitterPct: profile.jitterPct })
    ).catch(() => undefined);
    return Response.json({ ok: true, profile }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return errorResponse(new MelkApiError("UNKNOWN", String((e as Error)?.message ?? e).slice(0, 150), 400, false));
  }
}
