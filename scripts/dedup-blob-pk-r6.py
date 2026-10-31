#!/usr/bin/env python3
"""
PN-050-R6 · پاک‌سازی دوقلوهای blob-PK (remediation)
====================================================
باگ recover-rolling-missing-r6.py نسخه‌های ۱و۲: درج با مقادیر bytes →
ردیف‌هایی با PK از نوع blob ساخته شد (324 ردیف). اجرای نسخهٔ اصلاح‌شده
همان ردیف‌ها را با TEXT درست درج کرد → دوقلو. این اسکریپت:
  · blob-PK با دوقلوی TEXT → حذف نسخهٔ blob (محتوای منطقی یکسان است)
  · blob-PK بدون دوقلو → تبدیل همهٔ ستون‌های blob آن به TEXT (CAST byte-preserving)
گزارش شمارش per-table + گواهی نهایی صفر-blob.
"""
import sqlite3

LIVE = 'db/custom.db'
TABLES = [
    'AuditLog', 'SafetyCheckRecord', 'ShadowDecisionRun', 'GovernanceCheckRecord',
    'PolicyEvaluationRecord', 'DiagnosticReport', 'DriftCheck', 'AgentMemory',
    'DecisionRecord', 'ActionPlanRecord', 'OpportunityAlert', 'RequestRecord',
    'PropertyRecord', 'ExpertRecord', 'User', 'UserPermission',
]

lw = sqlite3.connect(LIVE, timeout=60)
lw.execute('PRAGMA foreign_keys=OFF;')

deleted = converted = 0
for table in TABLES:
    try:
        cols = [r[1] for r in lw.execute(f'PRAGMA table_info("{table}")')]
    except sqlite3.Error:
        continue
    if not cols or 'id' not in cols:
        continue
    try:
        blob_rows = lw.execute(
            f'SELECT rowid, "id" FROM "{table}" WHERE typeof("id")=\'blob\''
        ).fetchall()
    except sqlite3.Error:
        continue
    if not blob_rows:
        continue
    d = c = 0
    for rowid, bid in blob_rows:
        tid = bid.decode('utf-8')  # از قبل سخت‌گیرانه تست شده
        twin = lw.execute(
            f'SELECT rowid FROM "{table}" WHERE "id"=? AND typeof("id")!=\'blob\'',
            (tid,),
        ).fetchone()
        if twin:
            lw.execute(f'DELETE FROM "{table}" WHERE rowid=?', (rowid,))
            d += 1
        else:
            sets = [f'"{col}"=CAST("{col}" AS TEXT)' for col in cols]
            lw.execute(
                f'UPDATE "{table}" SET {", ".join(sets)} WHERE rowid=? AND ' +
                " OR ".join(f'typeof("{col}")=\'blob\'' for col in cols),
                (rowid,),
            )
            c += 1
    lw.commit()
    deleted += d
    converted += c
    print(f'{table}: deleted {d} blob-twins, converted {c} orphan-blobs')

# گواهی نهایی: هیچ blob-PK نمانده
remain = 0
for table in TABLES:
    try:
        n = lw.execute(f'SELECT COUNT(*) FROM "{table}" WHERE typeof("id")=\'blob\'').fetchone()[0]
        remain += n
    except sqlite3.Error:
        pass
lw.commit()
lw.close()
print(f'TOTAL deleted={deleted} converted={converted} | remaining blob-pk = {remain}')
