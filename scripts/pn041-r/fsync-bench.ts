/**
 * PN-041-R فاز ۴ — بنچمارک fsync روی FUSE
 * آیا ژورنال DELETE با synchronous=FULL روی ossfs hang می‌کند؟
 * و آیا synchronous=OFF مشکل را حل می‌کند؟
 */
import { Database } from "bun:sqlite";
import { unlinkSync, existsSync } from "node:fs";

const FUSE_DB = "/home/z/my-project/upload/.runtime/fsync-test.db";
const LOCAL_DB = "/home/z/my-project/.runtime-fsync-test.db";

function bench(path: string, mode: string, sync: string, n = 8) {
  if (existsSync(path)) unlinkSync(path);
  if (existsSync(`${path}-journal`)) unlinkSync(`${path}-journal`);
  if (existsSync(`${path}-wal`)) unlinkSync(`${path}-wal`);
  const db = new Database(path);
  db.run("PRAGMA busy_timeout=15000");
  db.run(`PRAGMA journal_mode=${mode}`);
  db.run(`PRAGMA synchronous=${sync}`);
  db.run("PRAGMA busy_timeout=15000");
  db.run("CREATE TABLE t(id INTEGER PRIMARY KEY, v TEXT)");
  const times: number[] = [];
  let hung = false;
  for (let i = 0; i < n; i++) {
    const t0 = Date.now();
    try {
      db.run("INSERT INTO t(v) VALUES (?)", [`x${i}`]);
      times.push(Date.now() - t0);
    } catch (e) {
      times.push(-1);
    }
    if (Date.now() - t0 > 8000) {
      hung = true;
      break;
    }
  }
  const ok = times.every((t) => t >= 0 && t < 8000);
  db.close();
  return {
    path: path.includes("/upload/") ? "fuse(ossfs)" : "local-disk",
    journal: mode,
    synchronous: sync,
    timesMs: times,
    avgMs: times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
    maxMs: times.length ? Math.max(...times) : null,
    hung,
  };
}

const results = [
  bench(FUSE_DB, "DELETE", "FULL"),
  bench(FUSE_DB, "DELETE", "NORMAL"),
  bench(FUSE_DB, "DELETE", "OFF"),
  bench(LOCAL_DB, "WAL", "NORMAL"),
];

for (const r of results) {
  console.log(
    `${r.path.padEnd(12)} journal=${r.journal.padEnd(6)} sync=${r.synchronous.padEnd(6)} avg=${String(r.avgMs).padStart(5)}ms max=${String(r.maxMs).padStart(5)}ms hung=${r.hung} times=[${r.timesMs.join(",")}]`
  );
}

// پاک‌سازی فایل‌های تست
for (const p of [FUSE_DB, LOCAL_DB]) {
  for (const suf of ["", "-journal", "-wal", "-shm"]) {
    try {
      if (existsSync(p + suf)) unlinkSync(p + suf);
    } catch {}
  }
}

await Bun.write(
  "/home/z/my-project/download/pn041-r/fsync-benchmark.json",
  JSON.stringify({ ts: new Date().toISOString(), results }, null, 2)
);
console.log("\n→ شاهد: download/pn041-r/fsync-benchmark.json");
