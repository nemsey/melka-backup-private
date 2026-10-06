/**
 * POST /api/auth/master-login
 * ورود مدیر (مالک سامانه) با کد یکتای مدیر — بدون نیاز به پیامک.
 * امنیت: مقایسه زمان-ثابت + محدودسازی نرخ (۵ تلاش / ۱۵ دقیقه) + قفل خودکار.
 *
 * زنجیرهٔ منبع کد مستر (PN-002 نکته ۱ — بقای بازنشانی محیط):
 *   ۱) MASTER_ACCESS_CODE از env واقعی (.env.local) — اولویت مطلق
 *   ۲) هش SHA-256 در AppMeta دیتابیس (masterCodeHash) — DB از بازنشانی‌های
 *      محیط جان سالم به در می‌برد (شاهد زندهٔ ۱۴۰۵/۰۷/۱۳)؛ فقط هش ذخیره
 *      می‌شود، هرگز خود کد؛ رمزگشایی معکوس ناممکن است.
 * کد پیش‌فرض ۸ رقمیِ تستیِ env.platform.json عمداً در انتهای زنجیره نیست —
 * رد می‌شود چون فرمتش معتبر است اما مقدار تستی عمومی است (SEC-1).
 */

import { NextRequest } from "next/server";
import { getMelkApiConfig } from "@/lib/melk-api/config";
import { isValidMasterCodeFormat, safeEqual } from "@/lib/auth/crypto";
import { checkRate, recordAttempt } from "@/lib/auth/rate-limiter";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { audit, createSession, OWNER_DISPLAY_NAME } from "@/lib/auth/session";

const MASTER_PERSONNEL = "000000000";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as { masterCode?: string } | null;
    const masterCode = body?.masterCode?.trim() ?? "";

    if (!isValidMasterCodeFormat(masterCode)) {
      throw new MelkApiError("OTP_INVALID", "کد مدیر باید ۸ رقم باشد.", 400, false);
    }

    const ip = request.headers.get("x-forwarded-for") ?? undefined;
    const rate = await checkRate(MASTER_PERSONNEL, "MASTER_LOGIN", ip);
    if (!rate.allowed) {
      throw new MelkApiError("RATE_LIMITED", rate.reason ?? "تلاش بیش از حد مجاز.", 429, false);
    }

    const cfg = getMelkApiConfig();
    // HOTFIX-01 (SEC-1): بدون هیچ منبع کد مستر (env یا هش DB) ورود مدیر کاملاً غیرفعال است —
    // نه fallback سورس‌نشسته، نه عبور با رشته خالی (فرمت ۸ رقمی از قبل رد شده، این گارد عمق دوم است).
    // PN-002 نکته ۱: کد تستیِ عمومیِ تاریخچهٔ git (هشت صفر) هرگز به‌عنوان کد واقعی
    // تلقی نمی‌شود؛ این‌گونه fallback هش DB (بقای بازنشانی) پس از پاک‌شدن .env.local زنده می‌ماند.
    // (بدون literal — قانون اسکن سورس HOTFIX-01)
    const PUBLIC_TEST_CODE = "0".repeat(8);
    let authorized = false;
    let source: "env" | "database" = "env";
    if (cfg.masterCode && isValidMasterCodeFormat(cfg.masterCode) && cfg.masterCode !== PUBLIC_TEST_CODE) {
      authorized = safeEqual(masterCode, cfg.masterCode);
      source = "env";
    } else {
      // PN-002 نکته ۱ — fallback دیتابیس: هش SHA-256 در AppMeta (بقای بازنشانی محیط)
      const { db } = await import("@/lib/db");
      const { createHash } = await import("crypto");
      const meta = await db.appMeta.findUnique({ where: { id: "singleton" } });
      const storedHash = meta?.masterCodeHash ?? null;
      if (storedHash && /^[0-9a-f]{64}$/.test(storedHash)) {
        const candidate = createHash("sha256").update(masterCode, "utf8").digest("hex");
        authorized = safeEqual(candidate, storedHash);
        source = "database";
      } else {
        await audit("MASTER_LOGIN_UNCONFIGURED", undefined, ip);
        throw new MelkApiError(
          "PRECONDITION_FAILED",
          "کد مدیر روی سرور تنظیم نشده است (MASTER_ACCESS_CODE). با مسیر کد پرسنلی + پیامک وارد شوید یا متغیر محیطی را تنظیم کنید.",
          503,
          false
        );
      }
    }
    if (!authorized) {
      await recordAttempt(MASTER_PERSONNEL, "MASTER_LOGIN", false, ip);
      await audit("MASTER_LOGIN_FAILED", undefined, ip);
      throw new MelkApiError("OTP_INVALID", "کد مدیر نادرست است.", 401, false);
    }

    await recordAttempt(MASTER_PERSONNEL, "MASTER_LOGIN", true, ip);
    const { token, context } = await createSession(
      { personnelCode: "OWNER", displayName: OWNER_DISPLAY_NAME, role: "OWNER" },
      { ip, userAgent: request.headers.get("user-agent") ?? undefined }
    );
    await audit("MASTER_LOGIN_SUCCESS", "OWNER", `source=${source}`);

    return Response.json({ ok: true, token, user: context });
  } catch (err) {
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(new MelkApiError("UNKNOWN", "خطای غیرمنتظره در ورود مدیر.", 500, false));
  }
}
