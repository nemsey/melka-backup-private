#!/usr/bin/env bash
# ============================================================
# audit-reproducibility.sh — گارد بازتولیدپذیری ملکا
# ملکا-شورا-ن۰۰۷-۱۴۰۵ · فاز ۰.۵ · BLOCK 4
# ------------------------------------------------------------
# شش بررسی مصوب:
#   ۱) BUILD_ID سرور = HEAD گیت
#   ۲) Fingerprint سرور = Fingerprint کد (lockfile/schema/pkg/env)
#   ۳) lockfile از آخرین بستهٔ بقا تغییر نکرده
#   ۴) schema.prisma از آخرین بستهٔ بقا تغییر نکرده (بدون migration)
#   ۵) آخرین بستهٔ بقا ≥ ۷ روز پیش نیست
#   ۶) زنجیرهٔ هش بسته‌های بقا دست‌نخورده است
# Gate: bash scripts/audit-reproducibility.sh --strict  (پیش از هر کامیت نهایی)
# خروج: ۰ = همه سبز · ۱ = حداقل یک قرمز
# ============================================================
set -uo pipefail
cd /home/z/my-project

STRICT="${1:-}"
BASE="${BASE_URL:-http://localhost:3000}"
PASS=0; FAIL=0; WARN=0
results=()

ok()   { PASS=$((PASS+1)); results+=("✅ $1"); echo "  ✅ $1"; }
bad()  { FAIL=$((FAIL+1)); results+=("✗ $1"); echo "  ✗ $1"; }
warn() { WARN=$((WARN+1)); results+=("⚠ $1"); echo "  ⚠ $1"; }

# تازه‌ترین بستهٔ بقا
NEWEST_PKG=""
for d in $(ls -d upload/.survival/P*/ 2>/dev/null | sort -V); do NEWEST_PKG="${d%/}"; done
[[ -z "$NEWEST_PKG" ]] && NEWEST_PKG="upload/.survival/PN-007-20261006"

echo "═══ گارد بازتولیدپذیری — $(date -u +%FT%TZ) — بستهٔ مرجع: $NEWEST_PKG ═══"

# ── دادهٔ سرور زنده ──
VERSION_JSON=$(curl -s -m 8 "$BASE/api/version" 2>/dev/null || echo "")
if [[ -z "$VERSION_JSON" ]]; then
  bad "سرور روی $BASE پاسخ نمی‌دهد (بررسی ۱ و ۲ غیرقابل ارزیابی)"
else
  SRV_BUILD_ID=$(echo "$VERSION_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin).get('buildId',''))" 2>/dev/null || echo "")
  SRV_GITSHA=$(echo "$VERSION_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin).get('gitSha',''))" 2>/dev/null || echo "")
  SRV_FP=$(echo "$VERSION_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin).get('fingerprintSource','missing'))" 2>/dev/null || echo "missing")
fi

# ── ۱) BUILD_ID سرور = HEAD ──
echo "── بررسی ۱: BUILD_ID سرور = HEAD گیت ──"
HEAD_SHORT=$(git rev-parse --short HEAD)
if [[ -z "${SRV_BUILD_ID:-}" ]]; then
  bad "۱) BUILD_ID سرور خوانده نشد"
elif [[ "$SRV_BUILD_ID" == "$HEAD_SHORT-"* ]]; then
  ok "۱) BUILD_ID سرور ($SRV_BUILD_ID) با HEAD ($HEAD_SHORT) می‌خواند"
else
  bad "۱) BUILD_ID سرور ($SRV_BUILD_ID) ≠ HEAD ($HEAD_SHORT) — سرور کد کهنه/تازه سرو می‌کند؛ بیلد+ری‌استارت لازم"
fi

# ── ۲) Fingerprint سرور = Fingerprint کد ──
echo "── بررسی ۲: Fingerprint سرور = Fingerprint کد ──"
if [[ -n "${SRV_FP:-}" && "$SRV_FP" != "missing" ]]; then
  FP_OK=$(python3 - "$VERSION_JSON" <<'PYEOF'
import json, sys, hashlib, os
v = json.loads(sys.argv[1])
fp = v.get("fingerprint") or {}
def sha(p):
    try: return hashlib.sha256(open(p,'rb').read()).hexdigest()
    except FileNotFoundError: return "missing"
code = {
    "lockfileSha256": sha("bun.lock") or sha("bun.lockb"),
    "schemaSha256": sha("prisma/schema.prisma"),
    "packageJsonSha256": sha("package.json"),
}
diffs = [k for k,val in code.items() if fp.get(k) != val]
git_sha_local = os.popen("git rev-parse HEAD").read().strip()
if fp.get("gitSha") != git_sha_local: diffs.append("gitSha")
if v.get("fingerprintSource") != "baked": diffs.append("fingerprintSource")
print("OK" if not diffs else "DIFF:" + ",".join(diffs))
PYEOF
)
  if [[ "$FP_OK" == "OK" ]]; then
    ok "۲) Fingerprint سرور = Fingerprint کد (gitSha + lockfile + schema + package.json، source=baked)"
  else
    bad "۲) Fingerprint سرور ≠ کد — تفاوت‌ها: ${FP_OK#DIFF:} (سرور از کدِ فعلی عقب/جلوست — تا build تازه معتبر نیست)"
  fi
