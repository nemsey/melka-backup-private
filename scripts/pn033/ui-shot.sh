#!/usr/bin/env bash
# scripts/pn033/ui-shot.sh — PN-033 (شورا-ن۰۵۴): اسکرین‌شات تنظیمات پس از پاکسازی
set -uo pipefail
cd /home/z/my-project
OUT=download/pn033
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

echo "3) scroll to Melk Tabriz connection card"
ab eval "(()=>{const el=document.getElementById('settings-melk-tabriz');if(!el)return 'no-card';el.scrollIntoView({block:'start'});window.scrollBy(0,-70);return 'scrolled';})()"
sleep 2
ab screenshot "$OUT/ui-after-melk-connection.png"
sleep 1

echo "4) full settings page"
ab eval "window.scrollTo(0,0)"
sleep 1
ab screenshot --full "$OUT/ui-after-settings-full.png"

echo "5) compose before/after proof"
python3 << 'PYEOF'
from PIL import Image, ImageDraw, ImageFont
import os

before_path = "download/pn012/screens/04-settings-worker.png"   # دوران Worker (PN-012 — پیش از پاکسازی)
after_path  = "download/pn033/ui-after-melk-connection.png"     # پس از پاکسازی ن۰۵۴

b = Image.open(before_path).convert("RGB")
a = Image.open(after_path).convert("RGB")

TARGET_H = 820
def fit_h(img, h):
    w = int(img.width * h / img.height)
    return img.resize((w, h), Image.LANCZOS)

b, a = fit_h(b, TARGET_H), fit_h(a, TARGET_H)

PAD, HEAD = 16, 64
W = b.width + a.width + PAD * 3
H = TARGET_H + HEAD + PAD * 2
canvas = Image.new("RGB", (W, H), "#0f172a")
draw = ImageDraw.Draw(canvas)

def font(sz):
    for p in ["/usr/share/fonts/truetype/chinese/NotoSansSC-Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]:
        if os.path.exists(p):
            try: return ImageFont.truetype(p, sz)
            except Exception: pass
    return ImageFont.load_default()

f_head, f_sub = font(30), font(18)
draw.text((PAD, 14), "PN-033 · UI Cleanup Proof (Melka Council Doc n054)", font=f_head, fill="#e2e8f0")
canvas.paste(b, (PAD, HEAD))
canvas.paste(a, (PAD * 2 + b.width, HEAD))
draw.text((PAD + b.width // 2 - 180, HEAD + TARGET_H + 4), "BEFORE — PN-012 era (Worker card + 9 services)", font=f_sub, fill="#f87171")
draw.text((PAD * 2 + b.width + a.width // 2 - 150, HEAD + TARGET_H + 4), "AFTER — PN-033 (Termux relay + OTP only)", font=f_sub, fill="#34d399")

out = "download/pn033/ui-cleanup-proof.png"
canvas.save(out, optimize=True)
print(f"composed: {out} ({os.path.getsize(out)//1024}KB · {canvas.width}x{canvas.height})")
PYEOF

ab close
echo "DONE"
