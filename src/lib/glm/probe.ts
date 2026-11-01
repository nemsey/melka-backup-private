/**
 * موتور پروب GLM (PN-038 · فاز ۳ · بند ۳.۱ — شورا-ن۰۶۳)
 * ---------------------------------------------------------------------------
 * «مدل GlmProbe در Prisma + روت /api/glm/probe» — حالت تست زندهٔ GLM:
 * پروب‌های کوتاه روی مسیرهای واقعی، شاهددار در پایگاه. هدف پیش‌فرض:
 * enums-persian (فهرست‌های مرجع عمومی ARM) — همان هدفی که مالک گفت.
 *
 * لایه‌های پروب:
 *   ۱) health      — نبض سرور خودِ ملکا (/api/health محلی بدون شبکه)
 *   ۲) melk-public — کاتالوگ عمومی (probeMelkPublic موجود)
 *   ۳) enums-persian — فهرست‌های مرجع عمومی از مسیر armPublic
 *
 * هر اجرا: ردیف GlmProbe (queued→running→done/failed) + AuditLog.
 * صفر راز در requestJson/resultJson (قانون لاگ).
 */

import { db } from "@/lib/db";
import { armCall } from "@/lib/melk-api/client";
import { getMelkApiConfig } from "@/lib/melk-api/config";
import { MELK_ENDPOINTS } from "@/lib/melk-api/endpoints";
import { MelkApiError } from "@/lib/melk-api/types";
import { probeMelkPublic } from "@/lib/melk-api/melk-public";

export const GLM_PROBE_TARGETS = ["health", "melk-public", "enums-persian"] as const;
export type GlmProbeTarget = (typeof GLM_PROBE_TARGETS)[number];

/** مهلت پروب — در تست‌ها با env کوتاه می‌شود (شکست‌سریع بدون انتظار شبکه) */
const PROBE_TIMEOUT_MS = Number.parseInt(process.env.GLM_PROBE_TIMEOUT_MS ?? "12000", 10);

export interface GlmProbeResult {
  ok: boolean;
  target: GlmProbeTarget;
  httpStatus: number;
  durationMs: number;
  count: number | null;
  sampleKeys?: string[];
  via: "direct-arm" | "local-health" | "melk-public" | "relay-cache";
  error?: string;
  /** پشتیبان رله: تازگی کش مرجع وقتی مسیر مستقیم مسدود است */
  relayCache?: { keys: Array<{ key: string; ageHours: number }>; freshestHours: number | null };
}

/** پشتیبان کش رله — مسیر مستقیم مسدود است؟ داده از رله در DB زنده است */
async function relayCacheFallback(): Promise<GlmProbeResult["relayCache"]> {
  try {
    const rows = await db.refListCache.findMany({ select: { key: true, fetchedAt: true } });
    const now = Date.now();
    const keys = rows
      .map((r) => ({ key: r.key, ageHours: Math.round(((now - r.fetchedAt.getTime()) / 3_600_000) * 10) / 10 }))
      .sort((a, b) => a.ageHours - b.ageHours)
      .slice(0, 8);
    return { keys, freshestHours: keys[0]?.ageHours ?? null };
  } catch {
    return undefined;
  }
}

