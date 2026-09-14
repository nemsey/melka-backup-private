/**
 * واکشی BUSINESS_SECTION + داده lazy برای چند آگهی مشاور مختلف
 * هدف: یافتن تمایز «مشاور املاک» در برابر «دپارتمان املاک»
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
      "Origin": "https://divar.ir",
      ...(init?.headers ?? {}),
    },
  });
  const t = await res.text();
  return t ? JSON.parse(t) : null;
}

async function main() {
  const tokens = ["gaA2310_", "gavRS9eC", "ganSgkLI", "ganyQlCT", "gagexlpN"];

  for (const token of tokens) {
    // ۱) جزئیات → BUSINESS_SECTION
    const d = await j(`https://api.divar.ir/v8/posts-v2/web/${token}`, {
      headers: { Referer: `https://divar.ir/v/${token}` },
    });
    const biz = (d?.sections ?? []).find((s: any) => s.section_name === "BUSINESS_SECTION");
    if (!biz) {
      console.log(`\n===== ${token}: بدون BUSINESS_SECTION (شخصی) =====`);
      continue;
    }
    const lazy = biz.widgets?.find((w: any) => w.widget_type === "LAZY_SECTION")?.data;
    const rd = lazy?.request_data ?? {};
    const businessType = rd.post_business_type;
    const hashed = rd.hashed_post_owner_user_id;

    // ۲) POST lazy
    let bizData: any = null;
    try {
      bizData = await j(`https://api.divar.ir/v8/premium-user/post-page/business-data/${token}/lazy`, {
        method: "POST",
        body: JSON.stringify(rd),
        headers: { Referer: `https://divar.ir/v/${token}` },
      });
    } catch (e: any) {
      console.log(`\n===== ${token}: خطا در lazy — ${e.message} =====`);
      continue;
    }

    // خلاصه EVENT_ROW
    const events = (bizData?.widget_list ?? []).filter((w: any) => /EVENT_ROW|LEGEND|SCORE|UNEXPANDABLE|TITLE/.test(w.widget_type ?? ""));
    console.log(`\n===== ${token} | business_type=${businessType} =====`);
    for (const w of bizData?.widget_list ?? []) {
      const dd = w.data ?? {};
      const icon = dd.image_url ? dd.image_url.split("/").pop() : "";
      if (w.widget_type === "EVENT_ROW") {
        console.log(`  EVENT_ROW: title=${JSON.stringify(dd.title)} subtitle=${JSON.stringify(dd.subtitle)} icon=${icon} type=${dd.type} brand=${dd.action?.payload?.brand_token ?? "-"}`);
      } else {
        console.log(`  ${w.widget_type}: ${JSON.stringify(dd).slice(0, 200)}`);
      }
    }
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
