#!/usr/bin/env bash
# PN-069 — وارسی نهایی DOM روی بیلد نهایی (f1969fb) از لینک عمومی
# شاهد کنسولی — اسکرین‌شات در /tmp (شواهد تصویری بیلد a7672ca قبلاً کامیت شده)
set -uo pipefail
cd /home/z/my-project

BASE="https://preview-chat-35e0018b-b9e9-411f-88d7-f1f774acfff0.space-z.ai"

PID=$(pgrep -f "standalone/server.js" | head -1)
MASTER=$(tr '\0' '\n' < "/proc/$PID/environ" 2>/dev/null | sed -n 's/^MASTER_ACCESS_CODE=//p' | tr -d '\r\n')
[ -n "$MASTER" ] || { echo "FAIL: master code not found"; exit 1; }

agent-browser close >/dev/null 2>&1 || true
agent-browser set viewport 390 844
agent-browser open "$BASE/" || { echo "FAIL: cannot open"; exit 1; }
agent-browser wait --load networkidle >/dev/null 2>&1
sleep 4
agent-browser find text "ورود با کد مدیر (مالک سامانه)" click
sleep 1
agent-browser find label "کد مدیر (۸ رقم)" fill "$MASTER"
agent-browser find text "ورود به عنوان مدیر" click
sleep 8
agent-browser wait --load networkidle >/dev/null 2>&1
sleep 2

echo "NAV-LABELS:"
agent-browser eval "Array.from(document.querySelectorAll('nav button')).map(b=>b.getAttribute('aria-label')).join(' | ')"
echo "CLICK-آگهی:"
agent-browser eval "document.querySelectorAll('nav button')[1].click()"
sleep 7
agent-browser eval "Array.from(document.querySelectorAll('nav button')).map(b=>(b.getAttribute('aria-current')?'[*]':'[ ]')+b.getAttribute('aria-label')).join(' | ')"
agent-browser eval "document.querySelector('h2') ? document.querySelector('h2').textContent : 'NO-TITLE'"
echo "CLICK-درخواست:"
agent-browser eval "document.querySelectorAll('nav button')[2].click()"
sleep 7
agent-browser eval "Array.from(document.querySelectorAll('nav button')).map(b=>(b.getAttribute('aria-current')?'[*]':'[ ]')+b.getAttribute('aria-label')).join(' | ')"
agent-browser eval "document.querySelector('h2') ? document.querySelector('h2').textContent : 'NO-TITLE'"
echo "CLICK-معاملات:"
agent-browser eval "document.querySelectorAll('nav button')[3].click()"
sleep 7
agent-browser eval "Array.from(document.querySelectorAll('nav button')).map(b=>(b.getAttribute('aria-current')?'[*]':'[ ]')+b.getAttribute('aria-label')).join(' | ')"
agent-browser eval "document.querySelector('h2') ? document.querySelector('h2').textContent : 'NO-TITLE'"
agent-browser screenshot /tmp/pn069-final-transactions.png >/dev/null 2>&1
agent-browser close >/dev/null 2>&1
echo "DONE"
