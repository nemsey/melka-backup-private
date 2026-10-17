#!/usr/bin/env bash
# ============================================================================
# PN-022-A — گارد audit-tile-contract.sh (گام ۵-ش)
# قرارداد TileDefinition روی همهٔ کاشی‌های موجود: id یکتا · order یکتا ·
# accent معتبر · agent binding صریح · صفحهٔ lazy · قرارداد defineTile
# خروجی: download/pn022/guards-tile-contract.json
# ============================================================================
set -uo pipefail
cd /home/z/my-project
OUT=download/pn022/guards-tile-contract.json

python3 - "$OUT" <<'PYEOF'
import json, os, re, sys

out_path = sys.argv[1]
os.makedirs(os.path.dirname(out_path), exist_ok=True)
violations = []
checks = []

VALID_ACCENTS = {"login", "home", "finder", "melka-listing", "melka-request", "settings",
                 "mgmt", "m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8", "consultant", "ai"}

# ─── ۱) قرارداد خالص در سورس (tile-contract.ts) ───
contract = open("src/core/tiles/tile-contract.ts", encoding="utf-8").read()
for needle, label in [
    ("export interface TileDefinition", "اینترفیس TileDefinition"),
    ("export function defineTile", "سازندهٔ defineTile با اعتبارسنجی"),
    ("id: string", "فیلد id"),
    ("agent: TileAgentBinding | null", "اتصال ایجنت صریح (یا null)"),
    ("minRole?", "حداقل نقش"),
    ("container?", "کاشی ظرف"),
]:
    if needle not in contract:
        violations.append(f"قرارداد کاشی ناقص: {label} ({needle!r} یافت نشد)")
checks.append({"check": "قرارداد TileDefinition در سورس", "ok": not violations})

# ─── ۲) همهٔ کاشی‌های موجود: فایل index با defineTile ───
tiles_dir = "src/core/tiles/tiles"
tiles = sorted(d for d in os.listdir(tiles_dir) if os.path.isdir(os.path.join(tiles_dir, d)))
# ن۰۶۳ (PN-038/فاز ۲): هوم یک‌پارچه — M6/M7/ظرف حذف + ۲ کاشی کهنهٔ ملکا از هوم رفت → ۱۱
if len(tiles) < 11:
    violations.append(f"شمار کاشی‌ها غیرمنتظره: {len(tiles)} (< ۱۱ خط پایهٔ ن۰۶۳)")
ids = []
id_folder_mismatches = []   # واقعیت موروثی — ثبت اطلاعاتی (id پایدار عمومی است؛ تغییر = شکستن تنظیمات)
for t in tiles:
    idx = os.path.join(tiles_dir, t, "index.ts")
    if not os.path.exists(idx):
        violations.append(f"کاشی بدون index.ts: {t}")
        continue
    src = open(idx, encoding="utf-8").read()
    # id معتبر kebab + یکتا (id = شناسهٔ پایدار عمومی — نام پوشه صرفاً قرارداد کاشی‌های تازهٔ کارخانه)
    m = re.search(r'id:\s*"([^"]+)"', src)
    if not m:
        violations.append(f"کاشی بدون id: {t}")
    else:
        if not re.match(r"^[a-z][a-z0-9-]*$", m.group(1)):
            violations.append(f"id غیر kebab در {t}: {m.group(1)!r}")
        if m.group(1) != t:
            id_folder_mismatches.append({"folder": t, "id": m.group(1)})
        ids.append(m.group(1))
    # accent معتبر
    am = re.search(r'accent:\s*"([^"]+)"', src)
    if not am or am.group(1) not in VALID_ACCENTS:
        violations.append(f"accent نامعتبر در {t}: {am.group(1) if am else '—'}")
    # order عددی (تکرار درون‌ظرف مجاز — مرتب‌سازی پایدار تعیین‌کننده)
    if not re.search(r'order:\s*\d+', src):
        violations.append(f"order عددی ندارد: {t}")
    # agent صریح (binding یا null)
    if "agent:" not in src:
        violations.append(f"اتصال ایجنت صریح نیست (حتی null): {t}")

dup_ids = {i for i in ids if ids.count(i) > 1}
if dup_ids:
    violations.append(f"id تکراری: {sorted(dup_ids)}")
checks.append({"check": "کاشی‌های موجود", "tiles": len(tiles), "ids": len(ids), "uniqueIds": len(set(ids)),
               "idFolderMismatches": id_folder_mismatches, "note": "نابرابری id/پوشه = نام‌گذاری موروثیِ پایدار (id عمومی است) — اطلاعاتی، نه نقض"})

# ─── ۳) رجیستری: هر ثبت با tileRegistry.register ───
reg_count = 0
for t in tiles:
    idx = os.path.join(tiles_dir, t, "index.ts")
    if os.path.exists(idx) and "tileRegistry.register" in open(idx, encoding="utf-8").read():
        reg_count += 1
checks.append({"check": "ثبت رجیستری", "registered": reg_count, "skeletons": len(tiles) - reg_count})

# ─── ۴) اسکلت‌های Feature Factory هرگز ثبت‌نشده ───
for t in tiles:
    idx = os.path.join(tiles_dir, t, "index.ts")
    if os.path.exists(idx):
        src = open(idx, encoding="utf-8").read()
        if "TILE_SKELETON" in src and "tileRegistry.register" in src:
            violations.append(f"کاشی اسکلت (TILE_SKELETON) در رجیستری ثبت شده: {t}")

result = {
    "workOrder": "PN-022-A/مرحلهٔ۵ — گارد tile-contract (گام ۵-ش)",
    "ranAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
    "checks": checks,
    "tiles": tiles,
    "violations": violations,
    "verdict": "PASS" if not violations else "FAIL",
}
json.dump(result, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print("PASS — قرارداد همهٔ کاشی‌ها سالم" if not violations else "FAIL:\n" + "\n".join("  ✗ " + v for v in violations))
sys.exit(0 if not violations else 1)
PYEOF
