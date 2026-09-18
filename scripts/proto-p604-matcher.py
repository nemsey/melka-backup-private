#!/usr/bin/env python3
"""پروتوتایپ الگوریتم تطبیق محله P6.5-04 — پیش از پیاده‌سازی TS
سه لایه: (۱) تطبیق دقیق نرمال‌شده (کلید کامل + کلید هسته بدون پرانتز)
         (۲) برداری: max(کسینوس واژه‌ای، کسینوس نویسه‌نگرام یک+دو)
         (۳) توکن متمایز مشترک (posting یکتا)
آستانه لایه ۲: ۰٫۷ — تساوی دقیق دو کاندید → عدم تطبیق (fail-closed)
"""
import json, re, math
from collections import Counter, defaultdict
DEBUG = False  # true برای دیدن نامزدهای برتر

with open('/home/z/my-project/src/lib/divar/tabriz-locations.data.json') as f:
    data = json.load(f)

AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'
FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹'

def en_digits(s):
    s = re.sub(r'[۰-۹]', lambda d: str(FA_DIGITS.index(d.group())), s)
    s = re.sub(r'[٠-٩]', lambda d: str(AR_DIGITS.index(d.group())), s)
    return s

def norm_chars(s):
    for a, b in [('ي','ی'),('ك','ک'),('آ','ا'),('أ','ا'),('إ','ا'),('ة','ه')]:
        s = s.replace(a, b)
    # حذف اعراب/نشان‌ها
    s = re.sub(r'[\u064B-\u0652\u0670\u0640]', '', s)
    return s

def strip_key(s):
    """کلید تطبیق دقیق: بدون فاصله/ZWNJ/نقطه‌گذاری، کوچک"""
    s = en_digits(norm_chars(s)).replace('\u200c','').replace('\u200f','').replace('\u200e','')
    s = re.sub(r'[\s«»"\'()\[\]{}،؛:,.!?؟\-_ـ ٬٬]+', '', s)
    return s.lower()

def core_name(s):
    return re.sub(r'\([^)]*\)', '', s).strip()

# ---------- لایه ۲: بردارها ----------
def word_vector(s):
    toks = [t for t in re.split(r'[\s\u200c،؛:()\[\]«»"\'.\-_,]+', s) if len(t) > 1 or (t and t.isdigit())]
    return Counter(toks)

# واژه‌های عمومی مکان — در لایه برداری از دو طرف کنار گذاشته می‌شوند
GENERIC_WORDS = {'خیابان','کوچه','بلوار','بازار','پارک','پل','فلکه','میدان',
                 'شهرک','کوی','محله','منطقه','جاده','بن‌بست','مجتمع'}

def strip_generic(s):
    toks = [t for t in re.split(r'[\s\u200c،؛:()\[\]«»"\'.\-_,]+', s) if t]
    return ' '.join(t for t in toks if t not in GENERIC_WORDS) or s

def chargram_vector(s):
    flat = re.sub(r'[\s\u200c]+', '', s)
    v = Counter(flat)  # یونی‌گرام
    for i in range(len(flat) - 1):
        v[flat[i:i+2]] += 1  # بی‌گرام
    for i in range(len(flat) - 2):
        v[flat[i:i+3]] += 1  # سه‌گرام
    return v

def cosine(a: Counter, b: Counter) -> float:
    if not a or not b: return 0.0
    dot = sum(v * b.get(k, 0) for k, v in a.items())
    if dot == 0: return 0.0
    na = math.sqrt(sum(v*v for v in a.values()))
    nb = math.sqrt(sum(v*v for v in b.values()))
    return dot / (na * nb)

# ---------- ساخت رجیستری ----------
class Entry:
    def __init__(self, kind, name, id, area_id, area_name):
        self.kind, self.name, self.id = kind, name, id
        self.area_id, self.area_name = area_id, area_name
        self.full_key = strip_key(name)
        self.core_key = strip_key(core_name(name))
        self.core = strip_generic(en_digits(norm_chars(core_name(name))))
        self.words = word_vector(self.core)
        self.grams = chargram_vector(strip_key(self.core))
        self.tokens = set(t for t in re.split(r'[\s\u200c،؛:()\[\]«»"\'.\-_,]+', en_digits(norm_chars(name))) if len(t) >= 3)

entries = []
for a in data['areas']:
    entries.append(Entry('area', a['n'], a['id'], a['id'], a['n']))
    for l in a['l']:
        entries.append(Entry('line', l['n'], l['id'], a['id'], a['n']))

by_key = defaultdict(list)
for e in entries:
    by_key[e.full_key].append(e)
    if e.core_key != e.full_key:
        by_key[e.core_key].append(e)
# کلید هسته فقط وقتی با کلید کامل فرق دارد ایندکس شود (وگرنه دوبار)
token_postings = defaultdict(set)
for e in entries:
    for t in e.tokens:
        token_postings[t].add(e.id)