else
  warn "۲) سرور Fingerprint ندارد (کد پیش از ن۰۰۷ یا سرور خاموش)"
fi

# ── شاخص‌های آخرین بستهٔ بقا ──
PKG_FP="$NEWEST_PKG/FINGERPRINT.json"
PKG_LOCK_FALLBACK="$NEWEST_PKG/bun.lock"

# ── ۳) lockfile از آخرین بستهٔ بقا تغییر نکرده ──
echo "── بررسی ۳: lockfile بی‌تغییر از آخرین بستهٔ بقا ──"
CUR_LOCK_SHA=$(sha256sum bun.lock 2>/dev/null | cut -d' ' -f1 || sha256sum bun.lockb 2>/dev/null | cut -d' ' -f1 || echo missing)
if [[ -f "$PKG_FP" ]]; then
  PKG_LOCK_SHA=$(python3 -c "import json; print(json.load(open('$PKG_FP'))['lockfileSha256'])" 2>/dev/null || echo missing)
elif [[ -f "$PKG_LOCK_FALLBACK" ]]; then
  PKG_LOCK_SHA=$(sha256sum "$PKG_LOCK_FALLBACK" | cut -d' ' -f1)
else
  PKG_LOCK_SHA=missing
fi
if [[ "$PKG_LOCK_SHA" == "missing" ]]; then
  warn "۳) بستهٔ مرجع lockfile ندارد — قابل مقایسه نیست"
elif [[ "$CUR_LOCK_SHA" == "$PKG_LOCK_SHA" ]]; then
  ok "۳) lockfile (${CUR_LOCK_SHA:0:12}…) با آخرین بستهٔ بقا یکسان است"
else
  bad "۳) lockfile تغییر کرده: کد=${CUR_LOCK_SHA:0:12}… بسته=${PKG_LOCK_SHA:0:12}… — وابستگی‌ها جابه‌جا شده‌اند (بستهٔ بقا تازه لازم است)"
fi

# ── ۴) schema.prisma بدون تغییر (بدون migration) ──
echo "── بررسی ۴: schema.prisma بی‌تغییر از آخرین بستهٔ بقا ──"
CUR_SCHEMA_SHA=$(sha256sum prisma/schema.prisma 2>/dev/null | cut -d' ' -f1 || echo missing)
if [[ -f "$PKG_FP" ]]; then
  PKG_SCHEMA_SHA=$(python3 -c "import json; print(json.load(open('$PKG_FP'))['schemaSha256'])" 2>/dev/null || echo missing)
  if [[ "$CUR_SCHEMA_SHA" == "$PKG_SCHEMA_SHA" ]]; then
    ok "۴) schema.prisma (${CUR_SCHEMA_SHA:0:12}…) بی‌تغییر — بدون migration"
  else
    bad "۴) schema.prisma تغییر کرده: کد=${CUR_SCHEMA_SHA:0:12}… بسته=${PKG_SCHEMA_SHA:0:12}… — migration ثبت/بسته‌سازی لازم"
  fi
else
  warn "۴) بستهٔ مرجع FINGERPRINT.json ندارد (legacy) — مقایسهٔ اسکیما ممکن نیست"
fi

# ── ۵) آخرین بستهٔ بقا ≥ ۷ روز پیش نیست ──
echo "── بررسی ۵: تازگی بستهٔ بقا (سقف ۷ روز) ──"
if [[ -f "$PKG_FP" ]]; then
  PKG_DATE=$(python3 -c "import json; print(json.load(open('$PKG_FP'))['builtAt'][:10])" 2>/dev/null || echo "")
else
  PKG_DATE=$(stat -c %y "$NEWEST_PKG" 2>/dev/null | cut -d' ' -f1)
