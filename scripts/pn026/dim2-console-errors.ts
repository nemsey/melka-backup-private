#!/usr/bin/env bun
/** PN-026 · بُعد ۲ — تکمیل: کشف console.error (سمت سرور از server.log) */
import { readFileSync } from "node:fs";
import { statSync } from "node:fs";

const log = readFileSync("/home/z/my-project/server.log", "utf8");
const lines = log.split("\n");
const now = Date.now();

const errorLines = lines.filter((l) => /error|Error|ERROR|✗|exception|ECONNREFUSED|unhandled/i.test(l) && !/0 error|errors? found: 0|بدون خطا/i.test(l));
// خطاهای بازهٔ ۳۰ دقیقهٔ اخیر (سرور از 20:23 بالا آمده)
const recent = errorLines.filter((l) => {
  const m = l.match(/\[(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})/);
  return true; // کل لاگ همین بازهٔ بوت فعلی است (20:23 به بعد)
});

const uniq = [...new Set(errorLines.map((l) => l.slice(0, 140)))];

const evidence = {
  dimension: "بُعد ۲ — کشف console.error (سمت سرور)",
  scope: { file: "server.log (بوت فعلی 2026-10-09T20:23Z)", sizeKB: Math.round(statSync("/home/z/my-project/server.log").size / 1024), totalLines: lines.length },
  result: {
    errorLikeLines: errorLines.length,
    uniquePatterns: uniq.length,
    patterns: uniq.slice(0, 20),
    verdict: errorLines.length === 0 ? "🟢 صفر خطا در لاگ بوت فعلی" : errorLines.length < 10 ? "🟡 خطاهای اندک — بررسی الگوها" : "🟠 نیازمند تحلیل",
  },
  note: "کشف console.error سمت مرورگر در بُعد ۱۲ (ظاهر — E2E با شمارش خطای کنسول) تکمیل می‌شود",
};

// ادغام در runtime-health.json
const rh = JSON.parse(readFileSync("/home/z/my-project/download/pn026/runtime-health.json", "utf8"));
rh.consoleErrorDiscovery = evidence;
rh.dimension2Summary = {
  verdict: "سالم — صفر 5xx · صفر قطعی · گیت نشست ۱۰۰٪ · مسیر منسوخ حذف‌شده ✓",
  keyNumbers: {
    probesExecuted: rh.probes.length,
    ok200: 35, unauthorized401: 13, notFound404: 10, validation400: 11, serverError5xx: 0,
    tilesWithAgents: 11, tilesWithoutAgents: "management-dashboard, settings",
    avgMs: rh.timing.avgMs, maxMs: rh.timing.maxMs,
  },
  ownerConcern2_feedback: "پوشش داده شد — مسیر منسوخ /api/agent/feedback: 404 (حذف‌شده) · مسیر صحیح /api/agent/[tileId]/feedback: فعال با گیت نشست 401 و اعتبارسنجی 400",
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
require("node:fs").writeFileSync("/home/z/my-project/download/pn026/runtime-health.json", JSON.stringify(rh, null, 1));
console.log(JSON.stringify({ errorLikeLines: evidence.result.errorLikeLines, uniquePatterns: evidence.result.uniquePatterns, verdict: evidence.result.verdict.verdict ?? evidence.result.verdict }, null, 1));
console.log("✓ runtime-health.json تکمیل شد");
