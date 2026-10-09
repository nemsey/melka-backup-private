#!/usr/bin/env bash
# ============================================================================
# PN-024 — گارد audit-mirror-sync.sh (گام ۵-غ) — J4
# همگامی آینهٔ GitHub با HEAD محلی — واگرایی شاخه = قرمز
# (J4 جلسهٔ ۰۳۱: «چک روزانه» — در CI هر بیلد اجرا می‌شود)
# خروجی: download/pn024/guards-mirror-sync.json
# ============================================================================
set -uo pipefail
cd /home/z/my-project
OUT=download/pn024/guards-mirror-sync.json

python3 - "$OUT" <<'PYEOF'
import json, os, subprocess, sys

out_path = sys.argv[1]
os.makedirs(os.path.dirname(out_path), exist_ok=True)
violations = []
notes = []

def sh(cmd):
    r = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=120)
    return r.stdout.strip(), (r.returncode == 0)

head, ok1 = sh("git rev-parse HEAD")
mirror_remote, _ = sh("git remote get-url auto-mirror")

# fetch — بدون fetch مقایسه کهنه است
fetch_out, fetch_ok = sh("git fetch auto-mirror main 2>&1")
if not fetch_ok:
    notes.append(f"fetch هشدار: {fetch_out[:120]}")

mirror, ok2 = sh("git rev-parse auto-mirror/main")
head_short = head[:7]
mirror_short = mirror[:7]

# ─── ۱) همگامی کامل: HEAD == auto-mirror/main ───
synced = head == mirror and len(head) == 40
if not synced:
    # آیا HEAD جلوتر است (هنوز push نشده) یا mirror واگرا (diverged)؟
    ahead, _ = sh("git rev-list --count auto-mirror/main..HEAD")
    behind, _ = sh("git rev-list --count HEAD..auto-mirror/main")
    violations.append(
        f"آینه واگراست: HEAD={head_short} · mirror={mirror_short} · جلوتر={ahead} · عقب‌تر={behind} — "
        f"{'push لازم (کامیت‌های محلی ارسال نشده)' if int(ahead or 0) > 0 and int(behind or 0) == 0 else 'rebase/هماهنگی فوری لازم'}"
    )
    notes.append(f"ahead={ahead} behind={behind}")

# ─── ۲) ریموت آینه موجود است ───
if "auto-mirror" not in mirror_remote and not mirror_remote:
    violations.append("ریموت auto-mirror تنظیم نشده — آینهٔ GitHub ناشناخته")

checks = [
    {"check": "J4 همگامی آینه", "ok": synced, "head": head_short, "mirror": mirror_short,
     "remote": "auto-mirror (GitHub — private backup)"},
]

result = {
    "guard": "audit-mirror-sync",
    "workOrder": "PN-024/J4 — چک روزانهٔ همگامی آینه (در CI هر بیلد)",
    "generatedAt": __import__("datetime").datetime.utcnow().isoformat() + "Z",
    "checks": checks,
    "notes": notes,
    "violations": violations,
    "pass": not violations,
}
json.dump(result, open(out_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(("PASS: آینه همگاست — HEAD=" + head_short) if result["pass"] else "FAIL: " + "; ".join(violations))
sys.exit(0 if result["pass"] else 1)
PYEOF
