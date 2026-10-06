/** PN-008 اولاً — تضمین WAL در هر بوت (اِیدمپوتنت، بی‌صدا، بی‌خطر) */
import { Database } from "bun:sqlite";
try {
  const db = new Database("/home/z/my-project/db/custom.db");
  db.run("PRAGMA busy_timeout=6000");
  for (let i = 0; i < 3; i++) {
    const m = (db.query("PRAGMA journal_mode=WAL").get() as any)?.journal_mode;
    if (m === "wal") break;
  }
  db.close();
} catch { /* بوت نباید به خاطر این گام بیفتد */ }
