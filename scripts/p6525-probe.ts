// p6525-probe.ts — شاهد زندهٔ وضعیت فعلی پیش از تغییرات (P6525 BLOCK 0)
import { createSession } from "../src/lib/auth/session";
import { db } from "../src/lib/db";

async function main() {
  const { token } = await createSession(
    { personnelCode: "410031320", displayName: "راستی‌آزمایی P6525", role: "OWNER" },
    { ip: "127.0.0.1" },
    null
  );
  const base = "http://localhost:3000";
  const H = { authorization: `Bearer ${token}` };
  const out: Record<string, unknown> = {};

  // ۱) کاتالوگ آگهی‌ها — چند ردیف برمی‌گردد؟
  const l1 = await fetch(`${base}/api/crm/arm-catalog/listings`, { headers: H });
  const lj = (await l1.json()) as { rows: unknown[]; total: number };
  out.listingsRows = lj.rows.length;
  out.listingsTotal = lj.total;

  // ۲) کاتالوگ درخواست‌ها — چند ردیف برمی‌گردد؟
  const r1 = await fetch(`${base}/api/crm/arm-catalog/requests`, { headers: H });
  const rj = (await r1.json()) as { rows: unknown[]; total: number };
  out.requestsRows = rj.rows.length;
  out.requestsTotal = rj.total;

  // ۳) معاملات — چند ردیف با limit پیش‌فرض UI (5000)؟
  const t1 = await fetch(`${base}/api/crm/transactions?limit=5000`, { headers: H });
  const tj = (await t1.json()) as { rows: unknown[]; total: number };
  out.txRows = tj.rows.length;
  out.txTotal = tj.total;

  // ۴) باگ ۴/۵ — یک کد واقعی حاوی رقم ۵ بگیر و با ارقام فارسی جست‌وجو کن
  const sample = (lj.rows as Array<{ propertyCode: string }>[])[0] as unknown as { propertyCode: string };
  const withFive = (lj.rows as Array<{ propertyCode: string }>).find((r) => r.propertyCode.includes("5"));
  out.sampleCode = sample?.propertyCode;
  out.codeWithFive = withFive?.propertyCode;
  if (withFive) {
    const faCode = withFive.propertyCode.replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
    out.faQuery = faCode;
    const l2 = await fetch(`${base}/api/crm/arm-catalog/listings?code=${encodeURIComponent(faCode)}`, { headers: H });
    const l2j = (await l2.json()) as { rows: unknown[]; total: number };
    out.faCodeResultRows = l2j.rows.length; // اگر باگ ۴/۵ زنده باشد و کد شامل ۴ یا ۵ باشد ⇒ 0
    // همان کد با ارقام لاتین — مرجع
    const l3 = await fetch(`${base}/api/crm/arm-catalog/listings?code=${encodeURIComponent(withFive.propertyCode)}`, { headers: H });
    const l3j = (await l3.json()) as { rows: unknown[]; total: number };
    out.latinCodeResultRows = l3j.rows.length;
  }

  // ۵) شمارش مستقیم DB برای مقایسه
  const [p, q, t] = await Promise.all([
    db.propertyRecord.count(),
    db.requestRecord.count(),
    db.transactionRecord.count(),
  ]);
  out.dbCounts = { property: p, request: q, transaction: t };

  // ۶) دامنهٔ publish فعلی — BUILD_ID از /api/version
  try {
    const v = await fetch(`${base}/api/version`);
    out.localVersion = (await v.json()) as Record<string, unknown>;
  } catch { out.localVersion = "err"; }

  console.log(JSON.stringify(out, null, 2));
  await (db as unknown as { $disconnect: () => Promise<void> }).$disconnect();
}

void main();
