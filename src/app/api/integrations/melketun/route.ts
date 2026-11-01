/**
 * /api/integrations/melketun — PN-043/فاز ۳ (شورا-ن۰۸۷): تنظیمات یکپارچهٔ ملکتون
 * ---------------------------------------------------------------------------
 * GET  — فرادادهٔ اتصال (base URLs + username ماسک‌شده + وضعیت آخرین ورود واقعی) — فقط OWNER
 * POST — سه رفتار:
 *   · بدون body/action (سازگاری عقبه) → تست زندهٔ هر دو اتصال (عمومی + CRM)
 *   · { action: "save-credentials", username, password } — PN-046/گام صفر:
 *     ذخیرهٔ اعتبارنامهٔ حساب شخصی CRM (یوزر + پسورد — الگوی «اتصال به ملک
 *     تبریز» ولی با یوزر/پسورد بجای کدپرسنلی + پیامک) + بلافاصله تست ورود واقعی
 *   · { action: "test" } → فقط تست (معادل رفتار پیش‌فرض)
 * راز‌ها هرگز برنمی‌گردند — فقط ok/status/latency/note (قانون ۱۲/۱۸).
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import {
  melketun,
  melketunMeta,
  saveMelketunCredentials,
} from "@/lib/integrations/melketun";

export async function GET(request: NextRequest) {
  const guard = await requireRole(request, "OWNER", "GET /api/integrations/melketun");
  if (guard instanceof MelkApiError) return errorResponse(guard);

  return Response.json({ ok: true, ...melketunMeta() });
}

export async function POST(request: NextRequest) {
  const guard = await requireRole(request, "OWNER", "POST /api/integrations/melketun");
  if (guard instanceof MelkApiError) return errorResponse(guard);

  // خواندن اختیاری body — فراخوان بدون body (سازگاری عقبه) = تست ساده
  let body: { action?: string; username?: string; password?: string } = {};
  try {
    const raw = await request.text();
    if (raw.trim()) body = JSON.parse(raw) as typeof body;
  } catch {
    // body نامعتبر → همان رفتار پیش‌فرض (تست)
  }

  // PN-046/گام صفر — ذخیرهٔ اعتبارنامه + تست ورود واقعی (فرم یوزر/پسورد تنظیمات)
  if (body.action === "save-credentials") {
    try {
      saveMelketunCredentials(body.username ?? "", body.password ?? "");
    } catch (e) {
      return Response.json(
        { ok: false, message: e instanceof Error ? e.message : "خطا در ذخیرهٔ اعتبارنامه" },
        { status: 400 }
      );
    }
    const crm = await melketun.testCrmLogin();
    return Response.json({ ok: true, crm, meta: melketunMeta() });
  }

  const [publicResult, crmResult] = await Promise.all([
    melketun.testPublicConnection(),
    melketun.testCrmLogin(),
  ]);

  return Response.json({ ok: true, public: publicResult, crm: crmResult });
}
