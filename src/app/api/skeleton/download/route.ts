/**
 * /api/skeleton/download — بستهٔ انتقال ملکا (P6551 / جلسهٔ فوق‌العادهٔ ۰۳۹ — BLOCK 2.1)
 * ------------------------------------------------------
 * GET بدون file       → فرادادهٔ بسته (فهرست فایل‌ها + حجم + md5 + تاریخ ساخت)
 * GET ?file=manifest  → MANIFEST.md
 * GET ?file=skeleton  → MELKA-SKELETON-COMPLETE-v1.0.md
 * GET ?file=source    → melka-source-v1.0-20261004.tar.gz
 * GET ?file=letter    → REBUILD-LETTER.md
 *
 * امنیت:
 *   - فقط OWNER (HOTFIX-03/SEC-6 — همانند روت‌های اتصال حساس)
 *   - فهرست سفید مطلق — هیچ مسیری از کاربر پذیرفته نمی‌شود (ضد path-traversal)
 *   - هر دانلود در AuditLog ثبت می‌شود (قابلیت راستی‌آزمایی بازرسانه)
 *
 * محتوا: سه‌گانهٔ P6550 (صفر داده · صفر توکن · صفر رمز — اسکن سه‌مرحله‌ای سبز)
 * از upload/skeleton/ خوانده می‌شود (ذخیره‌ساز پایدار — خارج از git طبق قانون ۰۳۵-A).
 */

import { NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { errorResponse, requireRole } from "@/lib/auth/guard";
import { audit } from "@/lib/auth/session";
import { MelkApiError } from "@/lib/melk-api/types";

const ROUTE = "GET /api/skeleton/download";

/** فهرست سفید — تنها چهار کلید مجاز (عین دستور ۰۳۹/BLOCK 2.1) */
const FILES = {
  manifest: {
    file: "MANIFEST.md",
    title: "مانیفست بسته",
    desc: "نام، حجم و md5 هر سه فایل + راهنمای راستی‌آزمایی",
  },
  skeleton: {
    file: "MELKA-SKELETON-COMPLETE-v1.0.md",
    title: "سند اسکلت کامل",
    desc: "نقشهٔ معماری ۲۵ فصلی ملکا — ۸٬۷۳۰ خط",
  },
  source: {
    file: "melka-source-v1.0-20261004.tar.gz",
    title: "سورس کامل بدون داده",
    desc: "۸۲۷ فایل — راستی‌آزمایی قرنطینهٔ بیلد سبز",
  },
  letter: {
    file: "REBUILD-LETTER.md",
    title: "نامهٔ بازسازی",
    desc: "دستورالعمل ۵ گام + ۷ قید مطلق برای تسک تازه",
  },
} as const;

type FileKey = keyof typeof FILES;

const SKELETON_DIR = path.join(process.cwd(), "upload", "skeleton");

/** md5 محتوای فایل — برای شاهد فراداده */
async function md5Of(absPath: string): Promise<string> {
  const buf = await readFile(absPath);
  return createHash("md5").update(buf).digest("hex");
}

export async function GET(request: NextRequest) {
  // بستهٔ انتقال — فقط مالک سامانه
  const guard = await requireRole(request, "OWNER", ROUTE);
  if (guard instanceof MelkApiError) return errorResponse(guard);
  const ctx = guard.ctx;

  const key = request.nextUrl.searchParams.get("file");

  // ─── فرادادهٔ بسته (بدون پارامتر file) ───
  if (!key) {
    const files = await Promise.all(
      (Object.keys(FILES) as FileKey[]).map(async (k) => {
        const abs = path.join(SKELETON_DIR, FILES[k].file);
        const st = await stat(abs);
        return {
          key: k,
          filename: FILES[k].file,
          title: FILES[k].title,
          desc: FILES[k].desc,
          size: st.size,
          md5: await md5Of(abs),
          builtAt: st.mtime.toISOString(),
        };
      })
    );
    return Response.json({
      ok: true,
      package: {
        title: "بستهٔ انتقال ملکا",
        ref: "P6550 (ساخت — جلسهٔ ۰۳۷) + P6551 (تحویل — جلسهٔ ۰۳۹)",
        policy: "صفر داده · صفر توکن · صفر رمز",
      },
      files,
    });
  }

  // ─── دانلود فایل (فهرست سفید — غیرمجاز = 400) ───
  if (!(key in FILES)) {
    return errorResponse(
      new MelkApiError("UNKNOWN", "کلید فایل نامعتبر است. مجاز: manifest | skeleton | source | letter", 400, false)
    );
  }
  const entry = FILES[key as FileKey];
  const abs = path.join(SKELETON_DIR, entry.file);
  const st = await stat(abs);
  const buf = await readFile(abs);

  await audit("SKELETON_DOWNLOAD", ctx.personnelCode, `file=${key}; bytes=${st.size}`).catch(() => undefined);

  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${entry.file}"`,
      "Content-Length": String(st.size),
      "X-Checksum-Md5": createHash("md5").update(buf).digest("hex"),
      "Cache-Control": "no-store",
    },
  });
}
