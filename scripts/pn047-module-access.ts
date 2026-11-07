/**
 * PN-047/گام اول-۳ — آزمون دسترسی ماژول‌های کشف‌شده (specialists/valuations ·
 * contacts · leads · MelketunPublicFilingPlus · admin/*)
 * + پروفایل کامل: آیا Sarmasti اکنون ادمین است؟
 */
import fs from "fs";
import path from "path";

const SECRET_FILE = path.join(process.cwd(), "upload/.runtime/melketun-secrets.json");
const OUT = path.join(process.cwd(), "download/pn047/module-access.log");

interface MelketunSecrets {
  crm: { base_url: string; username: string; password: string };
}

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
  const log: string[] = [`# PN-047 module-access — ${new Date().toISOString()}`];

  // login تازه
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
  log.push(`login: ${lr.status}`);

  const probes: string[] = [
    "/specialists/valuations",
    "/specialists/services",
    "/contacts/all",
    "/contacts/filings",
    "/contacts/potentials",
    "/leads",
    "/leads/assigned",
    "/MelketunPublicFilingPlus",
    "/admin/branches",
    "/admin/users",
    "/admin/valuations",
    "/admin/announcements",
    "/admin",
    "/notifications",
    "/attendances",
    "/supports",
    "/supports/valuations/create",
    "/content_creations",
    "/mobile-app/download",
  ];

  for (const p of probes) {
    try {
      const r = await fetch(`${base}${p}`, {
        headers: { Cookie: cookieHeader(), Accept: "text/html" },
        redirect: "manual",
        signal: AbortSignal.timeout(20_000),
      });
      let extra = "";
      if (r.status === 200) {
        const html = await r.text();
        const inr = extractInertia(html);
        extra = ` · component=${inr?.component ?? "—(no-inertia)"}`;
        if (inr?.props) {
          const keys = Object.keys(inr.props);
          extra += ` · props=[${keys.join("|").slice(0, 200)}]`;
          // ذخیرهٔ صفحات پُر برای کاوش بعدی
          const safe = p.replace(/\//g, "_");
          fs.writeFileSync(path.join(process.cwd(), `download/pn047/probe-${safe}.html`), html, "utf-8");
        }
      } else {
        const loc = r.headers.get("location");
        if (loc) extra = ` · location=${loc}`;
      }
      log.push(`${p} → ${r.status}${extra}`);
    } catch (e) {
      log.push(`${p} → ERR ${e instanceof Error ? e.message.slice(0, 80) : "?"}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  fs.writeFileSync(OUT, log.join("\n"), "utf-8");
  console.log(log.join("\n"));
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
