#!/usr/bin/env python3
"""PN-069 · جستجوی دادهٔ لایهٔ ۲ برای ۲۰۵ کد در انتظار، در همهٔ لایه‌های پشتیبان"""
import sqlite3, json, glob, os

codes = json.load(open('/tmp/pn069_pending_codes.json'))
ph = ','.join('?' * len(codes))

layers = {
    'LIVE': 'db/custom.db',
    'CITADEL': 'upload/.data/custom.db',
    'ROLLING-rescue-0830': 'upload/.data/rolling/rescue-2026-11-09T08-30-41.db',
}
# دو sacred اخیر
for p in sorted(glob.glob('upload/.data/sacred/sacred-2026-11-09T*.db'))[-2:]:
    layers[f'SACRED-{os.path.basename(p)[7:16]}'] = p

print(f'pending codes: {len(codes)}')
print('=' * 70)
for label, path in layers.items():
    if not os.path.exists(path):
        print(f'{label}: MISSING {path}')
        continue
    try:
        con = sqlite3.connect(f'file:{path}?mode=ro', uri=True)
        cur = con.cursor()
        total = cur.execute('SELECT COUNT(*) FROM PropertyRecord').fetchone()[0]
        found = cur.execute(f'SELECT COUNT(*) FROM PropertyRecord WHERE propertyCode IN ({ph})', codes).fetchone()[0]
        enriched = cur.execute(
            f'SELECT COUNT(*) FROM PropertyRecord WHERE propertyCode IN ({ph}) AND extractionBatchId IS NOT NULL', codes
        ).fetchone()[0]
        with_owner = cur.execute(
            f"SELECT COUNT(*) FROM PropertyRecord WHERE propertyCode IN ({ph}) AND (rawOwnerName IS NOT NULL OR ownerMobile IS NOT NULL)",
            codes).fetchone()[0]
        con.close()
        print(f'{label:24s} total={total:6d} · از ۲۰۵ کد: موجود={found} · دارای extractionBatchId={enriched} · دارای مالک={with_owner}')
    except Exception as e:
        print(f'{label}: ERROR {e}')
