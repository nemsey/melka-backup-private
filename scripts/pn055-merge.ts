/**
 * PN-055 — ادغام دادهٔ عمیق در DB (فاز C)
 * ---------------------------------------------------------------------------
 * منابع:
 *   1. download/pn055/pot-details.jsonl    — جزئیات درخواست‌ها (متقاضی+مالک+موبایل)
 *   2. download/pn055/filing-details.jsonl — جزئیات آگهی‌ها (مالک+موبایل+آدرس)
 * دکترین (G1 · stripProtectedNulls): غنی‌سازی بدون نابودی —
 *   مقدار تازهٔ غیرخالی = نوشتن (منبع بهتر: صفحهٔ جزئیات CRM)
 *   مقدار تازهٔ خالی = حفظ مقدار موجود (هرگز داده را پاک نکن)
 * اجرا: bun scripts/pn055-merge.ts
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync, existsSync, writeFileSync } from "fs";

const db = new PrismaClient();

interface PotRec {
  pid: string;
  customerName: string; customerSurname: string; customerMobile: string;
  customerLandline: string; referrerName: string; referrerMobile: string;
  ownerName: string; ownerMobile: string; ownerAddress: string;
  relatedFilings: { id: string; filingNo: string; ownerName: string; phone: string; consultantName: string; consultantPhone: string; addressDescription: string; latitude: string; longitude: string }[];
}

interface FilRec {
  fid: string;
  ownerName: string; ownerSurname: string; ownerMobile: string;
  customerMobile: string; customerName: string; landline: string;
  ownerAddress: string; address: string; area: string;
  relatedPotentials?: { id: string; potentialNo: string; contactName: string; customerType: string }[];
}

function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  const out: T[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line) as T); } catch { /* سطر ناقص */ }
  }
  return out;
}

const potRecs = readJsonl<PotRec>("download/pn055/pot-details.jsonl");
const filRecs = readJsonl<FilRec>("download/pn055/filing-details.jsonl");
console.log(`[merge] منابع: ${potRecs.length} درخواست · ${filRecs.length} آگهی`);

// حذف تکراری‌ها (آخرین رکورد برنده — خزش ازسرگیری ممکن است تکرار بنویسد)
const potMap = new Map<string, PotRec>();
for (const r of potRecs) potMap.set(r.pid, r);
const filMap = new Map<string, FilRec>();
for (const r of filRecs) filMap.set(r.fid, r);
console.log(`[merge] یکتا: ${potMap.size} درخواست · ${filMap.size} آگهی`);

// نقشهٔ مالک از relatedFilings (مسیر غیرمستقیم — برای آگهی‌های با صفحهٔ خراب)
const ownerFromRelated = new Map<string, { ownerName: string; ownerMobile: string }>();
for (const p of potMap.values()) {
  for (const rf of p.relatedFilings ?? []) {
    if (!rf.id && !rf.filingNo) continue;
    const key = rf.id || rf.filingNo;
    const prev = ownerFromRelated.get(key);
    const hasData = Boolean(rf.ownerName || rf.phone);
    if (!hasData) continue;
    // اولین دادهٔ غیرخالی برنده (یا غنی‌تر)
    if (!prev || (!prev.ownerMobile && rf.phone)) {
      ownerFromRelated.set(key, { ownerName: rf.ownerName || prev?.ownerName || "", ownerMobile: rf.phone || prev?.ownerMobile || "" });
    }
  }
}
console.log(`[merge] نقشهٔ مالک از relatedFilings: ${ownerFromRelated.size} آگهی`);

const report = {
  at: new Date().toISOString(),
  requestsTotal: potMap.size,
  requestsNameFilled: 0, requestsMobileFilled: 0, requestsFromRelated: 0,
  filingsTotal: filMap.size,
  filingsOwnerFilled: 0, filingsMobileFilled: 0,
  filingsFromRelated: 0, filingsAddressFilled: 0,
  websiteFilers: 0,
  errors: [] as string[],
};

// ─── ۱) درخواست‌ها (RequestRecord) ───
{
  const ids = [...potMap.keys()];
  for (let i = 0; i < ids.length; i++) {
    const pid = ids[i];
    const r = potMap.get(pid)!;
    try {
      const existing = await db.requestRecord.findUnique({ where: { id: pid }, select: { customerName: true, customerMobile: true, tenantId: true } });
      if (!existing || existing.tenantId !== "melketun") continue;
      const data: Record<string, string> = {};
      if (r.customerName && r.customerName !== existing.customerName) data.customerName = r.customerName;
      if (r.customerMobile?.length >= 10) data.customerMobile = r.customerMobile;
      if (Object.keys(data).length) {
        await db.requestRecord.update({ where: { id: pid }, data });
        if (data.customerName) report.requestsNameFilled++;
        if (data.customerMobile) report.requestsMobileFilled++;
      }
    } catch (e) {
      if (report.errors.length < 20) report.errors.push(`${pid}: ${String(e).slice(0, 80)}`);
    }
    if (i % 500 === 499) console.log(`[merge] درخواست‌ها: ${i + 1}/${ids.length}`);
  }
}

