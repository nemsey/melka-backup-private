/**
 * /api/opportunity-alerts — GET + PATCH (P6545/گام۱ BLOCK 1.4)
 * هشدار فرصت تطبیق آگهی↔درخواست — صفر اجرای خودکار؛ فقط هشدار.
 */
import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { OpportunityListener } from "@/core/matching";

/** P6545 — db تنبل (الگوی P2-03: روت‌ها هرگز import مستقیم @/lib/db ندارند) */
async function getDb() {
  const mod = (await import("@/lib/db")) as { db: import("@prisma/client").PrismaClient };
  return mod.db;
}


export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const db = await getDb();
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);
  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? 20);
    const listener = new OpportunityListener(db, 3);
    const alerts = await listener.alerts(limit);
    return Response.json({
      ok: true,
      alerts,
      constraint: "صفر اجرای خودکار — فقط هشدار (آستانهٔ انتشار ≥ ۰٫۷)",
    });
  } catch (e) {
    return Response.json({ ok: false, message: (e as Error).message }, { status: 500 });
  }
}

/** علامت دیده‌شدن — فقط وضعیت هشدار، نه هیچ کنش اجرایی */
export async function PATCH(request: NextRequest) {
  const db = await getDb();
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);
  try {
    const body = (await request.json()) as { ids?: string[] };
    if (!Array.isArray(body.ids)) {
      return Response.json({ ok: false, message: "ids الزامی است" }, { status: 400 });
    }
    const listener = new OpportunityListener(db, 3);
    const marked = await listener.markSeen(body.ids);
    return Response.json({ ok: true, marked });
  } catch (e) {
    return Response.json({ ok: false, message: (e as Error).message }, { status: 500 });
  }
}
