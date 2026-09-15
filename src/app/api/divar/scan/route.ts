/**
 * /api/divar/scan — اجرای اسکن دستی + گزارش اسکن‌های اخیر
 * POST — اجرای کامل یک اسکن (جست‌وجو → جزئیات → فیلتر زمان واقعی → امتیازدهی)
 * GET  — ۱۰ گزارش اسکن آخر
 */

import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { errorResponse, requireRole, requireSessionAsync } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";
import { audit } from "@/lib/auth/session";
import { runDivarScan, triggerBackgroundScan, autoScanDue } from "@/lib/divar/scan";

export async function POST(request: NextRequest) {
  // HOTFIX-03 (SEC-6): اجرای اسکن دستی دیوار — فقط OWNER
  const role = await requireRole(request, "OWNER", "POST /api/divar/scan");
  if (role instanceof MelkApiError) return errorResponse(role);
  const guard = role.ctx;

  const summary = await runDivarScan();
  await audit("DIVAR_SCAN", guard.personnelCode, `new=${summary.newAds} inWindow=${summary.inWindow}`);
  return Response.json({ ok: summary.ok, summary });
}

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  // اسکن خودکار فرصت‌طلبانه — اگر فاصله تنظیم‌شده گذشته باشد در پس‌زمینه اجرا می‌شود
  if (await autoScanDue().catch(() => false)) {
    triggerBackgroundScan();
  }

  const logs = await db.divarScanLog.findMany({ orderBy: { startedAt: "desc" }, take: 10 });
  return Response.json({ ok: true, logs });
}
