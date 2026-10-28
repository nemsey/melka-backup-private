/**
 * PN-047/گام اول-۳ — استخراج نقشهٔ کامل مسیرهای Ziggy از CRM ملکتون
 * + کاوش شعب (branch_id) + کاوش ماژول‌های vtiger
 */
import fs from "fs";
import path from "path";

const SECRET_FILE = path.join(process.cwd(), "upload/.runtime/melketun-secrets.json");
const OUT = path.join(process.cwd(), "download/pn047/ziggy-routes.json");

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

async function main() {
  const secrets = JSON.parse(fs.readFileSync(SECRET_FILE, "utf8")) as MelketunSecrets;
  const base = secrets.crm.base_url.replace(/\/$/, "");
  const jar = new CookieJar();

  const loginPage = await fetch(`${base}/login`, { redirect: "follow", signal: AbortSignal.timeout(30_000) });
  jar.absorb(loginPage);
  const body = new URLSearchParams({ Username: secrets.crm.username, Password: secrets.crm.password });
  await fetch(`${base}/login-store`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: jar.header(),
      "X-XSRF-TOKEN": jar.decoded("XSRF-TOKEN"),
    },
    body,
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  }).then((r) => jar.absorb(r));

  const dash = await fetch(`${base}/dashboard`, { headers: { Cookie: jar.header() }, redirect: "manual", signal: AbortSignal.timeout(30_000) });
  const html = await dash.text();

  // Ziggy route map — داخل اسکریپت صفحه
  const routeMatches = [...html.matchAll(/"uri"\s*:\s*"([^"]+)"/g)].map((m) => m[1]);
  const unique = [...new Set(routeMatches)].sort();
  fs.writeFileSync(OUT, JSON.stringify({ found: routeMatches.length, unique }, null, 2), "utf-8");

  console.log(`total uri refs: ${routeMatches.length} · unique: ${unique.length}`);
  console.log(unique.join("\n"));

  // ذخیرهٔ داشبورد HTML برای کاوش منو
  fs.writeFileSync(path.join(process.cwd(), "download/pn047/dashboard-auth.html"), html, "utf-8");

  // ذخیرهٔ session برای کاوش‌های بعدی
  fs.writeFileSync(path.join(process.cwd(), "upload/.runtime/melketun-session.cookies"), jar.header(), "utf-8");
  console.log("\n--- session cookies saved ---");
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
