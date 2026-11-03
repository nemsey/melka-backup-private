#!/usr/bin/env bun
/** p6515-classify-quickcheck.ts — آزمون سریع classifyContract (۵ ورودی الزامی + وارینت‌ها) */
import { classifyContract, normalizeFaDigits, normalizeContractTypeValue } from "../src/lib/contract-classify";

const cases: [string | null, string, string][] = [
  ["مبایعه نامه", "مبایعه‌نامه", "sale"],
  ["پیش فروش", "پیش‌فروش", "sale"],
  ["اجاره نامه", "اجاره", "rent"],
  ["تمدید اجاره", "تمدید اجاره", "rent"],
  [null, "ثبت‌نشده", "none"],
  // وارینت‌های واقعی/آینده
  ["مبایعه‌نامه", "مبایعه‌نامه", "sale"], // نیم‌فاصله
  ["پیش‌فروش", "پیش‌فروش", "sale"], // نیم‌فاصله
  ["", "ثبت‌نشده", "none"],
  ["  اجاره   نامه  ", "اجاره", "rent"], // فاصله اضافی
  ["خرید و فروش", "مبایعه‌نامه", "sale"],
  ["نامشخص-آینده", "ثبت‌نشده", "none"], // ناشناخته ⇒ ثبت‌نشده (حفظ قید ریاضی)
];

let pass = 0;
for (const [input, kind, family] of cases) {
  const r = classifyContract(input);
  const ok = r.kind === kind && r.family === family;
  if (ok) pass += 1;
  console.log(`${ok ? "✅" : "❌"} classifyContract(${JSON.stringify(input)}) → {${r.kind}, ${r.family}} (انتظار {${kind}, ${family}})`);
}
console.log(`\n${pass}/${cases.length} passed`);

// نرمال‌سازی ارقام (باگ F1)
const d = normalizeFaDigits("۴۱۱۲۲ و ٥٦٧");
console.log(d === "41122 و 567" ? "✅ normalizeFaDigits OK" : `❌ normalizeFaDigits: ${d}`);
const n = normalizeContractTypeValue("مبایعه\u200cنامه");
console.log(n === "مبایعه نامه" ? "✅ ZWNJ normalize OK" : `❌ ZWNJ: ${JSON.stringify(n)}`);
if (pass !== cases.length) process.exit(1);
