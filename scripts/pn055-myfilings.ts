/**
 * PN-055 — خزش هدفمند آگهی‌های خودِ حساب (فاز A-۴)
 * فهرست خصوصی /Melketunfilingplus = ۵۳ آگهی واگذارشده به حساب سینک →
 * صفحات show آنها: مالک کامل + relatedPotentials (نام متقاضیان متقاطع)
 * اجرا: bun scripts/pn055-myfilings.ts
 * خروجی: download/pn055/myfilings-details.jsonl
 */
import { crmLogin } from "@/lib/integrations/melketun/sync";
import { readFileSync, writeFileSync, appendFileSync, existsSync } from "fs";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const secrets = JSON.parse(
  readFileSync("upload/.runtime/melketun-secrets.json", "utf8"),
) as { crm: { base_url: string; username: string; password: string } };
const base = secrets.crm.base_url.replace(/\/$/, "");
const errors: string[] = [];
const jar = await crmLogin(base, secrets.crm.username, secrets.crm.password, errors);
if (errors.length) { console.log("[myf] LOGIN-ERRORS:", errors.join(" | ")); process.exit(1); }

function extractProps(html: string): Record<string, unknown> | null {
  const m = html.match(/data-page="([^"]+)"/);
  if (!m) return null;
  try {
    const decoded = m[1].replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#039;/g, "'");
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch { return null; }
}

// ۱) فهرست خصوصی — همهٔ صفحات تا آخر
const myIds: string[] = [];
let page = 1;
for (;;) {
  const res = await fetch(`${base}/Melketunfilingplus?page=${page}`, {
    headers: { Cookie: jar.header() }, redirect: "manual", signal: AbortSignal.timeout(20_000),
  });
  if (res.status !== 200) break;
  const p = extractProps(await res.text());
  const filings = (p?.props?.filings ?? {}) as { data?: { id?: string }[]; last_page?: number };
  if (!filings.data?.length) break;
  for (const f of filings.data) if (f.id) myIds.push(String(f.id));
  if (page >= (filings.last_page ?? 1)) break;
  page++;
  await sleep(500);
}
console.log(`[myf] آگهی‌های خودِ حساب: ${myIds.length}`);

// ۲) خزش صفحات show — relatedPotentials + مالک
const JSONL = "download/pn055/myfilings-details.jsonl";
const done = new Set<string>();
if (existsSync(JSONL)) {
  for (const line of readFileSync(JSONL, "utf8").split("\n")) {
    if (line.trim()) { try { done.add((JSON.parse(line) as { fid: string }).fid); } catch { /* */ } }
  }
}
const queue = myIds.filter((id) => !done.has(id));
console.log(`[myf] باقی: ${queue.length}`);

const val = (o: Record<string, unknown>, k: string): string => {
  const v = o[k] as { value?: unknown } | undefined;
  if (v && typeof v === "object" && "value" in v) return String((v as { value: unknown }).value ?? "").trim();
  return "";
};

let ok = 0, relatedPots = 0, withOwnerMobile = 0;
for (const fid of queue) {
  try {
    const res = await fetch(`${base}/Melketunfilingplus/show/${fid}`, {
      headers: { Cookie: jar.header() }, redirect: "manual", signal: AbortSignal.timeout(20_000),
    });
    if (res.status !== 200) { console.log(`[myf] ${fid} → ${res.status}`); await sleep(600); continue; }
    const p = extractProps(await res.text());
    if (!p) throw new Error("no-props");
    const props = p.props as Record<string, unknown>;
    const f = (props.filing ?? {}) as Record<string, unknown>;
    const rp = (props.relatedPotentials ?? []) as Record<string, unknown>[];
    relatedPots += rp.length;
    const rec = {
      fid,
      ownerName: [val(f, "cf_pcf_snf_1702"), val(f, "cf_1704")].filter(Boolean).join(" ").trim(),
      ownerMobile: val(f, "cf_pcf_irm_1706").replace(/\D/g, ""),
      ownerAddress: val(f, "cf_1685"),
      customerName: val(f, "cf_4266"),
      customerMobile: val(f, "cf_pcf_irm_4269").replace(/\D/g, ""),
      relatedPotentials: rp.map((x) => ({
        id: String(x.id ?? ""), potentialNo: String(x.potentialNo ?? ""),
        contactName: String(x.contactName ?? ""), customerType: String(x.customerType ?? ""),
      })),
    };
    if (rec.ownerMobile.length >= 10) withOwnerMobile++;
    appendFileSync(JSONL, JSON.stringify(rec) + "\n");
    ok++;
  } catch (e) {
    console.log(`[myf] ${fid} خطا: ${String(e).slice(0, 60)}`);
  }
  await sleep(550);
}
console.log(`[myf] ✅ ${ok} آگهی · ${relatedPots} درخواست مرتبط · ${withOwnerMobile} موبایل مالک`);
process.exit(0);
