/**
 * PN-045 · فاز ۱.۳ — Dry-run فیلتر تبریز: تحلیل کل دادهٔ Filings/Potentials
 * ---------------------------------------------------------------------------
 * واکشی «تمام صفحات» هر دو ماژول (بدون نوشتن DB) و گزارش:
 *   · total fetched
 *   · توزیع agency (آژانس)
 *   · توزیع area/areas (محله)
 *   · شمارش tabriz-match با معیارهای چندگانه
 * صفر نوشتن — فقط تحلیل. Doctrine: no secrets in logs.
 */

import fs from "fs";
import path from "path";

const SECRET_FILE = path.join(process.cwd(), "upload/.runtime/melketun-secrets.json");
const REQUEST_TIMEOUT_MS = 30_000;
const PAGE_DELAY_MS = 300;
const MAX_PAGES = 100;

interface MelketunSecrets {
  crm: { base_url: string; username: string; password: string };
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
  return s.replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
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

async function fetchModule(
  baseUrl: string, jar: CookieJar, pagePath: (n: number) => string, propKey: string,
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await fetch(`${baseUrl}${pagePath(page)}`, {
      headers: { Cookie: jar.header(), Accept: "text/html" },
      redirect: "manual",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (res.status !== 200) break;
    const html = await res.text();
    const props = extractInertiaProps(html);
    if (!props) break;
    const bucket = props[propKey] as { data?: Record<string, unknown>[] } | undefined;
    const rows = Array.isArray(bucket?.data) ? bucket!.data : [];
    if (rows.length === 0) break;
    all.push(...rows);
    if (rows.length < 10) break;
    await new Promise((r) => setTimeout(r, PAGE_DELAY_MS));
  }
  return all;
}

function tally(values: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}

function printTally(label: string, m: Map<string, number>, top = 30) {
  const sorted = [...m.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`\n--- ${label} (${sorted.length} distinct) ---`);
  for (const [v, n] of sorted.slice(0, top)) console.log(`  ${n}× ${v}`);
  if (sorted.length > top) console.log(`  … و ${sorted.length - top} مقدار دیگر`);
}

async function main() {
  const secrets = JSON.parse(fs.readFileSync(SECRET_FILE, "utf8")) as MelketunSecrets;
  const base = secrets.crm.base_url.replace(/\/$/, "");
  const { username, password } = secrets.crm;
  const jar = new CookieJar();

  const loginPage = await fetch(`${base}/login`, { redirect: "follow", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  jar.absorb(loginPage);
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

  console.log("در حال واکشی تمام صفحات Filings…");
  const filings = await fetchModule(base, jar, (n) => `/Melketunfilingplus${n > 1 ? `/${n}` : ""}`, "filings");
  console.log("در حال واکشی تمام صفحات Potentials…");
  const potentials = await fetchModule(base, jar, (n) => `/Potentials${n > 1 ? `/${n}` : ""}`, "potentials");

  console.log(`\n=== TOTALS: filings=${filings.length} potentials=${potentials.length} ===`);

  // ── تحلیل Filings ──
  const fAgency = tally(filings.map((r) => String(r.agency ?? "∅")));
  const fArea = tally(filings.map((r) => String(r.area ?? "∅")));
  const fSource = tally(filings.map((r) => String(r.source ?? "∅")));
  printTally("FILINGS · agency", fAgency);
  printTally("FILINGS · area", fArea, 40);
  printTally("FILINGS · source", fSource, 10);

  // ── تحلیل Potentials ──
  const pAgency = tally(potentials.map((r) => String(r.agency ?? "∅")));
  const pAreas = new Map<string, number>();
  for (const r of potentials) {
    for (const a of String(r.areas ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
      pAreas.set(a, (pAreas.get(a) ?? 0) + 1);
    }
  }
  printTally("POTENTIALS · agency", pAgency);
  printTally("POTENTIALS · areas (split by comma)", pAreas, 40);

  // ── معیار تبریز ──
  // محله‌های شناخته‌شدهٔ تبریز (از نمونه‌ها) + واژهٔ تبریز
  const TABRIZ_WORDS = ["تبریز", "tabriz", "Tabriz"];
  const tabrizAgencyF = filings.filter((r) => TABRIZ_WORDS.some((w) => String(r.agency ?? "").includes(w))).length;
  const tabrizAgencyP = potentials.filter((r) => TABRIZ_WORDS.some((w) => String(r.agency ?? "").includes(w))).length;
  console.log(`\n=== FILTER SIMULATION ===`);
  console.log(`filings با agency شامل «تبریز»: ${tabrizAgencyF}/${filings.length}`);
  console.log(`potentials با agency شامل «تبریز»: ${tabrizAgencyP}/${potentials.length}`);
  const noAreaF = filings.filter((r) => !r.area || String(r.area).trim() === "").length;
  const noAreasP = potentials.filter((r) => !r.areas || String(r.areas).trim() === "").length;
  console.log(`filings بدون area: ${noAreaF}/${filings.length}`);
  console.log(`potentials بدون areas: ${noAreasP}/${potentials.length}`);

  // نمونه‌های ردیف با agency بدون واژهٔ تبریز (اگر هست)
  const oddF = filings.filter((r) => !TABRIZ_WORDS.some((w) => String(r.agency ?? "").includes(w)));
  if (oddF.length > 0) {
    console.log(`\n--- ⚠️ filings با agency بدون «تبریز» (${oddF.length}) — ۵ نمونه ---`);
    for (const r of oddF.slice(0, 5)) console.log(`  code=${r.code} agency=${r.agency} area=${r.area} source=${r.source}`);
  } else {
    console.log(`\n✅ هیچ filing با agency غیرتبریز یافت نشد`);
  }
  const oddP = potentials.filter((r) => !TABRIZ_WORDS.some((w) => String(r.agency ?? "").includes(w)));
  if (oddP.length > 0) {
    console.log(`\n--- ⚠️ potentials با agency بدون «تبریز» (${oddP.length}) — ۵ نمونه ---`);
    for (const r of oddP.slice(0, 5)) console.log(`  code=${r.code} agency=${r.agency} areas=${r.areas}`);
  } else {
    console.log(`✅ هیچ potential با agency غیرتبریز یافت نشد`);
  }
}

main().catch((e) => { console.log("FATAL:", e instanceof Error ? e.message : String(e)); process.exit(1); });
