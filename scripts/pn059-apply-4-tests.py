#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PN-059 فاز ۴: تست‌ها"""
import sys

def cut_between(src, start_marker, end_marker=None, to_end=False):
    i = src.find(start_marker)
    if i < 0:
        print(f"  !! not found: {start_marker[:60]!r}"); sys.exit(1)
    if to_end:
        return src[:i].rstrip() + "\n"
    j = src.find(end_marker, i)
    if j < 0:
        print(f"  !! end not found: {end_marker[:50]!r}"); sys.exit(1)
    return src[:i] + src[j:]

# ═══ حذف تست‌های تماماً ملکتونی ═══
import subprocess
r = subprocess.run(["git", "rm", "-q",
  "tests/pn050/merge-law.test.ts", "tests/pn050/db-revert.test.ts",
  "tests/pn054-private-retry.test.ts", "tests/pn055-deep-engine.test.ts",
  "tests/pn056-malak-purity.test.ts"], capture_output=True)
print("git rm tests:", "OK" if r.returncode == 0 else r.stderr.decode()[:200])

# ═══ pn050/journal-replay ═══
p = "tests/pn050/journal-replay.test.ts"
src = open(p).read().replace('"melketun-sync"', '"generic"')
open(p, "w").write(src)
print("✓ journal-replay.test.ts")

# ═══ pn049 ═══
p = "tests/pn049-login-freedom.test.ts"
src = open(p).read()
src = cut_between(src, 'describe("PN-049 · B) ستون مناطق فهرست درخواست ملکتون', 'describe("PN-049 · C)')
src = src.replace('''    // شاهد pn049-areas-pre/post (G6_PASS): backfill فقط رشته‌ها را درجاً تجزیه کرد.
    // قانون G2 (افزایشی): شمارش فقط می‌تواند رشد کند — کف = شاهد G6 جلسهٔ ۱۴۰۵/۰۸/۰۱
    expect(propertyTotal).toBeGreaterThanOrEqual(32874);
    expect(propertyMelketun).toBeGreaterThanOrEqual(5006);
    expect(requestTotal).toBeGreaterThanOrEqual(29484);
    expect(requestMelketun).toBeGreaterThanOrEqual(3904);''',
'''    // PN-059 (دستور مالک ۱۴۰۵/۰۸/۱۱): دادهٔ ملکتون حذف شد — شمارش tenant ملکتون باید
    // صفر باشد و کل تبریز دست‌نخورده بماند (کف = شاهد G6 منهای ردیف‌های ملکتون).
    expect(propertyMelketun).toBe(0);
    expect(requestMelketun).toBe(0);
    expect(propertyTotal).toBeGreaterThanOrEqual(27800);
    expect(requestTotal).toBeGreaterThanOrEqual(25500);''')
i = src.find('describe("PN-049 · E)')
if i > 0:
    src = src[:i].rstrip() + "\n"
open(p, "w").write(src)
print("✓ pn049-login-freedom.test.ts")

# ═══ pn051 ═══
p = "tests/pn051-four-steps.test.ts"
src = open(p).read()
src = src.replace('describe("PN-051 · گام ۱-ب — دانلود/آپلود اکسل فهرست‌های چهارگانهٔ هر دو داشبورد", () => {',
                  'describe("PN-051 · گام ۱-ب — دانلود/آپلود اکسل فهرست‌های چهارگانه (PN-059: تک-داشبورد تبریز)", () => {')
src = src.replace('''  test("۱-ب-۲) روت ایمپورت tenantId را از query می‌خواند", () => {
    const src = read("src/app/api/crm/import/[entity]/route.ts");
    expect(src).toContain('searchParams.get("tenantId")');
    expect(src).toContain("runImport(entity as ImportEntity, sheet, file.name, tenantKey)");
  });

  test("۱-ب-۳) دکمهٔ بارگذاری اکسل tenant را می‌فرستد (ملکتون ⇒ ?tenantId=melketun)", () => {
    const src = read("src/components/app/shared/excel-import-button.tsx");
    expect(src).toContain('tenantId?: "tabriz" | "melketun"');
    expect(src).toContain("?tenantId=melketun");
  });
''', '''  test("۱-ب-۲) روت ایمپورت — PN-059: همیشه ملک تبریز (tenantId بازنشسته)", () => {
    const src = read("src/app/api/crm/import/[entity]/route.ts");
    expect(src).toContain("runImport(entity as ImportEntity, sheet, file.name, null)");
  });
''')
src = src.replace('''      expect(src).toContain(`ExcelImportButton entity=${entity}`);
      expect(src).toContain('tenantId={tenantId ?? "tabriz"}');
      void name;''', '''      expect(src).toContain(`ExcelImportButton entity=${entity}`);
      void name;''')
src = src.replace('  test("۱-ب-۵) خروجی اکسل هر ۸ مسیر tenant را می‌پذیرد (۴ موجودیت × ۲ داشبورد)", () => {',
                  '  test("۱-ب-۵) خروجی اکسل tenant را می‌پذیرد (تک-tenant — PN-059)", () => {')
