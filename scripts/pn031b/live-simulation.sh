#!/usr/bin/env bash
# pn031b-live-simulation.sh — گام ۱۰ سند ۰۳۹: شبیه‌سازی زندهٔ جبران خودکار
# ----------------------------------------------------------------------------
# سناریو (عین بازنشانی هشتم): سرور زنده بیلدی قدیمی از HEAD سرو می‌کند.
# اجرای کامل چرخهٔ head-guard از مسیر اسکریپت (مسیر Worker در تست B جداگانه):
#   ۱) check  → انتظار STALE (خروج ۲)
#   ۲) rebuild → بیلد تازه از HEAD + ری‌استارت سرور+Worker + تأیید (خروج ۰)
#   ۳) check  → انتظار OK (خروج ۰)
#   ۴) تأیید نهایی: /api/version == HEAD + health 200
# شاهد: download/pn031-b/head-guard-simulation.json
set -uo pipefail
cd /home/z/my-project
WITNESS="download/pn031-b/head-guard-simulation.json"
mkdir -p download/pn031-b

step() { echo "── $1 ──  $(date -u +%T)"; }

step "۰) وضعیت پیش از آزمون"
HEAD_GIT=$(git rev-parse HEAD)
LIVE_BEFORE=$(curl -s -m 10 http://127.0.0.1:3000/api/version | python3 -c "import json,sys; print(json.load(sys.stdin).get('fingerprint',{}).get('gitSha',''))" 2>/dev/null || echo "")
echo "HEAD=$HEAD_GIT  LIVE=$LIVE_BEFORE"

step "۱) check — انتظار STALE (۲)"
bash scripts/recovery/audit-head-guard.sh check
R1=$?
echo "check exit=$R1"

if [ "$R1" != "2" ]; then
  echo "FATAL: انتظار STALE بود — خروج $R1"
  exit 1
fi

step "۲) rebuild — بیلد + ری‌استارت + تأیید (چند دقیقه)"
bash scripts/recovery/audit-head-guard.sh rebuild
R2=$?
echo "rebuild exit=$R2"
if [ "$R2" != "0" ]; then
  echo "FATAL: rebuild تأیید نشد — خروج $R2 (لاگ: upload/.runtime/head-guard-last-build.log)"
  exit 2
fi

step "۳) check پس از جبران — انتظار OK (۰)"
bash scripts/recovery/audit-head-guard.sh check
R3=$?

step "۴) تأیید نهایی از اینترنت عمومی"
PUB="https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai"
LIVE_AFTER_PUB=$(curl -s -m 15 "$PUB/api/version" | python3 -c "import json,sys; print(json.load(sys.stdin).get('fingerprint',{}).get('gitSha',''))" 2>/dev/null || echo "")
HEALTH=$(curl -s -m 15 -o /dev/null -w "%{http_code}" "$PUB/api/health")
echo "LIVE_AFTER_PUB=$LIVE_AFTER_PUB  HEALTH=$HEALTH"

VERDICT="FAIL"
[ "$R3" = "0" ] && [ "$LIVE_AFTER_PUB" = "$HEAD_GIT" ] && [ "$HEALTH" = "200" ] && VERDICT="PASS"

python3 - "$HEAD_GIT" "$LIVE_BEFORE" "$LIVE_AFTER_PUB" "$R1" "$R2" "$R3" "$HEALTH" "$VERDICT" <<'PYEOF'
import json, sys, datetime
head, before, after, r1, r2, r3, health, verdict = sys.argv[1:9]
json.dump({
    "at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "document": "ملکا-شورا-ن۰۳۹-۱۴۰۵ · PN-031-B · گام ۱۰ — شبیه‌سازی زندهٔ جبران خودکار",
    "scenario": "سرور زنده بیلدی قدیمی از HEAD سرو می‌کند (عین بازنشانی هشتم) — چرخهٔ کامل جبران از مسیر اسکریپت",
    "head": head,
    "liveBefore": before,
    "steps": {
        "check1_stale": {"exitCode": int(r1), "expected": 2},
        "rebuild": {"exitCode": int(r2), "expected": 0, "actions": ["build-from-HEAD", "verify-fingerprint", "restart-server+worker", "poll-until-verified"]},
        "check2_ok": {"exitCode": int(r3), "expected": 0},
    },
    "liveAfterPublic": after,
    "publicHealth": int(health),
    "verdict": verdict,
    "note": "بیلد نهایی = کات‌اُوِر تولید: سرور از این پس head-guard + بنر تازگی + روت بازسازی‌شدهٔ تست تونل + env بازیابی‌شده را سرو می‌کند",
}, open("download/pn031-b/head-guard-simulation.json", "w"), ensure_ascii=False, indent=2)
print("WITNESS:", verdict)
PYEOF
echo "═══ VERDICT: $VERDICT ═══"
[ "$VERDICT" = "PASS" ] || exit 3
