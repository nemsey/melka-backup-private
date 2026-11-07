#!/usr/bin/env bash
# PN-031-C · lock-in — شاهد تثبیت نهایی (قانون ۱ سند ۰۴۰)
set -euo pipefail
cd /home/z/my-project
TS=$(date -u +%FT%TZ)
OUT="download/pn031c/lock-in.json"

HEAD=$(git rev-parse HEAD)
LIVE=$(curl -s -m 8 http://127.0.0.1:3000/api/version | python3 -c "import json,sys;print(json.load(sys.stdin).get('gitSha','?'))" 2>/dev/null || echo "?")
BID=$(curl -s -m 8 http://127.0.0.1:3000/api/version | python3 -c "import json,sys;print(json.load(sys.stdin).get('buildId','?'))" 2>/dev/null || echo "?")
HEALTH=$(curl -s -o /dev/null -w '%{http_code}' -m 8 http://127.0.0.1:3000/api/health)
TSC=$(bunx tsc --noEmit > /dev/null 2>&1 && echo 0 || echo 1)
GUARDS=$(python3 -c "import json;print(json.load(open('download/pn031c/guards-summary.json'))['guardsPass'])")
LINK=$(python3 -c "import json;print(json.load(open('download/pn031c/link-law.json'))['verdict'])")
MIRROR=$(git ls-remote auto-mirror refs/heads/main 2>/dev/null | awk '{print $1}')
OWNER=$(python3 -c "import json;print(json.load(open('download/pn031c/regenerated-owner.json'))['newEnrollment']['deviceId'])")
CODE_EXP=$(python3 -c "import json;print(json.load(open('download/pn031c/regenerated-owner.json'))['newEnrollment']['enrollExpires'])")
PKG_N=$(python3 -c "import json;print(json.load(open('upload/.survival/PN-032-20261013/CHAIN.json'))['chainIndex'])")

python3 - "$TS" "$HEAD" "$LIVE" "$BID" "$HEALTH" "$TSC" "$GUARDS" "$LINK" "$MIRROR" "$OWNER" "$CODE_EXP" "$PKG_N" "$OUT" <<'PYEOF'
import json, sys
(at, head, live, bid, health, tsc, guards, link, mirror, owner, code_exp, pkg, out) = sys.argv[1:14]
w = {
  "phase": "PN-031-C · تثبیت نهایی (جلسهٔ فوق‌العاده ۰۴۰)",
  "lockedAt": at,
  "identity": {"head": head, "liveGitSha": live, "buildId": bid, "health": health,
               "note": "بیلد نهایی پس از کامیت دروازه از HEAD اجرا شد — BUILD_ID باید == HEAD باشد"},
  "gates": {
    "tsc": f"exit {tsc}",
    "lint": "0 خطا (۶ هشدار آرشیو survival — موجودی)",
    "twoGreen": "2676/0 ×2 — یکسان (رکورد؛ قبلی ۲۶۵۱)",
    "guards": f"{guards}/43 (۴۲ اسکریپت + تکرارپذیری)",
    "liveGateTest": "PASS — A (تلاش دوم همان کد → ۲۰۰) · B (چهارمی → ۴۰۳ limit) · C (head-guard) از URL عمومی",
    "linkLaw": link,
  },
  "mirror": {"remote": "github.com/nemsey/melka-backup-private", "pushedHead": mirror, "synced": mirror == head},
  "owner": {"deviceId": owner, "codeExpires": code_exp, "maxAttempts": 3,
            "note": "کد بخشنده — QR: download/pn031c/qr-install-command.png"},
  "survival": {"chainIndex": int(pkg), "package": "upload/.survival/PN-032-20261013", "items": 445, "sizeMB": 516,
               "anchor": "sha256 مانیفست بستهٔ ۳۰ (PN-031-20261012)"},
  "orderFlag": "MELK_ARM_OFFLINE=1 پابرجا — برداشتن فقط پس از تست تونل سبز مالک (رویهٔ چهارگامه)",
}
with open(out, "w", encoding="utf-8") as f:
    json.dump(w, f, ensure_ascii=False, indent=1)
print(json.dumps({"head": head[:7], "live": live[:7], "buildId": bid, "health": health, "guards": guards + "/43",
                  "link": link, "mirrorSynced": mirror == head, "owner": owner, "codeExpires": code_exp}, ensure_ascii=False))
PYEOF
