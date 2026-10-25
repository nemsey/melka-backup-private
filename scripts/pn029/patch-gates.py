#!/usr/bin/env python3
# PN-029 — وصلهٔ گاردهای حالت آفلاین: jobs.ts + catalog-daemon.ts + instrumentation.ts
import io, sys

def patch(path, pairs):
    src = io.open(path, encoding="utf-8").read()
    orig_len = len(src)
    for old, new, count in pairs:
        n = src.count(old)
        if n != count:
            print(f"ANCHOR-MISMATCH in {path} ({n} != {count}): {old[:80]!r}")
            sys.exit(1)
        src = src.replace(old, new)
    io.open(path, "w", encoding="utf-8").write(src)
    print(f"{path} patched — {orig_len} -> {len(src)} chars")

# ── ۱) jobs.ts: ثبت‌نشدن catalog-cycle در حالت آفلاین + شاهد AuditLog ──
patch("/home/z/my-project/src/core/runtime/jobs.ts", [
    (
        'import type { WorkerJobDef } from "./job-queue";',
        'import type { WorkerJobDef } from "./job-queue";\nimport { isArmOfflineMode } from "@/lib/melk-api/offline-mode";',
        1,
    ),
    (
        '''  // ── Catalog → Worker (فاصله و کلید خاموشی عین قبل) ──
  if (process.env.MELK_CATALOG_DAEMON !== "disabled") {''',
        '''  // ── Catalog → Worker — PN-029 (مرحلهٔ ۲ سند شورا-ن۰۳۳) ──
  // حالت آفلینی ملک تبریز: صفر کار خارجی برای Worker. catalog-cycle ثبت
  // نمی‌شود (هیچ فراخوانی ARM/PM/عمومی انجام نمی‌گیرد) و توقف در AuditLog
  // با action=ARM_OFFLINE_MODE شاهدسازی می‌شود. M1-M5 از DB محلی کار می‌کنند.
  if (isArmOfflineMode()) {
    void db.auditLog.create({
      data: {
        action: "ARM_OFFLINE_MODE",
        actor: "worker:boot",
        detail: JSON.stringify({
          note: "توقف فوری همهٔ تلاش‌های خودکار به سامانه‌های ملک تبریز (PN-029 مرحلهٔ ۲)",
          flag: "MELK_ARM_OFFLINE=1",
          stopped: ["catalog-cycle"],
          kept: ["intelligence-cycle", "mirror-cycle", "log-rotate", "backup-rotation", "guards"],
          reason: "اول تشخیص، بعد اقدام — دکترین شورای عالی ملکا (جلسهٔ فوق‌العاده ۰۳۳)",
        }),
      },
    }).catch(() => undefined); // ثبت شاهد بهترین-تلاش است
  } else if (process.env.MELK_CATALOG_DAEMON !== "disabled") {''',
        1,
    ),
])

# ── ۲) catalog-daemon.ts: گارد دفاع-در-عمق داخل تیک (حتی اگر مستقیم صدا زده شود) ──
src = io.open("/home/z/my-project/src/lib/melk-api/catalog-daemon.ts", encoding="utf-8").read()
anchor = 'import { readWorkerStatus } from "@/core/runtime/worker-status";'
assert src.count(anchor) == 1
src = src.replace(anchor, anchor + '\n// PN-029 — حالت آفلینی ملک تبریز (توقف تلاشهای خودکار)\nimport { isArmOfflineMode } from "./offline-mode";')

# گارد داخل تابع تیک — پیدا کردن امضای catalogDaemonTick
sig_anchor = "export async function catalogDaemonTick(db: PrismaClient): Promise<CatalogDaemonStatus> {"
if src.count(sig_anchor) != 1:
    # جستجوی امزای واقعی
    import re
    m = re.search(r"export async function catalogDaemonTick\([^)]*\)[^{]*\{", src)
    print("SIG:", m.group(0) if m else "NOT FOUND")
    sys.exit(1)
src = src.replace(
    sig_anchor,
    sig_anchor + '''
  // PN-029 (مرحلهٔ ۲) — دفاع-در-عمق: در حالت آفلینی هیچ فراخوانی خارجی
  // انجام نمی‌شود؛ تیک با نشانگر offlineSkip بی‌صدا خاتمه می‌یابد.
  if (isArmOfflineMode()) {
    const s = state();
    s.status.lastTickAt = Date.now();
    s.status.lastResult = { ...s.status.lastResult ?? { listingsPages: 0, requestsPages: 0, listingsEnriched: 0, requestsEnriched: 0 }, cooldownSkip: true } as NonNullable<CatalogDaemonStatus["lastResult"]>;
    (s.status.lastResult as Record<string, unknown>).offlineSkip = true;
    return s.status;
  }
''',
    1,
)
io.open("/home/z/my-project/src/lib/melk-api/catalog-daemon.ts", "w", encoding="utf-8").write(src)
print("catalog-daemon.ts patched")

# ── ۳) instrumentation.ts: گارد آفلاین روی حلقهٔ همگام‌سازی پس‌زمینه ──
patch("/home/z/my-project/src/instrumentation.ts", [
    (
        '  if (process.env.MELK_BACKGROUND_SYNC === "enabled") {',
        '''  // PN-029 (مرحلهٔ ۲) — L7: صفر تلاش خودکار در تولید بدون توکن سالم؛
  // در حالت آفلینی ملک تبریز حلقهٔ پس‌زمینه حتی با MELK_BACKGROUND_SYNC=enabled
  // نیز روشن نمی‌شود (قانون احتیاط اتصال خارجی — سند شورا-ن۰۳۳).
  if (process.env.MELK_BACKGROUND_SYNC === "enabled" && !(
    (await import("@/lib/melk-api/offline-mode")).isArmOfflineMode()
  )) {''',
        1,
    ),
])
print("ALL GATES PATCHED")
