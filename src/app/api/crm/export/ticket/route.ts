/**
 * POST /api/crm/export/ticket — بلیت دانلود اکسل (DIR-EXCEL-FIX-001)
 * ------------------------------------------------------
 * کلاینت با نشست معتبر (Bearer) بلیت امضاشدهٔ ۱۸۰ثانیه‌ای می‌گیرد و سپس
 * مرورگر «بومی» به /api/crm/export/{entity}?ticket=… دانلود می‌کند —
 * درمان شکست بی‌صدای Blob در WebViewهای موبایل (شاهد صفر-درخواستِ
 * export از مرورگر مالک در لاگ سرور ۲۰۲۶-۱۱-۱۴ ۱۹:۲۰Z).
 *
 * دامنهٔ دادهٔ بلیت = عین دامنهٔ نشست سازنده (قانون حساب کاربری PN-049):
 * مالک ⇒ همه؛ کاربر ⇒ فقط رکوردهای ثبت‌شده توسط خودش.
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import {
  EXPORT_ENTITIES,
  EXPORT_TICKET_TTL_MS,
  signExportTicket,
  type ExportEntity,
} from "@/lib/export-ticket";

export async function POST(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  const body = (await request.json().catch(() => null)) as
    | { entity?: unknown; params?: unknown }
    | null;
  const entity = String(body?.entity ?? "");
  if (!(EXPORT_ENTITIES as readonly string[]).includes(entity)) {
    return errorResponse(
      new MelkApiError("NOT_FOUND", "موجودیت پشتیبانی‌نشده.", 404, false)
    );
  }

  // فیلترهای فعال فهرست — همان پارامترهای GET روت export؛ فقط رشته‌های
  // کوتاه پذیرفته می‌شوند (سقف طول در بلیت).
  const q = new URLSearchParams();
  if (body?.params && typeof body.params === "object" && !Array.isArray(body.params)) {
    for (const [k, v] of Object.entries(body.params as Record<string, unknown>)) {
      if (typeof k === "string" && k.length <= 40 && typeof v === "string" && v && v.length <= 120) {
        q.set(k, v);
      }
    }
  }

  const now = Date.now();
  const ticket = signExportTicket({
    e: entity as ExportEntity,
    q: q.toString().slice(0, 400),
    r: guard.role ?? "",
    s: guard.accessScope ?? "",
    n: guard.displayName ?? "",
    x: now + EXPORT_TICKET_TTL_MS,
  });

  const qs = q.toString();
  const url = `/api/crm/export/${entity}${qs ? `?${qs}&` : "?"}ticket=${encodeURIComponent(ticket)}`;
  return Response.json({
    ok: true,
    ticket,
    url,
    expiresAt: new Date(now + EXPORT_TICKET_TTL_MS).toISOString(),
  });
}
