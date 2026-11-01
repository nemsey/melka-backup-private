#!/usr/bin/env bash
set -uo pipefail
cd /home/z/my-project
ab() { agent-browser "$@" 2>/dev/null; }
ab open http://localhost:3000
ab wait --load networkidle
MASTER=$(python3 -c "import json; print(json.load(open('env.platform.json'))['MASTER_ACCESS_CODE'])")
ab eval "(()=>{const b=[...document.querySelectorAll('button')];const x=b.find(e=>(e.textContent||'').includes('ورود با کد مدیر'));if(x)x.click();})" >/dev/null
sleep 1
ab eval "(()=>{const i=document.getElementById('masterCode');const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(i,'$MASTER');i.dispatchEvent(new Event('input',{bubbles:true}));})" >/dev/null
ab eval "(()=>{const b=[...document.querySelectorAll('button')];const x=b.find(e=>(e.textContent||'').includes('ورود'));if(x)x.click();})" >/dev/null
sleep 3
ab eval "(()=>{const t=[...document.querySelectorAll('button,a,div[role=button]')];const x=t.find(e=>(e.textContent||'').trim().startsWith('درخواست'));if(x)x.click();})" >/dev/null
sleep 7
echo "LOCATE:"
ab eval "(()=>{const hits=[];const walk=(el)=>{for(const c of el.childNodes){if(c.nodeType===3&&(c.textContent||'').includes('نوع ساختمان')){hits.push({tag:el.tagName,cls:(el.className||'').toString().slice(0,80),txt:(el.textContent||'').slice(0,120)});}if(c.nodeType===1)walk(c);}};walk(document.body);return JSON.stringify(hits.slice(0,6));})()"
