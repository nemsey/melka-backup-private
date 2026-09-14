/**
 * آزمایش مسیر lazy با هدرهای اختصاصی وب‌اپ دیوار (x-platform, x-device-id, x-web-app-version...)
 * + کوکی‌های کامل did/cdid
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
const TOKEN = process.argv[2] ?? "gaFak0ZB";

async function attempt(name: string, extraHeaders: Record<string, string>) {
  const res = await fetch(`https://api.divar.ir/v8/premium-user/post-page/business-data/${TOKEN}/lazy`, {
    headers: {
      "User-Agent": UA,
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "fa,en;q=0.9",
      "Origin": "https://divar.ir",
      "Referer": `https://divar.ir/v/${TOKEN}`,
      ...extraHeaders,
    },
  });
  const t = await res.text();
  console.log(`\n[${name}] HTTP ${res.status} :: ${t.slice(0, 600)}`);
  return res.status === 200;
}

async function main() {
  // کوکی‌های پایه
  const home = await fetch("https://divar.ir/", { headers: { "User-Agent": UA, Accept: "text/html" } });
  const cookies = (home.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const did = /did=([^;]+)/.exec(cookies)?.[1] ?? crypto.randomUUID();

  const ok =
    (await attempt("x-platform+did", { "x-platform": "web", "x-device-id": did, Cookie: cookies })) ||
    (await attempt("x-web-app-version", { "x-platform": "web", "x-web-app-version": "15.0.0", "x-device-id": did, Cookie: cookies })) ||
    (await attempt("only-did-cookie", { "x-device-id": did, Cookie: cookies })) ||
    (await attempt("did-param", { "x-platform": "web", "x-divar-device-id": did })) ||
    (await attempt("app-version-legacy", { "x-app-version": "20.7.0", "x-platform": "web", "x-device-id": did, Cookie: cookies }));

  console.log("\nنتیجه نهایی:", ok ? "یکی از مسیرها جواب داد" : "همه ۴۰۳ — مسیر lazy نیازمند نشست واقعی است");
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
