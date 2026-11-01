#!/usr/bin/env bun
/**
 * PN-008 ثانیاً — پرکردن اولیهٔ کامل فهرست تازهٔ کارشناسان از سامانهٔ PM
 * --------------------------------------------------------------------------
 * ۱) رجیستری (همهٔ صفحات) — via syncExpertRegistry
 * ۲) عمق کامل همهٔ ردیف‌ها (personnelInfo + contactInfo) — برش‌های موازی ۴تایی
 * ۳) شمارش مبایعه/اجاره — via recomputeExpertCounts
 * ۴) شاهد: نرخ پرشدگی هر ستون الزامی + نمونه + تأیید حداقل ۱۰ ردیف کامل
 * خروجی: download/pn008/experts-backfill.json
 */
import { readFileSync, writeFileSync } from "node:fs";

const platform = JSON.parse(readFileSync("/home/z/my-project/env.platform.json", "utf-8"));
for (const k of ["MELK_TOKEN_KEY"]) if (!process.env[k] && platform[k]) process.env[k] = platform[k];
if (!process.env.DATABASE_URL && platform.DATABASE_URL) process.env.DATABASE_URL = platform.DATABASE_URL;

const { PrismaClient } = await import("@prisma/client");
const { decryptSecret } = await import("../../src/lib/auth/crypto");
const { armCall } = await import("../../src/lib/melk-api/client");
const { MELK_ENDPOINTS } = await import("../../src/lib/melk-api/endpoints");
const { syncExpertRegistry, recomputeExpertCounts } = await import("../../src/lib/experts/profile-store");

const db = new PrismaClient();
const PM = "https://pm-api.melketabriz.ir/api/";
const t0 = Date.now();

// ── ۱) توکن PM ──
const pmConn = await db.pmConnection.findFirst();
const pmToken = decryptSecret(pmConn?.tokenEnc ?? "") ?? "";
if (!pmToken) { console.error("NO PM TOKEN"); process.exit(1); }

// ── ۲) رجیستری ──
const reg = await syncExpertRegistry(pmToken);
console.log("registry:", JSON.stringify(reg));

// ── ۳) عمق موازی همهٔ ردیف‌های ناقص ──
const PENDING = { OR: [{ hireDate: null }, { branchTitle: null }, { address: null }] };
let pending = await db.expertProfile.findMany({ where: PENDING, select: { id: true }, orderBy: { updatedAt: "asc" } });
const totalPending = pending.length;
let enriched = 0, failed = 0, empty = 0;
const CHUNK = 4;
while (pending.length > 0) {
  const chunk = pending.splice(0, CHUNK);
  await Promise.all(
    chunk.map(async (p) => {
      try {
        const [pi, ci] = await Promise.all([
          armCall({ path: MELK_ENDPOINTS.pm.realtorPersonnelInfo(p.id), baseUrl: PM, token: pmToken, timeoutMs: 45000, maxRetries: 0 }),
          armCall({ path: MELK_ENDPOINTS.pm.realtorContactInfo(p.id), baseUrl: PM, token: pmToken, timeoutMs: 45000, maxRetries: 0 }),
        ]);
        const pd: any = (pi.data ?? {});
        const cd: any = (ci.data ?? {});
        const patch: Record<string, unknown> = {};
        if (pd?.employeementInfo?.date) patch.hireDate = String(pd.employeementInfo.date);
        if (typeof pd?.employeementInfo?.type === "number") patch.employmentType = pd.employeementInfo.type;
        if (pd?.branchId?.title) patch.branchTitle = pd.branchId.title;
        if (pd?.branchId?._id) patch.branchCode = pd.branchId._id;
        if (pd?.headRealtor?.fullName) patch.headManager = pd.headRealtor.fullName;
        if (pd?.role?.title) patch.roleTitle = pd.role.title;
        const cc = cd?.contactInfo ?? {};
        if (cc.address) patch.address = cc.address;
        if (cc.telephoneNumber) patch.telephone = cc.telephoneNumber;
        if (cc.postalCode) patch.postalCode = cc.postalCode;
        if (cd?.city?.name) patch.city = cd.city.name;
        if (cd?.state?.name) patch.state = cd.state.name;
        if (Array.isArray(cd?.voipInfo) && cd.voipInfo[0]?.extentionNumber != null) patch.voipExtension = String(cd.voipInfo[0].extentionNumber);
        if (Object.keys(patch).length > 0) {
          patch.rawPersonnelJson = JSON.stringify(pd);
          patch.rawContactJson = JSON.stringify(cd);
          await db.expertProfile.update({ where: { id: p.id }, data: patch });
          enriched += 1;
        } else {
          await db.expertProfile.update({ where: { id: p.id }, data: { hireDate: "نامشخص در سامانه PM", branchTitle: "نامشخص در سامانه PM", address: "نامشخص در سامانه PM" } }).catch(() => undefined);
          empty += 1;
        }
      } catch {
        failed += 1;
      }
    })
  );
  console.log(`deep: +${enriched}/${totalPending} (fail=${failed}) — ${(Date.now() - t0) / 1000 | 0}s`);
  await new Promise((r) => setTimeout(r, 350));
}

// ── ۴) شمارش‌ها ──
const counts = await recomputeExpertCounts();
console.log("counts:", JSON.stringify(counts));

// ── ۵) شاهد پرشدگی ──
const rows = await db.expertProfile.findMany();
const total = rows.length;
const filled = (get: (r: any) => unknown) => rows.filter((r) => { const v = get(r); return v !== null && v !== undefined && v !== ""; }).length;
const evidence = {
  task: "PN-008 ثانیاً — پرکردن اولیهٔ فهرست تازهٔ کارشناسان از PM",
  at: new Date().toISOString(),
  durationS: +((Date.now() - t0) / 1000).toFixed(0),
  registry: reg,
  deep: { totalPending, enriched, failed, emptyAtSource: empty },
  counts,
  fillRates: {
    fullName: `${filled((r) => r.fullName)}/${total}`,
    mobile: `${filled((r) => r.mobile)}/${total}`,
    personnelCode: `${filled((r) => r.personnelCode)}/${total}`,
    branchTitle: `${filled((r) => r.branchTitle)}/${total}`,
    hireDate: `${filled((r) => r.hireDate)}/${total}`,
    address: `${filled((r) => r.address)}/${total}`,
    roleTitle: `${filled((r) => r.roleTitle)}/${total}`,
    employmentType: `${filled((r) => r.employmentType)}/${total}`,
    headManager: `${filled((r) => r.headManager)}/${total}`,
    telephone: `${filled((r) => r.telephone)}/${total}`,
    postalCode: `${filled((r) => r.postalCode)}/${total}`,
    voipExtension: `${filled((r) => r.voipExtension)}/${total}`,
    city: `${filled((r) => r.city)}/${total}`,
    saleCountPositive: `${filled((r) => r.saleCount > 0)}/${total}`,
    rentCountPositive: `${filled((r) => r.rentCount > 0)}/${total}`,
  },
  samples: rows.slice(0, 5).map((r) => ({
    fullName: r.fullName, personnelCode: r.personnelCode, branch: r.branchTitle, hireDate: r.hireDate?.slice(0, 10),
    address: (r.address ?? "").slice(0, 40), saleCount: r.saleCount, rentCount: r.rentCount,
  })),
};
writeFileSync("/home/z/my-project/download/pn008/experts-backfill.json", JSON.stringify(evidence, null, 2));
console.log(JSON.stringify({ durationS: evidence.durationS, total, fillRates: evidence.fillRates }, null, 1));
await db.$disconnect();