/** اجرای یک هدف پروب — بدون نوشتن (قابل استفادهٔ داخلی/CLI) */
export async function executeGlmProbe(target: GlmProbeTarget): Promise<GlmProbeResult> {
  const t0 = Date.now();
  try {
    if (target === "health") {
      // نبض محلی — از خود فرایند (بدون شبکه)
      const { db: localDb } = await import("@/lib/db");
      await localDb.$queryRawUnsafe("SELECT 1 as alive");
      return { ok: true, target, httpStatus: 200, durationMs: Date.now() - t0, count: 1, via: "local-health" };
    }
    if (target === "melk-public") {
      const r = await probeMelkPublic();
      return { ok: r.ok, target, httpStatus: r.httpStatus, durationMs: Date.now() - t0, count: r.count, via: "melk-public", error: r.ok ? undefined : "کاتالوگ عمومی پاسخ نداد" };
    }
    // enums-persian — فهرست‌های مرجع عمومی ARM (بدون توکن)
    const cfg = getMelkApiConfig();
    const res = await armCall<Record<string, unknown>>({
      method: "GET",
      path: MELK_ENDPOINTS.armPublic.enums,
      baseUrl: cfg.armApiBase.replace(/\/apm\/$/, "/"),
      timeoutMs: PROBE_TIMEOUT_MS,
      maxRetries: 0,
    });
    const data = (res.data ?? {}) as Record<string, unknown>;
    const keys = Object.keys(data);
    let count: number | null = null;
    // شمارش خشن: مجموع طول آرایه‌های شمارشی
    const listVals = Object.values(data).filter((v): v is unknown[] => Array.isArray(v));
    if (listVals.length > 0) count = listVals.reduce((s, v) => s + v.length, 0);
    return {
      ok: true,
      target,
      httpStatus: 200,
      durationMs: Date.now() - t0,
      count,
      sampleKeys: keys.slice(0, 12),
      via: "direct-arm",
    };
  } catch (err) {
    const e = err instanceof MelkApiError ? err : null;
    // مسیر مستقیم مسدود؟ دادهٔ رله در DB زنده است — پشتیبان گزارش می‌شود
    const relayCache = target === "enums-persian" ? await relayCacheFallback() : undefined;
    return {
      ok: false,
      target,
      httpStatus: e?.httpStatus ?? 0,
      durationMs: Date.now() - t0,
      count: null,
      via: relayCache ? "relay-cache" : target === "health" ? "local-health" : "direct-arm",
      error: (err as Error)?.message?.slice(0, 180) ?? "خطای نامشخص",
      relayCache,
    };
  }
}

/**
 * اجرای پروب کامل با شاهدداری در GlmProbe + AuditLog.
 * خروجی: ردیف ایجادشده + نتیجه. هرگز throw نمی‌کند (پروب شکست خودش شاهد است).
 */
export async function runGlmProbe(
  label: string,
  target: GlmProbeTarget = "enums-persian"
): Promise<{ probeId: string; status: "done" | "failed"; result: GlmProbeResult }> {
  const row = await db.glmProbe.create({
    data: {
      label,
      target,
      status: "running",
      requestJson: JSON.stringify({ label, target, at: new Date().toISOString() }),
    },
  });
  const result = await executeGlmProbe(target);
  const status: "done" | "failed" = result.ok ? "done" : "failed";
  await db.glmProbe.update({
    where: { id: row.id },
    data: {
      status,
      durationMs: result.durationMs,
      resultJson: JSON.stringify({ ok: result.ok, httpStatus: result.httpStatus, count: result.count, via: result.via, sampleKeys: result.sampleKeys ?? [], relayCache: result.relayCache ?? null }),
      error: result.error ?? null,
    },
  });
  await db.auditLog
    .create({
      data: {
        action: "GLM_PROBE",
        actor: "glm:probe",
        detail: JSON.stringify({ probeId: row.id, label, target, status, durationMs: result.durationMs, httpStatus: result.httpStatus }),
      },
    })
    .catch(() => undefined);
  return { probeId: row.id, status, result };
}

/** فهرست پروب‌های اخیر (برای GET روت) */
export async function listRecentGlmProbes(limit = 10): Promise<Array<Record<string, unknown>>> {
  const rows = await db.glmProbe.findMany({ orderBy: { createdAt: "desc" }, take: Math.min(limit, 50) });
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    target: r.target,
    status: r.status,
    durationMs: r.durationMs,
    result: r.resultJson ? JSON.parse(r.resultJson) : null,
    error: r.error,
    createdAt: r.createdAt,
  }));
}