i = src.find('// ─────────────── گام دوم: سینک دو-نمایی (مالک ملک/متقاضی) ───────────────')
if i > 0:
    src = src[:i].rstrip() + "\n"
open(p, "w").write(src)
assert "melketun" not in src
print("✓ pn051-four-steps.test.ts")

# ═══ pn048 ═══
p = "tests/pn048-guardians.test.ts"
src = open(p).read()
src = src.replace('} from "@/lib/integrations/melketun/protected-nulls";',
                  '} from "@/lib/integrations/protected-nulls";')
src = src.replace('source: "melketun-myfilings",', 'source: "arm-owner",')
i = src.find('  test("sync.ts هر مسیر نوشتن رکورد را با قانون ادغام/محافظ می‌پوشاند (PN-050 · دستور ۳)", () => {')
j = src.find('  test("worker.ts حقیقی دارای G1 GATE با توقف فوری است (قانون توقف)", () => {')
assert i > 0 and j > i
src = src[:i] + src[j:]
open(p, "w").write(src)
assert 'melketun' not in src
print("✓ pn048-guardians.test.ts")

# ═══ pn020 ═══
p = "tests/pn020-step1-lists.test.ts"
src = open(p).read()
i = src.find('/* PN-046/گام اول-۱ — helper: استخراج سرستون‌های «تفیصل‌شدهٔ tenant» از سورس M1/M2.')
j = src.find('const { db } = await import("@/lib/db");')
assert i > 0 and j > i
new_helper = '''/* PN-059 — helper: استخراج سرستون‌ها از سورس M1/M2 (تک-tenant؛ ملکتون حذف شد).
 * شکل‌های ممکن پس از حذف شاخه‌ها: متن خام · {"…"} · JSX یک‌خطی. */
function heads(src: string, _tenant?: "tabriz"): string[] {
  const out: string[] = [];
  const re = /<TableHead[^>]*>([\\s\\S]*?)<\\/TableHead>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const inner = m[1]!
      .replace(/\\{"/, "").replace(/"\\}/, "")
      .replace(/[<>{}]/g, " ")
      .replace(/\\s+/g, " ")
      .trim();
    if (inner) out.push(inner);
  }
  return out;
}

'''
src = src[:i] + new_helper + src[j:]
src = src.replace('''    // PN-047/گام اول-۲ (دستور مالک ۱۴۰۵/۰۷/۲۹): ملکتون متراژ (size نمای عمومی — پوشش ۹۹٪)
    // دارد و «تصاویر» حذف شد — نمای عمومی CRM ملکتون تصویر ندارد (صادقانه)
    expect(heads(M1_SRC, "melketun")).not.toContain("تصاویر");
    expect(heads(M1_SRC, "melketun")).toContain("متراژ");
  });''', '''  });''')
src = src.replace('''    // PN-047: متراژ ملکتون درون سلول شاخهٔ ملکتون است — تصاویرِ ردیفِ ملکتون حذف شد
    const iMark = M1_SRC.indexOf("ملکتون M7: متراژ");
    expect(iMark).toBeGreaterThan(-1);
    const branch = M1_SRC.slice(iMark, M1_SRC.indexOf(")}", iMark));
    expect(branch).toContain("r.meterage");
    expect(M1_SRC).not.toContain("r.imageCount ?? 0");''', '''    expect(M1_SRC).not.toContain("r.imageCount ?? 0");''')
src = src.replace('''    // سرستون‌های هر دو tenant: «اطلاعات» ماقبل آخر و «یادداشت» آخرین (سنجاق چپ — RTL)
    for (const tenant of ["tabriz", "melketun"] as const) {
      const headers = heads(M2_SRC, tenant);
      expect(headers.length, tenant).toBeGreaterThan(10);
      expect(headers[headers.length - 1], tenant).toBe("یادداشت");
      expect(headers[headers.length - 2], tenant).toBe("اطلاعات");
      expect(headers[headers.length - 3], tenant).toBe("تاریخ ثبت");
    }''', '''    // سرستون‌ها (تک-tenant — PN-059): «اطلاعات» ماقبل آخر و «یادداشت» آخرین (سنجاق چپ — RTL)
    {
      const headers = heads(M2_SRC, "tabriz");
      expect(headers.length).toBeGreaterThan(10);
      expect(headers[headers.length - 1]).toBe("یادداشت");
      expect(headers[headers.length - 2]).toBe("اطلاعات");
      expect(headers[headers.length - 3]).toBe("تاریخ ثبت");
    }''')
open(p, "w").write(src)
assert "melketun" not in src
print("✓ pn020-step1-lists.test.ts")

