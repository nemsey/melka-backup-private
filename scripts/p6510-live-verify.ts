// p6510-live-verify.ts — راستی‌آزمایی زندهٔ مسیرهای کاتالوگ روی سرور dev (:3000)
import { createSession } from "../src/lib/auth/session";
import { db } from "../src/lib/db";

async function main() {
  // نشست آزمایشی OWNER با توکن سطح-اپ (بدون توکن ARM — مسیر ۴۱۲ هم تست می‌شود)
  const { token } = await createSession(
    { personnelCode: "410031320", displayName: "راستی‌آزمایی P6.5-10", role: "OWNER" },
    { ip: "127.0.0.1" },
    null
  );
  const base = "http://localhost:3000";
  const H = { authorization: `Bearer ${token}` };

  const out: Record<string, unknown> = {};

  // ۱) کاتالوگ آگهی‌ها — بدون فیلتر (سقف پیش‌فرض)
  const l1 = await fetch(`${base}/api/crm/arm-catalog/listings`, { headers: H });
  out.listingsStatus = l1.status;
  if (l1.ok) {
    const j = (await l1.json()) as { rows: unknown[]; total: number; enrichment: { total: number; complete: number; pending: number } };
    out.listingsTotal = j.total;
    out.listingsRows = j.rows.length;
    out.listingsEnrichment = j.enrichment;
    const first = j.rows[0] as Record<string, unknown> | undefined;
    out.listingSample = first
      ? { code: first.propertyCode, realtor: first.realtorName, owner: first.ownerName, mobile: first.ownerMobile, address: String(first.address ?? "").slice(0, 60) }
      : null;
  }

  // ۲) فیلتر کدآگهی (نمونهٔ واقعی از ردیف اول)
  if (out.listingSample) {
    const code = (out.listingSample as { code: string }).code;
    const l2 = await fetch(`${base}/api/crm/arm-catalog/listings?code=${encodeURIComponent(code)}`, { headers: H });
    out.listingByCodeStatus = l2.status;
    if (l2.ok) {
      const j = (await l2.json()) as { rows: { propertyCode: string; ownerName: string | null; ownerMobile: string | null; address: string | null }[] };
      out.listingByCode = j.rows.length >= 1 ? j.rows[0] : null;
    }
  }

  // ۳) فیلتر نام کارشناس
  const l3 = await fetch(`${base}/api/crm/arm-catalog/listings?realtorName=${encodeURIComponent("بابایان")}`, { headers: H });
  out.listingByRealtorStatus = l3.status;
  if (l3.ok) {
    const j = (await l3.json()) as { rows: unknown[]; total: number };
    out.listingByRealtorCount = j.total;
  }

  // ۴) کاتالوگ درخواست‌ها
  const r1 = await fetch(`${base}/api/crm/arm-catalog/requests`, { headers: H });
  out.requestsStatus = r1.status;
  if (r1.ok) {
    const j = (await r1.json()) as { rows: { requestCode: string; actorName: string | null; customerName: string | null; customerMobile: string | null }[]; total: number; enrichment: { total: number; complete: number; pending: number } };
    out.requestsTotal = j.total;
    out.requestsEnrichment = j.enrichment;
    out.requestSample = j.rows[0] ?? null;
  }

  // ۵) شاهد owner.read در AuditLog
  const w = await db.auditLog.findFirst({
    where: { action: "owner.read", entityType: "arm-request" },
    orderBy: { createdAt: "desc" },
  });
  out.ownerReadWitnessArmRequest = w ? w.detail : null;
  const w2 = await db.auditLog.findFirst({
    where: { action: "owner.read", entityType: "property" },
    orderBy: { createdAt: "desc" },
  });
  out.ownerReadWitnessProperty = w2 ? w2.detail : null;

  console.log(JSON.stringify(out, null, 1));

  // پاک‌سازی نشست آزمایشی
  await db.session.deleteMany({ where: { tokenHash: (await import("crypto")).createHash("sha256").update(token).digest("hex") } });
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
