// ============================================================================
// PN-051 — کاوش صفحات عمیق PublicPotentials: contactName در کدام صفحات هست؟
// اجرا: bun scripts/pn051/probe-deep-pages.ts
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

async function fetchPageRows(base: string, jar: { header(): string }, page: number) {
  const url = `${base}/PublicPotentials${page > 1 ? `/${page}` : ""}`;
  const res = await fetch(url, {
    headers: { Cookie: jar.header(), Accept: "text/html" },
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  if (res.status !== 200) return { status: res.status, rows: [] };
  const props = extractProps(await res.text());
  const rows = ((props?.potentials as any)?.data ?? []) as Record<string, unknown>[];
  return { status: res.status, rows };
}

async function main() {
  const errors: string[] = [];
  const base = secrets.crm.base_url;
  const jar = await crmLogin(base, secrets.crm.username, secrets.crm.password, errors);
  console.log("[pn051] login ok:", errors.length === 0);

  // نمونه‌گیری از صفحات عمیق: هر صفحه ~۱۰ رکورد
  const pages = [26, 30, 40, 50, 60, 80, 100, 130, 160, 200, 240, 280, 320, 360, 390, 400];
  for (const page of pages) {
    const { status, rows } = await fetchPageRows(base, jar, page);
    if (status !== 200) { console.log(`page ${page}: HTTP ${status}`); continue; }
    const withName = rows.filter((r) => String(r.contactName ?? "").trim()).length;
    const codes = rows.map((r) => String(r.code ?? ""));
    const withNameCodes = rows.filter((r) => String(r.contactName ?? "").trim()).map((r) => `${r.code}→${r.contactName}`);
    console.log(`page ${page}: rows=${rows.length} withName=${withName} codes[${codes[0]}..${codes[codes.length - 1]}]${withName > 0 ? " samples: " + withNameCodes.slice(0, 3).join(" | ") : ""}`);
    await new Promise((res) => setTimeout(res, 350));
  }

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
