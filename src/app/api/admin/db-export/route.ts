/**
 * GET /api/admin/db-export — برون‌بری اتمی دیتابیس زنده (PN-041 · فاز ۴)
 * ---------------------------------------------------------------------------
 * لایهٔ ۴ قلعهٔ داده: خوراکِ پشتیبان روزانهٔ GitHub Release.
 * Workflow ابری (db-backup.yml) هر روز این روت را با Bearer مالک صدا می‌زند،
 * فایل VACUUM-شده را می‌گیرد، سلامت/شمارش را وارسی و به Release آپلود می‌کند.
 *
 * احراز: نشست OWNER (قرارداد روت‌های مدیریتی) «یا» Bearer توکن مالک
 * (برای Workflow — مقایسهٔ زمان-ثابت · lib/melk-api/db-export.ts).
 *
 * خروجی: باینری SQLite + هدرهای شاهد:
 *   X-Db-Record-Count  — شمارش PropertyRecord (قانون دادهٔ مقدس در Workflow)
 *   X-Db-Integrity     — نتیجهٔ PRAGMA integrity_check
 *   X-Db-Exported-At   — ISO
 * روش: VACUUM INTO روی مسیر موقت سپس استریم و حذف — دیتابیس زنده هرگز
 * بازنویسی نمی‌شود (قانون ۶ · شورا-ن۰۶۳). روت سبک: منطق در lib/db-export.
 */

import { NextRequest } from "next/server";
import { MelkApiError } from "@/lib/melk-api/types";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { audit } from "@/lib/auth/session";
import { verifyOwnerBearerToken, bearerTokenShape, exportAtomicDb } from "@/lib/melk-api/db-export";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  // ── احراز ۱: نشست OWNER ──
  const guard = await requireRole(request, "OWNER", "/api/admin/db-export");
  const isOwnerSession = !(guard instanceof MelkApiError);

  // ── احراز ۲: Bearer مالک (Workflow) ──
  const isBearerOwner = verifyOwnerBearerToken(
    request.headers.get("authorization"),
    process.env.MASTER_ACCESS_CODE
  );

  if (!isOwnerSession && !isBearerOwner) {
    if (guard instanceof MelkApiError) {
      // شاهدِ ردِ تمایزنیافته (بدون افشای راز) — بهترین-تلاش
      await audit(
        "ACCESS_DENIED",
        "anonymous",
        `route=/api/admin/db-export; auth=${bearerTokenShape(request.headers.get("authorization"))}`
      ).catch(() => undefined);
      return errorResponse(guard);
    }
  }

  // ── برون‌بری اتمی: منطق در lib (روت سبک) ──
  const { mkdtempSync, rmSync, statSync, unlinkSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const tmpDir = mkdtempSync(join(tmpdir(), "pn041-db-export-"));
  const tmpFile = join(tmpDir, "custom.db");

  try {
    const { integrity, recordCount } = await exportAtomicDb(tmpFile);

    if (integrity !== "ok") {
      unlinkSync(tmpFile);
      return Response.json(
        { ok: false, error: "integrity-check-failed", integrity },
        { status: 503 }
      );
    }

    const bytes = statSync(tmpFile).size;
    const exportedAt = new Date().toISOString();

    // شاهد حسابرسی (نام فایل/اندازه/شمارش — هرگز محتوا)
    await audit(
      "DB_EXPORT",
      isBearerOwner && !isOwnerSession ? "owner:workflow-bearer" : "owner:session",
      `برون‌بری اتمی دیتابیس (VACUUM) — ${bytes} بایت · ${recordCount} آگهی · integrity ok`
    ).catch(() => undefined);

    // استریم با پاک‌سازی پس از ارسال (finally بیرونی)
    const buf = await import("node:fs").then((fs) => fs.promises.readFile(tmpFile));
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": 'attachment; filename="custom.db"',
        "X-Db-Record-Count": String(recordCount),
        "X-Db-Integrity": integrity,
        "X-Db-Bytes": String(bytes),
        "X-Db-Exported-At": exportedAt,
      },
    });
  } catch (e) {
    return Response.json(
      { ok: false, error: "db-export-failed", detail: e instanceof Error ? e.message.slice(0, 200) : "unknown" },
      { status: 500 }
    );
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
