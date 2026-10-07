/**
 * POST /api/crm/import/[entity] — بارگذاری (ایمپورت) کل فهرست از فایل اکسل (PN-003 گام ۴-۲)
 * ------------------------------------------------------
 * «قابلیت آپلود اطلاعات کل فهرست به صورت فایل اکسل» — دستور مالک ۱۴۰۵/۰۷/۱۴.
 *
 * موجودیت‌ها: listings | requests | transactions | experts
 * سقف: ۲۵٬۰۰۰ ردیف/فایل · ۲۰MB — معماری: exceljs سمت سرور (بدون بار JS موبایل).
 *
 * PN-012 · BLOCK 1 — روت لاغر: Auth + Validation + Service + Response.
 * منطق دامنه به ‎src/lib/services/crm-import.ts‎ منتقل شد (بند ۱.۲ دستور).
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { MAX_ROWS, readSheet, runImport, type ImportEntity } from "@/lib/services/crm-import";

const MAX_BYTES = 20 * 1024 * 1024;
void MAX_ROWS; // صادرشده از سرویس برای یکپارچگی قرارداد سقف ردیف

export async function POST(request: NextRequest, ctx: { params: Promise<{ entity: string }> }) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const { entity } = await ctx.params;
  const VALID = new Set<string>(["listings", "requests", "transactions", "experts"]);
  if (!VALID.has(entity)) {
    return errorResponse(new MelkApiError("NOT_FOUND", "موجودیت پشتیبانی‌نشده.", 404, false));
  }

  try {
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
      if (!(file instanceof File)) {
      return errorResponse(
        new MelkApiError("UNPROCESSABLE", "فایل اکسل ارسال نشد است — فیلد «file» در فرم لازم است.", 400, false)
      );
    }
    if (file.size > MAX_BYTES) {
      return errorResponse(new MelkApiError("UNPROCESSABLE", "حجم فایل بیش از ۲۰ مگابایت است.", 400, false));
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    // امضای ZIP (xlsx) — PK\x03\x04
    if (buffer.length < 4 || buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      return errorResponse(new MelkApiError("UNPROCESSABLE", "فایل معتبر xlsx نیست (امضای ZIP یافت نشد).", 400, false));
    }

    const sheet = await readSheet(buffer);
    const result = await runImport(entity as ImportEntity, sheet, file.name);

    return Response.json(result);
  } catch (err) {
    if (err instanceof MelkApiError) return errorResponse(err);
    return errorResponse(
      new MelkApiError("UNKNOWN", `خطا در پردازش فایل اکسل: ${(err as Error).message.slice(0, 160)}`, 500, false)
    );
  }
}
