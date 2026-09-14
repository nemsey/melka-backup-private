/**
 * بازرسی زنده ساختار جزئیات آگهی دیوار برای یافتن برچسب «مشاور املاک / دپارتمان املاک» زیر نقشه.
 * چند آگهی تازه تبریز (فروش آپارتمان) می‌گیرد، جزئیات را واکشی و همه بخش‌ها/ویجت‌ها را دامپ می‌کند.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

async function j(url: string, init?: RequestInit): Promise<any> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "User-Agent": UA,
      "Accept": "application/json, text/plain, */*",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const t = await res.text();
  try {
    return JSON.parse(t);
  } catch {
    return t;
  }
}

async function main() {
  // ۱) جست‌وجوی تازه‌های تبریز
  const search = await j("https://api.divar.ir/v8/postlist/w/search", {
    method: "POST",
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
    headers: { Origin: "https://divar.ir", Referer: "https://divar.ir/s/tabriz" },
  });

  const rows = (search?.list_widgets ?? [])
    .filter((w: any) => w.widget_type === "POST_ROW" && w.data?.token)
    .map((w: any) => w.data);
  console.log(`نتایج جست‌وجو: ${rows.length}`);
  const tokens = rows.slice(0, 8).map((r: any) => r.token);
  console.log("tokens:", tokens.join(","));

  // ۲) جزئیات هر توکن — دامپ کامل ساختار
  for (const token of tokens) {
    const d = await j(`https://api.divar.ir/v8/posts-v2/web/${token}`, {
      headers: { Referer: `https://divar.ir/v/${token}` },
    });
    const sections = d?.sections ?? [];
    console.log(`\n========== TOKEN ${token} ==========`);
    console.log("top-level keys:", Object.keys(d ?? {}).join(","));
    if (d.contact) console.log("contact:", JSON.stringify(d.contact).slice(0, 300));
    if (d.categories_map) console.log("categories_map keys:", Object.keys(d.categories_map).join(","));
    if (d.semantic) console.log("semantic keys:", Object.keys(d.semantic ?? {}).join(","));

    sections.forEach((s: any, si: number) => {
      const name = s.section_name ?? s.widget_type ?? `sec-${si}`;
      const widgets = s.widgets ?? [];
      console.log(`  SECTION[${si}] name=${name} layout=${s.layout?.type ?? ""} widgets=${widgets.length}`);
      widgets.forEach((w: any, wi: number) => {
        const wt = w.widget_type ?? "?";
        const dataStr = JSON.stringify(w.data ?? {});
        // کوتاه ولی کامل برای ویجت‌های مهم
        const interesting =
          /مشاور|املاک|دپارتمان|BUSINESS|AGENCY|SHOP|CATALOG|LEGEND|SCORE|Rate|rating|review|shop|store|business/i.test(
            wt + " " + dataStr
          );
        const printed = interesting ? dataStr.slice(0, 700) : dataStr.slice(0, 160);
        console.log(`    W[${wi}] ${wt} :: ${printed}${dataStr.length > printed.length ? " …" : ""}`);
      });
    });
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