# ═══ تست‌های کوچک ═══
p = "tests/management-dashboard.test.ts"
src = open(p).read()
src = src.replace('  "tenant-dashboard-melketun",   // داشبورد ملکتون (ظرف wrapper)\n', '')
src = src.replace('  "tenant-dashboard-melketun": "داشبورد ملکتون",\n', '')
src = src.replace('if (t.id !== "tenant-dashboard-tabriz" && t.id !== "tenant-dashboard-melketun") {',
                  'if (t.id !== "tenant-dashboard-tabriz") {')
open(p, "w").write(src)
assert "melketun" not in src
print("✓ management-dashboard.test.ts")

p = "tests/new-tiles-2.test.ts"
src = open(p).read()
src = src.replace('      "tenant-dashboard-tabriz", "tenant-dashboard-melketun",',
                  '      "tenant-dashboard-tabriz",')
open(p, "w").write(src)
assert "melketun" not in src
print("✓ new-tiles-2.test.ts")

p = "tests/p6530-architecture-guards.test.ts"
src = open(p).read()
src = src.replace('"file-finder", "smart-matching", "learning-tier", "settings", "tenant-dashboard-tabriz", "tenant-dashboard-melketun",',
                  '"file-finder", "smart-matching", "learning-tier", "settings", "tenant-dashboard-tabriz",')
open(p, "w").write(src)
assert "melketun" not in src
print("✓ p6530-architecture-guards.test.ts")

p = "tests/pn010-migration.test.ts"
src = open(p).read()
src = src.replace('WORKER_JOB_IDS.relayHealthCheck, WORKER_JOB_IDS.melketunSync, WORKER_JOB_IDS.dbHealthProbe]',
                  'WORKER_JOB_IDS.relayHealthCheck, WORKER_JOB_IDS.dbHealthProbe]')
open(p, "w").write(src)
assert "melketun" not in src
print("✓ pn010-migration.test.ts")

p = "tests/pn030-proxy-connection.test.ts"
src = open(p).read()
src = src.replace('      "tenant-dashboard-melketun", // ۶ داشبورد ملکتون\n', '')
open(p, "w").write(src)
assert "melketun" not in src
print("✓ pn030-proxy-connection.test.ts")

p = "tests/pn031c-forgiving-code.test.ts"
src = open(p).read()
src = src.replace('  test("F-6) (ن۰۶۷→PN-047) مانیفست api-versioning — ۱۱۵ روت (+db-export) (+glm/probe +relay/health +owner-notes +integrations/melketun/sync +info text-file +crm/melketun/funnel) با code-status و relay/job/[id] (otp-burn حذف کامل · PN-034)", () => {',
                  '  test("F-6) (ن۰۶۷→PN-047→PN-059) مانیفست api-versioning — روت‌های زنده (بدون ملکتونِ حذف‌شده) با code-status و relay/job/[id] (otp-burn حذف کامل · PN-034)", () => {')
src = src.replace('    expect(manifest.totalRoutes).toBe(119); // PN-047: 115 · RELAY-CONN-FIX-001: +۳ روت · PN-051 (DIR-PN051-SUPREME): +api/sync/lcpp (119) — بازتولید با مولد رسمی generate-v1-aliases',
                  '    expect(manifest.totalRoutes).toBe(113); // PN-059: ۱۱۹ → ۱۱۳ (۶ روت ملکتون/تغییرات حذف شد) — بازتولید با مولد رسمی generate-v1-aliases')
open(p, "w").write(src)
assert "melketun" not in src
print("✓ pn031c-forgiving-code.test.ts")

# ═══ pn002 ═══
p = "tests/pn002-tiles.test.ts"
src = open(p).read()
i = src.find('  test("۴-۱) M1: سرستون‌های تازهٔ تبریز')
j = src.find('  test("۴-۲) M2: سرستون‌های تازه')
assert i > 0 and j > i
new_block = '''  test("۴-۱) M1: سرستون‌های تازهٔ تبریز (رهن/اجاره، بازدید، تاریخ وضعیت، لینک — تصاویر/انتشار/آخرین وضعیت حذف؛ PN-059: تک-tenant)", () => {
    // سرستون‌ها پس از PN-059 بی‌شرط‌اند (شاخهٔ ملکتون حذف شد)
    const tabHeads = [...M1_SRC.matchAll(/<TableHead[^>]*>([\\s\\S]*?)<\\/TableHead>/g)]
      .map((m) => m[1].replace(/\\{"/, "").replace(/"\\}/, "").replace(/[<>{}]/g, " ").replace(/\\s+/g, " ").trim())
      .filter(Boolean);
    for (const h of ["قیمت هر متر", "رهن / اجاره", "بازدید", "تاریخ وضعیت", "لینک"]) {
      expect(tabHeads).toContain(h);
    }
    expect(tabHeads).not.toContain("تصاویر");
    expect(tabHeads).not.toContain("انتشار");
    expect(tabHeads).not.toContain("وضعیت");
  });

'''
src = src[:i] + new_block + src[j:]
open(p, "w").write(src)
assert "isMelketun" not in src and "melketun" not in src
print("✓ pn002-tiles.test.ts")

print("PHASE-4 (tests) COMPLETE")
