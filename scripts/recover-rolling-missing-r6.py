#!/usr/bin/env python3
"""
PN-050-R6 · بازیابی جراحی ردیف‌های غایب از لایهٔ چرخشی خراب ۲۰۲۶-۱۰-۲۹
========================================================================
وضعیت: هر سه بستهٔ چرخشی ۲۰ اکتبر–۲۹ اکتبر (~۱۰:۲۶–۱۰:۳۷) دارای خرابی
B-tree هستند («Rowid out of order» — درس FUSE/ossfs). merge_union کامل
روی آن‌ها شکست می‌خورد (rollback کل منبع).

روش جراحی (ایمن برای live سالم):
  ۱) فهرست PK هر جدول UNION از کپی (bytes-mode — بدون خطای decode)
  ۲) تفاضل با PK های live → ردیف‌های «غایب»
  ۳) برای هر ردیف غایب: خواندن سخت‌گیرانه (str — همان مسیر decode)
     · خطا → skip صادقانه (صفحهٔ خراب)
     · موفق → اعتبارسنجی ساختار (PK ناتهی، کد/تاریخ معتبر، طول معقول)
  ۴) درج با INSERT OR IGNORE (خط قرمز: live هرگز بازنویسی نمی‌شود)
خروجی: گزارش per-table (recovered / corrupt-skip / invalid-skip) + شاهد JSON.
"""
import json
import re
import sqlite3
import sys
from datetime import datetime

COPY = 'upload/.runtime/rolling-r6-fix.db'
LIVE = 'db/custom.db'
OUT = '/tmp/recover-rolling-missing-r6.json'

UNION_TABLES = [
    "PropertyRecord", "RequestRecord", "ExpertRecord", "ExpertProfile",
    "TransactionRecord", "TransactionEnrichment", "ContractRecord",
    "CustomerRecord", "VisitRecord", "InteractionRecord",
    "SpecialPropertyRecord", "RequestEventRecord", "PriceIndexHistory",
    "RefListCache", "DivarAd", "DivarRejectLog", "DivarScanLog",
    "InstagramPostLog", "CommissionCalcLog", "LookupLog", "OpportunityAlert",
    "AuditLog", "UserActivity", "DecisionRecord", "ActionPlanRecord",
    "SafetyCheckRecord", "ShadowDecisionRun", "GovernanceCheckRecord",
    "PolicyEvaluationRecord", "DiagnosticReport", "RepairProposalRecord",
    "CausalEdgeRecord", "DriftCheck", "ModelVersion", "AgentMemory",
    "AgentFeedback", "AgentPolicyVersion", "User", "UserPermission",
    "PersonnelAccess",
]

ISO_RE = re.compile(r'^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}')
EPOCH_RE = re.compile(r'^\d{10,13}(\.\d+)?$')  # epoch seconds/millis به‌صورت متن


def pk_of(conn_bytes, table):
    rows = conn_bytes.execute(f'PRAGMA table_info("{table}")').fetchall()
    pk_cols = [r[1].decode() for r in sorted(rows, key=lambda r: (r[5] or 0)) if r[5]]
    if not pk_cols:
        # جدول‌های بدون PK اعلام‌شده → id به‌عنوان کلید طبیعی
        names = {r[1].decode() for r in rows}
        for cand in ('id', 'code', 'key'):
            if cand in names:
                return cand
        return None
    return pk_cols[0]


def src_pk_set(bcon, table, pk):
    vals = bcon.execute(f'SELECT "{pk}" FROM "{table}"').fetchall()
    out = set()
    for (v,) in vals:
        if isinstance(v, bytes):
            v = v.decode('utf-8', 'replace')
        out.add(v)
    return out


def live_pk_set(lcon_ro, table, pk):
    try:
        return {v for (v,) in lcon_ro.execute(f'SELECT "{pk}" FROM "{table}"')}
    except sqlite3.Error:
        return None


