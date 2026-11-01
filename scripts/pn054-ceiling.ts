/**
 * PN-054 — اندازه‌گیری دقیق سقف RBAC حساب سینک (صفحه‌بندی کامل نماهای خصوصی)
 * + آیا نمای خصوصی آگهی‌ها با fresh-login داده می‌دهد؟
 * اجرا: bun scripts/pn054-ceiling.ts
 */
import { crmLogin, fetchModule } from "@/lib/integrations/melketun/sync";
import { readFileSync, writeFileSync } from "fs";

const secrets = JSON.parse(
  readFileSync("upload/.runtime/melketun-secrets.json", "utf8"),
) as { crm: { base_url: string; username: string; password: string } };
const base = secrets.crm.base_url.replace(/\/$/, "");

const errors: string[] = [];
const jar = await crmLogin(base, secrets.crm.username, secrets.crm.password, errors);
console.log("[ceiling] login:", errors.length ? "FAIL " + errors.join("|") : "OK");

const out: Record<string, unknown> = { at: new Date().toISOString() };

// نمای خصوصی آگهی‌ها (ورود تازه — بدون خزش قبلی → بدون rate-limit)
const errF: string[] = [];
const privFilings = await fetchModule(
  base, jar,
  (n) => `/Melketunfilingplus${n > 1 ? `/${n}` : ""}`,
  "filings", errF,
);
console.log("[ceiling] private filings rows:", privFilings.rows.length, "badPages:", privFilings.badPages, "errors:", errF);

// نمای خصوصی درخواست‌ها
const errP: string[] = [];
const privPots = await fetchModule(
  base, jar,
  (n) => `/Potentials${n > 1 ? `/${n}` : ""}`,
  "potentials", errP,
);
console.log("[ceiling] private potentials rows:", privPots.rows.length, "badPages:", privPots.badPages, "errors:", errP);

// مخاطبین
const errCF: string[] = [];
const contactsF = await fetchModule(
  base, jar,
  (n) => `/contacts/filings${n > 1 ? `/${n}` : ""}`,
  "contacts", errCF,
);
const errCP: string[] = [];
const contactsP = await fetchModule(
  base, jar,
  (n) => `/contacts/potentials${n > 1 ? `/${n}` : ""}`,
  "contacts", errCP,
);
console.log("[ceiling] contacts filings:", contactsF.rows.length, "· contacts potentials:", contactsP.rows.length);

// نمونهٔ فیلدهای خصوصی آگهی (بدون افشای کامل — ۳ نمونه)
const sample = privFilings.rows.slice(0, 3).map((r) => ({
  code: r.code, ownerName: r.ownerName, phone: String(r.phone ?? "").replace(/(\d{4})\d+(\d{2})/, "$1***$2"),
  address: r.address ? "present" : null,
}));
console.log("[ceiling] private filings sample:", JSON.stringify(sample, null, 2));

out.privateFilings = { rows: privFilings.rows.length, badPages: privFilings.badPages, errors: errF };
out.privatePotentials = { rows: privPots.rows.length, badPages: privPots.badPages, errors: errP };
out.contacts = { filings: contactsF.rows.length, potentials: contactsP.rows.length };
out.privateCodes = privFilings.rows.map((r) => String(r.code ?? "")).filter(Boolean);
out.potentialCodes = privPots.rows.map((r) => String(r.code ?? "")).filter(Boolean);

writeFileSync("upload/.runtime/pn054-ceiling.json", JSON.stringify(out, null, 2));
console.log("[ceiling] ✅ نوشته شد: upload/.runtime/pn054-ceiling.json");
process.exit(0);
