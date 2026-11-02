#!/usr/bin/env bash
# scripts/pn039/ui-witness.sh — PN-039: اثبات زندهٔ UI ستونهای تازه
# M1: وضعیت آگهی (بعد از دسته‌بندی) + تاریخ ثبت + یادداشت (آخرین) + چیپ نوع ملک
# M2: یادداشت (آخرین) + چیپ نوع ملک + بدون نوع ساختمان
set -uo pipefail
cd /home/z/my-project
OUT=download/pn039
mkdir -p "$OUT"

ab() { agent-browser "$@" 2>/dev/null; }

echo "1) open login page"
ab open http://localhost:3000
ab wait --load networkidle
ab set viewport 1440 900

echo "2) master login (OWNER)"
MASTER=$(python3 -c "import json; print(json.load(open('env.platform.json'))['MASTER_ACCESS_CODE'])")
ab eval "(()=>{const b=[...document.querySelectorAll('button')];const x=b.find(e=>(e.textContent||'').includes('ورود با کد مدیر'));if(x){x.click();return 'master-mode';}return 'no-btn';})()"
sleep 1
ab eval "(()=>{const i=document.getElementById('masterCode');if(!i)return 'no-input';const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(i,'$MASTER');i.dispatchEvent(new Event('input',{bubbles:true}));return 'typed';})()"
ab eval "(()=>{const b=[...document.querySelectorAll('button')];const x=b.find(e=>(e.textContent||'').includes('ورود'));if(x){x.click();return 'submitted';}return 'no-submit';})()"
ab wait --load networkidle
sleep 3

echo "3) open M1 آگهی tile"
ab eval "(()=>{const t=[...document.querySelectorAll('button,a,div[role=button]')];const x=t.find(e=>(e.textContent||'').trim().startsWith('آگهی'));if(x){x.click();return 'opened';}return 'no-tile';})()"
ab wait --load networkidle
sleep 5

echo "4) M1 assertions: headers order + chips + note cell"
ab eval "(()=>{const t=document.body.innerText;return JSON.stringify({
  hasStatusCol:t.includes('وضعیت آگهی'),
  hasRegisteredAt:t.includes('تاریخ ثبت'),
  hasNoteCol:t.includes('یادداشت'),
  hasDateStatus:t.includes('تاریخ وضعیت'),
  chipFilter:t.includes('نوع ملک (چندانتخابی)'),
  chipDom:!!document.getElementById('arm-listing-property-types-filter'),
  noteCells:document.querySelectorAll('[data-owner-note-column-cell]').length,
  statusCells:document.querySelectorAll('[data-listing-status-cell]').length,
  regCells:document.querySelectorAll('[data-registered-at-cell]').length
});})()"

echo "5) screenshot M1"
ab screenshot "$OUT/ui-m1-listings-new-columns.png"

echo "6) back to home → open M2 درخواست tile"
ab eval "(()=>{const b=[...document.querySelectorAll('button,a')];const x=b.find(e=>(e.textContent||'').includes('بازگشت')||(e.getAttribute('aria-label')||'').includes('بازگشت'));if(x){x.click();return 'back';}return 'no-back';})()"
ab wait --load networkidle
sleep 2
ab eval "(()=>{const t=[...document.querySelectorAll('button,a,div[role=button]')];const x=t.find(e=>(e.textContent||'').trim().startsWith('درخواست'));if(x){x.click();return 'opened';}return 'no-tile';})()"
ab wait --load networkidle
sleep 5

echo "7) M2 assertions: no building type + note last + chips"
ab eval "(()=>{const t=document.body.innerText;return JSON.stringify({
  buildingTypeGone:!t.includes('نوع ساختمان'),
  hasNoteCol:t.includes('یادداشت'),
  hasRegDate:t.includes('تاریخ ثبت'),
  chipFilter:t.includes('نوع ملک (چندانتخابی)'),
  chipDom:!!document.getElementById('arm-request-property-types-filter'),
  noteCells:document.querySelectorAll('[data-owner-note-column-cell]').length
});})()"

echo "8) screenshot M2"
ab screenshot "$OUT/ui-m2-requests-new-columns.png"

echo "9) live note-edit test: open first note cell editor (M2) and screenshot editing state"
ab eval "(()=>{const c=document.querySelector('[data-owner-note-column-cell] button');if(c){c.click();return 'edit-opened';}return 'no-note-btn';})()"
sleep 1
ab screenshot "$OUT/ui-m2-note-editing.png"

echo "DONE"
