// ============================================================================
// PN-051 — پوشش contactName در PublicPotentials احراز‌شده + کاوش contacts/all
// و Potentials/search — فقط GET · فقط-خواندنی
// اجرا: bun scripts/pn051/probe-public-coverage.ts
// ============================================================================
import { crmLogin, fetchModule } from "@/lib/integrations/melketun/sync";
import fs from "fs";
import path from "path";

const SECRET_FILE = path.join(process.cwd(), "upload/.runtime/melketun-secrets.json");
const secrets = JSON.parse(fs.readFileSync(SECRET_FILE, "utf8")) as {
  crm: { base_url: string; username: string; password: string };
};

function extractProps(html: string): Record<string, unknown> | null {
  const unescape = (s: string) =>
    s.replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const m = html.match(/<div[^>]*id="app"[^>]*data-page="([^"]*)"/);
  if (!m) return null;
  try {
    const page = JSON.parse(unescape(m[1])) as { props?: Record<string, unknown>; component?: string };
    if (page.component?.startsWith("errors/")) return null;
    return page.props ?? null;
  } catch {
    return null;
  }
}

async function rawGet(base: string, jar: { header(): string }, p: string) {
  const res = await fetch(`${base}${p}`, {
    headers: { Cookie: jar.header(), Accept: "text/html,application/json" },
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  return { status: res.status, text };
}

async function main() {
  const errors: string[] = [];
  const base = secrets.crm.base_url;
  const jar = await crmLogin(base, secrets.crm.username, secrets.crm.password, errors);
  console.log("[pn051] login ok:", errors.length === 0);

  // ── ۱) PublicPotentials احراز‌شده: ۲۵ صفحهٔ نخست (۲۵۰ رکورد) — پوشش contactName ──
  console.log("[pn051] fetching PublicPotentials pages 1-25…");
  const pubRows: Record<string, unknown>[] = [];
  for (let page = 1; page <= 25; page++) {
    const r = await rawGet(base, jar, `/PublicPotentials${page > 1 ? `/${page}` : ""}`);
    if (r.status !== 200) { console.log(`page ${page} → HTTP ${r.status}; stopping`); break; }
    const props = extractProps(r.text);
    const rows = ((props?.potentials as any)?.data ?? []) as Record<string, unknown>[];
    if (!rows.length) { console.log(`page ${page} → empty; stopping`); break; }
    pubRows.push(...rows);
    if (rows.length < 10) break;
    await new Promise((res) => setTimeout(res, 350));
  }
  console.log("[pn051] fetched rows:", pubRows.length);
  const pub = { rows: pubRows };
  let withName = 0, withMobile = 0;
  const keys = new Set<string>();
  const nameSamples: string[] = [];
  for (const r of pub.rows) {
    for (const k of Object.keys(r)) keys.add(k);
    if (String(r.contactName ?? "").trim()) { withName++; if (nameSamples.length < 5) nameSamples.push(String(r.contactName)); }
    if (String((r as any).contactMobile ?? "").trim()) withMobile++;
  }
  console.log(`\n== authenticated /PublicPotentials: rows=${pub.rows.length}`);
  console.log("keys:", [...keys].sort().join(", "));
  console.log(`withContactName: ${withName}/${pub.rows.length} (${(100 * withName / pub.rows.length).toFixed(1)}%)`);
  console.log(`withContactMobile: ${withMobile}/${pub.rows.length}`);
  console.log("name samples:", nameSamples.join(" · "));

  // ── ۲) contacts/all ──
  const r1 = await rawGet(base, jar, "/contacts/all");
  const p1 = r1.status === 200 ? extractProps(r1.text) : null;
  console.log(`\n== contacts/all → HTTP ${r1.status}`);
  if (p1) {
    console.log("props keys:", Object.keys(p1).join(", "));
    const c = p1.contacts as any;
    const rows = c?.data ?? c ?? [];
    console.log("rows:", Array.isArray(rows) ? rows.length : typeof rows);
    if (Array.isArray(rows) && rows.length) {
      console.log("sample:", JSON.stringify(rows.slice(0, 3), null, 1));
    }
  }

  // ── ۳) Potentials/search/آ (کیفیت scope جست‌وجو) ──
  const kw = encodeURIComponent("آپارتمان");
  const r2 = await rawGet(base, jar, `/Potentials/search/${kw}/1`);
  const p2 = r2.status === 200 ? extractProps(r2.text) : null;
  console.log(`\n== Potentials/search/آپارتمان → HTTP ${r2.status}`);
  if (p2) {
    console.log("props keys:", Object.keys(p2).join(", "));
    const pots = (p2.potentials as any)?.data ?? [];
    console.log("rows:", pots.length);
    if (pots.length) {
      const withN = pots.filter((x: any) => String(x.contactName ?? "").trim()).length;
      console.log(`withContactName: ${withN}/${pots.length}`);
      console.log("sample:", JSON.stringify(pots[0], null, 1).slice(0, 500));
    }
  }

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
