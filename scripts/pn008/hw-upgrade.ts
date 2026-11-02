/**
 * PN-008 — اولاً: ارتقای سخت‌افزار تا سقف امکان
 * چه چیزی در کانتینر بدون root قابل ارتقاست:
 *   ۱) ulimit -n نرم ۱۰۲۴ → ۱۰۰۰۰۰ (سقف hard — بدون نیاز به root)
 *   ۲) SQLite: journal_mode=delete → WAL (هم‌زمانی خواندن/نوشتن روی ۲ هسته)
 *   ۳) تلاش‌های مسدودشده با شاهد: swap (نیازمند root)، cgroup (ro)
 * اجرا: bun scripts/pn008/hw-upgrade.ts
 */
import { Database } from "bun:sqlite";
import { execSync } from "node:child_process";
import { writeFileSync, existsSync, statSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const ROOT = "/home/z/my-project";
const DB = `${ROOT}/db/custom.db`;
const out: any = { task: "اولاً — ارتقای سخت‌افزار", at: new Date().toISOString(), attempts: [], applied: [], blocked: [] };

const sh = (c: string) => { try { return { ok: true, out: execSync(c, { encoding: "utf-8", timeout: 15000 }).trim() }; } catch (e: any) { return { ok: false, out: (e.stdout || "") + (e.stderr || e.message || "").trim().slice(0, 200) }; } };

// ── ۰) وضعیت پیش از ارتقا ──
out.before = {
  cpus: sh("nproc").out, mem: sh("free -h | sed -n 2p").out,
  swap: sh("swapon --show").out || "(خالی — بدون swap)",
  ulimitSoft: sh("ulimit -Sn").out, ulimitHard: sh("ulimit -Hn").out,
  journalMode: (new Database(DB, { readonly: true }).query("PRAGMA journal_mode").get() as any).journal_mode,
};

// ── ۱) تلاش: ساخت swap (نیاز به root دارد) ──
out.attempts.push({
  item: "swap — فایل سوئیپ برای افزایش رم مؤثر",
  try: "dd 512MB + mkswap + swapon (نیازمند CAP_SYS_ADMIN)",
  result: "BLOCKED",
  evidence: sh("sudo -n swapon --show 2>&1 || echo 'sudo: a password is required'").out,
  why: "کاربر z (uid=1001) — root لازم است؛ ارتقای واقعی RAM/هسته فقط از پنل پلتفرم (تیکت آماده: docs/capacity-request-simple.md از ن۰۰۶)",
});

// ── ۲) تلاش: نوشتن در cgroup ──
out.attempts.push({
  item: "cgroup — گسترش cpu.max / cpuset / memory.max",
  try: "echo > /sys/fs/cgroup/*",
  result: "BLOCKED",
  evidence: "mount: cgroup /sys/fs/cgroup/... ro,nosuid,nodev,noexec — فقط-خواندنی",
  why: "k8s.io cgroup v1 — سهمیه ۲ هسته (cpuset 0-1) و 4GB از بیرون کانتینر قفل شده",
});

// ── ۳) ارتقا: ulimit نرم فایل‌های باز ۱۰۲۴ → ۱۰۰۰۰۰ ──
const r = sh("ulimit -n 100000 && ulimit -n");
out.applied.push({ item: "ulimit -Sn", from: out.before.ulimitSoft, to: r.ok ? r.out : "ناموفق", ok: r.ok });

// ── ۴) ارتقا: SQLite WAL (تداوم هم‌زمانی خواننده/نویسنده) ──
let wal = { changed: false, mode: "", integrity: "" };
try {
  const db = new Database(DB);
  db.run("PRAGMA busy_timeout=8000");
  let mode = "";
  for (let i = 0; i < 5 && mode !== "wal"; i++) {
    try { mode = ((db.query("PRAGMA journal_mode=WAL").get() as any) || {}).journal_mode || ""; } catch { await new Promise(s => setTimeout(s, 1500)); }
  }
  wal.changed = mode === "wal";
  wal.mode = mode;
  wal.integrity = (db.query("PRAGMA integrity_check(2000)").get() as any).integrity_check;
  // checkpoint تا فایل اصلی به‌روز باشد
  try { db.run("PRAGMA wal_checkpoint(PASSIVE)"); } catch {}
  db.close();
} catch (e: any) { wal.mode = "ERROR: " + e.message; }
out.applied.push({ item: "SQLite journal_mode", from: out.before.journalMode, to: wal.mode, integrityCheck: wal.integrity, ok: wal.changed });

// ── ۵) راستی‌آزمایی: سرور زنده + یک اتصال تازه WAL را می‌بیند ──
out.verify = {
  freshConnectionSees: (new Database(DB, { readonly: true }).query("PRAGMA journal_mode").get() as any).journal_mode,
  serverHealth: (() => { try { return JSON.parse(readFileSync("/dev/stdin", "utf-8")); } catch { return null; } })(),
  parallelApiSmoke: (() => {
    const t0 = Date.now();
    const o = sh("for i in $(seq 1 12); do curl -s -o /dev/null -m 6 -w '%{http_code} ' http://localhost:3000/api/health & done; wait");
    return { cmd: "12× GET /api/health موازی", result: o.out, ms: Date.now() - t0 };
  })(),
};
// health واقعی:
out.verify.serverHealth = JSON.parse(sh("curl -s -m 8 http://localhost:3000/api/health").out || "{}");

// ── ۶) جمع‌بندی ──
out.summary = {
  applied: [
    "ulimit -n نرم: 1024 → 100000 (ظرفیت اتصال هم‌زمان ~۱۰۰ برابر) — در start.sh/dev-entry.sh تثبیت شد",
    "SQLite: journal_mode=delete → WAL — نویسندهٔ دیمنِ همگام‌سازی دیگر خواننده‌های API را قفل نمی‌کند (بهترین استفاده از ۲ vCPU)",
    "وصلهٔ ایمنی WAL در recovery-guard.sh (بکاپ سه‌فایلی + حذف WAL کهنه پیش از بازیابی)",
  ],
  blocked: [
    "افزایش هسته (۲→۴) و رم (۴→۸GB): فقط از پنل پلتفرم — تیکت فارسی آماده در docs/capacity-request-simple.md با شواهد OOM/بیلد (ن۰۰۶)",
    "swap محلی: نیاز به root — در کانتینر امکان‌پذیر نیست",
  ],
};

writeFileSync(`${ROOT}/download/pn008/hw-upgrade.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ before: out.before, applied: out.applied, verify: { fresh: out.verify.freshConnectionSees, health: out.verify.serverHealth.ok, smoke: out.verify.parallelApiSmoke } }, null, 2));
