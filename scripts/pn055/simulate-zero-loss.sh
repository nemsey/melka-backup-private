#!/usr/bin/env bash
# ============================================================================
# simulate-zero-loss.sh — شبیه‌سازی صفر-اتلاف PN-055 (Sandbox کامل — هرگز DB تولید لمس نمی‌شود)
# ============================================================================
# سناریوها:
#   A) بقای WAL در کرش سخت (kill -9) + کنترل منفی «cp بدون WAL» (ریشهٔ تاریخی اتلاف)
#   B) نجات نفس آخر: checkpoint + backup → rescue + UNION با merge_union واقعی
#   C) اسکریپت واقعی hot-mirror.sh در سندباکس: چرخهٔ موفق + گارد سم + رشد مشروع
# خروجی: جدول شاهد PASS/FAIL + فایل /tmp/pn055-sim/EVIDENCE.md
# ============================================================================
set -uo pipefail
REPO="/home/z/my-project"
OPS="$REPO/scripts/pn055/mirror_ops.py"
MERGE="$REPO/scripts/pn050/merge_union.py"
SIM="/tmp/pn055-sim"
PASS=0; FAIL=0
declare -a EV

ev() { EV+=("$1"); echo "  $1"; }
ok()  { PASS=$((PASS+1)); ev "✅ PASS — $1"; }
bad() { FAIL=$((FAIL+1)); ev "❌ FAIL — $1"; }

rm -rf "$SIM"; mkdir -p "$SIM/live" "$SIM/mirror-oss" "$SIM/mirror-local"
cd "$SIM"

mk_schema() {  # دیتابیس با اسکیمای حداقلیِ جدول‌های شاهد (همان قرارداد merge_union)
python3 - "$1" <<'PY'
import sqlite3, sys
con = sqlite3.connect(sys.argv[1])
con.execute("CREATE TABLE PropertyRecord (id TEXT PRIMARY KEY, propertyCode TEXT, title TEXT)")
con.execute("CREATE TABLE RequestRecord (id TEXT PRIMARY KEY, requestCode TEXT)")
con.execute("CREATE TABLE AuditLog (id TEXT PRIMARY KEY, action TEXT, actor TEXT, detail TEXT, createdAt TEXT, operation TEXT, entityType TEXT, recordCount INT, accessScope TEXT, tenantId TEXT)")
con.commit(); con.close()
PY
}

echo "═══ سناریو A: بقای WAL در کرش سخت + کنترل منفی cp ═══"
mkdir -p live
mk_schema live/custom.db
python3 - <<'PY'
import sqlite3
con = sqlite3.connect("live/custom.db")
con.execute("PRAGMA journal_mode=WAL")
con.execute("PRAGMA wal_autocheckpoint=0")   # جلوگیری از چک‌پوینت خودکار — داده در WAL می‌ماند
con.execute("PRAGMA synchronous=FULL")
con.executemany("INSERT INTO PropertyRecord VALUES (?,?,?)",
                [(f"sim-{i:03d}", f"PC{i:03d}", f"آگهی پایه {i}") for i in range(1, 101)])
con.commit(); con.close()
PY
BASE_OK=$(python3 "$OPS" counts live/custom.db | awk '{print $1}')
[ "$BASE_OK" = "100" ] && ok "A0: دیتابیس پایه با ۱۰۰ رکورد ساخته شد ($BASE_OK)" || bad "A0: پایه غلط ($BASE_OK)"

# نگهدارنده: اتصال باز می‌ماند تا بستنِ آخرین اتصال چک‌پوینت نکند (عین سرور زنده)
python3 - <<'PY' &
import sqlite3, time
con = sqlite3.connect("live/custom.db")
con.execute("SELECT COUNT(*) FROM PropertyRecord").fetchone()
time.sleep(120)
PY
HOLDER=$!
sleep 1

# نویسنده: ۵ رکورد «ثانیهٔ آخر» — commit شده و در WAL
python3 - <<'PY'
import sqlite3
con = sqlite3.connect("live/custom.db", timeout=15)
con.execute("PRAGMA busy_timeout=15000")
con.executemany("INSERT INTO PropertyRecord VALUES (?,?,?)",
                [(f"sim-last-{i}", f"PCL{i}", f"آگهی لحظهٔ مرگ {i}") for i in range(1, 6)])
con.commit(); con.close()
PY
WAL_SIZE=$(stat -c%s live/custom.db-wal 2>/dev/null || echo 0)
[ "$WAL_SIZE" -gt 0 ] && ok "A1: ۵ رکورد ثانیهٔ آخر commit شد و در WAL است (${WAL_SIZE}B > 0)" || bad "A1: WAL خالی است"

# ── کنترل منفی: cp خام بدون WAL (روش ممنوع — همین پنجرهٔ تاریخیِ اتلاف است) ──
cp live/custom.db negative-copy.db
NEG=$(python3 "$OPS" counts negative-copy.db | awk '{print $1}')
[ "$NEG" = "100" ] && ok "A2-کنترل منفی: cp بدون WAL دقیقاً ۵ رکورد آخر را گم می‌کند ($NEG ≠ 105) — ریشهٔ اتلاف تاریخی اثبات شد" || bad "A2: کنترل منفی غیرمنتظره ($NEG)"

# ── کرش سخت: kill -9 نگهدارنده (بدون بستن تمیز → بدون چک‌پوینت) ──
kill -9 "$HOLDER" 2>/dev/null; wait "$HOLDER" 2>/dev/null
sleep 0.5
CRASH=$(python3 "$OPS" counts live/custom.db | awk '{print $1}')
[ "$CRASH" = "105" ] && ok "A3: پس از kill -9، بازگشایی WAL هر ۱۰۵ رکورد را زنده برگرداند ($CRASH = 105) — RPO=۰ در مرگ فرایند" || bad "A3: داده پس از کرش ناقص است ($CRASH)"

