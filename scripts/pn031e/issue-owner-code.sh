#!/usr/bin/env bash
# =============================================================================
# issue-owner-code.sh — فاز D (PN-031-E · ۰۴۴): کد تازهٔ مالک + QR + راهنما
# =============================================================================
#   D.1) صدور enroll code تازه برای مالک (Poco F3 · ۳۰ دقیقه · ۳ تلاش)
#   D.2) تولید QR (PNG 640px) + بررسی ۲۰۰ همهٔ لینک‌ها از URL عمومی
#   D.3) شاهد روت QR تنظیمات (SVG با احراز) + مسیر UI
# خروجی: download/pn031e/ + public/deliver/pn031e/ (qr-install.png · OWNER-GUIDE.html · witness)
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/../.."

PUBLIC_URL="https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai"
OUTD="download/pn031e"
PUBD="public/deliver/pn031e"
mkdir -p "$OUTD" "$PUBD"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

jqget() { python3 -c "import json,sys;print(json.load(open('$1')).get('$2',''))"; }

echo "— فاز D: کد تازهٔ مالک + QR از URL عمومی"

# ─── سرور (درس‌های فاز C: ری‌استارت اجباری + BUILD_ID) ───
pkill -f "prod-watchdog.sh" 2>/dev/null || true
pkill -f "standalone/server.js" 2>/dev/null || true
sleep 2
rm -f .prod-stop upload/.runtime/CI_RUNNING upload/.runtime/PARK_ACTIVE
bash scripts/prod-watchdog.sh > /dev/null 2>&1 &
for i in $(seq 1 30); do curl -s -o /dev/null -m 8 http://localhost:3000/api/health && break; sleep 2; done
curl -s -o /dev/null -m 8 http://localhost:3000/api/health || { echo "✗ سرور"; exit 1; }
LIVE_FP=$(curl -s -m 10 http://localhost:3000/api/build-freshness 2>/dev/null | rg -o "<!--[a-z0-9-]+_" | head -1 | tr -d '<!-_')
DISK_FP=$(cut -d- -f1-2 .next/BUILD_ID)
echo "  ۰) سرور بالا · BUILD_ID زنده=$LIVE_FP (دیسک=$DISK_FP)"
# ─── ورود مدیر ───
MASTER_CODE=$(python3 -c "import json;print(json.load(open('env.platform.json'))['MASTER_ACCESS_CODE'])")
B=""
for i in 1 2 3 4 5; do
  B=$(curl -s -o "$TMP/login.json" -w "%{http_code}" --max-time 20 -X POST \
    "$PUBLIC_URL/api/auth/master-login" -H "Content-Type: application/json" \
    -d "{\"masterCode\":\"$MASTER_CODE\"}")
  [ "$B" = "200" ] && break; sleep 8
done
[ "$B" = "200" ] || { echo "✗ ورود مدیر: $B"; exit 1; }
TOKEN=$(jqget "$TMP/login.json" token)
AUTH=(-H "Authorization: Bearer $TOKEN")

# ─── D.1 — صدور کد تازه برای مالک (Poco F3) ───
B=$(curl -s -o "$TMP/enroll.json" -w "%{http_code}" --max-time 20 "${AUTH[@]}" \
  -X POST "$PUBLIC_URL/api/admin/relay/enroll" \
  -H "Content-Type: application/json" -d '{"label":"Poco F3 مالک"}')
[ "$B" = "200" ] || { echo "✗ ثبت دستگاه مالک: $B"; cat "$TMP/enroll.json"; exit 1; }
CODE=$(python3 -c "
import json, urllib.parse
d = json.load(open('$TMP/enroll.json'))
print(urllib.parse.parse_qs(urllib.parse.urlparse(d['bootstrapUrl']).query)['code'][0])")
DEV_ID=$(jqget "$TMP/enroll.json" deviceId)
CMD=$(jqget "$TMP/enroll.json" installCommand)
EXPIRES=$(jqget "$TMP/enroll.json" enrollExpires)
echo "  D.1) کد تازه صادر شد: $DEV_ID · اعتبار تا $EXPIRES"

# ─── D.2 — QR PNG 640px + بررسی ۲۰۰ همه ───
# درس /deliver: مسیر از deliver-store سرو می‌کند + ایستا از standalone/public (بیلد).
# فایل تازه پس از بیلد → باید در هر چهار مکان بنشیند تا لینک زنده ۲۰۰ بدهد.
QR_RESULT=$(bun scripts/pn031e/make-owner-qr.ts "$CMD" "$PUBD/qr-install.png")
mkdir -p deliver-store/pn031e .next/standalone/public/deliver/pn031e "$OUTD"
cp "$PUBD/qr-install.png" "deliver-store/pn031e/qr-install.png"
cp "$PUBD/qr-install.png" ".next/standalone/public/deliver/pn031e/qr-install.png"
cp "$PUBD/qr-install.png" "$OUTD/qr-install.png"
echo "  D.2-الف) QR PNG 640px ساخته شد ✓ (deliver-store + standalone/public + public + download)"

# بررسی ۲۰۰ از URL عمومی: bootstrap با کد تازه · QR PNG · QR APK ایستا · APK
declare -a LINKS=(
  "bootstrap-با-کد:$PUBLIC_URL/api/mobile-relay/bootstrap?code=$CODE"
  "qr-install.png:$PUBLIC_URL/deliver/pn031e/qr-install.png"
  "qr-apk.svg:$PUBLIC_URL/deliver/pn031d/qr-apk.svg"
  "melka-relay.apk:$PUBLIC_URL/deliver/pn031d/melka-relay.apk"
)
LINKS_JSON="[]"
for entry in "${LINKS[@]}"; do
  NAME="${entry%%:*}"; URL="${entry#*:}"
  C=$(curl -s -o /dev/null -w "%{http_code}" --max-time 30 "$URL")
  echo "  D.2-ب) $NAME → $C"
  [ "$C" = "200" ] || { echo "✗ لینک $NAME = $C"; exit 1; }
  LINKS_JSON=$(echo "$LINKS_JSON" | python3 -c "import json,sys;l=json.load(sys.stdin);l.append({'name':'$NAME','status':int('$C'),'url':'$URL'});print(json.dumps(l,ensure_ascii=False))")
done

# ─── D.3 — روت QR تنظیمات (SVG با احراز — همان مسیر UI) ───
B=$(curl -s -o "$TMP/qr.svg" -w "%{http_code}" --max-time 20 "${AUTH[@]}" \
  "$PUBLIC_URL/api/admin/relay/qr?text=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))" "$CMD")")
SVG_OK="no"; head -c 100 "$TMP/qr.svg" | rg -q "<svg" && SVG_OK="yes"
[ "$B" = "200" ] && [ "$SVG_OK" = "yes" ] || { echo "✗ D.3: QR تنظیمات $B/$SVG_OK"; exit 1; }
echo "  D.3) روت QR تنظیمات (SVG با احراز) → ۲۰۰ و SVG معتبر ✓ (UI همین مسیر را می‌کشد)"

# code-status زنده (نمای تنظیمات)
B=$(curl -s -o "$TMP/cs.json" -w "%{http_code}" --max-time 20 "${AUTH[@]}" \
  "$PUBLIC_URL/api/admin/relay/code-status?deviceId=$DEV_ID")
STATE=$(python3 -c "import json;d=json.load(open('$TMP/cs.json'));print(d['code']['state'])")
echo "  D.3-ب) code-status در تنظیمات: state=$STATE (منتظر نصب — همان چیزی که مالک می‌بیند)"

# ─── راهنمای مالک (زبان ساده) ───
python3 - "$CMD" "$EXPIRES" "$DEV_ID" "$PUBLIC_URL" > "$PUBD/OWNER-GUIDE.html" <<'PYEOF'
import html, sys
cmd, expires, dev, pub = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
doc = f"""<!DOCTYPE html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>راهنمای فعال‌سازی رلهٔ ملکا — ۲ قدم، ۲ دقیقه</title>
<style>
body{{font-family:Vazirmatn,Tahoma,sans-serif;background:#f7f8fa;color:#1a2332;max-width:720px;margin:0 auto;padding:24px;line-height:1.9}}
h1{{font-size:1.35rem;color:#0d3b66}} h2{{font-size:1.05rem;margin-top:28px;border-right:4px solid #2a9d8f;padding-right:10px}}
.step{{background:#fff;border:1px solid #e3e7ee;border-radius:12px;padding:18px 20px;margin:14px 0}}
.cmd{{direction:ltr;text-align:left;background:#0d1b2a;color:#e9f5db;padding:12px 14px;border-radius:8px;font-family:Menlo,Consolas,monospace;font-size:0.82rem;word-break:break-all}}
.note{{background:#fff8e7;border:1px solid #f0d98c;border-radius:8px;padding:10px 14px;font-size:0.9rem}}
.ok{{color:#2a9d8f;font-weight:bold}} .muted{{color:#6b7684;font-size:0.85rem}}
img{{max-width:280px;border:8px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.12);border-radius:8px;display:block;margin:10px auto}}
</style></head><body>
<h1>راهنمای فعال‌سازی رلهٔ ملکا</h1>
<p>سلام. این راهنما فقط <b>۲ قدم</b> دارد و حدود <b>۲ دقیقه</b> وقت می‌گیرد. گوشی باید اینترنت ایران داشته باشد.</p>

<h2>قدم ۱ — نصب (فقط یک بار، برای همیشه)</h2>
<div class="step">
در گوشی Poco F3، QR زیر را با دوربین اسکن کنید تا <b>اپ ملکا</b> دانلود و نصب شود (حدود ۵ مگابایت):
<img src="{pub}/deliver/pn031e/qr-install.png" alt="QR نصب" width="280">
<p class="muted">یا مستقیم: <a href="{pub}/deliver/pn031d/melka-relay.apk">دانلود APK اپ ملکا</a> — هنگام نصب، اجازهٔ «نصب از منابع ناشناس» را بدهید.</p>
</div>
<div class="step">
اگر می‌خواهید <b>بدون اپ</b> شروع کنید (روش Termux): در گوشی برنامهٔ <b>Termux</b> را باز کنید و این یک خط را پیست و اجرا کنید:
<div class="cmd">{html.escape(cmd)}</div>
<p class="muted">اگر Termux ندارید، از <b>فدورا/گوگل‌پلی</b> یا F-Droid نصبش کنید. این دستور همه‌چیز را خودش نصب می‌کند.</p>
</div>

<h2>قدم ۲ — تأیید</h2>
<div class="step">
<p>اگر پیام <b>«رلهٔ ملکا فعال است»</b> را دیدید، تمام است! 🎉</p>
<p>سپس در تنظیمات ملکا، بخش «راه‌اندازی رله»، وضعیت را چک کنید — باید بنویسد <b class="ok">نصب کامل شده ✓</b> و بعد از چند لحظه دستگاه «برخط» شود. دکمهٔ <b>«تست تونل»</b> را بزنید تا اتصال واقعی به ملک تبریز سبز شود.</p>
</div>

<div class="note">
<b>اگر خطا دیدید:</b> نگران نباشید — همان دستور را <b>دوباره</b> پیست کنید (کد تا ۳ بار قابل استفاده است).
اگر پیام «کد منقضی» آمد، کد تازه بگیرید: تنظیمات ملکا ← راه‌اندازی رله ← دکمهٔ ثبت دستگاه (کد تازه ۳۰ دقیقه اعتبار دارد).
</div>

<h2>چند نکتهٔ کوچک</h2>
<div class="step">
<ul>
<li>اپ/اسکریپت ساعت گوشی را <b>خودش با سرور همگام</b> می‌کند — دیگر مشکل اختلاف ساعت بی‌اثر است.</li>
<li>گوشی را روی شارژر بگذارید و به Termux/اپ اجازهٔ اجرای پس‌زمینه بدهید (راهنمای MIUI داخل اپ هست).</li>
<li>این کد مخصوص دستگاه <span class="muted">{dev}</span> است و تا <span class="muted">{expires}</span> معتبر است.</li>
<li>اگر گوشی ری‌استارت شد، اپ خودش دوباره شروع می‌شود (SelfHeal). در Termux فقط اسکریپت را دوباره اجرا کنید.</li>
</ul>
</div>
<p class="muted">ملکا · نسخهٔ PN-031-E · ساختهٔ GLM — ۱۴۰۵/۰۷/۲۴</p>
</body></html>"""
print(doc)
PYEOF
cp "$PUBD/OWNER-GUIDE.html" "$OUTD/OWNER-GUIDE.html"
cp "$PUBD/OWNER-GUIDE.html" "deliver-store/pn031e/OWNER-GUIDE.html"
cp "$PUBD/OWNER-GUIDE.html" ".next/standalone/public/deliver/pn031e/OWNER-GUIDE.html"
B=$(curl -s -o /dev/null -w "%{http_code}" --max-time 20 "$PUBLIC_URL/deliver/pn031e/OWNER-GUIDE.html")
[ "$B" = "200" ] || { echo "✗ راهنمای مالک: $B"; exit 1; }
echo "  D.4) راهنمای مالک (زبان ساده) → ۲۰۰ ✓"

# ─── شاهد ───
# درس PN-031-C (درس ۴): داخل این بلوک فقط json.dump مستقیم به فایل — هیچ print‌ای
# داخل ریدایرکت stdout نمی‌نشیند (print در آفست ۰ فایل را له می‌کند).
python3 - "$DEV_ID" "$CODE" "$EXPIRES" "$CMD" "$LINKS_JSON" "$STATE" <<'PYEOF'
import json, sys, datetime
w = {
  "phase": "PN-031-F · فاز D — کد تازهٔ مالک + QR",
  "issuedAt": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
  "device": {"deviceId": sys.argv[1], "label": "Poco F3 مالک"},
  "enrollCode": sys.argv[2],
  "expiresAt": sys.argv[3],
  "installCommand": sys.argv[4],
  "qr": {"png640": "/deliver/pn031e/qr-install.png", "settingsSvgRoute": "200 با احراز (مسیر UI)"},
  "linksChecked": json.loads(sys.argv[5]),
  "codeStatusInSettings": sys.argv[6],
  "verdict": "PASS",
}
json.dump(w, open("download/pn031e/phase-d-witness.json", "w"), ensure_ascii=False, indent=1)
PYEOF
echo ""
echo "═══ فاز D: PASS ═══ (کد مالک: $DEV_ID · تا $EXPIRES)"
echo "  ★ دستور نصب مالک (پیست در Termux):"
echo "    $CMD"
