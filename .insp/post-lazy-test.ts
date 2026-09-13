/**
 * آزمایش POST به مسیر lazy کسب‌وکار — همان‌گونه که وب‌اپ دیوار انجام می‌دهد
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

async function post(url: string, body: unknown, extra: Record<string, string> = {}) {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "fa,en;q=0.9",
      "Content-Type": "application/json",
      "Origin": "https://divar.ir",
      "Referer": "https://divar.ir/v/gaFak0ZB",
      ...extra,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const t = await res.text();
  return { status: res.status, text: t };
}

async function main() {
  const token = process.argv[2] ?? "gaFak0ZB";
  const hashed = process.argv[3] ?? "1f6ce13d3191a4743ed98a0fa974754b75fea61c4add1309ca9f3e3d00441fcc";

  // ۱) POST با بدنه request_data
  const r1 = await post(`https://api.divar.ir/v8/premium-user/post-page/business-data/${token}/lazy`, {
    "@type": "type.googleapis.com/premium_panel.GetPostBusinessLazyWidgetsRequest.RequestData",
    post_token: token,
    hashed_post_owner_user_id: hashed,
    post_business_type: "premium-panel",
  });
  console.log(`\n[POST request_data] HTTP ${r1.status}`);
  console.log(r1.text.slice(0, 3000));

  // ۲) POST با بدنه خالی
  if (r1.status !== 200) {
    const r2 = await post(`https://api.divar.ir/v8/premium-user/post-page/business-data/${token}/lazy`, {});
    console.log(`\n[POST empty] HTTP ${r2.status}`);
    console.log(r2.text.slice(0, 3000));
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
