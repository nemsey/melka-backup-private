/**
 * DIR-TODAY-DROP-001 · گام ۱ — کالبدشکافی شمارندهٔ «آگهی امروز / درخواست امروز»
 * پرسش: چرا پس از ریست سرور شمارنده از ۶۸ به ۳۴ افت کرد؟
 * بررسی: توزیع createdAt رکوردهای PropertyRecord و RequestRecord در ۴۸ ساعت گذشته.
 */
import Database from "better-sqlite3";

const DB_PATH = "/home/z/my-project/db/custom.db";
const db = new Database(DB_PATH, { readonly: true });

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r: any) => r.name);
console.log("TABLES:", tables.join(", "));

for (const t of tables) {
  const cols = db.prepare(`PRAGMA table_info(${t})`).all().map((c: any) => c.name);
  if (/propert|listing|request/i.test(t)) {
    const n = (db.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as any).n;
    console.log(`\n== ${t} (${n} rows) ==`);
    console.log("cols:", cols.join(","));
  }
}
db.close();
