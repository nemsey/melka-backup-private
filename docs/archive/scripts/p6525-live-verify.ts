// p6525-live-verify.ts — راستی‌آزمایی زندهٔ پس از تغییرات P6525 روی سرور dev (:3000)
// شاهدها: ۱) رفع باگ ۴/۵ در مسیر کامل API ۲) قانون فهرست (تمام ردیف‌ها) ۳) PWA
import { createSession } from "../src/lib/auth/session";
import { db } from "../src/lib/db";

async function main() {
  // صبر برای هات‌ری‌لود سرور dev
  await new Promise((r) => setTimeout(r, 1500));
  const { token } = await createSession(
    { personnelCode: "410031320", displayName: "راستی‌آزمایی زنده P6525", role: "OWNER" },
    { ip: "127.0.0.1" },
    null
  );
  const base = "http://localhost:3000";
  const H = { authorization: `Bearer ${token}` };
  const out: Record<string, unknown> = {};
  const fa = (s: string) => s.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);

  // ---- ۱) باگ ۴/۵ در فهرست آگهی: کد واقعی حاوی ۵ → فارسی = لاتین ----
  const lAll = await fetch(`${base}/api/crm/arm-catalog/listings`, { headers: H });
  const lj = (await lAll.json()) as { rows: Array<{ propertyCode: string }>; total: number };
  const with54 = lj.rows.find((r) => r.propertyCode.includes("5") && r.propertyCode.includes("4"));
  out.listings = { rows: lj.rows.length, total: lj.total, probeCode: with54?.propertyCode };
  if (with54) {
    const code = with54.propertyCode;
    const [faRes, laRes] = await Promise.all([
      fetch(`${base}/api/crm/arm-catalog/listings?code=${encodeURIComponent(fa(code))}`, { headers: H }),
      fetch(`${base}/api/crm/arm-catalog/listings?code=${encodeURIComponent(code)}`, { headers: H }),
    ]);
    const faJ = (await faRes.json()) as { rows: unknown[]; total: number };
    const laJ = (await laRes.json()) as { rows: unknown[]; total: number };
    out.listingsFaQuery = { code: fa(code), rows: faJ.rows.length, total: faJ.total };
    out.listingsLatinQuery = { code, rows: laJ.rows.length, total: laJ.total };
    out.bug45FixedListings = faJ.rows.length === laJ.rows.length && faJ.rows.length >= 1;
  }

  // ---- ۲) نام کارشناس با ي عربی در DB (شاهد زندهٔ DB: طهماسبي) ----
  const [n1, n2] = await Promise.all([
    fetch(`${base}/api/crm/arm-catalog/listings?realtorName=${encodeURIComponent("طهماسبي")}`, { headers: H }),
    fetch(`${base}/api/crm/arm-catalog/listings?realtorName=${encodeURIComponent("طهماسبی")}`, { headers: H }),
  ]);
  const n1j = (await n1.json()) as { total: number };
  const n2j = (await n2.json()) as { total: number };
  out.realtorYehEquivalence = { arabicInput: n1j.total, persianInput: n2j.total, equal: n1j.total === n2j.total };

  // ---- ۳) فهرست درخواست: کد واقعی حاوی ۵ ----
  const rAll = await fetch(`${base}/api/crm/arm-catalog/requests`, { headers: H });
  const rj = (await rAll.json()) as { rows: Array<{ requestCode: string }>; total: number };
  const rWith5 = rj.rows.find((r) => r.requestCode.includes("5"));
  out.requests = { rows: rj.rows.length, total: rj.total, probeCode: rWith5?.requestCode };
  if (rWith5) {
    const code = rWith5.requestCode;
    const [faRes, laRes] = await Promise.all([
      fetch(`${base}/api/crm/arm-catalog/requests?code=${encodeURIComponent(fa(code))}`, { headers: H }),
      fetch(`${base}/api/crm/arm-catalog/requests?code=${encodeURIComponent(code)}`, { headers: H }),
    ]);
    const faJ = (await faRes.json()) as { rows: unknown[] };
    const laJ = (await laRes.json()) as { rows: unknown[] };
    out.requestsFaQuery = { code: fa(code), rows: faJ.rows.length };
    out.requestsLatinQuery = { code, rows: laJ.rows.length };
    out.bug45FixedRequests = faJ.rows.length === laJ.rows.length && faJ.rows.length >= 1;
  }

  // ---- ۴) فهرست معاملات: تمام ردیف‌ها (قانون فهرست — بدون محدودیت) + کد فارسی ----
  const tAll = await fetch(`${base}/api/crm/transactions`, { headers: H });
  const tj = (await tAll.json()) as { rows: Array<{ propertyCode: string }>; total: number };
  out.transactions = { rows: tj.rows.length, total: tj.total };
  const tWith5 = tj.rows.find((r) => r.propertyCode.includes("5"));
  if (tWith5) {
    const code = tWith5.propertyCode;
    const [faRes, laRes] = await Promise.all([
      fetch(`${base}/api/crm/transactions?propertyCode=${encodeURIComponent(fa(code))}`, { headers: H }),
      fetch(`${base}/api/crm/transactions?propertyCode=${encodeURIComponent(code)}`, { headers: H }),
    ]);
    const faJ = (await faRes.json()) as { rows: unknown[] };
    const laJ = (await laRes.json()) as { rows: unknown[] };
    out.txFaQuery = { code: fa(code), rows: faJ.rows.length };
    out.txLatinQuery = { code, rows: laJ.rows.length };
    out.bug45FixedTx = faJ.rows.length === laJ.rows.length && faJ.rows.length >= 1;
  }

  // ---- ۵) وضعیت‌ها (فیلتر شش‌حالته) — نمونه: منتشر شده ----
  const st = await fetch(`${base}/api/crm/arm-catalog/listings?states=published`, { headers: H });
  const stj = (await st.json()) as { rows: unknown[]; total: number; statusCounts: Record<string, number> };
  out.statesPublished = { rows: stj.rows.length, expected: stj.statusCounts?.published };

  // ---- ۶) PWA — manifest و نصب‌پذیری ----
  const manifest = await fetch(`${base}/manifest.json`);
  out.manifest = { status: manifest.status, contentType: manifest.headers.get("content-type") };
  const sw = await fetch(`${base}/sw-v4.js`);
  out.serviceWorker = { status: sw.status };

  // ---- ۷) شمارش DB برای مقایسه ----
  const [p, q] = await Promise.all([db.propertyRecord.count(), db.requestRecord.count()]);
  out.dbCounts = { property: p, request: q };

  console.log(JSON.stringify(out, null, 2));
  await (db as unknown as { $disconnect: () => Promise<void> }).$disconnect();
}

void main();
