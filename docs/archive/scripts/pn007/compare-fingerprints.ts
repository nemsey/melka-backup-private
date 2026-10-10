#!/usr/bin/env bun
// PN-007 BLOCK 1.3 — مقایسهٔ دو اثر انگشت بیلد → fingerprint-proof.json
// استفاده: compare-fingerprints.ts <fp1.json> <fp2.json> <proof.json>
import { readFileSync, writeFileSync } from "fs";
import { compareFingerprints, type VersionFingerprint } from "../../src/lib/version-fingerprint";

const [aPath, bPath, outPath] = process.argv.slice(2);
if (!aPath || !bPath || !outPath) {
  console.error("استفاده: compare-fingerprints.ts <fp1.json> <fp2.json> <proof.json>");
  process.exit(2);
}

const fp1 = JSON.parse(readFileSync(aPath, "utf-8")) as VersionFingerprint;
const fp2 = JSON.parse(readFileSync(bPath, "utf-8")) as VersionFingerprint;
const cmp = compareFingerprints(fp1, fp2);

const proof = {
  case: "PN-007-BLOCK1-REPRODUCIBILITY-PROOF",
  council: "ملکا-شورا-ن۰۰۷-۱۴۰۵",
  generatedAt: new Date().toISOString(),
  question: "آیا دو Build متوالی از همان کد، همان اثر انگشت را تولید می‌کنند؟ (مگر فیلدهای زمانی)",
  method: [
    "۱) bun run build (بیلد ۱) → .next/fingerprint.json",
    "۲) rm -rf .next (پاک‌سازی کامل خروجی)",
    "۳) bun run build (بیلد ۲ — از صفر) → .next/fingerprint.json",
    "۴) مقایسهٔ فیلد‌به‌فیلد؛ فیلدهای زمانی (builtAt/buildId/computedAt/computedBy) از طرح exempt هستند",
  ].join("\n"),
  buildId1: fp1.buildId,
  buildId2: fp2.buildId,
  comparison: cmp,
  verdict: cmp.reproducible
    ? "REPRODUCIBLE — دو بیلد متوالی از همان کد، هویت یکسان تولید کردند (۱۰۰٪ فیلدهای قابل‌مقایسه)"
    : "NOT-REPRODUCIBLE — تفاوت غیرمجاز کشف شد",
};

writeFileSync(outPath, JSON.stringify(proof, null, 2));
console.log(`فیلدها: ${cmp.totalFields} | قابل‌مقایسه: ${cmp.comparedFields} | یکسان: ${cmp.identicalFields} | exempt زمانی: ${cmp.exemptFields.join(", ")}`);
console.log(`نسبت همانی: ${(cmp.identicalRatio * 100).toFixed(1)}٪ (آستانهٔ شورا ≥ ۹۵٪)`);
if (cmp.diffs.length > 0) {
  console.error(`✗ تفاوت‌های غیرمجاز (${cmp.diffs.length}):`);
  for (const d of cmp.diffs) console.error(`   ${d.field}: بیلد۱=${d.a} vs بیلد۲=${d.b}`);
  process.exit(1);
}
if (!cmp.reproducible) { console.error("✗ نسبت همانی زیر آستانه"); process.exit(1); }
console.log("✅ PASS — نوشته شد: " + outPath);
