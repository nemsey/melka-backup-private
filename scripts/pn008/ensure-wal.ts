/** PN-008 اولاً — تضمین WAL در هر بوت (اِیدمپوتنت، بی‌صدا، بی‌خطر)
 *  PN-041 (شورا-ن۰۶۷): مسیر زندهٔ رسمی پویا — قلعهٔ داده (upload/.data) اول،
 *  مسیر قدیمی db/ fallback. همان منطق live-db-path.sh و prod-watchdog.
 */
import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
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

try {
  const db = new Database(livePath());
  db.run("PRAGMA busy_timeout=6000");
  for (let i = 0; i < 3; i++) {
    const m = (db.query("PRAGMA journal_mode=WAL").get() as { journal_mode: string } | null)?.journal_mode;
    if (m === "wal") break;
  }
  db.close();
} catch { /* بوت نباید به خاطر این گام بیفتد */ }
