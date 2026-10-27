/**
 * PN-047/گام اول-۴ — استخراج کامل MelketunPublicFilingPlus (نمای عمومی همهٔ شعب)
 * + شمارش به تفکیک آژانس/شعبه + مقایسه با filings خصوصی
 */
import fs from "fs";
import path from "path";

const SECRET_FILE = path.join(process.cwd(), "upload/.runtime/melketun-secrets.json");
const OUT_DIR = path.join(process.cwd(), "download/pn047");

interface MelketunSecrets { crm: { base_url: string; username: string; password: string } }

function unescapeHtml(s: string): string {
  return s.replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace("&amp;/g", "&");
}
function extractInertia(html: string): { props?: Record<string, unknown> } | null {
  const m = html.match(/<div[^>]*id="app"[^>]*data-page="([^"]*)"/);
  if (!m) return null;
  try {
    return JSON.parse(unescapeHtml(m[1].replace(/&amp;/g, "&")));
  } catch { return null; }
}

async function main() {
  const secrets = JSON.parse(fs.readFileSync(SECRET_FILE, "utf8")) as MelketunSecrets;
  const base = secrets.crm.base_url.replace(/\/$/, "");
  const jar = new Map<string, string>();
  const absorb = (res: Response) => {
    const rawList: string[] =
      typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : (res.headers.get("set-cookie") ?? "").split(/,(?=[^;]+=)/).filter(Boolean);
    for (const line of rawList) {
      const [pair] = line.split(";");
      const eq = pair.indexOf("=");
      if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
  };
  const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  const xsrf = () => { const v = jar.get("XSRF-TOKEN") ?? ""; try { return decodeURIComponent(v); } catch { return v; } };

  const lp = await fetch(`${base}/login`, { redirect: "follow", signal: AbortSignal.timeout(30_000) });
  absorb(lp);
  const body = new URLSearchParams({ Username: secrets.crm.username, Password: secrets.crm.password });
  const lr = await fetch(`${base}/login-store`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieHeader(), "X-XSRF-TOKEN": xsrf() },
    body, redirect: "manual", signal: AbortSignal.timeout(30_000),
  });
  absorb(lr);
  console.log(`login: ${lr.status}`);

  // ── نمای عمومی: همهٔ صفحات ──
  const allPublic: Record<string, unknown>[] = [];
  for (let page = 1; page <= 200; page++) {
    const url = `${base}/MelketunPublicFilingPlus${page > 1 ? `/${page}` : ""}`;
    const r = await fetch(url, { headers: { Cookie: cookieHeader(), Accept: "text/html" }, redirect: "manual", signal: AbortSignal.timeout(30_000) });
    if (r.status !== 200) { console.log(`page ${page} → ${r.status} (stop)`); break; }
    const inr = extractInertia(await r.text());
    const bucket = inr?.props?.filings as { data?: Record<string, unknown>[] } | undefined;
    const rows = bucket?.data ?? [];
    if (rows.length === 0) { console.log(`page ${page}: empty (end)`); break; }
    allPublic.push(...rows);
    console.log(`page ${page}: +${rows.length} (total ${allPublic.length})`);
    if (rows.length < 10) break;
    await new Promise((res) => setTimeout(res, 300));
  }

  // ── تحلیل به تفکیک آژانس ──
  const byAgency = new Map<string, number>();
  const byArea = new Map<string, number>();
  for (const row of allPublic) {
    const a = String(row.agency ?? "—").trim() || "—";
    byAgency.set(a, (byAgency.get(a) ?? 0) + 1);
    const ar = String(row.area ?? "").trim() || "—";
    byArea.set(ar, (byArea.get(ar) ?? 0) + 1);
  }
  console.log("\n── by agency ──");
  for (const [k, v] of [...byAgency.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
  console.log("── top areas ──");
  for (const [k, v] of [...byArea.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${k}: ${v}`);

  fs.writeFileSync(path.join(OUT_DIR, "public-filings.json"), JSON.stringify(allPublic, null, 2), "utf-8");
  console.log(`\nsaved ${allPublic.length} public filings → download/pn047/public-filings.json`);

  // ── comparison set: codes خصوصی ──
  const codes = new Set(allPublic.map((r) => String(r.code ?? r.id)));
  console.log(`unique codes: ${codes.size}`);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
