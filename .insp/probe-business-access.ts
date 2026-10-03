/**
 * آزمایش‌های چندگانه برای دسترسی عمومی به نوع کسب‌وکار آگهی مشاور:
 * ۱) کوکی divar.ir سپس فراخوانی lazy
 * ۲) مقایسه POST_ROW جست‌وجو: مشاور در برابر شخصی (سیگنال ساختاری فهرست)
 * ۳) مقایسه کلیدهای سطح بالا posts-v2/web مشاور/شخصی
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

async function main() {
  // ---------- ۱) کوکی تست ----------
  const homeRes = await fetch("https://divar.ir/", {
    headers: { "User-Agent": UA, "Accept": "text/html", "Accept-Language": "fa,en;q=0.9" },
  });
  const rawSet = homeRes.headers.getSetCookie?.() ?? [];
  const cookie = rawSet.map((c: string) => c.split(";")[0]).join("; ");
  console.log("cookies از divar.ir:", cookie || "(هیچ)");

  const lazyRes = await fetch("https://api.divar.ir/v8/premium-user/post-page/business-data/gaFak0ZB/lazy", {
    headers: {
      "User-Agent": UA,
      "Accept": "application/json, text/plain, */*",
      "Accept-Language": "fa,en;q=0.9",
      "Origin": "https://divar.ir",
      "Referer": "https://divar.ir/v/gaFak0ZB",
      ...(cookie ? { Cookie: cookie } : {}),
    },
  });
  const lazyText = await lazyRes.text();
  console.log(`lazy با کوکی: HTTP ${lazyRes.status} :: ${lazyText.slice(0, 400)}`);

  // ---------- ۲) POST_ROW مشاور در برابر شخصی ----------
  const search = await fetch("https://api.divar.ir/v8/postlist/w/search", {
    method: "POST",
    headers: { "User-Agent": UA, "Content-Type": "application/json", Origin: "https://divar.ir", Referer: "https://divar.ir/s/tabriz" },
    body: JSON.stringify({
      source_view: "FILTER",
      disable_recommendation: false,
      search_data: {
        form_data: { data: { category: { str: { value: "apartment-sell" } } } },
        server_payload: {
          "@type": "type.googleapis.com/widgets.SearchData.ServerPayload",
          additional_form_data: { data: { sort: { str: { value: "sort_date" } } } },
        },
      },
      city_ids: ["5"],
    }),
  }).then((r) => r.json());

  const rows = (search?.list_widgets ?? []).filter((w: any) => w.widget_type === "POST_ROW").map((w: any) => w.data);
  const brokerRow = rows.find((r: any) => r.token === "gaFak0ZB");
  const personalRow = rows.find((r: any) => r.token === "gaZKN1se");
  console.log("\n----- POST_ROW مشاور (gaFak0ZB) -----");
  console.log(JSON.stringify(brokerRow, null, 1));
  console.log("\n----- POST_ROW شخصی (gaZKN1se) -----");
  console.log(JSON.stringify(personalRow, null, 1));

  // ---------- ۳) کلیدهای سطح بالا مشاور/شخصی ----------
  for (const [label, token] of [["مشاور", "gaFak0ZB"], ["شخصی", "gaZKN1se"]] as const) {
    const d = await fetch(`https://api.divar.ir/v8/posts-v2/web/${token}`, {
      headers: { "User-Agent": UA, Referer: `https://divar.ir/v/${token}` },
    }).then((r) => r.json());
    const { sections, ...rest } = d;
    console.log(`\n----- سطح بالای ${label} (${token}) -----`);
    console.log(JSON.stringify(rest, null, 1).slice(0, 2500));
    // بخش TAGS کامل
    const tags = (sections ?? []).find((s: any) => s.section_name === "TAGS");
    if (tags) console.log(`TAGS کامل ${label}:`, JSON.stringify(tags).slice(0, 900));
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
