/**
 * PN-054 — نقشهٔ سطح دسترسی حساب سینک روی CRM ملکتون
 * (قانون مالک: استخراج داده‌ها به هر شکل ممکن — شناسایی دادهٔ قابل‌دسترسِ بیشتر)
 * اجرا: bun scripts/pn054-probe.ts  (از ریشهٔ پروژه)
 * خروجی: upload/.runtime/pn054-probe.json
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
if (errors.length) console.log("[probe] LOGIN-ERRORS:", errors.join(" | "));
else console.log("[probe] login OK");

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

const out: Record<string, unknown> = { at: new Date().toISOString(), base };

// ۱) هویت کاربر — props صفحهٔ داشبورد
{
  const dash = await get("/dashboard");
  const page = extractProps(dash.html);
  const props = (page?.props ?? {}) as Record<string, unknown>;
  out.dashboard = {
    status: dash.status,
    propKeys: Object.keys(props),
    auth: props.auth ?? null,
    user: props.user ?? null,
  };
  console.log("[probe] dashboard:", dash.status, "propKeys:", Object.keys(props).join(","));
  if (props.auth) console.log("[probe] auth:", JSON.stringify(props.auth).slice(0, 300));
}

// ۲) شمارش ردیف‌های صفحهٔ نخست هر ماژول + کلیدهای props
const modules: [string, string[]][] = [
  ["/MelketunPublicFilingPlus", ["filings"]],
  ["/PublicPotentials", ["potentials"]],
  ["/Melketunfilingplus", ["filings"]],
  ["/Potentials", ["potentials"]],
  ["/contacts/filings", ["contacts"]],
  ["/contacts/potentials", ["contacts"]],
];
out.modules = {};
for (const [path, keys] of modules) {
  const r = await get(path);
  const page = extractProps(r.html);
  const props = (page?.props ?? {}) as Record<string, unknown>;
  const info: Record<string, unknown> = { status: r.status };
  for (const k of Object.keys(props).slice(0, 12)) {
    const v = props[k];
    if (v && typeof v === "object" && Array.isArray((v as { data?: unknown[] }).data)) {
      const arr = (v as { data: unknown[] }).data;
      const obj = v as Record<string, unknown>;
      info[k] = {
        firstPageRows: arr.length,
        total: obj.total ?? obj.last_page ?? null,
        lastPage: obj.last_page ?? null,
        sampleKeys: arr[0] && typeof arr[0] === "object" ? Object.keys(arr[0] as object).slice(0, 24) : [],
      };
    }
  }
  if (!Object.keys(info).some((k) => k !== "status")) info.propKeys = Object.keys(props).slice(0, 12);
  (out.modules as Record<string, unknown>)[path] = info;
  console.log("[probe]", path, "→", JSON.stringify(info).slice(0, 260));
  await sleep(420);
}

// ۳) پروب سطح دسترسی endpointهای دیگر (فقط کد وضعیت)
const accessProbes = [
  "/contacts",
  "/users",
  "/filings",
  "/reports",
  "/supports",
  "/supports/valuations/create",
  "/settings",
  "/customers",
  "/realtors",
  "/dashboard/overview",
];
out.access = {};
for (const p of accessProbes) {
  const r = await get(p);
  const page = extractProps(r.html);
  (out.access as Record<string, unknown>)[p] = {
    status: r.status,
    redirect: r.status >= 300 && r.status < 400 ? "yes" : undefined,
    hasProps: !!page,
  };
  console.log("[probe]", p, "→", r.status, page ? "(inertia)" : "");
  await sleep(420);
}

writeFileSync("upload/.runtime/pn054-probe.json", JSON.stringify(out, null, 2));
console.log("[probe] ✅ نوشته شد: upload/.runtime/pn054-probe.json");
process.exit(0);