// ─── ۲) آگهی‌ها (PropertyRecord) ───
{
  // الف) مستقیم از filing-details
  const ids = [...filMap.keys()];
  for (let i = 0; i < ids.length; i++) {
    const fid = ids[i];
    const r = filMap.get(fid)!;
    try {
      const existing = await db.propertyRecord.findUnique({ where: { id: fid }, select: { ownerName: true, ownerMobile: true, address: true, tenantId: true } });
      if (!existing || existing.tenantId !== "melketun") continue;
      const data: Record<string, string> = {};
      if (r.ownerName) data.ownerName = r.ownerName;
      if (r.ownerMobile?.length >= 10) data.ownerMobile = r.ownerMobile;
      if (r.ownerAddress && !existing.address) data.address = r.ownerAddress;
      if (Object.keys(data).length) {
        await db.propertyRecord.update({ where: { id: fid }, data });
        if (r.ownerName) report.filingsOwnerFilled++;
        if (r.ownerMobile?.length >= 10) report.filingsMobileFilled++;
        if (data.address) report.filingsAddressFilled++;
      }
    } catch (e) {
      if (report.errors.length < 20) report.errors.push(`${fid}: ${String(e).slice(0, 80)}`);
    }
    if (i % 500 === 499) console.log(`[merge] آگهی‌ها (مستقیم): ${i + 1}/${ids.length}`);
  }

  // ب) غیرمستقیم از relatedFilings — فقط آگهی‌هایی که هنوز مالک/موبایل ندارند
  const relIds = [...ownerFromRelated.keys()];
  for (let i = 0; i < relIds.length; i++) {
    const key = relIds[i];
    const info = ownerFromRelated.get(key)!;
    try {
      // کلید = id (71x...) یا filingNo (ME...) — propertyCode یکتای سراسری است
      const existing = key.startsWith("71x")
        ? await db.propertyRecord.findUnique({ where: { id: key }, select: { id: true, ownerMobile: true, ownerName: true, tenantId: true } })
        : (await db.propertyRecord.findUnique({ where: { propertyCode: key }, select: { id: true, ownerMobile: true, ownerName: true, tenantId: true } }));
      if (!existing || existing.tenantId !== "melketun") continue;
      const data: Record<string, string> = {};
      if (!existing.ownerName && info.ownerName) data.ownerName = info.ownerName;
      if (!existing.ownerMobile && info.ownerMobile?.length >= 10) data.ownerMobile = info.ownerMobile;
      if (Object.keys(data).length) {
        await db.propertyRecord.update({ where: { id: existing.id }, data });
        report.filingsFromRelated++;
      }
    } catch (e) {
      if (report.errors.length < 20) report.errors.push(`rel:${key}: ${String(e).slice(0, 80)}`);
    }
    if (i % 500 === 499) console.log(`[merge] آگهی‌ها (غیرمستقیم): ${i + 1}/${relIds.length}`);
  }
}

// ─── ۳) نام متقاضیان از relatedPotentials (مسیر متقاطع) ───
{
  const relPot = new Map<string, string>();
  for (const r of filRecs) {
    for (const rp of r.relatedPotentials ?? []) {
      if (rp.id?.startsWith("13x") && rp.contactName && !relPot.has(rp.id)) relPot.set(rp.id, rp.contactName);
    }
  }
  report.requestsFromRelated = 0;
  for (const [pid, name] of relPot) {
    try {
      const existing = await db.requestRecord.findUnique({ where: { id: pid }, select: { customerName: true, tenantId: true } });
      if (!existing || existing.tenantId !== "melketun") continue;
      if (existing.customerName) continue; // نام موجود = حفظ
      await db.requestRecord.update({ where: { id: pid }, data: { customerName: name } });
      report.requestsFromRelated++;
    } catch (e) {
      if (report.errors.length < 20) report.errors.push(`relpot:${pid}: ${String(e).slice(0, 60)}`);
    }
  }
}

// ─── ۴) فایلرهای وب‌سایت (نام+موبایل کارشناس ثبت‌کننده — هر دو شعبه) ───
{
  const webRecs = readJsonl<{ code: string; filerName: string; filerMobile: string }>("download/pn055/website-filers.jsonl");
  report.websiteFilers = webRecs.length;
  // ذخیره در کش مرجع (بدون تغییر شِما) — detailsJson فله‌ای پرهزینه است؛
  // نقشهٔ کد→فایلر در RefListCache برای مصرف UI/گزارش
  const dir: Record<string, { filerName: string; filerMobile: string }> = {};
  for (const w of webRecs) dir[w.code] = { filerName: w.filerName, filerMobile: w.filerMobile };
  try {
    await db.refListCache.upsert({
      where: { key: "melketun-website-filers" },
      create: { key: "melketun-website-filers", dataJson: JSON.stringify(dir) },
      update: { dataJson: JSON.stringify(dir) },
    });
  } catch (e) {
    if (report.errors.length < 20) report.errors.push(`webfilers: ${String(e).slice(0, 60)}`);
  }
}

writeFileSync("download/pn055/merge-report.json", JSON.stringify(report, null, 2));
console.log("[merge] ✅ گزارش:", JSON.stringify({ ...report, errors: report.errors.length }, null, 1));
await db.$disconnect();
process.exit(0);
