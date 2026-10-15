#!/usr/bin/env python3
# PN-029 — وصلهٔ UI بخش اتصال ملک تبریز: live + حالت آفلینی + فیوز + IP کانتینر
import io, sys

P = "/home/z/my-project/src/core/tiles/tiles/settings/MelkTabrizConnectionSection.tsx"
src = io.open(P, encoding="utf-8").read()

def rep(old, new, count=1):
    global src
    n = src.count(old)
    if n != count:
        print(f"ANCHOR-MISMATCH ({n} != {count}): {old[:90]!r}")
        sys.exit(1)
    src = src.replace(old, new)

# ۱) توسعهٔ اینترفیس ConnectionInfo با فیلدهای PN-029
rep('''  config: {
    mode: string;
    armApiBase: string;
    armPublicApiBase: string;
    pmApiBase: string;
    gapApiBase?: string;
    timeoutMs: number;
    maxRetries: number;
    syncIntervalMinutes: number;
  };
}''',
'''  config: {
    mode: string;
    armApiBase: string;
    armPublicApiBase: string;
    pmApiBase: string;
    gapApiBase?: string;
    timeoutMs: number;
    maxRetries: number;
    syncIntervalMinutes: number;
  };
  /** PN-029 — لایهٔ احتیاط اتصال خارجی (شورا-ن۰۳۳) */
  offlineMode?: boolean;
  circuitBreakers?: Array<{
    target: string;
    consecutiveFailures: number;
    lockUntil: string | null;
    nextAttemptAt: string | null;
    locked: boolean;
    cooling: boolean;
  }>;
  containerIp?: {
    currentIp: string | null;
    source: string | null;
    detectedAt: string | null;
    changed: boolean;
    historyCount: number;
  };
}''')

# ۲) دکمهٔ تست اتصال → live=1 (اقدام آگاهانهٔ مالک — تنها پروب مجاز در حالت آفلینی)
rep('      const res = await api<ConnectionInfo>("/api/connection/status");\n      setConn(res);',
    '      // PN-029 — live=1: پروب واقعی فقط از دکمهٔ مالک (اقدام آگاهانه)\n      const res = await api<ConnectionInfo>("/api/connection/status?live=1");\n      setConn(res);')

# ۳) بارگذاری اولیه بی‌صدا — بدون live (صفر تلاش خودکار)
rep('    api<ConnectionInfo>("/api/connection/status")\n      .then((res) => setConn(res))\n      .catch(() => undefined);',
    '    // PN-029 — بارگذاری بی‌صدا: بدون live؛ در حالت آفلینی صفر پروب\n    api<ConnectionInfo>("/api/connection/status")\n      .then((res) => setConn(res))\n      .catch(() => undefined);')

# ۴) بنر حالت آفلینی + فیوز + IP کانتینر — پیش از وضعیت تفصیلی سرویس‌ها
rep('          {conn && (\n            <>\n              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">',
    '''          {conn && (
            <>
              {/* PN-029 — بنر حالت آفلینی ملک تبریز (توقف تلاش‌های خودکار) */}
              {conn.offlineMode && (
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 space-y-1">
                  <p className="text-sm font-bold text-amber-700 dark:text-amber-400">حالت آفلینی ملک تبریز فعال است (PN-029)</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    توقف عمدی همهٔ تلاش‌های خودکار به سامانه‌های ملک تبریز تا پایان تشخیص ریشه — دکترین شورا: «اول تشخیص، بعد اقدام». M1 تا M5 از دادهٔ محلی کار می‌کنند. دکمهٔ «تست اتصال» تنها پروب زندهٔ مجاز است.
                  </p>
                </div>
              )}

              {/* PN-029 — گارد IP کانتینر + فیوزهای قطع‌کننده */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-lg border bg-card p-3">
                  <p className="text-xs text-muted-foreground">IP عمومی کانتینر (گارد ۶ساعته)</p>
                  <p className="text-sm font-bold" dir="ltr">
                    {conn.containerIp?.currentIp ?? "—"}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {conn.containerIp?.detectedAt
                      ? `آخرین ثبت: ${faDateTime(conn.containerIp.detectedAt)}${conn.containerIp.changed ? " — تغییر نسبت به قبل!" : ""}`
                      : "هنوز ثبت نشده (کارِ Worker هر ۶ ساعت)"}
                  </p>
                </div>
                <div className="rounded-lg border bg-card p-3">
                  <p className="text-xs text-muted-foreground">فیوز قطع‌کنندهٔ اتصال (Retry هوشمند)</p>
                  <p className="text-sm font-bold">
                    {(conn.circuitBreakers ?? []).length === 0
                      ? "همهٔ میزبانها عادی"
                      : (conn.circuitBreakers ?? []).some((b) => b.locked)
                        ? "قفل ۲۴ ساعته فعال"
                        : (conn.circuitBreakers ?? []).some((b) => b.cooling)
                          ? "خنک‌ساز فعال (تا ۶ ساعت)"
                          : "همهٔ میزبانها عادی"}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    قانون PN-029: یک تلاش در ۶ ساعت · سه شکست پیاپی = قفل ۲۴ ساعته
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">''')

# ۵) برچسب زمان پاسخ در حالت آفلینی
rep('                  <p className="text-xs text-muted-foreground">حالت اتصال</p>\n                  <p className="text-sm font-bold text-teal-700 dark:text-teal-400">اتصال واقعی</p>',
    '''                  <p className="text-xs text-muted-foreground">حالت اتصال</p>
                  <p className="text-sm font-bold text-teal-700 dark:text-teal-400">
                    {conn.offlineMode ? "آفلینی تشخیصی (PN-029)" : "اتصال واقعی"}
                  </p>''')

io.open(P, "w", encoding="utf-8").write(src)
print("UI patched OK")
