/**
 * PN-056 — ترمیم خلوص ستون مالک/متقاضی (نکتهٔ ۲ مالک)
 * ---------------------------------------------------------------------------
 * کشف (۲۰۲۶-۱۰-۲۷): fallback عمومی sync.ts (f.ownerName/f.phone از فهرست CRM)
 * = «کارشناسِ واگذارشده» (فایلر) بود → ۱٬۱۹۳ ردیف آگهی ملکتون نام/موبایل کارشناس
 * در ستون مالک (rawOwnerName/ownerMobile) نشست. نکتهٔ ۲ مالک: نام کارشناس و شمارهٔ
 * موبایل هرگز نباید در ستون مالک فهرست آگهی ملکتون و ستون متقاضی درخواست باشد.
 *
 * این ترمیم (صفر-نابودی — دادهٔ هرگز حذف نمی‌شود):
 *   ۱) شاهد سطری: rawOwnerName == فایلرِ وب‌سایتِ همین propertyCode → پاک‌سازی
 *   ۲) رجیستری قطعی: نام ∈ کاربران CRM/ExpertRecord یا موبایل ∈ موبایل‌های قطعی
 *   ۳) هر مقدارِ پاک‌شده → در RefListCache کلید pn056-repair-trace (رد کامل) +
 *      از قبل در melketun-website-filers موجود است.
 *   ۴) درخواست‌ها: فقط با شاهد دوبعدی (نام+موبایل هر دو کارشناسی) پاک می‌شوند.
 * اجرا: bun scripts/pn056-repair-malak.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const normId = (s: unknown): string =>
  String(s ?? "").replace(/[\s\u200c\u200f\u200e]+/g, " ").trim();

const last10 = (s: unknown): string => {
  const d = String(s ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : "";
};

interface Registry {
  names: Set<string>;      // قطعی: users + ExpertRecord
  mobiles: Set<string>;    // قطعی: users + ExpertRecord
  filerByCode: Map<string, string>;        // شاهد سطری وب‌سایت
  filerMobileByCode: Map<string, string>;  // شاهد سطری وب‌سایت
}

async function loadRegistry(): Promise<Registry> {
  const reg: Registry = { names: new Set(), mobiles: new Set(), filerByCode: new Map(), filerMobileByCode: new Map() };
  const usersRow = await db.refListCache.findUnique({ where: { key: "melketun-users" } }).catch(() => null);
  if (usersRow?.dataJson) {
    try {
      const users = JSON.parse(usersRow.dataJson) as Record<string, { name?: unknown; mobile?: unknown }>;
      for (const u of Object.values(users)) {
        const n = normId(u?.name); const m = last10(u?.mobile);
        if (n && n.length >= 3) reg.names.add(n);
        if (m) reg.mobiles.add(m);
      }
    } catch { /* ناقص */ }
  }
  const filersRow = await db.refListCache.findUnique({ where: { key: "melketun-website-filers" } }).catch(() => null);
  if (filersRow?.dataJson) {
    try {
      const filers = JSON.parse(filersRow.dataJson) as Record<string, { filerName?: unknown; filerMobile?: unknown }>;
      for (const [code, u] of Object.entries(filers)) {
        const c = code.replace(/^["']+|["']+$/g, "").trim();
        const n = normId(u?.filerName); const m = last10(u?.filerMobile);
        if (c && n) reg.filerByCode.set(c, n);
        if (c && m) reg.filerMobileByCode.set(c, m);
      }
    } catch { /* ناقص */ }
  }
  // PN-056 — کارشناسان ثبت‌کنندهٔ وب‌سایت (آرایهٔ [نام، موبایل] — قطعی دوبعدی)
  const ownersRow = await db.refListCache.findUnique({ where: { key: "melketun-website-owners" } }).catch(() => null);
  if (ownersRow?.dataJson) {
    try {
      const owners = JSON.parse(ownersRow.dataJson) as [string, string][];
      for (const o of owners) {
        const n = normId(o?.[0]); const m = last10(o?.[1]);
        if (n && n.length >= 3) reg.names.add(n);
        if (m) reg.mobiles.add(m);
      }
    } catch { /* ناقص */ }
  }
  const experts = await db.expertRecord.findMany({
    where: { tenantId: "melketun" },
    select: { fullName: true, rawFullName: true, mobile: true, rawMobile: true },
  }).catch(() => []);
  for (const e of experts) {
    const n = normId(e.rawFullName ?? e.fullName); const m = last10(e.rawMobile ?? e.mobile);
    if (n && n.length >= 3) reg.names.add(n);
    if (m) reg.mobiles.add(m);
  }
  return reg;
}

async function main() {
  const reg = await loadRegistry();
  console.log(`[pn056] رجیستری: ${reg.names.size} نام قطعی · ${reg.mobiles.size} موبایل قطعی · ${reg.filerByCode.size} فایلر سطری`);

  // ─── ۱) آگهی ملکتون ───
  const props = await db.propertyRecord.findMany({
    where: { tenantId: "melketun", OR: [{ rawOwnerName: { not: null } }, { ownerMobile: { not: null } }] },
    select: { id: true, propertyCode: true, rawOwnerName: true, ownerMobile: true, ownerName: true },
  });
  console.log(`[pn056] آگهی ملکتون با مقدار مالک: ${props.length}`);

  const cleared: { id: string; code: string; name: string | null; mobile: string | null; reason: string }[] = [];
  let nameCleared = 0, mobileCleared = 0, kept = 0;

  for (const p of props) {
    const n = normId(p.rawOwnerName);
    const m = last10(p.ownerMobile);
    if (!n && !m) continue;
    const code = String(p.propertyCode ?? "").replace(/^["']+|["']+$/g, "").trim();
    const rowFiler = code ? reg.filerByCode.get(code) : undefined;
    const rowFilerMobile = code ? reg.filerMobileByCode.get(code) : undefined;

    // دلیل‌های پاک‌سازی — نکتهٔ ۲ مالک: نام/موبایل کارشناس در ستون مالک ممنوع
    let reason = "";
    if (n && rowFiler && n === rowFiler) reason = "filer-row";
    else if (m && rowFilerMobile && m === rowFilerMobile) reason = "filer-mobile-row";
    else if (n && reg.names.has(n)) reason = "registry-name";
    else if (m && reg.mobiles.has(m)) reason = "registry-mobile";

    if (!reason) { kept++; continue; }

    const data: Record<string, null> = {};
    if (n && (reason === "filer-row" || reason === "registry-name")) data.rawOwnerName = null;
    if (m && reason !== "registry-name") data.ownerMobile = null;
    // اگر نامِ فایلر پاک شد، موبایلِ هم‌ردیفِ فایلر هم هست؛ اگر موبایل پاک شد ولی نام
    // فایلر نیست (registry-mobile) نام باقی می‌ماند — نام ممکن است مالک واقعی باشد.
    if (data.rawOwnerName === null && m && (m === (rowFilerMobile ?? "") || reg.mobiles.has(m))) data.ownerMobile = null;

    if (!Object.keys(data).length) { kept++; continue; }
    if (data.rawOwnerName === null) nameCleared++;
    if (data.ownerMobile === null) mobileCleared++;
    cleared.push({ id: p.id, code, name: p.rawOwnerName, mobile: p.ownerMobile, reason });
    await db.propertyRecord.update({ where: { id: p.id }, data }).catch((e) =>
      console.log(`[pn056] خطا ${p.id}: ${String(e).slice(0, 60)}`));
  }
  console.log(`[pn056] آگهی: نام پاک ${nameCleared} · موبایل پاک ${mobileCleared} · سالم نگه‌داشته ${kept}`);

  // ─── ۲) درخواست ملکتون — فقط شاهد دوبعدی (نام+موبایل هر دو قطعی کارشناسی) ───
  const reqs = await db.requestRecord.findMany({
    where: { tenantId: "melketun", OR: [{ rawCustomerName: { not: null } }, { customerMobile: { not: null } }] },
    select: { id: true, rawCustomerName: true, customerMobile: true, source: true },
  });
  let reqCleared = 0;
  const reqTrace: { id: string; name: string | null; mobile: string | null; source: string | null }[] = [];
  for (const r of reqs) {
    const n = normId(r.rawCustomerName); const m = last10(r.customerMobile);
    if (!n && !m) continue;
    // شاهد دوبعدی سخت‌گیرانه: هر دو قطعی کارشناسی (تک‌بعدی = احتمال هم‌نامی واقعی)
    const twoDim = n && m && reg.names.has(n) && reg.mobiles.has(m);
    if (!twoDim) continue;
    reqTrace.push({ id: r.id, name: r.rawCustomerName, mobile: r.customerMobile, source: r.source });
    await db.requestRecord.update({ where: { id: r.id }, data: { rawCustomerName: null, customerName: null, customerMobile: null, rawCustomerMobile: null } }).catch(() => {});
    reqCleared++;
  }
  console.log(`[pn056] درخواست: پاک با شاهد دوبعدی ${reqCleared} (تمیز: شمارهٔ ${reqs.length} بازبینی شد)`);

  // ─── ۳) رد کامل (صفر-نابودی) در RefListCache ───
  const trace = {
    repairedAt: new Date().toISOString(),
    note: "PN-056 ترمیم نکتهٔ ۲ مالک — مقادیر پاک‌شدهٔ ستون مالک (کارشناس‌ها)؛ داده در melketun-website-filers/melketun-users/ExpertRecord همیشه موجود است",
    filingsCleared: cleared,
    filingsNameCleared: nameCleared,
    filingsMobileCleared: mobileCleared,
    filingsKept: kept,
    requestsCleared: reqTrace,
  };
  await db.refListCache.upsert({
    where: { key: "pn056-repair-trace" },
    create: { key: "pn056-repair-trace", dataJson: JSON.stringify(trace) },
    update: { dataJson: JSON.stringify(trace) },
  });
  console.log(`[pn056] ✅ رد ترمیم در RefListCache[pn056-repair-trace] — ${cleared.length} ردیف آگهی · ${reqCleared} درخواست`);
  await db.$disconnect();
  process.exit(0);
}

main().catch((e) => { console.error("[pn056] FATAL", e); process.exit(1); });
