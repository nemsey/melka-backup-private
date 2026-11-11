/**
 * /api/sync/four-lists — PN-083 · هماهنگ‌ساز بروزرسانی چهار فهرست داشبورد ملک تبریز
 * ---------------------------------------------------------------------------
 * GET  (نیازمند نشست): نمای یکپارچهٔ چهار فهرست — ادغام SyncJobState (حقیقت
 *      اجرا · پایدار در برابر ری‌استارت) + فاز LCPP + قفل‌های زنده + شمار
 *      رکورد. هر سه سطح UI (نوار داشبورد · بخش بروزرسانی هر فهرست · کارهای
 *      پس‌زمینهٔ تنظیمات) از همین یک حقیقت می‌خوانند.
 * POST (نیازمند مالک): درخواست فوری — بدنه { list?: "m1"|"m2"|"m3"|"m4"|"all" }
 *      (پیش‌فرض all). M1/M2/M3 → پرچم LCPP (چرخهٔ فوری ≤۶۰ث) · M4 → پرچم
 *      مشاوران (experts-force.flag · همان نگهبان). اجرا زیر قفل update:mX و
 *      ثبت وضعیت list-mX — یعنی حتی «دستی» هم هرگز با پس‌زمینه تداخل نمی‌کند.
 */

import { NextRequest } from "next/server";
import { errorResponse, requireRole, requireSessionAsync } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";
import { readFourListsUnified, requestExpertsForceRefresh, parseFourListId } from "@/lib/melk-api/four-lists";
import { requestForceRefresh } from "@/sync/lists";

export const dynamic = "force-dynamic";

/** P2-03 — روت‌ها هرگز import مستقیم @/lib/db ندارند (الگوی db تنبل) */
async function getDb(): Promise<import("@prisma/client").PrismaClient> {
  const mod = (await import("@/lib/db")) as { db: import("@prisma/client").PrismaClient };
  return mod.db;
}

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);
  try {
    const db = await getDb();
    const view = await readFourListsUnified(db);
    return Response.json({ ok: true, ...view });
  } catch (e) {
    return Response.json({ ok: false, error: String((e as Error)?.message ?? e).slice(0, 200) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireRole(request, "OWNER", "/api/sync/four-lists");
  if (guard instanceof MelkApiError) return errorResponse(guard);
  try {
    let body: { list?: unknown } = {};
    try {
      body = (await request.json()) as typeof body;
    } catch {
      body = {};
    }
    const list = parseFourListId(body.list) ?? "all";
    const accepted: string[] = [];

    if (list === "all" || list === "m1" || list === "m2" || list === "m3") {
      if (requestForceRefresh()) accepted.push("M1/M2/M3");
    }
    if (list === "all" || list === "m4") {
      if (requestExpertsForceRefresh()) accepted.push("M4");
    }
    if (accepted.length === 0) {
      return Response.json({ ok: false, error: "ثبت درخواست فوری ناموفق" }, { status: 500 });
    }
    return Response.json({
      ok: true,
      list,
      message: `درخواست بروزرسانی ${accepted.join(" + ")} ثبت شد — چرخهٔ فوری حداکثر تا ۶۰ ثانیه دیگر آغاز و زیر قفل هماهنگ‌ساز اجرا می‌شود.`,
    });
  } catch (e) {
    return Response.json({ ok: false, error: String((e as Error)?.message ?? e).slice(0, 200) }, { status: 500 });
  }
}
