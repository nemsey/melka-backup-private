/**
 * /api/matching/search — GET (PN-014 — جست‌وجوی هوشمند ورودی تطبیق)
 * ---------------------------------------------------------------------------
 * الگوریتم: عین جست‌وجوی کاشی فایل‌یابی — نرمال‌سازی فارسی + تطبیق زیررشته‌ای.
 *   ?q=متن&direction=listing  → جست‌وجو در آگهی‌های منتشرشده (کد/عنوان/مالک/منطقه)
 *   ?q=متن&direction=request  → جست‌وجو در درخواست‌های زنده (کد/عنوان/مشتری/منطقه)
 * خروجی: تا ۸ سطر برتر برای انتخاب کاربر — مقدم بر اجرای تطبیق.
 * روت لاغر: Auth + Service + Response (منطق در src/core/matching/search.ts).
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { searchMatchInputs } from "@/core/matching/search";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);
  try {
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const direction = url.searchParams.get("direction") === "request" ? "request" : "listing";
    if (!q) {
      return Response.json({ ok: true, rows: [], direction, message: "عبارت جست‌وجو خالی است" });
    }
    // db تنبل (الگوی P2-03: روت هرگز import مستقیم @/lib/db ندارد)
    const { db } = (await import("@/lib/db")) as { db: import("@prisma/client").PrismaClient };
    const rows = await searchMatchInputs(db, q, direction);
    return Response.json({ ok: true, direction, rows });
  } catch (e) {
    return Response.json({ ok: false, message: (e as Error).message }, { status: 500 });
  }
}
