import { createReadStream, existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { isAbsolute, join, normalize, sep } from "node:path";
import { Readable } from "node:stream";

/**
 * مسیر سرو تحویل‌ها — قانون فایل نسخهٔ ۳ (PN-012) + لاغرسازی بستهٔ استقرار (PN-014/D2)
 * ---------------------------------------------------------------------------
 * چرا این مسیر وجود دارد؟
 *
 * «public/deliver» روزی فایل‌های تحویل را به‌صورت ایستا سرو می‌کرد؛ اما خط لولهٔ
 * انتشار پلتفرم، پوشهٔ public را کامل داخل بستهٔ استقرار کپی می‌کند (و پیش‌تر
 * file-tracing هم نسخه‌ای از آن را داخل standalone می‌گذاشت). با رشد تحویل‌های
 * قانون فایل v3 (ALL.zip + قطعات بقا ~۶۰۰MB) بسته از سقف آپلود خط لوله عبور کرد
 * و دامنهٔ publish صفحهٔ «Failed» داد (کالبدشکافی مستند P6528 — همان ریشه،
 * فهرست‌های تازه‌ای که این بار متورم شده بودند).
 *
 * راه‌حل PN-014/D2:
 *   ۱) فایل‌های تحویل به «deliver-store/» در ریشهٔ پروژه منتقل شدند (gitignored)
 *   ۲) این مسیر، همان URLهای همیشگی را سرو می‌کند: /deliver/… — دامنهٔ preview
 *      برای مالک همان تجربهٔ قبلی را دارد (آزمون ۲۰۰ قانون فایل v3).
 *   ۳) بستهٔ استقرار دیگر ~۶۰۰MB تحویل با خود نمی‌کشد — در کانتینر منتشرشده
 *      این مسیر 404 تمیز می‌دهد (پیوند تحویل پدیدهٔ دامنهٔ preview است، نه publish).
 *
 * امنیت: پیمایش مسیر ممنوع («..» و مطلق رد می‌شوند)، فقط فایل‌های داخل مخزن
 * سرو می‌شوند، متادیتای نوع محتوا صریح است و کش ذخیره نمی‌شود (تحویل‌ها
 * بازنویسی‌شدنی‌اند).
 */

/** ریشه‌های کاندید مخزن تحویل — به‌ترتیب اولویت */
function deliverStoreCandidates(): string[] {
  const out: string[] = [];
  // لنگر رسمی ریشهٔ مخزن (قرارداد watchdog/instrumentation — PN-005/PN-011)
  if (process.env.MELKA_REPO_DIR) out.push(process.env.MELKA_REPO_DIR);
  out.push("/home/z/my-project"); // مسیرپذیرفتنی کانتینر پیش‌نمایش
  if (process.cwd()) out.push(process.cwd());
  return out.map((root) => join(root, "deliver-store"));
}

function resolveStore(): string | null {
  for (const dir of deliverStoreCandidates()) {
    if (existsSync(dir)) return dir;
  }
  return null;
}

const MIME_BY_EXT: Record<string, string> = {
  ".zip": "application/zip",
  ".bin": "application/octet-stream",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".log": "text/plain; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".sha256": "text/plain; charset=utf-8",
};

/** آیا مسیر نسبی امن است؟ (بدون پیمایش به بالای مخزن) */
function isSafeRelative(rel: string): boolean {
  if (!rel) return false;
  if (isAbsolute(rel)) return false;
  const n = normalize(rel);
  if (n === ".." || n.startsWith(`..${sep}`)) return false;
  if (n.includes("\0")) return false;
  return true;
}

function notFound(message: string): Response {
  return new Response(
    JSON.stringify({ ok: false, code: "DELIVER_NOT_FOUND", message }),
    { status: 404, headers: { "Content-Type": "application/json; charset=utf-8" } },
  );
}

async function serveFile(filePath: string, size: number, headOnly: boolean): Promise<Response> {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  const headers = new Headers({
    "Content-Type": MIME_BY_EXT[ext] ?? "application/octet-stream",
    "Content-Length": String(size),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": `attachment; filename="${encodeURIComponent(filePath.slice(filePath.lastIndexOf(sep) + 1))}"`,
  });
  if (headOnly) return new Response(null, { status: 200, headers });

  // فایل‌های کوچک (متادیتا/گزارش/اسکرین‌شات) یک‌جا؛ فایل‌های بزرگ (قطعات بقا ~۴۸MB) جریانی
  if (size <= 8 * 1024 * 1024) {
    const buf = await readFile(filePath);
    return new Response(new Uint8Array(buf), { status: 200, headers });
  }
  const webStream = Readable.toWeb(createReadStream(filePath)) as unknown as ReadableStream;
  return new Response(webStream, { status: 200, headers });
}

async function handle(req: Request, segments: string[]): Promise<Response> {
  const store = resolveStore();
  if (!store) {
    return notFound("مخزن تحویل در این محیط موجود نیست (قانون فایل v3 از دامنهٔ preview سرو می‌شود).");
  }
  const rel = segments.join(sep);
  if (!isSafeRelative(rel)) {
    return notFound("مسیر درخواستی معتبر نیست.");
  }
  const filePath = join(store, rel);
  // محافظ دوم: مسیر نهایی باید داخل مخزن بماند (حتی با پیوندهای ناخواسته)
  const normalizedFull = normalize(filePath);
  if (!normalizedFull.startsWith(normalize(store) + sep)) {
    return notFound("مسیر درخواستی معتبر نیست.");
  }
  let st;
  try {
    st = statSync(normalizedFull);
  } catch {
    return notFound("فایل درخواستی یافت نشد.");
  }
  if (!st.isFile()) {
    return notFound("این مسیر یک فایل نیست.");
  }
  return serveFile(normalizedFull, st.size, req.method === "HEAD");
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path: segments } = await ctx.params;
  return handle(_req, segments ?? []);
}

export async function HEAD(
  _req: Request,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path: segments } = await ctx.params;
  return handle(_req, segments ?? []);
}
