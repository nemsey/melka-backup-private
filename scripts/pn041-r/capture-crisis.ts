/**
 * PN-041-R فاز ۱ — شاهد بحران قفل دیتابیس (۱۱:۴۳)
 * ثبت وضعیت زندهٔ ژورنال گیرکرده + یکپارچگی آخرین بکاپ چرخشی
 */
import { Database } from "bun:sqlite";
import { statSync, existsSync, readdirSync } from "node:fs";

const REPO = "/home/z/my-project";
const live = `${REPO}/upload/.data/custom.db`;
const rollingDir = `${REPO}/upload/.data/rolling`;
const sacredDir = `${REPO}/upload/.data/sacred`;

const witness: Record<string, unknown> = {
  ts: new Date().toISOString(),
  crisis: "hot-journal-stuck-on-fuse",
  symptom: "Prisma P1008 socket-timeout on all queries since ~10:45; rolling/sacred backups frozen since 09:44",
  liveDb: {
    mtime: statSync(live).mtime.toISOString(),
    size: statSync(live).size,
    journalExists: existsSync(`${live}-journal`),
    journalSize: existsSync(`${live}-journal`) ? statSync(`${live}-journal`).size : 0,
    journalMtime: existsSync(`${live}-journal`) ? statSync(`${live}-journal`).mtime.toISOString() : null,
  },
  p1008CountInServerLog: 511,
};

// یکپارچگی آخرین بکاپ چرخشی (فقط-خواندنی — DB زنده قفل است)
const rollings = readdirSync(rollingDir).filter((f) => f.endsWith(".db")).sort();
const newest = rollings[rollings.length - 1];
if (newest) {
  const p = `${rollingDir}/${newest}`;
  const db = new Database(p, { readonly: true });
  db.run("PRAGMA busy_timeout=8000");
  const integrity = db.query("PRAGMA integrity_check").get() as Record<string, string>;
  const counts: Record<string, number> = {};
  for (const t of ["Session", "RelayDevice", "RelayJob", "AuditLog", "PropertyRecord", "RequestRecord"]) {
    try {
      counts[t] = (db.query(`SELECT COUNT(*) c FROM ${t}`).get() as { c: number }).c;
    } catch {
      counts[t] = -1;
    }
  }
  db.close();
  witness.rollingLastGood = {
    file: newest,
    size: statSync(p).size,
    integrity: integrity?.integrity_check,
    counts,
  };
}

const sacreds = readdirSync(sacredDir).filter((f) => f.endsWith(".db")).sort();
if (sacreds.length) {
  witness.sacredCount = sacreds.length;
  witness.sacredNewest = sacreds[sacreds.length - 1];
}

await Bun.write(`${REPO}/download/pn041-r/db-stuck-crisis.json`, JSON.stringify(witness, null, 2));
console.log(JSON.stringify(witness, null, 2));
