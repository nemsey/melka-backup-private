// ============================================================================
// PN-051/گام ۲+۳ — ادغام هدفمند «نمای خصوصی» CRM ملکتون در DB (موتور دو-نمایی)
// ============================================================================
// فقط رکوردهای قابل‌دسترس حساب سینک (RBAC سمت CRM) — افزودنی · stripProtectedNulls
// (null هرگز روی دادهٔ پر نمی‌نشیند — G1/G2). با حساب مدیر همین مسیر پوشش کامل می‌دهد.
// اجرا: DATABASE_URL=file:...custom.db bun scripts/pn051/merge-private-views.ts
// ============================================================================
import { crmLogin, fetchModule, filingToProperty, potentialToRequest, type FilingRow, type PotentialRow } from "@/lib/integrations/melketun/sync";
import { stripProtectedNulls } from "@/lib/integrations/melketun/protected-nulls";
import { db } from "@/lib/db";
import fs from "fs";
import path from "path";

const SECRET_FILE = path.join(process.cwd(), "upload/.runtime/melketun-secrets.json");
const secrets = JSON.parse(fs.readFileSync(SECRET_FILE, "utf8")) as {
  crm: { base_url: string; username: string; password: string };
};

async function main() {
  const t0 = Date.now();
  const errors: string[] = [];
  const base = secrets.crm.base_url;
  const jar = await crmLogin(base, secrets.crm.username, secrets.crm.password, errors);
  if (errors.length) { console.error("login errors:", errors); process.exit(1); }
  console.log("[pn051-merge] login ok");

  // ── واکشی نماهای خصوصی + نقشه‌های تماس ──
  const privFilings = await fetchModule(base, jar, (n) => `/Melketunfilingplus${n > 1 ? `/${n}` : ""}`, "filings", []);
  const privPotentials = await fetchModule(base, jar, (n) => `/Potentials${n > 1 ? `/${n}` : ""}`, "potentials", []);
  const contactsFilings = await fetchModule(base, jar, (n) => `/contacts/filings${n > 1 ? `/${n}` : ""}`, "contacts", []);
  const contactsPotentials = await fetchModule(base, jar, (n) => `/contacts/potentials${n > 1 ? `/${n}` : ""}`, "contacts", []);
  console.log(`[pn051-merge] private rows: filings=${privFilings.rows.length} potentials=${privPotentials.rows.length} contactsFilings=${contactsFilings.rows.length} contactsPotentials=${contactsPotentials.rows.length}`);

  const phoneOfFilingContact = new Map<string, string>();
  for (const r of contactsFilings.rows) {
    const nm = String(r.ownerName ?? "").trim();
    const ph = String(r.phone ?? "").replace(/\D/g, "");
    if (nm && ph && !phoneOfFilingContact.has(nm)) phoneOfFilingContact.set(nm, ph);
  }
  const phoneOfPotContact = new Map<string, string>();
  for (const r of contactsPotentials.rows) {
    const nm = String(r.ownerName ?? "").trim();
    const ph = String(r.phone ?? "").replace(/\D/g, "");
    if (nm && ph && !phoneOfPotContact.has(nm)) phoneOfPotContact.set(nm, ph);
  }

  const runId = `pn051-merge-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
  let filingsFilledOwner = 0, filingsFilledMobile = 0, filingsMissingInDb = 0, filingsMissingInPublicDb = 0;
  let potsFilledName = 0, potsFilledMobile = 0, potsMissingInDb = 0;

  // ── آگهی‌ها: مالک واقعی + موبایل (نمای خصوصی → rawOwnerName/ownerMobile) ──
  for (const r of privFilings.rows) {
    const f = r as unknown as FilingRow;
    const owner = String(f.ownerName ?? "").trim();
    const phone = String(f.phone ?? "").replace(/\D/g, "") || (owner ? phoneOfFilingContact.get(owner) ?? "" : "");
    if (!owner && !phone) continue; // بدون دادهٔ مالک — رد
    const existing = await db.propertyRecord.findUnique({ where: { id: String(f.id) } }).catch(() => null)
      ?? await db.propertyRecord.findUnique({ where: { propertyCode: String(f.code ?? "").trim() } }).catch(() => null);
    if (!existing) {
      // رکورد در DB نیست — با نگاشت استاندارد سینک ایجاد (additive create)
      const data = filingToProperty(f, runId, null, null);
      try {
        await db.propertyRecord.create({ data });
        filingsMissingInDb++;
        filingsFilledOwner++;
      } catch (e) {
        errors.push(`create filing ${f.code}: ${e instanceof Error ? e.message.slice(0, 100) : e}`);
      }
      continue;
    }
    const patch: Record<string, unknown> = { extractedAt: new Date(), extractionBatchId: runId, normalizationVersion: "pn047-v3" };
    if (owner && !existing.rawOwnerName) { patch.rawOwnerName = owner; filingsFilledOwner++; }
    if (phone && !existing.ownerMobile) { patch.ownerMobile = phone; filingsFilledMobile++; }
    await db.propertyRecord.update({ where: { id: existing.id }, data: patch }).catch((e: unknown) => {
      errors.push(`update filing ${f.code}: ${e instanceof Error ? e.message.slice(0, 100) : e}`);
    });
  }

  // ── درخواست‌ها: متقاضی + موبایل (نمای خصوصی → customerName/customerMobile) ──
  for (const r of privPotentials.rows) {
    const p = r as unknown as PotentialRow;
    const cname = String(p.contactName ?? "").trim();
    if (!cname) continue; // بدون نام متقاضی — رد
    const existing = await db.requestRecord.findUnique({ where: { id: String(p.id) } }).catch(() => null)
      ?? (p.code ? await db.requestRecord.findUnique({ where: { requestCode: String(p.code).trim() } }).catch(() => null) : null);
    if (!existing) {
      const data = potentialToRequest(p, runId, null);
      try {
        await db.requestRecord.create({ data });
        potsMissingInDb++;
        potsFilledName++;
      } catch (e) {
        errors.push(`create potential ${p.code}: ${e instanceof Error ? e.message.slice(0, 100) : e}`);
      }
      continue;
    }
    const patch: Record<string, unknown> = { extractedAt: new Date(), extractionBatchId: runId, normalizationVersion: "pn047-v3" };
    if (!existing.customerName) { patch.customerName = cname; patch.rawCustomerName = cname; potsFilledName++; }
    if (!existing.customerMobile) {
      const ph = phoneOfPotContact.get(cname);
      if (ph) { patch.customerMobile = ph; potsFilledMobile++; }
    }
    await db.requestRecord.update({ where: { id: existing.id }, data: stripProtectedNulls(patch as never) }).catch((e: unknown) => {
      errors.push(`update potential ${p.code}: ${e instanceof Error ? e.message.slice(0, 100) : e}`);
    });
  }

  // ── شاهد پایانی ──
  const m7 = await db.propertyRecord.count({ where: { tenantId: "melketun" } });
  const m7owner = await db.propertyRecord.count({ where: { tenantId: "melketun", rawOwnerName: { not: null } } });
  const m7mobile = await db.propertyRecord.count({ where: { tenantId: "melketun", ownerMobile: { not: null } } });
  const m8 = await db.requestRecord.count({ where: { tenantId: "melketun" } });
  const m8name = await db.requestRecord.count({ where: { tenantId: "melketun", customerName: { not: null } } });
  const m8mobile = await db.requestRecord.count({ where: { tenantId: "melketun", customerMobile: { not: null } } });

  console.log(JSON.stringify({
    ok: errors.length === 0,
    durationMs: Date.now() - t0,
    filings: { privateRows: privFilings.rows.length, filledOwner: filingsFilledOwner, filledMobile: filingsFilledMobile, createdMissing: filingsMissingInDb, notInPublicView: filingsMissingInPublicDb },
    potentials: { privateRows: privPotentials.rows.length, filledName: potsFilledName, filledMobile: potsFilledMobile, createdMissing: potsMissingInDb },
    witness: {
      M7: { total: m7, ownerFilled: m7owner, mobileFilled: m7mobile },
      M8: { total: m8, nameFilled: m8name, mobileFilled: m8mobile },
    },
    errors: errors.slice(0, 8),
  }, null, 1));
  process.exit(errors.length === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