def validate(table, cols, row):
    d = dict(zip(cols, row))
    pk = d.get('id') or d.get('code') or d.get('key')
    if pk is None or (isinstance(pk, str) and (not pk.strip() or len(pk) > 300)):
        return False
    for k in ('propertyCode', 'requestCode', 'expertCode'):
        if k in d and d[k] is not None:
            if not isinstance(d[k], str) or len(d[k]) > 200:
                return False
    for k in ('createdAt', 'updatedAt'):
        if k in d and d[k] is not None:
            v = d[k]
            if not isinstance(v, str):
                # عددی هم مجاز است (epoch)
                if not isinstance(v, (int, float)):
                    return False
            else:
                s = v.strip()
                if not (ISO_RE.match(s[:19]) or EPOCH_RE.match(s[:16])):
                    return False
    # طول کل ردیف نامعقول = صفحات خراب
    total = sum(len(str(v)) for v in row if v is not None)
    if total > 2_000_000:
        return False
    return True


report = {'source': COPY, 'tables': {}}
bcon = sqlite3.connect(COPY)
bcon.text_factory = bytes
lro = sqlite3.connect(f'file:{LIVE}?mode=ro', uri=True)
lwrite = sqlite3.connect(LIVE, timeout=30)
lwrite.execute('PRAGMA foreign_keys=OFF;')

total_rec = total_skip_bad = total_skip_invalid = 0
for table in UNION_TABLES:
    try:
        bcols_raw = bcon.execute(f'PRAGMA table_info("{table}")').fetchall()
    except sqlite3.Error:
        continue
    if not bcols_raw:
        continue
    cols = [r[1].decode() for r in bcols_raw]
    pk = pk_of(bcon, table)
    if pk is None or pk not in cols:
        report['tables'][table] = {'status': 'no-pk', 'skip': 'honest'}
        continue
    live_pks = live_pk_set(lro, table, pk)
    if live_pks is None:
        report['tables'][table] = {'status': 'live-unreadable', 'skip': 'honest'}
        continue
    try:
        src_pks = src_pk_set(bcon, table, pk)
    except sqlite3.Error as e:
        report['tables'][table] = {'status': 'src-scan-error', 'error': str(e)[:100]}
        continue
    missing = src_pks - live_pks
    if not missing:
        report['tables'][table] = {'status': 'in-sync', 'missing': 0}
        continue
    col_list = ", ".join(f'"{c}"' for c in cols)
    placeholders = ", ".join('?' for _ in cols)
    rec = bad = inval = 0
    for pkval in missing:
        try:
            row = bcon.execute(  # خواندن سخت‌گیرانه: bytes که decode شود
                f'SELECT {col_list} FROM "{table}" WHERE "{pk}" = ?', (pkval,)
            ).fetchone()
            if row is None:
                continue
            # decode سخت‌گیرانه (همان شکست merge)
            clean = []
            for v in row:
                if isinstance(v, bytes):
                    v = v.decode('utf-8')  # raises → corrupt-skip (سخت‌گیرانه)
                clean.append(v)
        except (sqlite3.DatabaseError, UnicodeDecodeError):
            bad += 1
            continue
        if not validate(table, cols, clean):
            inval += 1
            continue
        try:
            lwrite.execute(
                f'INSERT OR IGNORE INTO "{table}" ({col_list}) VALUES ({placeholders})',
                clean,
            )
            rec += 1
        except sqlite3.Error:
            bad += 1
    lwrite.commit()
    total_rec += rec
    total_skip_bad += bad
    total_skip_invalid += inval
    report['tables'][table] = {
        'status': 'recovered',
        'missing_candidates': len(missing),
        'recovered': rec,
        'corrupt_skip': bad,
        'invalid_skip': inval,
    }

lwrite.commit()
lwrite.close()
lro.close()
bcon.close()
report['totals'] = {
    'recovered': total_rec,
    'corrupt_skip': total_skip_bad,
    'invalid_skip': total_skip_invalid,
}
with open(OUT, 'w') as f:
    json.dump(report, f, ensure_ascii=False, indent=1)
print(json.dumps(report['totals'], ensure_ascii=False))
for t, r in report['tables'].items():
    if r.get('status') == 'recovered' or r.get('missing', 0):
        print(f"  {t}: {json.dumps(r, ensure_ascii=False)}")
print('witness:', OUT)
