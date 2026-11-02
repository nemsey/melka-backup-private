#!/usr/bin/env python3
"""
PN-050-R6 · تعمیر UTF-8 لایهٔ چرخشی ۲۰۲۶-۱۰-۲۹ پیش از UNION
================================================================
حادثه: merge_union.py روی لایهٔ چرخشی live-2026-10-29T10-37-20-371.db با
OperationalError «Could not decode to UTF-8» شکست می‌خورد (کل منبع rollback).
ریشه: مقادیر TEXT با بایت‌های UTF-8 نامعتبر (موج‌کی/متن خراب) که سینک جلسهٔ
۲۹ اکتبر نوشته بود.

روش (تعمیر تا پاکی — از همان مسیر خواندنِ merge):
  ۱) اتصال به live + ATTACH کپی تعمیر (هرگز لایهٔ اصلی لمس نمی‌شود)
  ۲) پیمایش ردیف‌به‌ردیف (ORDER BY rowid) با text_factory پیش‌فرض (str)
  ۳) در هر خطای decode: همان ردیف با اتصال bytes خوانده می‌شود، سلول‌های
     خراب با errors='replace' پاک‌سازی و در «کپی» UPDATE می‌شوند
  ۴) ادامهٔ پیمایش از بعد همان ردیف — تا خواندن کامل بدون خطا
خروجی: شمارش سلول‌های تعمیرشده + گواهی خواندن تمیز تمام جدول‌های UNION.
"""
import sqlite3
import sys

COPY = sys.argv[1] if len(sys.argv) > 1 else 'upload/.runtime/rolling-r6-fix.db'
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

fixed_total = 0
clean_tables = []


def common_cols(table):
    probe = sqlite3.connect(LIVE)
    probe.execute(f"ATTACH DATABASE '{COPY}' AS src")
    src_cols = [r[1] for r in probe.execute(f'PRAGMA src.table_info("{table}")')]
    live_cols = set(r[1] for r in probe.execute(f'PRAGMA table_info("{table}")'))
    probe.execute("DETACH DATABASE src")
    probe.close()
    return [c for c in src_cols if c in live_cols]


for table in UNION_TABLES:
    common = common_cols(table)
    if not common:
        continue
    col_list = ", ".join(f'"{c}"' for c in common)
    live = sqlite3.connect(LIVE)
    live.execute(f"ATTACH DATABASE '{COPY}' AS src")
    last_rowid = -1
    rows_read = 0
    while True:
        try:
            row = live.execute(
                f'SELECT rowid, {col_list} FROM "src"."{table}" WHERE rowid > ? ORDER BY rowid LIMIT 1',
                (last_rowid,),
            ).fetchone()
            if row is None:
                break
            last_rowid = row[0]
            rows_read += 1
        except sqlite3.OperationalError as e:
            if 'Could not decode' not in str(e):
                live.execute("DETACH DATABASE src")
                live.close()
                raise
            # ردیف شکست‌خورده = نخستین rowid پس از last_rowid
            bcon = sqlite3.connect(LIVE)
            bcon.text_factory = bytes
            bcon.execute(f"ATTACH DATABASE '{COPY}' AS src")
            bad_rowid = bcon.execute(
                f'SELECT MIN(rowid) FROM "src"."{table}" WHERE rowid > ?',
                (last_rowid,),
            ).fetchone()[0]
            brow = bcon.execute(
                f'SELECT rowid, {col_list} FROM "src"."{table}" WHERE rowid = ?',
                (bad_rowid,),
            ).fetchone()
            bcon.execute("DETACH DATABASE src")
            bcon.close()
            dcon = sqlite3.connect(COPY)
            for k, c in enumerate(common, start=1):
                v = brow[k]
                if isinstance(v, bytes):
                    try:
                        v.decode('utf-8')
                    except UnicodeDecodeError:
                        dcon.execute(
                            f'UPDATE "{table}" SET "{c}"=? WHERE rowid=?',
                            (v.decode('utf-8', errors='replace'), bad_rowid),
                        )
                        fixed_total += 1
                        print(f'FIXED {table}.{c} rowid={bad_rowid}')
            dcon.commit()
            dcon.close()
            last_rowid = bad_rowid
    live.execute("DETACH DATABASE src")
    live.close()
    clean_tables.append(f'{table}:{rows_read}')

print()
print('TOTAL cells fixed:', fixed_total)
print('clean full reads:', ' '.join(clean_tables))
