#!/usr/bin/env python3
"""rewire coverage route M4 + M1/M2 branch maps از PmPersonnelRecord به ExpertProfile"""
import re

p = "/home/z/my-project/src/app/api/coverage/route.ts"
s = open(p, encoding="utf-8").read()

# ── M1/M2: نقشهٔ شعبه از ExpertProfile ──
s = s.replace(
    """    const [pmBranchRows, pmEmploymentRows] = await Promise.all([
      db.pmPersonnelRecord.findMany({ where: { branchTitle: { not: null } }, select: { fullName: true, branchTitle: true } }),
      db.pmPersonnelRecord.findMany({ select: { id: true, employmentType: true, voipExtension: true } }),
    ]);""",
    """    const [pmBranchRows, pmEmploymentRows] = await Promise.all([
      db.expertProfile.findMany({ where: { branchTitle: { not: null } }, select: { fullName: true, branchTitle: true } }),
      db.expertProfile.findMany({ select: { id: true, employmentType: true, voipExtension: true } }),
    ]);""",
)

# ── M4: بازنویسی بر مبنای ExpertProfile (منبع یگانهٔ فهرست تازه) ──
old_m4 = re.search(r"    /\* ── M4: کارشناسان.*?(?=    const toTable)", s, re.S)
assert old_m4, "M4 block not found"
new_m4 = """    /* ── M4: کارشناسان — PN-008 (ثانیاً): منبع یگانهٔ ExpertProfile (PM) ── */
    const m4Total = await db.expertProfile.count();
    const m4Profiles = await db.expertProfile.findMany({
      select: { id: true, personnelCode: true, fullName: true, mobile: true, roleTitle: true, hireDate: true, address: true, branchTitle: true, employmentType: true, voipExtension: true, active: true, businessTitle: true },
    });
    const m4Filled: Record<string, number> = {
      fullName: m4Profiles.filter((p) => p.fullName).length,
      mobile: m4Profiles.filter((p) => p.mobile).length,
      personnelCode: m4Profiles.filter((p) => p.personnelCode).length,
      address: m4Profiles.filter((p) => p.address).length,
      businessTitle: m4Profiles.filter((p) => p.businessTitle).length,
      __branchM4: m4Profiles.filter((p) => p.branchTitle).length,
      roleTitle: m4Profiles.filter((p) => p.roleTitle).length,
      hireDate: m4Profiles.filter((p) => p.hireDate).length,
      __employmentType: m4Profiles.filter((p) => p.employmentType !== null).length,
      __voip: m4Profiles.filter((p) => p.voipExtension).length,
      active: m4Profiles.filter((p) => typeof p.active === "boolean").length,
    };

"""
s = s.replace(old_m4.group(0), new_m4)

# فیل‌پث‌های M4 به منبع تازه
s = s.replace('{ key: "fullName", title: "نام کامل", fillPath: "همگام‌سازی کارشناسان ARM (realtors/list)" }', '{ key: "fullName", title: "نام کامل", fillPath: "رجیستری PM (realtors/list)" }')
s = s.replace('{ key: "mobile", title: "موبایل", fillPath: "همگام‌سازی کارشناسان ARM + پشتیبان PM" }', '{ key: "mobile", title: "موبایل", fillPath: "رجیستری PM (realtors/list — mobileNumber)" }')
s = s.replace('{ key: "personnelCode", title: "کد پرسنلی", fillPath: "رجیستری پرسنل PM (realtors/list — منبع حقیقت)" }', '{ key: "personnelCode", title: "کد پرسنلی", fillPath: "رجیستری PM (realtors/list — code)" }')
s = s.replace('{ key: "businessTitle", title: "عنوان کسب‌وکار", fillPath: "همگام‌سازی کارشناسان ARM" }', '{ key: "businessTitle", title: "کسب‌وکار", fillPath: "رجیستری PM (businessId.title)" }')
s = s.replace('{ key: "active", title: "وضعیت فعال", fillPath: "همگام‌سازی کارشناسان ARM" }', '{ key: "active", title: "وضعیت فعال", fillPath: "رجیستری PM (isRegisteredCompleted)" }')

open(p, "w", encoding="utf-8").write(s)
print("coverage route rewired")
