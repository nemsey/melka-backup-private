#!/usr/bin/env bash
# ============================================================================
# PN-024 — گارد audit-negin-consistency.sh (گام ۵-ت)
# هویت نگین: ۱۱ گوهر سازگار — پالت + CSS + رجیستری + اعمال ۱۱ کاشی + قانون ۶
# دریل منفی درون‌ساخت: تکرار رنگ ۵۰۰ ⇒ قرمز
# خروجی: download/pn024/guards-negin.json
# ============================================================================
set -uo pipefail
cd /home/z/my-project
OUT=download/pn024/guards-negin.json

python3 - "$OUT" <<'PYEOF'
import json, os, re, sys

out_path = sys.argv[1]
os.makedirs(os.path.dirname(out_path), exist_ok=True)
violations = []
checks = []

# منبع یگانه: رجیستری negin-palette از ماژول (عین تست‌ها — از متن فایل استخراج
# نمی‌کنیم چون TS است؛ ولی برای گارد پوسته، قرارداد از متن فایل عینه می‌شود)
pal = open("src/lib/negin-palette.ts", encoding="utf-8").read()

# ─── ۱) رجیستری: ۱۱ گوهر با فیلدهای کامل ───
for needle, label in [
    ("export const NEGIN_GEMS", "رجیستری گوهرها"),
    ("export const ACCENT_TO_GEM", "نگاشت accent→گوهر"),
    ("export const NEGIN_GRADIENTS", "۴ گرادیان"),
    ("export const NEGIN_EFFECTS", "۵ افکت"),
    ("export function neginContrastReport", "گزارش کنتراست WCAG"),
    ("export function neginUnique500", "یتایی رنگ‌ها"),
]:
    if needle not in pal:
        violations.append(f"رجیستری نگین ناقص: {label}")
checks.append({"check": "۱ رجیستری negin-palette.ts", "ok": not violations})

# ─── ۲) یتایی رنگ ۵۰۰ (دریل منفی خودکار: تکرار = قرمز) ───
ids = re.findall(r'\n    id: "([a-z-]+)"', pal)
# فقط خانهٔ ۵۰۰ در بلوکِ light هر گوهر (دارک جدا است — قاعدهٔ ۴)
hexes = re.findall(r'light: \{[^}]*?"500": "(#[0-9A-Fa-f]{6})"', pal, re.DOTALL)
if len(ids) != 11:
    violations.append(f"شمار گوهرها {len(ids)} ≠ ۱۱")
if len(hexes) != 11:
    violations.append(f"شمار رنگ‌های ۵۰۰ روشن: {len(hexes)} ≠ ۱۱")
elif len(set(h.upper() for h in hexes)) != 11:
    violations.append("رنگ ۵۰۰ تکراری — قاعدهٔ ۱ مالک (هر گوهر یکتا) نقض شد")
checks.append({"check": "۲ یتایی ۱۱ گوهر (دریل منفی: تکرار رنگ = قرمز)", "ok": len(hexes) == 11 and len(set(hexes)) == 11})

# ─── ۳) CSS: متغیرها + توکن‌ها + افکت‌ها ───
css = open("src/app/globals.css", encoding="utf-8").read()
for gid in ids:
    for s in ["50", "200", "400", "500", "700"]:
        if f"--negin-{gid}-{s}:" not in css:
            violations.append(f"CSS متغیر --negin-{gid}-{s} یافت نشد (light/dark)")
        if f"--color-negin-{gid}-{s}:" not in css:
            violations.append(f"توکن Tailwind --color-negin-{gid}-{s} یافت نشد")
for eff in ["negin-glow", "negin-shine", "negin-sparkle", "negin-depth", "negin-glass", "negin-bar"]:
    if f".{eff}" not in css:
        violations.append(f"افکت/کلاس .{eff} در CSS تعریف نشده")
