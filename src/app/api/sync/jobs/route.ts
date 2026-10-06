/**
 * /api/sync/jobs — GET (P6545/گام۱ BLOCK 1.1)
 * وضعیت کارهای پس‌زمینه از DB — پایدار در برابر ری‌استارت (شفافیت UI).
 */
import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { JobStateService } from "@/lib/melk-api/job-state";

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
    const jobs = new JobStateService(db);
    return Response.json({ ok: true, jobs: await jobs.list() });
  } catch (e) {
    return Response.json({ ok: false, message: (e as Error).message }, { status: 500 });
  }
}
