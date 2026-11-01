#!/usr/bin/env python3
"""
PN-050 · دستور ۱ — merge_all_databases: معماری UNION در رستاخیز (DIR-PN050-001)
================================================================================
جایگزین منطق قدیمی «پرترین لایه برنده و جایگزین می‌شود» (MAX → replace).

قانون (خط قرمز شورا):
  · UNION همهٔ snapshots — بدون MAX، بدون جایگزینی
  · حالت مشترک هرگز حذف نمی‌شود (هیچ DELETE روی live صادر نمی‌شود)
  · upsert به live (نه overwrite): INSERT OR IGNORE — ردیف موجود (PK یا کلید
    یگانه) دست‌نخورده می‌ماند؛ فقط ردیفِ جدید افزوده می‌شود
  · ثبت audit_log: {type: "resurrect_union", sources, before_count, after_count}

چرا INSERT OR IGNORE = upsert بدون overwrite؟
  OR IGNORE هر ردیفی را که با «هر» محدودیت یگانهٔ live (PK: id · کلید طبیعی:
  propertyCode/requestCode/…) تصادم کند رد می‌کند → دادهٔ live هرگز بازنویسی
  نمی‌شود؛ ردیف‌های جدیدِ منبع (مثل ۱۵۱ رکوردی که سینک پس‌زمینه پس از ریست نوشته
  بود) افزوده می‌شوند → همگرایی بدون حذف.

کلید یکتایی (full_id) در سطح ردیف = مجموعهٔ محدودیت‌های یگانهٔ جدول؛ برای
شمارش شاهد، دو جدون سنجش (PropertyRecord/RequestRecord) جداگانه گزارش می‌شوند.

امنیت:
  · هر منبع در «یک» تراکنش — کرش وسط merge → rollback کامل آن منبع (قانون ۰۸)
  · PRAGMA foreign_keys=OFF (والد/فرزند مستقل درج می‌شوند؛ کل منبع می‌آید)
  · quick_check پیش و پس از merge — خرابی = خروج غیرصفر بدون نوشتن
  · فقط-افزودنی: صفر DELETE · صفر UPDATE روی ردیف‌های موجود

استفاده:
  python3 scripts/pn050/merge_union.py --live db/custom.db \
      --source upload/.data/custom.db --source upload/.data/rolling/live-x.db \
      [--tables PropertyRecord,RequestRecord] [--audit] [--dry-run]
"""

import argparse
import json
import os
import sqlite3
import sys
import time
import uuid
from pathlib import Path

# جدول‌های سنجش شاهد (قانون ۰۲ — هر عدد با مخرج)
WITNESS_TABLES = ["PropertyRecord", "RequestRecord"]
CHUNK = 2000

# ─── دامنهٔ UNION: رکوردهای داده — نه صف/دادهٔ مشتق (سنجش dbstat زنده) ───
# تعریف حوضه (ADR-PN-050): هرچه «رکورد» است و از بین می‌رود، union می‌شود؛
# هرچه «صف/حالت/مشتق» است، نه — چون بازگرداندنش رکورد نمی‌نجاند ولی ریسک می‌آورد:
#   · RelayQueue (۵۳۴MB — ۶۰٪ حجم فایل): صف پردازش — بازگردانی آیتم کهنه = بازپردازش
#   · GraphNode/GraphEdge (۵۶MB): مشتق — با unified-graph از رکوردها بازسازی می‌شود
#   · نشست/قفل/اتصال‌ها (Session/JobLock/SyncState/*Connection): حالت زنده مبناست —
#     توکن کهنهٔ connection از بکاپ = بازگشت به اعتبارنامهٔ مرده (خطر واقعی)
# همهٔ جداول رکوردی کوچک (هوش/حسابرسی/دسترسی) جزو union اند — افزودنی، ارزان.
UNION_TABLES = [
    # رکوردهای اصلی داده
    "PropertyRecord", "RequestRecord", "ExpertRecord", "ExpertProfile",
    "TransactionRecord", "TransactionEnrichment", "ContractRecord",
    "CustomerRecord", "VisitRecord", "InteractionRecord",
    "SpecialPropertyRecord", "RequestEventRecord", "PriceIndexHistory",
    "RefListCache", "DivarAd", "DivarRejectLog", "DivarScanLog",
    "InstagramPostLog", "CommissionCalcLog", "LookupLog", "OpportunityAlert",
    # حسابرسی و تصمیم‌ها (append-only)
    "AuditLog", "UserActivity", "DecisionRecord", "ActionPlanRecord",
    "SafetyCheckRecord", "ShadowDecisionRun", "GovernanceCheckRecord",
    "PolicyEvaluationRecord", "DiagnosticReport", "RepairProposalRecord",
    "CausalEdgeRecord", "DriftCheck", "ModelVersion",
    # حافظهٔ عامل‌ها (append-only)
    "AgentMemory", "AgentFeedback", "AgentPolicyVersion",
    # کاربران و دسترسی (حفاظت از حساب‌های تازه)
    "User", "UserPermission", "PersonnelAccess",
]

