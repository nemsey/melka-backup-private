#!/usr/bin/env bun
/** PN-026 · بُعد ۳ — قرارداد تست (Test Contract) · ۷ جستجو · فقط-خواندنی */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "/home/z/my-project";
const TESTS = join(ROOT, "tests");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith(".ts")) out.push(p);
  }
  return out;
}
const testFiles = walk(TESTS);

type Hit = { file: string; line: number; text: string };
function search(pattern: RegExp, files = testFiles): Hit[] {
  const hits: Hit[] = [];
  for (const f of files) {
    readFileSync(f, "utf8").split("\n").forEach((l, i) => {
      if (pattern.test(l)) hits.push({ file: f.replace(ROOT + "/", ""), line: i + 1, text: l.trim().slice(0, 110) });
    });
  }
  return hits;
}

// ۱-۴) pinها
const masterPin = search(/["']80211186["']/);
const oldPin = search(/["']00000000["']/);
const armTokPin = search(/arm-tok-p6509/);
const verifyTokPin = search(/verify-p2-03-ad-1/);

// ۵) فایل‌های تست قدیمی p65*, pn00*
const legacyFiles = testFiles.filter((f) => /\/(p65\d\d|pn00\d)[^/]*\.test\.ts$/.test(f));

// ۶) MELKA_REPO_DIR — الگوی ایزوله‌سازی
const repoDirUses: Hit[] = [];
const repoDirMissing: string[] = [];
for (const f of testFiles) {
  const txt = readFileSync(f, "utf8");
  if (/MELKA_REPO_DIR/.test(txt)) repoDirUses.push({ file: f.replace(ROOT + "/", ""), line: 0, text: "uses MELKA_REPO_DIR isolation" });
  else repoDirMissing.push(f.replace(ROOT + "/", ""));
}

// ۷) mock.module — آلودگی
const mockModule = search(/mock\.module\s*\(/);

// جستجوی مکمل: pinهای دیگر (توکن‌های ثابت تستی)
const otherPins = search(/(test-key-[a-z0-9-]+|tok-[a-z0-9-]{4,})/);

// تحلیل: آیا pinها «قانونی» هستند؟ (در env تست یا read тестейبیل)
const analysis = testFiles.map((f) => {
  const txt = readFileSync(f, "utf8");
  const rel = f.replace(ROOT + "/", "");
  const pins: string[] = [];
  if (/["']80211186["']/.test(txt)) pins.push("80211186");
  if (/["']00000000["']/.test(txt)) pins.push("00000000");
  if (/arm-tok-p6509/.test(txt)) pins.push("arm-tok-p6509");
  if (/verify-p2-03-ad-1/.test(txt)) pins.push("verify-p2-03-ad-1");
  if (/test-key-hotfix01-rotate/.test(txt)) pins.push("test-key-hotfix01-rotate");
  const usesEnv = /process\.env\.(MASTER|MELK)|env\.(MASTER|MELK)|MELK_TEST_MASTER/.test(txt);
  return { file: rel, pins, usesEnvGate: usesEnv, verdict: pins.length === 0 ? "clean" : usesEnv ? "pin-with-env-fallback" : "hard-pin" };
}).filter((r) => r.pins.length > 0);

const evidence = {
  dimension: "بُعد ۳ — قرارداد تست (Test Contract)",
  scope: { testFiles: testFiles.length, totalLines: testFiles.reduce((a, f) => a + readFileSync(f, "utf8").split("\n").length, 0) },
  searches: [
    { id: 1, query: "«80211186» در tests/", goal: "pin کد مدیر", count: masterPin.length, samples: masterPin.slice(0, 6) },
    { id: 2, query: "«00000000» در tests/", goal: "pin کد قدیمی", count: oldPin.length, samples: oldPin.slice(0, 6) },
    { id: 3, query: "«arm-tok-p6509» در tests/", goal: "pin توکن", count: armTokPin.length, samples: armTokPin.slice(0, 6) },
    { id: 4, query: "«verify-p2-03-ad-1» در tests/", goal: "pin توکن تست", count: verifyTokPin.length, samples: verifyTokPin.slice(0, 6) },
    { id: 5, query: "فایل‌های قدیمی p65*/pn00*", goal: "تست‌های قدیمی", count: legacyFiles.length, files: legacyFiles.map((f) => f.replace(ROOT + "/", "")) },
    { id: 6, query: "MELKA_REPO_DIR استفاده", goal: "ایزوله‌سازی", count: repoDirUses.length, missingIn: repoDirMissing.slice(0, 10) },
    { id: 7, query: "mock.module", goal: "آلودگی", count: mockModule.length, samples: mockModule.slice(0, 6) },
  ],
  pinAnalysis: analysis,
  otherPinsFound: [...new Set(otherPins.map((h) => h.text.match(/(test-key-[a-z0-9-]+|tok-[a-z0-9-]{4,})/)?.[1] ?? ""))].filter(Boolean),
  ownerConcern3_testPins: "",
};

// جدول پس از اقدام (شکل سند)
const table = analysis.map((r) => ({
  file: r.file,
  pins: r.pins.join(", "),
  obsolete: r.pins.some((p) => p === "00000000") ? "بله (کد قدیمی)" : r.pins.some((p) => p === "arm-tok-p6509") ? "بله (توکن قدیمی)" : "خیر",
  contract: r.usesEnvGate ? "env-first با fallback pin" : "hard-pin",
  action: r.hardOrEnv === "clean" ? "—" : r.verdict === "hard-pin" ? "پیشنهاد: انتقال pin به env تست (فاز ۵)" : "قابل‌قبول — env-first",
}));
// غنی‌سازی action
for (const t of table) t.action = t.contract === "hard-pin" ? "پیشنهاد: انتقال pin به env تست (فاز ۵ · مجوز مالک)" : "قابل‌قبول — env-first";
evidence.afterActionTable = table;
evidence.ownerConcern3_testPins = `پوشش داده شد — ${analysis.length} فایل با pin شناسایی شد · ${analysis.filter((a) => a.verdict === "hard-pin").length} hard-pin بدون گیت env · ${analysis.filter((a) => a.verdict === "pin-with-env-fallback").length} با گیت env`;

console.log(JSON.stringify(evidence, null, 1));
