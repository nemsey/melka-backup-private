/**
 * /api/divar/scan — کارِ اسکن فایل‌یابی (DIR-FF-SUPER-001 · نسخهٔ ۳)
 * ------------------------------------------------------
 * POST — آغاز «کار اسکن» در پس‌زمینهٔ سرور و بازگشت فوری (<۱ ثانیه):
 *        { ok, started, job } — job = وضعیت/فاز/پیشرفت زنده.
 *        اسکن واقعی (جست‌وجو → جزئیات چندخطی → فیلتر زمان واقعی → امتیازدهی →
 *        آمار بازار → بازامتیازدهی) در سرور ادامه دارد و از همین روت با GET
 *        دنبال می‌شود. روت هرگز منتظر پایان اسکن نمی‌ماند ⇒ مهلت ۲۰ثانیه‌ای
 *        مرورگر برای اسکن منتفی است و پیام گمراه‌کنندهٔ رله/ترموکس نمی‌آید.
 * GET  — ۱۰ گزارش اسکن آخر + snapshot کارِ جاری (فیلد job) — نظارت زندهٔ UI.
 *
 * DIR-FF-RELAY-POLICY-001 (دستور مالک ۱۴۰۵/۰۹/۰۱ · پابرجا): اسکن دیوار در
 * کاشی فایل‌یابی به رلهٔ ترموکس نیاز ندارد — این روت همیشه در «حالت عادی» و
 * بدون رله اجرا می‌شود: fetch مستقیم از وب عمومی دیوار (client.ts)، بدون
 * ensureChangesSessionForOperation و بدون هیچ آیتمی در صف رله. رلهٔ ترموکس
 * فقط هنگام «ثبت فایل کشف‌شده در سامانه ARM» به کار می‌رود (روت register).
 *
 * DIR-FF-SUPER-001/گام سوم (دستور مالک): حالت تمام‌ظرفیت ترموکس فقط و فقط
 * هنگام ثبت فایل در سامانه ARM ملک تبریز فعال می‌شود (روت register) — این روت
 * هرگز آن را فعال نمی‌کند و اسکن همیشه در حالت عادی می‌ماند.
 */

import { NextRequest } from "next/server";
import { getMarketRepository } from "@/core/repositories";
import { errorResponse, requireRole, requireSessionAsync } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";
import { audit } from "@/lib/auth/session";
import { autoScanDue, startScanJob, getScanJob } from "@/lib/divar/scan";

export async function POST(request: NextRequest) {
  // HOTFIX-03 (SEC-6): اجرای اسکن دستی دیوار — فقط OWNER
  const role = await requireRole(request, "OWNER", "POST /api/divar/scan");
  if (role instanceof MelkApiError) return errorResponse(role);
  const guard = role.ctx;

  // HOTFIX-04 (B1): خطای اسکن هرگز به‌صورت 500 خام نمی‌رسد — پاکت فارسی استاندارد
  try {
    // آغاز کار اسکن در پس‌زمینه — بازگشت فوری (اگر اسکنی در جریان باشد، همان کار برمی‌گردد)
    const { started, job } = startScanJob("manual");
    if (started) {
      await audit("DIVAR_SCAN_START", guard.personnelCode, `job=${job.id} trigger=manual`);
    }
    return Response.json({ ok: true, started, job });
  } catch (err) {
    return errorResponse(
      new MelkApiError("UNKNOWN", `آغاز اسکن ناموفق بود: ${(err as Error)?.message ?? "خطای نامشخص"}. چند لحظه بعد دوباره بزنید.`, 500, false)
    );
  }
}

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  // اسکن خودکار فرصت‌طلبانه — اگر فاصله تنظیم‌شده گذشته باشد در پس‌زمینه آغاز می‌شود
  if (await autoScanDue().catch(() => false)) {
    startScanJob("auto");
  }

  const logs = await getMarketRepository().listRecentScanLogs(10);
  return Response.json({ ok: true, logs, job: getScanJob() });
}
