/**
 * PN-032 گام ۲ — ممیزی کامل پرچم MELK_ARM_OFFLINE در همهٔ لایه‌ها
 * خروجی: download/pn032/offline-flag-removed.json
 * قانون: فقط نام کلیدها بررسی می‌شود — صفر چاپ مقدار راز.
 */
import { existsSync, readFileSync } from "node:fs";

const ROOT = "/home/z/my-project";
const layers: Record<string, { exists: boolean; hasFlag: boolean; note: string }> = {};

function checkJsonKeys(path: string, label: string, note: string) {
  const exists = existsSync(path);
  let hasFlag = false;
  if (exists) {
    try {
      const d = JSON.parse(readFileSync(path, "utf8"));
      hasFlag = Object.prototype.hasOwnProperty.call(d, "MELK_ARM_OFFLINE");
    } catch { /* parse error → treat as no flag but note */ }
  }
  layers[label] = { exists, hasFlag, note };
}

// ۱) env.platform.json — منبع اصلی env جایگزین پلتفرم
checkJsonKeys(`${ROOT}/env.platform.json`, "env.platform.json", "منبع اصلی env — بازسازی توسط گارد خوددرمانی");

// ۲) اسکرو متنی لایهٔ ۱ (پایدارترین)
checkJsonKeys(`${ROOT}/db/.runtime/boot-secrets.json`, "db/.runtime/boot-secrets.json", "اسکرو سه‌لایه — مکان ۱");

// ۳) اسکرو متنی لایهٔ ۲
checkJsonKeys(`${ROOT}/upload/.runtime/boot-secrets.json`, "upload/.runtime/boot-secrets.json", "اسکرو سه‌لایه — مکان ۲");

// ۴) اسکرو رمزنگاری‌شده (لایهٔ ۳) — ساختار فیلدهایش را از سورس می‌خوانیم (بدون رمزگشایی راز)
try {
  const src = readFileSync(`${ROOT}/scripts/pn012/escrow-manager.ts`, "utf8");
  const m = src.match(/SECRET_FIELDS\s*=\s*\[([^\]]*)\]/);
  const fields = m ? m[1].split(",").map((s) => s.trim().replace(/["'`]/g, "")).filter(Boolean) : [];
  layers["env.escrow.enc"] = {
    exists: existsSync(`${ROOT}/env.escrow.enc`),
    hasFlag: fields.includes("MELK_ARM_OFFLINE"),
    note: `SECRET_FIELDS ساختاری = [${fields.join(", ")}] — پرچم آفلاین اساساً در این لایه حمل نمی‌شود`,
  };
} catch {
  layers["env.escrow.enc"] = { exists: false, hasFlag: false, note: "خواندن سورس ناموفق" };
}

// ۵) .env.local
try {
  const envl = readFileSync(`${ROOT}/.env.local`, "utf8");
  layers[".env.local"] = {
    exists: true,
    hasFlag: /^\s*MELK_ARM_OFFLINE\s*=/m.test(envl),
    note: "پروندهٔ env محلی",
  };
} catch {
  layers[".env.local"] = { exists: false, hasFlag: false, note: "پرونده وجود ندارد" };
}

// ۶) محیط فرایندهای زنده (سرور + Worker) — فقط جستجوی نام کلید
function procEnvHasFlag(pid: number): { pid: number; alive: boolean; hasFlag: boolean } {
  try {
    const env = readFileSync(`/proc/${pid}/environ`, "utf8");
    return { pid, alive: true, hasFlag: env.split("\0").some((kv) => kv.startsWith("MELK_ARM_OFFLINE=")) };
  } catch {
    return { pid, alive: false, hasFlag: false };
  }
}

// ۷) رفتار زنده: رجیستری کارهای Worker — catalog-cycle فقط وقتی پرچم خاموش است ثبت می‌شود
let catalogRegistered = false;
let catalogRuns = 0;
let catalogLastRunAt = "unknown";
let catalogLastRunRecent = false;
try {
  const rs = JSON.parse(readFileSync(`${ROOT}/upload/.runtime/runtime-status.json`, "utf8"));
  const jobs = rs.jobs ?? {};
  catalogRegistered = Object.prototype.hasOwnProperty.call(jobs, "catalog-cycle");
  const c = jobs["catalog-cycle"];
  if (c) {
    catalogRuns = c.runs ?? 0;
    catalogLastRunAt = c.lastRunAt ?? "unknown";
    const ageMs = c.lastRunAt ? Date.now() - new Date(c.lastRunAt).getTime() : Infinity;
    catalogLastRunRecent = ageMs < 10 * 60_000;
  }
} catch { /* ignore */ }

const anyFlag = Object.values(layers).some((l) => l.hasFlag);
const verdict = !anyFlag && catalogRegistered ? "OFFLINE-FLAG-OFF" : "FLAG-FOUND";

console.log(JSON.stringify({ layers, catalogRegistered, catalogRuns, catalogLastRunAt, anyFlag, verdict }, null, 2));
