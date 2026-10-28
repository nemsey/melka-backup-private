/** PN-008 اولاً — تضمین حالت ژورنال در هر بوت (اِیدمپوتنت، بی‌صدا، بی‌خطر)
 *  PN-041 (شورا-ن۰۶۷): مسیر زندهٔ رسمی پویا — قلعهٔ داده (upload/.data) اول،
 *  مسیر قدیمی db/ fallback.
 *  PN-041-R (شورا-ن۰۶۸): معکوس شد — مسیر زندهٔ رسمی «دیسک محلی db/custom.db»
 *  (WAL) + سنک ۵دقیقه‌ای به upload/.data (بکاپ چرخشی). URL ممکن است
 *  پارامتر اتصال داشته باشد (؟connection_limit=…&socket_timeout=…) — پوست‌کنده
 *  می‌شود.
 *
 *  درس زندهٔ ۰۹:۰۱ (شورا-ن۰۶۷): حالت WAL روی upload/ (fuse/ossfs) برای
 *  چند-فرایندی «می‌شکند» — mmap مشترکِ فایل -shm بین فرایندها روی FUSE
 *  هم‌تراز نمی‌ماند ⇒ VACUUM INTO از Worker با SQLITE_CORRUPT (کد ۱۱)
 *  می‌میرد و قاب‌های WAL آلوده با checkpoint در فایل اصلی می‌نشینند.
 *  راه‌حل استاندارد SQLite برای فایل‌سیستم‌های شبکه/FUSE: journal_mode=DELETE.
 *  درس زندهٔ ۱۱:۴۳ (شورا-ن۰۶۸ — PN-041-R): DELETE روی FUSE هم کافی نیست —
 *  fsync روی ossfs گاهی بی‌نهایت hang می‌کند (۵۱۲×P1008 + دو ژورنال داغ).
 *  ⇒ زنده روی دیسک محلی WAL · کپی‌های پایدار روی ossfs فقط از طریق
 *  VACUUM INTO زیرپروسه (نقطهٔ بلاک نکردن).
 */
import { Database } from "bun:sqlite";
import { existsSync, statfsSync } from "node:fs";
import { resolve } from "node:path";

const REPO = process.env.MELKA_REPO_DIR ?? "/home/z/my-project";
const local = resolve(REPO, "db/custom.db");
const fortress = resolve(REPO, "upload/.data/custom.db");
const legacyFallback = resolve(REPO, "db/custom.db");

function livePath(): string {
  const envUrl = process.env.DATABASE_URL ?? "";
  if (envUrl.startsWith("file:")) {
    // PN-041-R: پارامترهای اتصال (؟connection_limit=1&socket_timeout=30) را بپوشون
    const bare = envUrl.slice(5).split("?")[0];
    if (bare && !bare.includes("test")) return resolve(bare);
  }
  if (existsSync(local)) return local;
  if (existsSync(fortress)) return fortress;
  return local; // مقصد پیش‌فرض: دیسک محلی (شورا-ن۰۶۸)
}

/** مسیر روی FUSE/شبکه است؟ → DELETE لازم است (درس ۰۹:۰۱) */
function needsDeleteJournal(path: string): boolean {
  if (path.includes("/upload/")) return true;
  try {
    const st = statfsSync(path);
    // fuse نوع منفی/صفر گزارش می‌دهد — همان نشانهٔ تشخیص
    if (Number(st.bavail) <= 0) return true;
  } catch { /* نامعلوم — WAL (سلوک قبلی) */ }
  return false;
}

try {
  const live = livePath();
  if (!existsSync(live)) {
    // بوت اول/ریست: DB هنوز ساخته نشده — کاری نیست (سرور/Prisma می‌سازد)
  } else {
    const target = needsDeleteJournal(live) ? "DELETE" : "WAL";
    const db = new Database(live);
    db.run("PRAGMA busy_timeout=10000");
    for (let i = 0; i < 3; i++) {
      const m = (db.query("PRAGMA journal_mode=" + target).get() as { journal_mode: string } | null)?.journal_mode;
      if (m?.toLowerCase() === target.toLowerCase()) break;
    }
    db.close();
  }
} catch { /* بوت نباید به خاطر این گام بیفتد */ }
