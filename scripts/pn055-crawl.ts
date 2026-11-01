/**
 * PN-055 — خزندهٔ کامل جزئیات درخواست‌های ملکتون (فاز A)
 * ---------------------------------------------------------------------------
 * قانون مالک: «استخراج داده‌ها به هر شکل ممکن» + «مکاتبه صفر»
 * کشف کلیدی PN-055: /Potentials/show/{id} برای «همهٔ» درخواست‌ها باز است
 * (RBAC فقط فهرست‌ها را محدود می‌کند) و شامل:
 *   · متقاضی: نام + موبایل + تلفن ثابت + معرف
 *   · مالک مرتبط: نام + موبایل + آدرس
 *   · relatedFilings[]: هر آگهی مرتبط با مالک واقعی + موبایل + مشاور + GPS
 *
 * اجرا (دیمن): setsid nohup bun scripts/pn055-crawl.ts >> download/pn055/crawl.log 2>&1 &
 * خروجی: download/pn055/pot-details.jsonl (سطر به سطر — قابل ازسرگیری)
 * شاهد: download/pn055/crawl-status.json (برای پایش)
 */
import { crmLogin } from "@/lib/integrations/melketun/sync";
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "fs";

const OUT_DIR = "download/pn055";
const JSONL = `${OUT_DIR}/pot-details.jsonl`;
const STATUS = `${OUT_DIR}/crawl-status.json`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT_DIR, { recursive: true });
const secrets = JSON.parse(
  readFileSync("upload/.runtime/melketun-secrets.json", "utf8"),
) as { crm: { base_url: string; username: string; password: string } };
const base = secrets.crm.base_url.replace(/\/$/, "");
const allIds: string[] = JSON.parse(readFileSync(`${OUT_DIR}/pot-ids.json`, "utf8"));

