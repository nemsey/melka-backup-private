/**
 * PN-047 — بررسی last_page اعلامی سرور در صفحهٔ ۳۳۸ + آزمون صفحات ۳۳۹-۳۴۵
 */
import fs from "fs";
import path from "path";

const SECRET_FILE = path.join(process.cwd(), "upload/.runtime/melketun-secrets.json");

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

  // متادیتای صفحهٔ ۳۳۸
  const r338 = await fetch(`${base}/PublicPotentials/338`, { headers: { Cookie: cookieHeader() }, redirect: "manual", signal: AbortSignal.timeout(30_000) });
  console.log(`page 338 → ${r338.status}`);
  if (r338.status === 200) {
    const inr = extractInertia(await r338.text());
    const potentials = inr?.props?.potentials as { meta?: Record<string, unknown>; data?: unknown[] } | undefined;
    console.log("meta:", JSON.stringify(potentials?.meta ?? {}).slice(0, 500));
    console.log("rows on page:", potentials?.data?.length ?? 0);
  }
  await new Promise((r) => setTimeout(r, 1500));

  for (const p of [339, 340, 345, 350, 360, 400]) {
    const r = await fetch(`${base}/PublicPotentials/${p}`, { headers: { Cookie: cookieHeader() }, redirect: "manual", signal: AbortSignal.timeout(25_000) });
    let extra = "";
    if (r.status === 200) {
      const inr = extractInertia(await r.text());
      const potentials = inr?.props?.potentials as { data?: unknown[]; meta?: { total?: number; last_page?: number } } | undefined;
      extra = ` · rows=${potentials?.data?.length ?? "—"} · total=${potentials?.meta?.total ?? "—"} · last_page=${potentials?.meta?.last_page ?? "—"}`;
    }
    console.log(`page ${p} → ${r.status}${extra}`);
    await new Promise((res) => setTimeout(res, 1500));
  }
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
