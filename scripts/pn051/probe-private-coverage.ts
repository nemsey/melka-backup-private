// ============================================================================
// PN-051/گام دوم — کاوش پوشش نمای خصوصی Potentials + contacts/potentials
// سؤال کلیدی: نمای خصوصی چند رکورد می‌دهد؟ scope خودِ کاربر یا شعبه یا همه؟
// فقط GET · فقط-خواندنی
// اجرا: bun scripts/pn051/probe-private-coverage.ts
// ============================================================================
import { crmLogin, fetchModule } from "@/lib/integrations/melketun/sync";
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

  // ── ۱) نمای خصوصی Potentials: صفحات ۱-۱۲ (حتی‌العمل ۱۲۰ رکورد) ──
  const priv = await fetchModule(base, jar, (n) => `/Potentials${n > 1 ? `/${n}` : ""}`, "potentials", errors);
  console.log(`\n== private /Potentials: rows=${priv.rows.length} badPages=${priv.badPages.join(",") || "-"} errors=${errors.length}`);
  const stats = {
    total: priv.rows.length,
    withContactName: 0,
    withContactMobile: 0,
    assignedUsers: {} as Record<string, number>,
    agencies: {} as Record<string, number>,
    codeRange: { min: "zzz", max: "" } as { min: string; max: string },
    keys: new Set<string>(),
  };
  for (const r of priv.rows) {
    for (const k of Object.keys(r)) stats.keys.add(k);
    if (String(r.contactName ?? "").trim()) stats.withContactName++;
    if (String((r as any).contactMobile ?? "").trim()) stats.withContactMobile++;
    const au = String(r.assignedUser ?? "?");
    stats.assignedUsers[au] = (stats.assignedUsers[au] ?? 0) + 1;
    const ag = String(r.agency ?? "?");
    stats.agencies[ag] = (stats.agencies[ag] ?? 0) + 1;
    const c = String(r.code ?? "");
    if (c && c < stats.codeRange.min) stats.codeRange.min = c;
    if (c > stats.codeRange.max) stats.codeRange.max = c;
  }
  console.log("keys across rows:", [...stats.keys].sort().join(", "));
  console.log("withContactName:", stats.withContactName, "/", stats.total);
  console.log("withContactMobile:", stats.withContactMobile, "/", stats.total);
  console.log("assignedUsers distribution:", JSON.stringify(stats.assignedUsers));
  console.log("agencies distribution:", JSON.stringify(stats.agencies));
  console.log("code range:", JSON.stringify(stats.codeRange));

  // ── ۲) contacts/potentials: صفحات ۱-۳ (اندازهٔ صفحه + وجود لینک) ──
  const cErrors: string[] = [];
  const contacts = await fetchModule(base, jar, (n) => `/contacts/potentials${n > 1 ? `/${n}` : ""}`, "contacts", cErrors, );
  console.log(`\n== contacts/potentials: rows=${contacts.rows.length} errors=${cErrors.length}`);
  const cKeys = new Set<string>();
  let cWithPhone = 0;
  for (const r of contacts.rows) {
    for (const k of Object.keys(r)) cKeys.add(k);
    if (String(r.phone ?? "").trim()) cWithPhone++;
  }
  console.log("keys:", [...cKeys].sort().join(", "));
  console.log("withPhone:", cWithPhone, "/", contacts.rows.length);
  console.log("sample 3:", JSON.stringify(contacts.rows.slice(0, 3), null, 1));

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
