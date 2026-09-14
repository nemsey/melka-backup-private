/**
 * بررسی HTML صفحه وب آگهی مشاور — جست‌وجوی «مشاور املاک / دپارتمان املاک» در داده‌های SSR
 * و تلاش مجدد مسیر lazy با هدرهای کامل مرورگر (Origin/Accept-Language).
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

async function main() {
  const token = process.argv[2] ?? "gaFak0ZB";
  // ۱) HTML صفحه
  const res = await fetch(`https://divar.ir/v/${token}`, {
    headers: {
      "User-Agent": UA,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "fa,en;q=0.9",
    },
  });
  const html = await res.text();
  console.log(`HTML length: ${html.length}, status: ${res.status}`);

  for (const needle of ["مشاور املاک", "دپارتمان املاک", "املاک طاهری", "BUSINESS", "business_data"]) {
    const idx = html.indexOf(needle);
    console.log(`\n«${needle}» → ${idx >= 0 ? "FOUND at " + idx : "not found"}`);
    if (idx >= 0) {
      console.log(html.slice(Math.max(0, idx - 400), idx + 600).replace(/\s+/g, " "));
    }
  }

  // ۲) تلاش مجدد lazy با هدرهای کامل
  const res2 = await fetch(`https://api.divar.ir/v8/premium-user/post-page/business-data/${token}/lazy`, {
    headers: {
      "User-Agent": UA,
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "fa,en;q=0.9",
      "Origin": "https://divar.ir",
      "Referer": `https://divar.ir/v/${token}`,
    },
  });
  const t2 = await res2.text();
  console.log(`\nlazy with Origin: HTTP ${res2.status} :: ${t2.slice(0, 500)}`);
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
