/**
 * /api/divar/connection — مدیریت اتصال دیوار (دو روش) با کلید ریست
 * ------------------------------------------------------
 * GET  — وضعیت هر دو روش اتصال + راهنمای اخذ کلید کنار
 * POST — action: "save-kenar" (ذخیره+آزمون کلید) | "start-phone" (درخواست کد پیامکی)
 *        | "verify-phone" (تأیید کد) | "reset" (ریست یک روش)
 */

import { NextRequest } from "next/server";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";
import { audit } from "@/lib/auth/session";
import { DIVAR_CONFIG } from "@/lib/divar/config";
import { divarSendOtp } from "@/lib/divar/client";
import {
  getConnectionStatuses,
  saveKenarKey,
  startPhoneAuth,
  completePhoneAuth,
  resetConnection,
} from "@/lib/divar/store";

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const statuses = await getConnectionStatuses();
  return Response.json({
    ok: true,
    connections: statuses,
    guide: {
      kenarPanelUrl: DIVAR_CONFIG.kenarPanelUrl,
      kenarDocsUrl: DIVAR_CONFIG.kenarDocsUrl,
      kenarSteps: [
        "به پنل کنار دیوار (divar.ir/kenar) بروید و با شماره موبایلِ کسب‌وکار خود وارد شوید.",
        "در صفحه «برنامه‌ها» یک برنامه جدید بسازید (برنامه تستی برای توسعه فوراً فعال می‌شود).",
        "برنامه را ثبت کنید و از صفحه مدیریت برنامه‌ها، کلید API (x-api-key) را کپی کنید.",
        "دسترسی‌های لازم را فعال کنید: SEARCH_POST (جست‌وجوی آگهی‌ها) و GET_POST (دریافت آگهی).",
        "کلید را در همین صفحه وارد و ذخیره کنید — سیستم بلافاصله کلید را با API رسمی کنار می‌آزماید.",
        "برای محدودیت‌ها/افزایش دسترسی، از پنل کنار تیکت پشتیبانی ثبت کنید.",
      ],
      phoneSteps: [
        "شماره موبایل حساب دیوار خود را وارد کنید.",
        "دیوار کد تأیید را پیامک می‌کند (کد از سمت خود دیوار ارسال می‌شود).",
        "کد دریافتی را در همین صفحه وارد کنید تا اتصال برقرار شود.",
      ],
    },
  });
}

export async function POST(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  // مدیریت اتصال دیوار فقط برای مالک سامانه
  if (guard.role !== "OWNER") {
    return errorResponse(
      new MelkApiError("UNAUTHORIZED", "مدیریت اتصال دیوار فقط برای مالک سامانه مجاز است.", 403, false)
    );
  }

  let body: { action?: string; apiKey?: string; phone?: string; code?: string; method?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "بدنه درخواست نامعتبر است.", 400, false));
  }

  switch (body.action) {
    case "save-kenar": {
      const result = await saveKenarKey(String(body.apiKey ?? ""));
      await audit("DIVAR_KENAR_SAVE", guard.personnelCode, `ok=${result.ok}`);
      return Response.json({ ok: result.ok, message: result.message });
    }

    case "start-phone": {
      const phone = String(body.phone ?? "");
      const local = phone.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
      const normalized = local.replace(/\D/g, "");
      const start = await startPhoneAuth(normalized);
      if (!start.ok) {
        return Response.json({ ok: false, message: start.message });
      }
      // درخواست زنده کد از خود دیوار
      try {
        const sent = await divarSendOtp(normalized);
        await audit("DIVAR_PHONE_OTP", guard.personnelCode, `sent=${sent.sent}`);
        return Response.json({ ok: true, message: "کد پیامکی دیوار به شماره شما ارسال شد — کد را وارد کنید." });
      } catch (err) {
        return Response.json({
          ok: false,
          message: (err as Error).message ?? "ارسال کد از سمت دیوار ناموفق بود.",
        });
      }
    }

    case "verify-phone": {
      const result = await completePhoneAuth(String(body.phone ?? ""), String(body.code ?? ""));
      await audit("DIVAR_PHONE_VERIFY", guard.personnelCode, `ok=${result.ok}`);
      return Response.json({ ok: result.ok, message: result.message });
    }

    case "reset": {
      const method = body.method === "phone" ? "phone" : body.method === "kenar" ? "kenar" : null;
      if (!method) {
        return errorResponse(new MelkApiError("UNKNOWN", "روش اتصال باید «kenar» یا «phone» باشد.", 400, false));
      }
      await resetConnection(method);
      await audit("DIVAR_RESET", guard.personnelCode, `method=${method}`);
      return Response.json({ ok: true, message: method === "kenar" ? "اتصال کنار دیوار بازنشانی شد." : "اتصال پیامکی دیوار بازنشانی شد." });
    }

    default:
      return errorResponse(
        new MelkApiError("UNKNOWN", "action باید یکی از save-kenar | start-phone | verify-phone | reset باشد.", 400, false)
      );
  }
}
