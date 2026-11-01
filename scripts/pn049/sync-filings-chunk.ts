// ============================================================================
// PN-049/گام ۳ — سینک کامل ماژول آگهی‌های ملکتون (M7) — تک‌فراخوان + بافر ایمنی
// ============================================================================
// چرا: سینک کامل ۴-ماژوله از مهلت ۱۰ دقیقهٔ Bash عبور می‌کند؛ ماژول آگهی‌ها
// (~۳۱۷ صفحه × pacing ۳۵۰ms) به‌تنهایی جا می‌شود. بافر پس از fetch در State File
// ذخیره می‌شود — اگر upsert قطع شد، فراخوان دوم فقط upsert را کامل می‌کند.
//   bun scripts/pn049/sync-filings-chunk.ts run     → fetch + upsert (پیش‌فرض)
//   bun scripts/pn049/sync-filings-chunk.ts upsert  → فقط upsert از بافر ذخیره‌شده
// قوانین: افزودنی-فقط (G1 stripProtectedNulls · P2002 merge) · صفر حذف · pacing عین سینک.
// ============================================================================
import fs from "node:fs";
import { db } from "@/lib/db";
import { stripProtectedNulls } from "@/lib/integrations/melketun/protected-nulls";
import {
  crmLogin,
  fetchModule,
  filingToProperty,
  resolveVtigerUsers,
  type FilingRow,
  type MyFilingRow,
} from "@/lib/integrations/melketun/sync";

const BUFFER_FILE = "upload/.runtime/pn049-filings-buffer.json";

/** استخراج props اینرسیا — عین منطق sync (خواندنیِ سبک) */
function extractInertiaProps(html: string): Record<string, unknown> | null {
  const m = html.match(/<div[^>]*id="app"[^>]*data-page="([^"]*)"/);
  if (!m) return null;
  try {
    const page = JSON.parse(
      m[1].replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    ) as { props?: Record<string, unknown>; component?: string };
    if (page.component?.startsWith("errors/")) return null;
    return page.props ?? null;
  } catch {
    return null;
  }
}

async function main() {
  const mode = process.argv[2] ?? "run";
  const errors: string[] = [];
  let rows: FilingRow[] = [];

  if (mode === "upsert") {
    rows = JSON.parse(fs.readFileSync(BUFFER_FILE, "utf8")) as FilingRow[];
    console.log(`[pn049] upsert از بافر: ${rows.length} ردیف`);
  } else {
    const secrets = JSON.parse(fs.readFileSync("upload/.runtime/melketun-secrets.json", "utf8"));
    const base = secrets.crm.base_url.replace(/\/$/, "");
    const jar = await crmLogin(base, secrets.crm.username, secrets.crm.password, errors);
    if (errors.some((e) => e.startsWith("POST /login-store") || e.startsWith("login verify"))) {
      throw new Error("CRM login failed: " + errors.join(" · "));
    }
    console.log(`[pn049] login OK — fetch ماژول آگهی‌ها (${new Date().toISOString()})`);
    const result = await fetchModule(base, jar, (n) => `/MelketunPublicFilingPlus${n > 1 ? `/${n}` : ""}`, "filings", errors);
    rows = result.rows as FilingRow[];
    // بافر ایمنی — اگر upsert قطع شد، فراخوان «upsert» آن را کامل می‌کند
    fs.writeFileSync(BUFFER_FILE + ".tmp", JSON.stringify(rows));
    fs.renameSync(BUFFER_FILE + ".tmp", BUFFER_FILE);
    console.log(`[pn049] fetch کامل: ${rows.length} آگهی · badPages=${result.badPages.length}`);
  }

  // ── متادیتا: specialists + myFilings (۱ درخواست) ──
  const secrets2 = JSON.parse(fs.readFileSync("upload/.runtime/melketun-secrets.json", "utf8"));
  const base2 = secrets2.crm.base_url.replace(/\/$/, "");
  const jar2 = await crmLogin(base2, secrets2.crm.username, secrets2.crm.password, errors);
  let specialists: { id: number; name: string }[] = [];
  let myFilings: MyFilingRow[] = [];
  try {
    const sc = await fetch(`${base2}/supports/valuations/create`, {
      headers: { Cookie: jar2.header(), Accept: "text/html" },
      redirect: "manual",
      signal: AbortSignal.timeout(30000),
    });
    if (sc.status === 200) {
      const props = extractInertiaProps(await sc.text());
      specialists = ((props?.specialists as { data?: { id: number; name: string }[] })?.data ?? []);
      myFilings = ((props?.myFilings as { data?: MyFilingRow[] })?.data ?? []);
    }
  } catch (e) {
    errors.push("specialists: " + String(e).slice(0, 80));
  }

  // ── حل نام کاربران (کش پایدار — فقط ناتمام‌ها زنده) ──
  const vtigerIds = [...new Set(rows.map((r) => String(r.assignedUser ?? "")).filter(Boolean))];
  const users = await resolveVtigerUsers(base2, jar2, vtigerIds, errors);
  const expertNameOf = (vt: unknown): string | null => {
    const k = String(vt ?? "");
    return k ? users[k]?.name ?? null : null;
  };
  const enrichByCode = new Map<string, MyFilingRow>();
  for (const mf of myFilings) if (mf.code) enrichByCode.set(mf.code.trim(), mf);

  // ── upsert افزودنی — عین حلقهٔ سینک (G1/G2 + P2002 merge) ──
  const runId = `pn049-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
  let upserted = 0, merged = 0, failed = 0;
  for (const f of rows) {
    try {
      const data = filingToProperty(f, runId, expertNameOf(f.assignedUser), enrichByCode.get((f.code ?? "").trim()) ?? null);
      try {
        await db.propertyRecord.upsert({ where: { id: data.id }, create: data, update: stripProtectedNulls(data) });
      } catch (e) {
        if ((e as { code?: string }).code !== "P2002") throw e;
        const { id: _drop, createdAt: _c, ...rest } = data;
        await db.propertyRecord.update({ where: { propertyCode: data.propertyCode }, data: stripProtectedNulls(rest) });
        merged++;
      }
      upserted++;
    } catch (e) {
      failed++;
      if (errors.length < 10) errors.push(`filing ${f.id}: ${String(e).slice(0, 90)}`);
    }
  }

  console.log(JSON.stringify({
    ok: failed === 0,
    mode,
    runId,
    fetched: rows.length,
    upserted,
    mergedDuplicates: merged,
    failed,
    specialists: specialists.length,
    myFilings: myFilings.length,
    usersResolved: Object.keys(users).length,
    errors: errors.slice(0, 6),
  }, null, 1));
  await db.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
