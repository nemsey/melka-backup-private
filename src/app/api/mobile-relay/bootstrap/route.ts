/**
 * GET /api/mobile-relay/bootstrap?code=XXX — PN-031 (شورا-ن۰۳۷) · PN-031-C (شورا-ن۰۴۰)
 * ---------------------------------------------------------------------------
 * تحویل اسکریپت رلهٔ اختصاصی دستگاه — احراز با کد راه‌اندازی ۳۰دقیقه‌ای که
 * فقط مالک (OWNER) از تنظیمات می‌گیرد.
 *
 * PN-031-C — «کد بخشنده» (پایان چرخهٔ ۴۰۳ جلسهٔ ۰۴۰):
 *   · کد تا ۳ بار دانلود می‌شود (تلاش ناموفق کد را نمی‌سوزاند)
 *   · سوختن نهایی فقط پس از اولین Poll موفق گوشی (markRelayEnrollCompleted)
 *   · پیام خطای دقیق و متمایز: used/limit («سوخته») · expired («منقضی») ·
 *     invalid («نامعتبر») · revoked («ابطال‌شده»)
 * خروجی: text/x-shellscript با پیکربندی تزریقی (راز دستگاه داخل فایل).
 */

import { NextRequest } from "next/server";
import { consumeEnrollCode, type EnrollRejectReason } from "@/lib/melk-api/relay";
import { buildRelayScript } from "@/lib/melk-api/relay-script";
import { getPublicBaseUrl, PublicBaseUrlError } from "@/lib/http/public-url";
import { audit } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** پیام فارسی دقیق به ازای هر دلیل رد (کار ۵ سند ۰۴۰) — بدون نشت اطلاعات اضافی */
const REJECT_MESSAGES: Record<EnrollRejectReason, { message: string; hint: string }> = {
  used: {
    message: "کد سوخته — این کد قبلاً با موفقیت برای راه‌اندازی همین گوشی استفاده شده و رله فعال است.",
    hint: "اگر رله کار نمی‌کند، Termux را ببندید و دوباره باز کنید تا اسکریپت از سرور ادامه دهد؛ نیازی به کد تازه نیست.",
  },
  limit: {
    message: "کد سوخته — سقف ۳ تلاش دانلود برای این کد پر شده است.",
    hint: "از تنظیمات ملکا (بخش رلهٔ موبایل) یک دستگاه تازه ثبت کنید تا کد تازه بگیرید.",
  },
  expired: {
    message: "کد منقضی — پنجرهٔ ۳۰ دقیقه‌ای اعتبار این کد گذشته است.",
    hint: "از تنظیمات ملکا (بخش رلهٔ موبایل) دکمهٔ راه‌اندازی را دوباره بزنید تا کد تازه صادر شود.",
  },
  invalid: {
    message: "کد نامعتبر — چنین کدی صادر نشده است (ناقص کپی شده یا غلط است).",
    hint: "دستور نصب را کامل از تنظیمات ملکا یا QR کپی کنید.",
  },
  revoked: {
    message: "کد باطل شده — دستگاه صاحب این کد از سمت مالک ابطال شده است.",
    hint: "برای راه‌اندازی مجدد، دستگاه تازه‌ای از تنظیمات ثبت کنید.",
  },
};

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")?.trim() ?? "";
  if (!code) return Response.json({ ok: false, error: "missing code", reason: "invalid" }, { status: 400 });
  // PN-031-D (فاز ۲): شاخهٔ JSON برای اپ رسمی اندروید ملکا — همان کد بخشنده،
  // همان شمارش تلاش و همان دلایل رد؛ فقط خروجی JSON به‌جای اسکریپت Termux.
  const wantJson = request.nextUrl.searchParams.get("format")?.trim().toLowerCase() === "json";

  // نشانی سرور — PN-031-HOTFIX (شورا-ن۰۳۸): نشانی عمومی، نه بایند داخلی کانتینر.
  // کد بخشنده است؛ با این حال تعیین نشانی پیش از مصرف تلاش انجام می‌شود تا
  // خطای نشانی اصلاً تلاشی حساب نشود (روی سقف ۳تایی اثر نگذارد).
  let serverUrl: string;
  try {
    serverUrl = getPublicBaseUrl({
      headers: request.headers,
      connectionProtocol: request.nextUrl.protocol,
    });
  } catch (e) {
    if (e instanceof PublicBaseUrlError) {
      return Response.json({ ok: false, error: e.message, reason: "server-url" }, { status: 503 });
    }
    throw e;
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "unknown";
  const consumed = await consumeEnrollCode(code, ip);
  if (!consumed.ok) {
    const { message, hint } = REJECT_MESSAGES[consumed.reason];
    await audit("RELAY_BOOTSTRAP_REJECT", "public", `کد راه‌اندازی رد شد: ${consumed.reason}`);
    return Response.json({ ok: false, reason: consumed.reason, error: message, hint }, { status: 403 });
  }

  // PN-031-D (فاز ۲): خروجی JSON برای اپ اندروید — راز دستگاه همان‌جا که در
  // اسکریپت Termux بود؛ اپ آن را در Keystore/EncryptedSharedPreferences گوشی
  // مالک نگه می‌دارد (سوختن نهایی کد همچنان فقط با اولین Poll موفق).
  if (wantJson) {
    return Response.json(
      {
        ok: true,
        deviceId: consumed.device.deviceId,
        deviceSecret: consumed.device.secret,
        serverUrl,
        altServerUrl: process.env.MELK_RELAY_ALT_URL ?? "",
        label: consumed.device.label,
        attempts: { used: consumed.device.attemptCount, max: consumed.device.maxAttempts },
        note: "این پاسخ فقط برای اپ رسمی ملکا است — راز دستگاه را فقط در همین گوشی نگه دارید.",
      },
      { status: 200, headers: { "cache-control": "no-store" } }
    );
  }

  const script = buildRelayScript({
    serverUrl,
    deviceId: consumed.device.deviceId,
    deviceSecret: consumed.device.secret,
    // PN-031-I (لایهٔ ۳): مسیر جایگزین واکِر — سوئیچ خودکار در گوشی پس از ۳ خطای پیاپی
    altServerUrl: process.env.MELK_RELAY_ALT_URL ?? "",
  });

  // سرآیند اطلاع‌رسانی بخشندگی — مالک در Termux می‌بیند چند تلاش باقی است
  const attemptNote = `# تلاش ${consumed.device.attemptCount} از ${consumed.device.maxAttempts} — این کد تا ${consumed.device.maxAttempts} بار قابل استفاده است (سوختن فقط پس از اتصال موفق گوشی)\n`;

  return new Response(script.replace(/^#!\/usr\/bin\/env bash\n/, `#!/usr/bin/env bash\n${attemptNote}`), {
    status: 200,
    headers: {
      "content-type": "text/x-shellscript; charset=utf-8",
      "cache-control": "no-store",
      "content-disposition": 'attachment; filename="melka-relay.sh"',
      "x-melka-attempts-used": String(consumed.device.attemptCount),
      "x-melka-attempts-max": String(consumed.device.maxAttempts),
    },
  });
}
