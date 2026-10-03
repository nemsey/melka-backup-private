/**
 * مقایسه POST_ROW آگهی شخصی و مشاور در جست‌وجوی زنده + تست مسیر lazy با توکن نشست (در صورت وجود)
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
  return t ? JSON.parse(t) : null;
}

async function searchPage(page: number, s: { searchUid: string | null; viewedTokens: string | null; lastPostDate: string | null }) {
  const payload: Record<string, unknown> = {
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
  };
  if (page > 1) {
    payload.search_data = {
      ...(payload.search_data as Record<string, unknown>),
      pagination: {
        "@type": "type.googleapis.com/widgets.SearchData.Pagination",
        page,
        search_uid: s.searchUid ?? "",
        viewed_tokens: s.viewedTokens ?? "",
        last_post_date: s.lastPostDate ?? "",
      },
    };
  }
  const data = await j("https://api.divar.ir/v8/postlist/w/search", {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { Origin: "https://divar.ir", Referer: "https://divar.ir/s/tabriz" },
  });
  const rows = (data?.list_widgets ?? [])
    .filter((w: any) => w.widget_type === "POST_ROW" && w.data?.token)
    .map((w: any) => w.data);
  const pag = data?.pagination?.data ?? {};
  return {
    rows,
    hasMore: Boolean(data?.pagination?.has_next_page),
    searchUid: pag.search_uid ?? null,
    viewedTokens: pag.viewed_tokens ?? null,
    lastPostDate: pag.last_post_date ?? null,
  };
}

async function main() {
  const st = { searchUid: null as string | null, viewedTokens: null as string | null, lastPostDate: null as string | null };
  const all: any[] = [];
  for (let page = 1; page <= 3; page++) {
    const r = await searchPage(page, st);
    all.push(...r.rows);
    Object.assign(st, { searchUid: r.searchUid, viewedTokens: r.viewedTokens, lastPostDate: r.lastPostDate });
    if (!r.hasMore) break;
  }

  // برای هر توکن: جزئیات را بگیر، BUSINESS_SECTION دارد؟ سپس POST_ROW اش را نشان بده
  console.log(`تعداد: ${all.length}\n`);
  console.log("token | bottom_desc | red_text | top_desc | hasBusinessSection | title");
  let checked = 0;
  for (const row of all) {
    if (checked >= 14) break;
    let d: any;
    try {
      d = await j(`https://api.divar.ir/v8/posts-v2/web/${row.token}`, { headers: { Referer: `https://divar.ir/v/${row.token}` } });
    } catch {
      continue;
    }
    checked += 1;
    const hasBiz = (d?.sections ?? []).some((s: any) => s.section_name === "BUSINESS_SECTION");
    console.log(
      `${row.token} | ${row.bottom_description_text ?? "—"} | ${row.red_text ?? "—"} | ${row.top_description_text ?? "—"} | ${hasBiz ? "BUSINESS✓" : "personal"} | ${row.title.slice(0, 40)}`
    );
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
