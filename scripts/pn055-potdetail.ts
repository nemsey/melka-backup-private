/**
 * PN-055/گام ۳ — آزمون Potentials/show/{id} + getMyRelatedFilings + پوشش جستجو
 * اجرا: bun scripts/pn055-potdetail.ts
 */
import { crmLogin } from "@/lib/integrations/melketun/sync";
import { readFileSync, writeFileSync, mkdirSync } from "fs";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const secrets = JSON.parse(
  readFileSync("upload/.runtime/melketun-secrets.json", "utf8"),
) as { crm: { base_url: string; username: string; password: string } };
const base = secrets.crm.base_url.replace(/\/$/, "");
const errors: string[] = [];
const jar = await crmLogin(base, secrets.crm.username, secrets.crm.password, errors);
if (errors.length) { console.log("[pd] LOGIN-ERRORS:", errors.join(" | ")); process.exit(1); }

function extractProps(html: string): Record<string, unknown> | null {
  const m = html.match(/data-page="([^"]+)"/);
  if (!m) return null;
  try {
    const decoded = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#039;/g, "'");
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch { return null; }
}

async function getPage(path: string) {
  const res = await fetch(base + path, {
    headers: { Cookie: jar.header() },
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });
  const html = res.status === 200 ? await res.text() : "";
  return { status: res.status, page: extractProps(html) };
}

mkdirSync("download/pn055", { recursive: true });

// ۱) جزئیات یک potential (id کامل 13x402006)
const pid = "13x402006";
{
  const r = await getPage(`/Potentials/show/${pid}`);
  console.log("[pd] show/" + pid, "→", r.status);
  if (r.page) {
    const props = r.page.props as Record<string, unknown>;
    console.log("[pd] props کلیدی:", Object.keys(props).join(","));
    // جستجوی فیلدهای حاوی نام/موبایل در کل props
    const found: Record<string, unknown> = {};
    const walk = (obj: unknown, prefix: string, depth: number) => {
      if (depth > 4 || obj === null || obj === undefined) return;
      if (Array.isArray(obj)) { obj.slice(0, 2).forEach((x, i) => walk(x, `${prefix}[${i}]`, depth + 1)); return; }
      if (typeof obj === "object") {
        for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
          if (/phone|mobile|contact|name|customer/i.test(k) && (typeof v !== "object" || v === null)) {
            found[`${prefix}.${k}`] = typeof v === "string" ? v.slice(0, 60) : v;
          }
          walk(v, `${prefix}.${k}`, depth + 1);
        }
      }
    };
    walk(props, "props", 0);
    console.log("[pd] فیلدهای نام/تماس:", JSON.stringify(found).slice(0, 800));
    writeFileSync("download/pn055/potential-show-props.json", JSON.stringify(props, null, 2));
  }
  await sleep(800);
}

// ۲) getMyRelatedFilings
{
  const r = await getPage(`/Potentials/getMyRelatedFilings/${pid}`);
  console.log("[pd] getMyRelatedFilings →", r.status);
  if (r.page) {
    const props = r.page.props as Record<string, unknown>;
    console.log("[pd] props کلیدی:", Object.keys(props).join(","));
    writeFileSync("download/pn055/potential-related-filings.json", JSON.stringify(props, null, 2));
  } else if (r.status === 200) {
    // ممکن است JSON خام باشد
  }
  await sleep(800);
}

// ۳) پوشش جستجو — کلمهٔ «در» (بسیار رایج در potentialName فارسی) چند نتیجه می‌دهد؟
{
  const r = await getPage("/Potentials/search/در/1");
  if (r.page) {
    const props = r.page.props as Record<string, unknown>;
    const pots = props.potentials as { data?: unknown[]; total?: number; last_page?: number } | undefined;
    console.log("[pd] search/در → rows:", pots?.data?.length, "· total:", pots?.total, "· lastPage:", pots?.last_page);
    if (pots?.data?.[0]) console.log("[pd] نمونهٔ اول:", JSON.stringify(pots.data[0], ensure_ascii=False).slice(0, 250));
  } else console.log("[pd] search/در →", r.status);
}

console.log("[pd] ✅ پایان");
process.exit(0);
