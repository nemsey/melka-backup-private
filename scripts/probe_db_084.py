#!/usr/bin/env python3
# PN-084 probe — READ-ONLY focused DB evidence (coordinator, relay, matching data facts)
import sqlite3, datetime

DB = '/home/z/my-project/db/custom.db'
con = sqlite3.connect(f'file:{DB}?mode=ro', uri=True)
con.row_factory = sqlite3.Row
cur = con.cursor()

def q(sql, label=None):
    if label: print(f'\n== {label} ==')
    try:
        return cur.execute(sql).fetchall()
    except Exception as e:
        print(f'  SQL-ERR: {e}')
        return []

def rowstr(r, maxlen=80):
    out = []
    for k in r.keys():
        v = str(r[k])
        if len(v) > maxlen: v = v[:maxlen] + '…'
        out.append(f'{k}={v}')
    return ' | '.join(out)

print('== integrity ==')
for r in q('PRAGMA integrity_check'): print(' ', r[0])
print('\n== journal_mode =='); print(' ', q('PRAGMA journal_mode')[0][0])

print('\n== ALL TABLES (compact) ==')
tabs = [r[0] for r in q("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")]
line = []
for t in tabs:
    line.append(t)
    if len(line) == 6: print('  ' + '  '.join(line)); line = []
if line: print('  ' + '  '.join(line))
print(f'  (total {len(tabs)} tables)')

# --- SyncJobState (PN-083 coordinator) ---
rows = q('SELECT * FROM SyncJobState ORDER BY rowid DESC LIMIT 24', 'SyncJobState (coordinator, last 24)')
for r in rows: print('  ' + rowstr(r, 100))

# --- relay tables ---
for t in tabs:
    if 'relay' in t.lower():
        rows = q(f'SELECT * FROM "{t}" ORDER BY rowid DESC LIMIT 6', f'{t} (last 6)')
        for r in rows: print('  ' + rowstr(r, 90))

# --- matching data facts ---
q('SELECT COUNT(*) c FROM RequestRecord', 'RequestRecord total'); print('  total =', cur.execute('SELECT COUNT(*) FROM RequestRecord').fetchone()[0])
for lbl, sql in [
    ('active statuses', "SELECT status, COUNT(*) c FROM RequestRecord GROUP BY 1 ORDER BY 2 DESC LIMIT 10"),
    ('budgets populated', "SELECT SUM(depositBudget>0) dep, SUM(rentBudget>0) rent, SUM(priceFrom>0) pf, SUM(urgent=1) urg, SUM(COALESCE(spaceFrom,0)>0) spf, SUM(COALESCE(inputsJson,'')!='') inj FROM RequestRecord"),
    ('sample area json', "SELECT areaIdsJson, areaNamesJson FROM RequestRecord WHERE areaIdsJson IS NOT NULL LIMIT 2"),
]:
    for r in q(sql, f'RequestRecord: {lbl}'): print('  ' + rowstr(r, 140))

for lbl, sql in [
    ('status breakdown', "SELECT status, COUNT(*) c FROM PropertyRecord GROUP BY 1 ORDER BY 2 DESC LIMIT 10"),
    ('published financial', "SELECT COUNT(*) c, SUM(price>0) p, SUM(COALESCE(depositPrice,0)>0) dep, SUM(COALESCE(rentPrice,0)>0) rent, SUM(COALESCE(pricePerMeter,0)>0) ppm FROM PropertyRecord WHERE status='منتشر شده'"),
    ('published freshness', "SELECT SUM(syncedAt >= datetime('now','-7 day')) d7, SUM(syncedAt >= datetime('now','-30 day')) d30, SUM(syncedAt >= datetime('now','-90 day')) d90, SUM(syncedAt >= datetime('now','-365 day')) d365, COUNT(*) c FROM PropertyRecord WHERE status='منتشر شده'"),
    ('published tradeTypes', "SELECT COALESCE(tradeTypeName,'—'), COUNT(*) c FROM PropertyRecord WHERE status='منتشر شده' GROUP BY 1 ORDER BY 2 DESC LIMIT 10"),
]:
    for r in q(sql, f'PropertyRecord: {lbl}'): print('  ' + rowstr(r, 140))

for r in q('SELECT graph, edgeType, COUNT(*) c FROM GraphEdge GROUP BY 1,2', 'GraphEdge'): print('  ' + rowstr(r))
for r in q('SELECT COUNT(*) c FROM MatchRejectionRecord', 'MatchRejectionRecord'): print('  count =', r[0])
for r in q('SELECT tileId, COUNT(*) c FROM AgentFeedback GROUP BY 1 ORDER BY 2 DESC LIMIT 8', 'AgentFeedback by tile'): print('  ' + rowstr(r))
for r in q("SELECT insightKey, rating, createdAt FROM AgentFeedback WHERE tileId='smart-matching' ORDER BY rowid DESC LIMIT 8", 'AgentFeedback smart-matching (last 8)'): print('  ' + rowstr(r))
for r in q("SELECT CASE WHEN score>=0.85 THEN 'a>=0.85' WHEN score>=0.7 THEN 'b 0.7-0.85' WHEN score>=0.5 THEN 'c 0.5-0.7' ELSE 'd <0.5' END b, COUNT(*) c FROM OpportunityAlert GROUP BY 1", 'OpportunityAlert by score'): print('  ' + rowstr(r))
for r in q('SELECT * FROM OpportunityAlert ORDER BY rowid DESC LIMIT 3', 'OpportunityAlert (last 3)'): print('  ' + rowstr(r, 100))
for r in q('SELECT bucket, status, COUNT(*) c FROM DivarAd GROUP BY 1,2 ORDER BY 3 DESC LIMIT 12', 'DivarAd by bucket/status'): print('  ' + rowstr(r))
rows = q('SELECT * FROM DivarScanLog ORDER BY rowid DESC LIMIT 3', 'DivarScanLog (last 3)')
for r in rows: print('  ' + rowstr(r, 120))
for r in q('SELECT COUNT(*) c FROM ExpertRecord', 'ExpertRecord'): print('  count =', r[0])

con.close()
print('\nDONE')
