#!/usr/bin/env python3
"""
P6530 / گام صفر — مولد نظام رنگ ۱۳ بخش ملکا
خروجی‌ها:
  1. scripts/p6530/colors.json        — سند مرجع ۱۳ رنگ (شاهد قاعده ۷)
  2. scripts/p6530/palette.css        — قطعه CSS برای globals.css
  3. scripts/p6530/tailwind-snippet.ts — قطعه برای tailwind.config.ts
  4. download/p6530/color-contrast-report.md — گزارش کنتراست WCAG AA
قواعد: قاعده ۱ (۱۳ رنگ یکتا) · قاعده ۲ (۴ سایه ۵۰/۲۰۰/۵۰۰/۷۰۰) ·
       قاعده ۳ (کنتراست ≥ ۴٫۵:۱) · قاعده ۴ (دارک: ۵۰۰→۴۰۰ + معادل تیره)
"""
import json, colorsys, os

# ---- ۱۳ بخش عین جدول دستور مالک (قاعده ۱) ----
SECTIONS = [
    ("login",          "صفحهٔ ورود",              "بنفش سلطنتی",   "#6D28D9"),
    ("home",           "صفحهٔ هوم",                "آبی نفتی",      "#0F172A"),
    ("finder",         "فایل‌یابی ملکا",           "آبی روشن",      "#0284C7"),
    ("melka-listing",  "آگهی ملکا",               "سبز زمردی",     "#059669"),
    ("melka-request",  "درخواست ملکا",             "نارنجی مرجانی", "#EA580C"),
    ("settings",       "تنظیمات عمومی",            "خاکستری فولادی","#475569"),
    ("mgmt",           "داشبورد مدیریتی",          "قهوه‌ای کهربایی","#92400E"),
    ("m1",             "M1 آگهی ملک تبریز",        "سبز یشمی",      "#10B981"),
    ("m2",             "M2 درخواست ملک تبریز",     "کهربایی روشن",  "#F59E0B"),
    ("m3",             "M3 معاملات ملک تبریز",     "قرمز یاقوتی",   "#DC2626"),
    ("m4",             "M4 کارشناسان ملک تبریز",   "فیروزه‌ای",     "#0891B2"),
    ("consultant",     "صفحهٔ مشاور (ایجنت)",      "صورتی ارغوانی", "#DB2777"),
    ("ai",             "هوش مصنوعی/گزارش‌ها",      "لاجوردی",       "#4F46E5"),
]

def hx(c): return c.lstrip("#").upper()
def rgb(c): return tuple(int(c.lstrip("#")[i:i+2], 16) for i in (0, 2, 4))
def css(c): return "#" + hx(c)
def mix(a, b, t):
    """t=0 → a، t=1 → b"""
    ar, ag, ab = rgb(a); br, bg, bb = rgb(b)
    return "#%02X%02X%02X" % (round(ar+(br-ar)*t), round(ag+(bg-ag)*t), round(ab+(bb-ab)*t))
def lighten(c, t): return mix(c, "#FFFFFF", t)
def darken(c, t): return mix(c, "#0A0E1A", t)

def rel_lum(c):
    def ch(v):
        v /= 255.0
        return v/12.92 if v <= 0.04045 else ((v+0.055)/1.055) ** 2.4
    r, g, b = rgb(c)
    return 0.2126*ch(r) + 0.7152*ch(g) + 0.0722*ch(b)

def contrast(a, b):
    la, lb = rel_lum(a), rel_lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi+0.05)/(lo+0.05)

def hue(c):
    r, g, b = (v/255 for v in rgb(c))
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    return round(h*360)

def best_fg_on(bg):
    """انتخاب متن با کنتراست ≥۴٫۵ روی bg: سفید یا تیرهٔ هماهنگ"""
    if contrast("#FFFFFF", bg) >= 4.5: return ("#FFFFFF", contrast("#FFFFFF", bg))
    for cand in ("#0A0E1A", "#0F172A", "#1C1917"):
        if contrast(cand, bg) >= 4.5: return (cand, contrast(cand, bg))
    return ("#000000", contrast("#000000", bg))

