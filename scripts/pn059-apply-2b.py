#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""PN-059 فاز ۲-ب: LCPP + jobs + journal + indicators + settings + transactions"""
import re, sys

def sub(path, old, new):
    src = open(path).read()
    if old not in src:
        print(f"✗ {path}: NOT FOUND: {old[:60]!r}"); sys.exit(1)
    open(path, "w").write(src.replace(old, new, 1))
    print(f"✓ {path}")

def sub_all(path, pairs):
    src = open(path).read()
    for old, new in pairs:
        if old not in src:
            print(f"✗ {path}: NOT FOUND: {old[:60]!r}"); sys.exit(1)
        src = src.replace(old, new, 1)
    open(path, "w").write(src)
    print(f"✓ {path} ({len(pairs)})")

# ═══ LcppSyncStatus ═══
sub("src/components/tiles/LcppSyncStatus.tsx",
"""const LIST_TITLES: Record<string, string> = {
  'm1-arm-listings': 'آگهی ملک‌تبریز (M1)',
  'm2-arm-requests': 'درخواست ملک‌تبریز (M2)',
  'm9-transactions': 'معاملات (M9)',
  'm7-melketun-listings': 'آگهی ملکتون (M7)',
  'm8-melketun-requests': 'درخواست ملکتون (M8)',
}""",
"""// PN-059 (دستور مالک ۱۴۰۵/۰۸/۱۱): فهرست‌های ملکتون (M7/M8) حذف شدند
const LIST_TITLES: Record<string, string> = {
  'm1-arm-listings': 'آگهی ملک‌تبریز (M1)',
  'm2-arm-requests': 'درخواست ملک‌تبریز (M2)',
  'm9-transactions': 'معاملات (M9)',
}""")

# ═══ sync/lists/index.ts ═══
src = open("src/sync/lists/index.ts").read()
# سربرگ + صادرات
src = src.replace(""" * اولویت (فرمان ۸ بند ۳): criticalها اول — M1 (آگهی) · M2 (درخواست) · M9 (معاملات)
 * سپس M7/M8 (ملکتون — وابسته به اتصال CRM).
 *""", """ * اولویت (فرمان ۸ بند ۳): criticalها اول — M1 (آگهی) · M2 (درخواست) · M9 (معاملات)
 *
 * PN-059 (دستور مالک ۱۴۰۵/۰۸/۱۱): فهرست‌های ملکتون (M7/M8) حذف شدند
 * (حذف کامل کاشی ملکتون + داده‌هایش) — چرخه فقط ARM ملک‌تبریز است.
 *""")
src = src.replace("""export { LIST_ID as M7_LIST_ID, fastPass as m7FastPass } from "./melketun-listings";
export { LIST_ID as M8_LIST_ID, fastPass as m8FastPass } from "./melketun-requests";
export { LIST_ID as M9_LIST_ID, fastPass as m9FastPass, deepPass as m9DeepPass, probeMelketunDeals } from "./transactions";""",
"""export { LIST_ID as M9_LIST_ID, fastPass as m9FastPass, deepPass as m9DeepPass } from "./transactions";""")
src = src.replace("""import { fastPass as m7FastPass } from "./melketun-listings";
import { fastPass as m8FastPass } from "./melketun-requests";
import { fastPass as m9FastPass, deepPass as m9DeepPass, probeMelketunDeals } from "./transactions";""",
"""import { fastPass as m9FastPass, deepPass as m9DeepPass } from "./transactions";""")
# اینترفیس نتیجه
src = src.replace("""    m9: { fetched: number; written: number; skippedPages: number } | { error: string };
    m7: { fetched: number; upserted: number; skippedUnchanged: boolean } | { error: string };
    m8: { fetched: number; upserted: number; skippedUnchanged: boolean } | { error: string };
  };""", """    m9: { fetched: number; written: number; skippedPages: number } | { error: string };
  };""")
src = src.replace("""  melketunDealsProbe?: { totalRows: number; routes: number };
  forcedByOwner: boolean;""", """  forcedByOwner: boolean;""")
