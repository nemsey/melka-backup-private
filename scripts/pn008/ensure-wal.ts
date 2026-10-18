/** PN-008 اولاً — تضمین حالت ژورنال در هر بوت (اِیدمپوتنت، بی‌صدا، بی‌خطر)
 *  PN-041 (شورا-ن۰۶۷): مسیر زندهٔ رسمی پویا — قلعهٔ داده (upload/.data) اول،
 *  مسیر قدیمی db/ fallback.
 *
 *  درس زندهٔ ۰۹:۰۱ (شورا-ن۰۶۷): حالت WAL روی upload/ (fuse/ossfs) برای
 *  چند-فرایندی «می‌شکند» — mmap مشترکِ فایل -shm بین فرایندها روی FUSE
 *  هم‌تراز نمی‌ماند ⇒ VACUUM INTO از Worker با SQLITE_CORRUPT (کد ۱۱)
 *  می‌میرد و قاب‌های WAL آلوده با checkpoint در فایل اصلی می‌نشینند.
 *  راه‌حل استاندارد SQLite برای فایل‌سیستم‌های شبکه/FUSE: journal_mode=DELETE.
 *  قاعدهٔ تازه: مسیر زیر upload/ → DELETE · مسیرهای دیسک محلی (overlayfs) → WAL.
 *  (شاهد کامل: download/pn041/db-migration.json · رخداد واقعی بازیابی ۰۹:۰۳)
 */
import { Database } from "bun:sqlite";
import { existsSync, statfsSync } from "node:fs";
import { resolve } from "node:path";

const REPO = process.env.MELKA_REPO_DIR ?? "/home/z/my-project";
const fortress = resolve(REPO, "upload/.data/custom.db");
const legacy = resolve(REPO, "db/custom.db");

function livePath(): string {
  const envUrl = process.env.DATABASE_URL ?? "";
  if (envUrl.startsWith("file:") && !envUrl.includes("test")) {
    return resolve(envUrl.slice(5));
  }
  if (existsSync(fortress)) return fortress;
  if (existsSync(legacy)) return legacy;
  return fortress;
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
