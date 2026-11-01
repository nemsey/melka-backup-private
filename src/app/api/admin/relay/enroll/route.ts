/**
 * POST /api/admin/relay/enroll — PN-031 (شورا-ن۰۳۷)
 * ---------------------------------------------------------------------------
 * ثبت دستگاه رلهٔ تازه — فقط OWNER.
 * خروجی: deviceId + راز (یک‌بار برای QR/دستور نصب) + کد یک‌بارمصرف bootstrap.
 * راز در پاسخ فقط این یک بار برمی‌گردد (در گوشی می‌نشیند؛ سرور نسخهٔ خود را
 * در RelayDevice دارد). شاهد کامل AuditLog با action=RELAY_ENROLL_OWNER.
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { audit } from "@/lib/auth/session";
import { createRelayDevice } from "@/lib/melk-api/relay";
import { buildInstallCommand } from "@/lib/melk-api/relay-script";
import { getPublicBaseUrl, PublicBaseUrlError } from "@/lib/http/public-url";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const guard = await requireRole(request, "OWNER", "/api/admin/relay/enroll");
  if (guard instanceof MelkApiError) return errorResponse(guard);
  const ctx = guard.ctx;

  try {
    const body = (await request.json().catch(() => null)) as { label?: string } | null;
    const label = (body?.label ?? "Poco F3").trim().slice(0, 60) || "Poco F3";

    // PN-031-HOTFIX (شورا-ن۰۳۸): نشانی عمومی — هرگز آدرسِ داخلیِ کانتینر (بایند 0.0.0.0)
    // قانون تازه: URL برای مصرف بیرونی فقط از getPublicBaseUrl
    // ترتیب: تعیین نشانی «پیش از» ساخت دستگاه — fail-closed نباید دستگاه یتیم بسازد
    let serverUrl: string;
    try {
      serverUrl = getPublicBaseUrl({
        headers: request.headers,
        connectionProtocol: request.nextUrl.protocol,
      });
    } catch (e) {
      if (e instanceof PublicBaseUrlError) {
        return Response.json({ ok: false, error: e.message }, { status: 503 });
      }
      throw e;
    }

    const dev = await createRelayDevice(label, ctx.personnelCode);

    await audit("RELAY_ENROLL_OWNER", ctx.personnelCode, `ثبت دستگاه رلهٔ «${label}» (${dev.deviceId}) — کد راه‌اندازی بخشندهٔ ۳تلاشی صادر شد`);

    return Response.json({
      ok: true,
      deviceId: dev.deviceId,
      label,
      installCommand: buildInstallCommand(serverUrl, dev.enrollCode),
      bootstrapUrl: `${serverUrl}/api/mobile-relay/bootstrap?code=${dev.enrollCode}`,
      enrollExpires: dev.enrollExpires.toISOString(),
      // PN-031-C (شورا-ن۰۴۰) — کد بخشنده: ۳ تلاش در پنجرهٔ ۳۰ دقیقه
      maxAttempts: 3,
      validityMinutes: 30,
      note: "راز دستگاه فقط در اسکریپتِ دانلودشده می‌نشیند — این پاسخ حاوی راز نیست. کد تا ۳ بار قابل استفاده است؛ سوختن نهایی فقط پس از اتصال موفق گوشی (اولین Poll).",
    });
  } catch (err) {
    if (err instanceof MelkApiError) return errorResponse(err);
    // PN-041-R (شورا-ن۰۶۸·بند ۲.۳): خطای خاموش → شفاف — خطای DB (P1008)
    // پیام روشن می‌گیرد نه «غیرمنتظره» مبهم (ریشهٔ شکایت کد نصب).
    const msg = String((err as Error)?.message ?? err);
    if (msg.includes("P1008") || msg.includes("timed out") || msg.includes("timeout")) {
      return Response.json(
        {
          ok: false,
          code: "DB_BUSY",
          message:
            "دیتابیس در لحظهٔ صادر کردن کد مشغول بود (قفل نوشتن). چند ثانیه بعد دوباره دکمه را بزنید — داده‌ای از دست نمی‌رود.",
          retryable: true,
        },
        { status: 503 }
      );
    }
    return errorResponse(new MelkApiError("UNKNOWN", "خطای غیرمنتظره در ثبت دستگاه رله.", 500, false));
  }
}
