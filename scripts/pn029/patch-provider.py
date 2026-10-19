#!/usr/bin/env python3
# PN-029 — وصلهٔ provider.ts: حالت آفلاین testConnection + پارامتر live + جزئیات فیوز
import io, sys

P = "/home/z/my-project/src/lib/melk-api/provider.ts"
src = io.open(P, encoding="utf-8").read()

def rep(old, new, count=1):
    global src
    n = src.count(old)
    if n != count:
        print(f"ANCHOR-MISMATCH ({n} != {count}): {old[:90]!r}")
        sys.exit(1)
    src = src.replace(old, new)

# ۱) import حالت آفلاین
rep('import { armCall, probeGet } from "./client";',
    'import { armCall, probeGet } from "./client";\nimport { isArmOfflineMode, offlineModeMessage } from "./offline-mode";')

# ۲) امضای اینترفیس — پارامتر اختیاری live
rep('  /** تست زنده اتصال هر سه سرویس */\n  testConnection(): Promise<ConnectionStatus>;',
    '  /** تست زنده اتصال سرویس‌ها — PN-029: live=true یعنی پروب واقعی (دکمهٔ تست مالک)؛\n'
    '   * در حالت آفلینی، بدون live هیچ پروبی زده نمی‌شود (صفر تلاش خودکار). */\n'
    '  testConnection(opts?: { live?: boolean }): Promise<ConnectionStatus>;')

# ۳) بدنهٔ testConnection — گارد آفلاین + عبور live به همهٔ پروب‌ها + جزئیات فیوز
rep('  async testConnection(): Promise<ConnectionStatus> {\n    const checkedAt = new Date().toISOString();\n    const services: ArmServiceStatus[] = [];',
    '''  async testConnection(opts?: { live?: boolean }): Promise<ConnectionStatus> {
    const checkedAt = new Date().toISOString();
    const services: ArmServiceStatus[] = [];

    // PN-029 (مرحلهٔ ۲) — حالت آفلینی: بدون live (بارگذاری صفحه) صفر پروب؛
    // خروجی صادقانه «حالت آفلین» است نه «قطع». live=true فقط از دکمهٔ تست
    // مالک می‌آید (اقدام آگاهانهٔ دستی — مجاز به عبور از گارد).
    if (isArmOfflineMode() && !opts?.live) {
      const offlineDetail = "حالت آفلینی ملک تبریز — پروب متوقف (PN-029: توقف تلاش‌های خودکار تا پایان تشخیص)";
      const names: Array<[string, string]> = [
        ["ARM_PUBLIC", "سامانه مدیریت آگهی و درخواست — بخش عمومی"],
        ["ARM_API", "سامانه مدیریت آگهی و درخواست — احراز هویت"],
        ["PM_API", "سامانه مدیریت پرسنلی"],
        ["MELK_PUBLIC_API", "سامانه عمومی ملک تبریز (melketabriz.com)"],
        ["GAP_API", "سامانه گفت‌وگوی آنلاین (gap.melketabriz.ir)"],
      ];
      for (const [service, label] of names) {
        services.push({ service, label, reachable: false, databaseUp: false, latencyMs: -1, detail: offlineDetail });
      }
      return {
        ok: false,
        mode: this.mode,
        latencyMs: -1,
        checkedAt,
        services,
        detail: offlineModeMessage(),
      };
    }
    // در حالت آفلینی با live=true، پروب‌ها با bypassOffline زده می‌شوند
    const probeOpts = opts?.live ? { bypassOffline: true } : undefined;''')

# ۴) همهٔ فراخوانی‌های probeGet داخل testConnection — تزریق probeOpts و ثبت جزئیات فیوز/آفلاین
rep('      const probe = await probeGet(this.config.armPublicApiBase, MELK_ENDPOINTS.armPublic.enums, 12000);',
    '      const probe = await probeGet(this.config.armPublicApiBase, MELK_ENDPOINTS.armPublic.enums, 12000, probeOpts);')
rep('      const probe = await probeGet(this.config.armApiBase, `authentication/otp/0`, 12000);',
    '      const probe = await probeGet(this.config.armApiBase, `authentication/otp/0`, 12000, probeOpts);')
rep('      const probe = await probeGet(this.config.pmApiBase, MELK_ENDPOINTS.pm.portalInfo, 12000);',
    '      const probe = await probeGet(this.config.pmApiBase, MELK_ENDPOINTS.pm.portalInfo, 12000, probeOpts);')
rep('      const probe = await probeGet(this.config.melkPublicApiBase, `${MELK_ENDPOINTS.melkPublic.propertiesList}?page=1&limit=1`, 12000);',
    '      const probe = await probeGet(this.config.melkPublicApiBase, `${MELK_ENDPOINTS.melkPublic.propertiesList}?page=1&limit=1`, 12000, probeOpts);')
rep('      const probe = await probeGet(this.config.gapApiBase, "", 12000);',
    '      const probe = await probeGet(this.config.gapApiBase, "", 12000, probeOpts);')

# ۵) جزئیات فیوز در پروب موفق‌شکل — بعد از هر بلاک try اضافه کردن circuitLocked به detail سخت است؛
# ساده‌ترین نقطهٔ مشترک: ترجمهٔ probe به سرویس در یک هلپر. چون بلاک‌ها متناظرند،
# برای هر probe، detail را مشروط می‌کنیم — این کار با تبدیل «dbUp ? ... : ...» ممکن است.
# روش انتخابی: اگر probe.circuitLocked بود، پیام فیوز جایگزین شود — سه الگوی متداول:
for pat in [
    'detail: dbUp ? "پاسخ موفق" : "پایگاه داده سامانه آگهی و درخواست در دسترس نیست (خطای پایگاه داده/پنج‌صد و دو)"',
    'detail: dbUp ? "مسیر احراز هویت فعال است" : "پایگاه داده سامانه آگهی و درخواست قطع است — ارسال پیامک ممکن نیست"',
    'detail: dbUp ? "پاسخ موفق" : "پایگاه داده سامانه پرسنلی در دسترس نیست"',
    'detail: dbUp ? "فهرست عمومی آگهی‌ها پاسخ می‌دهد" : "بخش عمومی سامانه ملک تبریز در دسترس نیست"',
]:
    rep(pat, 'detail: probe.circuitLocked ? probe.circuitDetail! : (probe.offlineMode ? "حالت آفلینی — پروب متوقف" : (' + pat.split(': ', 1)[1] + ')')

io.open(P, "w", encoding="utf-8").write(src)
print("provider.ts patched OK")