def pick_unique(cands):
    """ترجیح ناحیه بر خط در برخورد کلید یکسان؛ چند گزینه هم‌جنس → مبهم"""
    areas = [e for e in cands if e.kind == 'area']
    if len(areas) == 1: return areas[0]
    lines = [e for e in cands if e.kind == 'line']
    if not areas and len(lines) == 1: return lines[0]
    return None

def find(raw):
    n = en_digits(norm_chars(raw)).strip()
    key = strip_key(raw)
    # لایه ۱ — کلید کامل، سپس هسته (بدون پرانتز)
    for k in (key, strip_key(core_name(raw))):
        cands = by_key.get(k, [])
        uniq = {e.id: e for e in cands}
        if len(uniq) == 1:
            return list(uniq.values())[0], 1.0, 'exact'
        if len(uniq) > 1:
            e = pick_unique(list(uniq.values()))
            if e: return e, 1.0, 'exact+pref'
    # لایه ۲ — برداری روی هسته بدون واژه عمومی
    core_in = strip_generic(n)
    wv, gv = word_vector(core_in), chargram_vector(strip_key(core_in))
    scored = []
    for e in entries:
        s = max(cosine(wv, e.words), cosine(gv, e.grams))
        scored.append((s, 0 if e.kind == 'area' else 1, e))
    scored.sort(key=lambda x: (-x[0], x[1]))
    if scored and scored[0][0] >= 0.7:
        # تساوی هم‌نوع (ناحیه-ناحیه یا خط-خط) → مبهم؛ تساوی ناحیه/خط → ترجیح ناحیه (مرتب‌سازی)
        if (len(scored) > 1 and abs(scored[0][0] - scored[1][0]) < 1e-9
                and scored[1][2].id != scored[0][2].id and scored[1][1] == scored[0][1]):
            if DEBUG: print(f'      [ambig] {scored[0][2].name} == {scored[1][2].name} @ {scored[0][0]:.3f}')
            return None, scored[0][0], 'ambiguous'
        if DEBUG and len(scored) > 1:
            print(f'      [top2] {scored[0][2].name}({scored[0][2].kind})={scored[0][0]:.3f}  vs  {scored[1][2].name}({scored[1][2].kind})={scored[1][0]:.3f}')
        return scored[0][2], scored[0][0], 'vector'
    # لایه ۳
    input_tokens = set(t for t in re.split(r'[\s\u200c،؛:()\[\]«»"\'\.\-_,]+', n) if len(t) >= 3)
    cands3 = set()
    for t in input_tokens:
        posting = token_postings.get(t, set())
        if 1 <= len(posting) <= 2:
            cands3 |= posting
    if len(cands3) == 1:
        e = next(x for x in entries if x.id in cands3)
        return e, 0.5, 'token'
    return None, 0.0, 'none'

# ================= آزمون‌های شورا =================
print('=== تست‌های شورا ===')
for raw in ['ولیعصر', 'ولی عصر', 'ولی‌عصر']:
    e, s, m = find(raw)
    print(f'  {raw!r:14} -> {m:8} score={s:.3f}  {e.name if e else None!r}')

r1, _, _ = find('ائل‌گلی'); r2, _, _ = find('ائلگلی')
print(f'  ائل‌گلی -> {r1.name if r1 else None!r} | ائلگلی -> {r2.name if r2 else None!r} | یکسان: {r1 is not None and r1.id == r2.id}')

for raw in ['محله ساختگی خیالی', 'ستاره دریا', 'خیابان ابریشم']:
    e, s, m = find(raw)
    print(f'  ناموجود {raw!r:24} -> {m} (score={s:.3f}, match={e.name if e else None!r})')

print()
print('=== ۲۰ نمونه محاوره‌ای ===')
samples = [
    'ولیعصر', 'ولی عصر', 'ولی‌عصر', 'ائل‌گلی', 'ائلگلی', 'ایل گلی',
    'باغمیشه', 'باغ میشه', 'زعفرانیه', 'میرداماد', 'الهی پرست',
    'رجایی شهر', 'ویلاشهر', 'گلشهر', 'پرواز', 'باغچه بان', 'باغچه‌بان',
    'یاغچیان', 'استانداری', '۳۵ متری سینا', '35 متری سینا', 'سپهر صادرات',
    'شهرک ولیعصر', 'کوی زمرد', 'معلم', 'خيام جنوبی', 'شمس تبریزی',
    'خیابان مقاتل', 'ارسک', 'کاج', 'ابوریحان',
]
ok_count = 0
for raw in samples:
    e, s, m = find(raw)
    status = '✓' if e else '✗'
    if e: ok_count += 1
    print(f'  {status} {raw!r:22} -> {m:8} score={s:.3f}  {e.name if e else "—":24} ({e.kind if e else ""} در {e.area_name if e else ""})')
print(f'نتیجه: {ok_count}/{len(samples)} تطبیق موفق = {100*ok_count/len(samples):.0f}%')
