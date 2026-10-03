/**
 * یافتن آگهی‌های «مشاور املاک / دپارتمان املاک» در جزئیات زنده دیوار
 * چند صفحه جست‌وجو → جزئیات هر توکن → گزارش بخش‌های غیرمعمول (بعد از MAP) و متن‌های مشاور/دپارتمان
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

const BASE_SECTIONS = new Set([
  "BREADCRUMB", "TITLE", "DESCRIPTION", "IMAGE", "LIST_DATA", "TAGS", "MAP", "NOTE", "STATIC",
]);

async function searchPage(page: number, searchUid: string | null, viewedTokens: string | null, lastPostDate: string | null) {
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
        search_uid: searchUid ?? "",
        viewed_tokens: viewedTokens ?? "",
        last_post_date: lastPostDate ?? "",
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
  let searchUid: string | null = null;
  let viewedTokens: string | null = null;
  let lastPostDate: string | null = null;
  const all: any[] = [];
  for (let page = 1; page <= 4; page++) {
    const r = await searchPage(page, searchUid, viewedTokens, lastPostDate);
    all.push(...r.rows);
    searchUid = r.searchUid;
    viewedTokens = r.viewedTokens;
    lastPostDate = r.lastPostDate;
    if (!r.hasMore) break;
  }
  // آگهی‌هایی که در فهرست، متن قرمز/بالا/پایین دارند که نشانه مشاور است را اول بررسی کن
  console.log(`کل نتایج: ${all.length}`);
  const flagged = all.filter(
    (r) => /مشاور|املاک|دپارتمان|گروه|آژانس/.test(`${r.title ?? ""} ${r.top_description_text ?? ""} ${r.middle_description_text ?? ""}`)
  );
  console.log(`نامزدهای مشاور: ${flagged.length}`);
  const candidates = [...flagged, ...all.filter((r) => !flagged.includes(r))].slice(0, 30);

  let found = 0;
  for (const row of candidates) {
    if (found >= 4) break;
    let d: any;
    try {
      d = await j(`https://api.divar.ir/v8/posts-v2/web/${row.token}`, {
        headers: { Referer: `https://divar.ir/v/${row.token}` },
      });
    } catch {
      continue;
    }
    const sections: any[] = d?.sections ?? [];
    const names = sections.map((s: any) => s.section_name ?? "?");
    const extra = names.filter((n: string) => !BASE_SECTIONS.has(n));
    const full = JSON.stringify(d);
    const hasBrokerText = /مشاور املاک|دپارتمان املاک/.test(full);
    if (extra.length || hasBrokerText) {
      found += 1;
      console.log(`\n===== TOKEN ${row.token} (${row.title}) =====`);
      console.log("sections:", names.join(" → "));
      if (hasBrokerText) console.log(">>> متن «مشاور املاک/دپارتمان املاک» در پاسخ موجود است");
      for (const s of sections) {
        const nm = s.section_name ?? "?";
        if (BASE_SECTIONS.has(nm) && !hasBrokerText) continue;
        const str = JSON.stringify(s);
        if (BASE_SECTIONS.has(nm) && !/مشاور|دپارتمان/.test(str)) continue;
        console.log(`--- SECTION ${nm} ---`);
        console.log(str.slice(0, 1800));
      }
    }
  }
  if (!found) console.log("\nهیچ آگهی مشاوری در ۳۰ نمونه یافت نشد — باید جست‌وجو گسترده‌تر شود");
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
