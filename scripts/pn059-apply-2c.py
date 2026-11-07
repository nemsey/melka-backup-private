#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PN-059 فاز ۲-پ: indicators + ConnectionIndicators + settings + transactions + tile pages"""
import re, sys

def sub(path, old, new):
    src = open(path).read()
    if old not in src:
        print(f"✗ {path}: NOT FOUND: {old[:60]!r}"); sys.exit(1)
    open(path, "w").write(src.replace(old, new, 1))
    print(f"✓ {path}")

# ═══ indicators.ts ═══
p = "src/lib/indicators.ts"
src = open(p).read()
src = src.replace('''// PN-046/گام صفر — وضعیت اتصال ملکتون (state file پایدار — سوخت نشانگر)
import { getMelketunConnection, melketunMeta } from "@/lib/integrations/melketun";

''', '')
src = src.replace('''  | "gapApi"
  | "melketunCrm"
  | "melketunPublic"
  | "divarApi"''', '''  | "gapApi"
  | "divarApi"''')
start = src.find('// ═════════ PN-046/گام صفر — سنجش ملکتون')
end = src.find('// ═════════ PN-028/اولاً — تازه‌سازی موازی همهٔ سنجش‌های بیرونی')
assert start > 0 and end > start
src = src[:start] + src[end:]
src = src.replace('''  divarApi: ProbeCache;
  melketunCrm: ProbeCache;
  melketunPublic: ProbeCache;
}''', '''  divarApi: ProbeCache;
}''')
src = src.replace('''  const [armApi, pmApi, melkPublicApi, gapApi, divarApi, melketunCrm, melketunPublic] = await Promise.all([''',
                  '''  const [armApi, pmApi, melkPublicApi, gapApi, divarApi] = await Promise.all([''')
src = src.replace('''    probeGap().catch(() => fallback("سرور gap-api.melketabriz.ir در دسترس نیست")),
    probeDivar().catch(() => fallback("API دیوار در دسترس نیست")),
    // PN-046/گام صفر — سامانه‌های ملکتون در همان دور موازی (سقف کل ≈ ۵ ثانیه)
    probeMelketunCrm().catch(() => fallback("سرور CRM ملکتون در دسترس نیست")),
    probeMelketunPublic().catch(() => fallback("سایت عمومی ملکتون در دسترس نیست")),
  ]);
  return { armApi, pmApi, melkPublicApi, gapApi, divarApi, melketunCrm, melketunPublic };''',
'''    probeGap().catch(() => fallback("سرور gap-api.melketabriz.ir در دسترس نیست")),
    probeDivar().catch(() => fallback("API دیوار در دسترس نیست")),
  ]);
  return { armApi, pmApi, melkPublicApi, gapApi, divarApi };''')
src = src.replace('''      divarApi: probeCache.get("divarApi") ?? { at: Date.now(), ok: false, detail: "API دیوار در دسترس نیست" },
      melketunCrm: probeCache.get("melketunCrm") ?? { at: Date.now(), ok: false, detail: "سرور CRM ملکتون در دسترس نیست" },
      melketunPublic: probeCache.get("melketunPublic") ?? { at: Date.now(), ok: false, detail: "سایت عمومی ملکتون در دسترس نیست" },
    });''', '''      divarApi: probeCache.get("divarApi") ?? { at: Date.now(), ok: false, detail: "API دیوار در دسترس نیست" },
    });''')
src = src.replace('''    divarApi: probeCache.get("divarApi") ?? none("API دیوار در دسترس نیست"),
    melketunCrm: probeCache.get("melketunCrm") ?? none("سرور CRM ملکتون در دسترس نیست"),
    melketunPublic: probeCache.get("melketunPublic") ?? none("سایت عمومی ملکتون در دسترس نیست"),
  };''', '''    divarApi: probeCache.get("divarApi") ?? none("API دیوار در دسترس نیست"),
  };''')
start = src.find('  // ۸-ب. CRM ملکتون')
end = src.find('  // ۸. ')
if end < 0 or end < start:
    end = src.find('  // ۹')
assert start > 0 and end > start
src = src[:start] + src[end:]
src = src.replace('return [armAccount, armApi, pmAccount, pmApi, melkPublicApi, gapApi, melketunCrm, melketunPublic, divarApi, divarAccount, instagramAccount];',
                  'return [armAccount, armApi, pmAccount, pmApi, melkPublicApi, gapApi, divarApi, divarAccount, instagramAccount];')
