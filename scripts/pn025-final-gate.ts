// دروازهٔ نهایی PN-025 — گواه M1-M5 + سه کاشی حیاتی (نشست واقعی OWNER)
const { createSession } = await import("../src/lib/auth/session");
const { token } = await createSession(
  { personnelCode: "410031320", displayName: "سید نعمت اله سیدی", role: "OWNER" },
  { ip: "127.0.0.1" },
  null,
);

const BASE = "http://localhost:3000";
const results = {};
const probes = [
  ["home", "/api/health"],
  ["M1-آگهی", "/api/crm/arm-catalog/listings?limit=1"],
  ["M2-درخواست", "/api/requests"],
  ["M3-معاملات", "/api/crm/transactions?limit=1"],
  ["M4-کارشناسان", "/api/experts?limit=1"],
  ["M5-تطبیق (کاشی حیاتی)", "/api/matching?listingCode=34826"],
  ["فایل‌یابی (کاشی حیاتی)", "/api/file-finder/advice?token=gate-probe&area=ولیعصر"],
  ["M7-شاخص (کاشی حیاتی)", "/api/market-index"],
  ["مشور مالک (موتور ۱۶)", "/api/admin/decision-advisor?kind=property&id=34826"],
  ["حافظه (ستون ۱)", "/api/admin/memory/stats"],
];
for (const [name, path] of probes) {
  try {
    const res = await fetch(`${BASE}${path}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(45000) });
    const ok = res.status === 200;
    let extra = "";
    if (ok && name.startsWith("مشور")) {
      const body = await res.json();
      extra = body.advice && !body.advice.locked ? ` → «${body.advice.recommendation}»` : ` → قفل کمربند (${body.advice?.reason ?? "?"})`;
    }
    if (ok && name.startsWith("حافظه")) {
      const body = await res.json();
      extra = ` → سطوح: ${body.levels.total} (hot=${body.levels.hot})`;
    }
    results[name] = `${res.status}${extra}`;
  } catch (e) {
    results[name] = `ERR ${e instanceof Error ? e.message.slice(0, 40) : "خطا"}`;
  }
}
console.log(JSON.stringify(results, null, 1));
const allOk = Object.values(results).every((v) => v.startsWith("200"));
console.log(allOk ? "\nM1-M5 + سه حیاتی + ستون‌های PN-025: همه 200 ✓" : "\nبرخی قرمز!");
process.exit(0);
