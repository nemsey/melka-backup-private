// ============================================================================
// PN-051 — شاهد زندهٔ نهایی چهارگام (پس از بیلد e99b433):
//   گام ۱-ب: دانلود/آپلود اکسل هر ۸ فهرست (۴ موجودیت × ۲ داشبورد)
//   گام ۲+۳: حساب مالک (کدمستر) — رویت کامل هر ۸ فهرست + ستون‌های مالک/متقاضی
//   گام ۱-الف: وضعیت اتصال ARM/PM (هر دو باید متصل باشند — شاهد امروز)
// اجرا: bun scripts/pn051/live-witness.mjs
// ============================================================================
import fs from "fs";
import path from "path";

const BASE = "http://localhost:3000";
const OUT_DIR = path.join(import.meta.dir, "logs", "exports");
fs.mkdirSync(OUT_DIR, { recursive: true });

// کد مدیر — فقط از env خوانده می‌شود؛ هرگز چاپ نمی‌شود (قانون ۱۲/۱۸)
function masterCode() {
  const envLocal = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
  const m = envLocal.match(/^MASTER_ACCESS_CODE=(.+)$/m);
  if (!m) throw new Error("MASTER_ACCESS_CODE in .env.local not found");
  return m[1].trim().replace(/^["']|["']$/g, "");
}

async function api(pathname, opts = {}) {
  const res = await fetch(`${BASE}${pathname}`, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
    signal: AbortSignal.timeout(opts.timeoutMs ?? 60_000),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-json */ }
  return { status: res.status, json, text };
}

async function main() {
  const report = { login: {}, lists: {}, exports: {}, imports: {}, connections: {}, summary: {} };

  // ── ۰) ورود مالک با کدمستر ──
  const login = await api("/api/auth/master-login", {
    method: "POST",
    body: JSON.stringify({ masterCode: masterCode() }),
  });
  if (login.status !== 200 || !login.json?.ok) {
    console.error("MASTER LOGIN FAILED:", login.status, login.json);
    process.exit(1);
  }
  const token = login.json.token;
  const auth = { Authorization: `Bearer ${token}` };
  report.login = {
    ok: true,
    role: login.json.user?.role,
    displayName: login.json.user?.displayName,
    personnelCode: login.json.user?.personnelCode,
  };
  console.log("[witness] master login ok — role:", login.json.user?.role, "· name:", login.json.user?.displayName);

  const TENANTS = ["tabriz", "melketun"];
  const LISTS = {
    listings: "/api/crm/arm-catalog/listings",
    requests: "/api/crm/arm-catalog/requests",
    transactions: "/api/crm/transactions",
    experts: "/api/experts",
  };

  // ── ۱) رویت هر ۸ فهرست در حساب مالک ──
  for (const tenant of TENANTS) {
    for (const [entity, endpoint] of Object.entries(LISTS)) {
      const r = await api(`${endpoint}?tenantId=${tenant}&limit=3`, { headers: auth, timeoutMs: 90_000 });
      const key = `${entity}:${tenant}`;
      if (r.status !== 200 || !r.json?.ok) {
        report.lists[key] = { ok: false, status: r.status };
        console.log(`[witness] LIST ${key} → HTTP ${r.status} ❌`);
        continue;
      }
      const total = r.json.total ?? r.json.pagination?.total ?? r.json.rows?.length ?? r.json.data?.total ?? null;
      const rows = r.json.rows ?? r.json.data?.rows ?? r.json.data ?? [];
      // ستون‌های کلیدی: مالک (listings) · متقاضی (requests)
      let ownerFilled = null, applicantFilled = null;
      if (entity === "listings" && Array.isArray(rows) && rows.length) {
        ownerFilled = rows.filter((x) => x.ownerName || x.ownerMobile).length;
      }
      if (entity === "requests" && Array.isArray(rows) && rows.length) {
        applicantFilled = rows.filter((x) => x.customerName).length;
      }
      report.lists[key] = { ok: true, total, sampleRows: Array.isArray(rows) ? rows.length : "n/a", ownerFilled, applicantFilled };
      console.log(`[witness] LIST ${key} → total=${total} rows=${Array.isArray(rows) ? rows.length : "n/a"} ✓`);
    }
  }

  // ── ۲) دانلود اکسل هر ۸ فهرست ──
  const EXPORTS = {
    listings: (t) => `/api/crm/export/listings?tenantId=${t}`,
    requests: (t) => `/api/crm/export/requests?tenantId=${t}`,
    transactions: (t) => `/api/crm/export/transactions?tenantId=${t}`,
    experts: (t) => `/api/experts/export?tenantId=${t}`,
  };
  const ExcelJSmod = await import("exceljs");
  const ExcelJS = ExcelJSmod.default ?? ExcelJSmod;
  for (const tenant of TENANTS) {
    for (const [entity, mk] of Object.entries(EXPORTS)) {
      const key = `${entity}:${tenant}`;
      const res = await fetch(`${BASE}${mk(tenant)}`, { headers: auth, signal: AbortSignal.timeout(120_000) });
      if (!res.ok) {
        report.exports[key] = { ok: false, status: res.status };
        console.log(`[witness] EXPORT ${key} → HTTP ${res.status} ❌`);
        continue;
      }
      const buf = Buffer.from(await res.arrayBuffer());
      const file = path.join(OUT_DIR, `${entity}-${tenant}.xlsx`);
      fs.writeFileSync(file, buf);
      // صحت فایل: بازکردن با exceljs + شمارش ردیف‌ها
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf);
      const ws = wb.worksheets[0];
      const headerRow = ws?.getRow(1);
      const headers = [];
      headerRow?.eachCell({ includeEmpty: false }, (c) => headers.push(String(c.value ?? "")));
      const dataRows = (ws?.rowCount ?? 1) - 1;
      report.exports[key] = {
        ok: true, bytes: buf.length, rows: dataRows, sheet: ws?.name,
        hasOwnerCol: headers.includes("مالک"), hasApplicantCol: headers.includes("متقاضی"),
      };
      console.log(`[witness] EXPORT ${key} → ${buf.length}b · rows=${dataRows} · sheet="${ws?.name}" ✓`);
    }
  }

  // ── ۳) آپلود (round-trip) هر ۸ فایل — ایمپورت ایدمپوتنت ──
  for (const tenant of TENANTS) {
    for (const entity of Object.keys(EXPORTS)) {
      const key = `${entity}:${tenant}`;
      const file = path.join(OUT_DIR, `${entity}-${tenant}.xlsx`);
      if (!fs.existsSync(file)) { report.imports[key] = { ok: false, reason: "export missing" }; continue; }
      const form = new FormData();
      form.append("file", new Blob([fs.readFileSync(file)]), path.basename(file));
      const q = tenant === "melketun" ? "?tenantId=melketun" : "";
      const res = await fetch(`${BASE}/api/crm/import/${entity}${q}`, {
        method: "POST",
        headers: auth,
        body: form,
        signal: AbortSignal.timeout(180_000),
      });
      const json = await res.json().catch(() => null);
      report.imports[key] = { ok: res.ok && json?.ok, status: res.status, total: json?.total, created: json?.created, updated: json?.updated, skipped: json?.skipped, errors: (json?.errors ?? []).slice(0, 2) };
      console.log(`[witness] IMPORT ${key} → HTTP ${res.status} · total=${json?.total} created=${json?.created} updated=${json?.updated} ${res.ok && json?.ok ? "✓" : "❌"}`);
    }
  }

  // ── ۴) وضعیت اتصال ARM/PM (گام ۱-الف — شاهد زنده) ──
  for (const [name, ep] of [["arm", "/api/arm/connection"], ["pm", "/api/pm/connection"]]) {
    const r = await api(ep, { headers: auth });
    report.connections[name] = r.json?.connection
      ? { status: r.json.connection.status, hasToken: r.json.connection.hasToken, role: r.json.connection.role }
      : { status: "unknown", http: r.status };
    console.log(`[witness] CONNECTION ${name} → ${r.json?.connection?.status ?? "http " + r.status}`);
  }

  // ── جمع‌بندی ──
  const listsOk = Object.values(report.lists).filter((x) => x.ok).length;
  const exportsOk = Object.values(report.exports).filter((x) => x.ok && x.rows > 0).length;
  const importsOk = Object.values(report.imports).filter((x) => x.ok).length;
  report.summary = {
    listsOk: `${listsOk}/8`,
    exportsOk: `${exportsOk}/8`,
    importsOk: `${importsOk}/8`,
    arm: report.connections.arm?.status,
    pm: report.connections.pm?.status,
  };
  fs.writeFileSync(path.join(import.meta.dir, "logs", "live-witness.json"), JSON.stringify(report, null, 1));
  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(report.summary, null, 1));
  process.exit(listsOk === 8 && exportsOk === 8 && importsOk === 8 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