src = src.replace('// ===================== محاسبه هر ۱۱ نشانگر (۹ تبریز/دیوار/اینستا + ۲ ملکتون — PN-046) =====================',
                  '// ===================== محاسبه هر ۹ نشانگر (تبریز/دیوار/اینستا — ملکتون حذف شد PN-059) =====================')
open(p, "w").write(src)
assert 'melketun' not in src, "indicators still has melketun!"
print("✓ src/lib/indicators.ts")

# ═══ ConnectionIndicators.tsx ═══
p = "src/components/app/ConnectionIndicators.tsx"
src = open(p).read()
src = src.replace('''  gapApi: "اتصال به api سامانه gap",
  melketunCrm: "اتصال به CRM ملکتون (حساب شخصی یوزر/پسورد)",
  melketunPublic: "اتصال به سایت عمومی ملکتون",
  divarApi: "اتصال به api دیوار",''', '''  gapApi: "اتصال به api سامانه gap",
  divarApi: "اتصال به api دیوار",''')
src = src.replace('''  gapApi: "API GAP",
  melketunCrm: "CRM ملکتون",
  melketunPublic: "سایت عمومی ملکتون",
  divarApi: "API دیوار",''', '''  gapApi: "API GAP",
  divarApi: "API دیوار",''')
src = src.replace('''/** ترتیب مالک: سامانه‌های ملک تبریز اول، سپس ملکتون (PN-046)، سپس دیوار و اینستاگرام */
const ORDER = ["armAccount", "armApi", "pmAccount", "pmApi", "melkPublicApi", "gapApi", "melketunCrm", "melketunPublic", "divarApi", "divarAccount", "instagramAccount"];''',
'''/** ترتیب مالک: سامانه‌های ملک تبریز اول، سپس دیوار و اینستاگرام (ملکتون حذف شد — PN-059) */
const ORDER = ["armAccount", "armApi", "pmAccount", "pmApi", "melkPublicApi", "gapApi", "divarApi", "divarAccount", "instagramAccount"];''')
open(p, "w").write(src)
assert 'melketun' not in src
print("✓ src/components/app/ConnectionIndicators.tsx")

# ═══ SettingsPage.tsx ═══
p = "src/core/tiles/tiles/settings/SettingsPage.tsx"
src = open(p).read()
src = src.replace('''// PN-046/گام صفر (دستور مالک ۱۴۰۵/۰۷/۲۸) — پیکرهٔ یکپارچهٔ «اتصال به ملکتون»:
// همانند الگوی تبریز ولی با حساب شخصی یوزر/پسورد — جایگاه: درست زیر پیکرهٔ تبریز
import { MelketunConnectionSection } from "./MelketunConnectionSection";
''', '''// PN-059 (دستور مالک ۱۴۰۵/۰۸/۱۱): بخش «اتصال به ملکتون» حذف شد (حذف کامل ملکتون)
''')
src = src.replace('''      {/* ۱-ب — PN-046/گام صفر (دستور مالک): اتصال به ملکتون — پیکرهٔ یکپارچه،
          درست «زیر» پیکرهٔ یکپارچهٔ اتصال سامانه‌های ملک تبریز (نکتهٔ دستور) */}
      <MelketunConnectionSection />

''', '')
open(p, "w").write(src)
assert 'MelketunConnectionSection' not in src
print("✓ SettingsPage.tsx")

# ═══ TransactionsTab.tsx + TransactionsContractsPage.tsx ═══
p = "src/core/tiles/tiles/transactions-contracts/TransactionsTab.tsx"
src = open(p).read()
src = src.replace('import { MelketunPipelineSection } from "./MelketunPipelineSection";',
                  '// PN-059 (دستور مالک ۱۴۰۵/۰۸/۱۱): MelketunPipelineSection حذف شد (حذف کامل ملکتون)')
src = src.replace('export function TransactionsTab({ sortBy, showCharts, updateSection, syncDoneSignal, tenantId }: { sortBy: string; showCharts: boolean; updateSection?: React.ReactNode; syncDoneSignal?: number; tenantId?: "tabriz" | "melketun" }) {',
                  'export function TransactionsTab({ sortBy, showCharts, updateSection, syncDoneSignal }: { sortBy: string; showCharts: boolean; updateSection?: React.ReactNode; syncDoneSignal?: number }) {')
