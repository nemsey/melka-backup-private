#!/usr/bin/env bash
# scripts/pn039/ui-recheck-m2.sh — بازبینی M2 پس از حذف «نوع ساختمان» از پیام toast
set -uo pipefail
cd /home/z/my-project
ab() { agent-browser "$@" 2>/dev/null; }

ab open http://localhost:3000
ab wait --load networkidle
ab set viewport 1440 900
MASTER=$(python3 -c "import json; print(json.load(open('env.platform.json'))['MASTER_ACCESS_CODE'])")
ab eval "(()=>{const b=[...document.querySelectorAll('button')];const x=b.find(e=>(e.textContent||'').includes('ورود با کد مدیر'));if(x){x.click();return 'm';}return 'n';})()"
sleep 1
ab eval "(()=>{const i=document.getElementById('masterCode');if(!i)return 'n';const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(i,'$MASTER');i.dispatchEvent(new Event('input',{bubbles:true}));return 't';})()"
ab eval "(()=>{const b=[...document.querySelectorAll('button')];const x=b.find(e=>(e.textContent||'').includes('ورود'));if(x){x.click();return 's';}return 'n';})()"
ab wait --load networkidle
sleep 3
ab eval "(()=>{const t=[...document.querySelectorAll('button,a,div[role=button]')];const x=t.find(e=>(e.textContent||'').trim().startsWith('درخواست'));if(x){x.click();return 'o';}return 'n';})()"
ab wait --load networkidle
sleep 6
echo "M2-RECHECK:"
ab eval "(()=>{const t=document.body.innerText;return JSON.stringify({buildingTypeGone:!t.includes('نوع ساختمان'),hasNoteCol:t.includes('یادداشت'),hasRegDate:t.includes('تاریخ ثبت'),chipDom:!!document.getElementById('arm-request-property-types-filter'),noteCells:document.querySelectorAll('[data-owner-note-column-cell]').length});})()"
ab screenshot download/pn039/ui-m2-requests-new-columns.png
echo DONE
