#!/usr/bin/env python3
"""Inspect Excel exports: columns + fill-rates of owner/applicant columns (گام ۱-ب + گام ۲ witnesses)"""
import zipfile, re, sys
from xml.etree import ElementTree as ET

NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}

def inspect(path, label):
    try:
        z = zipfile.ZipFile(path)
        # shared strings
        shared = []
        if 'xl/sharedStrings.xml' in z.namelist():
            root = ET.fromstring(z.read('xl/sharedStrings.xml'))
            for si in root.findall('m:si', NS):
                text = ''.join(t.text or '' for t in si.iter('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t'))
                shared.append(text)
        # sheet 1
        sheet = ET.fromstring(z.read('xl/worksheets/sheet1.xml'))
        rows = sheet.findall('.//m:row', NS)
        def row_values(row):
            vals = []
            for c in row.findall('m:c', NS):
                t = c.get('t')
                v = c.find('m:v', NS)
                if v is None:
                    vals.append('')
                elif t == 's':
                    vals.append(shared[int(v.text)])
                else:
                    vals.append(v.text or '')
            return vals
        header = row_values(rows[0]) if rows else []
        data_rows = [row_values(r) for r in rows[1:]]
        print(f'── {label} ──')
        print(f'   ردیف‌ها: {len(data_rows)}')
        print(f'   ستون‌ها ({len(header)}): {" | ".join(header)}')
        # fill-rate per column
        fills = []
        for i, h in enumerate(header):
            if not h: continue
            filled = sum(1 for r in data_rows if i < len(r) and str(r[i]).strip())
            fills.append((h, filled))
        for h, f in fills:
            pct = 100.0*f/max(1,len(data_rows))
            mark = ' ★' if any(k in h for k in ['مالک','متقاضی','موبایل','تماس']) else ''
            print(f'     {h}: {f}/{len(data_rows)} ({pct:.1f}%){mark}')
        print()
    except Exception as e:
        print(f'── {label} ── ERROR: {e}')

print('═══ ستون‌های کلیدی ۸ خروجی ═══\n')
inspect('/tmp/export-melketun-listings.xlsx', 'آگهی ملکتون (M7)')
inspect('/tmp/export-melketun-requests.xlsx', 'درخواست ملکتون (M8)')
inspect('/tmp/export-melk-tabriz-listings.xlsx', 'آگهی ملک تبریز')
inspect('/tmp/export-melk-tabriz-requests.xlsx', 'درخواست ملک تبریز')
