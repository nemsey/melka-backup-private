/**
 * PN-055/گام ۲ — استخراج کامل contacts/all (۵ صفحه) + مجوزهای کامل + ساختار جستجو
 * قانون مالک: استخراج به هر شکل ممکن · مکاتبه صفر
 * اجرا: bun scripts/pn055-contacts.ts
 * خروجی: download/pn055/contacts-all.json + upload/.runtime/pn055-auth.json
 */
import { crmLogin } from "@/lib/integrations/melketun/sync";
import { readFileSync, writeFileSync, mkdirSync } from "fs";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const secrets = JSON.parse(
  readFileSync("upload/.runtime/melketun-secrets.json", "utf8"),
) as { crm: { base_url: string; username: string; password: string } };
const base = secrets.crm.base_url.replace(/\/$/, "");
const errors: string[] = [];
const jar = await crmLogin(base, secrets.crm.username, secrets.crm.password, errors);
if (errors.length) { console.log("[ext] LOGIN-ERRORS:", errors.join(" | ")); process.exit(1); }
console.log("[ext] login OK");

function extractProps(html: string): Record<string, unknown> | null {
  const m = html.match(/data-page="([^"]+)"/);
  if (!m) return null;
  try {
    const decoded = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#039;/g, "'");
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch { return null; }
}

async function getPage(path: string) {
  const res = await fetch(base + path, {
    headers: { Cookie: jar.header() },
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });
  const html = res.status === 200 ? await res.text() : "";
  return { status: res.status, page: extractProps(html), html };
}

mkdirSync("download/pn055", { recursive: true });

// ۱) مجوزهای کامل + هویت کامل
const auth: Record<string, unknown> = {};
{
  const r = await getPage("/contacts/all");
  const props = (r.page?.props ?? {}) as Record<string, unknown>;
  const a = props.auth as Record<string, unknown> | undefined;
  if (a) {
    const u = a.user as Record<string, unknown> | undefined;
    auth.user = u;
    auth.permissions = a.permissions;
    auth.roles = a.roles;
    console.log("[ext] مجوزها:", JSON.stringify(a.permissions));
    if (u) console.log("[ext] کاربر:", u.first_name, u.last_name, "· is_admin:", u.is_admin);
  }
  writeFileSync("upload/.runtime/pn055-auth.json", JSON.stringify(auth, null, 2));
  await sleep(700);
}

// ۲) همهٔ صفحات contacts/all (۵ صفحه × ۲۰ = ۹۱)
const allContacts: unknown[] = [];
let lastPage = 5;
let sampleKeys: string[] = [];
for (let p = 1; p <= lastPage; p++) {
  const r = await getPage(`/contacts/all?page=${p}`);
  if (r.status !== 200) { console.log(`[ext] page ${p} → ${r.status} — توقف`); break; }
  const props = (r.page?.props ?? {}) as Record<string, unknown>;
  const contacts = props.contacts as { data?: unknown[]; last_page?: number } | undefined;
  if (!contacts?.data) { console.log(`[ext] page ${p} — بدون داده`); break; }
  if (p === 1 && contacts.data[0] && typeof contacts.data[0] === "object") {
    sampleKeys = Object.keys(contacts.data[0] as object);
    console.log("[ext] فیلدهای مخاطب:", sampleKeys.join(","));
  }
  allContacts.push(...contacts.data);
  lastPage = contacts.last_page ?? lastPage;
  console.log(`[ext] page ${p}: +${contacts.data.length} (مجموع ${allContacts.length}/${contacts.total ?? "?"})`);
  await sleep(700);
}
writeFileSync("download/pn055/contacts-all.json", JSON.stringify({ fetchedAt: new Date().toISOString(), count: allContacts.length, records: allContacts }, null, 2));
console.log(`[ext] ✅ contacts-all.json — ${allContacts.length} رکورد`);

// ۳) ساختار نتیجهٔ جستجوی آگهی (فیلدها؟)
await sleep(700);
{
  const r = await getPage("/Melketunfilingplus/search/تبریز/1");
  if (r.status === 200) {
    const props = (r.page?.props ?? {}) as Record<string, unknown>;
    const filings = props.filings as { data?: unknown[] } | undefined;
    if (filings?.data?.[0] && typeof filings.data[0] === "object") {
      console.log("[ext] فیلدهای جستجوی آگهی:", Object.keys(filings.data[0] as object).join(","));
      writeFileSync("download/pn055/search-filings-sample.json", JSON.stringify(filings.data.slice(0, 3), null, 2));
    } else {
      console.log("[ext] جستجوی آگهی: props کلیدی =", Object.keys(props).join(","));
    }
  } else console.log("[ext] search filings →", r.status);
}

// ۴) ساختار نتیجهٔ جستجوی درخواست
await sleep(700);
{
  const r = await getPage("/Potentials/search/تبریز/1");
  if (r.status === 200) {
    const props = (r.page?.props ?? {}) as Record<string, unknown>;
    const pots = props.potentials as { data?: unknown[] } | undefined;
    if (pots?.data?.[0] && typeof pots.data[0] === "object") {
      console.log("[ext] فیلدهای جستجوی درخواست:", Object.keys(pots.data[0] as object).join(","));
      writeFileSync("download/pn055/search-potentials-sample.json", JSON.stringify(pots.data.slice(0, 3), null, 2));
    } else {
      console.log("[ext] جستجوی درخواست: props کلیدی =", Object.keys(props).join(","));
    }
  } else console.log("[ext] search potentials →", r.status);
}

// ۵) نمایش عمومی وب‌سایت — یک publicUrl نمونه (صفحهٔ عمومی، بدون لاگین)
{
  const pubBase = secrets.public.base_url.replace(/\/$/, "");
  const samplePath = "/آگهی/2113/آپارتمان-175متری-در-گلشهر";
  try {
    const res = await fetch(pubBase + samplePath, { signal: AbortSignal.timeout(15_000), redirect: "manual" });
    const html = res.status === 200 ? await res.text() : "";
    // جستجوی شماره‌های موبایل در صفحه
    const mobiles = [...html.matchAll(/09\d{9}/g)].map((m) => m[0]);
    const unique = [...new Set(mobiles)];
    console.log(`[ext] صفحهٔ عمومی ${samplePath.slice(0, 30)}… → ${res.status} · موبایل‌های یافت‌شده:`, unique.slice(0, 6));
    if (res.status === 200) {
      writeFileSync("download/pn055/public-page-sample.html", html);
      console.log("[ext] نمونهٔ HTML ذخیره شد (public-page-sample.html) · حجم:", html.length);
    }
  } catch (e) {
    console.log("[ext] صفحهٔ عمومی خطا:", String(e).slice(0, 80));
  }
}

console.log("[ext] ✅ پایان");
process.exit(0);