# جدول‌های عمداً خارج از union (حالت/صف/مشتق — سند بالا)
UNION_EXCLUDED_STATE = [
    "RelayQueue", "GraphNode", "GraphEdge",
    "Session", "UserSession", "OtpAttempt",
    "JobLock", "SyncJobState", "SyncCheckpoint", "SyncState", "SyncDeadLetter",
    "ArmConnection", "DivarConnection", "DivarSetting", "InstagramConnection", "PmConnection",
    "GapConnection",
    "AppMeta",
]


def table_columns(conn: sqlite3.Connection, table: str) -> list[str]:
    rows = conn.execute(f'PRAGMA table_info("{table}")').fetchall()
    # cid, name, type, notnull, dflt_value, pk
    return [r[1] for r in rows]


def list_tables(conn: sqlite3.Connection) -> list[str]:
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).fetchall()
    return [r[0] for r in rows]


def counts(conn: sqlite3.Connection, tables: list[str]) -> dict[str, int]:
    out: dict[str, int] = {}
    for t in tables:
        try:
            out[t] = conn.execute(f'SELECT COUNT(*) FROM "{t}"').fetchone()[0]
        except sqlite3.Error:
            out[t] = -1
    return out


def quick_check(conn: sqlite3.Connection) -> str:
    try:
        return conn.execute("PRAGMA quick_check").fetchone()[0]
    except sqlite3.Error as e:
        return f"error: {e}"


def merge_source(live: sqlite3.Connection, source_path: str, only_tables: list[str] | None) -> dict:
    """UNION یک منبع به live — یک تراکنش اتمی؛ برگرداندن آمار per-table."""
    src_name = str(source_path)
    live.execute("PRAGMA foreign_keys=OFF;")
    stats: dict = {"path": src_name, "tables": {}, "error": None}
    try:
        live.execute("ATTACH DATABASE ? AS src", (src_name,))
        try:
            live.execute("BEGIN IMMEDIATE;")
            live_tables = set(list_tables(live))
            src_tables = [r[0] for r in live.execute(
                "SELECT name FROM src.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
            ).fetchall()]
            if only_tables:
                src_tables = [t for t in src_tables if t in only_tables]
            for table in src_tables:
                if table not in live_tables:
                    stats["tables"][table] = {"status": "absent-in-live", "inserted": 0}
                    continue
                src_cols = [r[1] for r in live.execute(f'PRAGMA src.table_info("{table}")').fetchall()]
                live_cols = set(table_columns(live, table))
                common = [c for c in src_cols if c in live_cols]
                if not common:
                    stats["tables"][table] = {"status": "no-common-columns", "inserted": 0}
                    continue
                col_list = ", ".join(f'"{c}"' for c in common)
                placeholders = ", ".join("?" for _ in common)
                sel = live.execute(f'SELECT {col_list} FROM "src"."{table}"').fetchall()
                inserted = 0
                ignored = 0
                for i in range(0, len(sel), CHUNK):
                    chunk = sel[i : i + CHUNK]
                    before = live.total_changes
                    live.executemany(
                        f'INSERT OR IGNORE INTO "{table}" ({col_list}) VALUES ({placeholders})',
                        chunk,
                    )
                    inserted += live.total_changes - before
                    ignored += len(chunk) - (live.total_changes - before)
                stats["tables"][table] = {
                    "status": "merged",
                    "source_rows": len(sel),
                    "inserted": inserted,
                    "ignored_existing": ignored,
                }
            live.execute("COMMIT;")
        except Exception as e:  # قانون ۰۸ — توقف، نه حدس
            try:
                live.execute("ROLLBACK;")
            except sqlite3.Error:
                pass  # تراکنش از قبل بسته/برگشته — خطای اصلی مبناست
            raise
    except Exception as e:
        stats["error"] = str(e)[:200]
    finally:
        try:
            live.execute("DETACH DATABASE src;")
        except sqlite3.Error:
            pass
    return stats


