#!/usr/bin/env bash
# ============================================================
# park-deliver.sh — PN-018/مرحلهٔ ۱ (رفع F4): پارک موقت deliver-store
# ------------------------------------------------------------
# ریشهٔ F4 (ENOSPC مکرر): file-tracing بیلد، پوشه‌های غیرعملیاتی را داخل
# .next/standalone کپی می‌کند و rm پاک‌ساز «پایانِ» زنجیره است → اوج دیسکِ
# حین build = standalone کهنه + کپی تازه (~۴٫۷GB).
#
# ترفند پارک (درس چهارم BUILD-DISCIPLINE): mv بیرون از ریشهٔ repo = آنی،
# tracing اصلاً وارد آن نمی‌شود → standalone لاغر (۱۷۹MB).
#
# استفاده:
#   park-deliver.sh park     # پارک + شاهد + پیش‌شرط فضا
#   park-deliver.sh unpark   # بازگشت + آزمون لینک /deliver کامل
#   park-deliver.sh status   # وضعیت
# قید: هرگز بدون unpark کار دیگری نکن — پنجرهٔ پارک باید کوتاه بماند.
# ============================================================
set -euo pipefail
cd /home/z/my-project

STORE="/home/z/my-project/deliver-store"
PARK="/home/z/deliver-store-park"
WITNESS="download/pn018/park-state.json"

free_gb() { df -BG / | tail -1 | awk '{print $4}' | tr -d 'G'; }

require_fresh() {
  local need_gb="${1:-4}"
  local have
  have=$(free_gb)
  if [ "$have" -lt "$need_gb" ]; then
    echo "✗ فضای آزاد ${have}GB < ${need_gb}GB لازم — هرس بکاپ/بسته لازم است (قاعدهٔ BUILD-DISCIPLINE)"
    exit 1
  fi
}

case "${1:-status}" in
  park)
    if [ -e "$PARK" ] && [ ! -e "$STORE" ]; then echo "⚠ هم‌اکنون پارک است"; exit 0; fi
    if [ ! -d "$STORE" ]; then echo "✗ deliver-store یافت نشد"; exit 1; fi
    rm -rf .next/standalone          # کپی کهنه — بزرگ‌ترین عامل ENOSPC
    rm -f .next/lock                  # قفل بیلد نیمه‌کارهٔ قبلی
    require_fresh 3
    local_size=$(du -sm "$STORE" | cut -f1)
    t0=$(date +%s)
    mv "$STORE" "$PARK"
    t1=$(date +%s)
    python3 - "$local_size" "$t0" "$t1" <<'PYEOF'
import json, sys, subprocess, datetime
w = {
  "state": "parked",
  "at": datetime.datetime.now().isoformat(),
  "movedMB": int(sys.argv[1]),
  "moveMs": int(sys.argv[3]) - int(sys.argv[2]),
  "freeGBAfter": subprocess.run(["df","-BG","/"],capture_output=True,text=True).stdout.split("\n")[-2].split()[3].rstrip("G"),
  "note": "پارک بیرون از ریشهٔ tracing — بیلد لاغر؛ پس از بیلد فوراً unpark + آزمون لینک",
}
open("download/pn018/park-state.json","w").write(json.dumps(w, ensure_ascii=False, indent=2))
print(json.dumps(w, ensure_ascii=False))
PYEOF
    ;;

  unpark)
    if [ ! -e "$PARK" ]; then echo "⚠ پارکی در کار نیست"; exit 0; fi
    if [ -e "$STORE" ]; then echo "✗ مقصد اشغال است — بررسی دستی"; exit 1; fi
    t0=$(date +%s)
    mv "$PARK" "$STORE"
    t1=$(date +%s)
    # آزمون لینک — الزام درس چهارم
    if bun scripts/pn017/link-test.ts > /tmp/pn018-linktest.log 2>&1; then
      verdict="PASS-30/30"
    else
      verdict="LINK-FAIL"; cat /tmp/pn018-linktest.log | tail -5
    fi
    python3 - "$t0" "$t1" "$verdict" <<'PYEOF'
import json, sys, datetime
w = {
  "state": "unparked",
  "at": datetime.datetime.now().isoformat(),
  "moveMs": int(sys.argv[2]) - int(sys.argv[1]),
  "linkTest": sys.argv[3],
}
try:
    prev = json.load(open("download/pn018/park-state.json"))
    prev.update(w)
    w = prev
except Exception:
    pass
open("download/pn018/park-state.json","w").write(json.dumps(w, ensure_ascii=False, indent=2))
print(json.dumps(w, ensure_ascii=False))
PYEOF
    [ "$verdict" = "PASS-30/30" ] || exit 1
    ;;

  status)
    if [ -e "$PARK" ] && [ ! -e "$STORE" ]; then echo "وضعیت: PARKED (در حین بیلد — فراموش نکن unpark)"
    else echo "وضعیت: normal"; fi
    echo "فضای آزاد: $(free_gb)GB · standalone: $(du -sm .next/standalone 2>/dev/null | cut -f1 || echo 0)MB"
    ;;

  *)
    echo "استفاده: park-deliver.sh {park|unpark|status}"
    exit 1
    ;;
esac
