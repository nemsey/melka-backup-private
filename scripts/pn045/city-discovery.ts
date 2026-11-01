/**
 * PN-045 · فاز ۱.۱ — کشف فیلد شهر در Filings/Potentials ملکتون
 * ---------------------------------------------------------------------------
 * ورود واقعی به CRM (عین منطق sync.ts — POST /login-store) و واکشی صفحهٔ ۱
 * از Filings و Potentials؛ چاپ «تمام کلیدها» + مقادیر نمونهٔ ۲ ردیف اول
 * برای شناسایی فیلد شهر/شعبه.
 * Doctrine: no secrets in logs — رمز هرگز چاپ نمی‌شود (قانون ۱۸).
 */

import fs from "fs";
import path from "path";

const SECRET_FILE = path.join(process.cwd(), "upload/.runtime/melketun-secrets.json");
const REQUEST_TIMEOUT_MS = 30_000;

interface MelketunSecrets {
  crm: { base_url: string; username: string; password: string };
  public: { base_url: string };
}

class CookieJar {
  private jar = new Map<string, string>();
  absorb(res: Response) {
    const rawList: string[] =
      typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : (res.headers.get("set-cookie") ?? "").split(/,(?=[^;]+=)/).filter(Boolean);
    for (const line of rawList) {
      const [pair] = line.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) this.jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  }
  header(): string {
    return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  decoded(name: string): string {
    const v = this.jar.get(name);
    if (!v) return "";
    try { return decodeURIComponent(v); } catch { return v; }
  }
}

function unescapeHtml(s: string): string {
  return s
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function extractInertiaProps(html: string): Record<string, unknown> | null {
  const m = html.match(/<div[^>]*id="app"[^>]*data-page="([^"]*)"/);
  if (!m) return null;
  try {
    const page = JSON.parse(unescapeHtml(m[1])) as { props?: Record<string, unknown>; component?: string };
    if (page.component?.startsWith("errors/")) return null;
    return page.props ?? null;
  } catch { return null; }
}

async function main() {
  const secrets = JSON.parse(fs.readFileSync(SECRET_FILE, "utf8")) as MelketunSecrets;
  const base = secrets.crm.base_url.replace(/\/$/, "");
  const { username, password } = secrets.crm;
  const jar = new CookieJar();

  // ۱) GET /login → کوکی‌های XSRF
  const loginPage = await fetch(`${base}/login`, { redirect: "follow", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  jar.absorb(loginPage);
  if (!loginPage.ok) { console.log(`ERR: GET /login → HTTP ${loginPage.status}`); process.exit(1); }

  // ۲) POST /login-store
  const body = new URLSearchParams({ Username: username, Password: password });
  const loginRes = await fetch(`${base}/login-store`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: jar.header(),
      "X-XSRF-TOKEN": jar.decoded("XSRF-TOKEN"),
      Accept: "application/json, text/html;q=0.9",
    },
    body,
    redirect: "manual",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  jar.absorb(loginRes);
  if (!(loginRes.status === 302 || loginRes.status === 303)) {
    console.log(`ERR: POST /login-store → HTTP ${loginRes.status}`); process.exit(1);
  }

  // ۳) واکشی صفحهٔ ۱ از هر دو ماژول
  for (const [label, pagePath, propKey] of [
    ["FILINGS", "/Melketunfilingplus", "filings"],
    ["POTENTIALS", "/Potentials", "potentials"],
  ] as const) {
    const res = await fetch(`${base}${pagePath}`, {
      headers: { Cookie: jar.header(), Accept: "text/html" },
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (res.status !== 200) { console.log(`${label}: HTTP ${res.status}`); continue; }
    const html = await res.text();
    const props = extractInertiaProps(html);
    if (!props) { console.log(`${label}: Inertia props not found`); continue; }
    const bucket = props[propKey] as { data?: Record<string, unknown>[] } | undefined;
    const rows = Array.isArray(bucket?.data) ? bucket!.data : [];
    console.log(`\n=== ${label} — rows on page 1: ${rows.length} ===`);
    if (rows.length > 0) {
      console.log(`--- ALL KEYS (row 1) ---`);
      console.log(Object.keys(rows[0]).join(" | "));
      // فیلدهای شهر/شعبه/منطقه/آدرس + نمونهٔ کامل ۲ ردیف
      for (let i = 0; i < Math.min(2, rows.length); i++) {
        console.log(`--- SAMPLE ROW ${i + 1} (★ = city/branch/region/address-related) ---`);
        for (const [k, v] of Object.entries(rows[i])) {
          const kl = k.toLowerCase();
          const isCity = ["city", "branch", "address", "region", "area", "state", "town", "location"].some((w) => kl.includes(w));
          console.log(`  ${isCity ? "★" : " "}${k} = ${JSON.stringify(v)}`);
        }
      }
    }
  }
}

main().catch((e) => { console.log("FATAL:", e instanceof Error ? e.message : String(e)); process.exit(1); });