start = src.find('  // PN-047/گام اول-۲ — ملکتون: نمای مختص کسب‌وکار')
end = src.find('  // قانون ۰۳۵-B/ج-۸ — کشیدن برای تازه‌سازی')
assert start > 0 and end > start
src = src[:start] + src[end:]
src = src.replace('''    // PN-044/فاز ۴ — فیلتر چند-مستأجری: داشبورد ملکتون فقط دادهٔ ملکتون می‌بیند
    params.set("tenantId", tenantId ?? "tabriz");

    const res = await api<TxResponse>(`/api/crm/transactions?${params.toString()}`);
    return res;
  }, [applied, sortBy, tenantId]);''', '''    const res = await api<TxResponse>(`/api/crm/transactions?${params.toString()}`);
    return res;
  }, [applied, sortBy]);''')
src = src.replace('<ExcelImportButton entity="transactions" compact tenantId={tenantId ?? "tabriz"} onImported={() => void fetchTransactions()} />',
                  '<ExcelImportButton entity="transactions" compact onImported={() => void fetchTransactions()} />')
src = src.replace('                        <InfoButton tenant={tenantId ?? "tabriz"} type="transaction" code={t.propertyCode} />',
                  '                        <InfoButton type="transaction" code={t.propertyCode} />')
src = src.replace('''              {/* PN-047 — پیام قدیمی ملکتون حذف شد: نمای M9 ملکتون در بالای همین
                  کامپوننت early-return می‌شود (MelketunPipelineSection) و هرگز
                  به این بخش تبریز-محور نمی‌رسد. */}''',
'''              {/* PN-059 — نمای مخصوص ملکتون حذف شد (حذف کامل ملکتون — دستور مالک ۱۴۰۵/۰۸/۱۱). */}''')
open(p, "w").write(src)
print("✓ TransactionsTab.tsx")

p = "src/core/tiles/tiles/transactions-contracts/TransactionsContractsPage.tsx"
src = open(p).read()
src = src.replace('export function TransactionsContractsPage({ settings, tenantId }: TilePageProps) {',
                  'export function TransactionsContractsPage({ settings }: TilePageProps) {')
src = src.replace('<TransactionsTab sortBy={sortBy} showCharts={showCharts} updateSection={updateSection} syncDoneSignal={syncDoneSignal} tenantId={tenantId} />',
                  '<TransactionsTab sortBy={sortBy} showCharts={showCharts} updateSection={updateSection} syncDoneSignal={syncDoneSignal} />')
open(p, "w").write(src)
print("✓ TransactionsContractsPage.tsx")

# ═══ tile-contract.ts ═══
p = "src/core/tiles/tile-contract.ts"
src = open(p).read()
src = src.replace('''  /**
   * PN-044/فاز ۴ (شورا-ن۰۸۸) — tenant این رندر: 'tabriz' (پیش‌فرض) | 'melketun'.
   * کاشی‌های چند-مستأجری (M1-M4) داده را با tenantId فیلتر می‌کنند؛ کاشی‌های
   * بی‌اعتنا به آن، عیناً بی‌تغییر می‌مانند (اختیاری — صفر شکستن).
   */
  tenantId?: "tabriz" | "melketun";''', '''  /**
   * tenant این رندر — PN-059: پس از حذف کامل ملکتون تنها 'tabriz' زنده است.
   * (پیش‌فرض 'tabriz' — نگه‌داری پارامتر برای سازگاری TileShell/داشبورد.)
   */
  tenantId?: "tabriz";''')
open(p, "w").write(src)
print("✓ tile-contract.ts")

# ═══ tabriz tile comment ═══
p = "src/core/tiles/tiles/tenant-dashboard-tabriz/index.ts"
src = open(p).read()
src = src.replace(''' * «wrapper، نه تکرار» (قانون ۱۰): یک کد، دو کاربرد (tabriz + melketun).
 */''', ''' * PN-059 (دستور مالک ۱۴۰۵/۰۸/۱۱): داشبورد ملکتون حذف شد — تنها tabriz زنده است.
 */''')
open(p, "w").write(src)
print("✓ tenant-dashboard-tabriz/index.ts")

print("PHASE-2C OK")
