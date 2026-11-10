/**
 * vacuum-copy.ts — PN-041 ابزار عمومی: checkpoint + VACUUM INTO + شاهد کامل
 * ---------------------------------------------------------------------------
 * کاربرد: bun scripts/pn041/vacuum-copy.ts <source.db> <target.db> [--json <out>]
 * خروجی: exit 0 موفق — JSON شاهد {bytes, md5, integrity, counts, mtime}
 * قانون: VACUUM INTO اتمی است (خواننده‌ها حالت نصفه نمی‌بینند · همان بکاپ مقدس)
 *
 * PN-078 (سبک‌سازی · آزادسازی رم):
 *   ۱) md5 استریمی شد — قبلاً کل فایل با arrayBuffer در heap بار می‌شد
 *      (۵۳۶MB گذرا هر ۵ دقیقه!)؛ اکنون تکه‌های ۴MB — heap ~۴MB.
 *   ۲) پس از شاهد، page-cache فایل بکاپ تازه با POSIX_FADV_DONTNEED رها
 *      می‌شود (فایل سرد است؛ داده fsync روی دیسک است — صفر تغییر معنایی).
 *      فقط در همین زیرپروسهٔ bun (FFI) — هرگز در src/ (زنجیرهٔ باندل Next).
 */
import { Database } from "bun:sqlite";
import { statSync, existsSync, mkdirSync, writeFileSync, createReadStream, openSync, closeSync, fsyncSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** POSIX_FADV_DONTNEED — رها کردن صفحات cache تمیز فایل */
const POSIX_FADV_DONTNEED = 4;
const LIBC_CANDIDATES = ["/lib/x86_64-linux-gnu/libc.so.6", "/usr/lib/x86_64-linux-gnu/libc.so.6", "libc.so.6"];

/** بهترین-تلاش: fsync + fadvise(DONTNEED) — شکست بی‌صدا نادیده (بکاپ هرگز نمی‌شکند) */
function dropFileCache(path: string): void {
  let fd = -1;
  try {
    const { dlopen } = require("bun:ffi") as { dlopen: (p: string, s: unknown) => { symbols: Record<string, unknown> } };
    let fn: ((fd: number, off: number, len: number, advice: number) => number) | null = null;
    for (const p of LIBC_CANDIDATES) {
      try {
        const libc = dlopen(p, { posix_fadvise: { args: ["i32", "i64", "i64", "i32"], returns: "i32" } });
        const f = libc.symbols.posix_fadvise as unknown;
        if (typeof f === "function") { fn = f as typeof fn; break; }
      } catch { /* مسیر بعدی */ }
    }
    if (!fn) return;
    fd = openSync(path, "r");
    fsyncSync(fd);                                   // صفحات تمیز شوند
    fn(fd, 0, 0, POSIX_FADV_DONTNEED);              // len=0 → تا انتهای فایل
  } catch {
    /* بهترین-تلاش — رم آزاد نشدن به معنای شکست بکاپ نیست */
  } finally {
    if (fd >= 0) { try { closeSync(fd); } catch { /* best effort */ } }
  }
}

const args = process.argv.slice(2);
const src = resolve(args[0] ?? "");
const dst = resolve(args[1] ?? "");
const jsonIdx = args.indexOf("--json");
const jsonOut = jsonIdx >= 0 ? resolve(args[jsonIdx + 1]) : null;

if (!src || !dst) {
  console.error("کاربرد: vacuum-copy.ts <source.db> <target.db> [--json <out>]");
  process.exit(1);
}
if (!existsSync(src)) {
  console.error(`منبع موجود نیست: ${src}`);
  process.exit(1);
}

// checkpoint منبع (WAL را به فایل اصلی بچکان — تصویر کامل‌تر)
// درس ۰۹:۰۱: مهلت قفل برای خواندن هم‌زمان (حالت DELETE روی fuse)
try {
  const s = new Database(src, { readonly: false });
  s.run("PRAGMA busy_timeout=10000");
  s.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  s.close();
} catch {
  /* منبع شاید readonly باشد — VACUUM INTO خودش تصویر سازگار می‌گیرد */
}

mkdirSync(dirname(dst), { recursive: true });
if (existsSync(dst)) {
  console.error(`هدف از قبل موجود است — رد شد (صفر بازنویسی): ${dst}`);
  process.exit(3);
}

const t0 = Date.now();
const con = new Database(src, { readonly: true });
con.run("PRAGMA busy_timeout=10000");
con.exec(`VACUUM INTO '${dst.replace(/'/g, "''")}'`);
con.close();

// شاهد: md5 + integrity + شمارش جدول‌های شاهد
// PN-078: md5 استریمی (تکه‌های ۴MB) — heap ثابت ~۴MB به‌جای ۵۳۶MB گذرا
const md5 = new Bun.CryptoHasher("md5");
await new Promise<void>((resolveP, rejectP) => {
  const rs = createReadStream(dst, { highWaterMark: 4 * 1024 * 1024 });
  rs.on("data", (c: Buffer) => md5.update(c));
  rs.on("error", rejectP);
  rs.on("end", () => resolveP());
});
const md5hex = md5.digest("hex");

const probe = new Database(dst, { readonly: true });
probe.run("PRAGMA busy_timeout=8000");
const integrity = (probe.query("PRAGMA integrity_check").get() as { integrity_check: string } | null)?.integrity_check ?? "unknown";
const counts: Record<string, number> = {};
for (const t of ["PropertyRecord", "RequestRecord", "TransactionRecord", "ExpertRecord", "GraphNode"]) {
  try { counts[t] = (probe.query(`SELECT COUNT(*) c FROM ${t}`).get() as { c: number }).c; } catch { counts[t] = -1; }
}
probe.close();

const st = statSync(dst);
const witness = {
  at: new Date().toISOString(),
  tool: "vacuum-copy (PN-041)",
  source: src, target: dst,
  bytes: st.size, md5: md5hex, integrity,
  counts, durationMs: Date.now() - t0,
};
if (jsonOut) { mkdirSync(dirname(jsonOut), { recursive: true }); writeFileSync(jsonOut, JSON.stringify(witness, null, 2)); }
console.log(JSON.stringify(witness, null, 2));

// PN-078 · آزادسازی رم: بکاپ تازه فایل سردی است — cache اش رها شود
// (زنده سرو می‌شود از دیسک؛ خوانندهٔ بعدی (رستاخیز/گارد) از دیسک می‌خواند)
dropFileCache(dst);

process.exit(integrity === "ok" ? 0 : 2);
