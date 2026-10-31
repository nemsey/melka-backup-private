#!/usr/bin/env python3
"""
PN-050-R6 · تبدیل BLOB→TEXT ردیف‌های بازیابی‌شدهٔ جراحی
=========================================================
باگ نسخهٔ اول recover-rolling-missing-r6.py: مقادیر bytes بدون decode درج
شده بودند (typeof='blob'). این اسکریپت برای جدول‌های UNION در live،
ردیف‌هایی را که PK آن‌ها در لایهٔ چرخشی است و ستون TEXT دارند به‌صورت
blob ذخیره شده‌اند، با بایت‌های اصلی (که UTF-8 معتبرند) به TEXT تبدیل
می‌کند (CAST byte-preserving). ردیف‌های خودِ live (PK خارج از چرخشی) هرگز
لمس نمی‌شوند.
"""
import sqlite3

COPY = 'upload/.runtime/rolling-r6-fix.db'
LIVE = 'db/custom.db'

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

bcon = sqlite3.connect(COPY)
bcon.text_factory = bytes
lwrite = sqlite3.connect(LIVE, timeout=30)

total_rows = 0
total_cols = 0
for table in UNION_TABLES:
    try:
        bcols = bcon.execute(f'PRAGMA table_info("{table}")').fetchall()
    except sqlite3.Error:
        continue
    if not bcols:
        continue
    bpk = [r[1].decode() for r in sorted(bcols, key=lambda r: (r[5] or 0)) if r[5]]
    if not bpk:
        names = {r[1].decode() for r in bcols}
        bpk = [next((c for c in ('id', 'code', 'key') if c in names), None)]
    if not bpk or bpk[0] is None:
        continue
    pk = bpk[0]
    src_pks = set()
    for (v,) in bcon.execute(f'SELECT "{pk}" FROM "{table}"'):
        if isinstance(v, bytes):
            v = v.decode('utf-8', 'replace')
        src_pks.add(v)

    lcols = lwrite.execute(f'PRAGMA table_info("{table}")').fetchall()
    if not lcols:
        continue
    colnames = [r[1] for r in lcols]
    if pk not in colnames:
        continue
    # ردیف‌های دارای blob در ستون‌های متنی
    blob_checks = " OR ".join(f'typeof("{c}")=\'blob\'' for c in colnames)
    try:
        rows = lwrite.execute(
            f'SELECT rowid, "{pk}" FROM "{table}" WHERE {blob_checks}'
        ).fetchall()
    except sqlite3.Error:
        continue
    fixed_rows = 0
    for rowid, pkval in rows:
        if pkval not in src_pks:
            continue  # ردیف خودِ live — لمس نمی‌شود
        sets, vals = [], []
        for c in colnames:
            v = lwrite.execute(
                f'SELECT "{c}" FROM "{table}" WHERE rowid=?', (rowid,)
            ).fetchone()[0]
            if isinstance(v, bytes):
                # UTF-8 بودن از قبل در بازیابی تست شده؛ اینجا دوباره سخت‌گیرانه
                v.decode('utf-8')
                sets.append(f'"{c}"=?')
                vals.append(v.decode('utf-8'))
        if sets:
            vals.append(rowid)
            lwrite.execute(
                f'UPDATE "{table}" SET {", ".join(sets)} WHERE rowid=?', vals
            )
            fixed_rows += 1
            total_cols += len(sets)
    if fixed_rows:
        print(f'{table}: {fixed_rows} rows converted blob->text')
        total_rows += fixed_rows
lwrite.commit()
lwrite.close()
bcon.close()
print(f'TOTAL: {total_rows} rows, {total_cols} columns converted')
