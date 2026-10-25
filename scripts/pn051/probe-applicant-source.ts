// ============================================================================
// PN-051/گام دوم — کاوش زندهٔ CRM ملکتون: منبع دادهٔ «متقاضی» (customerName/Mobile)
// برای فهرست درخواست M8. فقط GET (فقط-خواندنی · صفر تغییر در سرور مبدأ).
// اجرا: bun scripts/pn051/probe-applicant-source.ts
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
    if (page.component?.startsWith("errors/")) return { __errorPage: page.component } as Record<string, unknown>;
    return page.props ?? null;
  } catch {
    return null;
  }
}

async function probeGet(baseUrl: string, jar: { header(): string }, p: string, label: string) {
  try {
    const res = await fetch(`${baseUrl}${p}`, {
      headers: { Cookie: jar.header(), Accept: "text/html,application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    const props = extractProps(text);
    let json: unknown = null;
    if (!props) {
      try { json = JSON.parse(text); } catch { /* html */ }
    }
    console.log(`\n===== ${label} — GET ${p} → HTTP ${res.status} (${text.length}b) =====`);
    if (props) {
      const keys = Object.keys(props);
      console.log("props keys:", keys.join(", "));
      for (const k of keys) {
        const s = JSON.stringify(props[k], null, 1) ?? "";
        console.log(`-- ${k}: ${s.slice(0, 900)}`);
      }
    } else if (json !== null) {
      console.log("raw JSON:", JSON.stringify(json, null, 1).slice(0, 900));
    } else {
      console.log("HTML head:", text.replace(/\s+/g, " ").slice(0, 300));
    }
    return { status: res.status, props, json, text };
  } catch (e) {
    console.log(`\n===== ${label} — GET ${p} → ERROR: ${e instanceof Error ? e.message : e} =====`);
    return null;
  }
}

async function main() {
  const errors: string[] = [];
  const base = secrets.crm.base_url;
  console.log("[pn051] login to CRM:", base.replace(/^https?:\/\//, "***"));
  const jar = await crmLogin(base, secrets.crm.username, secrets.crm.password, errors);
  if (errors.length) console.log("[pn051] login errors:", errors);
  console.log("[pn051] session cookie present:", jar.header().length > 10);

  // ۱) نمای خصوصی Potentials (احراز هویت‌شده) — فیلدهای بیشتر از Public؟
  const priv = await probeGet(base, jar, "/Potentials/1", "private Potentials page 1");

  // ۲) جزئیات یک درخواست — Potentials/show/{id} (بدون پیشوند 13x)
  const pubIds = ["13x406784", "13x406773"];
  for (const full of pubIds) {
    const num = full.replace(/^13x/, "");
    await probeGet(base, jar, `/Potentials/show/${num}`, `potential detail ${full}`);
  }

  // ۳) مخاطبینِ درخواست‌ها — contacts/potentials (صفحهٔ ۱)
  await probeGet(base, jar, "/contacts/potentials/1", "contacts/potentials page 1");

  // ۴) همهٔ مخاطبین — contacts/all
  await probeGet(base, jar, "/contacts/all", "contacts/all");

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
