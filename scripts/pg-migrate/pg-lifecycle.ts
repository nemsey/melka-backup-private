/**
 * pg-lifecycle.ts — PN-022-A/مرحلهٔ۳: چرخهٔ عمر پایگاه PostgreSQL تست (embedded)
 * ---------------------------------------------------------------------------
 * init | start | stop — خوشهٔ محلی بدون root (باینری‌های @embedded-postgres).
 * پورت 5433 (تداخل با هیچ سرویس) · داده در db/postgres-test/ (git-ignored).
 */
import { mkdirSync, existsSync, rmSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { spawn, execSync } from "node:child_process";

const ROOT = process.cwd();
const NATIVE = join(ROOT, "node_modules/@embedded-postgres/linux-x64/native");
const DATA_DIR = join(ROOT, "db/postgres-test");
const PORT = 5433;
const USER = "pgtest";
const PASS = "pgtest";
const DB = "melka_pg_test";

function run(bin: string, args: string[], env: Record<string, string> = {}) {
  const r = spawn(join(NATIVE, "bin", bin), args, {
    env: { ...process.env, ...env, LC_ALL: "C", LANG: "C" },
    stdio: "inherit",
  });
  return new Promise<void>((resolve, reject) => {
    r.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${bin} exited ${code}`))));
    r.on("error", reject);
  });
}

const cmd = process.argv[2] ?? "help";
if (cmd === "init") {
  if (existsSync(join(DATA_DIR, "PG_VERSION"))) { console.log("خوشهٔ موجود:", DATA_DIR); process.exit(0); }
  mkdirSync(DATA_DIR, { recursive: true });
  await run("initdb", ["-D", DATA_DIR, "-U", USER, "-A", "trust", "-E", "UTF8", "--no-instructions"]);
  // تنظیمات خوشهٔ تست: حافظهٔ سبک + لاگ مینیمال + پورت
  const conf = `
# PN-022-A pg-test
port = ${PORT}
listen_addresses = 'localhost'
shared_buffers = 128MB
max_connections = 60
fsync = on
synchronous_commit = on
logging_collector = off
`;
  appendFileSync(join(DATA_DIR, "postgresql.conf"), conf, "utf8");
  console.log("✓ initdb:", DATA_DIR);
} else if (cmd === "start") {
  await run("pg_ctl", ["-D", DATA_DIR, "-l", join(DATA_DIR, "pg.log"), "-w", "-t", "60", "start"]);
  // کاربر و پایگاه تست (idempotent)
  const psql = (sql: string) => {
    try { execSync(`"${join(NATIVE, "bin/psql")}" -h localhost -p ${PORT} -U ${USER} -d postgres -c "${sql}"`, { stdio: "pipe" }); } catch { /* موجود */ }
  };
  psql(`DO \\$\\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='${PASS}') THEN CREATE ROLE ${PASS} LOGIN PASSWORD '${PASS}'; END IF; END \\$\\$;`);
  try {
    execSync(`"${join(NATIVE, "bin/psql")}" -h localhost -p ${PORT} -U ${USER} -d postgres -tc "SELECT 1 FROM pg_database WHERE datname='${DB}'" | grep -q 1 || "${join(NATIVE, "bin/psql")}" -h localhost -p ${PORT} -U ${USER} -d postgres -c "CREATE DATABASE ${DB} OWNER ${PASS}"`, { stdio: "inherit" });
  } catch { /* موجود */ }
  console.log("✓ خوشهٔ PG روشن — localhost:" + PORT + "/" + DB);
} else if (cmd === "stop") {
  await run("pg_ctl", ["-D", DATA_DIR, "-m", "fast", "stop"]);
  console.log("✓ خوشه خاموش شد");
} else if (cmd === "destroy") {
  await run("pg_ctl", ["-D", DATA_DIR, "-m", "fast", "stop"]).catch(() => undefined);
  rmSync(DATA_DIR, { recursive: true, force: true });
  console.log("✓ خوشه حذف شد");
} else {
  console.log("استفاده: bun scripts/pg-migrate/pg-lifecycle.ts init|start|stop|destroy");
}
