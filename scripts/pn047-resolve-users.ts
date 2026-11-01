/**
 * PN-047 — حل شناسه‌های vtiger کاربران (19x166 → نام) از دو مسیر شناخته‌شده
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

  // آزمون با چند شناسهٔ فعال
  for (const [pathT, label] of [
    ["/getConsultantNameAndNumber/166", "getConsultantNameAndNumber"],
    ["/contacts/getUserFromVtigerId/166", "getUserFromVtigerId"],
    ["/contacts/getUserNumber/166", "getUserNumber"],
  ] as [string, string][]) {
    const r = await fetch(`${base}${pathT}`, {
      headers: { Cookie: cookieHeader(), Accept: "application/json, text/html;q=0.9" },
      redirect: "manual",
      signal: AbortSignal.timeout(20_000),
    });
    const text = await r.text();
    let info = text.slice(0, 300);
    // شاید JSON باشد
    try { info = JSON.stringify(JSON.parse(text)).slice(0, 300); } catch { /* html */ }
    const inr = extractInertia(text);
    if (inr?.props) {
      const dump: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(inr.props)) {
        if (k === "auth" || k === "errors" || k === "quote" || k === "name") continue;
        dump[k] = v;
      }
      info = JSON.stringify(dump).slice(0, 400);
    }
    console.log(`${label} → ${r.status} · ${info}`);
    await new Promise((res) => setTimeout(res, 300));
  }
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