echo "═══ سناریو B: نجات نفس آخر (checkpoint + backup → rescue → UNION واقعی) ═══"
CKPT_OUT=$(python3 "$OPS" checkpoint live/custom.db 2>&1) && ok "B1: چک‌پوینت TRUNCATE: $CKPT_OUT" || bad "B1: چک‌پوینت ناموفق"
python3 "$OPS" backup live/custom.db rescue.db && [ "$(python3 "$OPS" quickcheck rescue.db)" = "ok" ] \
  && ok "B2: اسنپ‌شات نجات سازگار و سالم (quick_check=ok)" || bad "B2: اسنپ‌شات نجات نامعتبر"
RSC=$(python3 "$OPS" counts rescue.db | awk '{print $1}')
[ "$RSC" = "105" ] && ok "B3: اسنپ‌شات نجات هر ۱۰۵ رکورد را دارد ($RSC)" || bad "B3: اسنپ‌شات نجات ناقص ($RSC)"

# UNION واقعی: liveِ تهی‌شده (شبیه پاک‌شدن ریشه) + rescue → بازیابی کامل
mk_schema wiped-live.db
UNION_OUT=$(python3 "$MERGE" --live wiped-live.db --source rescue.db --no-audit 2>&1)
WIPED=$(python3 "$OPS" counts wiped-live.db | awk '{print $1}')
echo "$UNION_OUT" | grep -q '"status": "UNION_OK"' && [ "$WIPED" = "105" ] \
  && ok "B4: UNION واقعی merge_union.py — زندهٔ تهی از rescue به ۱۰۵ رسید ($WIPED)" || bad "B4: UNION ناموفق ($WIPED): $UNION_OUT"

echo "═══ سناریو C: اسکریپت واقعی hot-mirror.sh در سندباکس (چرخه + گارد سم + رشد) ═══"
export MELKA_LIVE_DB="$SIM/live/custom.db"
export MELKA_MIRROR_LOCAL_DIR="$SIM/mirror-local"
export MELKA_MIRROR_OSS_DIR="$SIM/mirror-oss"
export MELKA_MIRROR_LOCK="/tmp/pn055-sim-mirror.lock"
export MELKA_MIRROR_OSS_EVERY=1

bash "$REPO/scripts/pn055/hot-mirror.sh" --once
C1=$(python3 "$OPS" counts "$SIM/mirror-local/custom-hot.db" 2>/dev/null | awk '{print $1}')
C1_OSS=$(python3 "$OPS" counts "$SIM/mirror-oss/custom-hot.db" 2>/dev/null | awk '{print $1}')
[ "$C1" = "105" ] && [ "$C1_OSS" = "105" ] \
  && ok "C1: چرخهٔ اول hot-mirror — محلی و پایدار هر دو ۱۰۵ ($C1/$C1_OSS)" || bad "C1: آینه ناقص ($C1/$C1_OSS)"

# سم: دیتابیس تهی (شبیه «سنک وضعیت تهی» ۲۰۲۶-۱۱-۰۷) نباید آینهٔ پر را بپوشاند
mk_schema poison.db
MELKA_LIVE_DB="$SIM/poison.db" bash "$REPO/scripts/pn055/hot-mirror.sh" --once
C2=$(python3 "$OPS" counts "$SIM/mirror-local/custom-hot.db" | awk '{print $1}')
POISON_PARKED=$(ls "$SIM/mirror-local"/poison-witness-* 2>/dev/null | wc -l)
[ "$C2" = "105" ] && [ "$POISON_PARKED" -ge 1 ] \
  && ok "C2-گارد یکنوایی: اسنپ‌شات تهی رد شد — آینه پر ماند ($C2) + شاهد سم پارک شد ($POISON_PARKED فایل)" \
  || bad "C2: گارد سم کار نکرد ($C2 / parked=$POISON_PARKED)"

# رشد مشروع: ۳ رکورد تازه → آینه باید تازه شود
python3 - <<'PY'
import sqlite3
con = sqlite3.connect("live/custom.db", timeout=15)
con.execute("PRAGMA busy_timeout=15000")
con.executemany("INSERT INTO PropertyRecord VALUES (?,?,?)",
                [(f"sim-growth-{i}", f"PCG{i}", f"رشد مشروع {i}") for i in range(1, 4)])
con.commit(); con.close()
PY
bash "$REPO/scripts/pn055/hot-mirror.sh" --once
C3=$(python3 "$OPS" counts "$SIM/mirror-local/custom-hot.db" | awk '{print $1}')
[ "$C3" = "108" ] && ok "C3: رشد مشروع — آینه به ۱۰۸ تازه شد ($C3)" || bad "C3: آینه رشد را نگرفت ($C3)"

HW=$(cat "$SIM/mirror-oss/HIGHWATER.json" 2>/dev/null)
echo "$HW" | grep -q '"propertyCount": 108' && ok "C4: شاهد HIGHWATER در لایهٔ پایدار: $HW" || bad "C4: HIGHWATER غلط: $HW"

echo
echo "════════════ نتیجه: PASS=$PASS · FAIL=$FAIL ════════════"
{
  echo "# شواهد شبیه‌سازی PN-055 — $(date -u +%FT%TZ)"
  echo
  for e in "${EV[@]}"; do echo "$e"; done
} > "$SIM/EVIDENCE.md"
[ "$FAIL" -eq 0 ]