out = {"meta": {
    "title": "نظام رنگ ۱۳ بخش ملکا — قاعده ۱ دستور مالک (گام صفر)",
    "rule": "یک رنگ، یک بخش — نه تکرار، نه تضاد",
    "shades": ["50 (پس‌زمینهٔ بسیار روشن)", "200 (حاشیه/جداکننده)", "500 (رنگ اصلی دکمه)", "700 (متن تیره/تأکید)"],
    "darkRule": "۵۰۰ → ۴۰۰ در دارک؛ متن معکوس؛ حفظ هویت رنگی",
}, "sections": []}

css_lines = []
tw_lines = []
contrast_rows = []

# بررسی یکتایی مطلق رنگ‌ها (صفر تکرار مقدار)
seen = {}
dupes = []
for key, fa, name, base in SECTIONS:
    if base in seen: dupes.append((key, seen[base]))
    seen[base] = key
assert not dupes, f"تکرار رنگ: {dupes}"

hues = {}
for idx, (key, fa, name, base) in enumerate(SECTIONS, 1):
    s50  = lighten(base, 0.93)
    s200 = lighten(base, 0.56)
    s500 = base
    s700 = darken(base, 0.50)
    s400 = lighten(base, 0.16)   # معادل دارکِ ۵۰۰ (قاعده ۴)
    # دارک: ۵۰→سطح تیره با ته‌رنگ · ۲۰۰→حاشیه تیره · ۷۰۰→متن روشن
    d50  = mix("#141A26", base, 0.16)
    d200 = mix("#273041", base, 0.38)
    d700 = lighten(base, 0.42)
    while contrast(d700, "#1B2331") < 4.6 and d700 != lighten(d700, 0.08):
        d700 = lighten(d700, 0.08)
    fg500, fg500_ratio = best_fg_on(s500)
    hues[key] = hue(base)

    # کنتراست‌های قاعده ۳ (نور)
    pairs = {
        "متن روی ۵۰۰ (دکمه)": (fg500, s500, fg500_ratio),
        "۷۰۰ روی ۵۰":  (s700, s50,  contrast(s700, s50)),
        "۷۰۰ روی ۲۰۰": (s700, s200, contrast(s700, s200)),
        "۷۰۰ روی سفید (کارت)": (s700, "#FFFFFF", contrast(s700, "#FFFFFF")),
        "دارک: ۷۰۰روشن روی کارت تیره": (d700, "#1B2331", contrast(d700, "#1B2331")),
    }
    ok_all = all(r >= 4.5 for _, _, r in pairs.values())
    contrast_rows.append((idx, fa, name, base, pairs, ok_all))

    out["sections"].append({
        "n": idx, "key": key, "fa": fa, "name": name,
        "500": css(s500), "50": css(s50), "200": css(s200), "700": css(s700),
        "dark": {"500→400": css(s400), "50": css(d50), "200": css(d200), "700": css(d700)},
        "fgOn500": css(fg500), "hue": hue(base),
        "contrastAA": {k: round(r, 2) for k, (_, _, r) in pairs.items()}, "pass": ok_all,
    })

    v = lambda c: css(c).lower()
    css_lines.append(f"  /* {idx}. {fa} — {name} {s500} */")
    css_lines.append(f"  --sec-{key}-50: {v(s50)}; --sec-{key}-200: {v(s200)}; --sec-{key}-500: {v(s500)}; --sec-{key}-700: {v(s700)}; --sec-{key}-fg: {v(fg500)};")
    css_lines.append(f"  .dark {{ ... }}")  # جای‌نگهدار — دارک در بلوک جدا
    dark_kv = f"--sec-{key}-50: {v(d50)}; --sec-{key}-200: {v(d200)}; --sec-{key}-500: {v(s400)}; --sec-{key}-700: {v(d700)}; --sec-{key}-fg: {v(fg500)};"
    css_lines.append(f"  DARK|{dark_kv}")
    tw_lines.append(f'        "sec-{key}": {{ 50: "{v(s50)}", 200: "{v(s200)}", 400: "{v(s400)}", 500: "{v(s500)}", 700: "{v(s700)}" }},')

