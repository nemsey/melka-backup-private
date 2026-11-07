#!/usr/bin/env python3
# ============================================================
# PN-042 — جراحی تست‌ها (جلسهٔ ۰۷۰)
# ۱) tests/pn041-data-fortress.test.ts:
#    - حذف بندهای C (db-fortress-guard) و D (recover-all) — سازوکارهای منسوخ
#    - بازطراحی H-1 (اتصال بوت → راهنمای رستاخیز PN-042)
#    - حذف import بلااستفادهٔ bun:sqlite در صورت بلااستفاده شدن
# ۲) tests/pn041r-auth-resilience.test.ts:
#    - بازطراحی H-4 (خواندن resurrect-ultimate.sh به‌جای گارد قلعهٔ حذف‌شده)
# لنگرهای دقیق + assert — اگر متن جابه‌جا شده باشد، جراحی متوقف می‌شود.
# ============================================================
import re
import pathlib

ROOT = pathlib.Path("/home/z/my-project")

# ── ۱) pn041-data-fortress.test.ts ──
p = ROOT / "tests/pn041-data-fortress.test.ts"
s = p.read_text(encoding="utf8")

s = s.replace(
    " *   C) گارد قلعه (db-fortress-guard.sh) — MISSING → احیا از چرخشی → HEALTHY\n"
    " *   D) recover-all.sh — وجود/اجراپذیری + زنجیرهٔ چهارجزئی در متن",
    " *   C) منسوخ در PN-042 (جلسهٔ ۰۷۰) — db-fortress-guard حذف شد؛ زنجیرهٔ بازیابی به resurrect-ultimate.sh منتقل شد\n"
    " *   D) منسوخ در PN-042 — recover-all.sh حذف شد؛ دستور یک‌خطی مالک: curl رستاخیز از گیت‌هاب",
)
s = s.replace(
    " *   H) اتصال بوت — dev-entry بند ۱-د + سپر قلعه در watchdog",
    " *   H) اتصال بوت — راهنمای رستاخیز در dev-entry (PN-042) + watchdog محلی-اول",
)

# حذف بلوک C+D: از نشانگر C تا نشانگر E (حصارکشی با index — ایمن در برابر جابه‌جایی)
iC = s.index("/* ═══════ C)")
iE = s.index("/* ═══════ E)")
s = s[:iC] + (
    "/* ═══════ C/D) منسوخ در PN-042 (جلسهٔ ۰۷۰) — سازوکارهای موازی حذف شدند ═══════ */\n\n"
) + s[iE:]

h1_old = '''  test("H-1 dev-entry: گارد قلعه در بند ۱-د بعد از سپر گیت‌هاب", async () => {
    const src = await Bun.file(join(ROOT, "scripts/pn006/dev-entry.sh")).text();
    expect(src).toContain("db-fortress-guard.sh");
    const idxSupreme = src.indexOf("github-supreme-guard.sh");
    const idxFortress = src.indexOf("db-fortress-guard.sh");
    expect(idxSupreme).toBeGreaterThan(0);
    expect(idxFortress).toBeGreaterThan(idxSupreme); // قلعه بعد از کد — اول کد، بعد دیتا
  });'''
h1_new = '''  test("H-1 dev-entry (PN-042): راهنمای رستاخیز + حذف قلاب‌های بازیابی خودکار", async () => {
    const src = await Bun.file(join(ROOT, "scripts/pn006/dev-entry.sh")).text();
    expect(src).toContain("resurrect-ultimate.sh");
    expect(src).toContain("curl -fsSL");
    expect(src).not.toContain("github-supreme-guard.sh");
    expect(src).not.toContain("db-fortress-guard.sh");
  });'''
assert h1_old in s, "H-1 anchor یافت نشد"
s = s.replace(h1_old, h1_new)

# حذف import بلااستفادهٔ bun:sqlite (Database فقط در بند C استفاده می‌شد)
if re.search(r"\bDatabase\b", s.replace('import { Database } from "bun:sqlite";', "")) is None:
    s = s.replace('import { Database } from "bun:sqlite";\n', "")
    print("  import بلااستفادهٔ bun:sqlite حذف شد")

p.write_text(s, encoding="utf8")
print("pn041-data-fortress.test.ts جراحی شد ✓")

# ── ۲) pn041r-auth-resilience.test.ts ──
p2 = ROOT / "tests/pn041r-auth-resilience.test.ts"
s2 = p2.read_text(encoding="utf8")
h4_old = '''  test("H-4 db-fortress-guard زنده = دیسک محلی", () => {
    const src = read("scripts/recovery/db-fortress-guard.sh");
    expect(src).toContain('LIVE="$REPO/db/custom.db"');
    expect(src).toContain('vacuum-copy.ts" "$BEST" "$LIVE"');
  });'''
h4_new = '''  test("H-4 رستاخیز نهایی: زنده = دیسک محلی + زنجیرهٔ قلعه (PN-042)", () => {
    const src = read("resurrect-ultimate.sh");
    expect(src).toContain('LIVE="$REPO/db/custom.db"');
    expect(src).toContain('FORT="$REPO/upload/.data/custom.db"');
    expect(src).toContain("صفر مداخله");
  });'''
assert h4_old in s2, "H-4 anchor یافت نشد"
s2 = s2.replace(h4_old, h4_new)
p2.write_text(s2, encoding="utf8")
print("pn041r-auth-resilience.test.ts جراحی شد ✓")
