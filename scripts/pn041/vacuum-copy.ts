/**
 * vacuum-copy.ts — PN-041 ابزار عمومی: checkpoint + VACUUM INTO + شاهد کامل
 * ---------------------------------------------------------------------------
 * کاربرد: bun scripts/pn041/vacuum-copy.ts <source.db> <target.db> [--json <out>]
 * خروجی: exit 0 موفق — JSON شاهد {bytes, md5, integrity, counts, mtime}
 * قانون: VACUUM INTO اتمی است (خواننده‌ها حالت نصفه نمی‌بینند · همان بکاپ مقدس)
 */
import { Database } from "bun:sqlite";
import { statSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

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
try {
  const s = new Database(src, { readonly: false });
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
con.exec(`VACUUM INTO '${dst.replace(/'/g, "''")}'`);
con.close();

// شاهد: md5 + integrity + شمارش جدول‌های شاهد
const md5 = new Bun.CryptoHasher("md5");
await Bun.file(dst).arrayBuffer().then((buf) => md5.update(buf));
const md5hex = md5.digest("hex");

const probe = new Database(dst, { readonly: true });
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
process.exit(integrity === "ok" ? 0 : 2);
