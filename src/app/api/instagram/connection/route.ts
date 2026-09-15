/**
 * /api/instagram/connection — بخش «اتصال به اینستاگرام» در تنظیمات عمومی
 * ------------------------------------------------------
 * GET  — وضعیت اتصال + راهنمای گام‌به‌گام اخذ توکن + تنظیمات محتوا
 * POST — عملیات: save (توکن + شناسه، با آزمون زنده) | retest | reset | settings
 */

import { NextRequest } from "next/server";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { MelkApiError } from "@/lib/melk-api/types";
import { audit } from "@/lib/auth/session";
import { getInstagramStatus, saveInstagramConnection, retestInstagramConnection, resetInstagramConnection, loadInstagramSettings, saveInstagramSettings } from "@/lib/instagram/store";
import { IG_TOKEN_GUIDE_STEPS, IG_TONES } from "@/lib/instagram/config";
import type { IgTone } from "@/lib/instagram/config";

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const [status, settings] = await Promise.all([getInstagramStatus(), loadInstagramSettings()]);
  return Response.json({
    ok: true,
    connection: status,
    settings,
    guide: {
      steps: IG_TOKEN_GUIDE_STEPS,
      docsUrl: "https://developers.facebook.com/docs/instagram-api/getting-started",
      graphExplorerUrl: "https://developers.facebook.com/tools/explorer/",
    },
    tones: IG_TONES,
  });
}

export async function POST(request: NextRequest) {
  // HOTFIX-03 (SEC-6): اتصال اینستاگرام — فقط OWNER
  const role = await requireRole(request, "OWNER", "POST /api/instagram/connection");
  if (role instanceof MelkApiError) return errorResponse(role);
  const guard = role.ctx;

  let body: {
    action?: "save" | "retest" | "reset" | "settings";
    accessToken?: string;
    igUserId?: string;
    settings?: { defaultTone?: IgTone; includeContactInCaption?: boolean; contactLine?: string };
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return errorResponse(new MelkApiError("UNKNOWN", "بدنه درخواست نامعتبر است.", 400, false));
  }

  switch (body.action) {
    case "save": {
      if (!body.accessToken) {
        return errorResponse(new MelkApiError("UNKNOWN", "توکن دسترسی را وارد کنید.", 400, false));
      }
      const result = await saveInstagramConnection({ accessToken: body.accessToken, igUserId: body.igUserId });
      await audit(result.ok ? "IG_CONNECT" : "IG_CONNECT_FAIL", guard.personnelCode, result.message.slice(0, 120));
      return Response.json({ ok: result.ok, message: result.message, username: result.username ?? null });
    }
    case "retest": {
      const result = await retestInstagramConnection();
      return Response.json({ ok: result.ok, message: result.message });
    }
    case "reset": {
      await resetInstagramConnection();
      await audit("IG_RESET", guard.personnelCode);
      return Response.json({ ok: true, message: "اتصال اینستاگرام بازنشانی شد — چراغ نشانگر قرمز می‌شود." });
    }
    case "settings": {
      const next = await saveInstagramSettings(body.settings ?? {});
      return Response.json({ ok: true, message: "تنظیمات محتوای اینستاگرام ذخیره شد.", settings: next });
    }
    default:
      return errorResponse(new MelkApiError("UNKNOWN", "عملیات نامعتبر است.", 400, false));
  }
}
