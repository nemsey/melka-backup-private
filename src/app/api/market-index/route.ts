/**
 * /api/market-index — GET (P6545/گام۲ BLOCK 2.2)
 * شاخص بازار ملک تبریز (روند ماهانه، منطقه، نوع ملک، معامله/آگهی، حجم).
 *
 * PN-012 · BLOCK 1 — روت لاغر: Auth + Service + Response.
 * منطق دامنه به ‎src/lib/services/market-index.ts‎ منتقل شد (بند ۱.۲ دستور).
 */
import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireSessionAsync } from "@/lib/auth/guard";
import { getMarketIndex } from "@/lib/services/market-index";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await requireSessionAsync(request);
  if (guard instanceof MelkApiError) return errorResponse(guard);

  try {
    const report = await getMarketIndex();
    return Response.json(report);
  } catch (e) {
    return Response.json({ ok: false, message: (e as Error).message }, { status: 500 });
  }
}
