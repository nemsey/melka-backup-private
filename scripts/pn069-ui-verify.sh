#!/usr/bin/env bash
# ============================================================
# PN-069 — وارسی زندهٔ ناوبری پایین جدید از لینک عمومی
# (خواستهٔ صریح مالک: تغییرات از طریق لینک preview وارسی شوند)
# شواهد: DOM (aria-label پنج دکمه) + اسکرین‌شات موبایل ۳۹۰×۸۴۴
# کدمستر از env پروسهٔ زندهٔ سرور خوانده می‌شود — هرگز چاپ نمی‌شود.
# ============================================================
set -uo pipefail
cd /home/z/my-project

BASE="https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai"
OUT="download/pn069"
mkdir -p "$OUT"

PID=$(pgrep -f "standalone/server.js" | head -1)
MASTER=$(tr '\0' '\n' < "/proc/$PID/environ" 2>/dev/null | sed -n 's/^MASTER_ACCESS_CODE=//p' | tr -d '\r\n')
if [ -z "$MASTER" ]; then echo "FAIL: master code not found in server env"; exit 1; fi
echo "[0] master code loaded from live server env (${#MASTER} chars — not printed)"

agent-browser close >/dev/null 2>&1 || true
agent-browser set viewport 390 844
agent-browser open "$BASE/" || { echo "FAIL: cannot open preview link"; exit 1; }
agent-browser wait --load networkidle >/dev/null 2>&1
sleep 4

echo "[1] switching to master-login mode…"
agent-browser find text "ورود با کد مدیر (مالک سامانه)" click
sleep 1
agent-browser find label "کد مدیر (۸ رقم)" fill "$MASTER"
agent-browser find text "ورود به عنوان مدیر" click
sleep 8
agent-browser wait --load networkidle >/dev/null 2>&1
sleep 2

echo "[2] bottom-nav DOM witness (aria-labels):"
NAV=$(agent-browser eval "Array.from(document.querySelectorAll('nav button')).map(b=>b.getAttribute('aria-label')).join(' | ')")
echo "    $NAV"

echo "[3] active-item witness (aria-current):"
agent-browser eval "Array.from(document.querySelectorAll('nav button')).map(b=>(b.getAttribute('aria-current')?'[*]':'[ ]')+b.getAttribute('aria-label')).join(' | ')"

agent-browser screenshot "$OUT/bottomnav-home.png" && echo "[4] screenshot: $OUT/bottomnav-home.png"

echo "[5] clicking nav item #2 (آگهی) → tile must open…"
agent-browser eval "document.querySelectorAll('nav button')[1].click()"
sleep 8
agent-browser eval "Array.from(document.querySelectorAll('nav button')).map(b=>(b.getAttribute('aria-current')?'[*]':'[ ]')+b.getAttribute('aria-label')).join(' | ')"
T1=$(agent-browser eval "document.querySelector('h2') ? document.querySelector('h2').textContent : 'NO-TITLE'")
echo "    tile title: $T1"
agent-browser screenshot "$OUT/bottomnav-arm-listings.png" && echo "    screenshot: $OUT/bottomnav-arm-listings.png"

echo "[6] clicking nav item #4 (معاملات) → tile must open…"
agent-browser eval "document.querySelectorAll('nav button')[3].click()"
sleep 8
agent-browser eval "Array.from(document.querySelectorAll('nav button')).map(b=>(b.getAttribute('aria-current')?'[*]':'[ ]')+b.getAttribute('aria-label')).join(' | ')"
T2=$(agent-browser eval "document.querySelector('h2') ? document.querySelector('h2').textContent : 'NO-TITLE'")
echo "    tile title: $T2"
agent-browser screenshot "$OUT/bottomnav-transactions.png" && echo "    screenshot: $OUT/bottomnav-transactions.png"

echo "[7] closing browser…"
agent-browser close >/dev/null 2>&1
echo "DONE"
