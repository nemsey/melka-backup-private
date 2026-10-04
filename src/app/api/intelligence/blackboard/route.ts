/**
 * /api/intelligence/blackboard — GET (P6545/گام۲ BLOCK 2.4)
 * نمایشگر تختهٔ سیاه (Blackboard viewer) — رویدادهای بین‌کاشی برای کاشی M8.
 * فیلتر: ?namespace=p7|p8|p9|p10|p11|daemon · ?limit=50
 */
import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { blackboardRead, type BlackboardNamespace } from "@/lib/intelligence/blackboard";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);
  try {
    const url = new URL(request.url);
    const namespace = (url.searchParams.get("namespace") ?? undefined) as BlackboardNamespace | undefined;
    const limit = Math.min(Number(url.searchParams.get("limit") ?? 50), 200);
    const entries = await blackboardRead({ namespace });
    // تازه‌ها اول + سقف
    const sorted = [...entries].sort((a, b) => (a.writtenAt < b.writtenAt ? 1 : -1)).slice(0, limit);
    return Response.json({
      ok: true,
      total: entries.length,
      entries: sorted.map((e) => ({ namespace: e.namespace, engineId: e.engineId, at: e.writtenAt, hash: e.hash, payload: e.payload })),
    });
  } catch (e) {
    return Response.json({ ok: false, message: (e as Error).message }, { status: 500 });
  }
}
