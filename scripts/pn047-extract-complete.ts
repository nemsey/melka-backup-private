/**
 * PN-047/نهایی — استخراج کامل PublicPotentials با نرخ‌مؤدبانه (700ms) + retry روی 500
 * + تکمیل حل کاربران ناتمام (56/68)
 * خروجی: download/pn047/public-potentials-complete.json + resolved-users-complete.json
 */
import fs from "fs";
import path from "path";

const SECRET_FILE = path.join(process.cwd(), "upload/.runtime/melketun-secrets.json");
const OUT_DIR = path.join(process.cwd(), "download/pn047");

interface MelketunSecrets { crm: { base_url: string; username: string; password: string } }

function unescapeHtml(s: string): string {
  return s.replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function extractInertia(html: string): { props?: Record<string, unknown> } | null {
  const m = html.match(/<div[^>]*id="app"[^>]*data-page="([^"]*)"/);
  if (!m) return null;
  try { return JSON.parse(unescapeHtml(m[1])); } catch { return null; }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(url: string, cookie: string, tries = 4): Promise<Response> {
  let lastErr: Response | null = null;
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, { headers: { Cookie: cookie, Accept: "text/html" }, redirect: "manual", signal: AbortSignal.timeout(30_000) });
    if (r.status < 500) return r;
    lastErr = r;
    await r.text().catch(() => "");
    await sleep(2500 * (i + 1)); // backoff مؤدبانه
  }
  return lastErr!;
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

  // ── ۱) PublicPotentials کامل ──
  const merged = new Map<string, Record<string, unknown>>();
  for (let page = 1; page <= 600; page++) {
    const url = `${base}/PublicPotentials${page > 1 ? `/${page}` : ""}`;
    try {
      const r = await fetchWithRetry(url, cookieHeader());
      if (r.status !== 200) { console.log(`page ${page} → ${r.status} (stop after retries)`); break; }
      const inr = extractInertia(await r.text());
      const bucket = inr?.props?.potentials as { data?: Record<string, unknown>[] } | undefined;
      const rows = bucket?.data ?? [];
      if (rows.length === 0) { console.log(`page ${page}: empty (end)`); break; }
      for (const row of rows) merged.set(String(row.id), row);
      if (rows.length < 10) { console.log(`page ${page}: +${rows.length} (last)`); break; }
      if (page % 20 === 0) console.log(`page ${page}… merged=${merged.size}`);
      await sleep(700);
    } catch (e) {
      console.log(`page ${page} ERR: ${e instanceof Error ? e.message.slice(0, 60) : "?"} — stop`);
      break;
    }
  }
  const all = [...merged.values()];
  console.log(`\nPublicPotentials COMPLETE: ${all.length} unique`);
  const byAgency = new Map<string, number>();
  for (const row of all) {
    const a = String(row.agency ?? "").trim() || "—";
    byAgency.set(a, (byAgency.get(a) ?? 0) + 1);
  }
  console.log("by agency:", JSON.stringify([...byAgency.entries()].sort((a, b) => b[1] - a[1])));
  fs.writeFileSync(path.join(OUT_DIR, "public-potentials-complete.json"), JSON.stringify(all, null, 2), "utf-8");

  // ── ۲) تکمیل حل کاربران ──
  const prevResolvedPath = path.join(OUT_DIR, "resolved-users.json");
  const resolved: Record<string, { name: string | null; mobile: string | null }> = fs.existsSync(prevResolvedPath)
    ? JSON.parse(fs.readFileSync(prevResolvedPath, "utf-8"))
    : {};
  const publics = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "public-filings.json"), "utf-8")) as Record<string, unknown>[];
  const ids = new Set<string>([
    ...publics.map((r) => String(r.assignedUser ?? "")),
    ...all.map((r) => String(r.assignedUser ?? "")),
  ]);
  const toResolve = [...ids].filter(Boolean).filter((v) => !resolved[v]?.name).sort();
  console.log(`\nresolving ${toResolve.length} remaining users…`);
  for (const vt of toResolve) {
    const num = vt.replace(/^1[39]x/, "");
    try {
      const r = await fetchWithRetry(`${base}/contacts/getUserFromVtigerId/${num}`, cookieHeader());
      if (r.status === 200) {
        const text = await r.text();
        let user: { name?: string; mobile?: string } | null = null;
        const inr = extractInertia(text);
        user = (inr?.props?.user as { name?: string; mobile?: string } | undefined) ?? null;
        if (!user) { try { user = (JSON.parse(text) as { user?: { name?: string; mobile?: string } }).user ?? null; } catch { } }
        if (user) {
          resolved[vt] = { name: user.name?.trim() ?? null, mobile: user.mobile?.trim() ?? null };
          console.log(`  ${vt} → ${user.name?.trim() ?? "?"}`);
        }
      } else {
        console.log(`  ${vt} → ${r.status} (skip)`);
      }
    } catch (e) {
      console.log(`  ${vt} ERR`);
    }
    await sleep(350);
  }
  fs.writeFileSync(path.join(OUT_DIR, "resolved-users-complete.json"), JSON.stringify(resolved, null, 2), "utf-8");
  console.log(`\nresolved total: ${Object.keys(resolved).length}/${ids.size}`);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
