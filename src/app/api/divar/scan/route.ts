/**
 * /api/divar/scan — اجرای اسکن دستی + گزارش اسکن‌های اخیر
 * POST — اجرای کامل یک اسکن (جست‌وجو → جزئیات → فیلتر زمان واقعی → امتیازدهی)
 * GET  — ۱۰ گزارش اسکن آخر
 */

import { NextRequest } from "next/server";
import { getMarketRepository } from "@/core/repositories";
import { errorResponse, requireRole, requireSessionAsync } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";
import { audit } from "@/lib/auth/session";
import { runDivarScan, triggerBackgroundScan, autoScanDue } from "@/lib/divar/scan";

export async function POST(request: NextRequest) {
  // HOTFIX-03 (SEC-6): اجرای اسکن دستی دیوار — فقط OWNER
  const role = await requireRole(request, "OWNER", "POST /api/divar/scan");
  if (role instanceof MelkApiError) return errorResponse(role);
  const guard = role.ctx;

  // HOTFIX-04 (B1): خطای اسکن هرگز به‌صورت 500 خام نمی‌رسد — پاکت فارسی استاندارد
  try {
    const summary = await runDivarScan();
    await audit("DIVAR_SCAN", guard.personnelCode, `new=${summary.newAds} inWindow=${summary.inWindow}`);
    return Response.json({ ok: summary.ok, summary });
  } catch (err) {
    return errorResponse(
      new MelkApiError("UNKNOWN", `اجرای اسکن ناموفق بود: ${(err as Error)?.message ?? "خطای نامشخص"}. چند لحظه بعد دوباره تلاش کنید.`, 500, false)
    );
  }
}

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  // اسکن خودکار فرصت‌طلبانه — اگر فاصله تنظیم‌شده گذشته باشد در پس‌زمینه اجرا می‌شود
  if (await autoScanDue().catch(() => false)) {
    triggerBackgroundScan();
  }

  const logs = await getMarketRepository().listRecentScanLogs(10);
  return Response.json({ ok: true, logs });
}
