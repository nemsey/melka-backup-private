#!/usr/bin/env bash
# ============================================================================
# simulate-stale-build.sh — تست شبیه‌سازی G3/G1 (DIR-PN048-007 · D-0a اقدام ۳)
# ============================================================================
# سناریو: «build کهنه + Worker → توقف» — بدون دست‌زدن به سرور زنده.
# ۱) sandbox با بیلد کهنه (fingerprint قدیمی) → build-head-gate باید exit 1 بدهد
# ۲) sandbox با بیلد هم‌راستا → exit 0
# ۳) Worker بدون stripProtectedNulls (G1=false) → بوت Worker باید توقف کند (exit 1)
# ۴) Worker با stripProtectedNulls حقیقی → گیت سبز
# ============================================================================
set -uo pipefail
cd /home/z/my-project
PASS=0; FAIL=0
ok()  { echo "✅ $1"; PASS=$((PASS+1)); }
bad() { echo "❌ $1"; FAIL=$((FAIL+1)); }

echo "═══ PN-048-007 · شبیه‌سازی G3 (build کهنه) ═══"

SB=$(mktemp -d)
trap 'rm -rf "$SB"' EXIT
mkdir -p "$SB/.next/standalone/.next"

# sandbox باید مخزن گیت باشد تا rev-parse کار کند (کامیت واقعی — درس دیباگ: مخزن بی‌کامیت «HEAD» لفظی برمی‌گرداند)
git -C "$SB" init -q
git -C "$SB" -c user.email=sim@melka.local -c user.name=sim commit -q --allow-empty -m "PN-048-007 simulation"
OLD_SHA=$(git -C /home/z/my-project rev-parse 6bb3c8e 2>/dev/null || echo "deadbeef")
NEW_SHA=$(git -C "$SB" rev-parse HEAD)

# ۱) بیلد کهنه: fingerprint با SHA دوران قبل از رستاخیز (6bb3c8e)
echo "{\"gitSha\": \"$OLD_SHA\"}" > "$SB/.next/fingerprint.json"
echo "{\"gitSha\": \"$OLD_SHA\"}" > "$SB/.next/standalone/.next/fingerprint.json"
if GATE_ROOT="$SB" bash scripts/pn048/build-head-gate.sh >/dev/null 2>&1; then
  bad "G3-شبیه‌سازی: بیلد کهنه رد شد (نباید رد شود!)"
else
  ok "G3-شبیه‌سازی: بیلد کهنه → توقف (exit 1) — درست"
fi

# ۲) بیلد هم‌راستا با HEAD sandbox → سبز
echo "{\"gitSha\": \"$NEW_SHA\"}" > "$SB/.next/fingerprint.json"
echo "{\"gitSha\": \"$NEW_SHA\"}" > "$SB/.next/standalone/.next/fingerprint.json"
if GATE_ROOT="$SB" bash scripts/pn048/build-head-gate.sh >/dev/null 2>&1; then
  ok "G3-شبیه‌سازی: بیلد = HEAD → سبز (exit 0) — درست"
else
  bad "G3-شبیه‌سازی: بیلد هم‌راستا رد شد (نباید رد شود!)"
fi

# ۳) فیلد غایب (فقدان fingerprint) → توقف
rm "$SB/.next/standalone/.next/fingerprint.json"
if GATE_ROOT="$SB" bash scripts/pn048/build-head-gate.sh >/dev/null 2>&1; then
  bad "G3-شبیه‌سازی: fingerprint غایب رد شد (نباید رد شود!)"
else
  ok "G3-شبیه‌سازی: fingerprint غایب → توقف — درست"
fi

echo "═══ PN-048-007 · شبیه‌سازی G1 (Worker بدون محافظ) ═══"

# ۴) Worker با G1=false → توقف فوری
cat > "$SB/g1-false.ts" <<'EOF'
export const G1_STRIP_PROTECTED_NULLS = false as const;
EOF
cat > "$SB/worker-gate-false.ts" <<'EOF'
const { G1_STRIP_PROTECTED_NULLS } = await import("./g1-false.ts");
if (G1_STRIP_PROTECTED_NULLS !== true) {
  console.error("[worker] ❌ G1 GATE: stripProtectedNulls غیرفعال — توقف فوری");
  process.exit(1);
}
EOF
if bun "$SB/worker-gate-false.ts" >/dev/null 2>&1; then
  bad "G1-شبیه‌سازی: Worker بدون محافظ بوت شد (نباید شود!)"
else
  ok "G1-شبیه‌سازی: Worker بدون محافظ → توقف فوری (exit 1) — درست"
fi

# ۵) گیت با ماژول حقیقی → سبز
cat > "$SB/worker-gate-true.ts" <<'EOF'
const { G1_STRIP_PROTECTED_NULLS } = await import("/home/z/my-project/src/lib/integrations/melketun/protected-nulls.ts");
if (G1_STRIP_PROTECTED_NULLS !== true) {
  console.error("[worker] ❌ G1 GATE: stripProtectedNulls غیرفعال — توقف فوری");
  process.exit(1);
}
console.log("[worker] ✓ G1 GATE: stripProtectedNulls فعال");
EOF
if bun "$SB/worker-gate-true.ts" >/dev/null 2>&1; then
  ok "G1-شبیه‌سازی: Worker با محافظ حقیقی → گیت سبز — درست"
else
  bad "G1-شبیه‌سازی: Worker با محافظ حقیقی متوقف شد (نباید شود!)"
fi

# ۶) گارد سورس: worker.ts حقیقی باید همان منطق توقف را داشته باشد
grep -q "G1 GATE" scripts/runtime/worker.ts && grep -q "process.exit(1)" scripts/runtime/worker.ts \
  && ok "گارد سورس: worker.ts حقیقی دارای G1 GATE + توقف است" \
  || bad "گارد سورس: worker.ts حقیقی فاقد G1 GATE است"

echo "═══ نتیجه ═══"
echo "PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -eq 0 ] && echo "✅ شبیه‌سازی کامل: build کهنه + Worker بی‌محافظ = توقف — همان قانون توقف DIR-PN048-007" \
                    || { echo "❌ شکست در شبیه‌سازی"; exit 1; }
exit 0