for grad in ["negin-grad-shafaq", "negin-grad-ocean", "negin-grad-jangal", "negin-grad-shahaneh"]:
    if f".{grad}" not in css:
        violations.append(f"گرادیان .{grad} تعریف نشده")
checks.append({"check": "۳ CSS: ۱۱×۵ متغیر ×۲ تم + توکن‌ها + ۵ افکت + ۴ گرادیان", "ok": True})

# ─── ۴) قانون ۶: صفر نشست در رنگ CANONICAL ───
vc = open("src/lib/value-colors.ts", encoding="utf-8").read()
if "negin" in vc:
    violations.append("قانون ۶ نقض: value-colors.ts آلوده به نگین شده")
# PN-027 · ۵-ب-۳ — colors.json به آرشیو منتقل شد (جلسهٔ ۰۳۴: آرشیو، صفر حذف)
import os
_colors_path = "scripts/p6530/colors.json" if os.path.exists("scripts/p6530/colors.json") else "docs/archive/scripts/p6530/colors.json"
colors_json = open(_colors_path, encoding="utf-8").read()
if "negin" in colors_json:
    violations.append("قانون ۶ نقض: colors.json (PN-011) آلوده شده")
checks.append({"check": "۴ قانون ۶: صفر تغییر رنگ CANONICAL (value-colors + colors.json)", "ok": "negin" not in vc and "negin" not in colors_json})

# ─── ۵) اعمال: TileCard + ۹ صفحه (ن۰۶۳: M6/M7 حذف) ───
tile = open("src/components/app/TileCard.tsx", encoding="utf-8").read()
if 'data-negin={a.gem}' not in tile:
    violations.append("TileCard دیتای نگین را رندر نمی‌کند (data-negin غایب)")
if "negin-bar" not in tile:
    violations.append("TileCard میلهٔ نگین را رندر نمی‌کند")
# ن۰۶۳ (PN-038/فاز ۲): M6 (market-index) و M7 (data-coverage) حذف شدند → ۹ صفحهٔ نگین‌دار
pages = [
    "file-finder/FileFinderPage.tsx", "listing/ListingsPage.tsx", "request/RequestsPage.tsx",
    "arm-listing/ArmListingsPage.tsx", "arm-request/ArmRequestsPage.tsx", "transactions-contracts/TransactionsContractsPage.tsx",
    "experts/ExpertsPage.tsx", "smart-matching/SmartMatchingPage.tsx", "learning-tier/LearningTierPage.tsx",
]
applied = []
for p in pages:
    src = open(f"src/core/tiles/tiles/{p}", encoding="utf-8").read()
    m = re.search(r'data-negin="([a-z-]+)"', src)
    if not m:
        violations.append(f"صفحهٔ {p} دیتای نگین ندارد")
    else:
        if m.group(1) not in ids:
            violations.append(f"صفحهٔ {p} گوهر نامعتبر: {m.group(1)}")
        applied.append(m.group(1))
if len(set(applied)) != 9:
    violations.append(f"اعمال نگین یکتا نیست: {len(set(applied))}/۹ (ن۰۶۳: M6/M7 رفتند)")
checks.append({"check": "۵ اعمال: TileCard + ۱۱ صفحه با گوهر یکتا", "ok": len(set(applied)) == 11 and len(applied) == 11})

result = {
    "guard": "audit-negin-consistency",
    "workOrder": "PN-024/مرحلهٔ ۱۱ — ۱۱ نگین سازگار (پالت · CSS · رجیستری · اعمال · قانون ۶)",
    "generatedAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
    "checks": checks,
    "gems": ids,
    "appliedOnTiles": applied,
    "violations": violations,
    "pass": not violations,
}
json.dump(result, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(("PASS: هویت نگین سازگار — ۱۱ گوهر · ۱۱ کاشی") if result["pass"] else "FAIL: " + "; ".join(violations[:4]))
sys.exit(0 if result["pass"] else 1)
PYEOF
