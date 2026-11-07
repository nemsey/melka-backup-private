// ============================================================================
// PN-051/گام دوم — کاوش منابع دادهٔ «مالک ملک» برای آگهی‌های ملکتون:
//   ۱) MelketunPublicFilingPlus/{id} — صفحهٔ جزئیات آگهی (مالک/موبایل؟)
//   ۲) contacts/filings — مخاطبینِ آگهی‌ها (لینک به آگهی؟)
//   ۳) specialists — حساب مدیر CRM برای مسیر تکمیل ۱۰۰٪
// فقط GET · فقط-خواندنی
// اجرا: bun scripts/pn051/probe-owner-sources.ts
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
    if (page.component?.startsWith("errors/")) return { __err: page.component } as Record<string, unknown>;
    return page.props ?? null;
  } catch {
    return null;
  }
}

async function probeGet(baseUrl: string, jar: { header(): string }, p: string, label: string, maxLen = 1200) {
  try {
    const res = await fetch(`${baseUrl}${p}`, {
      headers: { Cookie: jar.header(), Accept: "text/html,application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    const props = extractProps(text);
    console.log(`\n===== ${label} — GET ${p} → HTTP ${res.status} =====`);
    if (props) {
      if (props.__err) { console.log("error page:", props.__err); return; }
      for (const k of Object.keys(props)) {
        if (["auth", "quote", "errors", "name"].includes(k)) continue;
        const s = JSON.stringify(props[k], null, 1) ?? "";
        console.log(`-- ${k}: ${s.slice(0, maxLen)}`);
      }
    } else {
      let j: unknown = null;
      try { j = JSON.parse(text); } catch { /* html */ }
      console.log(j !== null ? JSON.stringify(j, null, 1).slice(0, maxLen) : text.replace(/\s+/g, " ").slice(0, 200));
    }
  } catch (e) {
    console.log(`\n===== ${label} — ERROR: ${e instanceof Error ? e.message : e} =====`);
  }
}

async function main() {
  const errors: string[] = [];
  const base = secrets.crm.base_url;
  const jar = await crmLogin(base, secrets.crm.username, secrets.crm.password, errors);
  console.log("[pn051] login ok:", errors.length === 0);

  // ── ۱) جزئیات آگهی عمومی — نمونه‌ها از buffer ──
  // (id های واقعی از buffer: 71x408733 → 408733)
  for (const id of ["408733", "408720"]) {
    await probeGet(base, jar, `/MelketunPublicFilingPlus/${id}`, `filing detail ${id}`);
  }

  // ── ۲) مخاطبین آگهی — صفحهٔ ۱ و ۲ ──
  await probeGet(base, jar, "/contacts/filings/1", "contacts/filings page 1");
  await probeGet(base, jar, "/contacts/filings/2", "contacts/filings page 2");

  // ── ۳) فایل‌های خصوصی خود کاربر (myFilings) — کدام آگهی‌ها مالک‌دارند؟ ──
  await probeGet(base, jar, "/supports/valuations/create", "supports/valuations/create (myFilings)", 2000);

  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
