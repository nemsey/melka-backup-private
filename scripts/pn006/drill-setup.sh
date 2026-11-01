#!/usr/bin/env bash
# ============================================================
# PN-006 BLOCK 3 — ساخت قرق خوددرمانی (یک‌بار اجرا شود)
# قرق: /home/z/my-project/recovery-drill — ایزوله از تولید
# ============================================================
set -euo pipefail
ROOT=/home/z/my-project/recovery-drill
PROJ=/home/z/my-project

echo "[setup] ساخت قرق در $ROOT"
rm -rf "$ROOT"
mkdir -p "$ROOT/db" "$ROOT/upload/.survival" "$ROOT/upload/dataset-backups" \
         "$ROOT/scripts/recovery" "$ROOT/scripts/pn005c"

# ۱) DB قرق از بکاپ سالم pre-pn006 (دارای هش + گراف)
echo "[setup] کپی DB پایه (بکاپ pre-pn006 — ۱۸۰MB)…"
cp "$PROJ/backups/pre-pn006-2026-10-06T05-33-48.db" "$ROOT/db/custom.db"

# ۲) بستهٔ بقای قرق — عین بستهٔ زنجیرهٔ تولید (chainIndex=6)
echo "[setup] کپی بستهٔ بقا (PN-005C chainIndex=6 — ۱۸۰MB)…"
mkdir -p "$ROOT/upload/.survival/PN-DRILL-01"
cp "$PROJ/upload/.survival/PN-005C-20261006/custom.db" "$ROOT/upload/.survival/PN-DRILL-01/custom.db"

# ۳) الگوی env بازیابی (عین زیرساخت تولید)
cp "$PROJ/upload/.survival/env.local.template" "$ROOT/upload/.survival/env.local.template"

# ۴) auto-recovery.sh — کپیِ دست‌نخوردهٔ تولید (با env قابل پارامتری است)
cp "$PROJ/scripts/recovery/auto-recovery.sh" "$ROOT/scripts/recovery/auto-recovery.sh"

# ۵) گارد قرق (نسخهٔ نشانگاری‌شده — بدون pkill/بیلد واقعی)
cp "$PROJ/scripts/pn006/recovery-guard-drill.sh" "$ROOT/scripts/pn005c/recovery-guard.sh"

# ۶) وارسی سلامت اولیهٔ DB قرق (باید سالم باشد پیش از تخریب)
python3 - "$ROOT/db/custom.db" <<'PYEOF'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
h = con.execute('SELECT masterCodeHash FROM AppMeta').fetchone()
g = con.execute('SELECT COUNT(*) FROM GraphNode').fetchone()[0]
e = con.execute('SELECT COUNT(*) FROM GraphEdge').fetchone()[0]
con.close()
assert h and h[0], "hash نباید NULL باشد"
assert g > 0, "گراف نباید صفر باشد"
print(f"[setup] DB قرق سالم: hash={str(h[0])[:10]}… گره={g} یال={e}")
PYEOF
echo "[setup] قرق آماده ✓"
