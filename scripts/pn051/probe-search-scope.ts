// ============================================================================
// PN-051 — آیا Potentials/search جهانی است؟ (تمام رکوردهای همهٔ شعب را می‌دهد؟)
// تست: جست‌وجوی واژهٔ همگانی «درخواست» + کدِ درخواستِ کاربرِ دیگر
// اجرا: bun scripts/pn051/probe-search-scope.ts
// ============================================================================
import { crmLogin } from "@/lib/integrations/melketun/sync";
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

async function searchPotentials(base: string, jar: { header(): string }, kw: string, page = 1) {
  const url = `${base}/Potentials/search/${encodeURIComponent(kw)}${page > 1 ? `/${page}` : ""}`;
  const res = await fetch(url, {
    headers: { Cookie: jar.header(), Accept: "text/html" },
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status !== 200) return { status: res.status, rows: [] as Record<string, unknown>[] };
  const props = extractProps(await res.text());
  const rows = ((props?.potentials as any)?.data ?? []) as Record<string, unknown>[];
  return { status: res.status, rows };
}

async function main() {
  const errors: string[] = [];
  const base = secrets.crm.base_url;
  const jar = await crmLogin(base, secrets.crm.username, secrets.crm.password, errors);
  console.log("[pn051] login ok:", errors.length === 0);

  // ── تست ۱: جست‌وجوی کد درخواستِ کاربر دیگر (آسمان تبریز — POT4464) ──
  const byCode = await searchPotentials(base, jar, "POT4464");
  console.log(`\n== search POT4464 → HTTP ${byCode.status} rows=${byCode.rows.length}`);
  if (byCode.rows.length) console.log(JSON.stringify(byCode.rows[0], null, 1).slice(0, 600));

  // ── تست ۲: جست‌وجوی واژهٔ همگانی «درخواست» — ۳ صفحه ──
  const allRows: Record<string, unknown>[] = [];
  for (let page = 1; page <= 3; page++) {
    const r = await searchPotentials(base, jar, "درخواست", page);
    console.log(`page ${page} → HTTP ${r.status} rows=${r.rows.length}`);
    if (!r.rows.length) break;
    allRows.push(...r.rows);
    if (r.rows.length < 10) break;
    await new Promise((res) => setTimeout(res, 400));
  }
  const stats = { total: allRows.length, withName: 0, users: {} as Record<string, number>, agencies: {} as Record<string, number>, codes: [] as string[] };
  for (const r of allRows) {
    if (String(r.contactName ?? "").trim()) stats.withName++;
    const u = String(r.assignedUser ?? "?"); stats.users[u] = (stats.users[u] ?? 0) + 1;
    const a = String(r.agency ?? "?"); stats.agencies[a] = (stats.agencies[a] ?? 0) + 1;
    if (stats.codes.length < 12) stats.codes.push(String(r.code));
  }
  console.log(`\n== search «درخواست» ۳ صفحه: rows=${stats.total} withContactName=${stats.withName}`);
  console.log("assignedUsers:", JSON.stringify(stats.users));
  console.log("agencies:", JSON.stringify(stats.agencies));
  console.log("codes sample:", stats.codes.join(", "));

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
