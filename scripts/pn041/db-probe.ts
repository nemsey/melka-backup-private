/**
 * db-probe.ts — PN-041 ابزار داوری: وضعیت یک فایل SQLite (شاهددار)
 * ---------------------------------------------------------------------------
 * کاربرد: bun scripts/pn041/db-probe.ts <file.db> [--quiet]
 * خروجی (یک خط JSON): {exists, bytes, header, integrity, counts:{...}}
 * کد خروج: 0 = سالم (integrity ok) · 2 = موجود اما معیوب/ناخوانا · 3 = غایب
 */
import { Database } from "bun:sqlite";
import { statSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const file = resolve(process.argv[2] ?? "");
const quiet = process.argv.includes("--quiet");
const out: Record<string, unknown> = { file, exists: false, bytes: 0, header: "", integrity: "missing", counts: {} as Record<string, number> };

if (!existsSync(file)) {
  if (!quiet) console.log(JSON.stringify(out));
  process.exit(3);
}
out.exists = true;
const st = statSync(file);
out.bytes = st.size;

// سرآیند SQLite (پروب ارزان — بدون بازکردن کامل)
const f = Bun.file(file);
const head = await f.slice(0, 16).text();
out.header = head.slice(0, 15) === "SQLite format 3" ? "ok" : "bad";

if (out.header !== "ok" || st.size < 4096) {
  out.integrity = "bad-header";
  if (!quiet) console.log(JSON.stringify(out));
  process.exit(2);
}

try {
  const db = new Database(file, { readonly: true });
  try {
    // PN-041/درس ۰۹:۰۱: حالت DELETE (fuse) — نویسندهٔ هم‌زمان قفل می‌گیرد؛
    // خوانندهٔ بدون timeout به‌دروغ «locked» می‌شود. مهلت ۸s = سلوک Prisma.
    db.run("PRAGMA busy_timeout=8000");
    const ic = db.query("PRAGMA integrity_check").get() as { integrity_check: string } | null;
    out.integrity = ic?.integrity_check ?? "unknown";
    const counts = out.counts as Record<string, number>;
    for (const t of ["PropertyRecord", "RequestRecord", "TransactionRecord", "ExpertRecord", "GraphNode"]) {
      try { counts[t] = (db.query(`SELECT COUNT(*) c FROM ${t}`).get() as { c: number }).c; } catch { counts[t] = -1; }
    }
  } finally {
    db.close();
  }
} catch {
  out.integrity = "unreadable";
}
if (!quiet) console.log(JSON.stringify(out));
process.exit(out.integrity === "ok" ? 0 : 2);
