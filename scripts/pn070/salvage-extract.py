#!/usr/bin/env python3
"""
PN-070 — استخراج مدار از دیتابیس خراب (salvage-extract)
=========================================================
حادثهٔ ۲۰۲۶-۱۱-۰۷ ~۰۸:۱۵: ریست سندباکس → SIGKILL وسط نوشتن → دم فایل
db/custom.db بریده شد (ارجاع به صفحاتِ فراتر از EOF → «database disk image
is malformed»). هدر و بخش بزرگی از رکوردها سالم‌اند — این ابزار «چه خواندنی
است» را بیرون می‌کشد و در یک DB تمیز می‌نویسد تا merge_union.py رسمی
(که منبع سالم می‌خواهد) بتواند UNION کند.

رفتار (قانون صادق‌بودن شاهد · قانون ۱۱):
  · خواندن پنجره‌ای rowid (پنجره ۲۰۰۰تایی) — خطای پنجره → نصف‌کردن بازگشتی
    تا ردیف تکی؛ ردیف ناخوانا شمرده و رد می‌شود (skip صادقانه، نه توقف).
  · فقط-خواندن روی مبدأ (mode=ro) — اگر ro ممکن نبود، کاری به فایل اصلی
    ندارد: در /tmp نسخهٔ replay می‌سازد و از آن می‌خواند.
  · خروجی: DB تمیز + شاهد JSON تک‌خطی (recovered/unrecoverable per-table).
  · هیچ حذفی/تغییری روی مبدأ — مبدأ قرنطینه‌شده و دست‌نخورده می‌ماند.

فهرست جدول‌ها پیش‌فرض = UNION_TABLES رسمی از scripts/pn050/merge_union.py
(رکوردها · نه صف/مشتق/حالت زنده).
"""

import argparse
import json
import shutil
import sqlite3
import sys
import tempfile
from pathlib import Path

# هم‌تراز با merge_union.py (منبع رسمی) — ایمپورت اگر شد، وگرنه همین فهرست
UNION_TABLES_FALLBACK = [
    "PropertyRecord", "RequestRecord", "ExpertRecord", "ExpertProfile",
    "TransactionRecord", "TransactionEnrichment", "ContractRecord",
    "CustomerRecord", "VisitRecord", "InteractionRecord",
    "SpecialPropertyRecord", "RequestEventRecord", "PriceIndexHistory",
    "RefListCache", "DivarAd", "DivarRejectLog", "DivarScanLog",
    "InstagramPostLog", "CommissionCalcLog", "LookupLog", "OpportunityAlert",
    "AuditLog", "UserActivity", "DecisionRecord", "ActionPlanRecord",
    "SafetyCheckRecord", "ShadowDecisionRun", "GovernanceCheckRecord",
    "PolicyEvaluationRecord", "DiagnosticReport", "RepairProposalRecord",
    "CausalEdgeRecord", "DriftCheck", "ModelVersion",
    "AgentMemory", "AgentFeedback", "AgentPolicyVersion",
    "User", "UserPermission", "PersonnelAccess",
    "RelayDevice",
    "ArmConnection", "DivarConnection", "PmConnection", "GapConnection",
    "Session", "UserSession",
]

WINDOW = 2000


def load_union_tables() -> list[str]:
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "pn050"))
        from merge_union import UNION_TABLES  # type: ignore
        return list(UNION_TABLES)
    except Exception:
        return UNION_TABLES_FALLBACK


def open_corrupt_ro(path: str) -> sqlite3.Connection:
    """بازکردن فقط-خواندنی؛ در ناکامی، نسخهٔ replay در /tmp (فایل اصلی دست‌نخورده)."""
    try:
        con = sqlite3.connect(f"file:{path}?mode=ro", uri=True, timeout=30)
        con.execute("SELECT COUNT(*) FROM sqlite_master").fetchone()
        return con
    except sqlite3.Error:
        tmp = Path(tempfile.mkdtemp(prefix="pn070-replay-"))
        base = Path(path)
        for suffix in ("", "-wal", "-shm"):
            src = Path(str(base) + suffix)
            if src.exists():
                shutil.copy2(src, tmp / src.name)
        con = sqlite3.connect(str(tmp / base.name), timeout=60)
        con.execute("PRAGMA foreign_keys=OFF;")
        return con