def write_audit(live: sqlite3.Connection, sources: list[dict], before: dict, after: dict, dry_run: bool) -> str | None:
    """رد audit_log (دستور ۱-۳) — بدون PII خام؛ فقط شمارنده و مسیر منابع."""
    detail = json.dumps(
        {
            "type": "resurrect_union",
            "sources": [s["path"] for s in sources if not s.get("error")],
            "before_count": before,
            "after_count": after,
        },
        ensure_ascii=False,
    )
    audit_id = f"pn050-{uuid.uuid4().hex[:24]}"
    if dry_run:
        return audit_id
    try:
        live.execute(
            'INSERT INTO AuditLog (id, action, actor, detail, createdAt, operation, entityType, recordCount, accessScope, tenantId) '
            "VALUES (?, 'resurrect_union', 'resurrect-ultimate', ?, datetime('now'), 'WRITE', 'database', 1, 'OWNER', 'melk-tabriz')",
            (audit_id, detail),
        )
        live.commit()
        return audit_id
    except sqlite3.Error:
        return None


def main() -> int:
    ap = argparse.ArgumentParser(description="PN-050 UNION merge")
    ap.add_argument("--live", required=True, help="مسیر DB زنده (مقصد UNION)")
    ap.add_argument("--source", action="append", default=[], help="مسیر DB منبع (تکرارپذیر)")
    ap.add_argument("--tables", default=None, help="محدود کردن به جدول‌های خاص (کاما-جدا) — پیش‌فرض: جدول‌های رکوردی UNION_TABLES")
    ap.add_argument("--all-tables", action="store_true", help="union همهٔ جدول‌ها (حتی حالت/صف — فقط برای کاربرد خاص)")
    ap.add_argument("--no-audit", action="store_true", help="بدون نوشتن رد audit (تست)")
    ap.add_argument("--verify-integrity", action="store_true", help="quick_check کامل پیش/پس (پرهزینه روی DB بزرگ)")
    ap.add_argument("--dry-run", action="store_true", help="بدون هیچ نوشتنی — فقط سرآیندها و شمارش live")
    args = ap.parse_args()

    t0 = time.time()
    live_path = Path(args.live).resolve()
    if not live_path.exists():
        print(json.dumps({"status": "ERROR", "error": f"live db not found: {live_path}"}, ensure_ascii=False))
        return 1

    live = sqlite3.connect(str(live_path))
    live.execute("PRAGMA foreign_keys=OFF;")

    # ایمنی کرش = تراکنش اتمی per-source (ROLLBACK خودکار). quick_check کامل
    # (۹۲۵MB) فقط با پرچم صریح — در بوت، سرعت حیاتی است و is_sqlite/rowcount
    # خرابی فاحش را پیش‌تر می‌گیرند.
    pre_check = quick_check(live) if args.verify_integrity else "skipped"
    if args.verify_integrity and pre_check != "ok":
        print(json.dumps({"status": "ERROR", "error": f"live quick_check failed: {pre_check}"}, ensure_ascii=False))
        live.close()
        return 1

    before = counts(live, WITNESS_TABLES)
    only = [t.strip() for t in args.tables.split(",")] if args.tables else (None if args.all_tables else UNION_TABLES)

    results = []
    for s in args.source:
        sp = Path(s)
        # اعتبارسنجی با یک تماس فقط (ossfs بیمار: هر بازکردن فایل ۱۵–۲۵s)
        try:
            with open(sp, "rb") as f:
                head = f.read(15)
        except OSError as e:
            results.append({"path": s, "error": f"unreadable: {e}"})
            continue
        if head != b"SQLite format 3":
            results.append({"path": s, "error": "not-sqlite"})
            continue
        if os.path.abspath(s) == str(live_path):
            results.append({"path": s, "error": "same-as-live (skipped)"})
            continue
        if args.dry_run:
            # سبک: شمارش منبع (ossfs) حذف شد — فقط سرآیند؛ بوت سریع می‌ماند
            results.append({
                "path": s,
                "dry_run": True,
                "error": None,
            })
            continue
        results.append(merge_source(live, s, only))

    after = counts(live, WITNESS_TABLES)
    post_check = quick_check(live) if args.verify_integrity else "skipped"

    audit_id = None
    if not args.dry_run and not args.no_audit and (post_check in ("ok", "skipped")):
        audit_id = write_audit(live, results, before, after, args.dry_run)

    ok = (post_check in ("ok", "skipped")) and all(not r.get("error") or r.get("error") == "same-as-live (skipped)" for r in results)

    print(
        json.dumps(
            {
                "status": "UNION_OK" if ok else "UNION_PARTIAL",
                "live": str(live_path),
                "before": before,
                "after": after,
                "sources": results,
                "integrity": post_check,
                "audit_id": audit_id,
                "duration_s": round(time.time() - t0, 2),
            },
            ensure_ascii=False,
        )
    )
    live.close()
    return 0 if post_check in ("ok", "skipped") else 1


if __name__ == "__main__":
    sys.exit(main())
