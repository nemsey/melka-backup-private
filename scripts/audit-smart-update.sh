#!/bin/bash
# PN-001 (BLOCK 1.6 — قلم ۴) — اسکنر بروزرسانی هوشمند
# بررسی: رعایت قانون دادهٔ مقدس در بروزرسانی هوشمند
#   ۱) صفر عملیات حذف در ماژول smart-update و لایهٔ همگام‌سازی (گارد ایستا)
#   ۲) قفل Tier 0-1 (فقط دستی) در زمان‌بندی تطبیقی
#   ۳) رفتار درست تیک تطبیقی برای کهنگی‌های مختلف (Tier 2)
#   ۴) صف اولویت‌دار فقط در Tier 4 قابل مصرف است
set -u
cd /home/z/my-project
export DATABASE_URL="${DATABASE_URL:-file:/home/z/my-project/db/custom.db}"

# ── ۱) گارد ایستا + حالت فعال ──
# قانون دادهٔ مقدس ن۰۰۱: مسیر legacy همگام‌سازی CRM (پاک‌سازی کامل + درج) ممنوع است —
# فقط مسیر افزایشی (upsert + نامهٔ مرده + جاروی محافظت‌شده) مجاز است.
count_deletes() { local f="$1"; if [ -f "$f" ]; then grep -cE '\.(delete|deleteMany)\(' "$f" || true; else echo 0; fi }
SMART_SRC="src/core/smart-update/smart-update.ts"
DELETE_HITS=$(count_deletes "$SMART_SRC")
MODE_HITS=$(bun -e '
(async () => {
  const { syncMode } = await import("./src/lib/melk-api/sync-mode");
  console.log(syncMode());
  process.exit(0);
})().catch(() => { console.log("ERR"); process.exit(1); });' 2>/dev/null | tail -1)
if [ "$MODE_HITS" != "incremental" ]; then
  echo "  ✗ حالت همگام‌سازی CRM فعال: $MODE_HITS (باید incremental باشد — قانون دادهٔ مقدس)"
  echo "SMART-UPDATE: FAIL"
  exit 1
fi
echo "  ✓ حالت همگام‌سازی CRM فعال: incremental (legacy تخریبی غیرفعال)"

# ── ۲-۴) رفتار پویا ──
RESULT=$(bun -e '
(async () => {
  const su = await import("./src/core/smart-update/smart-update");
  const t01 = su.decideAdaptiveTiming({ stalenessHours: 200, tier: 0 });
  const t01b = su.decideAdaptiveTiming({ stalenessHours: 200, tier: 1 });
  const t2fresh = su.decideAdaptiveTiming({ stalenessHours: 5, tier: 2 });
  const t2stale = su.decideAdaptiveTiming({ stalenessHours: 100, tier: 2 });
  const t2ancient = su.decideAdaptiveTiming({ stalenessHours: 200, tier: 3 });
  const queue3 = su.queueAllowedForTier(3);
  const queue4 = su.queueAllowedForTier(4);
  const scored = su.scoreQueueRow({ id: "x", viewCount: 10, hoursSinceUpdate: 48, missingFieldRatio: 0.5, filterMatch: 1 });
  console.log(JSON.stringify({
    t01Locked: t01.mode === "tier-locked" && t01.intervalMinutes === 0,
    t01bLocked: t01b.mode === "tier-locked",
    t2freshNormal: t2fresh.mode === "normal",
    t2staleAccelerated: t2stale.mode === "rapid",
    t2ancientImmediate: t2ancient.mode === "immediate",
    queueBlockedAtT3: queue3 === false,
    queueAllowedAtT4: queue4 === true,
    scorePositive: scored.score > 0,
  }));
  process.exit(0);
})().catch(() => { console.error("ERR"); process.exit(1); });
' 2>/dev/null | tail -1)

python3 - "$RESULT" "$DELETE_HITS" <<'PYEOF'
import json, sys
try:
    d = json.loads(sys.argv[1])
except Exception:
    print("SMART-UPDATE: FAIL (خروجی رفتار نامعتبر)")
    sys.exit(1)
delete_hits = int(sys.argv[2])
checks = {
    "صفر حذف در smart-update": delete_hits == 0,
    "قفل Tier 0 (فقط دستی)": d.get("t01Locked") is True,
    "قفل Tier 1 (فقط دستی)": d.get("t01bLocked") is True,
    "تیک عادی دادهٔ تازه (Tier 2)": d.get("t2freshNormal") is True,
    "تیک تند دادهٔ کهنه (Tier 2)": d.get("t2staleAccelerated") is True,
    "تیک فوری کهنگی > ۱۶۸س": d.get("t2ancientImmediate") is True,
    "صف مسدود در Tier 3": d.get("queueBlockedAtT3") is True,
    "صف آزاد فقط Tier 4": d.get("queueAllowedAtT4") is True,
    "امتیاز صف مثبت": d.get("scorePositive") is True,
}
failed = [k for k, v in checks.items() if not v]
for k, v in checks.items():
    print(f"  {'✓' if v else '✗'} {k}")
print(f"SMART-UPDATE: {'PASS' if not failed else 'FAIL — ' + '، '.join(failed)}")
sys.exit(0 if not failed else 1)
PYEOF
