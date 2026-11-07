#!/usr/bin/env bash
# scripts/pn038/ui-witness.sh — PN-038 فاز ۲ + ۴: اثبات زندهٔ UI
# هوم یک‌پارچه (۸ کاشی ریشه با نام کوتاه + ترتیب جدید) + کارت وضعیت رله 🟢🟡🔴
set -uo pipefail
cd /home/z/my-project
OUT=download/pn038
mkdir -p "$OUT"

ab() { agent-browser "$@" 2>/dev/null; }

echo "1) open login page"
ab open http://localhost:3000
ab wait --load networkidle
ab set viewport 1280 900

echo "2) master login (OWNER)"
MASTER=$(python3 -c "import json; print(json.load(open('env.platform.json'))['MASTER_ACCESS_CODE'])")
ab eval "(()=>{const b=[...document.querySelectorAll('button')];const x=b.find(e=>(e.textContent||'').includes('ورود با کد مدیر'));if(x){x.click();return 'master-mode';}return 'no-btn';})()"
sleep 1
ab eval "(()=>{const i=document.getElementById('masterCode');if(!i)return 'no-input';const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(i,'$MASTER');i.dispatchEvent(new Event('input',{bubbles:true}));return 'typed';})()"
ab eval "(()=>{const b=[...document.querySelectorAll('button')];const x=b.find(e=>(e.textContent||'').includes('ورود'));if(x){x.click();return 'submitted';}return 'no-submit';})()"
ab wait --load networkidle
sleep 3

echo "3) assertions: home tiles (order + short names + no M6/M7/container)"
ab eval "(()=>{const t=document.body.innerText;const titles=['فایل یابی','آگهی','درخواست','معاملات','کارشناسان','تطبیق','مغز','تنظیمات'];const present=titles.filter(x=>t.includes(x));const m6=t.includes('شاخص بازار')||t.includes('شاخص ششم');const m7=t.includes('پوشش داده')||t.includes('پوشش هفتم');const mgmt=t.includes('داشبورد مدیریتی');const oldA=t.includes('آگهی ملکا');const oldB=t.includes('آگهی ملک تبریز');const relayCard=t.includes('رله')&&(t.includes('سالم')||t.includes('هشدار')||t.includes('خاموش'));return JSON.stringify({tilesPresent:present.length,of8:titles.length,m6Gone:!m6,m7Gone:!m7,mgmtGone:!mgmt,oldNamesGone:!oldA&&!oldB,relayStatusCard:relayCard});})()"

echo "4) screenshot: home unified"
ab screenshot "$OUT/ui-home-unified.png"

echo "5) scroll to relay status card (فاز ۴) + screenshot"
ab eval "(()=>{const els=[...document.querySelectorAll('*')];const el=els.find(e=>e.children.length===0&&(e.textContent||'').includes('رله'));if(el){el.scrollIntoView({block:'center'});return 'scrolled';}return 'no-relay-el';})()"
sleep 2
ab screenshot "$OUT/ui-relay-status.png"

echo "6) dark mode (optional — theme toggle if present)"
ab eval "(()=>{const b=[...document.querySelectorAll('button')];const x=b.find(e=>(e.getAttribute('aria-label')||'').includes('حالت')||(e.textContent||'').includes('تاریک')||(e.getAttribute('aria-label')||'').includes('dark'));if(x){x.click();return 'toggled';}return 'no-toggle';})()"
sleep 2
ab screenshot "$OUT/ui-home-dark.png"

echo "DONE"