fi
if [[ -n "${PKG_DATE:-}" ]]; then
  AGE_DAYS=$(( ( $(date +%s) - $(date -d "$PKG_DATE" +%s 2>/dev/null || date +%s) ) / 86400 ))
  if [[ $AGE_DAYS -le 7 ]]; then
    ok "۵) آخرین بستهٔ بقا از $PKG_DATE است (${AGE_DAYS} روز پیش ≤ ۷)"
  else
    bad "۵) آخرین بستهٔ بقا ${AGE_DAYS} روز پیش است (> ۷ روز) — بستهٔ بقا تازه بسازید"
  fi
else
  warn "۵) تاریخ بستهٔ بقا خوانده نشد"
fi

# ── ۶) زنجیرهٔ هش دست‌نخورده ──
echo "── بررسی ۶: زنجیرهٔ هش بسته‌های بقا ──"
CHAIN_BROKEN=0
CHAIN_CHECKED=0
for d in $(ls -d upload/.survival/P*/ 2>/dev/null | sort -V); do
  pkg="${d%/}"
  # 6-الف) MANIFEST.md5 هر بسته باید درست باشد (صحت فایل‌ها)
  if [[ -f "$pkg/MANIFEST.md5" ]]; then
    if ( cd "$pkg" && md5sum -c MANIFEST.md5 --quiet > /dev/null 2>&1 ); then
      CHAIN_CHECKED=$((CHAIN_CHECKED+1))
    else
      # فایل‌های اضافه‌شدهٔ پس از مهر (مثل screens تازه) خطا نمی‌شمارند؛
      # فقط فایل‌های REGISTERED که هش‌شان می‌شکند قرمز است:
      BROKEN=$( cd "$pkg" && md5sum -c MANIFEST.md5 2>/dev/null | grep ": FAILED" | grep -vc "MANIFEST.md5" || true ); BROKEN=${BROKEN:-0}
      if [[ "${BROKEN:-0}" -gt 0 ]]; then
        bad "۶) $pkg — ${BROKEN} فایلِ مهرشده تغییر یافته (زنجیره شکسته!)"
        CHAIN_BROKEN=1
      fi
    fi
  fi
  # 6-ب) CHAIN.json: لنگر قبلی باید با بستهٔ قبلی بخواند
  if [[ -f "$pkg/CHAIN.json" ]]; then
    ANCHOR=$(python3 - "$pkg" <<'PYEOF'
import json, sys, hashlib, os
pkg = sys.argv[1]
ch = json.load(open(f"{pkg}/CHAIN.json"))
prev_pkg = ch.get("previous", {}).get("package")
prev_md5 = ch.get("previous", {}).get("manifestMd5")
if not prev_pkg:
    print("OK:genesis")
elif not os.path.isdir(f"upload/.survival/{prev_pkg}"):
    print("BROKEN:prev-missing")
else:
    actual = hashlib.md5(open(f"upload/.survival/{prev_pkg}/MANIFEST.json","rb").read()).hexdigest()
    print("OK:anchor" if actual == prev_md5 else f"BROKEN:anchor-mismatch({actual[:8]}!={str(prev_md5)[:8]})")
# لنگر داخلی: dbMd5 باید با فایل md5 بخواند
if os.path.exists(f"{pkg}/db/custom.db.md5"):
    declared = open(f"{pkg}/db/custom.db.md5").read().split()[0]
    anchors_db = ch.get("anchors", {}).get("dbMd5")
    if anchors_db and anchors_db != declared:
        print("BROKEN:db-md5-anchor")
PYEOF
)
    if [[ "$ANCHOR" == *BROKEN* ]]; then
      bad "۶) زنجیرهٔ $pkg: $ANCHOR"
      CHAIN_BROKEN=1
    else
      CHAIN_CHECKED=$((CHAIN_CHECKED+1))
    fi
  fi
done
[[ $CHAIN_BROKEN -eq 0 ]] && ok "۶) زنجیرهٔ هش سالم (${CHAIN_CHECKED} وارسی در ${#results[@]} بسته)"

# ═══ جمع‌بندی ═══
echo ""
echo "═══ نتیجه: $PASS سبز · $WARN هشدار · $FAIL قرمز ═══"
if [[ $FAIL -gt 0 ]]; then
  echo "VERDICT: NOT-REPRODUCIBLE — رفع قرمزها پیش از کامیت الزامی است"
  [[ "$STRICT" == "--strict" ]] && exit 1 || exit 1
fi
echo "VERDICT: REPRODUCIBLE ✓"
exit 0
