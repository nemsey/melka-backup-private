/**
 * sacred-data-guard.ts — گارد دادهٔ مقدس (PN-038 · فاز ۱ · بند ۱.۱)
 * ---------------------------------------------------------------------------
 * شورای عالی ملکا (جلسهٔ ۰۶۳ · ملکا-شورا-ن۰۶۳-نهایی-۱۴۰۵):
 *   «اسکریپت بازیابی، زمان دیتابیس زنده را با بکاپ مقایسه می‌کند.
 *    هرگز دیتابیس جدیدتر را با بکاپ قدیمی جایگزین نمی‌کند.»
 *
 * ریشهٔ حادثه (تشخیص درست مالک): وقتی پلتفرم ابری کانتینر را ریست می‌کند،
 * اسکریپت‌های بازیابی دیتابیس زنده را با بکاپ قدیمی بستهٔ بقا جایگزین
 * می‌کردند ⇒ دادهٔ تازه (فهرست‌ها/آگهی‌ها) گم می‌شد.
 *
 * داوری سه‌لایه (هر لایه مستقل):
 *   ۱) mtime — دیتابیس زنده جدیدتر از نامزد؟ ⇒ بازداشت
 *   ۲) شمارش ردیف — دیتابیس زنده پرتر از نامزد (>۵٪)؟ ⇒ بازداشت
 *   ۳) گرایش — زنده سالم و نامزد خالی/تخریب؟ ⇒ بازداشت
 *
 * کاربرد:
 *   bun scripts/recovery/sacred-data-guard.ts <db-نامزد> [--live <db-زنده>]
 *   (پیش‌فرض live = db/custom.db)
 *
 * خروجی:
 *   exit 0 = ALLOW   (جایگزینی مجاز — نامزد تازه‌تر/غنی‌تر است)
 *   exit 2 = BLOCK   (دیتابیس زنده مقدس‌تر است — جایگزینی ممنوع)
 *   exit 1 = ERROR
 *
 * Env:
 *   SACRED_DATA_GUARD=disabled        — خاموشی کامل (تست/دریل)
 *   MELK_SACRED_GRACE_SECONDS (60)    — مهلت عبور تفاوت mtime
 *   SACRED_GUARD_OVERRIDE=1           — نادیده‌گیری داوطلبانه (با ثبت شاهد)
 * شاهد: upload/.runtime/sacred-data-guard.json + لاگ recovery-log.jsonl
 */

import { statSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { Database } from "bun:sqlite";

const REPO_ROOT = process.env.MELKA_REPO_DIR ?? "/home/z/my-project";
const WITNESS = resolve(REPO_ROOT, "upload/.runtime/sacred-data-guard.json");
const LOG = resolve(REPO_ROOT, "upload/.survival/recovery-log.jsonl");
// مهلت ۱ ساعت: VACUUM/بکاپ خودشان mtime زنده را تازه می‌کنند — دلتا زیر این
// آستانه به‌تنهایی داوری نمی‌کند (شمارش ردیف داور اصلی است). دلتای بزرگ
// یعنی زنده در آن فاصله نوشته شده و جایگزینی دادهٔ بی‌شاهد می‌بلعد.
const GRACE_SECONDS = Number(process.env.MELK_SACRED_GRACE_SECONDS ?? 3600);

/** جدول‌های شاهد شمارش — همان خانوادهٔ expected-counts auto-recovery */
const COUNT_TABLES = [
  "PropertyRecord",
  "RequestRecord",
  "TransactionRecord",
  "ExpertRecord",
  "GraphNode",
] as const;

interface DbFacts {
  file: string;
  exists: boolean;
  mtimeMs: number;
  bytes: number;
  integrity: string;
  counts: Record<string, number>;
}

function probeDb(file: string): DbFacts {
  const facts: DbFacts = { file, exists: false, mtimeMs: 0, bytes: 0, integrity: "missing", counts: {} };
  if (!existsSync(file)) return facts;
  facts.exists = true;
  const st = statSync(file);
  facts.mtimeMs = st.mtimeMs;
  facts.bytes = st.size;
  try {
    const db = new Database(file, { readonly: true });
    try {
      const ic = db.query("PRAGMA integrity_check").get() as { integrity_check: string } | null;
      facts.integrity = ic?.integrity_check ?? "unknown";
      for (const t of COUNT_TABLES) {
        try {
          facts.counts[t] = (db.query(`SELECT COUNT(*) c FROM ${t}`).get() as { c: number }).c;
        } catch {
          facts.counts[t] = -1; // جدول نیست
        }
      }
    } finally {
      db.close();
    }
  } catch {
    facts.integrity = "unreadable";
  }
  return facts;
}

function logr(kind: string, detail: Record<string, unknown>): void {
  try {
    mkdirSync(dirname(LOG), { recursive: true });
    appendFileSync(LOG, `${JSON.stringify({ at: new Date().toISOString(), kind, ...detail })}\n`);
  } catch {
    /* لاگ بهترین-تلاش */
  }
}

function writeWitness(w: Record<string, unknown>): void {
  try {
    mkdirSync(dirname(WITNESS), { recursive: true });
    const { writeFileSync } = require("node:fs") as typeof import("node:fs");
    writeFileSync(WITNESS, JSON.stringify(w, null, 2));
  } catch {
    /* شاهد بهترین-تلاش */
  }
}

// ── ورودی ──
const args = process.argv.slice(2);
const candidateArg = args[0];
const liveIdx = args.indexOf("--live");
const liveArg = liveIdx >= 0 ? args[liveIdx + 1] : resolve(REPO_ROOT, "db/custom.db");

if (!candidateArg) {
  console.error("کاربرد: sacred-data-guard.ts <candidate-db> [--live <live-db>]");
  process.exit(1);
}
if (process.env.SACRED_DATA_GUARD === "disabled") {
  console.log("sacred-data-guard: خاموش (SACRED_DATA_GUARD=disabled)");
  process.exit(0);
}

const candidate = probeDb(resolve(candidateArg));
const live = probeDb(resolve(liveArg));
const at = new Date().toISOString();

// نامزد نبود ⇒ اجازه (چیزی برای جایگزینی نیست — بازیابی بی‌خطر است)
if (!candidate.exists) {
  const w = { at, guard: "sacred-data-guard (PN-038/1.1)", verdict: "ALLOW", reason: "candidate-missing", live, candidate };
  writeWitness(w);
  logr("sacred-data-guard", { verdict: "ALLOW", reason: "candidate-missing" });
  console.log("[sacred] نامزد وجود ندارد — جایگزینی اتفاق نمی‌افتد ✓");
  process.exit(0);
}
// زنده نبود ⇒ اجازه (بازیابی دیتابیس گم‌شده)
if (!live.exists) {
  const w = { at, guard: "sacred-data-guard (PN-038/1.1)", verdict: "ALLOW", reason: "live-missing", live, candidate };
  writeWitness(w);
  logr("sacred-data-guard", { verdict: "ALLOW", reason: "live-missing" });
  console.log("[sacred] دیتابیس زنده وجود ندارد — بازیابی مجاز ✓");
  process.exit(0);
}

// ── لایهٔ ۱: mtime ──
const mtimeDeltaSec = (live.mtimeMs - candidate.mtimeMs) / 1000;
const liveNewerByMtime = mtimeDeltaSec > GRACE_SECONDS;

// ── لایهٔ ۲: شمارش ردیف — داور اصلی داده ──
// جدولِ نبود در نامزد = صفر (اگر زنده داده دارد، جایگزینی داده می‌بلعد)
const countVerdicts: Array<{ table: string; live: number; candidate: number; richer: boolean }> = [];
let liveRicherTables = 0;
for (const t of COUNT_TABLES) {
  const l = live.counts[t] ?? -1;
  const c = candidate.counts[t] ?? -1;
  const liveCount = Math.max(l, 0);
  const candCount = Math.max(c, 0);
  // زنده جدول را دارد و نامزد ندارد (یا کمتر) ⇒ جایگزینی داده می‌بلعد
  const richer = liveCount > 0 && liveCount > candCount;
  if (richer) liveRicherTables++;
  countVerdicts.push({ table: t, live: l, candidate: c, richer });
}

// ── لایهٔ ۳: سلامت ──
const liveBroken = live.integrity !== "ok";
const candidateBroken = candidate.integrity !== "ok";

let verdict: "ALLOW" | "BLOCK";
let reason: string;
if (candidateBroken && !liveBroken) {
  verdict = "BLOCK";
  reason = "candidate-corrupt";
} else if (liveBroken && !candidateBroken) {
  // زنده تخریب شده — بازیابی از نامزد سالم مجاز (خودِ بازیابی است)
  verdict = "ALLOW";
  reason = "live-broken-recover";
} else if (liveRicherTables > 0) {
  // زنده روی حداقل یک جدول پرتر است — دادهٔ ازدست‌رفتن قطعی
  verdict = "BLOCK";
  reason = "live-richer-rowcounts";
} else if (liveNewerByMtime) {
  // شمارش برابر اما زنده ساعتی است که نامزد نوشته نشده (نوشته‌های بی‌شاهد)
  verdict = "BLOCK";
  reason = "live-newer-unwitnessed-writes";
} else {
  verdict = "ALLOW";
  reason = "candidate-fresh-or-equal";
}

// فرمان صریح انسان (با ثبت کامل شاهد) — بازدارندهٔ آخر
if (process.env.SACRED_GUARD_OVERRIDE === "1") {
  const w = {
    at, guard: "sacred-data-guard (PN-038/1.1)", verdict: "OVERRIDE-BLOCK-DISARMED",
    reason, live, candidate, mtimeDeltaSec, countVerdicts,
    override: true,
  };
  writeWitness(w);
  logr("sacred-data-guard-override", { reason, mtimeDeltaSec });
  console.log(`[sacred] OVERRIDE فعال — حکم ${verdict} نادیده گرفته شد (${reason})`);
  process.exit(0);
}

const witness = {
  at,
  guard: "sacred-data-guard (PN-038/1.1)",
  verdict,
  reason,
  live: { file: live.file, mtimeMs: live.mtimeMs, bytes: live.bytes, integrity: live.integrity, counts: live.counts },
  candidate: { file: candidate.file, mtimeMs: candidate.mtimeMs, bytes: candidate.bytes, integrity: candidate.integrity, counts: candidate.counts },
  mtimeDeltaSec: Math.round(mtimeDeltaSec),
  countVerdicts,
};
writeWitness(witness);
logr("sacred-data-guard", { verdict, reason, mtimeDeltaSec: Math.round(mtimeDeltaSec), liveRicherTables });

if (verdict === "BLOCK") {
  console.error(`[sacred] BLOCK (${reason}): دیتابیس زنده مقدس است — جایگزینی با بکاپ قدیمی ممنوع`);
  console.error(`[sacred] live mtime=${new Date(live.mtimeMs).toISOString()} · candidate mtime=${new Date(candidate.mtimeMs).toISOString()} (Δ=${Math.round(mtimeDeltaSec)}s)`);
  for (const cv of countVerdicts) console.error(`[sacral] ${cv.table}: live=${cv.live} vs candidate=${cv.candidate}${cv.richer ? " (زنده پرتر)" : ""}`);
  console.error("[sacred] قانون دادهٔ مقدس (شورا-ن۰۶۳): بازیابی نتواند دادهٔ تازه را ببلعد");
  process.exit(2);
}
console.log(`[sacred] ALLOW (${reason}): نامزد تازه‌تر/برابر است — جایگزینی مجاز`);
for (const cv of countVerdicts) console.log(`[sacred] ${cv.table}: live=${cv.live} vs candidate=${cv.candidate}`);
process.exit(0);
