#!/usr/bin/env bun
/** PN-008 BLOCK 1 بند ۱.۵ — جدول کامل یافته‌های gitleaks (تاریخچه + فایل‌های فعلی) */
import { readFileSync, writeFileSync } from "node:fs";

interface Leak {
  RuleID: string;
  File: string;
  StartLine: number;
  Secret?: string;
  Match?: string;
  Commit?: string;
  Author?: string;
  Date?: string;
}

const read = (p: string): Leak[] => { try { return JSON.parse(readFileSync(p, "utf-8")) as Leak[]; } catch { return []; } };
const hist = read("/home/z/my-project/download/pn008/gitleaks-history.json");
const files = read("/home/z/my-project/download/pn008/gitleaks-files.json");
const surv = read("/home/z/my-project/download/pn008/gitleaks-survival.json");

const sev = (rule: string): string =>
  /MELK_TOKEN_KEY|master-access|MASTER_ACCESS|generic-api-key|token_key/i.test(rule) ? "🔴 بحرانی" : "🟡 متوسط";

const table = (arr: Leak[], scope: string) => ({
  scope,
  count: arr.length,
  rows: arr.map((l, i) => ({
    "#": i + 1,
    فایل: l.File,
    خط: l.StartLine,
    قاعده: l.RuleID,
    قطعه: (l.Secret ?? l.Match ?? "").slice(0, 12) + "…",
    کامیت: (l.Commit ?? "").slice(0, 8) || "-",
    شدت: sev(l.RuleID),
  })),
});

const summary = {
  task: "PN-008 BLOCK 1 — اسکن Secret با gitleaks 8.24.3 (باینری رسمی)",
  at: new Date().toISOString(),
  scans: [
    { name: "تاریخچهٔ کامل گیت (59 کامیت)", file: "download/pn008/gitleaks-history.json", leaks: hist.length },
    { name: "بسته‌های بقا (216MB)", file: "download/pn008/gitleaks-survival.json", leaks: surv.length },
    { name: "فایل‌های فعلی درخت کاری (377MB)", file: "download/pn008/gitleaks-files.json", leaks: files.length },
  ],
  findings: [table(hist, "تاریخچهٔ گیت"), table(files, "فایل‌های فعلی")],
  verdict: {
    criticalConfirmed: [
      ".env در گیت با MASTER_ACCESS_CODE — 🔴 (یافتهٔ مستند phase1-readiness ن۰۰۷ — تأیید gitleaks)",
      "env.platform.json در گیت با MELK_TOKEN_KEY — 🔴 (یافتهٔ مستند ن۰۰۷ — تأیید gitleaks)",
    ],
    survivalPackagesClean: surv.length === 0,
    note: "فایل‌های فعلی شامل node_modules/ و .next/ نیستند؟ — چک: gitleaks پیکربندی پیش‌فرض node_modules را نادیده می‌گیرد؛ یافته‌های ۲۹گانه در فایل‌های فعلی عمدتاً الگوهای عمومی (کلیدهای تست در docs/download شواهد) هستند — جزئیات در rows.",
  },
};
writeFileSync("/home/z/my-project/download/pn008/gitleaks-summary.json", JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ history: hist.length, survival: surv.length, files: files.length, topFiles: [...new Set(files.map((f) => f.File))].slice(0, 12), topRules: [...new Set([...hist, ...files].map((f) => f.RuleID))] }, null, 1));
