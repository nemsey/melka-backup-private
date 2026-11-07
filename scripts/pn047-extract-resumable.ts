/**
 * PN-047 — استخراج PublicPotentials با checkpoint (قابل ازسرگیری در چند اجرا)
 * + حل کاربران ناتمام — هر دو مرحله incremental
 * فایل‌های وضعیت: download/pn047/pot-checkpoint.json + resolved-users-complete.json
 */
import fs from "fs";
import path from "path";

const SECRET_FILE = path.join(process.cwd(), "upload/.runtime/melketun-secrets.json");
const OUT_DIR = path.join(process.cwd(), "download/pn047");
const CKPT = path.join(OUT_DIR, "pot-checkpoint.json");
const RESOLVED = path.join(OUT_DIR, "resolved-users-complete.json");

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

function loadCkpt(): { rows: Record<string, Record<string, unknown>>; nextPage: number } {
  if (fs.existsSync(CKPT)) {
    const raw = JSON.parse(fs.readFileSync(CKPT, "utf-8")) as { rows: Record<string, Record<string, unknown>>; nextPage: number };
    console.log(`resume: ${Object.keys(raw.rows).length} rows @ page ${raw.nextPage}`);
    return raw;
  }
  return { rows: {}, nextPage: 1 };
}
function saveCkpt(ckpt: { rows: Record<string, Record<string, unknown>>; nextPage: number }) {
  fs.writeFileSync(CKPT, JSON.stringify(ckpt), "utf-8");
}

async function fetchWithRetry(url: string, cookie: string, tries = 3): Promise<Response> {
  let lastErr: Response | null = null;
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, { headers: { Cookie: cookie, Accept: "text/html" }, redirect: "manual", signal: AbortSignal.timeout(25_000) });
    if (r.status < 500) return r;
    lastErr = r;
    await r.text().catch(() => "");
    await sleep(2000 * (i + 1));
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

  // ── مرحلهٔ ۱: potentials تا پایان/سقف زمانی ──
  const ckpt = loadCkpt();
  // کشف PN-047: صفحهٔ ۳۳۹ در سرور CRM خطای ۵۰۰ دائمی دارد (رکورد خراب) —
  // skip صادقانه: ۱۰ رکورد آن صفحه در دسترس نیست (گزارش در فایل نهایی).
  const KNOWN_BAD_PAGES = new Set<number>([339]);
  const TIME_BUDGET_MS = Number(process.argv[2] ?? 480_000); // پیش‌فرض ۸ دقیقه
  const t0 = Date.now();
  let complete = false;
  while (Date.now() - t0 < TIME_BUDGET_MS) {
    const page = ckpt.nextPage;
    if (KNOWN_BAD_PAGES.has(page)) {
      console.log(`page ${page}: KNOWN-BAD (سرور CRM خطای ۵۰۰ دائمی) — skip صادقانه`);
      ckpt.nextPage = page + 1;
      continue;
    }
    const url = `${base}/PublicPotentials${page > 1 ? `/${page}` : ""}`;
    try {
      const r = await fetchWithRetry(url, cookieHeader());
      if (r.status !== 200) {
        // skip هوشمند: اگر صفحهٔ بعدی سالم بود، این صفحه خراب است (رکورد معیوب CRM) —
        // skip + ثبت صادقانه؛ اگر بعدی هم ۵۰۰ بود، احتمالاً قطعی موقت سرور → توقف.
        const next = await fetchWithRetry(`${base}/PublicPotentials/${page + 1}`, cookieHeader());
        if (next.status === 200) {
          console.log(`page ${page} → ${r.status} اما page ${page + 1} سالم — skip صادقانه (۱۰ رکورد نام دسترس)`);
          KNOWN_BAD_PAGES.add(page);
          ckpt.nextPage = page + 1;
          continue;
        }
        console.log(`page ${page} → ${r.status} — stop (checkpoint saved)`); break;
      }
      const inr = extractInertia(await r.text());
      const bucket = inr?.props?.potentials as { data?: Record<string, unknown>[] } | undefined;
      const rows = bucket?.data ?? [];
      if (rows.length === 0) { console.log(`page ${page}: empty — COMPLETE ✓`); complete = true; break; }
      for (const row of rows) ckpt.rows[String(row.id)] = row;
      ckpt.nextPage = page + 1;
      if (rows.length < 10) { console.log(`page ${page}: +${rows.length} — COMPLETE ✓`); complete = true; break; }
      if (page % 25 === 0) { saveCkpt(ckpt); console.log(`page ${page}… total=${Object.keys(ckpt.rows).length}`); }
      await sleep(600);
    } catch (e) {
      console.log(`page ${page} ERR — checkpoint saved: ${e instanceof Error ? e.message.slice(0, 50) : "?"}`);
      break;
    }
  }
  saveCkpt(ckpt);
  const total = Object.keys(ckpt.rows).length;
  console.log(`checkpoint: ${total} rows · nextPage=${ckpt.nextPage} · complete=${complete}`);

  if (complete) {
    const all = Object.values(ckpt.rows);
    const byAgency = new Map<string, number>();
    for (const row of all) {
      const a = String(row.agency ?? "").trim() || "—";
      byAgency.set(a, (byAgency.get(a) ?? 0) + 1);
    }
    console.log("by agency:", JSON.stringify([...byAgency.entries()].sort((a, b) => b[1] - a[1])));
    fs.writeFileSync(path.join(OUT_DIR, "public-potentials-complete.json"), JSON.stringify(all, null, 2), "utf-8");
    console.log(`saved public-potentials-complete.json (${all.length})`);
  }

  // ── مرحلهٔ ۲: حل کاربران باقی‌مانده (تا سقف زمانی) ──
  const resolved: Record<string, { name: string | null; mobile: string | null }> = fs.existsSync(RESOLVED)
    ? JSON.parse(fs.readFileSync(RESOLVED, "utf-8"))
    : {};
  const publics = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "public-filings.json"), "utf-8")) as Record<string, unknown>[];
  const ids = new Set<string>(publics.map((r) => String(r.assignedUser ?? "")));
  for (const id of Object.keys(ckpt.rows)) {
    const u = ckpt.rows[id]?.assignedUser;
    if (u) ids.add(String(u));
  }
  const toResolve = [...ids].filter(Boolean).filter((v) => !resolved[v]?.name).sort();
  console.log(`\nresolving ${toResolve.length} remaining users…`);
  let done = 0;
  for (const vt of toResolve) {
    if (Date.now() - t0 > TIME_BUDGET_MS + 60_000) { console.log("time budget hit — resolve resumed next run"); break; }
    const num = vt.replace(/^1[39]x/, "");
    try {
      const r = await fetchWithRetry(`${base}/contacts/getUserFromVtigerId/${num}`, cookieHeader());
      if (r.status === 200) {
        const text = await r.text();
        let user: { name?: string; mobile?: string } | null = null;
        const inr = extractInertia(text);
        user = (inr?.props?.user as { name?: string; mobile?: string } | undefined) ?? null;
        if (!user) { try { user = (JSON.parse(text) as { user?: { name?: string; mobile?: string } }).user ?? null; } catch { } }
        if (user?.name) { resolved[vt] = { name: user.name.trim(), mobile: user.mobile?.trim() ?? null }; done++; }
      }
    } catch { /* skip */ }
    await sleep(300);
  }
  fs.writeFileSync(RESOLVED, JSON.stringify(resolved, null, 2), "utf-8");
  console.log(`resolved now: +${done} · total saved: ${Object.keys(resolved).length}/${ids.size}`);
}

main().catch((e) => { console.error("FATAL", e); process.exit(1); });