# بدنهٔ چرخه: حذف بلوک M7/M8
start = src.find("  // ملکتون — مستقل از توکن ARM (نشست CRM خودش)")
end = src.find("  // ═══ فاز B — Deep-Pass (فرمان ۴): تکمیل جزئیات ═══")
assert start > 0 and end > start
src = src[:start] + src[end:]
# حذف کاوش معاملات ملکتون
start = src.find("  // کاوش معاملات ملکتون (فرمان ۶)")
end = src.find("  cycleLock = false;")
assert start > 0 and end > start
src = src[:start] + src[end:]
src = src.replace("    phaseA: { m1, m2, m9, m7, m8 },", "    phaseA: { m1, m2, m9 },")
src = src.replace("""    phaseB: { m1: b1, m2: b2, m9: b9 },
    melketunDealsProbe,
    forcedByOwner: forced,""", """    phaseB: { m1: b1, m2: b2, m9: b9 },
    forcedByOwner: forced,""")
open("src/sync/lists/index.ts", "w").write(src)
print("✓ src/sync/lists/index.ts")

# ═══ transactions.ts — حذف کاوش ملکتون ═══
src = open("src/sync/lists/transactions.ts").read()
start = src.find("// ─── کاوش ملکتون (فرمان ۶ بند ۲) — Inertia /Deals · /Contracts ─────────────")
assert start > 0
src = src[:start].rstrip() + "\n"
src = src.replace(""" *   · سمت ملکتون (CRM): کاوش مسیرهای Inertia (/Deals · /Contracts · ...) —
 *       تاکنون صفر رکورد (hardcoded 0 در sync قدیمی — مستند در legacy).
 *       این ماژول مسیرها را با الگوی کشف PN-047 امتحان می‌کند؛ یافته‌ها در
 *       upload/.runtime/lcpp-m9-melketun-probe.json شاهد می‌شوند.
 *
""", """ * PN-059 (دستور مالک ۱۴۰۵/۰۸/۱۱): کاوش مسیرهای معاملات ملکتون حذف شد —
 * سمت ملکتون به‌کلی بازنشسته (حذف کامل کاشی ملکتون + داده‌هایش).
 *
""")
open("src/sync/lists/transactions.ts", "w").write(src)
print("✓ src/sync/lists/transactions.ts")

# ═══ jobs.ts ═══
sub_all("src/core/runtime/jobs.ts", [
("""  dbHealthProbe: "db-health-probe", // PN-041-R · شورا-ن۰۶۸ — خوددرمانی DB قفل‌شده
  melketunSync: "melketun-sync", // PN-044 · شورا-ن۰۸۸ — هماهنگ‌سازی CRM ملکتون (۶ ساعت)
  lcppCycle: "lcpp-cycle",""",
 """  dbHealthProbe: "db-health-probe", // PN-041-R · شورا-ن۰۶۸ — خوددرمانی DB قفل‌شده
  lcppCycle: "lcpp-cycle","""),
("""  // ── Melketun Sync → Worker (تازه — PN-044/شورا-ن۰۸۸ · فاز ۳) ──
  // کش دادهٔ ملکتون از CRM (Laravel Inertia · نشست‌محور) → جداول مشترک با
  // tenantId='melketun'. الگوی ARM: چرخهٔ ۶ ساعت · فقط upsert (صفر حذف — قانون ۶).
  // استراتژی SESSION_HTML_ADAPTER — کشف فاز ۰: login-store + JSON اینرسیا.
  // خاموشی: MELK_MELKETUN_SYNC=disabled
  if (process.env.MELK_MELKETUN_SYNC !== "disabled") {
    jobs.push({
      id: WORKER_JOB_IDS.melketunSync,
      title: "هماهنگ‌سازی ملکتون (CRM → tenantId='melketun') — PN-044/۳",
      intervalMs: 6 * 60 * 60_000, // همان ARM/Mirror — ۶ ساعت (ریسک #۴: rate limit)
      firstRunDelayMs: 10 * 60_000, // نخستین sync ۱۰ دقیقه پس از بوت
      run: async (_database) => {
        const { syncMelketun } = await import("@/lib/integrations/melketun/sync");
        return syncMelketun();
      },
      toDomain: (r) => {
        if (r && typeof r === "object") return r as Record<string, unknown>;
        return {};
      },
    });
  }

  // ── DB Health Probe → Worker (تازه — PN-041-R/شورا-ن۰۶۸ · فاز ۴) ──""",
 """  // ── DB Health Probe → Worker (تازه — PN-041-R/شورا-ن۰۶۸ · فاز ۴) ──"""),
])

# ═══ journal.ts ═══
sub("src/lib/journal.ts",
'export type JournalKind = "melketun-sync" | "generic";',
'/** PN-059: نوع «melketun-sync» حذف شد (حذف کامل ملکتون) — تنها kind زنده: generic */\nexport type JournalKind = "generic";')

print("PHASE-2B OK")
