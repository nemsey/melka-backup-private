#!/usr/bin/env bash
# scripts/pn034/ui-shot.sh — PN-034 (شورا-ن۰۵۵): اسکرین‌شات زندهٔ تنظیمات پس از احیا
# اثبات سه بازگردانی + یک حذف روی بیلد زندهٔ 30fab64
set -uo pipefail
cd /home/z/my-project
OUT=download/pn034
mkdir -p "$OUT"

MASTER=$(python3 -c "import json; print(json.load(open('env.platform.json'))['MASTER_ACCESS_CODE'])")

ab() { agent-browser "$@" 2>/dev/null; }

echo "1) open + login"
ab open http://localhost:3000
ab wait --load networkidle
ab set viewport 1280 900
ab eval "(()=>{const b=[...document.querySelectorAll('button')];const x=b.find(e=>(e.textContent||'').includes('ورود با کد مدیر'));if(x){x.click();return 'master-mode';}return 'no-btn';})()"
sleep 1
ab eval "(()=>{const i=document.getElementById('masterCode');if(!i)return 'no-input';const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(i,'$MASTER');i.dispatchEvent(new Event('input',{bubbles:true}));return 'typed';})()"
ab eval "(()=>{const b=[...document.querySelectorAll('button')];const x=b.find(e=>(e.textContent||'').includes('ورود'));if(x){x.click();return 'submitted';}return 'no-submit';})()"
ab wait --load networkidle
sleep 2

echo "2) navigate to settings"
ab eval "(()=>{const b=[...document.querySelectorAll('button,a,[role=button],div')];const x=b.find(e=>(e.textContent||'').trim().startsWith('تنظیمات عمومی'));if(x){x.click();return 'settings-open';}return 'no-settings';})()"
sleep 3
ab wait --load networkidle
sleep 2

echo "3) scroll to Melk Tabriz connection card (ARM restored + relay)"
ab eval "(()=>{const el=document.getElementById('settings-melk-tabriz');if(!el)return 'no-card';el.scrollIntoView({block:'start'});window.scrollBy(0,-70);return 'scrolled';})()"
sleep 2
ab screenshot "$OUT/ui-live-melk-connection.png"
sleep 1

echo "4) scroll to Termux relay section (install code button)"
ab eval "(()=>{const el=document.getElementById('settings-mobile-relay');if(!el)return 'no-section';el.scrollIntoView({block:'center'});return 'relay-centered';})()"
sleep 2
ab screenshot "$OUT/ui-live-termux-relay.png"
sleep 1

echo "5) full settings page"
ab eval "window.scrollTo(0,0)"
sleep 1
ab screenshot --full "$OUT/ui-live-settings-full.png"

echo "6) verify restored markers in live DOM"
ab eval "(()=>{const t=document.body.innerText;const arm=t.includes('اتصال به سامانه ARM');const relogin=t.includes('ورود مجدد به ملک تبریز');const gen=t.includes('تولید کد نصب');const otp=t.includes('رلهٔ Termux');return JSON.stringify({armRestored:arm,reloginGone:!relogin,generateCodeBtn:gen,termuxSection:otp});})()"

echo "DONE"
