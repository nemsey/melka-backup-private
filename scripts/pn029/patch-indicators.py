#!/usr/bin/env python3
# PN-029 — وصلهٔ indicators.ts: حالت آفلاین = صفر پروب ملک تبریز (چهار نشانگر)
import io, sys

P = "/home/z/my-project/src/lib/indicators.ts"
src = io.open(P, encoding="utf-8").read()

def rep(old, new, count=1):
    global src
    n = src.count(old)
    if n != count:
        print(f"ANCHOR-MISMATCH ({n} != {count}): {old[:90]!r}")
        sys.exit(1)
    src = src.replace(old, new)

rep('import { probeGet } from "@/lib/melk-api/client";',
    'import { probeGet } from "@/lib/melk-api/client";\n// PN-029 — حالت آفلینی ملک تبریز: صفر پروب خودکار (ریشهٔ ۵۰۲ نشانگرها)\nimport { isArmOfflineMode } from "@/lib/melk-api/offline-mode";')

rep('''/** یک دور سنجش بیرونی — همه هم‌زمان؛ سقف کل ≈ ۵ ثانیه (نه ۴۵) */
async function runExternalProbes(): Promise<ExternalProbes> {
  const cfg = getMelkApiConfig();
  const fallback = (detail: string): ProbeCache => ({ at: Date.now(), ok: false, detail });''',
    '''/** یک دور سنجش بیرونی — همه هم‌زمان؛ سقف کل ≈ ۵ ثانیه (نه ۴۵) */
async function runExternalProbes(): Promise<ExternalProbes> {
  const cfg = getMelkApiConfig();
  const fallback = (detail: string): ProbeCache => ({ at: Date.now(), ok: false, detail });

  // PN-029 (مرحلهٔ ۲ — سند شورا-ن۰۳۳): در حالت آفلینی، چهار نشانگرِ سامانه‌های
  // ملک تبریز اصلاً پروب نمی‌شوند — آخرین کش (در صورت وجود) با برچسب آفلاین
  // سرو می‌شود و صفر بستهٔ شبکه به arus-api/pm-api/gap-api ارسال می‌گردد.
  // نشانگر دیوار بی‌ربط به این حالت است و مثل قبل سنجیده می‌شود.
  if (isArmOfflineMode()) {
    const offline = (key: string, label: string): ProbeCache =>
      probeCache.get(key) ?? { at: Date.now(), ok: false, detail: `${label} — حالت آفلینی ملک تبریز (توقف تلاش خودکار · PN-029)` };
    const divarApi = await probeDivar().catch(() => fallback("API دیوار در دسترس نیست"));
    return {
      armApi: offline("armApi", "API سامانه آرم"),
      pmApi: offline("pmApi", "API سامانه پرسنلی"),
      melkPublicApi: offline("melkPublicApi", "API عمومی سامانه ملک تبریز"),
      gapApi: offline("gapApi", "سرور gap-api"),
      divarApi,
    };
  }''')

io.open(P, "w", encoding="utf-8").write(src)
print("indicators.ts patched OK")
