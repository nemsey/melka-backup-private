/**
 * PN-055 — پروب مسیرهای دست‌نخوردهٔ CRM ملکتون (قانون مالک: استخراج به هر شکل ممکن · مکاتبه صفر)
 * آزمون اندپوینت‌هایی که pn054-probe تست نکرد (از نقشهٔ ziggy-routes):
 *   /contacts/all · /Melketunfilingplus/show/{id} · /getConsultantNameAndNumber/{id}
 *   /contacts/getUserNumber/{id} · /Potentials/getMyRelatedFilings/{id} · /leads
 *   /Melketunfilingplus/search/{kw}/{page} · /Potentials/show/{id}
 * اجرا: bun scripts/pn055-probe.ts
 * خروجی: upload/.runtime/pn055-probe.json
 */
import { crmLogin } from "@/lib/integrations/melketun/sync";
import { readFileSync, writeFileSync } from "fs";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const secrets = JSON.parse(
  readFileSync("upload/.runtime/melketun-secrets.json", "utf8"),
) as { crm: { base_url: string; username: string; password: string } };
const base = secrets.crm.base_url.replace(/\/$/, "");
const errors: string[] = [];

const jar = await crmLogin(base, secrets.crm.username, secrets.crm.password, errors);
if (errors.length) {
  console.log("[probe] LOGIN-ERRORS:", errors.join(" | "));
  process.exit(1);
}
console.log("[probe] login OK");

async function get(path: string) {
  try {
    const res = await fetch(base + path, {
      headers: { Cookie: jar.header() },
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });
    const html = res.status === 200 ? await res.text() : "";
    return { status: res.status, html };
  } catch (e) {
    return { status: 0, html: "", err: String(e).slice(0, 80) };
  }
}

function extractProps(html: string): Record<string, unknown> | null {
  const m = html.match(/data-page="([^"]+)"/);
  if (!m) return null;
  try {
    const decoded = m[1]
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, "&")
      .replace(/&#039;/g, "'");
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function summarize(v: unknown, depth = 0): unknown {
  if (depth > 3) return "...";
  if (Array.isArray(v)) {
    return { _arr: v.length, sample: v.slice(0, 2).map((x) => summarize(x, depth + 1)) };
  }
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>).slice(0, 20)) {
      out[k] = summarize(val, depth + 1);
    }
    return out;
  }
  return typeof v === "string" && v.length > 120 ? v.slice(0, 120) + "…" : v;
}

const out: Record<string, unknown> = { at: new Date().toISOString(), base };

// شناسه‌های نمونه از دادهٔ موجود DB (از pn047 captures)
// فایلینگ عمومی: id=71x406952 · full_id=71x406952 · assignedUser=19x646
// پتانسیل عمومی: از pot-checkpoint.json
let potentialId = "";
try {
  const pot = JSON.parse(readFileSync("download/pn047/pot-checkpoint.json", "utf8"));
  const rows = pot?.potentials?.data ?? pot?.data ?? [];
  if (Array.isArray(rows) && rows[0]?.id) potentialId = String(rows[0].id);
} catch { /* ignore */ }

const targets: [string, string][] = [
  ["/contacts/all", "همهٔ مخاطبین"],
  ["/Melketunfilingplus/show/71x406952", "جزئیات آگهی (نمای عمومی id)"],
  ["/Melketunfilingplus/show/406952", "جزئیات آگهی (id عددی)"],
  ["/getConsultantNameAndNumber/19x646", "نام+شمارهٔ مشاور (vtiger id)"],
  ["/getConsultantNameAndNumber/646", "نام+شمارهٔ مشاور (عددی)"],
  ["/contacts/getUserFromVtigerId/19x646", "حل کاربر (کنترل شناخته‌شده)"],
  ["/contacts/getUserNumber/19x646", "شمارهٔ کاربر با id"],
  ["/leads", "لیدها"],
  ["/leads/assigned", "لیدهای واگذارشده"],
  ["/Melketunfilingplus/search/تبریز/1", "جستجوی آگهی"],
  ["/Potentials/search/تبریز/1", "جستجوی درخواست"],
];

for (const [path, label] of targets) {
  const r = await get(path);
  const page = extractProps(r.html);
  const props = (page?.props ?? {}) as Record<string, unknown>;
  const info: Record<string, unknown> = { status: r.status, label };
  // JSON خام هم ممکن است (اندپوینت‌های API نه Inertia)
  if (page) {
    info.kind = "inertia";
    info.props = summarize(props);
  } else if (r.status === 200 && r.html.trim().startsWith("{")) {
    info.kind = "json";
    try {
      info.json = summarize(JSON.parse(r.html));
    } catch {
      info.body = r.html.slice(0, 300);
    }
  } else if (r.status === 200) {
    info.kind = "html";
    info.body = r.html.slice(0, 300);
  } else if (r.status >= 300 && r.status < 400) {
    info.kind = "redirect";
    info.location = r.html?.slice(0, 0); // location در manual redirect از headers
  }
  (out as Record<string, unknown>)[path] = info;
  console.log("[probe]", path, "→", r.status, info.kind ?? "");
  await sleep(650);
}

// پتانسیل show + related filings — فقط اگر id داشتیم
if (potentialId) {
  for (const [path, label] of [
    [`/Potentials/show/${potentialId}`, "جزئیات درخواست"],
    [`/Potentials/getMyRelatedFilings/${potentialId}`, "آگهی‌های مرتبط درخواست"],
  ] as [string, string][]) {
    const r = await get(path);
    const page = extractProps(r.html);
    const info: Record<string, unknown> = { status: r.status, label };
    if (page) {
      info.kind = "inertia";
      info.props = summarize((page?.props ?? {}) as Record<string, unknown>);
    } else if (r.status === 200 && r.html.trim().startsWith("{")) {
      info.kind = "json";
      try {
        info.json = summarize(JSON.parse(r.html));
      } catch {
        info.body = r.html.slice(0, 300);
      }
    }
    (out as Record<string, unknown>)[path] = info;
    console.log("[probe]", path, "→", r.status, info.kind ?? "");
    await sleep(650);
  }
}

writeFileSync("upload/.runtime/pn055-probe.json", JSON.stringify(out, null, 2));
console.log("[probe] ✅ نوشته شد: upload/.runtime/pn055-probe.json");
process.exit(0);
