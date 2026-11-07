/**
 * PN-047/گام اول-۴ — استخراج PublicPotentials (نمای عمومی درخواست‌های همهٔ شعب)
 * + حل نام/موبایل تمام کاربران فعال vtiger از آگهی‌های عمومی
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

  // ── ۱) PublicPotentials — همهٔ صفحات (سقف ۶۰۰ صفحه — کشف شعبهٔ سوم ۱۷ شهریور) ──
  const allPublic: Record<string, unknown>[] = [];
  for (let page = 1; page <= 600; page++) {
    const url = `${base}/PublicPotentials${page > 1 ? `/${page}` : ""}`;
    const r = await fetch(url, { headers: { Cookie: cookieHeader(), Accept: "text/html" }, redirect: "manual", signal: AbortSignal.timeout(30_000) });
    if (r.status !== 200) { console.log(`page ${page} → ${r.status} (stop)`); break; }
    const inr = extractInertia(await r.text());
    const bucket = inr?.props?.potentials as { data?: Record<string, unknown>[] } | undefined;
    const rows = bucket?.data ?? [];
    if (rows.length === 0) { console.log(`page ${page}: empty (end)`); break; }
    allPublic.push(...rows);
    if (rows.length < 10) { console.log(`page ${page}: +${rows.length} (end)`); break; }
    await new Promise((res) => setTimeout(res, 300));
  }
  console.log(`\nPublicPotentials total: ${allPublic.length}`);
  if (allPublic.length > 0) {
    console.log("sample:", JSON.stringify(allPublic[0]).slice(0, 400));
    const byAgency = new Map<string, number>();
    for (const row of allPublic) {
      const a = String(row.agency ?? "—").trim() || "—";
      byAgency.set(a, (byAgency.get(a) ?? 0) + 1);
    }
    console.log("by agency:", JSON.stringify([...byAgency.entries()].sort((a, b) => b[1] - a[1])));
  }
  fs.writeFileSync(path.join(OUT_DIR, "public-potentials.json"), JSON.stringify(allPublic, null, 2), "utf-8");
  console.log(`saved public-potentials.json (${allPublic.length})`);

  // ── ۲) حل نام/موبایل کاربران فعال vtiger ──
  const publics = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "public-filings.json"), "utf-8")) as Record<string, unknown>[];
  const vtigerIds = [...new Set(publics.map((r) => String(r.assignedUser ?? "")))].filter(Boolean).sort();
  const potIds = [...new Set(allPublic.map((r) => String(r.assignedUser ?? "")))].filter(Boolean);
  for (const v of potIds) if (!vtigerIds.includes(v)) vtigerIds.push(v);
  vtigerIds.sort();
  console.log(`\nresolving ${vtigerIds.length} vtiger users…`);
  const resolved: Record<string, { name: string | null; mobile: string | null }> = {};
  for (const vt of vtigerIds) {
    const num = vt.replace(/^19x/, "");
    try {
      const r = await fetch(`${base}/contacts/getUserFromVtigerId/${num}`, {
        headers: { Cookie: cookieHeader(), Accept: "application/json, text/html;q=0.9" },
        redirect: "manual",
        signal: AbortSignal.timeout(20_000),
      });
      if (r.status === 200) {
        const text = await r.text();
        const inr = extractInertia(text);
        const user = (inr?.props?.user as { name?: string; mobile?: string } | undefined) ?? null;
        if (user) {
          resolved[vt] = { name: user.name?.trim() ?? null, mobile: user.mobile?.trim() ?? null };
          console.log(`  ${vt} → ${user.name?.trim()} (${user.mobile ?? "—"})`);
        } else {
          // شاید JSON خام
          try {
            const j = JSON.parse(text) as { user?: { name?: string; mobile?: string } };
            if (j.user) {
              resolved[vt] = { name: j.user.name?.trim() ?? null, mobile: j.user.mobile?.trim() ?? null };
              console.log(`  ${vt} → ${j.user.name} (json)`);
            }
          } catch { console.log(`  ${vt} → 200 but no user prop`); }
        }
      } else {
        console.log(`  ${vt} → ${r.status}`);
      }
    } catch (e) {
      console.log(`  ${vt} → ERR ${e instanceof Error ? e.message.slice(0, 40) : "?"}`);
    }
    await new Promise((res) => setTimeout(res, 200));
  }
  fs.writeFileSync(path.join(OUT_DIR, "resolved-users.json"), JSON.stringify(resolved, null, 2), "utf-8");
  console.log(`resolved: ${Object.keys(resolved).length}/${vtigerIds.length}`);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
