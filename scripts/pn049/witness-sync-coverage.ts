// ============================================================================
// PN-049/گام ۳ — شاهد کامل بودن بروزرسانی فهرست‌های ملکتون
// ============================================================================
// دو درخواست سبک (صفحهٔ ۱ هر نمای عمومی) → شمار کل رکوردهای نمای فعلی CRM؛
// مقایسه با پوشش رکوردهای به‌روز شده در DB (شاهد صداقت بروزرسانی).
// عین منطق sync.ts (login-store + X-XSRF-TOKEN + Inertia data-page) — صرفاً خواندنی.
// ============================================================================
import fs from "node:fs";

const secrets = JSON.parse(fs.readFileSync("upload/.runtime/melketun-secrets.json", "utf8"));
const base = secrets.crm.base_url.replace(/\/$/, "");

function unescapeHtml(s) {
  return s.replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function extractInertiaProps(html) {
  const m = html.match(/<div[^>]*id="app"[^>]*data-page="([^"]*)"/);
  if (!m) return null;
  try {
    const page = JSON.parse(unescapeHtml(m[1]));
    if (page.component?.startsWith("errors/")) return null;
    return page.props ?? null;
  } catch { return null; }
}

// ── login (عین crmLogin) ──
const jar = new Map();
function absorb(res) {
  const cookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [res.headers.get("set-cookie") ?? ""];
  for (const c of cookies) {
    const [pair] = c.split(";");
    if (!pair) continue;
    const idx = pair.indexOf("=");
    if (idx > 0) jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}
const loginPage = await fetch(`${base}/login`, { redirect: "follow", signal: AbortSignal.timeout(30000) });
absorb(loginPage);
const loginRes = await fetch(`${base}/login-store`, {
  method: "POST",
  headers: {
    "Content-Type": "application/x-www-form-urlencoded",
    Cookie: [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; "),
    "X-XSRF-TOKEN": decodeURIComponent(jar.get("XSRF-TOKEN") ?? ""),
    Accept: "application/json, text/html;q=0.9",
  },
  body: new URLSearchParams({ Username: secrets.crm.username, Password: secrets.crm.password }),
  redirect: "manual",
  signal: AbortSignal.timeout(30000),
});
absorb(loginRes);
console.log("login status:", loginRes.status);
const verify = await fetch(`${base}/dashboard`, { headers: { Cookie: [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ") }, redirect: "manual", signal: AbortSignal.timeout(30000) });
console.log("verify dashboard:", verify.status);

async function witnessView(path) {
  const res = await fetch(`${base}${path}`, { headers: { Cookie: [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; "), Accept: "text/html" }, redirect: "manual", signal: AbortSignal.timeout(30000) });
  if (res.status !== 200) return { status: res.status };
  const props = extractInertiaProps(await res.text());
  if (!props) return { status: 200, props: null };
  const keys = Object.keys(props);
  const out = { status: 200, propKeys: keys.slice(0, 8) };
  for (const k of keys) {
    const v = props[k];
    if (v && typeof v === "object" && "total" in (v as object)) {
      out.meta = { key: k, total: v.total, lastPage: v.last_page ?? null, perPage: v.per_page ?? null };
    }
  }
  return out;
}

const filingsView = await witnessView("/MelketunPublicFilingPlus");
console.log("filings view page1:", JSON.stringify(filingsView));
await new Promise((r) => setTimeout(r, 1500));
const potentialsView = await witnessView("/PublicPotentials");
console.log("potentials view page1:", JSON.stringify(potentialsView));

// شمارش دقیق: صفحه‌آخر هر نما برای یافتن total (صفحه‌آخر + باقیماندهٔ صفحه‌های قبل)
async function countView(path, propKey) {
  // جست‌وجوی دودویی برای آخرین صفحهٔ غیرخالی (هر صفحه ۱۰ رکورد)
  let rowsFirst = null;
  const r1 = await fetch(`${base}${path}`, { headers: { Cookie: [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; "), Accept: "text/html" }, redirect: "manual", signal: AbortSignal.timeout(30000) });
  if (r1.status === 200) {
    const props = extractInertiaProps(await r1.text());
    const bucket = props?.[propKey];
    if (bucket && typeof bucket === "object" && "data" in bucket) rowsFirst = bucket.data?.length ?? null;
    if (bucket && typeof bucket === "object" && "last_page" in bucket) return { totalViaLastPage: null, lastPage: bucket.last_page, rowsFirst };
  }
  return { rowsFirst };
}
console.log("filings page1 rows:", JSON.stringify(await countView("/MelketunPublicFilingPlus", "filings")));
await new Promise((r) => setTimeout(r, 1500));
console.log("potentials page1 rows:", JSON.stringify(await countView("/PublicPotentials", "potentials")));
