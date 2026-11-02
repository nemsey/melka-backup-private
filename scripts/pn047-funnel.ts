/**
 * PN-047 — کاوش funnel آگهی‌ها و پتانسیل‌ها (مراحل فروش vtiger → منبع احتمالی M9)
 * + بررسی وضعیت‌های potentials
 */
import fs from "fs";
import path from "path";

const SECRET_FILE = path.join(process.cwd(), "upload/.runtime/melketun-secrets.json");
const OUT_DIR = path.join(process.cwd(), "download/pn047");

interface MelketunSecrets { crm: { base_url: string; username: string; password: string } }

function unescapeHtml(s: string): string {
  return s.replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
function extractInertia(html: string): { component?: string; props?: Record<string, unknown> } | null {
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

  for (const p of [
    "/Melketunfilingplus/funnel",
    "/Potentials/funnel",
    "/contacts/filings/1",
    "/contacts/potentials/1",
  ]) {
    const r = await fetch(`${base}${p}`, {
      headers: { Cookie: cookieHeader(), Accept: "text/html" },
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
    console.log(`\n${p} → ${r.status}`);
    if (r.status === 200) {
      const html = await r.text();
      const inr = extractInertia(html);
      console.log(`component: ${inr?.component ?? "—"}`);
      if (inr?.props) {
        const dump: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(inr.props)) {
          if (k === "auth" || k === "errors" || k === "quote" || k === "name") continue;
          dump[k] = v;
          console.log(`  ${k}: ${JSON.stringify(v).slice(0, 700)}`);
        }
        const safe = p.replace(/\//g, "_");
        fs.writeFileSync(path.join(OUT_DIR, `funnel-${safe}.json`), JSON.stringify(dump, null, 2), "utf-8");
      }
    } else {
      const loc = r.headers.get("location");
      if (loc) console.log(`  location: ${loc}`);
    }
    await new Promise((res) => setTimeout(res, 300));
  }
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
