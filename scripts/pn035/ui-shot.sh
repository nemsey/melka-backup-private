#!/usr/bin/env bash
# scripts/pn035/ui-shot.sh — PN-035 (شورا-ن۰۵۷ · فاز ۴): اثبات زندهٔ Eager UI
# درخواست OTP → فیلد کد تأیید «همان لحظه» ظاهر می‌شود (بدون انتظار برای پیامک/کار رله)
set -uo pipefail
cd /home/z/my-project
OUT=download/pn035
mkdir -p "$OUT"

ab() { agent-browser "$@" 2>/dev/null; }

echo "1) open login page"
ab open http://localhost:3000
ab wait --load networkidle
ab set viewport 1280 900

echo "2) type personnel code (fake-valid format — no real SMS)"
ab eval "(()=>{const i=document.getElementById('personnelCode');if(!i)return 'no-input';const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(i,'999888');i.dispatchEvent(new Event('input',{bubbles:true}));return 'typed';})()"

echo "3) submit → eager OTP field must appear IMMEDIATELY (no wait for SMS job)"
ab eval "(()=>{const b=[...document.querySelectorAll('button')];const x=b.find(e=>(e.textContent||'').includes('دریافت کد پیامکی'));if(x){x.click();return 'submitted';}return 'no-btn';})()"
sleep 2

echo "4) eager assertions in live DOM"
ab eval "(()=>{const t=document.body.innerText;const otpScreen=t.includes('کد تأیید پیامکی');const otpInput=!!document.querySelector('[aria-label=\"کد پیامکی ۴ رقمی\"]');const sending=t.includes('در حال ارسال پیامک');const personnelGone=!t.includes('ورود کارشناس');return JSON.stringify({eagerOtpScreen:otpScreen,otpInputVisible:otpInput,sendingToast:sending,personnelFormGone:personnelGone});})()"

echo "5) screenshot"
ab screenshot "$OUT/ui-eager-otp.png"

echo "6) also capture the relay guide in settings (generation J)"
ab open http://localhost:3000
ab wait --load networkidle
MASTER=$(python3 -c "import json; print(json.load(open('env.platform.json'))['MASTER_ACCESS_CODE'])")
ab eval "(()=>{const b=[...document.querySelectorAll('button')];const x=b.find(e=>(e.textContent||'').includes('ورود با کد مدیر'));if(x){x.click();return 'master-mode';}return 'no-btn';})()"
sleep 1
ab eval "(()=>{const i=document.getElementById('masterCode');if(!i)return 'no-input';const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(i,'$MASTER');i.dispatchEvent(new Event('input',{bubbles:true}});return 'typed';})()" 2>/dev/null || \
ab eval "(()=>{const i=document.getElementById('masterCode');if(!i)return 'no-input';const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set;s.call(i,'$MASTER');i.dispatchEvent(new Event('input',{bubbles:true}));return 'typed';})()"
ab eval "(()=>{const b=[...document.querySelectorAll('button')];const x=b.find(e=>(e.textContent||'').includes('ورود'));if(x){x.click();return 'submitted';}return 'no-submit';})()"
ab wait --load networkidle
sleep 2
ab eval "(()=>{const b=[...document.querySelectorAll('button,a,[role=button],div')];const x=b.find(e=>(e.textContent||'').trim().startsWith('تنظیمات عمومی'));if(x){x.click();return 'settings-open';}return 'no-settings';})()"
sleep 3
ab eval "(()=>{const el=document.getElementById('settings-melk-tabriz');if(!el)return 'no-card';el.scrollIntoView({block:'start'});window.scrollBy(0,-70);return 'scrolled';})()"
sleep 2
ab screenshot "$OUT/ui-connection-eager.png"

echo "DONE"
