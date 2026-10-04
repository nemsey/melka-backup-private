#!/usr/bin/env python3
"""تولید آیکون‌های PWA داشبورد ملک تبریز — زمردی با نماد سقف + ستون نمودار"""
from PIL import Image, ImageDraw
import os

OUT = "/home/z/my-project/public/icons"
os.makedirs(OUT, exist_ok=True)

# پالت
EMERALD_DARK = (15, 87, 68)      # #0f5744
EMERALD = (21, 148, 106)         # #15946a
EMERALD_LIGHT = (46, 184, 133)   # #2eb885
AMBER = (244, 177, 51)           # #f4b133
WHITE = (255, 255, 255)


def rounded_rect(draw, box, radius, fill):
    draw.rounded_rectangle(box, radius=radius, fill=fill)


def draw_glyph(size):
    """نماد: سقف خانه + سه ستون نمودار صعودی — نشان هوش تحلیلی املاک"""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # پس‌زمینه: مربع گرد با گرادیان عمودی زمردی
    pad = int(size * 0.04)
    radius = int(size * 0.22)
    for y in range(pad, size - pad):
        t = (y - pad) / max(1, (size - 2 * pad))
        r = int(EMERALD_DARK[0] + (EMERALD[0] - EMERALD_DARK[0]) * t)
        g = int(EMERALD_DARK[1] + (EMERALD[1] - EMERALD_DARK[1]) * t)
        b = int(EMERALD_DARK[2] + (EMERALD[2] - EMERALD_DARK[2]) * t)
        d.rectangle([pad, y, size - pad, y + 1], fill=(r, g, b, 255))
    # قاب گرد
    mask = Image.new("L", (size, size), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([pad, pad, size - pad, size - pad], radius=radius, fill=255)
    img.putalpha(mask)

    # ---- سقف خانه (مثلث) ----
    cx = size * 0.5
    d.polygon([(cx, size * 0.20), (size * 0.16, size * 0.46), (size * 0.84, size * 0.46)], fill=WHITE + (255,))
    d.polygon([(cx, size * 0.245), (size * 0.225, size * 0.46), (size * 0.775, size * 0.46)], fill=EMERALD_LIGHT + (255,))

    # ---- ستون‌های نمودار ----
    bar_w = size * 0.085
    gap = size * 0.055
    base_y = size * 0.82
    heights = [0.16, 0.26, 0.36]
    x = size * 0.32
    colors = [AMBER, WHITE, AMBER]
    for h, c in zip(heights, colors):
        top = base_y - size * h
        rounded_rect(d, [x, top, x + bar_w, base_y], int(bar_w / 3), c + (255,))
        x += bar_w + gap

    return img


for s in [192, 512]:
    draw_glyph(s).save(f"{OUT}/icon-{s}.png", "PNG")

# نسخه maskable: گلیف کوچک‌تر روی پس‌زمینه پر
def draw_maskable(size):
    img = Image.new("RGBA", (size, size), EMERALD_DARK + (255,))
    inner = draw_glyph(int(size * 0.78))
    off = int(size * 0.11)
    img.alpha_composite(inner, (off, off))
    return img

for s in [192, 512]:
    draw_maskable(s).save(f"{OUT}/maskable-{s}.png", "PNG")

# آیکون SVG (برای favicon)
svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#15946a"/>
      <stop offset="1" stop-color="#0f5744"/>
    </linearGradient>
  </defs>
  <rect x="5" y="5" width="118" height="118" rx="28" fill="url(#g)"/>
  <polygon points="64,26 20,59 108,59" fill="#ffffff"/>
  <polygon points="64,31 30,59 98,59" fill="#2eb885"/>
  <rect x="41" y="68" width="11" height="34" rx="4" fill="#f4b133"/>
  <rect x="57" y="58" width="11" height="44" rx="4" fill="#ffffff"/>
  <rect x="73" y="48" width="11" height="54" rx="4" fill="#f4b133"/>
</svg>"""
with open(f"{OUT}/icon.svg", "w", encoding="utf-8") as f:
    f.write(svg)

# favicon کوچک
draw_glyph(64).resize((32, 32), Image.LANCZOS).save(f"{OUT}/favicon.png", "PNG")

print("icons generated:", sorted(os.listdir(OUT)))