// ─── ازسرگیری: IDهای уже خزش‌شده ───
const done = new Set<string>();
if (existsSync(JSONL)) {
  for (const line of readFileSync(JSONL, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { done.add((JSON.parse(line) as { pid: string }).pid); } catch { /* سطر ناقص انتهایی — نادیده */ }
  }
}
const queue = allIds.filter((id) => !done.has(id));
console.log(`[crawl] شروع: ${allIds.length} کل · انجام‌شده ${done.size} · باقی ${queue.length}`);

// ─── وضعیت برای پایش ───
const status = {
  startedAt: new Date().toISOString(),
  total: allIds.length,
  doneAtStart: done.size,
  processed: 0,
  ok: 0,
  errors: 0,
  brokenPages: 0,
  brokenIds: [] as string[],
  withCustomerMobile: 0,
  withOwnerData: 0,
  relatedFilingsSeen: 0,
  lastId: "",
  lastError: "",
  finished: false,
};
function writeStatus() { writeFileSync(STATUS, JSON.stringify(status, null, 2)); }
writeStatus();

// ─── نشست با ورود تازه (الگوی fetchPriv از PN-054) ───
let jar: Awaited<ReturnType<typeof crmLogin>> | null = null;
let sessionAge = 0;
async function freshLogin(): Promise<boolean> {
  const errors: string[] = [];
  try {
    console.log(`[crawl] login شروع ${new Date().toISOString().slice(11, 19)} (age=${sessionAge})`);
    jar = await crmLogin(base, secrets.crm.username, secrets.crm.password, errors);
    sessionAge = 0;
    console.log(`[crawl] login پایان ${new Date().toISOString().slice(11, 19)} · errors=${errors.length}`);
    if (errors.length || !jar) { status.lastError = errors.join("|").slice(0, 120); return false; }
    return true;
  } catch (e) {
    console.log(`[crawl] login استثنا: ${String(e).slice(0, 100)}`);
    status.lastError = String(e).slice(0, 120);
    return false;
  }
}
if (!(await freshLogin())) {
  console.log("[crawl] ❌ ورود اولیه ناموفق:", status.lastError);
  writeStatus();
  process.exit(1);
}

function extractProps(html: string): Record<string, unknown> | null {
  const m = html.match(/data-page="([^"]+)"/);
  if (!m) return null;
  try {
    const decoded = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#039;/g, "'");
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch { return null; }
}

const val = (o: Record<string, unknown>, k: string): string => {
  const v = o[k] as { value?: unknown } | undefined;
  if (v && typeof v === "object" && "value" in v) return String((v as { value: unknown }).value ?? "").trim();
  return "";
};

interface RelatedFiling {
  id: string; filingNo: string; ownerName: string; phone: string;
  consultantName: string; consultantPhone: string;
  addressDescription: string; latitude: string; longitude: string;
  price: string; metre: string; saleType: string; status: string;
}

interface FetchErr extends Error { kind: "http" | "net" | "props"; status?: number }

async function fetchOne(pid: string): Promise<Record<string, unknown> | null> {
  if (!jar) return null;
  const res = await fetch(`${base}/Potentials/show/${pid}`, {
    headers: { Cookie: jar.header() },
    redirect: "manual",
    signal: AbortSignal.timeout(20_000),
  });
  sessionAge++;
  if (res.status !== 200) {
    const e = new Error(`HTTP ${res.status}`) as FetchErr;
    e.kind = "http"; e.status = res.status;
    throw e;
  }
  const page = extractProps(await res.text());
  if (!page) {
    const e = new Error("no-props") as FetchErr;
    e.kind = "props";
    throw e;
  }
  const props = page.props as Record<string, unknown>;
  const pot = (props.potential ?? {}) as Record<string, unknown>;
  const rf = (props.relatedFilings ?? []) as Record<string, unknown>[];
  const related: RelatedFiling[] = rf.map((f) => ({
    id: String(f.id ?? ""), filingNo: String(f.filingNo ?? ""),
    ownerName: String(f.ownerName ?? "").trim(), phone: String(f.phone ?? "").replace(/\D/g, ""),
    consultantName: String(f.consultantName ?? "").trim(), consultantPhone: String(f.consultantPhone ?? "").replace(/\D/g, ""),
    addressDescription: String(f.addressDescription ?? ""), latitude: String(f.latitude ?? ""), longitude: String(f.longitude ?? ""),
    price: String(f.price ?? ""), metre: String(f.metre ?? ""), saleType: String(f.saleType ?? ""), status: String(f.status ?? ""),
  }));
  status.relatedFilingsSeen += related.length;
  return {
    pid,
    customerName: val(pot, "cf_pcf_snf_2638") || val(pot, "cf_2165"),
    customerSurname: val(pot, "cf_2165"),
    customerMobile: val(pot, "cf_pcf_irm_1179").replace(/\D/g, ""),
    customerLandline: val(pot, "cf_pcf_irm_1814").replace(/\D/g, ""),
    referrerName: val(pot, "cf_2610"),
    referrerMobile: val(pot, "cf_pcf_irm_2611").replace(/\D/g, ""),
    ownerName: val(pot, "cf_4256"),
    ownerMobile: val(pot, "cf_pcf_irm_4257").replace(/\D/g, ""),
    ownerAddress: val(pot, "cf_4260"),
    description: val(pot, "cf_3374"),
    customerType: val(pot, "cf_1204"),
    status: val(pot, "cf_2856"),
    branch: val(pot, "cf_2597"),
    modifiedtime: val(pot, "modifiedtime"),
    createdtime: val(pot, "createdtime"),
    relatedFilings: related,
  };
}

// ─── حلقهٔ اصلی ───
const T0 = Date.now();
let processedThisSession = 0;
for (let i = 0; i < queue.length; i++) {
  const pid = queue[i];

  // ورود تازه هر ۳۵۰ درخواست (پیشگیری از انقضای نشست)
  if (sessionAge >= 350) {
    if (!(await freshLogin())) { console.log("[crawl] ورود تازه ناموفق — توقف ۱۰ث"); await sleep(10_000); await freshLogin(); }
  }

  let rec: Record<string, unknown> | null = null;
  let lastErr = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      rec = await fetchOne(pid);
      if (rec) break;
    } catch (e) {
      const fe = e as FetchErr;
      lastErr = String(e).slice(0, 80);
      // سیاست هوشمند: ۵۰۰/۴۰۴ = صفحهٔ خراب دائمی → بدون تلاش مجدد
      if (fe.kind === "http" && (fe.status === 500 || fe.status === 404)) {
        status.brokenIds.push(pid);
        break;
      }
      // ۴۱۹/۴۰۱/۳ = نشست منقضی → فقط ورود تازه و تلاش مجدد
      // شبکه/props → خنک‌سازی + ورود تازه (الگوی fetchPriv از PN-054)
      if (fe.kind === "http" && (fe.status === 401 || fe.status === 403 || fe.status === 419 || ((fe.status ?? 0) >= 300 && (fe.status ?? 0) < 400))) {
        await freshLogin();
        continue;
      }
      await sleep(attempt === 1 ? 2_500 : attempt === 2 ? 5_000 : 9_000);
      await freshLogin();
    }
  }

  if (rec) {
    appendFileSync(JSONL, JSON.stringify(rec) + "\n");
    status.ok++;
    if ((rec.customerMobile as string)?.length >= 10) status.withCustomerMobile++;
    if ((rec.ownerName as string) || (rec.ownerMobile as string)) status.withOwnerData++;
  } else if (status.brokenIds.includes(pid)) {
    status.brokenPages++;
  } else {
    status.errors++;
    status.lastError = `${pid}: ${lastErr}`;
    // خطاها ثبت نمی‌شوند تا در ازسرگیری دوباره تلاش شوند؛ در گزارش نهایی جمع می‌شوند
  }

  status.processed = status.doneAtStart + status.ok + status.errors + status.brokenPages;
  status.lastId = pid;
  processedThisSession++;

  // گزارش پیشرفت هر ۲۵ رکورد
  if (processedThisSession % 25 === 0) {
    const elapsed = (Date.now() - T0) / 1000;
    const rate = processedThisSession / elapsed;
    const eta = ((queue.length - i - 1) / Math.max(rate, 0.01)) / 60;
    console.log(`[crawl] ${status.processed}/${status.total} · ok=${status.ok} err=${status.errors} · ${rate.toFixed(2)}/s · ETA ${eta.toFixed(1)}min · ${pid}`);
    writeStatus();
  }
  await sleep(550);
}

status.finished = true;
writeStatus();
console.log(`[crawl] ✅ پایان — ok=${status.ok} err=${status.errors} · متقاضی‌موبایل=${status.withCustomerMobile} · relatedFilings=${status.relatedFilingsSeen}`);
process.exit(0);
