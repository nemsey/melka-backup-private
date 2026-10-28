// ============================================================================
// PN-051 — نمای خصوصی Melketunfilingplus: فیلدهای مالک در دسترس؟
// اجرا: bun scripts/pn051/probe-private-filings.ts
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

async function main() {
  const errors: string[] = [];
  const base = secrets.crm.base_url;
  const jar = await crmLogin(base, secrets.crm.username, secrets.crm.password, errors);
  console.log("[pn051] login ok:", errors.length === 0);

  const res = await fetch(`${base}/Melketunfilingplus/1`, {
    headers: { Cookie: jar.header(), Accept: "text/html" },
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  console.log("private /Melketunfilingplus/1 → HTTP", res.status);
  const props = res.status === 200 ? extractProps(await res.text()) : null;
  if (props) {
    const rows = ((props.filings as any)?.data ?? []) as Record<string, unknown>[];
    console.log("rows:", rows.length);
    const keys = new Set<string>();
    for (const r of rows) for (const k of Object.keys(r)) keys.add(k);
    console.log("keys:", [...keys].sort().join(", "));
    if (rows.length) console.log("sample:", JSON.stringify(rows[0], null, 1).slice(0, 900));
  }

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