# فاصله‌های hue (گزارش صادقانه)
mind = 999; closest = None
for i in range(len(SECTIONS)):
    for j in range(i+1, len(SECTIONS)):
        a, b = SECTIONS[i][0], SECTIONS[j][0]
        d = abs(hues[a]-hues[b]); d = min(d, 360-d)
        if d < mind: mind, closest = d, (SECTIONS[i][1], SECTIONS[j][1])
out["meta"]["minHueDistance"] = {"degrees": mind, "between": closest,
    "note": "جدول رنگ مالک معیار مرجع است؛ جفت‌های نزدیک با اختلاف روشنایی/اشباع و بافت بخش از هم تفکیک می‌شوند"}
out["meta"]["uniqueColors"] = len(set(s[3] for s in SECTIONS))

os.makedirs("scripts/p6530", exist_ok=True)
os.makedirs("download/p6530", exist_ok=True)
json.dump(out, open("scripts/p6530/colors.json", "w"), ensure_ascii=False, indent=2)

# CSS snippet
with open("scripts/p6530/palette.css", "w") as f:
    f.write("/* ===== :root ===== */\n:root {\n")
    for line in css_lines:
        if line.startswith("  DARK|"): continue
        if line.strip() == ".dark { ... }": continue
        f.write(line + "\n")
    f.write("}\n/* ===== .dark ===== */\n.dark {\n")
    for line in css_lines:
        if line.startswith("  DARK|"):
            f.write("  /* " + line[8:].split("--")[0] + "*/\n") if False else None
            f.write("  " + line[7:] + "\n")
    f.write("}\n")

with open("scripts/p6530/tailwind-snippet.ts", "w") as f:
    f.write("// قاعده ۵ — پالت مرکزی ۱۳ بخش (قاعده ۱ گام صفر)\n")
    f.write("const sectionPalette = {\n" + "\n".join(tw_lines) + "\n};\n")

# گزارش کنتراست
with open("download/p6530/color-contrast-report.md", "w") as f:
    f.write("# گزارش کنتراست WCAG AA — نظام رنگ ۱۳ بخش ملکا (گام صفر)\n\n")
    f.write("آستانهٔ قبولی هر جفت: **≥ ۴٫۵:۱** (WCAG AA — قاعده ۳/۴)\n\n")
    f.write("| # | بخش | رنگ اصلی | متن روی ۵۰۰ | ۷۰۰ روی ۵۰ | ۷۰۰ روی ۲۰۰ | ۷۰۰ روی سفید | دارک ۷۰۰ | نتیجه |\n|---|---|---|---|---|---|---|---|---|\n")
    for idx, fa, name, base, pairs, ok in contrast_rows:
        r = lambda k: f"{pairs[k][2]:.2f}"
        f.write(f"| {idx} | {fa} | `{css(base)}` | {r('متن روی ۵۰۰ (دکمه)')} | {r('۷۰۰ روی ۵۰')} | {r('۷۰۰ روی ۲۰۰')} | {r('۷۰۰ روی سفید (کارت)')} | {r('دارک: ۷۰۰روشن روی کارت تیره')} | {'PASS' if ok else 'CHECK'} |\n")
    f.write(f"\n- یکتایی رنگ‌ها: **{out['meta']['uniqueColors']} از ۱۳** (صفر تکرار)\n")
    f.write(f"- کم‌ترین فاصلهٔ hue: **{mind}°** بین «{closest[0]}» و «{closest[1]}» — جدول رنگ مالک مرجع است و این جفت‌ها با روشنایی/اشباع متفاوت و زمینهٔ مستقل بخش از هم تفکیک می‌شوند\n")

print("OK — colors.json, palette.css, tailwind-snippet.ts, contrast report")
print(f"unique={out['meta']['uniqueColors']}/13, minHueDist={mind}° ({closest[0]} × {closest[1]})")
fails = [(fa, k, round(r,2)) for idx, fa, name, base, pairs, ok in contrast_rows if not ok for k, (_, _, r) in pairs.items() if r < 4.5]
print("AA failures:", fails if fails else "none")
