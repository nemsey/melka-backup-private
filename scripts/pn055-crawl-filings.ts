/**
 * PN-055 — خزندهٔ جزئیات آگهی‌های ملکتون (فاز A-۲)
 * کشف: /Melketunfilingplus/show/{id} برای آگهی‌های قدیمی‌تر باز است:
 *   · cf_pcf_irm_1706 = موبایل مالک · cf_1704 نام خانوادگی مالک
 *   · cf_pcf_snf_1702 نام · cf_1685 آدرس مالک · ۶۲ فیلد مشخصات
 *   · relatedPotentials[] با contactName
 * اجرا (دیمن): python3 scripts/pn055-launch-filing.py
 * خروجی: download/pn055/filing-details.jsonl + crawl-filing-status.json
 */
import { crmLogin } from "@/lib/integrations/melketun/sync";
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "fs";

const OUT_DIR = "download/pn055";
const JSONL = `${OUT_DIR}/filing-details.jsonl`;
const STATUS = `${OUT_DIR}/crawl-filing-status.json`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT_DIR, { recursive: true });
const secrets = JSON.parse(
  readFileSync("upload/.runtime/melketun-secrets.json", "utf8"),
) as { crm: { base_url: string; username: string; password: string } };
const base = secrets.crm.base_url.replace(/\/$/, "");
const allIds: string[] = JSON.parse(readFileSync(`${OUT_DIR}/filing-ids.json`, "utf8"));

const done = new Set<string>();
if (existsSync(JSONL)) {
  for (const line of readFileSync(JSONL, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { done.add((JSON.parse(line) as { fid: string }).fid); } catch { /* سطر ناقص */ }
  }
}
const queue = allIds.filter((id) => !done.has(id));
console.log(`[fcrawl] شروع: ${allIds.length} کل · انجام‌شده ${done.size} · باقی ${queue.length}`);

const status = {
  startedAt: new Date().toISOString(),
  total: allIds.length,
  doneAtStart: done.size,
  processed: 0, ok: 0, errors: 0, brokenPages: 0,
  brokenIds: [] as string[],
  withOwnerMobile: 0,
  relatedPotentialsSeen: 0,
  lastId: "", lastError: "", finished: false,
};
function writeStatus() { writeFileSync(STATUS, JSON.stringify(status, null, 2)); }
writeStatus();

let jar: Awaited<ReturnType<typeof crmLogin>> | null = null;
let sessionAge = 0;
async function freshLogin(): Promise<boolean> {
  const errors: string[] = [];
  try {
    jar = await crmLogin(base, secrets.crm.username, secrets.crm.password, errors);
    sessionAge = 0;
    if (errors.length || !jar) { status.lastError = errors.join("|").slice(0, 120); return false; }
    return true;
  } catch (e) {
    status.lastError = String(e).slice(0, 120);
    return false;
  }
}
if (!(await freshLogin())) {
  console.log("[fcrawl] ❌ ورود اولیه ناموفق:", status.lastError);
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

interface FetchErr extends Error { kind: "http" | "net" | "props"; status?: number }

async function fetchOne(fid: string): Promise<Record<string, unknown> | null> {
  if (!jar) return null;
  const res = await fetch(`${base}/Melketunfilingplus/show/${fid}`, {
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
  const f = (props.filing ?? {}) as Record<string, unknown>;
  const rp = (props.relatedPotentials ?? []) as Record<string, unknown>[];
  status.relatedPotentialsSeen += rp.length;
  return {
    fid,
    ownerName: [val(f, "cf_pcf_snf_1702"), val(f, "cf_1704")].filter(Boolean).join(" ").trim(),
    ownerSurname: val(f, "cf_1704"),
    ownerMobile: val(f, "cf_pcf_irm_1706").replace(/\D/g, ""),
    customerMobile: val(f, "cf_pcf_irm_4269").replace(/\D/g, ""),
    customerName: val(f, "cf_4266"),
    landline: val(f, "cf_1710").replace(/\D/g, ""),
    ownerAddress: val(f, "cf_1685"),
    address: val(f, "cf_3845"),
    area: val(f, "cf_3909"),
    branch: val(f, "cf_2171"),
    fileStatus: val(f, "cf_2860"),
    stage: val(f, "cf_4038"),
    residenceStatus: val(f, "cf_1691"),
    docType: val(f, "cf_1687"),
    description: val(f, "cf_3382"),
    price: val(f, "cf_1657"),
    deposit: val(f, "cf_1659"),
    rent: val(f, "cf_1661"),
    metreage: val(f, "cf_1669"),
    rooms: val(f, "cf_1673"),
    floor: val(f, "cf_1665"),
    buildYear: val(f, "cf_1681"),
    assignedUser: val(f, "assigned_user_id"),
    modifiedtime: val(f, "modifiedtime"),
    createdtime: val(f, "createdtime"),
    relatedPotentials: rp.map((p) => ({
      id: String(p.id ?? ""), potentialNo: String(p.potentialNo ?? ""),
      contactName: String(p.contactName ?? ""), customerType: String(p.customerType ?? ""),
      status: String(p.status ?? ""),
    })),
  };
}

const T0 = Date.now();
let processedThisSession = 0;
for (let i = 0; i < queue.length; i++) {
  const fid = queue[i];

  if (sessionAge >= 350) {
    if (!(await freshLogin())) { console.log("[fcrawl] ورود تازه ناموفق — توقف ۱۰ث"); await sleep(10_000); await freshLogin(); }
  }

  let rec: Record<string, unknown> | null = null;
  let lastErr = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      rec = await fetchOne(fid);
      if (rec) break;
    } catch (e) {
      const fe = e as FetchErr;
      lastErr = String(e).slice(0, 80);
      if (fe.kind === "http" && (fe.status === 500 || fe.status === 404)) {
        status.brokenIds.push(fid);
        break;
      }
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
    if ((rec.ownerMobile as string)?.length >= 10) status.withOwnerMobile++;
  } else if (status.brokenIds.includes(fid)) {
    status.brokenPages++;
  } else {
    status.errors++;
    status.lastError = `${fid}: ${lastErr}`;
  }

  status.processed = status.doneAtStart + status.ok + status.errors + status.brokenPages;
  status.lastId = fid;
  processedThisSession++;

  if (processedThisSession % 25 === 0) {
    const elapsed = (Date.now() - T0) / 1000;
    const rate = processedThisSession / elapsed;
    const eta = ((queue.length - i - 1) / Math.max(rate, 0.01)) / 60;
    console.log(`[fcrawl] ${status.processed}/${status.total} · ok=${status.ok} err=${status.errors} broken=${status.brokenPages} · ${rate.toFixed(2)}/s · ETA ${eta.toFixed(1)}min · ${fid}`);
    writeStatus();
  }
  await sleep(700);
}

status.finished = true;
writeStatus();
console.log(`[fcrawl] ✅ پایان — ok=${status.ok} err=${status.errors} broken=${status.brokenPages} · مالک‌موبایل=${status.withOwnerMobile}`);
process.exit(0);