def table_cols(con: sqlite3.Connection, table: str) -> list[str]:
    return [r[1] for r in con.execute(f'PRAGMA table_info("{table}")').fetchall()]


def extract_table(src: sqlite3.Connection, dst: sqlite3.Connection, table: str) -> dict:
    stats = {"recovered": 0, "unrecoverable": 0, "failed_windows": 0, "max_rowid": 0}
    try:
        max_rid = src.execute(f'SELECT MAX(rowid) FROM "{table}"').fetchone()[0] or 0
    except sqlite3.Error as e:
        stats["error"] = f"max-rowid: {str(e)[:80]}"
        return stats
    stats["max_rowid"] = max_rid
    if max_rid == 0:
        return stats
    cols = table_cols(src, table)
    if not cols:
        stats["error"] = "no-columns"
        return stats
    col_list = ", ".join(f'"{c}"' for c in cols)
    placeholders = ", ".join("?" for _ in range(len(cols) + 1))

    def read_range(a: int, b: int) -> list[tuple]:
        return src.execute(
            f'SELECT rowid, {col_list} FROM "{table}" WHERE rowid > ? AND rowid <= ?',
            (a, b),
        ).fetchall()

    def write_rows(rows: list[tuple]) -> None:
        if rows:
            dst.executemany(
                f'INSERT INTO "{table}" (rowid, {col_list}) VALUES ({placeholders})',
                rows,
            )

    def handle(a: int, b: int) -> None:
        try:
            rows = read_range(a, b)
            write_rows(rows)
            stats["recovered"] += len(rows)
        except sqlite3.Error:
            if b - a <= 1:
                # ردیف تکی ناخوانا — شمارش صادقانه و عبور
                stats["unrecoverable"] += 1
                return
            stats["failed_windows"] += 1
            mid = (a + b) // 2
            handle(a, mid)
            handle(mid, b)

    a = 0
    while a < max_rid:
        b = min(a + WINDOW, max_rid)
        handle(a, b)
        a = b
    return stats


def main() -> int:
    ap = argparse.ArgumentParser(description="PN-070 salvage extract")
    ap.add_argument("--corrupt", required=True, help="مسیر DB قرنطینه‌شدهٔ خراب")
    ap.add_argument("--out", required=True, help="مسیر DB تمیز خروجی")
    ap.add_argument("--tables", default=None, help="کاما-جدا — پیش‌فرض: UNION_TABLES رسمی")
    args = ap.parse_args()

    tables = [t.strip() for t in args.tables.split(",")] if args.tables else load_union_tables()
    src = open_corrupt_ro(args.corrupt)
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if out_path.exists():
        out_path.unlink()
    dst = sqlite3.connect(str(out_path))
    dst.execute("PRAGMA foreign_keys=OFF;")

    # اسکیمای عین مبدأ (CREATE ها از sqlite_master سالم خوانده می‌شوند)
    created = 0
    for (name, sql) in src.execute(
        "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).fetchall():
        if not sql:
            continue
        try:
            dst.execute(sql)
            created += 1
        except sqlite3.Error:
            pass
    dst.commit()

    results = {}
    for t in tables:
        exists = src.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (t,)
        ).fetchone()
        if not exists:
            results[t] = {"status": "absent-in-source"}
            continue
        results[t] = extract_table(src, dst, t)
        dst.commit()

    check = dst.execute("PRAGMA quick_check").fetchone()[0]
    dst.commit()
    dst.close()
    src.close()

    print(json.dumps({
        "status": "SALVAGE_OK" if check == "ok" else "SALVAGE_DIRTY",
        "corrupt": args.corrupt,
        "out": str(out_path),
        "tables_created": created,
        "quick_check": check,
        "tables": results,
    }, ensure_ascii=False))
    return 0 if check == "ok" else 2


if __name__ == "__main__":
    sys.exit(main())
