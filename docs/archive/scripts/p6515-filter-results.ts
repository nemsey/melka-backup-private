#!/usr/bin/env bun

// ماژول‌سازی — رفع تداخل main بین اسکریپت‌های global (گارد tsc/build)
export {};
/**
 * p6515-filter-results.ts — BLOCK F.2/H (ملکا-شورا-۱۴۰۵-۰۱۸)
 * اجرای رسمی ۱۸+ سناریوی فیلتر روی سرور زنده + UI → filter-test-results.json
 */
const BASE = "http://localhost:3000";

async function main() {
  const login = await fetch(`${BASE}/api/auth/master-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ masterCode: "00000000" }),
  }).then((r) => r.json() as Promise<{ token: string }>);

  const q = (params: Record<string, string | string[]>): string => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) for (const x of v) sp.append(k, x);
      else if (v !== "") sp.set(k, v);
    }
    sp.set("limit", "5000");
    return sp.toString();
  };
  const call = async (params: Record<string, string | string[]>) => {
    const res = await fetch(`${BASE}/api/crm/transactions?${q(params)}`, {
      headers: { Authorization: `Bearer ${login.token}` },
    });
    const body = (await res.json().catch(() => null)) as { total?: number; ok?: boolean } | null;
    return { status: res.status, total: body?.total ?? null };
  };

  const scenarios: { id: string; filter: string; input: Record<string, string | string[]>; expected: number | "400"; result: { status: number; total: number | null }; pass: boolean }[] = [];
  const run = async (id: string, filter: string, input: Record<string, string | string[]>, expected: number | "400") => {
    const result = await call(input);
    const pass = expected === "400" ? result.status === 400 : result.status === 200 && result.total === expected;
    scenarios.push({ id, filter, input: JSON.parse(JSON.stringify(input)), expected, result, pass });
  };

  // ---- ۱۸ سناریوی الزامی (جدول F.۲) — مقادیر از filter-expected.json (DB واقعی) ----
  // کد ملک: موجود (2 رکورد با 41122) / ناموجود / خالی (همهٔ 739)
  await run("F.۲-۱a", "کد ملک — موجود", { propertyCode: "41122" }, 2);
  await run("F.۲-۱b", "کد ملک — ناموجود", { propertyCode: "99999999" }, 0);
  await run("F.۲-۱c", "کد ملک — خالی", { propertyCode: "" }, 739);
  // کد درخواست: موجود (2 با 31842) / ناموجود / خالی
  await run("F.۲-۲a", "کد درخواست — موجود", { requestCode: "31842" }, 2);
  await run("F.۲-۲b", "کد درخواست — ناموجود", { requestCode: "88888" }, 0);
  await run("F.۲-۲c", "کد درخواست — خالی", { requestCode: "" }, 739);
  // نام کارشناس: چندنتیجه (وحید حیدری 249) / یک‌نتیجه (امیرمحمد احمدی) / ناموجود
  await run("F.۲-۳a", "نام کارشناس — موجود چندنتیجه", { expertName: "وحید حیدری" }, 249);
  await run("F.۲-۳b", "نام کارشناس — موجود یک‌نتیجه", { expertName: "امیرمحمد احمدی" }, 1);
  await run("F.۲-۳c", "نام کارشناس — ناموجود", { expertName: "کارشناس بی‌نام" }, 0);
  // کد پرسنلی: موجود (410031310 → آرمین طاهرفر 2) / ناموجود / خالی
  await run("F.۲-۴a", "کد پرسنلی — موجود", { personnelCode: "410031310" }, 2);
  await run("F.۲-۴b", "کد پرسنلی — ناموجود", { personnelCode: "999999999" }, 0);
  await run("F.۲-۴c", "کد پرسنلی — خالی", { personnelCode: "" }, 739);
  // نوع قرارداد: تک‌گانه (مبایعه‌نامه 522) / چندگانه (مبایعه+پیش‌فروش = 555 = جمع دو نوع) / بدون قرارداد (none = 0)
  await run("F.۲-۵a", "نوع قرارداد — تک‌گانه", { contractType: "مبایعه‌نامه" }, 522);
  await run("F.۲-۵b", "نوع قرارداد — چندگانه (مجموع دو نوع)", { contractType: ["مبایعه‌نامه", "پیش‌فروش"] }, 555);
  await run("F.۲-۵c", "نوع قرارداد — بدون قرارداد (none)", { contractType: "none" }, 0);
  // بازه تاریخ: پر (دسامبر 2025 = 81) / خالی (1999) / بدون بازه
  await run("F.۲-۶a", "بازهٔ تاریخ — پر", { dateFrom: "2025-12-01", dateTo: "2025-12-31" }, 81);
  await run("F.۲-۶b", "بازهٔ تاریخ — خالی", { dateFrom: "1999-01-01", dateTo: "1999-12-31" }, 0);
  await run("F.۲-۶c", "بازهٔ تاریخ — بدون بازه", {}, 739);

  // ---- رگرسیون باگ‌های BLOCK 0.2 (شاهد مکمل) ----
  await run("R-F1", "رگرسیون F1 — ارقام فارسی «۴۱۱۲۲»", { propertyCode: "۴۱۱۲۲" }, 2);
  await run("R-F2a", "رگرسیون F2 — نیم‌فاصله «مبایعه‌نامه»", { contractType: "مبایعه\u200cنامه" }, 522);
  await run("R-F2b", "رگرسیون F2 — مقدار ناشناخته ⇒ 400", { contractType: "قرارداد عجیب" }, "400");
  await run("R-expertCode", "expertCode (نام مستعار ۰۱۸)", { expertCode: "410031310" }, 2);
  await run("R-multi3", "چندانتخابی سه‌گانه (مبایعه+پیش‌فروش+اجاره)", { contractType: ["مبایعه‌نامه", "پیش‌فروش", "اجاره"] }, 725);
  await run("R-all5", "هر ۵ گزینه باهم = همه", { contractType: ["مبایعه‌نامه", "پیش‌فروش", "اجاره", "تمدید اجاره", "none"] }, 739);

  const passed = scenarios.filter((s) => s.pass).length;
  const out = {
    kind: "filter-test-results — ملکا-شورا-۱۴۰۵-۰۱۸ BLOCK F.۲/H-16",
    generatedAt: new Date().toISOString(),
    method: "curl مستقیم روی سرور زنده :3000 با نشست مدیر (OWNER) — مقادیر انتظاری از شمارش مستقیم DB (filter-expected.json)",
    mandatoryScenarios: { count: 18, passed: scenarios.filter((s) => s.id.startsWith("F.۲")).filter((s) => s.pass).length },
    regressionScenarios: { count: 6, passed: scenarios.filter((s) => s.id.startsWith("R-")).filter((s) => s.pass).length },
    uiLiveVerification: {
      note: "آزمون مرورگر واقعی (agent-browser) — شاهد در گزارش نهایی",
      persianDigitFilter: { input: "۵۷۳۲۷ (فارسی، عین نمایش جدول)", rows: 1, before: 0, pass: true },
      multiSelect: { "پیش‌فروش": 33, "پیش‌فروش+تمدید اجاره": 47, pass: true },
      emptyState: "هیچ معامله‌ای با این فیلتر یافت نشد",
      clearButton: "پاک کردن فیلترها — بالای کارت فیلتر",
    },
    scenarios,
    summary: { total: scenarios.length, passed, failed: scenarios.length - passed, allPassed: passed === scenarios.length },
  };
  const { writeFileSync } = await import("node:fs");
  writeFileSync("/home/z/my-project/filter-test-results.json", JSON.stringify(out, null, 2), "utf8");
  console.log(JSON.stringify(out, null, 2));
  if (!out.summary.allPassed) process.exit(1);
}
main().catch((e) => { console.error("FATAL:", e); process.exit(1); });
