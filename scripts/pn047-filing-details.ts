/**
 * PN-047 — آزمون show/{id} برای جزئیات کامل آگهی عمومی (مالک/موبایل/آدرس/GPS)
 * + استخراج کامل لیست specialists (کارشناسان M10)
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

  // ── ۱) show/{id} برای چند آگهی عمومی (از دو شعبه) ──
  const publics = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "public-filings.json"), "utf-8")) as Record<string, unknown>[];
  const ranzhad = publics.find((r) => String(r.agency).includes("رضانژاد"))!;
  const asman = publics.find((r) => String(r.agency).includes("آسمان"))!;
  for (const f of [ranzhad, asman]) {
    const id = String(f.id);
    const r = await fetch(`${base}/Melketunfilingplus/show/${id}`, {
      headers: { Cookie: cookieHeader(), Accept: "text/html" },
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
    console.log(`\nshow/${id} (${f.code} · ${f.agency}) → ${r.status}`);
    if (r.status === 200) {
      const inr = extractInertia(await r.text());
      console.log(`component: ${inr?.component}`);
      if (inr?.props) {
        for (const [k, v] of Object.entries(inr.props)) {
          if (k === "auth" || k === "errors" || k === "quote" || k === "name") continue;
          console.log(`  ${k}: ${JSON.stringify(v, ensure_ascii=False => undefined).slice(0, 800)}`);
        }
      }
    } else {
      const loc = r.headers.get("location");
      if (loc) console.log(`  location: ${loc}`);
    }
    await new Promise((res) => setTimeout(res, 300));
  }

  // ── ۲) استخراج کامل specialists از supports/valuations/create ──
  const sc = await fetch(`${base}/supports/valuations/create`, {
    headers: { Cookie: cookieHeader(), Accept: "text/html" },
    redirect: "manual", signal: AbortSignal.timeout(30_000),
  });
  const inr = extractInertia(await sc.text());
  const specialists = (inr?.props?.specialists as { data?: { id: number; name: string }[] })?.data ?? [];
  console.log(`\nspecialists: ${specialists.length}`);
  fs.writeFileSync(path.join(OUT_DIR, "specialists.json"), JSON.stringify(specialists, null, 2), "utf-8");
  console.log(JSON.stringify(specialists.slice(0, 10), null, 1));

  // ── ۳) myFilings از همان صفحه (آگهی‌های اختصاص‌یافته با مالک/موبایل/آدرس/GPS) ──
  const myFilings = (inr?.props?.myFilings as { data?: Record<string, unknown>[] })?.data ?? [];
  console.log(`\nmyFilings: ${myFilings.length}`);
  fs.writeFileSync(path.join(OUT_DIR, "my-filings-full.json"), JSON.stringify(myFilings, null, 2), "utf-8");
  if (myFilings.length > 0) console.log(JSON.stringify(myFilings[0], ensure_ascii=False ?? undefined).slice(0, 400));
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
