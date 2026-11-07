/**
 * pn016-backfill-pm.ts — مرحلهٔ ۵: Backfill نقش‌ها/شعبه از سامانهٔ PM
 * ---------------------------------------------------------------------------
 * ۱) رمزگشایی توکن PM مالک از PmConnection (AES-256-GCM با MELK_TOKEN_KEY)
 * ۲) GET realtors/list — پروفایل همهٔ پرسنل (code/mobileNumber/role/activationStatus)
 * ۳) برای هر User ما: تطبیق با کد پرسنلی → roleTitleFa + branchTitle
 * ۴) تطبیق نقش PM → نقش سامانه (نقش اجرایی → EXPERT و غیره) — فقط برای کاربرانی که
 *    نقش صریح ندارند (seed = صریح؛ backfill لایهٔ غنی‌ساز)
 * خروجی: download/pn016/backfill.json
 */
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";

process.env.DATABASE_URL = "file:/home/z/my-project/db/custom.db";
const db = new PrismaClient();

const PM_BASE = "https://pm-api.melketabriz.ir/api";

/** نقش‌های PM → نقش پنج‌سطحی (بند ۵.۲.۲) */
const PM_ROLE_MAP: Array<{ match: RegExp; role: string }> = [
  { match: /مدیر\s*عامل|مدیر\s*کل|CEO/i, role: "MANAGER" },
  { match: /مدیر/i, role: "MANAGER" },
  { match: /مشاور|کارشناس|املاک|realtor/i, role: "EXPERT" },
];

function mapPmRole(pmRole: string | null | undefined): string | null {
  if (!pmRole) return null;
  for (const m of PM_ROLE_MAP) if (m.match.test(pmRole)) return m.role;
  return null;
}

async function main() {
  const errors: string[] = [];
  const matched: Array<Record<string, unknown>> = [];
  const unmatched: Array<Record<string, unknown>> = [];
  const out: Record<string, unknown> = {
    council: "ملکا-شورا-ن۰۲۰-۱۴۰۵",
    workOrder: "PN-016",
    stage: "۵ — Backfill از PM",
    at: new Date().toISOString(),
    pmReachable: null as unknown,
    tokenSource: "PmConnection.tokenEnc (رمزگشایی AES-256-GCM)",
    realtorsFetched: 0,
  };

  // ۱) توکن PM
  const conn = await db.pmConnection.findFirst();
  if (!conn?.tokenEnc) {
    errors.push("PmConnection بدون توکن — PM هرگز وصل نشده یا توکن پاک شده");
    fs.mkdirSync("download/pn016", { recursive: true });
    fs.writeFileSync("download/pn016/backfill.json", JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  const { decryptSecret } = await import("../../src/lib/auth/crypto");
  let token: string | null = null;
  try {
    token = decryptSecret(conn.tokenEnc);
  } catch (e) {
    errors.push(`رمزگشایی توکن PM شکست: ${(e as Error).message}`);
  }
  if (!token) {
    fs.mkdirSync("download/pn016", { recursive: true });
    fs.writeFileSync("download/pn016/backfill.json", JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  // ۲) realtors/list
  interface PmRealtor {
    _id?: string; code?: string | number; fullName?: string; mobileNumber?: string | number;
    role?: { _id?: string; title?: string } | string; activationStatus?: Record<string, boolean>;
    businessId?: { _id?: string; title?: string; code?: number };
    registerStep?: number;
  }
  function pmRoleTitle(r: PmRealtor): string | null {
    if (!r.role) return null;
    return typeof r.role === "string" ? r.role : r.role.title ?? null;
  }
  function pmBusinessTitle(r: PmRealtor): string | null {
    return r.businessId?.title ?? null;
  }
  function pmActivation(r: PmRealtor): string | null {
    const a = r.activationStatus;
    if (!a) return null;
    return Object.entries(a).filter(([, v]) => v === true).map(([k]) => k).join(",") || null;
  }
  let realtors: PmRealtor[] = [];
  const ctl = new AbortController();
  const t1 = setTimeout(() => ctl.abort(), 60000);
  try {
    const res = await fetch(`${PM_BASE}/realtors/list`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: ctl.signal,
    });
    out.pmReachable = res.status;
    if (res.ok) {
      const j = (await res.json()) as { data?: PmRealtor[] | { list?: PmRealtor[] } };
      realtors = Array.isArray(j.data) ? j.data : j.data?.list ?? [];
    } else {
      errors.push(`realtors/list → HTTP ${res.status} (توکن منقضی؟)`);
    }
  } catch (e) {
    out.pmReachable = `خطا: ${(e as Error).name}`;
    errors.push(`fetch realtors/list شکست: ${(e as Error).message}`);
  } finally {
    clearTimeout(t1);
  }
  out.realtorsFetched = realtors.length;

  // ۳) تطبیق کاربران ما
  const users = await db.user.findMany();
  const byCode = new Map(realtors.filter((r) => r.code).map((r) => [String(r.code), r]));
  for (const u of users) {
    if (!u.personnelCode) { unmatched.push({ user: u.personnelCode ?? u.mobile, reason: "مهمان — بدون کد پرسنلی" }); continue; }
    const pm = byCode.get(u.personnelCode);
    if (!pm) { unmatched.push({ user: u.personnelCode, reason: "در realtors/list PM یافت نشد" }); continue; }

    const pmRole = pmRoleTitle(pm);
    const pmBusiness = pmBusinessTitle(pm);
    const patch: Record<string, unknown> = {};
    if (pmRole && pmRole !== u.roleTitleFa) patch.roleTitleFa = pmRole;
    if (pmBusiness && pmBusiness !== u.branchTitle) patch.branchTitle = pmBusiness;
    // نقش سامانه: فقط اگر USER نقش پیش‌فرض VIEWER دارد (خودساخت) → از نقش PM
    const mapped = mapPmRole(pmRole);
    if (u.role === "VIEWER" && mapped) {
      patch.role = mapped;
      const { defaultPermissionsForRole } = await import("../../src/lib/users/user-model");
      await db.userPermission.deleteMany({ where: { userId: u.id } });
      const perms = defaultPermissionsForRole(mapped as never);
      await db.userPermission.createMany({ data: perms.map((p) => ({ userId: u.id, ...p })) });
      patch.permissionsRewritten = perms.length;
    }
    if (Object.keys(patch).length > 0) {
      const { roleTitleFa, branchTitle, role } = patch as { roleTitleFa?: string; branchTitle?: string; role?: string };
      await db.user.update({ where: { id: u.id }, data: { roleTitleFa, branchTitle, role } });
    }
    matched.push({
      personnelCode: u.personnelCode,
      pmRole,
      pmBusiness,
      pmActivation: pmActivation(pm),
      applied: patch,
    });
  }

  out.matched = matched;
  out.unmatched = unmatched;
  out.errors = errors;
  out.rolesAfter = await db.user.groupBy({ by: ["role"], _count: { _all: true } });
  fs.mkdirSync("download/pn016", { recursive: true });
  fs.writeFileSync("download/pn016/backfill.json", JSON.stringify(out, null, 2));
  console.log(JSON.stringify({ pmReachable: out.pmReachable, realtorsFetched: out.realtorsFetched, matched: out.matched, unmatched: out.unmatched, errors: out.errors, rolesAfter: out.rolesAfter }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
