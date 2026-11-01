/**
 * PN-047/گام اول-۳+۴ — کاوشگر CRM ملکتون با دسترسی ادمین تازهٔ مالک
 * ---------------------------------------------------------------------------
 * هدف:
 *   ۱) راستی‌آزمایی دسترسی ادمین (admin/* — قبلاً 403)
 *   ۲) کشف ماژول‌های معاملات/کارشناسان (M9/M10)
 *   ۳) کشف شعب ملکتون در سطح شهر تبریز (گام اول-۴)
 * Doctrine: no LLM، فقط خواندن، بدون تغییر در CRM، رمز هرگز چاپ نمی‌شود.
 */
import fs from "fs";
import path from "path";

const SECRET_FILE = path.join(process.cwd(), "upload/.runtime/melketun-secrets.json");
const OUT = path.join(process.cwd(), "download/pn047/recon-admin.log");

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

function extractInertia(html: string): { component?: string; props?: Record<string, unknown>; url?: string } | null {
  const m = html.match(/<div[^>]*id="app"[^>]*data-page="([^"]*)"/);
  if (!m) return null;
  try {
    return JSON.parse(unescapeHtml(m[1]));
  } catch {
    return null;
  }
}

async function main() {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const log: string[] = [`# PN-047 recon-admin — ${new Date().toISOString()}`];
  const secrets = JSON.parse(fs.readFileSync(SECRET_FILE, "utf8")) as MelketunSecrets;
  const base = secrets.crm.base_url.replace(/\/$/, "");
  const jar = new CookieJar();

  // ۱) login
  const loginPage = await fetch(`${base}/login`, { redirect: "follow", signal: AbortSignal.timeout(30_000) });
  jar.absorb(loginPage);
  const body = new URLSearchParams({ Username: secrets.crm.username, Password: secrets.crm.password });
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
    signal: AbortSignal.timeout(30_000),
  });
  jar.absorb(loginRes);
  log.push(`login-store: HTTP ${loginRes.status} ${loginRes.status === 302 ? "(OK)" : "(FAIL)"}`);

  const dash = await fetch(`${base}/dashboard`, { headers: { Cookie: jar.header() }, redirect: "manual", signal: AbortSignal.timeout(30_000) });
  log.push(`GET /dashboard: HTTP ${dash.status}`);
  const dashHtml = await dash.text();
  const inertia = extractInertia(dashHtml);
  log.push(`inertia component: ${inertia?.component ?? "—"}`);
  if (inertia?.props) {
    const keys = Object.keys(inertia.props);
    log.push(`dashboard props keys: ${keys.join(", ")}`);
    // auth.user — نقش فعلی
    const auth = inertia.props.auth as { user?: Record<string, unknown> } | undefined;
    if (auth?.user) {
      const safe = { ...auth.user };
      delete (safe as Record<string, unknown>).password;
      delete (safe as Record<string, unknown>).remember_token;
      log.push(`auth.user: ${JSON.stringify(safe)}`);
    }
  }
  // نقشهٔ مسیر Ziggy داخل صفحه
  const ziggyMatch = dashHtml.match(/const\s+routes\s*=\s*(\{.*?\});/s) ?? dashHtml.match(/"url":\s*"([^"]+)"/g);
  if (ziggyMatch) log.push(`ziggy snippet found: ${String(ziggyMatch[0]).slice(0, 200)}`);

  // ۲) تست مسیرهای ادمین (قبلاً 403 برای Sarmasti)
  const adminPaths = [
    "/admin", "/admin/dashboard", "/admins", "/settings", "/users", "/branches",
    "/agencies", "/agencies/list", "/specialists", "/valuations",
    "/Melketuntransaction", "/Melketuntransactions", "/transactions", "/transaction",
    "/Melketunfile", "/reports", "/calendars", "/customers", "/contacts",
    "/leaves", "/hours", "/meeting", "/targets", "/sales", "/invoices", "/products",
  ];
  for (const p of adminPaths) {
    try {
      const r = await fetch(`${base}${p}`, {
        headers: { Cookie: jar.header(), Accept: "text/html" },
        redirect: "manual",
        signal: AbortSignal.timeout(15_000),
      });
      let extra = "";
      if (r.status === 200) {
        const html = await r.text();
        const inr = extractInertia(html);
        extra = ` component=${inr?.component ?? "—"}`;
        if (inr?.props) extra += ` props=${Object.keys(inr.props).join("|").slice(0, 120)}`;
      }
      log.push(`PROBE ${p} → ${r.status}${extra}`);
    } catch (e) {
      log.push(`PROBE ${p} → ERR ${e instanceof Error ? e.message.slice(0, 60) : "?"}`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  fs.writeFileSync(OUT, log.join("\n"), "utf-8");
  console.log(log.join("\n"));
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
